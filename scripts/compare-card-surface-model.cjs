// Paired local comparison: identical pixels, deployed decoder, fixed thresholds.
// Human annotations only define references and test occlusions, never model inputs.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {pathToFileURL}=require("node:url");
const sharp=require("sharp"),ort=require("onnxruntime-web");
const core=require("../src/cardScannerCore.js");
const root=path.resolve(__dirname,"..");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const readJson=file=>JSON.parse(fs.readFileSync(file,"utf8"));

function coverIndices(rgba,annotations,fit,width,height,band=false){
  const output=Buffer.from(rgba);
  let boxes=annotations.map(({indexBox:[x1,y1,x2,y2]})=>{
    const px=(x2-x1)*.12,py=(y2-y1)*.12;
    return [fit.x+(x1-px)*fit.width/width,fit.y+(y1-py)*fit.height/height,
      fit.x+(x2+px)*fit.width/width,fit.y+(y2+py)*fit.height/height];
  });
  if(band)boxes=[[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),
    Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))]];
  for(const [x1,y1,x2,y2] of boxes){
    for(let y=Math.max(0,Math.floor(y1));y<Math.min(640,Math.ceil(y2));y++){
      for(let x=Math.max(0,Math.floor(x1));x<Math.min(640,Math.ceil(x2));x++){
        const offset=(y*640+x)*4;
        output[offset]=output[offset+1]=output[offset+2]=114;output[offset+3]=255;
      }
    }
  }
  return output;
}

