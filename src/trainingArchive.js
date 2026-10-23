/* Optional, private training archive. No photos or credentials enter session sync. */
(function(root){
  "use strict";
  const SETTINGS_KEY="schafkopf-training-images-v1";
  const MAX_QUEUE_BYTES=80*1024*1024,MAX_QUEUE_COUNT=100,MAX_IMAGE_BYTES=3*1024*1024;
  const IDS=new Set(["eichel","gras","herz","schellen"].flatMap(suit=>["sieben","acht","neun","zehn","unter","ober","koenig","ass"].map(rank=>`${suit}-${rank}`)));
  function endpoint(value){
    const url=new URL(String(value).trim());
    if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/")throw Error("Bitte die HTTPS-Adresse des Archivs ohne Pfad eingeben.");
    return url.origin;
  }
  function eveningId(time=Date.now()){
    // A night belongs to the date on which it began, until 06:00 Berlin time.
    const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(time));
    const values=Object.fromEntries(parts.map(item=>[item.type,item.value]));
    let day=`${values.year}-${values.month}-${values.day}`;
    if(Number(values.hour)<6)day=new Date(Date.parse(day+"T12:00:00Z")-86400000).toISOString().slice(0,10);
    return `abend-${day}`;
  }
  const sessionId=value=>/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
  function indexedStore(){
    let opening;
    function database(){
      if(!root.indexedDB)return Promise.reject(Error("Dieser Browser kann Trainingsbilder nicht zwischenspeichern."));
      if(!opening)opening=new Promise((resolve,reject)=>{
        const request=root.indexedDB.open("schafkopf-training-images",1);
        request.onupgradeneeded=()=>request.result.createObjectStore("samples",{keyPath:"id"});
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>{opening=null;reject(Error("Der lokale Bildspeicher konnte nicht geöffnet werden."));};
        request.onblocked=()=>{opening=null;reject(Error("Bitte andere App-Fenster schließen und erneut versuchen."));};
      });
      return opening;
    }
    async function transaction(mode,operation){
      const db=await database();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction("samples",mode);let result;
        tx.oncomplete=()=>resolve(result);
        tx.onerror=tx.onabort=()=>reject(Error("Der lokale Bildspeicher ist voll oder nicht verfügbar."));
        operation(tx.objectStore("samples"),value=>{result=value;},tx);
      });
    }
    return {
      list:()=>transaction("readonly",(store,done)=>{const req=store.getAll();req.onsuccess=()=>done(req.result);}),
      put:item=>transaction("readwrite",(store,done,tx)=>{
        const req=store.getAll();req.onsuccess=()=>{
          const other=req.result.filter(value=>value.id!==item.id);
          if(other.length>=MAX_QUEUE_COUNT||other.reduce((total,value)=>total+value.image.size,0)+item.image.size>MAX_QUEUE_BYTES){tx.abort();return;}
          store.put(item);
        };
      }),
      remove:id=>transaction("readwrite",store=>store.delete(id)),
      clear:()=>transaction("readwrite",store=>store.clear())
    };
  }
  async function compress(file){
    const scanner=root.SchafkopfCardScanner;
    scanner.validatePhoto(file);
    const image=await scanner.decodeImage(file);
    try{
      if(!image.width||!image.height||image.width*image.height>50000000)throw Error("Das Foto ist zu groß für das Trainingsarchiv.");
      const scale=Math.min(1,2000/Math.max(image.width,image.height));
      const canvas=root.document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      const ctx=canvas.getContext("2d");if(!ctx)throw Error("Die Trainingskopie konnte nicht erstellt werden.");
      ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
      if(!blob||blob.size>MAX_IMAGE_BYTES)throw Error("Die Trainingskopie ist zu groß. Bitte ein kleineres Foto verwenden.");
      return {image:blob,width:canvas.width,height:canvas.height,originalWidth:image.width,originalHeight:image.height};
    }finally{if(typeof image.close==="function")image.close();else{image.onload=null;image.onerror=null;image.src="";}}
  }
  async function base64(blob){
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary="";
    for(let offset=0;offset<bytes.length;offset+=16384)binary+=String.fromCharCode(...bytes.subarray(offset,offset+16384));
    return root.btoa(binary);
  }
  function safeStorage(){try{return root.localStorage;}catch{return {getItem:()=>null,setItem:()=>{throw Error("Storage blocked");}};}}
  function createClient({storage=safeStorage(),store=indexedStore(),fetchImpl=(...args)=>root.fetch(...args),compressPhoto=compress,scannerCore=root.SchafkopfCardScannerCore,now=Date.now,uuid=()=>root.crypto.randomUUID()}={}){
    let settings={enabled:false,endpoint:"",token:"",evening:""};
    try{const saved=JSON.parse(storage.getItem(SETTINGS_KEY)||"{}");settings={...settings,...saved,enabled:saved.enabled===true};}catch{}
    // Corrupt settings never enable a destination or protocol implicitly.
    try{if(settings.endpoint)settings.endpoint=endpoint(settings.endpoint);if(settings.evening&&!sessionId(settings.evening))throw Error();}
    catch{settings={enabled:false,endpoint:"",token:"",evening:""};}
    if(!/^[A-Za-z0-9_-]{32,128}$/.test(settings.token)||!settings.endpoint)settings.enabled=false;
    let status={pending:0,bytes:0,error:"",uploading:false},active,controller,generation=0,mutation=Promise.resolve();
    const listeners=new Set();
    const confirmations=new Map();
    const snapshot=()=>({...status,settings:{...settings},eveningId:settings.evening||eveningId(now())});
    const emit=()=>listeners.forEach(listener=>listener(snapshot()));
    const exclusive=work=>{const next=mutation.then(work);mutation=next.catch(()=>{});return next;};
    async function refresh(){
      try{const items=await store.list();status.pending=items.length;status.bytes=items.reduce((total,item)=>total+item.image.size,0);}
      catch(error){status.error=error.message;}emit();return snapshot();
    }
    function configure(next){
      const candidate={...settings,...next};
      candidate.endpoint=candidate.endpoint?endpoint(candidate.endpoint):"";
      candidate.token=String(candidate.token||"").trim();candidate.evening=String(candidate.evening||"").trim();
      if(candidate.evening&&!sessionId(candidate.evening))throw Error("Die Spielabend-ID darf nur Kleinbuchstaben, Zahlen, Bindestriche und Unterstriche enthalten (maximal 64 Zeichen).");
      if(candidate.enabled&&(!candidate.endpoint||!/^[A-Za-z0-9_-]{32,128}$/.test(candidate.token)))throw Error("Bitte zuerst HTTPS-Adresse und Zugangsschlüssel eintragen.");
      try{storage.setItem(SETTINGS_KEY,JSON.stringify(candidate));}catch{throw Error("Die Einstellung konnte auf diesem Gerät nicht gespeichert werden.");}
      settings=candidate;generation++;controller?.abort();status.error="";emit();
      if(settings.enabled)void flush();return snapshot();
    }
    async function capture(file,result){
      if(!settings.enabled)return null;
      const at=now(),version=generation,config={...settings},id=uuid();
      const photo=await compressPhoto(file);
      if(!settings.enabled||version!==generation)return null;
      return {id,...photo,endpoint:config.endpoint,metadata:{schemaVersion:1,id,sessionId:config.evening||eveningId(at),capturedAt:new Date(at).toISOString(),
        modelVersion:String(result.modelVersion||"unknown").slice(0,120),detectionTarget:scannerCore?.MODELS[scannerCore.DEFAULT_MODEL]?.target||"unknown",
        suggestedCardIds:[...(result.cardIds||[])],detections:(result.detections||[]).slice(0,64).map(item=>({cardId:item.cardId,confidence:item.confidence,uncertain:!!item.uncertain,box:[...item.box]})),
        detectorSpace:{width:640,height:640,letterbox:scannerCore.letterbox(photo.originalWidth,photo.originalHeight)},
        image:{width:photo.width,height:photo.height,originalWidth:photo.originalWidth,originalHeight:photo.originalHeight},labelStatus:"hand-confirmed-needs-regions"}};
    }
    async function enqueue(capture,cardIds){
      if(!capture||!settings.enabled)return false;
      if(capture.endpoint!==settings.endpoint)throw Error("Das Archiv wurde seit der Aufnahme geändert. Bitte erneut fotografieren.");
      if(cardIds.length!==8||new Set(cardIds).size!==8||cardIds.some(id=>!IDS.has(id)))throw Error("Für das Trainingsbild müssen acht verschiedene Karten bestätigt werden.");
      const key=capture.id+"/"+[...cardIds].sort().join(",");
      let queued=false;
      await exclusive(async()=>{
        if(!settings.enabled)return;
        if(confirmations.has(key)){queued=true;return;}
        const id=uuid();
        const item={...capture,id,metadata:{...capture.metadata,id,sourceCaptureId:capture.id,confirmedAt:new Date(now()).toISOString(),confirmedCardIds:[...cardIds]}};
        const items=await store.list(),other=items.filter(value=>value.id!==item.id);
        if(other.length>=MAX_QUEUE_COUNT||other.reduce((total,value)=>total+value.image.size,0)+item.image.size>MAX_QUEUE_BYTES)throw Error("Die Bildwarteschlange ist voll (100 Bilder / 80 MB). Bitte hochladen oder leeren.");
        await store.put(item);
        confirmations.set(key,id);queued=true;
        if(confirmations.size>1000)confirmations.delete(confirmations.keys().next().value);
      });
      status.error="";await refresh();if(queued)void flush();return queued;
    }
    async function flush(){
      if(active)return active;
      if(!settings.enabled||!settings.endpoint||!settings.token)return;
      const config={...settings},version=generation;
      active=(async()=>{
        status.uploading=true;emit();
        try{
          const items=await store.list();
          for(const item of items){
            if(!settings.enabled||version!==generation)break;
            if(item.endpoint!==config.endpoint){status.error="Vorgemerkte Bilder gehören zu einem anderen Archiv. Alte Adresse wiederherstellen oder Warteschlange leeren.";continue;}
            controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
            try{
              const response=await fetchImpl(config.endpoint+"/v1/samples",{method:"POST",mode:"cors",credentials:"omit",redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",
                headers:{"Content-Type":"application/json",Authorization:"Bearer "+config.token},signal:controller.signal,
                body:JSON.stringify({metadata:item.metadata,image:await base64(item.image)})});
              if(!response.ok)throw Error(response.status===401?"Archiv-Zugangsschlüssel abgelehnt.":`Archiv nicht bereit (HTTP ${response.status}). Bilder bleiben vorgemerkt.`);
              const receipt=await response.json();
              if(receipt.id!==item.id||receipt.stored!==true)throw Error("Keine gültige Speicherbestätigung vom Archiv. Das Bild bleibt vorgemerkt.");
              await exclusive(()=>store.remove(item.id));status.error="";
            }finally{clearTimeout(timeout);controller=null;}
          }
        }catch(error){status.error=error.name==="AbortError"?"Upload unterbrochen. Bilder bleiben vorgemerkt.":error.name==="TypeError"?"Archiv nicht erreichbar. Bitte Tailscale-Verbindung prüfen; Bilder bleiben vorgemerkt.":error.message||"Archiv nicht erreichbar. Bilder bleiben vorgemerkt.";}
        finally{status.uploading=false;active=null;await refresh();}
      })();
      return active;
    }
    async function clear(){generation++;controller?.abort();await exclusive(()=>store.clear());confirmations.clear();status.error="";await refresh();}
    async function checkConnection(){
      if(!settings.endpoint||!settings.token)throw Error("Bitte zuerst die Archiv-Einstellungen speichern.");
      const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),15000);
      try{
        const response=await fetchImpl(settings.endpoint+"/v1/health",{headers:{Authorization:"Bearer "+settings.token},credentials:"omit",redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",signal:abort.signal});
        if(!response.ok||!(await response.json()).ok)throw Error("Archiv nicht erreichbar oder Zugangsschlüssel abgelehnt.");return true;
      }finally{clearTimeout(timeout);}
    }
    function start(){
      const retry=()=>{if(!root.document||root.document.visibilityState!=="hidden")void flush();};
      root.addEventListener?.("online",retry);root.document?.addEventListener?.("visibilitychange",retry);void refresh();retry();
      const timer=root.setInterval?.(retry,60000);
      return ()=>{root.removeEventListener?.("online",retry);root.document?.removeEventListener?.("visibilitychange",retry);if(timer)root.clearInterval(timer);controller?.abort();};
    }
    return {getSettings:()=>({...settings}),snapshot,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},configure,capture,enqueue,flush,clear,refresh,checkConnection,start};
  }
  const api={createClient,eveningId,endpoint,indexedStore,compress,MAX_IMAGE_BYTES,SETTINGS_KEY};
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.SchafkopfTrainingArchive={...api,...createClient()};
})(typeof window!=="undefined"?window:globalThis);
