    function TrainingArchiveSettings(){
      const archive=window.SchafkopfTrainingArchive;
      const [state,setState]=useState(()=>archive.snapshot());
      const [address,setAddress]=useState(state.settings.endpoint);
      const [token,setToken]=useState(state.settings.token);
      const [evening,setEvening]=useState(state.settings.evening);
      const [message,setMessage]=useState("");
      const [showSetup,setShowSetup]=useState(state.settings.enabled);
      useEffect(()=>{const unsubscribe=archive.subscribe(setState);void archive.refresh();return unsubscribe;},[]);
      function save(enabled=state.settings.enabled){
        try{archive.configure({enabled,endpoint:address,token,evening});setMessage("Auf diesem Gerät gespeichert.");}
        catch(error){setShowSetup(true);setMessage(error.message);}
      }
      function toggle(enabled){
        if(enabled){save(true);return;}
        // Switching off must also work while the server fields contain unfinished edits.
        try{archive.configure({enabled:false});setShowSetup(false);setMessage("");}
        catch(error){setMessage(error.message);}
      }
      return <DesignSection title="Trainingsbilder">
        <Toggle label="Trainingsbilder beitragen" value={state.settings.enabled} onChange={toggle}/>
        {!state.settings.enabled&&<p style={{fontSize:13,lineHeight:1.5,color:C.dim,marginBottom:12}}>
          Ausgeschaltet: Fotos werden ausschließlich auf deinem Gerät erkannt. Es werden keine Trainingsbilder gespeichert oder hochgeladen. Ein Server ist für die normale Nutzung nicht erforderlich.
        </p>}
        <button aria-expanded={showSetup} onClick={()=>setShowSetup(value=>!value)} style={{...s.btn(false),width:"100%",marginBottom:10}}>
          {showSetup?"Archiv-Einrichtung schließen":"Archiv einrichten"}
        </button>
        {showSetup&&<>
        <p style={{fontSize:13,lineHeight:1.5,color:C.dim,marginBottom:12}}>
          Freiwillig: Nach Bestätigung deiner acht Karten wird eine komprimierte Fotokopie mit deiner korrigierten Auswahl an dein privates Archiv übertragen.
          Fotos können Hände und Hintergrund zeigen. Bilddaten und Zugangsschlüssel werden nicht mit dem Spielstand geteilt.
          Beim Ausschalten werden keine neuen Bilder vorgemerkt und Uploads pausiert.
        </p>
        <label style={{display:"block",fontSize:13,marginBottom:10}}>HTTPS-Adresse des Archivs
          <input aria-label="HTTPS-Adresse des Trainingsarchivs" type="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://dein-server.dein-netz.ts.net" value={address} onChange={event=>setAddress(event.target.value)} style={{...s.input,marginTop:4}}/>
        </label>
        <label style={{display:"block",fontSize:13,marginBottom:10}}>Zugangsschlüssel
          <input aria-label="Trainingsarchiv-Zugangsschlüssel" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={token} onChange={event=>setToken(event.target.value)} style={{...s.input,marginTop:4}}/>
        </label>
        <label style={{display:"block",fontSize:13,marginBottom:8}}>Spielabend-ID (optional)
          <input aria-label="Trainingsarchiv-Spielabend" autoCapitalize="none" spellCheck={false} placeholder={state.eveningId} value={evening} onChange={event=>setEvening(event.target.value)} style={{...s.input,marginTop:4}}/>
        </label>
        <p style={{fontSize:12,lineHeight:1.5,color:C.dim,marginBottom:12}}>
          Leer lassen: automatisch nach Berliner Datum, bis 06:00 Uhr zählt der Vorabend. Für denselben Abend auf allen Handys dieselbe ID verwenden.
          Alle Bilder eines Abends bleiben später gemeinsam in Training oder Test. Ohne Tailscale-Verbindung bleiben Bilder zunächst auf diesem Gerät.
        </p>
        <button onClick={()=>save()} style={{...s.btn(false),width:"100%"}}>Archiv-Einstellungen speichern</button>
        <div role="status" style={{fontSize:13,lineHeight:1.5,marginTop:12}}>
          {state.uploading?"Trainingsbilder werden übertragen …":`${state.pending} Bilder vorgemerkt (${(state.bytes/1024/1024).toFixed(1)} MB).`}
          {state.error&&<div style={{color:C.mode==="light"?"#a33026":"#f09c90"}}>{state.error}</div>}
        </div>
        </>}
        {message&&<div role="status" style={{fontSize:13,lineHeight:1.5,marginTop:8}}>{message}</div>}
        <div style={{display:"grid",gap:8,marginTop:10}}>
          <button onClick={()=>{setMessage("Verbindung wird geprüft …");void archive.checkConnection().then(()=>setMessage("Privates Archiv erreichbar; Zugangsschlüssel gültig.")).catch(error=>setMessage(error.message));}} style={{...s.btn(false),flex:1}}>Verbindung prüfen</button>
          <button disabled={!state.settings.enabled||state.uploading} onClick={()=>void archive.flush()} style={{...s.btn(false),flex:1}}>Upload erneut versuchen</button>
          <button disabled={!state.pending} onClick={()=>{if(window.confirm("Alle lokal vorgemerkten Trainingsbilder löschen? Bereits archivierte Bilder bleiben auf dem Server."))void archive.clear();}} style={{...s.btn(false,"#e85d4a"),flex:1}}>Warteschlange leeren</button>
        </div>
      </DesignSection>;
    }
