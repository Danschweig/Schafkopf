// Known local comparison photos. Variants are stress checks, not new test cases.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {pathToFileURL}=require("node:url");
const sharp=require("sharp"),ort=require("onnxruntime-web");
const core=require("../src/cardScannerCore.js");
const {evaluateHand}=require("../src/handEvaluation.js");
const root=path.resolve(__dirname,"..");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
async function main(){
  const [modelArg,outputArg]=process.argv.slice(2);
  if(!modelArg||!outputArg)throw new Error("Aufruf: node scripts/benchmark-card-model.cjs <Modell.onnx> <Bericht.json>");
  const model=path.resolve(modelArg),metadata=JSON.parse(fs.readFileSync(model.replace(/\.onnx$/,".metadata.json"),"utf8"));
  const modelHash=hash(fs.readFileSync(model));
  if(modelHash!==metadata.onnxSha256)throw new Error("Modell-Prüfsumme stimmt nicht mit Metadaten überein.");
  const cases=[1,2,3].map((n,index)=>({group:"training-photo",photo:`kartenfotos/training/Handkarten${n===1?"":n}.jpg`,labels:`kartenfotos/training/Handkarten${n===1?"":n}.labels.json`,stress:false}));
  cases.push({group:"known-test-hand",photo:"kartenfotos/test/Handkarten4.jpg",labels:"kartenfotos/test/Handkarten4.labels.json",stress:true},
    {group:"known-example-hand",photo:".tools/handkarten.jpg",labels:"tests/fixtures/handkarten.expected.json",stress:true},
    {group:"known-other-deck-six",photo:"tests/fixtures/bavarian-fan-six.jpg",expected:["eichel-ober","gras-ober","herz-ober","schellen-ober","eichel-unter","gras-unter"],stress:true});
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=pathToFileURL(path.join(root,"vendor/onnxruntime")+path.sep).href;
  const started=performance.now();
  const session=await ort.InferenceSession.create(model,{executionProviders:["wasm"]});
  const loadMs=Math.round(performance.now()-started),results=[];
  async function infer(data){
    const input=new ort.Tensor("float32",data,[1,3,640,640]);let outputs;
    const start=performance.now();
    try{
      outputs=await session.run({[session.inputNames[0]]:input});
      return {...core.decodeOutput(outputs[session.outputNames[0]],{target:metadata.target||"card"}),inferenceMs:Math.round(performance.now()-start)};
    }finally{input.dispose();if(outputs)Object.values(outputs).forEach(tensor=>tensor.dispose());}
  }
  try{
    for(const item of cases){
      const source=fs.readFileSync(path.join(root,item.photo));
      const labels=item.labels?JSON.parse(fs.readFileSync(path.join(root,item.labels),"utf8")):null;
      const expected=item.expected||labels.cardIds;
      const variants=item.stress?["original","jpeg60-1024px","darker-25pct","rotate-plus12","rotate-minus12"]:["original"];
      for(const variant of variants){
        let image=sharp(source).rotate();
        if(variant==="jpeg60-1024px")image=sharp(await image.resize(1024,1024,{fit:"inside",withoutEnlargement:true}).jpeg({quality:60}).toBuffer());
        if(variant==="darker-25pct")image=image.modulate({brightness:.75});
        if(variant.startsWith("rotate-"))image=sharp(await image.resize(1600,1600,{fit:"inside",withoutEnlargement:true}).toBuffer()).rotate(variant==="rotate-plus12"?12:-12,{background:{r:114,g:114,b:114}});
        const rgba=await image.resize(640,640,{fit:"contain",background:{r:114,g:114,b:114}}).ensureAlpha().raw().toBuffer();
        const result=await infer(core.rgbaToTensor(rgba));
        const matched=result.cardIds.filter(id=>expected.includes(id)),unexpected=result.cardIds.filter(id=>!expected.includes(id)),missing=expected.filter(id=>!result.cardIds.includes(id));
        results.push({group:item.group,photo:path.basename(item.photo),photoSha256:hash(source),variant,expected,suggested:result.cardIds,matched,unexpected,missing,
          exactMatch:!missing.length&&!unexpected.length,referenceScore:expected.length===8?evaluateHand(expected,labels?.rules).score:null,
          suggestedScore:result.cardIds.length===8?evaluateHand(result.cardIds,labels?.rules).score:null,
          inferenceMs:result.inferenceMs,detections:result.detections});
      }
    }
    const blank=await infer(new Float32Array(3*640*640).fill(114/255));
    results.push({group:"blank",variant:"original",expected:[],suggested:blank.cardIds,matched:[],unexpected:blank.cardIds,missing:[],exactMatch:blank.cardIds.length===0,inferenceMs:blank.inferenceMs});
    const report={modelVersion:metadata.version,modelSha256:modelHash,loadMs,scoringAlgorithmVersion:require("../src/handEvaluation.js").ALGORITHM_VERSION,device:"Windows desktop; Node ONNX-WASM, one thread. Not a phone measurement.",
      preparation:"Sharp; smartphone Canvas resampling may produce different values.",
      limitation:"Known photos, including training photos. Augmented copies are not independent photos. Do not use this report to choose checkpoints or thresholds.",results};
    fs.mkdirSync(path.dirname(path.resolve(outputArg)),{recursive:true});fs.writeFileSync(outputArg,JSON.stringify(report,null,2)+"\n");
    console.log(JSON.stringify({modelVersion:metadata.version,loadMs,results:results.map(({group,photo,variant,matched,unexpected,missing,inferenceMs})=>({group,photo,variant,correct:matched.length,wrong:unexpected.length,missing:missing.length,inferenceMs}))},null,2));
  }finally{await session.release();}
}
main().catch(error=>{console.error(error);process.exitCode=2;});
