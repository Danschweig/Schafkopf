// Development-only quality check. Uses the deployed model/runtime, no network IO.
// The reference labels are human annotations, never inputs to the detector.
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {pathToFileURL}=require("node:url");
const sharp=require("sharp");
const ort=require("onnxruntime-web");
const core=require("../src/cardScannerCore.js");
const {evaluateHand}=require("../src/handEvaluation.js");
const root=path.resolve(__dirname,"..");

async function main(){
  const [photoPath,labelsPath,...extra]=process.argv.slice(2);
  let modelPath=path.join(root,"models",core.MODELS[core.DEFAULT_MODEL].file+".onnx"),reportPath;
  for(let i=0;i<extra.length;i+=2){
    if(extra[i]==="--model"&&extra[i+1])modelPath=path.resolve(extra[i+1]);
    else if(extra[i]==="--report"&&extra[i+1])reportPath=path.resolve(extra[i+1]);
    else throw new Error("Unbekannte oder unvollstaendige Option.");
  }
  if(!photoPath||!labelsPath){
    throw new Error("Aufruf: npm run check:photo -- <Foto> <Referenzkarten.json> [--model <ONNX>] [--report <JSON>]");
  }
  const metadata=JSON.parse(fs.readFileSync(modelPath.replace(/\.onnx$/,".metadata.json"),"utf8"));
  const reference=JSON.parse(fs.readFileSync(labelsPath,"utf8"));
  // Reject malformed references, including repeated cards and non-eight-card hands.
  const referenceScore=evaluateHand(reference.cardIds,reference.rules).score;
  const photo=fs.readFileSync(photoPath);
  const {data}=await sharp(photo).rotate()
    .resize(core.IMAGE_SIZE,core.IMAGE_SIZE,{fit:"contain",background:{r:114,g:114,b:114}})
    .ensureAlpha().raw().toBuffer({resolveWithObject:true});
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=pathToFileURL(path.join(root,"vendor","onnxruntime")+path.sep).href;
  const session=await ort.InferenceSession.create(modelPath,{executionProviders:["wasm"]});
  let input,outputs;
  try{
    input=new ort.Tensor("float32",core.rgbaToTensor(data),[1,3,core.IMAGE_SIZE,core.IMAGE_SIZE]);
    outputs=await session.run({[session.inputNames[0]]:input});
    const result=core.decodeOutput(outputs[session.outputNames[0]],{target:metadata.target||"card"});
    const matched=result.cardIds.filter(id=>reference.cardIds.includes(id));
    const unexpected=result.cardIds.filter(id=>!reference.cardIds.includes(id));
    const missing=reference.cardIds.filter(id=>!result.cardIds.includes(id));
    const exactMatch=unexpected.length===0&&missing.length===0;
    const report={
      photo:path.basename(photoPath),
      photoSha256:crypto.createHash("sha256").update(photo).digest("hex"),
      modelVersion:metadata.version,
      modelSha256:crypto.createHash("sha256").update(fs.readFileSync(modelPath)).digest("hex"),
      status:exactMatch?"EXACT_MATCH":"RECOGNITION_FAILED",
      expected:reference.cardIds,
      suggested:result.cardIds,
      matched,unexpected,missing,
      referenceScore,
      suggestedScore:result.cardIds.length===8?evaluateHand(result.cardIds,reference.rules).score:null,
      detections:result.detections
    };
    if(reportPath){fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");}
    console.log(JSON.stringify(report,null,2));
    // A recognizer that misses or invents cards must not pass a quality check.
    if(!exactMatch)process.exitCode=1;
  }finally{
    input?.dispose();
    if(outputs)Object.values(outputs).forEach(tensor=>tensor.dispose());
    await session.release();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=2;});
