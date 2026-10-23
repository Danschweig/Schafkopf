/* Dedicated local worker. Receives only a resized pixel buffer; never uploads it. */
"use strict";
importScripts("cardScannerCore.js");
importScripts("cardIndexReaderCore.js");
let sessionPromise=null;
let readerPromise=null;
let loadMs=0;
let activeModel=null;
function session(profile){
  if(!sessionPromise){
    sessionPromise=(async()=>{
      const started=performance.now();
      self.postMessage({type:"progress",message:"Erkennungsdateien werden geladen …"});
      importScripts("../vendor/onnxruntime/ort.wasm.min.js");
      ort.env.wasm.numThreads=1;
      ort.env.wasm.proxy=false;
      ort.env.wasm.wasmPaths=new URL("../vendor/onnxruntime/",self.location.href).href;
      const base=new URL("../models/",self.location.href);
      const metadataUrl=new URL(profile.file+".metadata.json",base);
      metadataUrl.searchParams.set("v",profile.version);
      const response=await fetch(metadataUrl);
      if(!response.ok)throw new Error("Modellmetadaten fehlen.");
      const metadata=await response.json();
      const ranks={7:"sieben",8:"acht",9:"neun",10:"zehn",Unter:"unter",Ober:"ober",Koenig:"koenig",Ass:"ass"};
      const ids=metadata.classNames?.map(name=>{const [suit,rank]=name.split("_");return `${suit.toLowerCase()}-${ranks[rank]}`;});
      if(metadata.version!==profile.version||(metadata.target||"card")!==profile.target||JSON.stringify(ids)!==JSON.stringify(SchafkopfCardScannerCore.CLASS_IDS))throw new Error("Modellversion oder Klassen passen nicht zur App.");
      const modelUrl=new URL(profile.file+".onnx",base);
      modelUrl.searchParams.set("v",profile.version);
      const detector=await ort.InferenceSession.create(modelUrl.href,{executionProviders:["wasm"]});
      loadMs=Math.round(performance.now()-started);
      return detector;
    })();
  }
  return sessionPromise;
}
async function readerSession(profile){
  if(!readerPromise)readerPromise=(async()=>{
    const started=performance.now(),base=new URL("../models/",self.location.href),url=new URL(profile.file+".metadata.json",base);
    url.searchParams.set("v",profile.version);
    const response=await fetch(url);
    if(!response.ok)throw new Error("Lesermetadaten fehlen.");
    const metadata=await response.json(),reader=SchafkopfCardIndexReaderCore;
    if(metadata.version!==profile.version||metadata.target!==profile.target||JSON.stringify(metadata.ranks)!==JSON.stringify(reader.RANKS)||JSON.stringify(metadata.suits)!==JSON.stringify(reader.SUITS)||JSON.stringify(metadata.inputShape)!==JSON.stringify(["batch",3,96,96]))throw new Error("Lesermodell passt nicht zur App.");
    const modelUrl=new URL(profile.file+".onnx",base);modelUrl.searchParams.set("v",profile.version);
    const model=await ort.InferenceSession.create(modelUrl.href,{executionProviders:["wasm"]});
    loadMs+=Math.round(performance.now()-started);
    return model;
  })();
  return readerPromise;
}
async function readIndices(output,source,reader,profile){
  const helpers=SchafkopfCardIndexReaderCore,fit=SchafkopfCardScannerCore.letterbox(source.width,source.height),detections=[];
  const rgba=new Uint8Array(source.pixels),candidates=helpers.proposals(output);
  // Small batches bound activation memory on phones. Only the localizer uses
  // the old card classifier; its class identity is discarded here.
  for(let start=0;start<candidates.length;start+=4){
    const crops=candidates.slice(start,start+4).map(item=>({...item,pixels:helpers.cropTensor({width:source.width,height:source.height,rgba},item.box,fit)})).filter(item=>item.pixels);
    if(!crops.length)continue;
    const stride=3*96*96,pixels=new Float32Array(crops.length*stride);crops.forEach((item,index)=>pixels.set(item.pixels,index*stride));
    const input=new ort.Tensor("float32",pixels,[crops.length,3,96,96]);let result;
    try{
      result=await reader.run({indices:input});
      if(JSON.stringify(result.rank_logits?.dims)!==JSON.stringify([crops.length,9])||JSON.stringify(result.suit_logits?.dims)!==JSON.stringify([crops.length,5]))throw new Error("Ungültige Leserausgabe.");
      for(let index=0;index<crops.length;index++)detections.push({...helpers.decodeReader(result.rank_logits.data.slice(index*9,index*9+9),result.suit_logits.data.slice(index*5,index*5+5)),box:crops[index].box,localizerConfidence:crops[index].localizerConfidence});
    }finally{input.dispose?.();if(result)Object.values(result).forEach(tensor=>tensor.dispose?.());}
  }
  return helpers.assemble(detections,profile.version);
}
self.onmessage=async event=>{
  if(event.data?.type!=="scan")return;
  try{
    const core=SchafkopfCardScannerCore;
    const model=event.data.model||core.DEFAULT_MODEL;
    if(!Object.hasOwn(core.MODELS,model)||activeModel&&activeModel!==model)throw new Error("Ungültiges Modell.");
    activeModel=model;
    const profile=core.MODELS[model];
    if(!(event.data.pixels instanceof ArrayBuffer)||event.data.pixels.byteLength!==3*640*640*4)throw new Error("Ungültiges Bild.");
    const source=event.data.source;
    if(profile.localizer&&(!source||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<2||source.height<2||source.width>2000||source.height>2000||!(source.pixels instanceof ArrayBuffer)||source.pixels.byteLength!==source.width*source.height*4))throw new Error("Ungültige Bildausschnitte.");
    const detector=await session(profile.localizer?core.MODELS[profile.localizer]:profile);
    const reader=profile.localizer?await readerSession(profile):null;
    self.postMessage({type:"progress",message:"Karten werden auf deinem Gerät erkannt …"});
    const input=new ort.Tensor("float32",new Float32Array(event.data.pixels),[1,3,640,640]);
    const started=performance.now();
    let output;
    try{
      output=await detector.run({[detector.inputNames[0]]:input});
      const result=reader?await readIndices(output[detector.outputNames[0]],source,reader,profile):core.decodeOutput(output[detector.outputNames[0]],{target:profile.target});
      result.modelVersion=profile.version;
      result.modelId=model;
      result.detectionTarget="rank-and-suit-index";
      result.timings={loadMs,inferenceMs:Math.round(performance.now()-started)};
      self.postMessage({type:"result",result});
    }finally{
      input.dispose?.();
      if(output)Object.values(output).forEach(tensor=>tensor.dispose?.());
    }
  }catch(error){
    self.postMessage({type:"error",message:"Die Fotoerkennung konnte nicht abgeschlossen werden. Bitte Internetverbindung und Browser prüfen oder die Karten auswählen."});
  }
};
