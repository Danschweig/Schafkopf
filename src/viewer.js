    function getSharedData() {
      const hash = window.location.hash;
      try {
        if (hash.startsWith('#v1=')) {
          if (!window.LZString?.decompressFromEncodedURIComponent) return null;
          const compressed = hash.slice(4);
          const json = LZString.decompressFromEncodedURIComponent(compressed);
          return JSON.parse(json);
        }
        if (hash.startsWith('#json=')) {
          return JSON.parse(decodeURIComponent(hash.slice(6)));
        }
        return null;
      } catch { return null; }
    }

    function ViewerApp({data}) {
      const {players, rounds, startkapital, tariff, gameTypes:gTypes, exportDate} = data;
      const gt = gTypes || DEFAULT_GAME_TYPES;
      const allTypes = [...gt, {id:"farbwenz",label:"Farbwenz",cat:"solo2"},{id:"farbgeier",label:"Farbgeier",cat:"solo1"}];

      const konten = Object.fromEntries(players.map(p=>[p,startkapital]));
      rounds.forEach(r=>players.map(p=>konten[p]+=(r.deltas[p]||0)));
      const standings = players.map((p,i)=>({name:p,color:PCOLORS[i],value:konten[p],diff:konten[p]-startkapital})).sort((a,b)=>b.value-a.value);

      function importAndOpen() {
        try { localStorage.setItem(LS_KEY, JSON.stringify({
          players,rounds,startkapital,tariff,gameTypes:gt,
          forcePflichtramsch:data.forcePflichtramsch||false,
          forcePflichtramschChance:Math.max(1,Number(data.forcePflichtramschChance)||20),
          bockMode:data.bockMode||false,
          bockAllowSolo:data.bockAllowSolo!==false,
          bockAllowWenz:data.bockAllowWenz!==false,
          bockAllowGeier:data.bockAllowGeier!==false,
          bockAllowRamsch:data.bockAllowRamsch!==false,
          nextRoundBock:data.nextRoundBock||false
        })); } catch{}
        window.location.href = window.location.href.split('#')[0];
      }

      return <div style={{...s.page, paddingBottom:80}}>
        <div style={{background:"#080f08",borderBottom:`1px solid ${C.border}`,padding:"14px 16px",textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:"bold",color:"#ffffff",marginBottom:6}}>Schafkopf · {exportDate||""}</div>
          <div style={{fontSize:12,color:"#ffffff"}}>S&L {tariff.sl} · Sauspiel {tariff.sauspiel} · Solo {tariff.solo} Chips · {rounds.length} Runden</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,padding:"12px 16px 0"}}>
          {standings.map((p,i)=><div key={p.name} style={{background:`${p.color}12`,border:`1px solid ${p.color}44`,borderRadius:8,padding:"8px 4px",textAlign:"center"}}>
            <div style={{fontSize:9,color:p.color}}>#{i+1} {p.name}</div>
            <div style={{fontSize:16,fontWeight:"bold",color:"#eeeedd"}}>{p.value.toLocaleString("de-DE")}</div>
            <div style={{fontSize:10,color:p.diff>=0?"#7de87a":"#e85d4a"}}>{p.diff>=0?"+":""}{p.diff}</div>
          </div>)}
        </div>
        <div style={{padding:"14px 16px"}}>
          <ChartTab rounds={rounds} players={players} startkapital={startkapital} gameTypes={gt}/>
        </div>
        <div style={{padding:"0 16px 16px"}}>
          <button onClick={importAndOpen}
            style={{...s.btn(false,"#7de87a"),width:"100%",padding:12,fontSize:13}}>
            ↓ In Tracker importieren
          </button>
        </div>
      </div>;
    }

    // ── Root render ──────────────────────────────────────────────
    const sharedData = getSharedData();
