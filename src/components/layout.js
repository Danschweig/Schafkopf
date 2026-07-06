    function TopBar({nav,aussetzenStep,editRound,typeCfg,aussetzer,rounds,tariff,standings}){
      return <div style={s.topbar}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:9,color:C.mute,letterSpacing:3}}>SCHAFKOPF</div>
            <div style={{fontSize:15,fontWeight:"bold",color:C.title}}>
              {nav==="home"&&(aussetzenStep>0?`Aussetzen - ${aussetzenStep===1?"Wer?":aussetzenStep===3?"6+ Spatz":"Spieltyp"}`:"Spieltyp waehlen")}
              {nav==="entry"&&(editRound?`Bearbeiten ${typeCfg?.label||""}`:aussetzer?`${typeCfg?.label||""} (${aussetzer} out)`:typeCfg?.label||"")}
              {nav==="verlauf"&&`Verlauf (${rounds.length})`}
              {nav==="chart"&&"Chart & Statistik"}
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

    function InstallHint({show,onDismiss}){
      if(!show)return null;
      return <div style={{margin:"10px 16px 0",background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",display:"flex",alignItems:"center",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,fontWeight:"bold",color:C.subText,marginBottom:2}}>Zum Home-Bildschirm hinzufuegen</div>
          <div style={{fontSize:10,lineHeight:1.3,color:C.dim}}>Im Browser-Menue teilen und als App speichern.</div>
        </div>
        <button onClick={onDismiss} aria-label="Hinweis schliessen" style={{background:"transparent",border:`1px solid ${C.border}`,color:C.dim,borderRadius:6,width:30,height:30,cursor:"pointer",fontSize:16,lineHeight:1}}>x</button>
      </div>;
    }

    function BottomNav({nav,roundsCount,aussetzenStep,setNav,setSelType,setAussetzer,setSpatzenAussetzer,setAussetzenStep,cancelEntry}){
      const navItems=[
        ["home",String.fromCodePoint(0x1F0A1),"Spiel"],
        ["verlauf",`${String.fromCodePoint(0x1F4CB)} ${roundsCount}`,"Verlauf"],
        ["chart",String.fromCodePoint(0x1F4CA),"Chart"],
        ["settings",String.fromCodePoint(0x2699),"Einst."]
      ];
      return <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.navBg,borderTop:`1px solid ${C.border}`,display:"flex",boxShadow:C.mode==="light"?"0 -2px 12px rgba(35,70,35,0.08)":"none"}}>
        {navItems.map(([key,icon,label])=><button key={key}
          style={s.navBtn(nav===key||(nav==="entry"&&key==="home")||(aussetzenStep>0&&key==="home"))}
          onClick={()=>{if(nav==="entry")cancelEntry();else{setAussetzer(null);setSpatzenAussetzer?.(null);setAussetzenStep(0);}setNav(key);if(key!=="entry")setSelType(null);}}>
          <div style={{fontSize:16,lineHeight:1}}>{icon}</div><div>{label}</div>
        </button>)}
      </div>;
    }
