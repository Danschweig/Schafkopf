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
