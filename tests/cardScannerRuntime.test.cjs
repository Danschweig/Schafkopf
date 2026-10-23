const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {pathToFileURL}=require("node:url");
const sharp=require("sharp");
const ort=require("onnxruntime-web");
const core=require("../src/cardScannerCore.js");
const {evaluateHand}=require("../src/handEvaluation.js");
const root=path.resolve(__dirname,"..");
let session;
before(async()=>{
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=pathToFileURL(path.join(root,"vendor","onnxruntime")+path.sep).href;
  session=await ort.InferenceSession.create(path.join(root,"models","bavarian-cards.onnx"),{executionProviders:["wasm"]});
});
after(async()=>session?.release());
async function detect(data){
  const input=new ort.Tensor("float32",data,[1,3,640,640]);
  const output=await session.run({[session.inputNames[0]]:input});
  try{
    assert.deepEqual(output[session.outputNames[0]].dims,[1,36,8400]);
    return core.decodeOutput(output[session.outputNames[0]]);
  }finally{input.dispose();Object.values(output).forEach(tensor=>tensor.dispose());}
}
test("bundled ONNX artifact and WASM runtime match their pinned source metadata",()=>{
  const metadata=JSON.parse(fs.readFileSync(path.join(root,"models","bavarian-cards.metadata.json"),"utf8"));
  const hash=crypto.createHash("sha256").update(fs.readFileSync(path.join(root,"models","bavarian-cards.onnx"))).digest("hex");
  assert.equal(hash,metadata.onnxSha256);
  assert.equal(metadata.version,core.MODEL_VERSION);
  const ranks={7:"sieben",8:"acht",9:"neun",10:"zehn",Unter:"unter",Ober:"ober",Koenig:"koenig",Ass:"ass"};
  assert.deepEqual(metadata.classNames.map(name=>{const [suit,rank]=name.split("_");return `${suit.toLowerCase()}-${ranks[rank]}`;}),core.CLASS_IDS);
  for(const file of ["ort.wasm.min.js","ort-wasm-simd-threaded.mjs","ort-wasm-simd-threaded.wasm"]){
    assert.deepEqual(fs.readFileSync(path.join(root,"vendor","onnxruntime",file)),fs.readFileSync(path.join(root,"node_modules","onnxruntime-web","dist",file)));
  }
});
test("actual general model does not invent hand cards in a blank image",async()=>{
  const result=await detect(new Float32Array(3*640*640).fill(114/255));
  assert.deepEqual(result.cardIds,[]);
});
test("actual general model reads the six-card fan without fabricating a complete eight-card hand",async()=>{
  const {data}=await sharp(path.join(__dirname,"fixtures","bavarian-fan-six.jpg")).rotate()
    .resize(640,640,{fit:"contain",background:{r:114,g:114,b:114}}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const result=await detect(core.rgbaToTensor(data));
  const present=new Set(["eichel-ober","gras-ober","herz-ober","schellen-ober","eichel-unter","gras-unter"]);
  assert.ok(result.cardIds.length>0,"The model must do real image recognition");
  assert.ok(result.cardIds.length<8);
  assert.ok(result.cardIds.every(id=>present.has(id)));
  assert.throws(()=>evaluateHand(result.cardIds));
});

test("trained corner model matches its profile and executes actual WASM without inventing blank-image cards",async()=>{
  const profile=core.MODELS.personal;
  const model=path.join(root,"models",profile.file+".onnx");
  const metadata=JSON.parse(fs.readFileSync(path.join(root,"models",profile.file+".metadata.json"),"utf8"));
  const standard=JSON.parse(fs.readFileSync(path.join(root,"models/bavarian-cards.metadata.json"),"utf8"));
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(model)).digest("hex"),metadata.onnxSha256);
  assert.equal(metadata.version,profile.version);assert.equal(metadata.target,profile.target);
  assert.deepEqual(metadata.classNames,standard.classNames);
  const detector=await ort.InferenceSession.create(model,{executionProviders:["wasm"]});
  const input=new ort.Tensor("float32",new Float32Array(3*640*640).fill(114/255),[1,3,640,640]);
  let output;
  try{
    output=await detector.run({[detector.inputNames[0]]:input});
    const tensor=output[detector.outputNames[0]];
    assert.deepEqual(tensor.dims,[1,36,8400]);
    assert.deepEqual(core.decodeOutput(tensor,{target:profile.target}).cardIds,[]);
  }finally{input.dispose();if(output)Object.values(output).forEach(tensor=>tensor.dispose());await detector.release();}
});

test("optional reader artifact matches its metadata and executes a real dynamic batch in WASM",async()=>{
  const profile=core.MODELS.indexReader,helpers=require("../src/cardIndexReaderCore.js");
  const file=path.join(root,"models",profile.file+".onnx"),meta=JSON.parse(fs.readFileSync(file.replace(/\.onnx$/,".metadata.json"),"utf8"));
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),meta.onnxSha256);
  assert.equal(meta.version,profile.version);assert.equal(meta.target,profile.target);
  assert.deepEqual(meta.ranks,helpers.RANKS);assert.deepEqual(meta.suits,helpers.SUITS);
  const reader=await ort.InferenceSession.create(file,{executionProviders:["wasm"]}),plane=96*96,stride=plane*3,pixels=new Float32Array(2*stride);
  for(let channel=0;channel<3;channel++)for(let index=0;index<plane;index++){
    const value=index%96<48?.2:.5;pixels[channel*plane+index]=value;pixels[stride+channel*plane+index]=value+.1;
  }
  const input=new ort.Tensor("float32",pixels,[2,3,96,96]);let output;
  try{
    output=await reader.run({indices:input});
    assert.deepEqual(output.rank_logits.dims,[2,9]);assert.deepEqual(output.suit_logits.dims,[2,5]);
    assert.ok(Array.from(output.rank_logits.data).every(Number.isFinite));
    // Float32 spatial reductions can slightly shift logits under a lighting
    // offset. Compare the actual decision/confidence, not bit-identical logits.
    const first=helpers.decodeReader(output.rank_logits.data.slice(0,9),output.suit_logits.data.slice(0,5));
    const brighter=helpers.decodeReader(output.rank_logits.data.slice(9,18),output.suit_logits.data.slice(5,10));
    assert.equal(first.rank.label,brighter.rank.label);
    assert.ok(Math.abs(first.rank.confidence-brighter.rank.confidence)<.001);
  }finally{input.dispose();if(output)Object.values(output).forEach(tensor=>tensor.dispose());await reader.release();}
});
