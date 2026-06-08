    function HistoryView({rounds,players,openEdit}){
      if(rounds.length===0)return <div style={{textAlign:"center",color:C.mute,padding:40}}>Noch keine Runden.</div>;

      return [...rounds].reverse().map(r=>{
        const sm=Math.pow(2,r.sticht||0);
        const jm=r.jungfrauen>0?Math.pow(2,r.jungfrauen):1;
        const catColor=TYPE_CATS[r.typeCat]?.color||"#fff";
        const et=effectiveType(r);
        return <div key={r.id||r.runde} onClick={()=>openEdit(r)} style={{...s.card(),cursor:r.cardPenalty?"default":"pointer"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,flexWrap:"wrap",gap:4}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,color:C.dim}}>Runde {r.runde}</span>
              {r.aussetzer&&<span style={{fontSize:9,color:"#a080e0",background:"#a080e022",border:"1px solid #a080e044",borderRadius:8,padding:"1px 6px"}}>{r.aussetzer} sitzt aus</span>}
              {!r.cardPenalty&&<button onClick={(e)=>{e.stopPropagation();openEdit(r);}} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.dim,borderRadius:5,padding:"4px 9px",cursor:"pointer",fontSize:11,fontFamily:"'Courier New',monospace"}}>Bearbeiten</button>}
            </div>
            <span style={{fontSize:11,color:catColor}}>
              {et.label}{r.cardPenalty&&<span> - {r.cardPlayer}</span>}{r.tout&&<span style={{color:"#ff8c42"}}> Tout</span>}
              {!r.cardPenalty&&r.typeCat!=="ramsch"&&(r.gewonnen?" - gewonnen":" - verloren")}
              {r.schneider?" - Schndr.":""}{r.schwarz?" - Schwz.":""}{r.laufende>=2&&<span> - {r.laufende} Lfd.</span>}
              {r.sticht>0&&<span style={{color:"#d080e0"}}> - Sticht x{sm}</span>}
              {r.typeCat==="ramsch"&&r.jungfrauen>0?` - ${r.jungfrauen} Jungfr.`:""}
              {r.pflichtramsch?" - Pflichtramsch":""}{r.bock?" - Bock":""}{r.durchmarsch?" - Durchm.":""}
            </span>
          </div>
          <div style={{fontSize:10,color:C.mute,marginBottom:6}}>
            {r.cardPenalty?<span><strong style={{color:"#ff8c42"}}>{r.cardPlayer}</strong> zahlt <strong style={{color:"#f5c842"}}>{r.betrag} Chips</strong> an jeden anderen Spieler.</span>:<span>Betrag: <strong style={{color:"#f5c842"}}>{r.betrag*sm*jm} Chips</strong></span>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {players.map((p,i)=>{const d=r.deltas[p]||0;return <div key={p} style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:r.aussetzer===p?"#a080e0":PCOLORS[i]}}>{p}{r.aussetzer===p?" out":""}</div>
              <div style={{fontSize:16,fontWeight:"bold",color:r.aussetzer===p?"#a080e0":d>0?"#7de87a":d<0?"#e85d4a":C.zero}}>{r.aussetzer===p?"-":d>0?`+${d}`:d}</div>
            </div>;})}
          </div>
        </div>;
      });
    }
