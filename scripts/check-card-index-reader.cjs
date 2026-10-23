// Local candidate evaluation only. Never replaces the scanner or uploads images.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {pathToFileURL}=require("node:url");
const sharp=require("sharp"),ort=require("onnxruntime-web");
const core=require("../src/cardScannerCore.js");
const root=path.resolve(__dirname,".."),SIZE=96;
const RANKS=["sieben","acht","neun","zehn","unter","ober","koenig","ass","unlesbar"],SUITS=["eichel","gras","herz","schellen","unlesbar"];
const digest=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function softmax(values){const max=Math.max(...values),weights=Array.from(values,value=>Math.exp(value-max)),total=weights.reduce((sum,value)=>sum+value,0);return weights.map(value=>value/total);}
function component(values,names){
  const probabilities=softmax(values),order=probabilities.map((score,index)=>({score,index})).sort((a,b)=>b.score-a.score);
  return {label:names[order[0].index],confidence:order[0].score,margin:order[0].score-order[1].score};
}
function decodeReader(rank,suit){
  if(rank.length!==RANKS.length||suit.length!==SUITS.length||[...rank,...suit].some(value=>!Number.isFinite(value)))throw Error("Ungültige Leser-Ausgabe.");
  const r=component(rank,RANKS),s=component(suit,SUITS);
  return {cardId:r.label==="unlesbar"||s.label==="unlesbar"?null:s.label+"-"+r.label,rank:r,suit:s,confidence:Math.min(r.confidence,s.confidence),uncertain:r.confidence<.65||s.confidence<.65||r.margin<.12||s.margin<.12};
}
function iou(a,b){const overlap=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));return overlap/Math.max(1,(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-overlap);}
function proposals(tensor){
  const shape=tensor.dims;if(shape.length!==3||shape[0]!==1||shape[1]!==36)throw Error("Unbekanntes Lokalisierungsmodell.");
  const count=shape[2],data=tensor.data,candidates=[];
  for(let row=0;row<count;row++){
    let confidence=0;for(let cls=0;cls<32;cls++)confidence=Math.max(confidence,data[(cls+4)*count+row]);
    if(!Number.isFinite(confidence)||confidence<.15)continue;
    const [cx,cy,width,height]=[0,1,2,3].map(channel=>data[channel*count+row]);
    if(![cx,cy,width,height].every(Number.isFinite)||width<5||height<5)continue;
    const clamp=value=>Math.max(0,Math.min(640,value));
    const box=[clamp(cx-width/2),clamp(cy-height/2),clamp(cx+width/2),clamp(cy+height/2)];
    if(box[2]-box[0]<5||box[3]-box[1]<5)continue;
    candidates.push({box,localizerConfidence:confidence});
  }
  const kept=[];
  // Ignore the old predicted class; it may be the very classification we correct.
  for(const item of candidates.sort((a,b)=>b.localizerConfidence-a.localizerConfidence)){
    if(kept.every(previous=>iou(previous.box,item.box)<.45))kept.push(item);
    if(kept.length===32)break;
  }return kept;
}
function rgbTensor(rgb){
  const pixels=SIZE*SIZE;if(rgb.length!==pixels*3)throw Error("Ungültige Eckzeichenpixel.");
  const data=new Float32Array(pixels*3);for(let index=0;index<pixels;index++)for(let channel=0;channel<3;channel++)data[channel*pixels+index]=rgb[index*3+channel]/255;return data;
}
async function loadReader(model){
  const metadata=JSON.parse(fs.readFileSync(model.replace(/\.onnx$/,".metadata.json"),"utf8"));
  if(metadata.target!=="separate-rank-suit-reader"||JSON.stringify(metadata.ranks)!==JSON.stringify(RANKS)||JSON.stringify(metadata.suits)!==JSON.stringify(SUITS)||digest(fs.readFileSync(model))!==metadata.onnxSha256)throw Error("Lesermodell und Metadaten passen nicht zusammen.");
  ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=pathToFileURL(path.join(root,"vendor/onnxruntime")+path.sep).href;
  const session=await ort.InferenceSession.create(model,{executionProviders:["wasm"]});return {session,metadata};
}
async function readBatch(session,pixels,count){
  const input=new ort.Tensor("float32",pixels,[count,3,SIZE,SIZE]);let output;
  try{output=await session.run({indices:input});return {ranks:Array.from(output.rank_logits.data),suits:Array.from(output.suit_logits.data)};}
  finally{input.dispose();if(output)Object.values(output).forEach(tensor=>tensor.dispose());}
}
async function verifyExport(model){
  const {session}=await loadReader(model);
  try{
    const fixture=JSON.parse(fs.readFileSync(path.join(path.dirname(model),"export-check.json"),"utf8")),pixels=Float32Array.from(fixture.pixels);
    if(pixels.length!==3*SIZE*SIZE)throw Error("Ungültige Export-Prüfdaten.");
    const result=await readBatch(session,pixels,1);
    const error=Math.max(...result.ranks.map((value,index)=>Math.abs(value-fixture.rank_logits[index])),...result.suits.map((value,index)=>Math.abs(value-fixture.suit_logits[index])));
    if(!Number.isFinite(error)||error>1e-4)throw Error("ONNX und PyTorch weichen voneinander ab: "+error);
    const pair=new Float32Array(pixels.length*2);pair.set(pixels);pair.set(pixels,pixels.length);
    const batched=await readBatch(session,pair,2);
    if(batched.ranks.length!==18||batched.suits.length!==10)throw Error("Dynamische Stapelverarbeitung fehlgeschlagen.");
    const batchError=Math.max(...batched.ranks.map((value,index)=>Math.abs(value-fixture.rank_logits[index%9])),...batched.suits.map((value,index)=>Math.abs(value-fixture.suit_logits[index%5])));
    if(!Number.isFinite(batchError)||batchError>1e-4)throw Error("ONNX-Stapelausgabe weicht ab: "+batchError);
    console.log(JSON.stringify({onnxVerified:true,maximumLogitDifference:error,dynamicBatchVerified:true,maximumBatchLogitDifference:batchError}));
  }finally{await session.release();}
}
async function evaluatePhoto(model,photo,labelsPath,reportPath){
  const {session:reader,metadata}=await loadReader(model);
  let localizer;
  try{
    const detectorFile=path.join(root,"models",core.MODELS[core.DEFAULT_MODEL].file+".onnx");
    localizer=await ort.InferenceSession.create(detectorFile,{executionProviders:["wasm"]});
    const original=fs.readFileSync(photo),reference=JSON.parse(fs.readFileSync(labelsPath,"utf8"));
    require("../src/handEvaluation.js").evaluateHand(reference.cardIds);
    const {data:rgb,info}=await sharp(original,{limitInputPixels:50000000}).rotate().resize(2000,2000,{fit:"inside",withoutEnlargement:true}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const fit=core.letterbox(info.width,info.height),rgba=await sharp(rgb,{raw:info}).resize(640,640,{fit:"contain",background:{r:114,g:114,b:114}}).ensureAlpha().raw().toBuffer();
    const input=new ort.Tensor("float32",core.rgbaToTensor(rgba),[1,3,640,640]);let output,candidates,baseline;
    try{output=await localizer.run({[localizer.inputNames[0]]:input});candidates=proposals(output[localizer.outputNames[0]]);baseline=core.decodeOutput(output[localizer.outputNames[0]],{target:"rank-and-suit-index"});}
    finally{input.dispose();if(output)Object.values(output).forEach(tensor=>tensor.dispose());}
    const crops=[];
    for(const item of candidates){
      const [x1,y1,x2,y2]=item.box,left=Math.max(0,Math.floor((x1-fit.x)*info.width/fit.width)),top=Math.max(0,Math.floor((y1-fit.y)*info.height/fit.height));
      const right=Math.min(info.width,Math.ceil((x2-fit.x)*info.width/fit.width)),bottom=Math.min(info.height,Math.ceil((y2-fit.y)*info.height/fit.height));
      if(right-left<2||bottom-top<2)continue;
      const patch=await sharp(rgb,{raw:info}).extract({left,top,width:right-left,height:bottom-top}).resize(SIZE,SIZE,{fit:"contain",background:"white",kernel:"linear"}).removeAlpha().raw().toBuffer();
      crops.push({...item,pixels:rgbTensor(patch)});
    }
    let detections=[];
    if(crops.length){
      const pixels=new Float32Array(crops.length*3*SIZE*SIZE);crops.forEach((item,index)=>pixels.set(item.pixels,index*3*SIZE*SIZE));
      const result=await readBatch(reader,pixels,crops.length);
      detections=crops.map((item,index)=>({...decodeReader(result.ranks.slice(index*9,index*9+9),result.suits.slice(index*5,index*5+5)),box:item.box,localizerConfidence:item.localizerConfidence}));
    }
    const ids=[...new Set(detections.filter(item=>item.cardId&&item.confidence>=.35).sort((a,b)=>b.confidence-a.confidence).map(item=>item.cardId))].slice(0,8);
    const matched=ids.filter(id=>reference.cardIds.includes(id)),unexpected=ids.filter(id=>!reference.cardIds.includes(id)),missing=reference.cardIds.filter(id=>!ids.includes(id));
    const report={photo:path.basename(photo),photoSha256:digest(original),readerVersion:metadata.version,localizerVersion:core.MODELS[core.DEFAULT_MODEL].version,
      expected:reference.cardIds,suggested:ids,matched,unexpected,missing,exactMatch:!unexpected.length&&!missing.length,baseline:baseline.cardIds,detections,
      limitation:"Known-photo comparison. Localizer still limits recall. No evidence of independent-deck generalization; not used to select checkpoints."};
    if(reportPath){fs.mkdirSync(path.dirname(path.resolve(reportPath)),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");}
    console.log(JSON.stringify(report,null,2));if(!report.exactMatch)process.exitCode=1;
    return report;
  }finally{await reader.release();await localizer?.release();}
}
async function main(){
  const [first,second,photo,labels,report]=process.argv.slice(2);
  if(first==="--verify-export"&&second)return verifyExport(path.resolve(second));
  if(first==="--reader"&&second&&photo&&labels)return evaluatePhoto(path.resolve(second),path.resolve(photo),path.resolve(labels),report);
  throw Error("Aufruf: node scripts/check-card-index-reader.cjs --verify-export <Leser.onnx> | --reader <Leser.onnx> <Foto> <Referenz.json> [Bericht.json]");
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=2;});
module.exports={decodeReader,proposals,rgbTensor};
