    // ── Entry Form ───────────────────────────────────────────────
    function EntryForm({form,upd,players,tariff,konten,typeCfg,preview,onSave,onBack,isEdit,roundNr,aussetzer,forcedPflichtramsch,forcedBockRound}){
      const catColor=TYPE_CATS[typeCfg.cat]?.color||"#fff";
      const activePlayers=aussetzer?players.filter(p=>p!==aussetzer):players;
      const b=preview?calcBetrag(form,typeCfg,tariff):0;
      const sm=Math.pow(2,form.sticht||0);
      const jm=typeCfg.cat==="ramsch"?Math.pow(2,form.jungfrauen||0):1;

      return <>
        <div style={s.card(catColor+"44",catColor+"0e")}>
          <div style={{fontSize:11,color:catColor}}>{typeCfg.desc}</div>
          {aussetzer&&<div style={{fontSize:11,color:"#a080e0",marginTop:4}}>⚬ {aussetzer} sitzt aus</div>}
          {forcedPflichtramsch&&<div style={{fontSize:11,color:"#a080e0",marginTop:4,fontWeight:"bold"}}>Pflichtramsch !!!</div>}
          {forcedBockRound&&<div style={{fontSize:11,color:"#2e5b36",marginTop:4,fontWeight:"bold"}}>Bock !!!</div>}
          <div style={{fontSize:11,color:"#8ab0aa",marginTop:4}}>
            {typeCfg.cat==="2vs2"?`Basis: ${typeCfg.useDefaultTariff?tariff.sauspiel:typeCfg.customBetrag} + Modif. à ${tariff.sl} Chips`:
             typeCfg.cat==="ramsch"?`Basis: ${typeCfg.useDefaultTariff?tariff.sauspiel:typeCfg.customBetrag} + Jungfrauen-Verdoppelung`:
             `Basis: ${typeCfg.useDefaultTariff?tariff.solo:typeCfg.customBetrag} + Modif. à ${tariff.sl} Chips${typeCfg.hasLaufende?` · Lfd. ab ${typeCfg.laufendeFrom}`:""}`}
          </div>
        </div>

        {typeCfg.cat==="2vs2"&&<div style={s.card()}>
          <div style={s.sec}>Spieler</div>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {activePlayers.map((p)=>{const i=players.indexOf(p);return <button key={p} style={s.pBtn(form.spieler===p,PCOLORS[i])} onClick={()=>{upd("spieler",form.spieler===p?null:p);if(form.partner===p)upd("partner",null);}}>{p}</button>;})}
          </div>
          <div style={s.sec}>Partner</div>
          <div style={{display:"flex",gap:6}}>
            {activePlayers.filter(p=>p!==form.spieler).map(p=>{const i=players.indexOf(p);return <button key={p} style={s.pBtn(form.partner===p,PCOLORS[i])} onClick={()=>upd("partner",form.partner===p?null:p)}>{p}</button>;})}
          </div>
        </div>}

        {(typeCfg.cat==="solo1"||typeCfg.cat==="solo2")&&<div style={s.card()}>
          <div style={s.sec}>Solist</div>
          <div style={{display:"flex",gap:6,marginBottom:(typeCfg.hasFarbe||typeCfg.hasTout)?12:0}}>
            {activePlayers.map((p)=>{const i=players.indexOf(p);return <button key={p} style={s.pBtn(form.solist===p,PCOLORS[i])} onClick={()=>upd("solist",form.solist===p?null:p)}>{p}</button>;})}
          </div>
          {(typeCfg.hasFarbe||typeCfg.hasTout)&&<div style={{display:"flex",gap:8}}>
            {typeCfg.hasFarbe&&<button style={{...s.btn(form.mitFarbe,"#a080e0"),flex:1}} onClick={()=>upd("mitFarbe",!form.mitFarbe)}>Mit Farbe {form.mitFarbe?"✓":""}</button>}
            {typeCfg.hasTout&&<button style={{...s.btn(form.tout,"#ff8c42"),flex:1}} onClick={()=>upd("tout",!form.tout)}>Tout (×2) {form.tout?"✓":""}</button>}
          </div>}
        </div>}

        {typeCfg.cat==="ramsch"&&<div style={s.card()}>
          <div style={s.sec}>Verlierer (meiste Augen)</div>
          {forcedPflichtramsch&&<div style={{fontSize:11,color:"#a080e0",marginBottom:10,fontWeight:"bold"}}>Pflichtramsch !!! Andere Spiele sind gesperrt.</div>}
          <div style={{display:"flex",gap:6,marginBottom:16}}>
            {activePlayers.map((p)=>{const i=players.indexOf(p);return <button key={p} style={s.pBtn(form.verlierer===p,PCOLORS[i])} onClick={()=>upd("verlierer",form.verlierer===p?null:p)}>{p}</button>;})}
          </div>
          <div style={{marginBottom:14}}><Stepper label="Jungfrauen" value={form.jungfrauen} max={3} onChange={v=>upd("jungfrauen",v)} color="#e85d4a" hint={form.jungfrauen>0?`Faktor ×${Math.pow(2,form.jungfrauen)}`:undefined}/></div>
          <div style={{display:"flex",gap:8}}>
            <button style={{...s.btn(form.durchmarsch,"#7de87a"),flex:1}} onClick={()=>upd("durchmarsch",!form.durchmarsch)}>Durchmarsch {form.durchmarsch?"✓":""}</button>
            <button style={{...s.btn(forcedPflichtramsch||form.pflichtramsch,"#a080e0"),flex:1,opacity:forcedPflichtramsch?0.7:1}} onClick={()=>{if(!forcedPflichtramsch)upd("pflichtramsch",!form.pflichtramsch);}}>{forcedPflichtramsch?"Pflichtramsch !!!":`Pflichtramsch ${form.pflichtramsch?"✓":""}`}</button>
          </div>
        </div>}

        {typeCfg.cat!=="ramsch"&&!form.tout&&<ErgebnisBlock form={form} upd={upd} typeCfg={typeCfg}/>}
        {typeCfg.cat!=="ramsch"&&form.tout&&<div style={s.card()}>
          <div style={s.sec}>Ergebnis</div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button style={{...s.btn(form.gewonnen,"#7de87a"),flex:1,fontSize:14,padding:10}} onClick={()=>upd("gewonnen",true)}>✓ Gewonnen</button>
            <button style={{...s.btn(!form.gewonnen,"#e85d4a"),flex:1,fontSize:14,padding:10}} onClick={()=>upd("gewonnen",false)}>✗ Verloren</button>
          </div>
          {typeCfg.hasLaufende&&<Stepper label="Laufende" value={form.laufende} max={8} onChange={v=>upd("laufende",v)}
            hint={form.laufende>=(typeCfg.laufendeFrom||3)?`→ +${form.laufende} × S&L (×2)`:`Zählt ab ${typeCfg.laufendeFrom||3}`}/>}
          <div style={{fontSize:10,color:C.dim,marginTop:8}}>Tout: Schneider & Schwarz werden nicht gerechnet</div>
        </div>}

        <div style={s.card()}>
          <div style={s.sec}>Sticht (Kontra / Re)</div>
          <Stepper label={["–","Sticht","Re-Sticht","×8","×16"][form.sticht]||`×${Math.pow(2,form.sticht)}`} value={form.sticht} max={4} onChange={v=>upd("sticht",v)} color="#d080e0" hint={form.sticht>0?`Faktor ×${Math.pow(2,form.sticht)}`:undefined}/>
        </div>

        {preview&&<div style={{background:C.successBg,border:"1px solid #2a5a2a",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
          <div style={{...s.sec,color:"#3a8a3a"}}>
            Vorschau · {b}{sm>1?` × ${sm}`:""}{jm>1?` × ${jm}`:""} = <strong style={{color:"#7de87a"}}>{b*sm*jm} Chips</strong>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {players.map((p,i)=>{const delta=preview[p];return <div key={p} style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:PCOLORS[i]}}>{p}</div>
              <div style={{fontSize:20,fontWeight:"bold",color:delta>0?"#7de87a":delta<0?"#e85d4a":aussetzer===p?"#a080e0":C.zero}}>{aussetzer===p?"out":delta>0?`+${delta}`:delta}</div>
              <div style={{fontSize:10,color:"#2a5a2a"}}>{konten[p]+delta}</div>
            </div>;})}
          </div>
        </div>}

        <div style={{display:"flex",gap:8}}>
          <button onClick={onBack} style={{...s.btn(false,"#5a5a8a"),padding:"12px 16px"}}>← Zurück</button>
          <button onClick={onSave} disabled={!preview}
            style={{flex:1,padding:14,fontFamily:"'Courier New',monospace",fontWeight:"bold",fontSize:14,
              background:preview?C.successBg:C.bg1,border:`1px solid ${preview?"#4a9a4a":C.border}`,
              color:preview?"#2f8a37":C.mute,borderRadius:8,cursor:preview?"pointer":"default"}}>
            {isEdit?"💾 Speichern":`✓ Runde ${roundNr} eintragen`}
          </button>
        </div>
      </>;
    }

    // ── Export-Funktion ──────────────────────────────────────────
