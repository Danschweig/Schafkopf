    function PhotoCardScanner({onScanStart,onCards,onBusyChange}){
      const fileRef=useRef(null);
      const abortRef=useRef(null);
      const requestRef=useRef(0);
      const previewRef=useRef(null);
      const [busy,setBusy]=useState(false);
      const [status,setStatus]=useState("");
      const [error,setError]=useState("");
      const [result,setResult]=useState(null);
      const model=window.SchafkopfCardScannerCore.DEFAULT_MODEL;
      const cardLabel=id=>window.SchafkopfHandEvaluation.CARDS.find(card=>card.id===id)?.label||id;
      useEffect(()=>()=>{
        requestRef.current++;
        abortRef.current?.abort();
        if(previewRef.current)URL.revokeObjectURL(previewRef.current);
      },[]);
      function cancel(){
        requestRef.current++;
        abortRef.current?.abort();
        setBusy(false);
        onBusyChange(false);
        setStatus("Erkennung abgebrochen. Du kannst die Karten unten auswählen.");
      }
      async function photograph(event){
        const file=event.target.files?.[0];
        event.target.value="";
        if(!file)return;
        abortRef.current?.abort();
        const request=++requestRef.current;
        const controller=new AbortController();
        abortRef.current=controller;
        setError("");
        setResult(null);
        if(previewRef.current){URL.revokeObjectURL(previewRef.current);previewRef.current=null;}
        try{
          window.SchafkopfCardScanner.validatePhoto(file);
          onScanStart();
          setBusy(true);
          onBusyChange(true);
          const scanned=await window.SchafkopfCardScanner.scanPhoto(file,{
            model,
            signal:controller.signal,
            onProgress:message=>{if(request===requestRef.current)setStatus(message);}
          });
          if(request!==requestRef.current){URL.revokeObjectURL(scanned.previewUrl);return;}
          previewRef.current=scanned.previewUrl;
          setResult(scanned);
          onCards(scanned.cardIds);
          setStatus(`${scanned.cardIds.length} von 8 Karten vorgeschlagen und vorausgewählt. Bitte jede Karte mit deinem Foto vergleichen; auch eindeutige Vorschläge können falsch sein.`);
        }catch(err){
          if(request!==requestRef.current||err.name==="AbortError")return;
          setError(err.message||"Das Foto konnte nicht erkannt werden. Bitte die Karten unten auswählen.");
          setStatus("");
        }finally{if(request===requestRef.current){setBusy(false);onBusyChange(false);}}
      }
      return <div style={{...s.card("#4ab8e855",C.bg2),marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:"bold",color:C.title,marginBottom:8}}>Handkarten fotografieren · Beta</div>
        <div style={{fontSize:11,lineHeight:1.5,color:C.text,marginBottom:10}}>
          Bayerisches Doppelbild: alle acht Karten breit auffächern und gut beleuchten. Zahl oder Buchstabe und das kleine Farbsymbol müssen bei jeder Karte sichtbar sein. Möglichst viel vom Kartenmotiv zeigen.
          Verdeckte Motive, Spiegelungen und starke Schräglage erschweren die Erkennung. Bei eng gefächerten Handkarten ist diese Version unzuverlässig und kann falsche Karten vorschlagen. Bitte alle acht Karten kontrollieren.
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" aria-label="Foto der acht Handkarten" style={{display:"none"}} onChange={photograph}/>
        <div style={{fontSize:11,color:C.dim,marginBottom:8}}>Kartenscan (Beta)</div>
        <button disabled={busy} onClick={()=>fileRef.current?.click()} style={{...s.btn(!busy,"#4ab8e8"),width:"100%",minHeight:48}}>
          Karten fotografieren
        </button>
        {busy&&<button onClick={cancel} style={{...s.btn(false),width:"100%",minHeight:44,marginTop:6}}>Erkennung abbrechen</button>}
        <div style={{fontSize:10,lineHeight:1.5,color:C.dim,marginTop:8}}>
          Die Fotoerkennung läuft lokal auf deinem Gerät. Beim ersten Scan werden Modell und Erkennungsprogramm geladen.
          Die App lädt dein Foto nicht hoch und speichert es nicht dauerhaft. Ein neues Foto ersetzt deine aktuelle Kartenauswahl.
          {" "}<a href="scanner-check.html" target="_blank" rel="noopener" style={{color:C.title}}>Fotoerkennung auf diesem Handy prüfen</a>
        </div>
        {status&&<div role="status" aria-live="polite" style={{fontSize:11,lineHeight:1.5,marginTop:10}}>{status}</div>}
        {error&&<div role="alert" style={{fontSize:11,lineHeight:1.5,color:"#e85d4a",marginTop:8}}>{error}</div>}
        {result&&<>
          <div style={{position:"relative",marginTop:10,width:"100%",aspectRatio:"1 / 1",overflow:"hidden",borderRadius:6,background:C.inputBg}}>
            <img src={result.previewUrl} alt="Dein Foto mit den erkannten Karten" style={{display:"block",width:"100%",height:"100%"}}/>
            {result.detections.slice(0,16).map((item,index)=><div key={index} aria-hidden="true" style={{position:"absolute",left:`${item.box[0]/6.4}%`,top:`${item.box[1]/6.4}%`,
              width:`${(item.box[2]-item.box[0])/6.4}%`,height:`${(item.box[3]-item.box[1])/6.4}%`,border:`2px solid ${item.uncertain?"#f5c842":"#4ab8e8"}`,pointerEvents:"none"}}>
              <span style={{position:"absolute",top:0,left:0,fontSize:9,lineHeight:1.3,padding:"1px 3px",background:"#081208dd",color:item.uncertain?"#f5c842":"#bfeaff"}}>{cardLabel(item.cardId)}{item.uncertain?" ?":""}</span>
            </div>)}
          </div>
          {result.warnings.map((warning,index)=><div key={index} style={{fontSize:11,lineHeight:1.5,color:C.text,marginTop:8}}>{warning}</div>)}
          <div style={{fontSize:10,color:C.dim,marginTop:8}}>Verwendetes Modell: {result.modelVersion}</div>
          {result.detections.length>0&&<details style={{fontSize:11,lineHeight:1.5,marginTop:8}}>
            <summary style={{cursor:"pointer"}}>Erkannte Karten prüfen</summary>
            {result.detections.map((item,index)=><div key={index}>{cardLabel(item.cardId)} · {item.uncertain?"unsicher, nicht übernommen":"ausgewählt"}</div>)}
          </details>}
          <div style={{fontSize:11,lineHeight:1.5,marginTop:8}}>Die Auswahl unten kannst du korrigieren. Erst bei acht ausgewählten Karten entsteht eine Bewertung; gespeichert wird erst nach deiner Bestätigung.</div>
        </>}
      </div>;
    }
