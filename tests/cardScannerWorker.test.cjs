const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const core=require("../src/cardScannerCore.js");
function worker(model="standard",changeMetadata=()=>{},runError=false){
  const profile=core.MODELS[model],messages=[],fetches=[],loads=[];
  let disposed=0;
  const metadata=JSON.parse(fs.readFileSync(require.resolve("../models/bavarian-cards.metadata.json"),"utf8"));
  metadata.version=profile.version;metadata.target=profile.target;changeMetadata(metadata);
  // Two ends of the same physical card: only the corner profile deduplicates them.
  const data=new Float32Array(36*2);
  for(let i=0;i<2;i++){data[i]=100+i*300;data[2+i]=100;data[4+i]=40;data[6+i]=60;data[(4+5)*2+i]=.95;}
  const ort={env:{wasm:{}},Tensor:class{dispose(){disposed++;}},InferenceSession:{create:async(url,options)=>{
    loads.push({url,options});return {inputNames:["images"],outputNames:["output"],run:async()=>{
      if(runError)throw new Error("WASM failed");
      return {output:{dims:[1,36,2],data,dispose:()=>disposed++}};
    }};
  }}};
  const context={SchafkopfCardScannerCore:core,ort,URL,ArrayBuffer,Float32Array,performance,
    self:{location:{href:"https://example.test/Schafkopf/src/cardScannerWorker.js"},postMessage:message=>messages.push(message)},
    importScripts:file=>{assert.ok(["cardScannerCore.js","../vendor/onnxruntime/ort.wasm.min.js"].includes(file));},
    fetch:async url=>{fetches.push(String(url));return {ok:true,json:async()=>metadata};}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/cardScannerWorker.js"),"utf8"),context);
  const scan=async(options={})=>{await context.self.onmessage({data:{type:"scan",model,pixels:new ArrayBuffer(3*640*640*4),...options}});return messages.at(-1);};
  return {scan,messages,fetches,loads,ort,disposed:()=>disposed};
}
for(const model of ["standard","personal"])test(`worker ${model}: correct model, target, Pages paths and version`,async()=>{
  const w=worker(model),message=await w.scan(),profile=core.MODELS[model];
  assert.equal(message.type,"result");
  assert.equal(message.result.modelVersion,profile.version);
  assert.deepEqual(message.result.cardIds,model==="personal"?["eichel-ober"]:[]);
  assert.equal(w.loads[0].url,`https://example.test/Schafkopf/models/${profile.file}.onnx?v=${profile.version}`);
  assert.deepEqual(w.fetches,[`https://example.test/Schafkopf/models/${profile.file}.metadata.json?v=${profile.version}`]);
  assert.equal(w.ort.env.wasm.numThreads,1);
  assert.equal(w.ort.env.wasm.proxy,false);
  assert.equal(w.ort.env.wasm.wasmPaths,"https://example.test/Schafkopf/vendor/onnxruntime/");
  assert.equal(w.disposed(),2);
  assert.ok(message.result.timings.inferenceMs>=0);
});
for(const mutate of [meta=>meta.version="stale",meta=>meta.target="wrong",meta=>meta.classNames.reverse()])test("worker rejects incompatible metadata before model loading",async()=>{
  const w=worker("personal",mutate);
  assert.equal((await w.scan()).type,"error");assert.equal(w.loads.length,0);
});
test("worker rejects unknown model IDs and malformed buffers without any fetch",async()=>{
  for(const options of [{model:"__proto__"},{model:"missing"},{pixels:new ArrayBuffer(4)}]){
    const w=worker();assert.equal((await w.scan(options)).type,"error");assert.equal(w.fetches.length,0);
  }
});
test("worker releases input when inference fails and does not produce a result",async()=>{
  const w=worker("personal",()=>{},true);
  assert.equal((await w.scan()).type,"error");assert.equal(w.disposed(),1);
});
test("service-worker activation preserves other apps' caches",async()=>{
  const deleted=[],listeners={};
  const context={self:{addEventListener:(name,callback)=>listeners[name]=callback,clients:{claim:async()=>{}}},
    caches:{keys:async()=>["smash-bingo-v1","other-app","schafkopf-v24","schafkopf-v25","schafkopf-v26"],delete:async key=>deleted.push(key)}};
  vm.runInNewContext(fs.readFileSync(require.resolve("../sw.js"),"utf8"),context);
  let done;listeners.activate({waitUntil:promise=>{done=promise;}});await done;
  assert.deepEqual(deleted,["schafkopf-v24","schafkopf-v25"]);
});
