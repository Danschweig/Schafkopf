const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const core=require("../src/cardScannerCore.js");
function service(mode="result"){
  const events={workers:[],revoked:[],created:[],closed:0,messages:[]};
  let ready;
  const workerReady=new Promise(resolve=>{ready=resolve;});
  class LocalURL extends URL{
    static createObjectURL(blob){const url=`blob:local-${events.created.length}`;events.created.push({url,blob});return url;}
    static revokeObjectURL(url){events.revoked.push(url);}
  }
  const result={cardIds:["eichel-ober"],detections:[],warnings:[]};
  class LocalWorker{
    constructor(url){this.url=String(url);this.terminated=false;events.workers.push(this);ready(this);}
    terminate(){this.terminated=true;}
    postMessage(message,transfers){
      events.messages.push({message,transfers});
      if(mode==="post-error")throw new Error("Cannot transfer input");
      if(mode==="pending")return;
      queueMicrotask(()=>{
        if(mode==="worker-error"){this.onerror?.();return;}
        this.onmessage?.({data:{type:"progress",message:"local inference"}});
        this.onmessage?.({data:{type:"result",result}});
      });
    }
  }
  const context={URL:LocalURL,DOMException,Worker:LocalWorker,WebAssembly,setTimeout,clearTimeout,performance,
    createImageBitmap:async()=>({width:1200,height:1600,close:()=>events.closed++}),
    document:{currentScript:{src:"https://example.test/Schafkopf/src/cardScanner.js"},createElement:type=>{
      assert.equal(type,"canvas");
      return {getContext:()=>({fillRect(){},drawImage(){},getImageData:()=>({data:new Uint8Array(640*640*4)})}),toBlob:callback=>callback({type:"image/jpeg"})};
    }},
    // If any photo upload is added to this boundary, the test must fail.
    fetch:()=>assert.fail("Photo service must never upload or fetch image data"),
    SchafkopfCardScannerCore:core
  };
  context.window=context;
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/cardScanner.js"),"utf8"),context);
  return {api:context.SchafkopfCardScanner,events,context,workerReady};
}
const photo={type:"image/jpeg",size:1024};
test("photo service uses a local worker URL, transfers only resized pixels, and releases resources",async()=>{
  const {api,events}=service();
  const progress=[];
  const result=await api.scanPhoto(photo,{onProgress:message=>progress.push(message)});
  assert.deepEqual(result.cardIds,["eichel-ober"]);
  assert.equal(result.previewUrl,"blob:local-0");
  assert.equal(events.workers[0].url,"https://example.test/Schafkopf/src/cardScannerWorker.js");
  assert.equal(events.messages[0].message.pixels.byteLength,3*640*640*4);
  assert.equal(events.messages[0].message.model,"personal");
  assert.deepEqual(Object.keys(core.MODELS),["personal"]);
  assert.equal(events.messages[0].transfers[0],events.messages[0].message.pixels);
  assert.equal(events.workers[0].terminated,true);
  assert.equal(events.closed,1);
  assert.deepEqual(events.revoked,[]); // Ownership of the preview passes to the UI.
  assert.ok(progress.includes("local inference"));
});
test("photo service abort terminates inference, revokes the preview and closes the decoded photo",async()=>{
  const {api,events,workerReady}=service("pending");
  const controller=new AbortController();
  const scanning=api.scanPhoto(photo,{signal:controller.signal});
  await workerReady;
  assert.equal(events.closed,1,"Release the full camera bitmap before waiting for model inference");
  controller.abort();
  await assert.rejects(scanning,error=>error.name==="AbortError");
  assert.equal(events.workers[0].terminated,true);
  assert.deepEqual(events.revoked,["blob:local-0"]);
  assert.equal(events.closed,1);
});
for(const mode of ["worker-error","post-error"])test(`photo service cleans up after ${mode}`,async()=>{
  const {api,events}=service(mode);
  await assert.rejects(()=>api.scanPhoto(photo));
  assert.equal(events.workers[0].terminated,true);
  assert.deepEqual(events.revoked,["blob:local-0"]);
  assert.equal(events.closed,1);
});
test("photo service rejects non-images, oversized photos and unsupported browsers before creating a worker",async()=>{
  const {api,events,context}=service();
  for(const file of [null,{type:"application/pdf",size:1},{type:"image/jpeg",size:26*1024*1024}])await assert.rejects(()=>api.scanPhoto(file));
  context.Worker=undefined;
  await assert.rejects(()=>api.scanPhoto(photo),/Browser/);
  assert.equal(events.workers.length,0);
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>api.scanPhoto(photo,{signal:controller.signal}),error=>error.name==="AbortError");
});
test("photo service rejects an unknown model before decoding or starting inference",async()=>{
  const {api,events}=service();
  for(const model of ["standard","__proto__"]){
    await assert.rejects(()=>api.scanPhoto(photo,{model}),/Kartenmodell/);
  }
  assert.equal(events.workers.length,0);assert.equal(events.closed,0);
});
test("photo service accepts an actual 48 MP phone resolution and rejects larger decoded images",async()=>{
  const {api,events,context}=service();
  context.createImageBitmap=async()=>({width:8064,height:6048,close:()=>events.closed++});
  await api.scanPhoto(photo);
  assert.equal(events.workers.length,1);
  context.createImageBitmap=async()=>({width:12000,height:9000,close:()=>events.closed++});
  await assert.rejects(()=>api.scanPhoto(photo),/Megapixel/);
  assert.equal(events.workers.length,1);
  assert.equal(events.closed,2);
});
test("photo service Image fallback loads locally and releases its source before inference",async()=>{
  const {api,events,context}=service("pending");
  context.createImageBitmap=undefined;
  let loaded;
  context.Image=class{
    constructor(){this.width=1200;this.height=1600;loaded=this;}
    set src(value){this.source=value;if(value)queueMicrotask(()=>this.onload?.());}
  };
  const controller=new AbortController(),pending=api.scanPhoto(photo,{signal:controller.signal});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(events.workers.length,1);assert.equal(loaded.source,"");
  assert.ok(events.revoked.includes("blob:local-0"));
  controller.abort();await assert.rejects(pending,error=>error.name==="AbortError");
  assert.deepEqual(events.revoked,["blob:local-0","blob:local-1"]);
});
