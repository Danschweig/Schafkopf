    function AppIcon({name,size=22}){
      const paths={home:"M8 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-5 4v12a3 3 0 0 0 3 3M13 8l3 4-3 4-3-4Z",verlauf:"M4 5h16M4 12h16M4 19h16M8 3v4M8 10v4M8 17v4",chart:"M4 4v16h17M8 15l4-5 4 3 5-7",austeilen:"M4 4h10v14H4zM14 7h6v14H10v-3M7 9h4M7 13h4",settings:"M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"};
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.home}/></svg>;
    }
    function TopBar(props){
      const {nav,aussetzenStep,editRound,typeCfg,aussetzer,rounds,tariff,standings}=props;
      if(C.legacyDesign)return <LegacyTopBar {...props}/>;
      const titles={home:"Schafkopf",entry:editRound?"Spiel bearbeiten":typeCfg?.label||"Spiel eintragen",verlauf:"Verlauf",chart:"Statistik",austeilen:"Austeilen",settings:"Einstellungen"};
      return <>
        <header style={s.topbar} className="app-header">
          <div className="header-identity"><span className="brand-mark"><AppIcon name="home" size={24}/></span><div><div className="header-eyebrow">AM SPIELTISCH</div><div className="header-title">{titles[nav]}</div></div></div>
          <span className="round-pill">Runde <strong>{rounds.length}</strong></span>
        </header>
        {nav!=="settings"&&nav!=="entry"&&<section className="scoreboard" aria-label="Aktuelle Kontostände" style={{gridTemplateColumns:`repeat(${standings.length},minmax(0,1fr))`}}>
          {standings.map(p=><div className="score-player" key={p.name}><div className="score-name" title={p.name}><span style={{background:p.color}}/>{p.name}</div><div className="score-value">{p.value.toLocaleString("de-DE")}</div><div className="score-diff" style={{color:p.diff>=0?C.mode==="light"?"#386b3c":"#b9d894":C.mode==="light"?"#ae4339":"#f09c90"}}>{p.diff>=0?"+":""}{p.diff}</div></div>)}
        </section>}
      </>;
    }

    function InstallHint({show,onDismiss}){
      if(!show)return null;
      return <div style={{margin:"10px 16px 0",background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",display:"flex",alignItems:"center",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:"bold",color:C.subText,marginBottom:2}}>Zum Home-Bildschirm hinzufuegen</div>
          <div style={{fontSize:12,lineHeight:1.3,color:C.dim}}>Im Browser-Menue teilen und als App speichern.</div>
        </div>
        <button onClick={onDismiss} aria-label="Hinweis schliessen" style={{background:"transparent",border:`1px solid ${C.border}`,color:C.dim,borderRadius:6,width:30,height:30,cursor:"pointer",fontSize:16,lineHeight:1}}>x</button>
      </div>;
    }

    function OnlineRoomBar({status,syncing,roomCode,error,onCopy,onDisconnect}){
      if(status==="offline"&&!error)return null;
      const connected=status==="online";
      const color=error?"#e85d4a":connected?"#7de87a":"#f5c842";
      return <div style={{margin:"10px 16px 0",background:C.bg2,border:`1px solid ${color}55`,borderRadius:8,padding:"8px 10px",display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:color,boxShadow:`0 0 8px ${color}`,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:"bold",color}}>
            {connected?`Online-Raum ${roomCode}`:error?"Online-Modus nicht verbunden":"Firebase wird verbunden ..."}
          </div>
          <div style={{fontSize:12,color:error?"#e85d4a":C.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {error||(syncing?"Synchronisierung laeuft":"Alle Sitzungsdaten sind synchronisiert")}
          </div>
        </div>
        {connected&&<button onClick={onCopy} style={{...s.btn(false,"#4ab8e8"),padding:"5px 7px",fontSize:12}}>Code</button>}
        <button onClick={onDisconnect} style={{...s.btn(false,"#e85d4a"),padding:"5px 7px",fontSize:12}}>Offline</button>
      </div>;
    }

    function BottomNav(props){
      const {nav,roundsCount,aussetzenStep,setNav,setSelType,setAussetzer,setSpatzenAussetzer,setAussetzenStep,cancelEntry}=props;
      if(C.legacyDesign)return <LegacyBottomNav {...props}/>;
      const items=[["home","Spiel"],["verlauf","Verlauf"],["chart","Statistik"],["austeilen","Austeilen"],["settings","Einst."]];
      return <nav className="bottom-nav" aria-label="Hauptnavigation">
        {items.map(([key,label])=>{const active=nav===key||(nav==="entry"&&key==="home")||(aussetzenStep>0&&key==="home");return <button key={key} className={active?"nav-item is-active":"nav-item"} aria-current={active?"page":undefined} aria-label={key==="settings"?"Einstellungen":label}
          onClick={()=>{if(nav==="entry")cancelEntry();else{setAussetzer(null);setSpatzenAussetzer?.(null);setAussetzenStep(0);}setNav(key);if(key!=="entry")setSelType(null);}}>
          <span className="nav-icon"><AppIcon name={key}/></span><span>{label}</span>
        </button>;})}
      </nav>;
    }

    // Classic presentation; all actions and session data come from the shared app.
    function LegacyTopBar({nav,aussetzenStep,editRound,typeCfg,aussetzer,rounds,tariff,standings}){
      return <div style={s.topbar}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:9,color:C.mute,letterSpacing:3}}>SCHAFKOPF</div>
            <div style={{fontSize:15,fontWeight:"bold",color:C.title}}>
              {nav==="home"&&(aussetzenStep>0?`Aussetzen - ${aussetzenStep===1||aussetzenStep===4?"Wer?":aussetzenStep===3?"6+ Spatz":"Spieltyp"}`:"Spieltyp waehlen")}
              {nav==="entry"&&(editRound?`Bearbeiten ${typeCfg?.label||""}`:aussetzer?`${typeCfg?.label||""} (${aussetzer} out)`:typeCfg?.label||"")}
              {nav==="verlauf"&&`Verlauf (${rounds.length})`}
              {nav==="chart"&&"Chart & Statistik"}
              {nav==="austeilen"&&"Austeilkuenste"}
              {nav==="settings"&&"Einstellungen"}
            </div>
          </div>
          <div style={{textAlign:"right",fontSize:10,color:C.title}}>
            <div>S&L {tariff.sl} - Ssp {tariff.sauspiel} - Solo {tariff.solo}</div>
          </div>
        </div>
        <div style={{background:C.roundBg,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",margin:"8px 0",textAlign:"center"}}>
          <span style={{fontSize:9,color:C.dim,letterSpacing:2,marginRight:8}}>RUNDE</span>
          <span style={{fontSize:22,fontWeight:"bold",color:C.subText}}>{rounds.length}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${standings.length},1fr)`,gap:6}}>
          {standings.map((p,i)=><div key={p.name} style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:p.color}}>{p.name}</div>
            <div style={{fontSize:14,fontWeight:"bold",color:C.title}}>{p.value.toLocaleString("de-DE")}</div>
            <div style={{fontSize:10,color:p.diff>=0?"#7de87a":"#e85d4a"}}>{p.diff>=0?"+":""}{p.diff}</div>
          </div>)}
        </div>
      </div>;
    }

    function LegacyBottomNav({nav,roundsCount,aussetzenStep,setNav,setSelType,setAussetzer,setSpatzenAussetzer,setAussetzenStep,cancelEntry}){
      const navItems=[
        ["home",String.fromCodePoint(0x1F0A1),"Spiel"],
        ["verlauf",`${String.fromCodePoint(0x1F4CB)} ${roundsCount}`,"Verlauf"],
        ["chart",String.fromCodePoint(0x1F4CA),"Chart"],
        ["austeilen",String.fromCodePoint(0x1F0A0),"Austeilen"],
        ["settings",String.fromCodePoint(0x2699),"Einst."]
      ];
      return <nav aria-label="Hauptnavigation" className="legacy-nav" style={{position:"fixed",bottom:0,left:0,right:0,background:C.navBg,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:20,paddingBottom:"env(safe-area-inset-bottom)",boxShadow:C.mode==="light"?"0 -2px 12px rgba(35,70,35,0.08)":"none"}}>
        {navItems.map(([key,icon,label])=><button key={key}
          aria-label={key==="settings"?"Einstellungen":key==="chart"?"Statistik":label} style={s.navBtn(nav===key||(nav==="entry"&&key==="home")||(aussetzenStep>0&&key==="home"))}
          onClick={()=>{if(nav==="entry")cancelEntry();else{setAussetzer(null);setSpatzenAussetzer?.(null);setAussetzenStep(0);}setNav(key);if(key!=="entry")setSelType(null);}}>
          <div style={{fontSize:16,lineHeight:1}}>{icon}</div><div>{label}</div>
        </button>)}
      </nav>;
    }
