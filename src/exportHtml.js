    const EXPORT_COMPONENT_CODE = `
    const {useState,useMemo}=React;
    const {LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,ReferenceLine,ResponsiveContainer,BarChart,Bar}=Recharts;
    const SESSION=JSON.parse(document.getElementById('sk-data').textContent);
    const ALL_TYPES_RAW=JSON.parse(document.getElementById('sk-types').textContent);
    const PLAYERS=SESSION.players;const ROUNDS=SESSION.rounds||[];const START=SESSION.startkapital||1100;const TARIFF=SESSION.tariff||{sl:25,sauspiel:25,solo:50};
    const PCOLORS=["#e85d4a","#f5c842","#4ab8e8","#7de87a","#a080e0"];
    const ALL_TYPES=[...ALL_TYPES_RAW,{id:"farbwenz",label:"Farbwenz",cat:"solo2"},{id:"farbgeier",label:"Farbgeier",cat:"solo1"}];
    const TYPE_CATS={"2vs2":{label:"2 vs 2",color:"#4ab8e8"},"solo1":{label:"Solo",color:"#f5c842"},"solo2":{label:"Solo",color:"#d08b3a"},"ramsch":{label:"Ramsch",color:"#e85d4a"}};
    function et(r){if(r.typeId==="wenz"&&r.mitFarbe)return{id:"farbwenz",label:"Farbwenz",cat:"solo2"};if(r.typeId==="geier"&&r.mitFarbe)return{id:"farbgeier",label:"Farbgeier",cat:"solo1"};return{id:r.typeId,label:r.typeLabel,cat:r.typeCat};}
    const C={bg1:"#0c180c",bg2:"#111f11",border:"#1a321a",text:"#c8e0c8",dim:"#4a7a4a",mute:"#2a4a2a"};
    const ss={card:(bc,bg)=>({background:bg||"#0c180c",border:\`1px solid \${bc||"#1a321a"}\`,borderRadius:10,padding:"12px 14px",marginBottom:10}),sec:{fontSize:9,color:"#4a7a4a",letterSpacing:2,textTransform:"uppercase",marginBottom:8},subTab:(on)=>({background:on?"#1e3a1e":"transparent",border:\`1px solid \${on?"#3a6a3a":"#1a321a"}\`,color:on?"#a0d0a0":"#4a7a4a",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontSize:11,fontFamily:"'Courier New',monospace"}),pChip:(on,col)=>({background:on?col+"22":"transparent",border:\`1px solid \${on?col:"#1a321a"}\`,color:on?col:"#2a4a2a",borderRadius:20,padding:"5px 14px",cursor:"pointer",fontSize:11,fontFamily:"'Courier New',monospace"})};
    const kontoData=(()=>{const rows=[{round:0,...Object.fromEntries(PLAYERS.map(p=>[p,START]))}];const cur=Object.fromEntries(PLAYERS.map(p=>[p,START]));ROUNDS.forEach((r,i)=>{PLAYERS.forEach(p=>cur[p]+=(r.deltas[p]||0));rows.push({round:i+1,...cur});});return rows;})();
    const deltaData=(()=>{const raw=ROUNDS.map((r,i)=>({round:i+1,...Object.fromEntries(PLAYERS.map(p=>[p,r.deltas[p]||0]))}));const out=[];raw.forEach((d,i)=>{out.push({...d});if(i<raw.length-1)out.push({round:\`\${d.round}.\`,...Object.fromEntries(PLAYERS.map(p=>[p,null]))});});return out;})();
    const stats=(()=>{const st=Object.fromEntries(PLAYERS.map(p=>[p,{angesagt:0,partner:0,gewonnen:0,verloren:0,total:0,byType:{}}]));ROUNDS.forEach(r=>{const e=et(r);PLAYERS.forEach(p=>{const d=r.deltas[p]||0;st[p].total+=d;if(d>0)st[p].gewonnen++;if(d<0)st[p].verloren++;});if(r.spieler){st[r.spieler].angesagt++;st[r.spieler].byType[e.id]=(st[r.spieler].byType[e.id]||0)+1;}if(r.solist){st[r.solist].angesagt++;st[r.solist].byType[e.id]=(st[r.solist].byType[e.id]||0)+1;}if(r.partner)st[r.partner].partner++;});return st;})();
    const sessionTypes=(()=>{const tc={};ROUNDS.forEach(r=>{const e=et(r);tc[e.id]=(tc[e.id]||0)+1;});return Object.entries(tc).sort((a,b)=>b[1]-a[1]);})();
    const last=kontoData[kontoData.length-1]||{};
    const standings=PLAYERS.map((p,i)=>({name:p,color:PCOLORS[i],value:last[p]||START,diff:(last[p]||START)-START})).sort((a,b)=>b.value-a.value);
    function TK({active,payload,label}){if(!active||!payload?.length)return null;const sorted=[...payload].sort((a,b)=>b.value-a.value);const r=label>0?ROUNDS[label-1]:null;return <div style={{background:"#0a1a0a",border:"1px solid #2a4a2a",borderRadius:8,padding:"10px 14px",fontSize:12,fontFamily:"'Courier New',monospace"}}><div style={{color:"#7aaa7a",fontWeight:"bold",marginBottom:4}}>Runde {label}</div>{r&&<div style={{fontSize:10,color:TYPE_CATS[r.typeCat]?.color||"#888",marginBottom:6}}>{et(r).label}{r.solist?\` · \${r.solist}\`:r.spieler?\` · \${r.spieler}\`:""}{r.typeCat!=="ramsch"&&(r.gewonnen?" · ✓":" · ✗")}</div>}{sorted.map(p=>{const diff=p.value-START;return <div key={p.name} style={{color:p.color,marginBottom:2}}>{p.name}: <strong>{p.value.toLocaleString("de-DE")}</strong><span style={{fontSize:10,marginLeft:6,color:diff>=0?"#7de87a":"#e85d4a"}}>{diff>=0?"+":""}{diff}</span></div>;})}</div>;}
    function TD({active,payload,label}){if(!active||!payload?.length)return null;const r=ROUNDS[Number(label)-1];if(!r)return null;const sorted=[...payload].filter(p=>p.value!==null).sort((a,b)=>b.value-a.value);return <div style={{background:"#0a1a0a",border:"1px solid #2a4a2a",borderRadius:8,padding:"10px 14px",fontSize:12,fontFamily:"'Courier New',monospace"}}><div style={{color:"#7aaa7a",fontWeight:"bold",marginBottom:4}}>Runde {label}</div><div style={{fontSize:10,color:TYPE_CATS[r.typeCat]?.color||"#888",marginBottom:6}}>{et(r).label}{r.solist?\` · \${r.solist}\`:r.spieler?\` · \${r.spieler}\`:""}{r.typeCat!=="ramsch"&&(r.gewonnen?" · ✓":" · ✗")}</div>{sorted.map(p=><div key={p.name} style={{color:p.fill,marginBottom:2}}>{p.name}: <span style={{color:p.value>0?"#7de87a":p.value<0?"#e85d4a":"#3a5a3a",fontWeight:"bold"}}>{p.value>0?"+":""}{p.value}</span></div>)}</div>;}
    function Stat(){
      return <div style={{marginTop:20}}>
        <div style={{...ss.sec,fontSize:10,letterSpacing:3,marginBottom:12}}>STATISTIK</div>
        <div style={ss.card()}><div style={ss.sec}>Meistgespielte Spielarten</div>{sessionTypes.map(([tid,cnt])=>{const t=ALL_TYPES.find(g=>g.id===tid);const col=TYPE_CATS[t?.cat||"2vs2"]?.color||"#888";const pct=Math.round(cnt/Math.max(ROUNDS.length,1)*100);return <div key={tid} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span style={{color:col}}>{t?.label||tid}</span><span style={{color:C.dim}}>{cnt}× · {pct}%</span></div><div style={{height:5,background:C.border,borderRadius:3}}><div style={{height:"100%",width:\`\${pct}%\`,background:col+"99",borderRadius:3}}/></div></div>;})}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {standings.map((p,i)=>{const st=stats[p.name];const total=st.gewonnen+st.verloren;const rate=total>0?Math.round(st.gewonnen/total*100):0;const top=Object.entries(st.byType).sort((a,b)=>b[1]-a[1]);return <div key={p.name} style={ss.card(p.color+"44",p.color+"0d")}>
            <div style={{fontSize:13,fontWeight:"bold",color:p.color,marginBottom:6}}>{p.name}</div>
            <div style={{fontSize:17,fontWeight:"bold",color:"#e8ead0",marginBottom:4}}>{p.value.toLocaleString("de-DE")}<span style={{fontSize:11,marginLeft:6,color:p.diff>=0?"#7de87a":"#e85d4a"}}>{p.diff>=0?"+":""}{p.diff}</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:10}}>{[["Gespielt",st.angesagt,p.color],["Partner",st.partner,"#6a9a6a"],["Siege",st.gewonnen,"#7de87a"],["Siegrate",rate+"%",rate>=50?"#7de87a":"#e85d4a"]].map(([l,v,c])=><div key={l} style={{background:C.bg2,border:\`1px solid \${C.border}\`,borderRadius:6,padding:"5px 4px",textAlign:"center"}}><div style={{fontSize:8,color:C.dim,marginBottom:1}}>{l}</div><div style={{fontSize:14,fontWeight:"bold",color:c}}>{v}</div></div>)}</div>
            {top.length>0&&<><div style={{...ss.sec,marginBottom:5}}>Meist angesagt</div>{top.slice(0,4).map(([tid,cnt],rank)=>{const t=ALL_TYPES.find(g=>g.id===tid);const col=TYPE_CATS[t?.cat||"2vs2"]?.color||"#888";const pct=st.angesagt>0?Math.round(cnt/st.angesagt*100):0;return <div key={tid} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}><div style={{fontSize:9,color:C.mute,width:12}}>#{rank+1}</div><div style={{fontSize:10,color:col,width:62}}>{t?.label||tid}</div><div style={{flex:1,height:4,background:C.border,borderRadius:2}}><div style={{height:"100%",width:\`\${pct}%\`,background:col+"88",borderRadius:2}}/></div><div style={{fontSize:9,color:C.dim,width:20,textAlign:"right"}}>{cnt}×</div></div>;})}</>}
          </div>;})}
        </div>
      </div>;
    }
    function App(){
      const [sub,setSub]=useState("konto");
      const [hid,setHid]=useState(new Set());
      const tog=p=>setHid(prev=>{const s=new Set(prev);s.has(p)?s.delete(p):s.add(p);return s;});
      return <div style={{background:"linear-gradient(160deg,#0b160b,#101e10)",minHeight:"100vh",fontFamily:"'Courier New',monospace",color:C.text,paddingBottom:32}}>
        <div style={{background:"#080f08",borderBottom:\`1px solid \${C.border}\`,padding:"14px 16px",textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:"bold",color:"#ffffff",marginBottom:6}}>Schafkopf · {SESSION.exportDate||""}</div>
          <div style={{fontSize:12,color:"#ffffff",marginTop:2}}>S&L {TARIFF.sl} · Sauspiel {TARIFF.sauspiel} · Solo {TARIFF.solo} Chips · {ROUNDS.length} Runden</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:\`repeat(\${standings.length},1fr)\`,gap:8,padding:"12px 16px 0"}}>
          {standings.map((p,i)=><div key={p.name} style={{background:\`\${p.color}12\`,border:\`1px solid \${p.color}44\`,borderRadius:8,padding:"8px 4px",textAlign:"center"}}>
            <div style={{fontSize:9,color:p.color}}>#{i+1} {p.name}</div>
            <div style={{fontSize:16,fontWeight:"bold",color:"#eeeedd"}}>{p.value.toLocaleString("de-DE")}</div>
            <div style={{fontSize:10,color:p.diff>=0?"#7de87a":"#e85d4a"}}>{p.diff>=0?"+":""}{p.diff}</div>
          </div>)}
        </div>
        <div style={{display:"flex",gap:8,padding:"12px 16px 0"}}>
          <button style={ss.subTab(sub==="konto")} onClick={()=>setSub("konto")}>Kontostand</button>
          <button style={ss.subTab(sub==="delta")} onClick={()=>setSub("delta")}>Δ Delta</button>
          <button style={ss.subTab(sub==="verlauf")} onClick={()=>setSub("verlauf")}>Verlauf</button>
        </div>
        <div style={{padding:"12px 16px"}}>
          {sub==="konto"&&<>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>{PLAYERS.map((p,i)=><button key={p} onClick={()=>tog(p)} style={ss.pChip(!hid.has(p),PCOLORS[i])}>— {p}</button>)}</div>
            <ResponsiveContainer width="100%" height={260}><LineChart data={kontoData} margin={{top:10,right:12,left:0,bottom:14}}><CartesianGrid strokeDasharray="3 3" stroke="#1e3a1e"/><XAxis dataKey="round" stroke="#3a6a3a" tick={{fill:"#5a8a5a",fontSize:10}} label={{value:"Runde",position:"insideBottom",offset:-8,fill:C.dim,fontSize:10}}/><YAxis stroke="#3a6a3a" tick={{fill:"#5a8a5a",fontSize:10}} tickFormatter={v=>v.toLocaleString("de-DE")} width={54}/><Tooltip content={<TK/>}/><ReferenceLine y={START} stroke="#2a4a2a" strokeDasharray="4 3" label={{value:"Start",position:"right",fill:C.mute,fontSize:9}}/>{PLAYERS.map((p,i)=>!hid.has(p)&&<Line key={p} type="monotone" dataKey={p} stroke={PCOLORS[i]} strokeWidth={2} dot={{r:3,fill:PCOLORS[i],strokeWidth:0}} activeDot={{r:5}} animationDuration={400}/>)}</LineChart></ResponsiveContainer>
          </>}
          {sub==="delta"&&<>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>{PLAYERS.map((p,i)=><div key={p} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:PCOLORS[i]}}><div style={{width:10,height:10,background:PCOLORS[i],borderRadius:2}}/>{p}</div>)}</div>
            <ResponsiveContainer width="100%" height={260}><BarChart data={deltaData} margin={{top:10,right:10,left:0,bottom:14}} barSize={8} barGap={2} barCategoryGap="20%"><CartesianGrid strokeDasharray="3 3" stroke="#1e3a1e"/><XAxis dataKey="round" stroke="#3a6a3a" tick={({x,y,payload})=>!String(payload.value).includes(".")?<text x={x} y={y+10} textAnchor="middle" fill="#5a8a5a" fontSize={10}>{payload.value}</text>:null} label={{value:"Runde",position:"insideBottom",offset:-8,fill:C.dim,fontSize:10}}/><YAxis stroke="#3a6a3a" tick={{fill:"#5a8a5a",fontSize:10}} width={40}/><Tooltip content={<TD/>}/><ReferenceLine y={0} stroke="#3a6a3a" strokeWidth={1}/>{PLAYERS.map((p,i)=><Bar key={p} dataKey={p} fill={PCOLORS[i]} opacity={0.85} radius={[2,2,0,0]} animationDuration={400}/>)}</BarChart></ResponsiveContainer>
          </>}
          {sub==="verlauf"&&<div>{[...ROUNDS].reverse().map(r=>{const sm=Math.pow(2,r.sticht||0);const jm=r.jungfrauen>0?Math.pow(2,r.jungfrauen):1;const e=et(r);const cc=TYPE_CATS[r.typeCat]?.color||"#fff";return <div key={r.runde} style={ss.card()}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:4}}><span style={{fontSize:11,color:C.dim}}>Runde {r.runde}{r.name&&<span> · {r.name}</span>}{r.aussetzer&&<span style={{color:"#a080e0"}}> · {r.aussetzer} out</span>}{r.schneider&&<span> · Schndr.</span>{r.schwarz?" · Schwz.":""}{r.laufende>=2&&<span> · {r.laufende} Lfd.</span>}{r.sticht>0&&<span style={{color:"#d080e0"}}> · St×{sm}</span>}</span></div><div style={{fontSize:10,color:C.mute,marginBottom:6}}>Betrag: <strong style={{color:"#f5c842"}}>{r.betrag*sm*jm} Chips</strong>{r.solist&&<span style={{color:C.dim}}> · {r.solist}</span>}{r.spieler&&<span style={{color:C.dim}}> · {r.spieler}{r.partner&&<>+{r.partner}</>}</span>}</div><div style={{display:"grid",gridTemplateColumns:\`repeat(\${PLAYERS.length},1fr)\`,gap:6}}>{PLAYERS.map((p,i)=>{const d=r.deltas[p]||0;return <div key={p} style={{textAlign:"center"}}><div style={{fontSize:9,color:PCOLORS[i]}}>{p}</div><div style={{fontSize:16,fontWeight:"bold",color:d>0?"#7de87a":d<0?"#e85d4a":"#2a4a2a"}}>{d>0?"+":""}{d}</div></div>;})}</div></div>;})}
          </div>}
          <Stat/>
        </div>
      </div>;
    }
    window.addEventListener('load',function(){document.getElementById('loading').style.display='none';document.getElementById('root').style.display='block';});
    ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
`;
    

    function buildExportHTML(players,rounds,startkapital,tariff,gameTypes,settings={}){
      const dataJson=JSON.stringify({type:"schafkopf-data",players,fivePlayerMode:!!settings.fivePlayerMode||players.length===5,rounds,startkapital,tariff,gameTypes,forcePflichtramsch:!!settings.forcePflichtramsch,forcePflichtramschChance:Math.max(1,Number(settings.forcePflichtramschChance)||20),bockMode:!!settings.bockMode,bockAllowSolo:settings.bockAllowSolo!==false,bockAllowWenz:settings.bockAllowWenz!==false,bockAllowGeier:settings.bockAllowGeier!==false,bockAllowRamsch:settings.bockAllowRamsch!==false,nextRoundBock:!!settings.nextRoundBock,exportDate:new Date().toLocaleDateString("de-DE")});
      const typesJson=JSON.stringify(gameTypes);
      const date=new Date().toLocaleDateString("de-DE");
      return [
        '<!DOCTYPE html><html lang="de"><head>',
        '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>',
        '<title>Schafkopf · '+date+'<\/title>',
        '<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0b160b;overscroll-behavior:none}#root{min-height:100vh}#loading{display:flex;align-items:center;justify-content:center;height:100vh;font-family:monospace;color:#4a7a4a;font-size:13px;letter-spacing:2px}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0b160b}::-webkit-scrollbar-thumb{background:#2a4a2a;border-radius:2px}<\/style>',
        '<\/head><body>',
        '<div id="loading">LÄDT …<\/div><div id="root" style="display:none"><\/div>',
        '<script id="sk-data" type="application/json">'+dataJson+'<\/script>',
        '<script id="sk-types" type="application/json">'+typesJson+'<\/script>',
        '<script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script>',
        '<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script>',
        '<script src="https://unpkg.com/prop-types@15/prop-types.min.js" crossorigin><\/script>',
        '<script src="https://unpkg.com/recharts@2.12.7/umd/Recharts.js" crossorigin><\/script>',
        '<script src="https://unpkg.com/@babel/standalone@7.23.10/babel.min.js" crossorigin><\/script>',
        '<script type="text/babel" data-presets="react">',
        EXPORT_COMPONENT_CODE,
        '<\/script><\/body><\/html>'
      ].join('\n');
    }

