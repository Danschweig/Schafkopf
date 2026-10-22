    const formatDealScore=(value,digits=1,maxDigits=digits)=>value==null?"–":value.toLocaleString("de-DE",{minimumFractionDigits:digits,maximumFractionDigits:maxDigits});
    const dealScoreColor=score=>score>=8?"#7de87a":score>=5?"#f5c842":"#e85d4a";
    function ratingMethodLabel(meta){
      if(!meta||meta.algorithmVersion==="legacy")return "Manuell · Altbestand";
      return `${meta.method==="automatic"?"Automatisch":"Manuell"} · ${meta.algorithmVersion}`;
    }

    function HandRatingEditor({player,deal,onSave,gameTypes}){
      const savedMeta=deal.ratingMeta?.[player];
      const savedScore=deal.ratings?.[player];
      const [method,setMethod]=useState(savedMeta?.method==="automatic"?"automatic":"manual");
      const [manual,setManual]=useState(savedMeta?.method!=="automatic"?savedScore:null);
      const [cards,setCards]=useState([]);
      const [scanning,setScanning]=useState(false);
      const [rules,setRules]=useState(()=>savedMeta?.rules?.deck==="long"?{...savedMeta.rules}:{
        deck:"long",hochzeit:gameTypes.some(type=>type.id==="hochzeit"),wenz:gameTypes.some(type=>type.id==="wenz")
      });
      const [notice,setNotice]=useState("");
      const evaluation=useMemo(()=>cards.length===8?window.SchafkopfHandEvaluation.evaluateHand(cards,rules):null,[cards,rules]);
      const complete=!scanning&&(method==="manual"?window.SchafkopfDealRatings.validScore(manual):!!evaluation);
      function toggleCard(id){
        setCards(current=>current.includes(id)?current.filter(card=>card!==id):current.length<8?[...current,id]:current);
        setNotice("");
      }
      function confirm(){
        if(!complete)return;
        const score=method==="automatic"?evaluation.score:manual;
        const meta=method==="automatic"?{method,algorithmVersion:evaluation.algorithmVersion,rules:evaluation.rules}
          :{method,algorithmVersion:"manual-v1",rules:null};
        try{
          onSave(deal.id,player,score,meta);
          setNotice(`Bestätigt: ${formatDealScore(score)} / 10. Ein vorheriger Wert wird ersetzt.`);
        }catch(error){setNotice(error.message);}
      }
      function breakdown(label,candidate){
        return <div style={{marginTop:8}}>
          <strong>{label}: {formatDealScore(candidate.value,1,2)} (vor Begrenzung)</strong>
          <div>Grundwert: {formatDealScore(candidate.base)}</div>
          {candidate.bonuses.map(bonus=><div key={bonus.code}>{bonus.label}: +{formatDealScore(bonus.value,0,2)}</div>)}
          {candidate.bonuses.length===0&&<div>Keine Zuschläge</div>}
        </div>;
      }
      return <div style={{...s.card(),marginTop:12}}>
        <div style={s.sec}>Kartenbewertung für {player}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
          <button aria-pressed={method==="manual"} onClick={()=>{setMethod("manual");setScanning(false);setNotice("");}} style={s.btn(method==="manual","#4ab8e8")}>Manuell bewerten</button>
          <button aria-pressed={method==="automatic"} onClick={()=>{setMethod("automatic");setNotice("");}} style={s.btn(method==="automatic","#4ab8e8")}>Karten auswählen</button>
        </div>
        {method==="manual"?<div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:5}}>
          {Array.from({length:10},(_,index)=>index+1).map(score=><button key={score}
            aria-label={`${player}: ${score} von 10`} aria-pressed={manual===score}
            onClick={()=>{setManual(score);setNotice("");}}
            style={{...s.btn(manual===score,dealScoreColor(score)),minHeight:44,padding:"8px 0"}}>{score}</button>)}
        </div>:<>
          <div style={{fontSize:11,color:C.text,lineHeight:1.5,marginBottom:10}}>
            Langes Blatt: 8 aus 32 Karten. Wähle deine Hand vor Spielansage und Kartentausch.
            Feste Heuristik für Sauspiel/Hochzeit und optional Wenz; keine Gewinnwahrscheinlichkeit und keine eigene Solo- oder Geierbewertung.
          </div>
          <PhotoCardScanner onScanStart={()=>{setCards([]);setNotice("");}} onCards={ids=>{setCards(ids);setNotice("");}} onBusyChange={setScanning}/>
          <div style={{display:"grid",gap:6}}>
            {[["hochzeit","Hochzeit berücksichtigen"],["wenz","Wenz berücksichtigen"]].map(([key,label])=><button key={key}
              role="switch" aria-checked={rules[key]} onClick={()=>{setRules(current=>({...current,[key]:!current[key]}));setNotice("");}}
              style={{...s.btn(rules[key],"#4ab8e8"),minHeight:44,textAlign:"left"}}>{label}: {rules[key]?"an":"aus"}</button>)}
          </div>
          <div style={{fontSize:10,color:C.dim,margin:"6px 0 10px",lineHeight:1.4}}>Voreinstellung aus den vorhandenen Spielarten; für diese Hand anpassbar. Für kurzes Blatt bitte manuell bewerten.</div>
          <div role="status" aria-live="polite" style={{fontSize:13,fontWeight:"bold",color:C.title,marginBottom:10}}>{cards.length} von 8 Karten</div>
          {window.SchafkopfHandEvaluation.SUITS.map(suit=><fieldset key={suit.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:8,marginBottom:8,minWidth:0}}>
            <legend style={{fontSize:12,color:suit.id==="herz"?"#e85d4a":C.title,padding:"0 5px"}}>{suit.symbol} {suit.label}</legend>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:5}}>
              {window.SchafkopfHandEvaluation.CARDS.filter(card=>card.suit===suit.id).map(card=>{
                const selected=cards.includes(card.id);
                const disabled=scanning||(!selected&&cards.length>=8);
                return <button key={card.id} type="button" aria-label={card.label} aria-pressed={selected} disabled={disabled}
                  title={card.label} onClick={()=>toggleCard(card.id)}
                  style={{...s.btn(selected,"#4ab8e8"),minHeight:46,padding:"8px 0",fontWeight:"bold",fontSize:13,opacity:disabled?0.4:1,borderWidth:selected?2:1}}>
                  {selected?"✓ ":""}{card.short}
                </button>;
              })}
            </div>
          </fieldset>)}
          <button disabled={scanning||cards.length===0} onClick={()=>{setCards([]);setNotice("");}} style={{...s.btn(false),marginBottom:10}}>Auswahl leeren</button>
          {evaluation&&<div aria-live="polite" style={s.card("#4ab8e855",C.bg2)}>
            <div style={{fontSize:22,fontWeight:"bold",color:dealScoreColor(evaluation.score)}}>{formatDealScore(evaluation.score)} / 10</div>
            <div style={{fontSize:11,lineHeight:1.5,marginTop:6}}>
              {evaluation.normal.trumpCount} Trümpfe im Sauspiel. {evaluation.winningCandidate==="wenz"?"Der Wenz-Kandidat ist höher.":"Die normale Bewertung ist ausschlaggebend (bei Gleichstand ebenfalls)."}
              {evaluation.normal.hochzeitExchange&&" Ein Trumpf: Hochzeit-Grundwert ohne Trumpfqualitätsbonus, da der Trumpf abgegeben wird. Annahme und Sieg sind offen."}
            </div>
            <details style={{fontSize:11,lineHeight:1.5,marginTop:8}}>
              <summary style={{cursor:"pointer"}}>Berechnung ansehen · {evaluation.algorithmVersion}</summary>
              {breakdown("Sauspiel/Hochzeit",evaluation.normal)}
              {evaluation.wenz?breakdown("Wenz",evaluation.wenz):<div style={{marginTop:8}}>Kein Wenz-Kandidat: {rules.wenz?"weniger als 2 Unter":"Regel deaktiviert"}.</div>}
              <div style={{marginTop:8}}>Der höhere Kandidat wird auf 1–10 begrenzt und erst dann auf eine Nachkommastelle gerundet.</div>
            </details>
          </div>}
          <div style={{fontSize:10,color:C.dim,lineHeight:1.4}}>Deine Karten bleiben auf diesem Gerät. Nur der bestätigte Wert und seine Bewertungsmethode und Regeln werden gespeichert.</div>
        </>}
        <button disabled={!complete} onClick={confirm} style={{...s.btn(complete,"#7de87a"),width:"100%",padding:12,marginTop:12,opacity:complete?1:0.45}}>
          {savedScore!=null?"Bewertung bestätigen und ersetzen":"Bewertung bestätigen und speichern"}
        </button>
        {notice&&<div role="status" style={{fontSize:11,color:C.text,lineHeight:1.5,marginTop:8}}>{notice}</div>}
      </div>;
    }

    function DealRatingsView({players,dealRatings,gameTypes,onStart,onSave,onUndo}){
      const [newDealer,setNewDealer]=useState(null);
      const [selectedId,setSelectedId]=useState(()=>dealRatings[dealRatings.length-1]?.id||"");
      const [player,setPlayer]=useState("");
      const deal=dealRatings.find(entry=>entry.id===selectedId);
      const raters=deal?players.filter(name=>name!==deal.dealer):[];
      const stats=useMemo(()=>window.SchafkopfDealRatings.dealerStats(players,dealRatings),[players,dealRatings]);
      const countedDeals=dealRatings.filter(entry=>Object.keys(entry.ratings||{}).length>0).length;
      useEffect(()=>{
        if(!dealRatings.some(entry=>entry.id===selectedId))setSelectedId(dealRatings[dealRatings.length-1]?.id||"");
      },[dealRatings,selectedId]);
      useEffect(()=>{
        if(!raters.includes(player))setPlayer("");
        if(!players.includes(newDealer))setNewDealer(null);
      },[players,deal?.dealer,player,newDealer]);
      function start(){
        if(!newDealer)return;
        const id=onStart(newDealer);
        if(id){setSelectedId(id);setPlayer("");setNewDealer(null);}
      }
      return <>
        <div style={s.card("#4ab8e855",C.bg1)}>
          <div style={s.sec}>Austeilung bewerten</div>
          <div style={{fontSize:11,color:C.text,lineHeight:1.5,marginBottom:10}}>
            Pro Austeilung und Spieler zählt genau eine bestätigte Bewertung. Auf mehreren Geräten dieselbe Austeilung auswählen. Sie wird wie bisher unabhängig vom Spielprotokoll erfasst.
          </div>
          <label style={{fontSize:11,color:C.dim}}>Austeilung auswählen
            <select aria-label="Austeilung auswählen" style={{...s.input,marginTop:5}} value={deal?selectedId:""} onChange={event=>{setSelectedId(event.target.value);setPlayer("");}}>
              <option value="" disabled>Noch keine Austeilung</option>
              {dealRatings.map((entry,index)=><option key={entry.id} value={entry.id}>Austeilung {index+1} · {entry.dealer} · {Object.keys(entry.ratings||{}).length} bewertet</option>)}
            </select>
          </label>
          {deal&&<>
            <div style={{fontSize:10,color:C.dim,margin:"8px 0",overflowWrap:"anywhere"}}>Runden-ID der Austeilung: {deal.roundId||deal.id}</div>
            <div style={{display:"grid",gap:6}}>
              {raters.map(name=><button key={name} aria-pressed={player===name} onClick={()=>setPlayer(name)}
                style={{...s.btn(player===name,PCOLORS[players.indexOf(name)]),textAlign:"left",minHeight:48}}>
                <span style={{fontWeight:"bold"}}>{name}</span>
                <span style={{display:"block",fontSize:10,marginTop:4}}>{deal.ratings?.[name]!=null?`${formatDealScore(deal.ratings[name])} / 10 · ${ratingMethodLabel(deal.ratingMeta?.[name])}`:"Noch nicht bestätigt"}</span>
                {deal.ratingMeta?.[name]?.rules&&<span style={{display:"block",fontSize:10,marginTop:4}}>Langes Blatt · Hochzeit {deal.ratingMeta[name].rules.hochzeit?"an":"aus"} · Wenz {deal.ratingMeta[name].rules.wenz?"an":"aus"}</span>}
              </button>)}
            </div>
            {player&&raters.includes(player)&&<HandRatingEditor key={`${deal.id}:${player}`} player={player} deal={deal} onSave={onSave} gameTypes={gameTypes}/>}
          </>}
        </div>

        <div style={s.card()}>
          <div style={s.sec}>Neue Austeilung</div>
          <div style={{fontSize:11,color:C.dim,lineHeight:1.5,marginBottom:8}}>Einmal pro Tisch anlegen, dann auf allen Geräten auswählen. Wer hat ausgeteilt?</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:6}}>
            {players.map((name,index)=><button key={name} title={name} aria-pressed={newDealer===name} onClick={()=>setNewDealer(name)}
              style={{...s.pBtn(newDealer===name,PCOLORS[index]),overflowWrap:"anywhere",minHeight:44}}>{name}</button>)}
          </div>
          <button disabled={!newDealer} onClick={start} style={{...s.btn(!!newDealer,"#4ab8e8"),width:"100%",marginTop:10,opacity:newDealer?1:0.45}}>Neue Austeilung anlegen</button>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,margin:"18px 0 9px"}}>
          <div style={{...s.sec,marginBottom:0}}>Austeil-Statistik</div>
          <div style={{fontSize:9,color:C.mute}}>{countedDeals} bewertete Austeilungen</div>
        </div>
        <div style={{fontSize:10,color:C.dim,lineHeight:1.5,marginBottom:10}}>Wie bisher: Durchschnitt aller Einzelbewertungen, über alle Methoden und Versionen. Die Zahl in Klammern nennt die Anzahl der Bewertungen.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(250px,100%),1fr))",gap:10}}>
          {players.map((dealerName,index)=>{const dealerStats=stats[dealerName];return <div key={dealerName} style={{...s.card(PCOLORS[index]+"55",PCOLORS[index]+"0d"),marginBottom:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:10}}>
              <div><div style={{fontSize:13,fontWeight:"bold",color:PCOLORS[index]}}>{dealerName}</div>
                <div style={{fontSize:9,color:C.dim,marginTop:2}}>{dealerStats.deals}x bewertet ausgeteilt</div></div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:8,color:C.dim,textTransform:"uppercase",letterSpacing:1}}>Gesamt</div>
                <div style={{fontSize:22,fontWeight:"bold",color:dealerStats.average==null?C.mute:dealScoreColor(dealerStats.average)}}>
                  {formatDealScore(dealerStats.average)} <span style={{fontSize:11,color:C.dim}}>({dealerStats.count})</span>
                </div>
              </div>
            </div>
            <div style={{display:"grid",gap:7}}>
              {players.filter(name=>name!==dealerName).map(name=>{const row=dealerStats.byPlayer[name];return <div key={name}>
                <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,fontSize:10,marginBottom:3}}>
                  <span style={{color:PCOLORS[players.indexOf(name)],overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
                  <span style={{color:row.average==null?C.mute:dealScoreColor(row.average),fontWeight:"bold"}}>{formatDealScore(row.average)} <span style={{fontWeight:"normal",color:C.mute}}>({row.count})</span></span>
                </div>
                <div style={{height:4,background:C.border,borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:row.average==null?"0%":`${row.average*10}%`,background:dealScoreColor(row.average||1),borderRadius:3}}/>
                </div>
              </div>;})}
            </div>
          </div>;})}
        </div>
        {dealRatings.length>0&&<button onClick={()=>{if(window.confirm("Letzte Austeilung mit allen zugehörigen Bewertungen entfernen?"))onUndo();}} style={{...s.btn(false,"#e85d4a"),width:"100%",padding:10,marginTop:12}}>Letzte Austeilung rückgängig</button>}
      </>;
    }
