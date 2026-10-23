    const formatDealScore=(value,digits=1,maxDigits=digits)=>value==null?"–":value.toLocaleString("de-DE",{minimumFractionDigits:digits,maximumFractionDigits:maxDigits});
    const dealScoreColor=score=>score>=8?"#7de87a":score>=5?"#f5c842":"#e85d4a";
    function ratingMethodLabel(meta){
      if(!meta||meta.algorithmVersion==="legacy")return "Manuell · Altbestand";
      return `${meta.method==="automatic"?"Automatisch":"Manuell"} · ${meta.algorithmVersion}`;
    }
    function ratingRulesLabel(rules){
      if(!rules)return "";
      const options=window.SchafkopfHandEvaluation.GAME_OPTIONS;
      const selected=options.filter(({id})=>rules[id]||(id==="sauspiel"&&!Object.hasOwn(rules,"sauspiel"))).map(({label})=>label);
      return `Langes Blatt · ${selected.join(", ")||"keine Spielart"}`;
    }

    function HandRatingEditor({player,deal,onSave,gameTypes}){
      const savedMeta=deal.ratingMeta?.[player];
      const savedScore=deal.ratings?.[player];
      const [method,setMethod]=useState("automatic");
      const [manual,setManual]=useState(savedMeta?.method!=="automatic"?savedScore:null);
      const [cards,setCards]=useState([]);
      const [scanning,setScanning]=useState(false);
      const [rules,setRules]=useState(()=>window.SchafkopfHandEvaluation.normalizeRules({
        ...window.SchafkopfHandEvaluation.rulesForGameTypes(gameTypes),...(savedMeta?.rules?.deck==="long"?savedMeta.rules:{})
      }));
      const [notice,setNotice]=useState("");
      const [saving,setSaving]=useState(false);
      const evaluation=useMemo(()=>cards.length===8?window.SchafkopfHandEvaluation.evaluateHand(cards,rules):null,[cards,rules]);
      const complete=!scanning&&!saving&&(method==="manual"?window.SchafkopfDealRatings.validScore(manual):Number.isFinite(evaluation?.score));
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
          const finish=result=>{
            setSaving(false);
            setNotice(result?.private?`Verdeckt ${result.uploaded?"hochgeladen":"auf diesem Gerät gespeichert"}: ${formatDealScore(score)} / 10. Für andere erst nach dem Rundeneintrag sichtbar.`:`Bestätigt: ${formatDealScore(score)} / 10. Ein vorheriger Wert wird ersetzt.`);
          };
          const result=onSave(deal.id,player,score,meta);
          if(result?.then){setSaving(true);setNotice("Wird verdeckt hochgeladen …");result.then(finish,error=>{setSaving(false);setNotice(error.code==="permission-denied"?"Hochladen verweigert: Bitte die neuen Firebase-Regeln veröffentlichen und prüfen, ob dieser Spieler bereits auf einem anderen Gerät bestätigt wurde.":error.message);});}
          else finish(result);
        }catch(error){setNotice(error.message);}
      }
      function breakdown(label,candidate){
        return <div style={{marginTop:8}}>
          <strong>{label}: {formatDealScore(candidate.value,1,2)} (vor Begrenzung)</strong>
          <div>Grundwert: {formatDealScore(candidate.base)}</div>
          {candidate.bonuses.map(bonus=><div key={bonus.code}>{bonus.label}: {bonus.value<0?"−":"+"}{formatDealScore(Math.abs(bonus.value),0,2)}</div>)}
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
          <div style={{fontSize:13,color:C.text,lineHeight:1.5,marginBottom:10}}>
            Langes Blatt: 8 aus 32 Karten. Wähle deine Hand vor Spielansage und Kartentausch.
            Die Bewertung vergleicht die aktivierten Spielarten. Sie schätzt dein Handpotenzial und ist keine Gewinnwahrscheinlichkeit.
          </div>
          <PhotoCardScanner selectedCardIds={cards} onScanStart={()=>{setCards([]);setNotice("");}} onCards={ids=>{setCards(ids);setNotice("");}} onBusyChange={setScanning}/>
          <DesignSection title={<>Spielarten & Bewertungsregeln</>} legacyBare>
          <div style={{display:"grid",gap:6}}>
            {window.SchafkopfHandEvaluation.GAME_OPTIONS.map(({id,label})=><button key={id}
              role="switch" aria-checked={rules[id]} onClick={()=>{setRules(current=>window.SchafkopfHandEvaluation.toggleGame(current,id));setNotice("");}}
              style={{...s.btn(rules[id],"#4ab8e8"),minHeight:44,textAlign:"left"}}>{label} berücksichtigen: {rules[id]?"an":"aus"}</button>)}
          </div>
          <div style={{fontSize:13,lineHeight:1.5,marginTop:8}}>
            {rules.ramsch?"Ramsch: Je besser du mit deinem Blatt Augen und Stiche vermeiden kannst, desto höher die Bewertung. Alle anderen Spielarten sind abgewählt. Ein Durchmarsch wird hier nicht als Ziel bewertet.":"Der höchste Kandidat der aktivierten Spielarten zählt. Farb-Wenz und Farbsolo prüfen alle vier Trumpffarben. Ramsch wird separat und exklusiv bewertet."}
          </div>
          <div style={{fontSize:12,color:C.dim,margin:"6px 0 10px",lineHeight:1.4}}>Voreinstellung aus den vorhandenen Spielarten; für diese Hand anpassbar. Für kurzes Blatt bitte manuell bewerten.</div>
          </DesignSection>
          <div role="status" aria-live="polite" style={{fontSize:14,fontWeight:"bold",color:C.title,marginBottom:10}}>{cards.length} von 8 Karten</div>
          {window.SchafkopfHandEvaluation.SUITS.map(suit=><fieldset key={suit.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:8,marginBottom:8,minWidth:0}}>
            <legend style={{fontSize:14,color:suit.id==="herz"?"#e85d4a":C.title,padding:"0 5px"}}>{suit.symbol} {suit.label}</legend>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:5}}>
              {window.SchafkopfHandEvaluation.CARDS.filter(card=>card.suit===suit.id).map(card=>{
                const selected=cards.includes(card.id);
                const disabled=scanning||(!selected&&cards.length>=8);
                return <button key={card.id} type="button" aria-label={card.label} aria-pressed={selected} disabled={disabled}
                  title={card.label} onClick={()=>toggleCard(card.id)}
                  style={{...s.btn(selected,"#4ab8e8"),minHeight:46,padding:"8px 0",fontWeight:"bold",fontSize:14,opacity:disabled?0.4:1,borderWidth:selected?2:1}}>
                  {selected?"✓ ":""}{card.short}
                </button>;
              })}
            </div>
          </fieldset>)}
          <button disabled={scanning||cards.length===0} onClick={()=>{setCards([]);setNotice("");}} style={{...s.btn(false),marginBottom:10}}>Auswahl leeren</button>
          {evaluation&&evaluation.score===null&&<div role="status" style={{fontSize:13,lineHeight:1.5,marginBottom:10}}>Kein bewertbarer Kandidat. Bitte eine passende Spielart aktivieren. Hochzeit setzt genau einen Trumpf voraus.</div>}
          {Number.isFinite(evaluation?.score)&&<div aria-live="polite" style={s.card("#4ab8e855",C.bg2)}>
            <div style={{fontSize:22,fontWeight:"bold",color:dealScoreColor(evaluation.score)}}>{formatDealScore(evaluation.score)} / 10</div>
            <div style={{fontSize:13,lineHeight:1.5,marginTop:6}}>
              {evaluation.bestCandidate.label}: {evaluation.bestCandidate.trumpCount} Trümpfe. {rules.ramsch?"Hohe Werte bedeuten gute Voraussetzungen für Ramsch.":"Dieser Kandidat ergibt den höchsten Wert der gewählten Spielarten."}
              {evaluation.bestCandidate.hochzeitExchange&&" Ein Trumpf: Hochzeit-Grundwert ohne Trumpfqualitätsbonus, da der Trumpf abgegeben wird. Annahme und Sieg sind offen."}
            </div>
            <details style={{fontSize:13,lineHeight:1.5,marginTop:8}}>
              <summary style={{cursor:"pointer"}}>Berechnung ansehen · {evaluation.algorithmVersion}</summary>
              {evaluation.candidates.map(candidate=><div key={candidate.id}>
                {breakdown(candidate.label,candidate)}
                {candidate.alternatives&&<details style={{marginTop:6}}><summary>Alle Trumpffarben vergleichen</summary>
                  {candidate.alternatives.map(alternative=><div key={alternative.id}>{alternative.label}: {formatDealScore(alternative.value,1,2)} vor Begrenzung</div>)}
                </details>}
              </div>)}
              <div style={{marginTop:8}}>Der höchste Kandidat wird auf 1–10 begrenzt und erst dann auf eine Nachkommastelle gerundet.</div>
            </details>
          </div>}
          <div style={{fontSize:12,color:C.dim,lineHeight:1.4}}>Deine Karten bleiben auf diesem Gerät. Nur der bestätigte Wert und seine Bewertungsmethode und Regeln werden gespeichert.</div>
        </>}
        <button className={C.legacyDesign?undefined:"primary-action"} disabled={!complete} onClick={confirm} style={{...s.btn(complete,"#7de87a"),width:"100%",padding:12,marginTop:12,opacity:complete?1:0.45}}>
          {savedScore!=null?"Bewertung bestätigen und ersetzen":"Bewertung bestätigen und speichern"}
        </button>
        {notice&&<div role="status" style={{fontSize:13,color:C.text,lineHeight:1.5,marginTop:8}}>{notice}</div>}
      </div>;
    }

    function LegacyDealRatingForm({players,onSave}){
      const [dealer,setDealer]=useState(null);
      const [ratings,setRatings]=useState({});
      const [notice,setNotice]=useState("");
      useEffect(()=>{
        setDealer(current=>players.includes(current)?current:null);
        setRatings(current=>Object.fromEntries(Object.entries(current).filter(([player,score])=>players.includes(player)&&window.SchafkopfDealRatings.validScore(score))));
      },[players]);
      const raters=dealer?players.filter(player=>player!==dealer):[];
      const complete=!!dealer&&raters.length>0&&raters.every(player=>window.SchafkopfDealRatings.validScore(ratings[player]));
      function save(){
        if(!complete)return;
        try{
          onSave(dealer,Object.fromEntries(raters.map(player=>[player,ratings[player]])));
          setNotice(`Bewertung für ${dealer} gespeichert.`);
          setDealer(null);setRatings({});
        }catch(error){setNotice(error.message);}
      }
      return <div style={s.card("#4ab8e855",C.bg1)}>
        <div style={s.sec}>Neue Austeilung</div>
        <div style={{fontSize:13,color:C.dim,lineHeight:1.5,marginBottom:10}}>Wer hat ausgeteilt? Danach bewertet jeder andere Spieler seine Karten von 1 bis 10. Alle Bewertungen werden gemeinsam verdeckt gespeichert und erst mit dem nächsten Rundenergebnis zur Statistik hinzugefügt.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:6}}>
          {players.map((name,index)=><button key={name} aria-pressed={dealer===name} onClick={()=>{setDealer(name);setRatings({});setNotice("");}}
            style={{...s.pBtn(dealer===name,PCOLORS[index]),minHeight:44,overflowWrap:"anywhere"}}>{name}</button>)}
        </div>
        {dealer&&<>
          <div style={{fontSize:13,color:C.dim,margin:"12px 0"}}>{dealer} hat ausgeteilt.</div>
          {raters.map(player=><div key={player} style={{...s.card(),marginBottom:8}}>
            <div style={{fontSize:14,fontWeight:"bold",marginBottom:8}}>{player} · {ratings[player]?`${ratings[player]} / 10`:"noch offen"}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:5}}>
              {Array.from({length:10},(_,index)=>index+1).map(score=><button key={score} aria-label={`${player}: ${score} von 10`} aria-pressed={ratings[player]===score}
                onClick={()=>{setRatings(current=>({...current,[player]:score}));setNotice("");}}
                style={{...s.btn(ratings[player]===score,dealScoreColor(score)),minHeight:44,padding:"8px 0"}}>{score}</button>)}
            </div>
          </div>)}
          <button disabled={!complete} onClick={save} style={{...s.btn(complete,"#7de87a"),width:"100%",minHeight:44,padding:11,marginTop:4,opacity:complete?1:.45}}>
            {complete?"Bewertung speichern":`${raters.filter(player=>ratings[player]).length} von ${raters.length} Bewertungen ausgewählt`}
          </button>
        </>}
        {notice&&<div role="status" style={{fontSize:13,marginTop:10}}>{notice}</div>}
      </div>;
    }

    function DealRatingsView({players,dealRatings,statsRatings=dealRatings,gameTypes,legacyRating,onLegacySave,onStart,onSave,onUndo,privateError,online,hasOpenDeal}){
      const [newDealer,setNewDealer]=useState(null);
      const [selectedId,setSelectedId]=useState(()=>dealRatings[dealRatings.length-1]?.id||"");
      const [player,setPlayer]=useState("");
      const deal=dealRatings.find(entry=>entry.id===selectedId);
      const raters=deal?(deal.sealed?players:players.filter(name=>name!==deal.dealer)):[];
      const stats=useMemo(()=>window.SchafkopfDealRatings.dealerStats(players,statsRatings),[players,statsRatings]);
      const countedDeals=statsRatings.filter(entry=>(!entry.sealed||entry.released)&&Object.keys(entry.ratings||{}).length>0).length;
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
        {legacyRating?<LegacyDealRatingForm players={players} onSave={onLegacySave}/>:<div style={s.card("#4ab8e855",C.bg1)}>
          <div style={s.sec}>Austeilung bewerten</div>
          <p style={{fontSize:14,color:C.dim,marginBottom:12}}>Austeiler festlegen, dann die eigene Hand bewerten.</p>
          <DesignSection title={<>So funktioniert die Bewertung</>} legacyBare>
          <div style={{fontSize:13,color:C.text,lineHeight:1.5,marginBottom:10}}>
            Pro Runde einmal die Austeilung anlegen. Jeder wählt auf seinem Handy den eigenen Spieler und bestätigt seine Kartenbewertung. Andere sehen den Wert erst, wenn Spielart und Ergebnis der Runde eingetragen sind. Die Statistik wartet ebenfalls bis dahin.
          </div>
          </DesignSection>
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginBottom:12}}>
            <div style={{fontSize:13,color:C.dim,marginBottom:8}}>Für eine neue Austeilung den Austeiler wählen. Nur einmal pro Tisch anlegen.</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:6}}>
              {players.map((name,index)=><button key={name} title={name} aria-pressed={newDealer===name} onClick={()=>setNewDealer(name)}
                style={{...s.pBtn(newDealer===name,PCOLORS[index]),overflowWrap:"anywhere",minHeight:44}}>{name}</button>)}
            </div>
            <button className={C.legacyDesign?undefined:"primary-action"} disabled={!newDealer||hasOpenDeal} onClick={start} style={{...s.btn(!!newDealer&&!hasOpenDeal,"#4ab8e8"),width:"100%",marginTop:10,opacity:newDealer&&!hasOpenDeal?1:0.45}}>Neue Austeilung anlegen</button>
            {hasOpenDeal&&<div style={{fontSize:13,marginTop:8}}>Die aktuelle Austeilung gehört zur nächsten eingetragenen Spielrunde. Erst danach kann die nächste angelegt werden.</div>}
          </div>
          <label style={{fontSize:13,color:C.dim}}>Austeilung auswählen
            <select aria-label="Austeilung auswählen" style={{...s.input,marginTop:5}} value={deal?selectedId:""} onChange={event=>{setSelectedId(event.target.value);setPlayer("");}}>
              <option value="" disabled>Noch keine Austeilung</option>
              {dealRatings.map((entry,index)=><option key={entry.id} value={entry.id}>Austeilung {index+1} · {entry.dealer} · {entry.sealed&&!entry.released?"verdeckte Runde":`${Object.keys(entry.ratings||{}).length} bewertet`}</option>)}
            </select>
          </label>
          {deal&&<>
            <details style={{margin:"8px 0",fontSize:12,color:C.dim}}><summary>Details zur Austeilung</summary>{deal.roundId||deal.id}</details>
            {deal.sealed&&<div style={{fontSize:13,lineHeight:1.5,marginBottom:8}}>{deal.released?"Runde abgeschlossen: bestätigte Bewertungen sind jetzt sichtbar und unveränderlich.":online?"Verdeckte Runde: Nur deine auf diesem Gerät bestätigten Werte sind für dich sichtbar. Für die anderen Spieler bleiben sie bis zum Rundeneintrag gesperrt.":"Verdeckte Runde: Diese Werte zählen erst nach dem Rundeneintrag zur Statistik. Für getrennte Handys bitte einen Online-Raum verwenden."}</div>}
            <div style={{display:"grid",gap:6}}>
              {raters.map(name=><button key={name} aria-pressed={player===name} onClick={()=>setPlayer(name)}
                style={{...s.btn(player===name,PCOLORS[players.indexOf(name)]),textAlign:"left",minHeight:48}}>
                <span style={{fontWeight:"bold"}}>{name}</span>
                <span style={{display:"block",fontSize:12,marginTop:4}}>{deal.ratings?.[name]!=null?`${formatDealScore(deal.ratings[name])} / 10 · ${ratingMethodLabel(deal.ratingMeta?.[name])}`:deal.sealed&&!deal.released?"Verdeckt · eigenen Spieler auswählen":"Noch nicht bestätigt"}</span>
                {deal.ratingMeta?.[name]?.rules&&<span style={{display:"block",fontSize:12,marginTop:4}}>{ratingRulesLabel(deal.ratingMeta[name].rules)}</span>}
              </button>)}
            </div>
            {player&&raters.includes(player)&&!(deal.sealed&&deal.released)&&<HandRatingEditor key={`${deal.id}:${player}`} player={player} deal={deal} onSave={onSave} gameTypes={gameTypes}/>}
          </>}
        </div>}

        {privateError&&<div role="alert" style={{fontSize:13,color:"#e85d4a",marginTop:8}}>{privateError}</div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,margin:"18px 0 9px"}}>
          <div style={{...s.sec,marginBottom:0}}>Austeil-Statistik</div>
          <div style={{fontSize:12,color:C.mute}}>{countedDeals} bewertete Austeilungen</div>
        </div>
        <div style={{fontSize:12,color:C.dim,lineHeight:1.5,marginBottom:10}}>Durchschnitt aller freigegebenen Einzelbewertungen der Mitspieler, über alle Methoden und Versionen. Die eigene Hand des Austeilers zählt nicht zu seiner Austeil-Statistik. Die Zahl in Klammern nennt die Anzahl der Bewertungen.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(250px,100%),1fr))",gap:10}}>
          {players.map((dealerName,index)=>{const dealerStats=stats[dealerName];return <div key={dealerName} style={{...s.card(PCOLORS[index]+"55",PCOLORS[index]+"0d"),marginBottom:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:10}}>
              <div><div style={{fontSize:14,fontWeight:"bold",color:PCOLORS[index]}}>{dealerName}</div>
                <div style={{fontSize:12,color:C.dim,marginTop:2}}>{dealerStats.deals}x bewertet ausgeteilt</div></div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:1}}>Gesamt</div>
                <div style={{fontSize:22,fontWeight:"bold",color:dealerStats.average==null?C.mute:dealScoreColor(dealerStats.average)}}>
                  {formatDealScore(dealerStats.average)} <span style={{fontSize:13,color:C.dim}}>({dealerStats.count})</span>
                </div>
              </div>
            </div>
            <div style={{display:"grid",gap:7}}>
              {players.filter(name=>name!==dealerName).map(name=>{const row=dealerStats.byPlayer[name];return <div key={name}>
                <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,fontSize:12,marginBottom:3}}>
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
