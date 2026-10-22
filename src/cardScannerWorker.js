/* Dedicated local worker. Receives only a resized pixel buffer; never uploads it. */
"use strict";
importScripts("cardScannerCore.js");
let sessionPromise=null;
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
self.onmessage=async event=>{
  if(event.data?.type!=="scan")return;
  try{
    const core=SchafkopfCardScannerCore;
    const model=event.data.model||core.DEFAULT_MODEL;
    if(!Object.hasOwn(core.MODELS,model)||activeModel&&activeModel!==model)throw new Error("Ungültiges Modell.");
    activeModel=model;
    const profile=core.MODELS[model];
    if(!(event.data.pixels instanceof ArrayBuffer)||event.data.pixels.byteLength!==3*640*640*4)throw new Error("Ungültiges Bild.");
    const detector=await session(profile);
    self.postMessage({type:"progress",message:"Karten werden auf deinem Gerät erkannt …"});
    const input=new ort.Tensor("float32",new Float32Array(event.data.pixels),[1,3,640,640]);
    const started=performance.now();
    let output;
    try{
      output=await detector.run({[detector.inputNames[0]]:input});
      const result=core.decodeOutput(output[detector.outputNames[0]],{target:profile.target});
      result.modelVersion=profile.version;
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
