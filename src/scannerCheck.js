(function(){
  "use strict";
  const check=document.getElementById("check"),photo=document.getElementById("photo");
  const cancel=document.getElementById("cancel"),report=document.getElementById("report"),preview=document.getElementById("preview");
  const model=document.getElementById("model");
  for(const [id,profile] of Object.entries(window.SchafkopfCardScannerCore.MODELS)){
    const option=document.createElement("option");option.value=id;option.textContent=profile.label;model.append(option);
  }
  model.value=window.SchafkopfCardScannerCore.DEFAULT_MODEL;
  let controller=null,previewUrl=null;
  const seconds=ms=>(ms/1000).toFixed(2)+" s";
  async function scan(file,blank){
    if(controller)return;
    check.disabled=true;photo.disabled=true;model.disabled=true;cancel.hidden=false;
    controller=new AbortController();
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
    preview.hidden=true;
    try{
      const result=await window.SchafkopfCardScanner.scanPhoto(file,{
        model:model.value,signal:controller.signal,onProgress:message=>{report.textContent=message;}
      });
      previewUrl=result.previewUrl;
      const lines=[blank?(result.cardIds.length===0?"Technischer Gerätetest erfolgreich: keine Karte auf leerer Fläche übernommen.":"Gerätetest auffällig: Karten auf leerer Fläche vorgeschlagen."):"Foto lokal ausgewertet. Bitte alle Vorschläge mit deinen Karten vergleichen.",
        "Modell: "+result.modelVersion,
        "Browser: "+navigator.userAgent,
        "Gesamt: "+seconds(result.timings.totalMs),
        "Dateien laden und Modell vorbereiten: "+seconds(result.timings.loadMs),
        "Erkennung: "+seconds(result.timings.inferenceMs),
        "Übernommene Karten ("+result.cardIds.length+" von 8): "+(result.cardIds.join(", ")||"keine"),
        "Unsichere Vorschläge: "+([...new Set(result.detections.filter(item=>item.uncertain).map(item=>item.cardId))].join(", ")||"keine"),
        ...(blank?[]:[...result.warnings,"Fehlende/falsche Karten kannst du in der Schafkopf-App korrigieren."])];
      report.textContent=lines.join("\n");
      if(!blank){preview.src=previewUrl;preview.hidden=false;}
    }catch(error){report.textContent=error.name==="AbortError"?"Test abgebrochen.":error.message+"\nBitte prüfen, ob models/, vendor/ und src/ vollständig auf GitHub Pages veröffentlicht wurden.";}
    finally{check.disabled=false;photo.disabled=false;model.disabled=false;cancel.hidden=true;controller=null;}
  }
  check.addEventListener("click",async()=>{
    const canvas=document.createElement("canvas");canvas.width=640;canvas.height=640;
    const ctx=canvas.getContext("2d");ctx.fillStyle="rgb(114,114,114)";ctx.fillRect(0,0,640,640);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg"));
    if(!blob){report.textContent="Der Browser konnte kein Testbild erstellen.";return;}
    await scan(blob,true);
  });
  photo.addEventListener("change",()=>{const file=photo.files?.[0];photo.value="";if(file)scan(file,false);});
  cancel.addEventListener("click",()=>controller?.abort());
  window.addEventListener("pagehide",()=>{controller?.abort();if(previewUrl)URL.revokeObjectURL(previewUrl);});
})();
