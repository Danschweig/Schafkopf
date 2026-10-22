    function JoinRoomDialog({roomCode,onCancel,onConfirm}){
      const dialogRef=useRef(null);
      useEffect(()=>{
        const dialog=dialogRef.current;
        dialog.showModal();
        return ()=>dialog.close();
      },[]);
      return <dialog ref={dialogRef} className="join-room-dialog"
        aria-labelledby="join-room-title" aria-describedby="join-room-description"
        onCancel={event=>{event.preventDefault();onCancel();}}
        style={{background:C.bg1,color:C.text,border:`1px solid ${C.subBorder}`,borderRadius:14,padding:0,margin:"auto",width:"calc(100% - 32px)",maxWidth:420,maxHeight:"calc(100dvh - 32px)",overflowY:"auto",fontFamily:"'Courier New',monospace",boxShadow:"0 20px 70px #0008"}}>
        <div style={{padding:"22px 20px"}}>
          <div style={{...s.sec,color:C.navActive}}>Online-Runde</div>
          <h2 id="join-room-title" style={{fontSize:20,color:C.title,lineHeight:1.3,marginBottom:16}}>Raum beitreten?</h2>
          <div style={{background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:8,padding:12,textAlign:"center",fontSize:22,fontWeight:"bold",letterSpacing:3,color:C.navActive,overflowWrap:"anywhere",marginBottom:16}}>{roomCode}</div>
          <div id="join-room-description" style={{fontSize:12,lineHeight:1.65}}>
            Du uebernimmst alle Spieler, Spiele und Einstellungen aus diesem Raum.
            <div style={{marginTop:12,padding:12,border:`1px solid ${C.subBorder}`,borderRadius:8,background:C.bg2}}>
              <strong style={{color:C.title}}>Dein lokaler Spielstand wird ersetzt.</strong>
              <div style={{marginTop:4}}>Auch offene Eingaben werden verworfen. Deine bisherigen lokalen Daten werden nicht in den Raum hochgeladen.</div>
            </div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:20}}>
            <button autoFocus onClick={onCancel} style={{...s.btn(false),flex:1,padding:"12px 16px"}}>Abbrechen</button>
            <button onClick={onConfirm} style={{...s.btn(true,C.navActive),flex:1,padding:"12px 16px"}}>Beitreten</button>
          </div>
        </div>
      </dialog>;
    }

    function Toggle({label,value,onChange,small}){
      return <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:small?6:10}}>
        <span style={{fontSize:small?11:12,color:C.text}}>{label}</span>
        <div onClick={()=>onChange(!value)} style={{width:40,height:22,borderRadius:11,background:value?C.switchOn:C.switchOff,border:`1px solid ${value?C.navActive:C.border}`,cursor:"pointer",position:"relative",transition:"all 0.2s",flexShrink:0}}>
          <div style={{width:16,height:16,borderRadius:"50%",background:value?C.switchKnob:C.switchKnobOff,position:"absolute",top:2,left:value?20:2,transition:"left 0.2s"}}/>
        </div>
      </div>;
    }

    // ── Stepper ──────────────────────────────────────────────────
    function Stepper({label,value,min=0,max=8,onChange,hint,color="#f5c842",small}){
      return <div style={{marginBottom:small?8:12}}>
        <div style={{...s.sec,marginBottom:6,fontSize:small?8:9}}>{label}: <strong style={{color}}>{value}</strong>
          {hint&&<span style={{marginLeft:6,fontSize:9,color:C.dim}}>{hint}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button style={{...s.btn(false),padding:small?"5px 12px":"7px 16px",fontSize:16}} onClick={()=>onChange(Math.max(min,value-1))}>−</button>
          <div style={{flex:1,textAlign:"center",fontSize:small?18:22,color,fontWeight:"bold"}}>{value}</div>
          <button style={{...s.btn(false),padding:small?"5px 12px":"7px 16px",fontSize:16}} onClick={()=>onChange(Math.min(max,value+1))}>+</button>
        </div>
      </div>;
    }

    // ── ErgebnisBlock ────────────────────────────────────────────
    function ErgebnisBlock({form,upd,typeCfg}){
      const minL=typeCfg.laufendeFrom||3;
      const lHint=form.laufende>=minL?`→ +${form.laufende} × S&L`:`Zählt ab ${minL}`;
      return <div style={s.card()}>
        <div style={s.sec}>Ergebnis</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button style={{...s.btn(form.gewonnen,"#7de87a"),flex:1,fontSize:14,padding:10}} onClick={()=>upd("gewonnen",true)}>✓ Gewonnen</button>
          <button style={{...s.btn(!form.gewonnen,"#e85d4a"),flex:1,fontSize:14,padding:10}} onClick={()=>upd("gewonnen",false)}>✗ Verloren</button>
        </div>
        {typeCfg.hasSchneiderSchwarz&&<div style={{display:"flex",gap:8,marginBottom:12}}>
          <button style={{...s.btn(form.schneider,"#f5c842"),flex:1}} onClick={()=>{upd("schneider",!form.schneider);if(form.schneider)upd("schwarz",false);}}>Schneider {form.schneider?"✓":""}</button>
          <button style={{...s.btn(form.schwarz&&form.schneider,"#f5c842"),flex:1,opacity:form.schneider?1:0.35}} onClick={()=>{if(form.schneider)upd("schwarz",!form.schwarz);}}>Schwarz {form.schwarz?"✓":""}</button>
        </div>}
        {typeCfg.hasLaufende&&<Stepper label="Laufende" value={form.laufende} max={8} onChange={v=>upd("laufende",v)} hint={lHint}/>}
      </div>;
    }

    // ── Chart-Tooltips ───────────────────────────────────────────
