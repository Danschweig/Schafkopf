    function TKonto({active,payload,label,rounds,startkapital,gameTypes}){
      if(!active||!payload?.length)return null;
      const sorted=[...payload].sort((a,b)=>b.value-a.value);
      const r=label>0?rounds[label-1]:null;
      return <div style={{background:C.tooltipBg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:12,fontFamily:"'Courier New',monospace",boxShadow:C.mode==="light"?"0 4px 16px rgba(35,70,35,0.14)":"none"}}>
        <div style={{color:"#7aaa7a",fontWeight:"bold",marginBottom:4}}>Runde {label}</div>
        {r&&<div style={{fontSize:10,color:TYPE_CATS[r.typeCat]?.color||"#888",marginBottom:6}}>
          {effectiveType(r).label}{r.cardPenalty?` · ${r.cardPlayer}`:""}{r.aussetzer?` (${r.aussetzer} out)`:""}{!r.cardPenalty&&(r.solist?` · ${r.solist}`:r.spieler?` · ${r.spieler}`:"")}{!r.cardPenalty&&r.typeCat!=="ramsch"&&(r.gewonnen?" · ✓":" · ✗")}
        </div>}
        {sorted.map(p=>{const diff=p.value-startkapital;return <div key={p.name} style={{color:p.color,marginBottom:2}}>{p.name}: <strong>{p.value.toLocaleString("de-DE")}</strong><span style={{fontSize:10,marginLeft:6,color:diff>=0?"#7de87a":"#e85d4a"}}>{diff>=0?"+":""}{diff}</span></div>;})}
      </div>;
    }

    function TDelta({active,payload,label,rounds}){
      if(!active||!payload?.length)return null;
      const r=rounds[Number(label)-1];if(!r)return null;
      const sorted=[...payload].filter(p=>p.value!==null).sort((a,b)=>b.value-a.value);
      return <div style={{background:C.tooltipBg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:12,fontFamily:"'Courier New',monospace",boxShadow:C.mode==="light"?"0 4px 16px rgba(35,70,35,0.14)":"none"}}>
        <div style={{color:"#7aaa7a",fontWeight:"bold",marginBottom:4}}>Runde {label}</div>
        <div style={{fontSize:10,color:TYPE_CATS[r.typeCat]?.color||"#888",marginBottom:6}}>{effectiveType(r).label}{r.cardPenalty?` · ${r.cardPlayer}`:""}{!r.cardPenalty&&r.typeCat!=="ramsch"&&(r.gewonnen?" · ✓":" · ✗")}</div>
        {sorted.map(p=><div key={p.name} style={{color:p.fill,marginBottom:2}}>{p.name}: <span style={{color:p.value>0?"#7de87a":p.value<0?"#e85d4a":C.zero,fontWeight:"bold"}}>{p.value>0?"+":""}{p.value}</span></div>)}
      </div>;
    }

    // ── ChartTab ─────────────────────────────────────────────────

    function PlayerStatsCard({player,stats,allTypes}){
      const st=stats[player.name]||{angesagt:0,partner:0,gewonnen:0,verloren:0,byType:{}};
      const total=st.gewonnen+st.verloren;
      const rate=total>0?Math.round(st.gewonnen/total*100):0;
      const top=Object.entries(st.byType||{}).sort((a,b)=>b[1]-a[1]);
      const tiles=[
        ["Gespielt",st.angesagt,player.color],
        ["Partner",st.partner,"#6a9a6a"],
        ["Siege",st.gewonnen,"#7de87a"],
        ["Siegrate",rate+"%",rate>=50?"#7de87a":"#e85d4a"]
      ];
      return <div style={s.card(player.color+"44",player.color+"0d")}>
        <div style={{fontSize:13,fontWeight:"bold",color:player.color,marginBottom:6}}>{player.name}</div>
        <div style={{fontSize:17,fontWeight:"bold",color:C.title,marginBottom:4}}>
          {player.value.toLocaleString("de-DE")}
          <span style={{fontSize:11,marginLeft:6,color:player.diff>=0?"#7de87a":"#e85d4a"}}>{player.diff>=0?"+":""}{player.diff}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:10}}>
          {tiles.map(([label,value,color])=><div key={label} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 4px",textAlign:"center"}}>
            <div style={{fontSize:8,color:C.dim,marginBottom:1}}>{label}</div>
            <div style={{fontSize:14,fontWeight:"bold",color}}>{value}</div>
          </div>)}
        </div>
        {top.length>0&&<div>
          <div style={{...s.sec,marginBottom:5}}>Meist angesagt</div>
          {top.slice(0,4).map(([tid,cnt],rank)=>{
            const t=allTypes.find(g=>g.id===tid);
            const col=TYPE_CATS[t?.cat||"2vs2"]?.color||"#888";
            const pct=st.angesagt>0?Math.round(cnt/st.angesagt*100):0;
            return <div key={tid} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
              <div style={{fontSize:9,color:C.mute,width:12}}>#{rank+1}</div>
              <div style={{fontSize:10,color:col,width:62}}>{t?.label||tid}</div>
              <div style={{flex:1,height:4,background:C.border,borderRadius:2}}>
                <div style={{height:"100%",width:`${pct}%`,background:col+"88",borderRadius:2}}/>
              </div>
              <div style={{fontSize:9,color:C.dim,width:20,textAlign:"right"}}>{cnt}x</div>
            </div>;
          })}
        </div>}
      </div>;
    }
    function ChartTab({rounds,players,startkapital,gameTypes}){
      const [sub,setSub]=useState("konto");
      const [hid,setHid]=useState(new Set());
      const [rangeFrom,setRangeFrom]=useState(0);
      const [rangeTo,setRangeTo]=useState(null);
      const chartRef=useRef(null);
      const tog=p=>setHid(prev=>{const s=new Set(prev);s.has(p)?s.delete(p):s.add(p);return s;});
      function exportChartJpg(){
        const container=chartRef.current;
        if(!container){alert('Chart nicht gefunden.');return;}
        const svg=container.querySelector('svg');
        if(!svg){alert('Chart SVG nicht gefunden.');return;}
        const serializer=new XMLSerializer();
        const svgString=serializer.serializeToString(svg);
        const svgBlob=new Blob([svgString],{type:'image/svg+xml;charset=utf-8'});
        const url=URL.createObjectURL(svgBlob);
        const img=new Image();
        img.onload=()=>{
          const rect=svg.getBoundingClientRect();
          const vb=svg.viewBox?.baseVal;
          const chartW=Math.ceil(rect.width||vb?.width||img.width||720);
          const chartH=Math.ceil(rect.height||vb?.height||img.height||260);
          const scale=3;
          const legendH=58+players.length*32;
          const canvas=document.createElement('canvas');
          canvas.width=chartW*scale;canvas.height=(chartH+legendH)*scale;
          const ctx=canvas.getContext('2d');
          ctx.scale(scale,scale);
          ctx.fillStyle='#0b160b';ctx.fillRect(0,0,chartW,chartH+legendH);
          ctx.drawImage(img,0,0,chartW,chartH);
          ctx.fillStyle='#080f08';ctx.fillRect(0,chartH,chartW,legendH);
          ctx.strokeStyle='#1a321a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,chartH+0.5);ctx.lineTo(chartW,chartH+0.5);ctx.stroke();
          ctx.font="bold 14px 'Courier New', monospace";ctx.fillStyle='#c8e0c8';ctx.fillText('Spieler',16,chartH+28);
          players.forEach((p,i)=>{
            const x=16;
            const y=chartH+58+i*32;
            const value=last[p]||startkapital;
            const diff=value-startkapital;
            ctx.fillStyle=PCOLORS[i];ctx.fillRect(x,y-11,12,12);
            ctx.font="bold 13px 'Courier New', monospace";ctx.fillStyle=hid.has(p)?'#4a7a4a':'#e8ead0';ctx.fillText(p,x+20,y);
            ctx.font="12px 'Courier New', monospace";ctx.fillStyle=diff>=0?'#7de87a':'#e85d4a';
            ctx.textAlign='right';
            ctx.fillText(`${value.toLocaleString("de-DE")} (${diff>=0?"+":""}${diff})`,chartW-16,y);
            ctx.textAlign='left';
          });
          URL.revokeObjectURL(url);
          const jpg=canvas.toDataURL('image/jpeg',0.95);
          const a=document.createElement('a');a.href=jpg;
          a.download=`schafkopf-konto-${new Date().toISOString().slice(0,10)}.jpg`;
          a.click();
        };
        img.onerror=()=>{alert('Export als JPG fehlgeschlagen.');};
        img.src=url;
      }
      const allTypes=[...gameTypes,{id:"farbwenz",label:"Farbwenz",cat:"solo2"},{id:"farbgeier",label:"Farbgeier",cat:"solo1"}];

      const kontoData=useMemo(()=>{const rows=[{round:0,...Object.fromEntries(players.map(p=>[p,startkapital]))}];const cur=Object.fromEntries(players.map(p=>[p,startkapital]));rounds.forEach((r,i)=>{players.forEach(p=>cur[p]+=(r.deltas[p]||0));rows.push({round:i+1,...cur});});return rows;},[rounds,players,startkapital]);
      const maxRound=rounds.length;
      const clampRound=v=>Math.max(0,Math.min(maxRound,Number(v)||0));
      const effectiveTo=clampRound(rangeTo==null?maxRound:rangeTo);
      const effectiveFrom=Math.min(clampRound(rangeFrom),effectiveTo);
      const kontoRangeData=useMemo(()=>kontoData.filter(row=>row.round>=effectiveFrom&&row.round<=effectiveTo),[kontoData,effectiveFrom,effectiveTo]);
      const setAllRounds=()=>{setRangeFrom(0);setRangeTo(null);};
      const setLastRounds=(count)=>{setRangeFrom(Math.max(0,maxRound-count+1));setRangeTo(maxRound);};
      const updateRangeFrom=v=>{const n=clampRound(v);setRangeFrom(Math.min(n,effectiveTo));};
      const updateRangeTo=v=>{const n=clampRound(v);setRangeTo(Math.max(n,effectiveFrom));};
      const deltaData=useMemo(()=>{const raw=rounds.map((r,i)=>({round:i+1,...Object.fromEntries(players.map(p=>[p,r.deltas[p]||0]))}));const out=[];raw.forEach((d,i)=>{out.push({...d});if(i<raw.length-1)out.push({round:`${d.round}.`,...Object.fromEntries(players.map(p=>[p,null]))});});return out;},[rounds,players]);
      const stats=useMemo(()=>{
        const st=Object.fromEntries(players.map(p=>[p,{angesagt:0,partner:0,gewonnen:0,verloren:0,total:0,byType:{},currentWinStreak:0,currentLossStreak:0,maxWinStreak:0,maxLossStreak:0,bestWin:0,worstLoss:0,rounds:0,positiveRounds:0,negativeRounds:0,zeroRounds:0,avg:0}]));
        const curWin=Object.fromEntries(players.map(p=>[p,0]));
        const curLoss=Object.fromEntries(players.map(p=>[p,0]));
        rounds.forEach(r=>{
          const e=effectiveType(r);
          players.forEach(p=>{
            const d=r.deltas?.[p];
            if(d!==undefined){
              st[p].total+=d;
              st[p].rounds++;
              if(d>0){ st[p].gewonnen++; curWin[p]+=1; curLoss[p]=0; if(curWin[p]>st[p].maxWinStreak)st[p].maxWinStreak=curWin[p]; st[p].positiveRounds++; if(d>st[p].bestWin)st[p].bestWin=d; }
              else if(d<0){ st[p].verloren++; curLoss[p]+=1; curWin[p]=0; if(curLoss[p]>st[p].maxLossStreak)st[p].maxLossStreak=curLoss[p]; st[p].negativeRounds++; if(d<st[p].worstLoss)st[p].worstLoss=d; }
              else { curWin[p]=0; curLoss[p]=0; st[p].zeroRounds++; }
            }
          });
          if(r.spieler&&st[r.spieler]){st[r.spieler].angesagt++;st[r.spieler].byType[e.id]=(st[r.spieler].byType[e.id]||0)+1;}
          if(r.solist&&st[r.solist]){st[r.solist].angesagt++;st[r.solist].byType[e.id]=(st[r.solist].byType[e.id]||0)+1;}
          if(r.partner&&st[r.partner])st[r.partner].partner++;
        });
        players.forEach(p=>{st[p].currentWinStreak=curWin[p];st[p].currentLossStreak=curLoss[p];st[p].avg=st[p].rounds?Math.round(st[p].total/st[p].rounds):0;});
        return st;
      },[rounds,players]);
      const sessionTypes=useMemo(()=>{const tc={};rounds.forEach(r=>{const e=effectiveType(r);tc[e.id]=(tc[e.id]||0)+1;});return Object.entries(tc).sort((a,b)=>b[1]-a[1]);},[rounds]);
      const roundSummary=useMemo(()=>{
        if(rounds.length===0)return null;
        let totalDelta=0;let bestWin=0;let worstLoss=0;let bestRound=null;let worstRound=null;
        rounds.forEach(r=>{
          const values=players.map(p=>r.deltas?.[p]||0);
          values.forEach(v=>{totalDelta+=Math.abs(v); if(v>bestWin){bestWin=v;bestRound=r;} if(v<worstLoss){worstLoss=v;worstRound=r;}});
        });
        return {count:rounds.length,volume:totalDelta,avg:Math.round(totalDelta/rounds.length),bestWin,bestRound,worstLoss,worstRound};
      },[rounds,players]);
      const last=kontoData[kontoData.length-1]||{};
      const standings=players.map((p,i)=>({name:p,color:PCOLORS[i],value:last[p]||startkapital,diff:(last[p]||startkapital)-startkapital})).sort((a,b)=>b.value-a.value);

      if(rounds.length===0)return <div style={{textAlign:"center",color:C.mute,padding:40}}>Noch keine Runden.</div>;

      return <div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <button style={s.subTab(sub==="konto")} onClick={()=>setSub("konto")}>Kontostand</button>
          <button style={s.subTab(sub==="delta")} onClick={()=>setSub("delta")}>Δ Delta</button>
          <button style={s.subTab(sub==="verlauf")} onClick={()=>setSub("verlauf")}>Verlauf</button>
        </div>
        {sub==="konto"&&<div>
          <div style={{...s.card("#4ab8e844",C.bg1),marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
              <div>
                <div style={s.sec}>Angezeigter Bereich</div>
                <div style={{fontSize:12,color:C.title,fontWeight:"bold"}}>Runde {effectiveFrom} bis {effectiveTo}</div>
              </div>
              <button onClick={setAllRounds} style={{...s.btn(effectiveFrom===0&&effectiveTo===maxRound,"#4ab8e8"),padding:"8px 12px",whiteSpace:"nowrap"}}>Alle</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Von Runde</div>
                <input type="number" min="0" max={maxRound} value={effectiveFrom} onChange={e=>updateRangeFrom(e.target.value)} style={{...s.input,fontSize:16,textAlign:"center",padding:"10px 8px"}}/>
              </div>
              <div>
                <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Bis Runde</div>
                <input type="number" min="0" max={maxRound} value={effectiveTo} onChange={e=>updateRangeTo(e.target.value)} style={{...s.input,fontSize:16,textAlign:"center",padding:"10px 8px"}}/>
              </div>
            </div>
            <div style={{display:"grid",gap:8,marginBottom:10}}>
              <input aria-label="Start-Runde" type="range" min="0" max={maxRound} value={effectiveFrom} onChange={e=>updateRangeFrom(e.target.value)} style={{width:"100%",accentColor:"#4ab8e8"}}/>
              <input aria-label="End-Runde" type="range" min="0" max={maxRound} value={effectiveTo} onChange={e=>updateRangeTo(e.target.value)} style={{width:"100%",accentColor:"#7de87a"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
              <button onClick={()=>setLastRounds(5)} style={{...s.btn(false,"#4ab8e8"),padding:"8px 4px",fontSize:10}}>Letzte 5</button>
              <button onClick={()=>setLastRounds(10)} style={{...s.btn(false,"#4ab8e8"),padding:"8px 4px",fontSize:10}}>Letzte 10</button>
              <button onClick={()=>setLastRounds(20)} style={{...s.btn(false,"#4ab8e8"),padding:"8px 4px",fontSize:10}}>Letzte 20</button>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>{players.map((p,i)=><button key={p} onClick={()=>tog(p)} style={s.pChip(!hid.has(p),PCOLORS[i])}>— {p}</button>)}</div>
          <div ref={chartRef}>
            <ResponsiveContainer width="100%" height={260}><LineChart data={kontoRangeData} margin={{top:10,right:12,left:0,bottom:14}}><CartesianGrid strokeDasharray="3 3" stroke={C.chartGrid}/><XAxis dataKey="round" stroke={C.chartAxis} tick={{fill:C.chartAxis,fontSize:10}} label={{value:"Runde",position:"insideBottom",offset:-8,fill:C.dim,fontSize:10}}/><YAxis stroke={C.chartAxis} tick={{fill:C.chartAxis,fontSize:10}} tickFormatter={v=>v.toLocaleString("de-DE")} width={54}/><Tooltip content={<TKonto rounds={rounds} startkapital={startkapital}/>}/><ReferenceLine y={startkapital} stroke={C.zero} strokeDasharray="4 3" label={{value:"Start",position:"right",fill:C.mute,fontSize:9}}/>{players.map((p,i)=>!hid.has(p)&&<Line key={p} type="monotone" dataKey={p} stroke={PCOLORS[i]} strokeWidth={2} dot={{r:3,fill:PCOLORS[i],strokeWidth:0}} activeDot={{r:5}} animationDuration={400}/>)}</LineChart></ResponsiveContainer>
          </div>
          <button onClick={exportChartJpg} style={{...s.btn(false,"#7de87a"),width:"100%",padding:10,marginTop:10}}>📷 Kontostand als JPG exportieren</button>
        </div>}
        {sub==="delta"&&<div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>{players.map((p,i)=><div key={p} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:PCOLORS[i]}}><div style={{width:10,height:10,background:PCOLORS[i],borderRadius:2}}/>{p}</div>)}</div>
          <ResponsiveContainer width="100%" height={260}><BarChart data={deltaData} margin={{top:10,right:10,left:0,bottom:14}} barSize={8} barGap={2} barCategoryGap="20%"><CartesianGrid strokeDasharray="3 3" stroke={C.chartGrid}/><XAxis dataKey="round" stroke={C.chartAxis} tick={({x,y,payload})=>!String(payload.value).includes(".")?<text x={x} y={y+10} textAnchor="middle" fill={C.chartAxis} fontSize={10}>{payload.value}</text>:null} label={{value:"Runde",position:"insideBottom",offset:-8,fill:C.dim,fontSize:10}}/><YAxis stroke={C.chartAxis} tick={{fill:C.chartAxis,fontSize:10}} width={40}/><Tooltip content={<TDelta rounds={rounds}/>}/><ReferenceLine y={0} stroke={C.chartAxis} strokeWidth={1}/>{players.map((p,i)=><Bar key={p} dataKey={p} fill={PCOLORS[i]} opacity={0.85} radius={[2,2,0,0]} animationDuration={400}/>)}</BarChart></ResponsiveContainer>
        </div>}
        {sub==="verlauf"&&<div>{[...rounds].reverse().map(r=>{
          const sm=Math.pow(2,r.sticht||0);const jm=r.jungfrauen>0?Math.pow(2,r.jungfrauen):1;
          const et=effectiveType(r);const cc=TYPE_CATS[r.typeCat]?.color||"#fff";
          return <div key={r.id||r.runde} style={s.card()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:4}}>
              <div>
              <span style={{fontSize:11,color:C.dim}}>Runde {r.runde}{r.aussetzer&&<span style={{color:"#a080e0"}}> · {r.aussetzer} out</span>}</span>
              {r.name&&<div style={{fontSize:12,fontWeight:"bold",marginTop:4,color:cc}}>{r.name}</div>}
            </div>
              <span style={{fontSize:11,color:cc}}>
                {et.label}{r.tout&&<span style={{color:"#ff8c42"}}> Tout</span>}
                {r.typeCat!=="ramsch"&&(r.gewonnen?" · ✓":" · ✗")}
                {r.schneider?" · Schndr.":""}{r.schwarz&&<span> · Schwz.</span>}
                {r.laufende>=2&&<span> · {r.laufende} Lfd.</span>}
                {r.sticht>0&&<span style={{color:"#d080e0"}}> · St×{sm}</span>}
              </span>
            </div>
            <div style={{fontSize:10,color:C.mute,marginBottom:6}}>Betrag: <strong style={{color:"#f5c842"}}>{r.betrag*sm*jm} Chips</strong></div>
            <div style={{display:"grid",gridTemplateColumns:`repeat(${players.length},1fr)`,gap:6}}>
              {players.map((p,i)=>{const d=r.deltas[p]||0;return <div key={p} style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:r.aussetzer===p?"#a080e0":PCOLORS[i]}}>{p}</div>
                <div style={{fontSize:16,fontWeight:"bold",color:r.aussetzer===p?"#a080e0":d>0?"#7de87a":d<0?"#e85d4a":C.zero}}>{r.aussetzer===p?"–":d>0?`+${d}`:d}</div>
              </div>;})}
            </div>
          </div>;
        })}</div>}

        <div style={{marginTop:20}}>
          <div style={{...s.sec,fontSize:10,letterSpacing:3,marginBottom:12}}>STATISTIK</div>
          {roundSummary&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
            <div style={s.card()}><div style={{fontSize:9,color:C.dim}}>Runden</div><div style={{fontSize:18,fontWeight:"bold"}}>{roundSummary.count}</div></div>
            <div style={s.card()}><div style={{fontSize:9,color:C.dim}}>Bewegte Chips</div><div style={{fontSize:18,fontWeight:"bold"}}>{roundSummary.volume.toLocaleString("de-DE")}</div></div>
            <div style={s.card()}><div style={{fontSize:9,color:C.dim}}>Ø pro Runde</div><div style={{fontSize:18,fontWeight:"bold"}}>{roundSummary.avg.toLocaleString("de-DE")}</div></div>
            <div style={s.card()}><div style={{fontSize:9,color:C.dim}}>Extreme</div><div style={{fontSize:16,fontWeight:"bold",color:"#7de87a"}}>+{roundSummary.bestWin}</div><div style={{fontSize:12,color:"#e85d4a"}}>{roundSummary.worstLoss}</div></div>
          </div>}
          <div style={s.card()}>
            <div style={{fontSize:11,color:C.dim,marginBottom:8}}>Serien & Highscores</div>
            <div style={{display:"grid",gridTemplateColumns:`repeat(${players.length},1fr)`,gap:8}}>
              {players.map((p,i)=>{
                const st=stats[p]||{};
                return <div key={p} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:8,textAlign:"center"}}>
                  <div style={{fontSize:10,color:PCOLORS[i],marginBottom:6}}>{p}</div>
                  <div style={{fontSize:12,fontWeight:"bold",color:st.currentWinStreak>0?"#7de87a":st.currentLossStreak>0?"#e85d4a":C.dim}}>{st.currentWinStreak>0?`+${st.currentWinStreak}`:st.currentLossStreak>0?`-${st.currentLossStreak}`:"—"}</div>
                  <div style={{fontSize:9,color:C.dim,marginTop:6}}>Best W: <strong style={{color:"#7de87a"}}>{st.maxWinStreak||0}</strong> · Best L: <strong style={{color:"#e85d4a"}}>{st.maxLossStreak||0}</strong></div>
                  <div style={{fontSize:9,color:C.dim,marginTop:4}}>Ø/Runde: <strong>{st.avg}</strong> · +Runden: <strong>{st.positiveRounds}</strong> · -Runden: <strong>{st.negativeRounds}</strong></div>
                </div>;
              })}
            </div>
          </div>
          <div style={s.card()}><div style={s.sec}>Meistgespielte Spielarten</div>{sessionTypes.map(([tid,cnt])=>{const t=allTypes.find(g=>g.id===tid);const col=TYPE_CATS[t?.cat||"2vs2"]?.color||"#888";const pct=Math.round(cnt/rounds.length*100);return <div key={tid} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span style={{color:col}}>{t?.label||tid}</span><span style={{color:C.dim}}>{cnt}× · {pct}%</span></div><div style={{height:5,background:C.border,borderRadius:3}}><div style={{height:"100%",width:`${pct}%`,background:col+"99",borderRadius:3}}/></div></div>;})}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {standings.map(p=><PlayerStatsCard key={p.name} player={p} stats={stats} allTypes={allTypes}/>)}
          </div>
        </div>
      </div>;
    }