async function main(){
  const [candidateArg,outputArg]=process.argv.slice(2);
  if(!candidateArg||!outputArg)throw new Error("Usage: node scripts/compare-card-surface-model.cjs <candidate.onnx> <report.json>");
  const models=[{id:"current",file:path.join(root,"models",core.MODELS[core.DEFAULT_MODEL].file+".onnx")},
    {id:"candidate",file:path.resolve(candidateArg)}];
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=pathToFileURL(path.join(root,"vendor/onnxruntime")+path.sep).href;
  const sessions=[];
  const results=[];
  async function compare(group,name,variant,rgba,expected,extra={}){
    const input=new ort.Tensor("float32",core.rgbaToTensor(rgba),[1,3,640,640]);
    const predictions={};
    try{
      for(const model of models){
        let output;
        const start=performance.now();
        try{
          output=await model.session.run({[model.session.inputNames[0]]:input});
          const result=core.decodeOutput(output[model.session.outputNames[0]],{target:model.metadata.target||"card"});
          const matched=result.cardIds.filter(id=>expected.includes(id));
          const unexpected=result.cardIds.filter(id=>!expected.includes(id));
          const missing=expected.filter(id=>!result.cardIds.includes(id));
          predictions[model.id]={suggested:result.cardIds,matched,unexpected,missing,exactMatch:!unexpected.length&&!missing.length,
            inferenceMs:Math.round(performance.now()-start),detections:result.detections};
        }finally{if(output)Object.values(output).forEach(tensor=>tensor.dispose());}
      }
    }finally{input.dispose();}
    results.push({group,name,variant,expected,...extra,predictions});
  }
  try{
    for(const model of models){
      model.metadata=readJson(model.file.replace(/\.onnx$/,".metadata.json"));
      model.sha256=hash(fs.readFileSync(model.file));
      if(model.sha256!==model.metadata.onnxSha256)throw new Error("Model hash mismatch: "+model.id);
      if(JSON.stringify(model.metadata.classNames)!==JSON.stringify(models[0].metadata.classNames))throw new Error("Class order mismatch");
      model.session=await ort.InferenceSession.create(model.file,{executionProviders:["wasm"]});
      sessions.push(model.session);
    }
    for(const name of ["Handkarten4","IMG_7936","IMG_7939"]){
      const source=fs.readFileSync(path.join(root,"kartenfotos/test",name+".jpg"));
      const reference=readJson(path.join(root,"kartenfotos/test",name+".labels.json"));
      const metadata=await sharp(source).metadata();
      const swap=[5,6,7,8].includes(metadata.orientation);
      const width=swap?metadata.height:metadata.width,height=swap?metadata.width:metadata.height;
      if(width!==reference.width||height!==reference.height)throw new Error("Annotation orientation mismatch: "+name);
      const fit=core.letterbox(width,height);
      const rgba=await sharp(source).rotate().resize(fit.width,fit.height,{fit:"fill"})
        .extend({left:fit.x,right:640-fit.x-fit.width,top:fit.y,bottom:640-fit.y-fit.height,background:{r:114,g:114,b:114}})
        .ensureAlpha().raw().toBuffer();
      for(const variant of ["original","annotated-upper-indices-covered","upper-index-band-covered"]){
        const pixels=variant==="original"?rgba:coverIndices(rgba,reference.annotations,fit,width,height,variant==="upper-index-band-covered");
        await compare("known-real-hand",name,variant,pixels,reference.cardIds,{photoSha256:hash(source)});
      }
      console.log("Real-photo comparison complete: "+name);
    }
    const dataset=path.join(root,".tools/card-training/surfaces-v1");
    const scenes=readJson(path.join(dataset,"scenes.json")).filter(scene=>scene.split==="val");
    for(const [index,scene] of scenes.entries()){
      const rgba=await sharp(path.join(dataset,"images/val",scene.file)).ensureAlpha().raw().toBuffer();
      await compare("internal-synthetic-validation",scene.file,scene.kind,rgba,[...new Set(scene.cards.map(card=>card.cardId))],
        {coverModes:[...new Set(scene.cards.map(card=>card.coverMode))],cards:scene.cards});
      if((index+1)%32===0)console.log(`Synthetic comparison: ${index+1}/${scenes.length}`);
    }
    const blank=Buffer.alloc(640*640*4,114);
    for(let index=3;index<blank.length;index+=4)blank[index]=255;
    await compare("blank","gray","original",blank,[]);
    const summaries={};
    for(const model of models){
      summaries[model.id]={};
      for(const group of ["real-original","real-covered-indices","real-covered-band","internal-synthetic-validation","blank"]){
        const selected=results.filter(item=>group==="real-original"?item.group==="known-real-hand"&&item.variant==="original":
          group==="real-covered-indices"?item.group==="known-real-hand"&&item.variant==="annotated-upper-indices-covered":
          group==="real-covered-band"?item.group==="known-real-hand"&&item.variant==="upper-index-band-covered":item.group===group);
        summaries[model.id][group]={images:selected.length,expected:selected.reduce((sum,item)=>sum+item.expected.length,0),
          correct:selected.reduce((sum,item)=>sum+item.predictions[model.id].matched.length,0),
          wrong:selected.reduce((sum,item)=>sum+item.predictions[model.id].unexpected.length,0),
          missing:selected.reduce((sum,item)=>sum+item.predictions[model.id].missing.length,0),
          exactHands:selected.filter(item=>item.predictions[model.id].exactMatch).length};
      }
    }
    const report={createdUtc:new Date().toISOString(),models:models.map(({id,metadata,sha256})=>({id,version:metadata.version,target:metadata.target,sha256})),
      thresholds:core.LIMITS,preparation:"640px proportional letterbox; Sharp preprocessing; deployed ONNX-WASM one-thread runtime and decoder.",
      limitations:["Three known photos from the same collection; no new independent real-photo validation.",
        "Covered variants hide only the annotated upper indices; mirrored lower indices may remain visible.",
        "Synthetic validation was used to select the candidate checkpoint and is not independent.",
        "Reference IDs and annotation boxes never enter the recognizer; boxes are used only to create covered test pixels.",
        "Different target boxes mean model detection mAP is not comparable; this report compares selected card identities."],
      summaries,results};
    fs.mkdirSync(path.dirname(path.resolve(outputArg)),{recursive:true});
    fs.writeFileSync(outputArg,JSON.stringify(report,null,2)+"\n");
    console.log(JSON.stringify(summaries,null,2));
  }finally{for(const session of sessions)await session.release();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
