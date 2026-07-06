    function HomeView({
      rounds,roundSummary,konten,players,tariff,
      showCardPenalties,setShowCardPenalties,yellowCards,
      addYellowCard,addRedCard,clearPlayerCards,
      forcedRamschActive,bockActive,visiblePlayTabs,uiPlayTab,setPlayTab,
      activePlayTab,gameTypes,isBockAllowedType,startRound,undoLastRound,
      fivePlayerMode,aussetzenStep,setAussetzenStep,aussetzer,setAussetzer,
      spatzenAussetzer,setSpatzenAussetzer
    }){
      if(aussetzenStep===1)return <AussetzenPlayerStep players={players} aussetzer={aussetzer} setAussetzer={setAussetzer} setAussetzenStep={setAussetzenStep} setSpatzenAussetzer={setSpatzenAussetzer} fivePlayerMode={fivePlayerMode}/>;
      if(aussetzenStep===2)return <AussetzenTypeStep
        players={players} aussetzer={aussetzer} spatzenAussetzer={spatzenAussetzer} forcedRamschActive={forcedRamschActive}
        bockActive={bockActive} gameTypes={gameTypes} isBockAllowedType={isBockAllowedType}
        startRound={startRound} setAussetzenStep={setAussetzenStep} setSpatzenAussetzer={setSpatzenAussetzer} fivePlayerMode={fivePlayerMode}/>;
      if(aussetzenStep===3)return <SpatzenPlayerStep
        players={players} aussetzer={aussetzer} spatzenAussetzer={spatzenAussetzer}
        setSpatzenAussetzer={setSpatzenAussetzer} setAussetzenStep={setAussetzenStep}
        fivePlayerMode={fivePlayerMode}/>;

      return <>
        {rounds.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
          <div style={s.card()}><div style={{fontSize:9,color:C.dim}}>Letzte Runde</div><div style={{fontSize:14,fontWeight:"bold"}}>{rounds[rounds.length-1].name||`Runde ${rounds[rounds.length-1].runde}`}</div></div>
          <div style={s.card()}><div style={{fontSize:9,color:C.dim}}>Aktuelle Fuehrung</div><div style={{fontSize:14,fontWeight:"bold"}}>{Object.entries(konten).sort((a,b)=>b[1]-a[1])[0][0]}</div></div>
          <div style={s.card()}><div style={{fontSize:9,color:C.dim}}>Gesamtvolumen</div><div style={{fontSize:14,fontWeight:"bold"}}>{roundSummary?roundSummary.volume.toLocaleString("de-DE"):"0"} Chips</div></div>
        </div>}

        <CardPenaltyPanel
          players={players} tariff={tariff} yellowCards={yellowCards}
          showCardPenalties={showCardPenalties} setShowCardPenalties={setShowCardPenalties}
          addYellowCard={addYellowCard} addRedCard={addRedCard} clearPlayerCards={clearPlayerCards}/>

        {(forcedRamschActive||bockActive)&&<ForcedRoundNotice forcedRamschActive={forcedRamschActive}/>}

        {!fivePlayerMode&&<div style={{...s.card("#a080e044",C.purpleBg),marginBottom:10}}>
          <div style={{fontSize:10,color:"#a080e0",fontWeight:"bold",marginBottom:6}}>6+ SPATZ AUF DER HAND</div>
          <div style={{fontSize:11,color:C.dim,marginBottom:10}}>
            Der Spieler mit 6 oder mehr Spatz setzt aus; die anderen 3 spielen als 2vs1.
          </div>
          <button onClick={()=>setAussetzenStep(3)} style={{...s.btn(false,"#a080e0"),width:"100%",padding:11}}>
            Aussetzen wegen 6+ Spatz
          </button>
        </div>}

        {fivePlayerMode&&<div style={{...s.card("#a080e044",C.purpleBg),marginBottom:10}}>
          <div style={{fontSize:10,color:"#a080e0",fontWeight:"bold",marginBottom:6}}>5-SPIELER-MODUS</div>
          <div style={{fontSize:11,color:C.dim,marginBottom:10}}>
            Vor jeder Runde muss ein Spieler aussetzen. Aktuell: <strong style={{color:aussetzer?"#a080e0":C.mute}}>{aussetzer||"noch keiner gewaehlt"}</strong>
          </div>
          <button onClick={()=>setAussetzenStep(1)} style={{...s.btn(!!aussetzer,"#a080e0"),width:"100%",padding:10}}>
            {aussetzer?"Aussetzer aendern":"Aussetzer waehlen"}
          </button>
        </div>}

        <div style={{display:"grid",gridTemplateColumns:`repeat(${visiblePlayTabs.length},1fr)`,gap:6,marginBottom:12}}>
          {visiblePlayTabs.map(tab=><button key={tab.id} onClick={()=>setPlayTab(tab.id)}
            style={{...s.subTab(uiPlayTab===tab.id),padding:"9px 4px",fontSize:10,color:uiPlayTab===tab.id?tab.color:C.dim,borderColor:uiPlayTab===tab.id?tab.color:C.border}}>
            {tab.label}
          </button>)}
        </div>

        {uiPlayTab!=="aussetzen"
          ?<GameTypeGrid gameTypes={gameTypes} activePlayTab={activePlayTab} isBockAllowedType={isBockAllowedType} startRound={startRound}/>
          :<div style={{...s.card("#a080e044",C.purpleBg),marginBottom:10}}>
            <div style={{fontSize:10,color:"#a080e0",fontWeight:"bold",marginBottom:6}}>AUSSETZEN</div>
            <div style={{fontSize:11,color:C.dim,marginBottom:10}}>Ein Spieler hat 6 oder mehr Spatz - die anderen 3 spielen.</div>
            <button onClick={()=>setAussetzenStep(3)} style={{...s.btn(false,"#a080e0"),width:"100%",padding:11}}>Aussetzen wegen 6+ Spatz</button>
          </div>}

        {rounds.length>0&&<button onClick={undoLastRound} style={{...s.btn(false,"#9a5a5a"),width:"100%",padding:10,marginTop:4}}>Letzte Runde rueckgaengig</button>}
      </>;
    }

    function CardPenaltyPanel({players,tariff,yellowCards,showCardPenalties,setShowCardPenalties,addYellowCard,addRedCard,clearPlayerCards}){
      return <div style={{...s.card("#d8a92855",C.mode==="light"?"#fff8df":"#1f1a0f"),padding:"9px 10px"}}>
        <button
          onClick={()=>setShowCardPenalties(v=>!v)}
          style={{width:"100%",background:"transparent",border:"none",padding:0,cursor:"pointer",textAlign:"left"}}
          aria-expanded={showCardPenalties}
          aria-label="Kartenstrafen ein- oder ausklappen"
        >
          <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
              <div style={s.sec}>Kartenstrafen</div>
              <div style={{fontSize:11,color:C.dim}}>{showCardPenalties?"v":">"}</div>
            </div>
            <div style={{fontSize:9,color:C.dim}}>Rot: {tariff.sauspiel} an jeden</div>
          </div>
        </button>
        {showCardPenalties&&<div style={{marginTop:7,display:"grid",gap:5}}>
          {players.map((p,i)=>{const y=yellowCards[p]||0;return <div key={p} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,alignItems:"center",background:C.bg1,border:`1px solid ${y?"#d8a928":C.border}`,borderRadius:7,padding:"6px 7px"}}>
            <div style={{minWidth:0,display:"flex",alignItems:"center",gap:6}}>
              <div style={{fontSize:11,fontWeight:"bold",color:PCOLORS[i],overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p}</div>
              <div style={{fontSize:9,color:y?"#1f1f12":C.mute,background:y?"#d8a928":"transparent",border:`1px solid ${y?"#d8a928":C.border}`,borderRadius:10,padding:"1px 6px",fontWeight:"bold",flexShrink:0}}>{y?"G":"0"}</div>
            </div>
            <div style={{display:"flex",gap:4}}>
              <button aria-label={`${p} gelbe Karte`} title={y?"Gelb-Rot":"Gelb"} onClick={()=>addYellowCard(p)} style={{...s.btn(false,"#d8a928"),padding:"4px 7px",fontSize:10,minWidth:34}}>{y?"G/R":"G"}</button>
              <button aria-label={`${p} rote Karte`} title="Rot" onClick={()=>addRedCard(p)} style={{...s.btn(false,"#e85d4a"),padding:"4px 7px",fontSize:10,minWidth:28}}>R</button>
              {y>0&&<button aria-label={`${p} gelbe Karte zuruecksetzen`} title="Zuruecksetzen" onClick={()=>clearPlayerCards(p)} style={{...s.btn(false,"#8a8a8a"),padding:"4px 7px",fontSize:10,minWidth:28}}>x</button>}
            </div>
          </div>;})}
        </div>}
      </div>;
    }

    function ForcedRoundNotice({forcedRamschActive}){
      return <div style={{...s.card(forcedRamschActive?"#a080e044":"#6aa86a44",forcedRamschActive?C.purpleBg:"#edf5e7"),marginBottom:10,padding:"10px 12px"}}>
        <div style={{fontSize:10,color:forcedRamschActive?"#a080e0":"#2e5b36",fontWeight:"bold",marginBottom:4}}>{forcedRamschActive?"Pflichtramsch !!!":"Bock !!!"}</div>
        <div style={{fontSize:11,color:C.dim}}>
          {forcedRamschActive
            ?"Diese Runde ist fest auf Ramsch gesetzt. Andere Spiele sind in dieser Runde nicht verfuegbar."
            :"Die naechste Runde ist eine Bock-Runde. Erlaubt sind nur die aktivierten Bock-Spielarten."}
        </div>
      </div>;
    }

    function GameTypeGrid({gameTypes,activePlayTab,isBockAllowedType,startRound}){
      return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        {gameTypes.filter(t=>activePlayTab.cats.includes(t.cat)&&isBockAllowedType(t)).map(t=>{const typeColor=TYPE_CATS[t.cat]?.color||activePlayTab.color;return <div key={t.id}
          onClick={()=>startRound(t.id)}
          style={{background:typeColor+"0e",border:`1px solid ${typeColor}33`,borderRadius:8,padding:"10px",cursor:"pointer",minHeight:72}}>
          <div style={{fontSize:15,fontWeight:"bold",color:typeColor,marginBottom:3}}>{t.label}</div>
          <div style={{fontSize:10,lineHeight:1.25,color:C.dim}}>{t.desc}</div>
        </div>;})}
      </div>;
    }

    function AussetzenPlayerStep({players,aussetzer,setAussetzer,setAussetzenStep,setSpatzenAussetzer,fivePlayerMode}){
      return <div style={s.card("#a080e044",C.purpleBg)}>
        <div style={s.sec}>{fivePlayerMode?"Wer sitzt diese Runde aus?":"Wer sitzt aus? (6+ Spatz, kein Trumpf)"}</div>
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {players.map((p,i)=><button key={p}
            style={s.pBtn(aussetzer===p,"#a080e0")}
            onClick={()=>{setAussetzer(aussetzer===p?null:p);setSpatzenAussetzer(s=>s===p?null:s);}}>{p}</button>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setAussetzer(null);setAussetzenStep(0);}} style={{...s.btn(false,"#5a5a8a"),padding:"10px 14px"}}>Zurueck</button>
          <button onClick={()=>aussetzer&&setAussetzenStep(2)} disabled={!aussetzer}
            style={{...s.btn(!!aussetzer,"#a080e0"),flex:1,padding:10}}>
            Weiter: Spieltyp waehlen
          </button>
        </div>
      </div>;
    }

    function SpatzenPlayerStep({players,aussetzer,spatzenAussetzer,setSpatzenAussetzer,setAussetzenStep,fivePlayerMode}){
      const candidates=players.filter(p=>p!==aussetzer);
      return <div style={s.card("#a080e044",C.purpleBg)}>
        <div style={s.sec}>Wer hat 6+ Spatz?</div>
        {fivePlayerMode&&aussetzer&&<div style={{fontSize:11,color:C.dim,marginBottom:10}}>
          {aussetzer} sitzt bereits regulaer aus. Waehle einen der 4 aktiven Spieler fuer 6+ Spatz.
        </div>}
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {candidates.map((p)=><button key={p}
            style={s.pBtn(spatzenAussetzer===p,"#a080e0")}
            onClick={()=>setSpatzenAussetzer(spatzenAussetzer===p?null:p)}>{p}</button>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setSpatzenAussetzer(null);setAussetzenStep(fivePlayerMode?2:0);}} style={{...s.btn(false,"#5a5a8a"),padding:"10px 14px"}}>Zurueck</button>
          <button onClick={()=>spatzenAussetzer&&setAussetzenStep(2)} disabled={!spatzenAussetzer}
            style={{...s.btn(!!spatzenAussetzer,"#a080e0"),flex:1,padding:10}}>
            Weiter: Spieltyp waehlen
          </button>
        </div>
      </div>;
    }

    function AussetzenTypeStep({players,aussetzer,spatzenAussetzer,forcedRamschActive,bockActive,gameTypes,isBockAllowedType,startRound,setAussetzenStep,setSpatzenAussetzer,fivePlayerMode}){
      const sections=forcedRamschActive
        ?PLAY_TYPE_SECTIONS.filter(catInfo=>catInfo.id==="ramsch")
        :bockActive
          ?PLAY_TYPE_SECTIONS.filter(catInfo=>catInfo.id==="solo"||catInfo.id==="ramsch")
          :PLAY_TYPE_SECTIONS;
      const outPlayers=[aussetzer,spatzenAussetzer].filter(Boolean);
      const activePlayers=players.filter(p=>!outPlayers.includes(p));
      return <>
        <div style={{...s.card("#a080e044",C.purpleBg),marginBottom:12}}>
          <div style={{fontSize:12,color:"#a080e0"}}>
            {outPlayers.join(" und ")} {outPlayers.length>1?"sitzen":"sitzt"} aus - {activePlayers.join(", ")} spielen
          </div>
        </div>
        {fivePlayerMode&&<div style={{...s.card("#a080e044",C.purpleBg),marginBottom:10}}>
          <div style={{fontSize:10,color:"#a080e0",fontWeight:"bold",marginBottom:6}}>6+ SPATZ AUF DER HAND</div>
          <div style={{fontSize:11,color:C.dim,marginBottom:10}}>
            Optional: Einer der 4 aktiven Spieler hat 6 oder mehr Spatz und setzt zusaetzlich aus.
          </div>
          <button onClick={()=>setAussetzenStep(3)} style={{...s.btn(!!spatzenAussetzer,"#a080e0"),width:"100%",padding:11}}>
            {spatzenAussetzer?`${spatzenAussetzer} aendern`:"Aussetzen wegen 6+ Spatz"}
          </button>
          {spatzenAussetzer&&<button onClick={()=>setSpatzenAussetzer(null)} style={{...s.btn(false,"#5a5a8a"),width:"100%",padding:9,marginTop:8}}>
            6+ Spatz-Aussetzer entfernen
          </button>}
        </div>}
        {forcedRamschActive&&<div style={{...s.card("#a080e044",C.purpleBg),marginBottom:10,padding:"10px 12px"}}>
          <div style={{fontSize:10,color:"#a080e0",fontWeight:"bold",marginBottom:4}}>Pflichtramsch !!!</div>
          <div style={{fontSize:11,color:C.dim}}>Diese Runde ist fest auf Ramsch gesetzt. Andere Spiele sind in dieser Runde nicht verfuegbar.</div>
        </div>}
        {sections.map(catInfo=><div key={catInfo.id} style={{marginBottom:14}}>
          <div style={{...s.sec,color:catInfo.color+"99"}}>{catInfo.label}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {gameTypes.filter(t=>catInfo.cats.includes(t.cat)&&(forcedRamschActive? t.cat==="ramsch":isBockAllowedType(t))).map(t=>{const typeColor=TYPE_CATS[t.cat]?.color||catInfo.color;return <div key={t.id}
              onClick={()=>startRound(t.id)}
              style={{background:typeColor+"0e",border:`1px solid ${typeColor}33`,borderRadius:10,padding:"12px",cursor:"pointer"}}>
              <div style={{fontSize:15,fontWeight:"bold",color:typeColor,marginBottom:2}}>{t.label}</div>
              <div style={{fontSize:10,color:C.dim}}>{t.desc}</div>
            </div>;})}
          </div>
        </div>)}
        <button onClick={()=>setAussetzenStep(1)} style={{...s.btn(false,"#5a5a8a"),width:"100%",padding:10}}>Zurueck</button>
      </>;
    }
