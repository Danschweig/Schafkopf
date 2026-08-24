    function DealRatingsView({players,dealRatings,onSave,onUndo}){
      const [dealer,setDealer]=useState(null);
      const [ratings,setRatings]=useState({});
      const [savedNotice,setSavedNotice]=useState("");

      useEffect(()=>{
        setDealer(current=>players.includes(current)?current:null);
        setRatings(current=>Object.fromEntries(
          Object.entries(current).filter(([player,score])=>players.includes(player)&&Number(score)>=1&&Number(score)<=10)
        ));
      },[players]);

      function chooseDealer(player){
        setDealer(player);
        setRatings({});
        setSavedNotice("");
      }

      function chooseRating(player,score){
        setRatings(current=>({...current,[player]:score}));
        setSavedNotice("");
      }

      const raters=dealer?players.filter(player=>player!==dealer):[];
      const complete=!!dealer&&raters.length>0&&raters.every(player=>Number(ratings[player])>=1&&Number(ratings[player])<=10);
      const scoreColor=score=>score>=8?"#7de87a":score>=5?"#f5c842":"#e85d4a";
      const formatAverage=value=>value==null?"-":value.toLocaleString("de-DE",{minimumFractionDigits:1,maximumFractionDigits:1});

      const stats=useMemo(()=>Object.fromEntries(players.map(dealtBy=>{
        const deals=dealRatings.filter(entry=>entry?.dealer===dealtBy);
        const byPlayer=Object.fromEntries(players.filter(player=>player!==dealtBy).map(player=>{
          const values=deals.map(entry=>Number(entry.ratings?.[player])).filter(value=>value>=1&&value<=10);
          return [player,{average:values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null,count:values.length}];
        }));
        const allValues=deals.flatMap(entry=>players
          .filter(player=>player!==dealtBy)
          .map(player=>Number(entry.ratings?.[player])))
          .filter(value=>value>=1&&value<=10);
        return [dealtBy,{
          deals:deals.length,
          average:allValues.length?allValues.reduce((sum,value)=>sum+value,0)/allValues.length:null,
          count:allValues.length,
          byPlayer
        }];
      })),[players,dealRatings]);

      function save(){
        if(!complete)return;
        onSave(dealer,Object.fromEntries(raters.map(player=>[player,Number(ratings[player])])));
        setSavedNotice(`Bewertung fuer ${dealer} gespeichert.`);
        setDealer(null);
        setRatings({});
      }

      return <>
        <div style={s.card("#4ab8e855",C.bg1)}>
          <div style={s.sec}>Neue Austeil-Bewertung</div>
          <div style={{fontSize:11,color:C.dim,lineHeight:1.4,marginBottom:10}}>
            Wer hat gerade ausgeteilt? Danach bewertet jeder andere Spieler seine Karten von 1 bis 10.
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${players.length},minmax(0,1fr))`,gap:6,marginBottom:dealer?14:0}}>
            {players.map((player,index)=><button key={player} title={player} onClick={()=>chooseDealer(player)}
              style={{...s.pBtn(dealer===player,PCOLORS[index]),minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>
              {player}
            </button>)}
          </div>

          {dealer&&<div>
            <div style={{fontSize:10,color:C.dim,marginBottom:10}}>
              <strong style={{color:PCOLORS[players.indexOf(dealer)]}}>{dealer}</strong> hat ausgeteilt
            </div>
            <div style={{display:"grid",gap:10}}>
              {raters.map(player=>{const playerIndex=players.indexOf(player);return <div key={player} style={{background:C.bg2,border:`1px solid ${ratings[player]?scoreColor(ratings[player])+"77":C.border}`,borderRadius:8,padding:"9px 8px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:7}}>
                  <div style={{fontSize:11,fontWeight:"bold",color:PCOLORS[playerIndex]}}>{player}</div>
                  <div style={{fontSize:10,color:ratings[player]?scoreColor(ratings[player]):C.mute}}>
                    {ratings[player]?`${ratings[player]} / 10`:"noch offen"}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:4}}>
                  {Array.from({length:10},(_,index)=>index+1).map(score=><button key={score}
                    aria-label={`${player}: ${score} von 10`}
                    onClick={()=>chooseRating(player,score)}
                    style={{...s.btn(ratings[player]===score,scoreColor(score)),padding:"8px 0",fontSize:11,minWidth:0}}>
                    {score}
                  </button>)}
                </div>
              </div>;})}
            </div>
            <button disabled={!complete} onClick={save}
              style={{...s.btn(complete,"#7de87a"),width:"100%",padding:11,marginTop:12,opacity:complete?1:0.45}}>
              {complete?"Bewertung speichern":`${raters.filter(player=>ratings[player]).length} von ${raters.length} Bewertungen ausgewaehlt`}
            </button>
          </div>}
          {savedNotice&&<div role="status" style={{fontSize:10,color:"#7de87a",marginTop:10,textAlign:"center"}}>{savedNotice}</div>}
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,margin:"18px 0 9px"}}>
          <div style={{...s.sec,marginBottom:0}}>Austeil-Statistik</div>
          <div style={{fontSize:9,color:C.mute}}>{dealRatings.length} {dealRatings.length===1?"Austeilung":"Austeilungen"}</div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:10}}>
          {players.map((dealerName,index)=>{const dealerStats=stats[dealerName];return <div key={dealerName} style={{...s.card(PCOLORS[index]+"55",PCOLORS[index]+"0d"),marginBottom:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:"bold",color:PCOLORS[index]}}>{dealerName}</div>
                <div style={{fontSize:9,color:C.dim,marginTop:2}}>{dealerStats.deals}x ausgeteilt</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:8,color:C.dim,textTransform:"uppercase",letterSpacing:1}}>Gesamt</div>
                <div style={{fontSize:22,fontWeight:"bold",color:dealerStats.average==null?C.mute:scoreColor(dealerStats.average)}}>
                  {formatAverage(dealerStats.average)}
                </div>
              </div>
            </div>
            <div style={{display:"grid",gap:7}}>
              {players.filter(player=>player!==dealerName).map(player=>{const row=dealerStats.byPlayer[player];const average=row.average;return <div key={player}>
                <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,fontSize:10,marginBottom:3}}>
                  <span style={{color:PCOLORS[players.indexOf(player)],overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{player}</span>
                  <span style={{color:average==null?C.mute:scoreColor(average),fontWeight:"bold"}}>
                    {formatAverage(average)} <span style={{fontWeight:"normal",color:C.mute}}>({row.count})</span>
                  </span>
                </div>
                <div style={{height:4,background:C.border,borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:average==null?"0%":`${average*10}%`,background:scoreColor(average||1),borderRadius:3}}/>
                </div>
              </div>;})}
            </div>
          </div>;})}
        </div>

        {dealRatings.length>0&&<button onClick={onUndo} style={{...s.btn(false,"#e85d4a"),width:"100%",padding:10,marginTop:12}}>
          Letzte Austeil-Bewertung rueckgaengig
        </button>}
      </>;
    }
