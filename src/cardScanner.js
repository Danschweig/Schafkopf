(function(root){
  "use strict";
  const baseUrl=new URL(".",document.currentScript.src);
  const abortError=()=>new DOMException("Erkennung abgebrochen.","AbortError");
  function releaseImage(image){
    if(typeof image.close==="function")image.close();
    else{image.onload=null;image.onerror=null;image.src="";}
  }
  function validatePhoto(file){
    if(!file||!String(file.type||"").startsWith("image/"))throw new Error("Bitte ein Foto auswählen.");
    if(file.size>25*1024*1024)throw new Error("Das Foto ist zu groß. Bitte ein Foto mit höchstens 25 MB verwenden.");
  }
  async function decodeImage(file,signal){
    if(typeof createImageBitmap==="function"){
      try{return await createImageBitmap(file,{imageOrientation:"from-image"});}
      catch(error){if(signal?.aborted)throw abortError();}
    }
    const url=URL.createObjectURL(file);
    try{
      return await new Promise((resolve,reject)=>{
        const image=new Image();
        const abort=()=>{image.src="";reject(abortError());};
        image.onload=()=>{signal?.removeEventListener("abort",abort);resolve(image);};
        image.onerror=()=>{signal?.removeEventListener("abort",abort);reject(new Error("Das Bildformat konnte nicht geöffnet werden. Bitte ein JPEG- oder PNG-Foto verwenden."));};
        signal?.addEventListener("abort",abort,{once:true});
        image.src=url;
      });
    }finally{URL.revokeObjectURL(url);}
  }
  async function scanPhoto(file,{signal,onProgress=()=>{},model=root.SchafkopfCardScannerCore.DEFAULT_MODEL}={}){
    validatePhoto(file);
    if(!Object.hasOwn(root.SchafkopfCardScannerCore.MODELS,model))throw new Error("Unbekanntes Kartenmodell.");
    if(signal?.aborted)throw abortError();
    if(typeof Worker==="undefined"||typeof WebAssembly==="undefined")throw new Error("Dieser Browser unterstützt die lokale Fotoerkennung nicht. Bitte einen aktuellen Browser verwenden oder die Karten auswählen.");
    onProgress("Foto wird vorbereitet …");
    const started=performance.now();
    const image=await decodeImage(file,signal);
    let imageClosed=false;
    let previewUrl;
    try{
      if(signal?.aborted)throw abortError();
      // A nominal 48 MP phone photo can contain 48.8 million pixels.
      if(image.width*image.height>50000000)throw new Error("Bitte ein Foto mit höchstens 50 Megapixeln verwenden.");
      const core=root.SchafkopfCardScannerCore;
      let sourceCanvas=null,source=null;
      if(core.MODELS[model].localizer){
        // Keep only a bounded, resized copy for the 96px index reader.
        const scale=Math.min(1,2000/Math.max(image.width,image.height));
        sourceCanvas=document.createElement("canvas");
        sourceCanvas.width=Math.max(2,Math.round(image.width*scale));sourceCanvas.height=Math.max(2,Math.round(image.height*scale));
        const sourceContext=sourceCanvas.getContext("2d",{willReadFrequently:true});
        if(!sourceContext)throw new Error("Das Foto konnte nicht verarbeitet werden.");
        sourceContext.fillStyle="white";sourceContext.fillRect(0,0,sourceCanvas.width,sourceCanvas.height);
        sourceContext.drawImage(image,0,0,sourceCanvas.width,sourceCanvas.height);
        source={width:sourceCanvas.width,height:sourceCanvas.height,pixels:sourceContext.getImageData(0,0,sourceCanvas.width,sourceCanvas.height).data.buffer};
      }
      const fit=core.letterbox(source?.width||image.width,source?.height||image.height);
      const canvas=document.createElement("canvas");
      canvas.width=core.IMAGE_SIZE;canvas.height=core.IMAGE_SIZE;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      if(!ctx)throw new Error("Das Foto konnte nicht verarbeitet werden.");
      ctx.fillStyle="rgb(114,114,114)";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(sourceCanvas||image,fit.x,fit.y,fit.width,fit.height);
      if(sourceCanvas){sourceCanvas.width=0;sourceCanvas.height=0;sourceCanvas=null;}
      // Release the full camera image before model loading/inference on phones.
      releaseImage(image);imageClosed=true;
      const pixels=core.rgbaToTensor(ctx.getImageData(0,0,canvas.width,canvas.height).data);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.85));
      if(!blob)throw new Error("Die Fotovorschau konnte nicht erstellt werden.");
      if(signal?.aborted)throw abortError();
      previewUrl=URL.createObjectURL(blob);
      const result=await new Promise((resolve,reject)=>{
        const worker=new Worker(new URL("cardScannerWorker.js",baseUrl));
        let finished=false;
        const finish=(callback,value)=>{
          if(finished)return;
          finished=true;
          clearTimeout(timeout);signal?.removeEventListener("abort",abort);
          worker.onmessage=null;worker.onerror=null;worker.terminate();callback(value);
        };
        const abort=()=>finish(reject,abortError());
        const timeout=setTimeout(()=>finish(reject,new Error("Die Erkennung dauert zu lange. Bitte erneut versuchen oder Karten auswählen.")),120000);
        signal?.addEventListener("abort",abort,{once:true});
        worker.onmessage=event=>{
          if(event.data?.type==="progress")onProgress(event.data.message);
          if(event.data?.type==="result")finish(resolve,event.data.result);
          if(event.data?.type==="error")finish(reject,new Error(event.data.message));
        };
        worker.onerror=()=>finish(reject,new Error("Die Erkennungsdateien konnten nicht geladen werden. Bitte erneut versuchen oder Karten auswählen."));
        try{worker.postMessage({type:"scan",model,pixels:pixels.buffer,...(source?{source}:{})},source?[pixels.buffer,source.pixels]:[pixels.buffer]);}
        catch(error){finish(reject,error);}
      });
      return {...result,previewUrl,timings:{...result.timings,totalMs:Math.round(performance.now()-started)}};
    }catch(error){
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      throw error;
    }finally{if(!imageClosed)releaseImage(image);}
  }
  root.SchafkopfCardScanner={scanPhoto,validatePhoto,decodeImage};
})(window);
