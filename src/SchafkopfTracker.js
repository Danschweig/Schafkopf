    function emptyForm(){return{spieler:null,partner:null,solist:null,verlierer:null,name:"",gewonnen:true,schneider:false,schwarz:false,laufende:0,jungfrauen:0,sticht:0,pflichtramsch:false,durchmarsch:false,mitFarbe:false,tout:false};}

    function SchafkopfTracker(){
      const getSaved=()=>{try{const s=localStorage.getItem(LS_KEY);if(s)return JSON.parse(s);}catch{}return null;};
      const sv=getSaved();
      const [nav,setNav]            = useState("home");
      const [players,setPlayers]    = useState(sv?.players||["Spieler 1","Spieler 2","Spieler 3","Spieler 4"]);
      const [tariff,setTariff]      = useState(sv?.tariff||{sl:25,sauspiel:25,solo:50});
      const [startkapital,setStart] = useState(sv?.startkapital||1500);
      const migrateRounds=(rs)=>{if(!rs)return[];return rs.map(r=>({...r,typeCat:r.typeCat==="solo"? (r.typeId==="wenz"?"solo2":"solo1"):r.typeCat}));};
      const migrateGameTypes=(gt)=>{if(!gt)return[];return gt.map(t=>({...t,cat:t.cat==="solo"?"solo1":t.cat,laufendeFrom:t.id==="geier"?2:t.laufendeFrom}));};
      const [rounds,setRounds]      = useState(migrateRounds(sv?.rounds)||[]);
      const [gameTypes,setGameTypes]= useState(()=>{const saved=sv?.gameTypes;if(saved&&saved.length>0)return migrateGameTypes(saved);return DEFAULT_GAME_TYPES;});
      const [yellowCards,setYellowCards]=useState(()=>Object.fromEntries((sv?.players||["Spieler 1","Spieler 2","Spieler 3","Spieler 4"]).map(p=>[p,sv?.yellowCards?.[p]||0])));
      const [selType,setSelType]    = useState(null);
      const [form,setForm]          = useState(emptyForm());
      const [editRound,setEditRound]= useState(null);
      const [aussetzer,setAussetzer]= useState(null); // Aussetzen-Modus
      const [aussetzenStep,setAussetzenStep]=useState(0);
      const [playTab,setPlayTab]=useState("2vs2");
      const [showInstallHint,setShowInstallHint]=useState(false);
      const [showCardPenalties,setShowCardPenalties]=useState(false);
      const [settingsTab,setSettingsTab]=useState("allg"); // 0=wer, 1=spieltyp
      const [themeMode,setThemeMode]=useState(sv?.themeMode||"dark");
      const [runeMode,setRuneMode]=useState(!!sv?.runeMode);
      const [forcePflichtramsch,setForcePflichtramsch]=useState(!!sv?.forcePflichtramsch);
      const [forcePflichtramschChance,setForcePflichtramschChance]=useState(()=>Math.max(1,Number(sv?.forcePflichtramschChance)||20));
      const [bockMode,setBockMode]=useState(!!sv?.bockMode);
      const [bockAllowSolo,setBockAllowSolo]=useState(sv?.bockAllowSolo!==false);
      const [bockAllowWenz,setBockAllowWenz]=useState(sv?.bockAllowWenz!==false);
      const [bockAllowGeier,setBockAllowGeier]=useState(sv?.bockAllowGeier!==false);
      const [bockAllowRamsch,setBockAllowRamsch]=useState(sv?.bockAllowRamsch!==false);
      const [nextRoundRamsch,setNextRoundRamsch]=useState({rolled:false,forced:false});
      const [nextRoundBock,setNextRoundBock]=useState(!!sv?.nextRoundBock);
      const [currentPflichtramsch,setCurrentPflichtramsch]=useState(false);
      const [currentBockRound,setCurrentBockRound]=useState(false);
      applyThemeMode(themeMode);

      useEffect(()=>{setYellowCards(cards=>Object.fromEntries(players.map(p=>[p,Math.min(1,cards[p]||0)])));},[players]);
      useEffect(()=>{setNextRoundRamsch({rolled:false,forced:false});},[forcePflichtramsch,forcePflichtramschChance]);
      useEffect(()=>{if(!bockMode){setNextRoundBock(false);setCurrentBockRound(false);}},[bockMode]);
      useEffect(()=>{
        if(!forcePflichtramsch)return;
        if(nav!=="home"||editRound||selType!==null||nextRoundRamsch.rolled)return;
        const chance=Math.max(1,Number(forcePflichtramschChance)||20);
        setNextRoundRamsch({rolled:true,forced:Math.random()<(1/chance)});
      },[forcePflichtramsch,forcePflichtramschChance,nav,editRound,selType,aussetzenStep,nextRoundRamsch.rolled]);
      useEffect(()=>{try{localStorage.setItem(LS_KEY,JSON.stringify({players,tariff,startkapital,rounds,gameTypes,yellowCards,themeMode,runeMode,forcePflichtramsch,forcePflichtramschChance,bockMode,bockAllowSolo,bockAllowWenz,bockAllowGeier,bockAllowRamsch,nextRoundBock}));}catch{}},[players,tariff,startkapital,rounds,gameTypes,yellowCards,themeMode,runeMode,forcePflichtramsch,forcePflichtramschChance,bockMode,bockAllowSolo,bockAllowWenz,bockAllowGeier,bockAllowRamsch,nextRoundBock]);
      useEffect(()=>{
        document.body.style.background=C.themeColor;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content",C.themeColor);
      },[themeMode]);
      useEffect(()=>{
        setRuneTextMode(runeMode);
        return ()=>setRuneTextMode(false);
      },[runeMode]);
      useEffect(()=>{
        const dismissed=localStorage.getItem("schafkopf-install-hint-dismissed")==="1";
        const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone;
        const mobile=window.matchMedia?.("(pointer: coarse)")?.matches||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        setShowInstallHint(!dismissed&&!standalone&&mobile);
      },[]);

      function dismissInstallHint(){
        try{localStorage.setItem("schafkopf-install-hint-dismissed","1");}catch{}
        setShowInstallHint(false);
      }

      const upd=(k,v)=>setForm(f=>({...f,[k]:v}));
      const updT=(k,v)=>setTariff(t=>({...t,[k]:v}));
      const forcedRamschActive=forcePflichtramsch&&nextRoundRamsch.rolled&&nextRoundRamsch.forced;
      const bockActive=bockMode&&nextRoundBock;
      const isBockAllowedType=(t)=>{
        if(!bockActive)return true;
        if(t.id==="wenz")return bockAllowWenz;
        if(t.id==="geier")return bockAllowGeier;
        if(t.cat==="ramsch")return bockAllowRamsch;
        if(t.cat==="solo1"||t.cat==="solo2")return bockAllowSolo;
        return false;
      };
      const updateBockAllowed=(key,val)=>{
        const next={solo:bockAllowSolo,wenz:bockAllowWenz,geier:bockAllowGeier,ramsch:bockAllowRamsch,[key]:val};
        if(!next.solo&&!next.wenz&&!next.geier&&!next.ramsch)return;
        setBockAllowSolo(next.solo);setBockAllowWenz(next.wenz);setBockAllowGeier(next.geier);setBockAllowRamsch(next.ramsch);
      };
      const startRound=(typeId)=>{
        const forced=forcedRamschActive&&typeId!=="ramsch";
        const actualType=forced?"ramsch":typeId;
        setSelType(actualType);
        setCurrentPflichtramsch(forcedRamschActive);
        setCurrentBockRound(bockActive&&!forcedRamschActive);
        setForm({...emptyForm(),pflichtramsch:forcedRamschActive});
        setEditRound(null);
        setAussetzer(null);
        setNav("entry");
      };
      useEffect(()=>{if(forcedRamschActive&&playTab!=="ramsch")setPlayTab("ramsch");},[forcedRamschActive,playTab]);
      useEffect(()=>{
        if(!bockActive)return;
        const hasSoloTypes=gameTypes.some(t=>(t.cat==="solo1"||t.cat==="solo2")&&isBockAllowedType(t));
        const hasRamschTypes=bockAllowRamsch&&gameTypes.some(t=>t.cat==="ramsch");
        const currentAllowed=(playTab==="solo"&&hasSoloTypes)||(playTab==="ramsch"&&hasRamschTypes);
        if(currentAllowed||playTab==="entry")return;
        const target=hasSoloTypes?"solo":hasRamschTypes?"ramsch":"solo";
        if(playTab!==target)setPlayTab(target);
      },[bockActive,bockAllowRamsch,gameTypes,playTab,bockAllowSolo,bockAllowWenz,bockAllowGeier]);
      useEffect(()=>{
        if(bockMode&&!bockAllowSolo&&!bockAllowWenz&&!bockAllowGeier&&!bockAllowRamsch)setBockAllowRamsch(true);
      },[bockMode,bockAllowSolo,bockAllowWenz,bockAllowGeier,bockAllowRamsch]);

      const konten=useMemo(()=>{const k=Object.fromEntries(players.map(p=>[p,startkapital]));rounds.forEach(r=>players.forEach(p=>k[p]+=(r.deltas[p]||0)));return k;},[rounds,players,startkapital]);
      const kontenForEdit=useMemo(()=>{if(!editRound)return konten;const k=Object.fromEntries(players.map(p=>[p,startkapital]));rounds.filter(r=>r.id!==editRound.id).forEach(r=>players.forEach(p=>k[p]+=(r.deltas[p]||0)));return k;},[rounds,players,startkapital,editRound,konten]);

      const roundSummary=useMemo(()=>{
        if(rounds.length===0) return null;
        let totalDelta=0; let bestWin=0; let worstLoss=0; let bestRound=null; let worstRound=null;
        rounds.forEach(r=>{
          const values=players.map(p=>r.deltas?.[p]||0);
          values.forEach(v=>{ totalDelta+=Math.abs(v); if(v>bestWin){bestWin=v; bestRound=r;} if(v<worstLoss){worstLoss=v; worstRound=r;} });
        });
        return {count:rounds.length, volume:totalDelta, avg:Math.round(totalDelta/rounds.length), bestWin, worstLoss, bestRound, worstRound};
      },[rounds,players]);

      const typeCfg=selType?gameTypes.find(t=>t.id===selType):null;
      const preview=useMemo(()=>{if(!typeCfg)return null;const b=calcBetrag(form,typeCfg,tariff);return calcDeltas(form,players,b,typeCfg,aussetzer);},[form,players,tariff,typeCfg,aussetzer]);

      function openEdit(round){if(round.cardPenalty)return;setEditRound(round);setSelType(round.typeId);setAussetzer(round.aussetzer||null);setCurrentPflichtramsch(!!round.pflichtramsch);setCurrentBockRound(!!round.bock);setForm({spieler:round.spieler||null,partner:round.partner||null,solist:round.solist||null,verlierer:round.verlierer||null,name:round.name||"",gewonnen:round.gewonnen??true,schneider:round.schneider||false,schwarz:round.schwarz||false,laufende:round.laufende||0,jungfrauen:round.jungfrauen||0,sticht:round.sticht||0,pflichtramsch:round.pflichtramsch||false,durchmarsch:round.durchmarsch||false,mitFarbe:round.mitFarbe||false,tout:round.tout||false});setNav("entry");}

      function saveRound(){
        if(!preview)return;
        const b=calcBetrag(form,typeCfg,tariff);
        const qualifiesBock=!editRound&&bockMode&&form.solist&&form.gewonnen===false&&typeCfg&&(typeCfg.cat==="solo1"||typeCfg.cat==="solo2");
        const savedForm={...form,pflichtramsch:form.pflichtramsch||currentPflichtramsch,bock:currentBockRound||qualifiesBock};
        if(editRound){
          setRounds(r=>r.map(round=>round.id===editRound.id?{...round,...savedForm,typeId:selType,typeLabel:typeCfg.label,typeCat:typeCfg.cat,aussetzer:aussetzer||null,betrag:b,deltas:preview}:round));
          setEditRound(null);setNav("verlauf");
        }else{
          setRounds(r=>[...r,{id:Date.now(),runde:r.length+1,typeId:selType,typeLabel:typeCfg.label,typeCat:typeCfg.cat,...savedForm,aussetzer:aussetzer||null,betrag:b,deltas:preview}]);
          setNav("home");
          setNextRoundRamsch({rolled:false,forced:false});
          setNextRoundBock(qualifiesBock);
        }
        setForm(emptyForm());setSelType(null);setAussetzer(null);setAussetzenStep(0);setCurrentPflichtramsch(false);setCurrentBockRound(false);
      }

      function cancelEntry(){setEditRound(null);setSelType(null);setForm(emptyForm());setAussetzer(null);setAussetzenStep(0);setCurrentPflichtramsch(false);setCurrentBockRound(false);setNav(editRound?"verlauf":"home");}

      function addCardPenalty(player,kind){
        const base=tariff.sauspiel;
        const prevYellow=yellowCards[player]||0;
        const deltas=Object.fromEntries(players.map(p=>[p,p===player?-(players.length-1)*base:base]));
        const label=kind==="gelbrot"?"Gelb-Rot":"Rot";
        setRounds(r=>[...r,{
          id:Date.now(),
          runde:r.length+1,
          typeId:"kartenstrafe",
          typeLabel:`${label}e Karte`,
          typeCat:"strafe",
          name:`${label}e Karte: ${player}`,
          cardPenalty:true,
          cardKind:kind,
          cardPlayer:player,
          prevYellow,
          spieler:player,
          betrag:base,
          deltas
        }]);
        setYellowCards(cards=>({...cards,[player]:0}));
      }

      function addYellowCard(player){
        if((yellowCards[player]||0)>=1)addCardPenalty(player,"gelbrot");
        else setYellowCards(cards=>({...cards,[player]:1}));
      }

      function addRedCard(player){addCardPenalty(player,"rot");}

      function clearPlayerCards(player){
        setYellowCards(cards=>({...cards,[player]:0}));
      }

      function undoLastRound(){
        setRounds(r=>{
          const last=r[r.length-1];
          if(last?.cardPenalty&&last.cardPlayer)setYellowCards(cards=>({...cards,[last.cardPlayer]:last.prevYellow||0}));
          return r.slice(0,-1);
        });
      }

      // Export
      function makeShareUrl(data){
        const base=window.location.href.split('#')[0];
        const json=JSON.stringify(data);
        if(window.LZString?.compressToEncodedURIComponent){
          return base+'#v1='+LZString.compressToEncodedURIComponent(json);
        }
        return base+'#json='+encodeURIComponent(json);
      }

      function exportData(){
        try{
          const data={
            players,rounds,startkapital,tariff,yellowCards,
            forcePflichtramsch,
            forcePflichtramschChance,
            bockMode,
            bockAllowSolo,
            bockAllowWenz,
            bockAllowGeier,
            bockAllowRamsch,
            nextRoundBock,
            gameTypes,
            exportDate:new Date().toLocaleDateString("de-DE")
          };
          const url=makeShareUrl(data);
          if(navigator.clipboard&&window.isSecureContext){
            navigator.clipboard.writeText(url)
              .then(()=>alert('Link kopiert! ✓\nEinfach per WhatsApp oder iMessage teilen.'))
              .catch(()=>prompt('Link zum Kopieren:',url));
          } else {
            prompt('Link zum Kopieren:',url);
          }
        }catch(err){
          alert("Link konnte nicht erstellt werden: "+err.message);
        }
      }

      function exportConfig(){
        const cfg={type:"schafkopf-config",players,tariff,startkapital,gameTypes,yellowCards,forcePflichtramsch,forcePflichtramschChance,bockMode,bockAllowSolo,bockAllowWenz,bockAllowGeier,bockAllowRamsch,nextRoundBock};
        const blob=new Blob([JSON.stringify(cfg,null,2)],{type:"application/json"});
        const a=document.createElement("a");a.href=URL.createObjectURL(blob);
        a.download=`schafkopf-config-${new Date().toISOString().slice(0,10)}.json`;a.click();
      }

      function exportSession(){
        const data={type:"schafkopf-session",players,rounds,startkapital,tariff,gameTypes,yellowCards,forcePflichtramsch,forcePflichtramschChance,bockMode,bockAllowSolo,bockAllowWenz,bockAllowGeier,bockAllowRamsch,nextRoundBock,exportDate:new Date().toLocaleDateString("de-DE")};
        const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
        const a=document.createElement("a");a.href=URL.createObjectURL(blob);
        a.download=`schafkopf-sicherung-${new Date().toISOString().slice(0,10)}.json`;a.click();
      }

      function importFile(e){
        const file=e.target.files[0];if(!file)return;
        const fileName=file.name.toLowerCase();
        const reader=new FileReader();
        reader.onload=ev=>{
          try{
            const text=ev.target.result;
            let data;
            if(fileName.endsWith(".html")){
              const parser=new DOMParser();
              const doc=parser.parseFromString(text,"text/html");
              const el=doc.getElementById("sk-data");
              if(el)data=JSON.parse(el.textContent);
            }else{
              data=JSON.parse(text);
            }
            if(!data)throw new Error("Keine Schafkopf-Daten gefunden.");
            if(Array.isArray(data)){
              const importedPlayers=Array.from(new Set(data.flatMap(r=>Object.keys(r.deltas||{})))).filter(Boolean);
              if(importedPlayers.length===4)setPlayers(importedPlayers);
              setRounds(migrateRounds(data));
            } else {
              let imported=false;
              if(Array.isArray(data.players)){setPlayers(data.players);imported=true;}
              if(data.tariff){setTariff(data.tariff);imported=true;}
              if(data.startkapital!=null){setStart(data.startkapital);imported=true;}
              if(Array.isArray(data.rounds)){setRounds(migrateRounds(data.rounds));imported=true;}
              if(Array.isArray(data.gameTypes)){setGameTypes(migrateGameTypes(data.gameTypes));imported=true;}
              if(data.forcePflichtramsch!=null){setForcePflichtramsch(!!data.forcePflichtramsch);imported=true;}
              if(data.forcePflichtramschChance!=null){setForcePflichtramschChance(Math.max(1,Number(data.forcePflichtramschChance)||20));imported=true;}
              if(data.bockMode!=null){setBockMode(!!data.bockMode);imported=true;}
              if(data.bockAllowSolo!=null){setBockAllowSolo(!!data.bockAllowSolo);imported=true;}
              if(data.bockAllowWenz!=null){setBockAllowWenz(!!data.bockAllowWenz);imported=true;}
              if(data.bockAllowGeier!=null){setBockAllowGeier(!!data.bockAllowGeier);imported=true;}
              if(data.bockAllowRamsch!=null){setBockAllowRamsch(!!data.bockAllowRamsch);imported=true;}
              if(data.nextRoundBock!=null){setNextRoundBock(!!data.nextRoundBock);imported=true;}
              if(data.yellowCards){setYellowCards(data.yellowCards);imported=true;}
              if(!imported)throw new Error("Unbekanntes Importformat.");
            }
          }catch(err){alert("Import fehlgeschlagen: "+err.message);}
          finally{e.target.value="";}
        };
        reader.readAsText(file);
      }

      const standings=players.map((p,i)=>({name:p,color:PCOLORS[i],value:konten[p],diff:konten[p]-startkapital})).sort((a,b)=>b.value-a.value);
      const playTabs=[...PLAY_TYPE_SECTIONS,{id:"aussetzen",label:"Aussetzen",color:"#a080e0",cats:[]}];
      const visiblePlayTabs=forcedRamschActive
        ?playTabs.filter(t=>t.id==="ramsch")
        :bockActive
          ?playTabs.filter(t=>(t.id==="solo"&&gameTypes.some(g=>(g.cat==="solo1"||g.cat==="solo2")&&isBockAllowedType(g)))||(t.id==="ramsch"&&bockAllowRamsch&&gameTypes.some(g=>g.cat==="ramsch")))
          :playTabs;
      const uiPlayTab=forcedRamschActive?"ramsch":visiblePlayTabs.some(t=>t.id===playTab)?playTab:visiblePlayTabs[0]?.id;
      const activePlayTab=visiblePlayTabs.find(t=>t.id===uiPlayTab)||visiblePlayTabs[0];

      return <div style={s.page}>
        <div style={s.topbar}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:9,color:C.mute,letterSpacing:3}}>SCHAFKOPF</div>
              <div style={{fontSize:15,fontWeight:"bold",color:C.title}}>
                {nav==="home"&&(aussetzenStep>0?`Aussetzen · ${aussetzenStep===1?"Wer?":"Spieltyp"}`:"Spieltyp wählen")}
                {nav==="entry"&&(editRound?`✏ ${typeCfg?.label||""}`:aussetzer?`⚬ ${typeCfg?.label||""} (${aussetzer} out)`:typeCfg?.label||"")}
                {nav==="verlauf"&&`Verlauf (${rounds.length})`}
                {nav==="chart"&&"Chart & Statistik"}
                {nav==="settings"&&"Einstellungen"}
              </div>
            </div>
            <div style={{textAlign:"right",fontSize:10,color:C.title}}>
              <div>S&L {tariff.sl} · Ssp {tariff.sauspiel} · Solo {tariff.solo}</div>
            </div>
          </div>
          <div style={{background:C.roundBg,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",margin:"8px 0",textAlign:"center"}}>
            <span style={{fontSize:9,color:C.dim,letterSpacing:2,marginRight:8}}>RUNDE</span>
            <span style={{fontSize:22,fontWeight:"bold",color:C.subText}}>{rounds.length}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {standings.map((p,i)=><div key={p.name} style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:p.color}}>{p.name}</div>
              <div style={{fontSize:14,fontWeight:"bold",color:C.title}}>{p.value.toLocaleString("de-DE")}</div>
              <div style={{fontSize:10,color:p.diff>=0?"#7de87a":"#e85d4a"}}>{p.diff>=0?"+":""}{p.diff}</div>
            </div>)}
          </div>
        </div>

        {showInstallHint&&<div style={{margin:"10px 16px 0",background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:"bold",color:C.subText,marginBottom:2}}>Zum Home-Bildschirm hinzufügen</div>
            <div style={{fontSize:10,lineHeight:1.3,color:C.dim}}>Im Browser-Menü teilen und als App speichern.</div>
          </div>
          <button onClick={dismissInstallHint} aria-label="Hinweis schließen" style={{background:"transparent",border:`1px solid ${C.border}`,color:C.dim,borderRadius:6,width:30,height:30,cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
        </div>}

        <div style={{padding:"14px 16px"}}>

          {/* HOME */}
          {nav==="home"&&aussetzenStep===0&&<>
            {rounds.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
              <div style={s.card()}><div style={{fontSize:9,color:C.dim}}>Letzte Runde</div><div style={{fontSize:14,fontWeight:"bold"}}>{rounds[rounds.length-1].name||`Runde ${rounds[rounds.length-1].runde}`}</div></div>
              <div style={s.card()}><div style={{fontSize:9,color:C.dim}}>Aktuelle Führung</div><div style={{fontSize:14,fontWeight:"bold"}}>{Object.entries(konten).sort((a,b)=>b[1]-a[1])[0][0]}</div></div>
              <div style={s.card()}><div style={{fontSize:9,color:C.dim}}>Gesamtvolumen</div><div style={{fontSize:14,fontWeight:"bold"}}>{roundSummary?roundSummary.volume.toLocaleString("de-DE"):"0"} Chips</div></div>
            </div>}
            <div style={{...s.card("#d8a92855",C.mode==="light"?"#fff8df":"#1f1a0f"),padding:"9px 10px"}}>
              <button
                onClick={()=>setShowCardPenalties(v=>!v)}
                style={{width:"100%",background:"transparent",border:"none",padding:0,cursor:"pointer",textAlign:"left"}}
                aria-expanded={showCardPenalties}
                aria-label="Kartenstrafen ein- oder ausklappen"
              >
                <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                    <div style={s.sec}>Kartenstrafen</div>
                    <div style={{fontSize:11,color:C.dim}}>{showCardPenalties?"▾":"▸"}</div>
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
                    {y>0&&<button aria-label={`${p} gelbe Karte zurücksetzen`} title="Zuruecksetzen" onClick={()=>clearPlayerCards(p)} style={{...s.btn(false,"#8a8a8a"),padding:"4px 7px",fontSize:10,minWidth:28}}>×</button>}
                  </div>
                </div>;})}
              </div>}
            </div>
            {(forcedRamschActive||bockActive)&&<div style={{...s.card(forcedRamschActive?"#a080e044":"#6aa86a44",forcedRamschActive?C.purpleBg:"#edf5e7"),marginBottom:10,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:forcedRamschActive?"#a080e0":"#2e5b36",fontWeight:"bold",marginBottom:4}}>{forcedRamschActive?"Pflichtramsch !!!":"Bock !!!"}</div>
              <div style={{fontSize:11,color:C.dim}}>
                {forcedRamschActive
                  ?"Diese Runde ist fest auf Ramsch gesetzt. Andere Spiele sind in dieser Runde nicht verfuegbar."
                  :"Die naechste Runde ist eine Bock-Runde. Erlaubt sind nur die aktivierten Bock-Spielarten."}
              </div>
            </div>}
            <div style={{display:"grid",gridTemplateColumns:`repeat(${visiblePlayTabs.length},1fr)`,gap:6,marginBottom:12}}>
              {visiblePlayTabs.map(tab=><button key={tab.id} onClick={()=>setPlayTab(tab.id)}
                style={{...s.subTab(uiPlayTab===tab.id),padding:"9px 4px",fontSize:10,color:uiPlayTab===tab.id?tab.color:C.dim,borderColor:uiPlayTab===tab.id?tab.color:C.border}}>
                {tab.label}
              </button>)}
            </div>
            {uiPlayTab!=="aussetzen"
              ?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                {gameTypes.filter(t=>activePlayTab.cats.includes(t.cat)&&isBockAllowedType(t)).map(t=>{const typeColor=TYPE_CATS[t.cat]?.color||activePlayTab.color;return <div key={t.id}
                  onClick={()=>startRound(t.id)}
                  style={{background:typeColor+"0e",border:`1px solid ${typeColor}33`,borderRadius:8,padding:"10px",cursor:"pointer",minHeight:72}}>
                  <div style={{fontSize:15,fontWeight:"bold",color:typeColor,marginBottom:3}}>{t.label}</div>
                  <div style={{fontSize:10,lineHeight:1.25,color:C.dim}}>{t.desc}</div>
                </div>;})}
              </div>
              :<div style={{...s.card("#a080e044",C.purpleBg),marginBottom:10}}>
                <div style={{fontSize:10,color:"#a080e0",fontWeight:"bold",marginBottom:6}}>⚬ AUSSETZEN</div>
                <div style={{fontSize:11,color:C.dim,marginBottom:10}}>Ein Spieler hat 6 Spatz – die anderen 3 spielen.</div>
                <button onClick={()=>setAussetzenStep(1)} style={{...s.btn(false,"#a080e0"),width:"100%",padding:11}}>Aussetzen starten</button>
              </div>}
            {rounds.length>0&&<button onClick={undoLastRound} style={{...s.btn(false,"#9a5a5a"),width:"100%",padding:10,marginTop:4}}>↩ Letzte Runde rückgängig</button>}
          </>}

          {/* AUSSETZEN – Schritt 1: Wer sitzt aus? */}
          {nav==="home"&&aussetzenStep===1&&<>
            <div style={s.card("#a080e044",C.purpleBg)}>
              <div style={s.sec}>Wer sitzt aus? (6 Spatz, kein Trumpf)</div>
              <div style={{display:"flex",gap:6,marginBottom:16}}>
                {players.map((p,i)=><button key={p}
                  style={s.pBtn(aussetzer===p,"#a080e0")}
                  onClick={()=>setAussetzer(aussetzer===p?null:p)}>{p}</button>)}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setAussetzer(null);setAussetzenStep(0);}} style={{...s.btn(false,"#5a5a8a"),padding:"10px 14px"}}>← Zurück</button>
                <button onClick={()=>aussetzer&&setAussetzenStep(2)} disabled={!aussetzer}
                  style={{...s.btn(!!aussetzer,"#a080e0"),flex:1,padding:10}}>
                  Weiter → Spieltyp wählen
                </button>
              </div>
            </div>
          </>}

          {/* AUSSETZEN – Schritt 2: Spieltyp */}
          {nav==="home"&&aussetzenStep===2&&<>
            <div style={{...s.card("#a080e044",C.purpleBg),marginBottom:12}}>
              <div style={{fontSize:12,color:"#a080e0"}}>⚬ {aussetzer} sitzt aus · {players.filter(p=>p!==aussetzer).join(", ")} spielen</div>
            </div>
            {forcedRamschActive&&<div style={{...s.card("#a080e044",C.purpleBg),marginBottom:10,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#a080e0",fontWeight:"bold",marginBottom:4}}>Pflichtramsch !!!</div>
              <div style={{fontSize:11,color:C.dim}}>Diese Runde ist fest auf Ramsch gesetzt. Andere Spiele sind in dieser Runde nicht verfuegbar.</div>
            </div>}
            {(forcedRamschActive
              ?PLAY_TYPE_SECTIONS.filter(catInfo=>catInfo.id==="ramsch")
              :bockActive
                ?PLAY_TYPE_SECTIONS.filter(catInfo=>catInfo.id==="solo"||catInfo.id==="ramsch")
                :PLAY_TYPE_SECTIONS
            ).map(catInfo=><div key={catInfo.id} style={{marginBottom:14}}>
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
            <button onClick={()=>setAussetzenStep(1)} style={{...s.btn(false,"#5a5a8a"),width:"100%",padding:10}}>← Zurück</button>
          </>}

          {/* EINTRAGEN */}
          {nav==="entry"&&typeCfg&&<EntryForm form={form} upd={upd} players={players} tariff={tariff}
            konten={editRound?kontenForEdit:konten} typeCfg={typeCfg} preview={preview}
            onSave={saveRound} onBack={cancelEntry} isEdit={!!editRound} roundNr={rounds.length+1} aussetzer={aussetzer}
            forcedPflichtramsch={currentPflichtramsch} forcedBockRound={currentBockRound}/>}

          {/* VERLAUF */}
          {nav==="verlauf"&&(rounds.length===0
            ?<div style={{textAlign:"center",color:C.mute,padding:40}}>Noch keine Runden.</div>
            :[...rounds].reverse().map(r=>{
              const sm=Math.pow(2,r.sticht||0);const jm=r.jungfrauen>0?Math.pow(2,r.jungfrauen):1;
              const catColor=TYPE_CATS[r.typeCat]?.color||"#fff";const et=effectiveType(r);
              return <div key={r.id||r.runde} onClick={()=>openEdit(r)} style={{...s.card(),cursor:r.cardPenalty?"default":"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,flexWrap:"wrap",gap:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,color:C.dim}}>Runde {r.runde}</span>
                    {r.aussetzer&&<span style={{fontSize:9,color:"#a080e0",background:"#a080e022",border:"1px solid #a080e044",borderRadius:8,padding:"1px 6px"}}>⚬ {r.aussetzer}</span>}
                    {!r.cardPenalty&&<button onClick={(e)=>{e.stopPropagation();openEdit(r);}} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.dim,borderRadius:5,padding:"4px 9px",cursor:"pointer",fontSize:11,fontFamily:"'Courier New',monospace"}}>Bearbeiten</button>}
                  </div>
                  <span style={{fontSize:11,color:catColor}}>
                    {et.label}{r.cardPenalty&&<span> · {r.cardPlayer}</span>}{r.tout&&<span style={{color:"#ff8c42"}}> Tout</span>}
                    {!r.cardPenalty&&r.typeCat!=="ramsch"&&(r.gewonnen?" · ✓":" · ✗")}
                    {r.schneider?" · Schndr.":""}{r.schwarz?" · Schwz.":""}{r.laufende>=2&&<span> · {r.laufende} Lfd.</span>}
                    {r.sticht>0&&<span style={{color:"#d080e0"}}> · Sticht ×{sm}</span>}
                    {r.typeCat==="ramsch"&&r.jungfrauen>0?` · ${r.jungfrauen} Jungfr.`:""}
                    {r.pflichtramsch?" · Pflichtramsch":""}{r.bock?" · Bock":""}{r.durchmarsch?" · Durchm.":""}
                  </span>
                </div>
                <div style={{fontSize:10,color:C.mute,marginBottom:6}}>
                  {r.cardPenalty?<span><strong style={{color:"#ff8c42"}}>{r.cardPlayer}</strong> zahlt <strong style={{color:"#f5c842"}}>{r.betrag} Chips</strong> an jeden anderen Spieler.</span>:<span>Betrag: <strong style={{color:"#f5c842"}}>{r.betrag*sm*jm} Chips</strong></span>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {players.map((p,i)=>{const d=r.deltas[p]||0;return <div key={p} style={{textAlign:"center"}}>
                    <div style={{fontSize:9,color:r.aussetzer===p?"#a080e0":PCOLORS[i]}}>{p}{r.aussetzer===p?" ⚬":""}</div>
                    <div style={{fontSize:16,fontWeight:"bold",color:r.aussetzer===p?"#a080e0":d>0?"#7de87a":d<0?"#e85d4a":C.zero}}>{r.aussetzer===p?"–":d>0?`+${d}`:d}</div>
                  </div>;})}</div>
              </div>;
            })
          )}

          {nav==="chart"&&<ChartTab rounds={rounds} players={players} startkapital={startkapital} gameTypes={gameTypes}/>}

          {/* EINSTELLUNGEN */}
          {nav==="settings"&&<>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <button style={s.subTab(settingsTab==="allg")} onClick={()=>setSettingsTab("allg")}>Allgemein</button>
              <button style={s.subTab(settingsTab==="spiele")} onClick={()=>setSettingsTab("spiele")}>Spielarten</button>
            </div>
            {settingsTab==="allg"&&<>
              <div style={s.card()}>
                <div style={s.sec}>Darstellung</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <button style={{...s.btn(themeMode==="dark"),padding:10}} onClick={()=>setThemeMode("dark")}>Dunkel</button>
                  <button style={{...s.btn(themeMode==="light"),padding:10}} onClick={()=>setThemeMode("light")}>Hell</button>
                </div>
                <Toggle label="Nordische Runen" value={runeMode} onChange={setRuneMode}/>
                <div style={{fontSize:10,color:C.dim,lineHeight:1.35}}>
                  {runeMode?"Sichtbare Texte werden als Runen dargestellt; gespeicherte Daten bleiben normal.":themeMode==="light"?"Heller Modus mit klaren Kontrasten fuer Tageslicht.":"Dunkler Modus fuer ruhige Runden am Tisch."}
                </div>
              </div>
              <div style={s.card()}>
                <div style={s.sec}>Rundenregel</div>
                <Toggle label="Pflichtramsch aktiv" value={forcePflichtramsch} onChange={setForcePflichtramsch}/>
                <div style={{marginTop:8}}>
                  <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Wahrscheinlichkeit</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"center"}}>
                    <input
                      style={s.input}
                      type="number"
                      min="1"
                      max="1000"
                      value={forcePflichtramschChance}
                      onChange={e=>setForcePflichtramschChance(Math.max(1,Number(e.target.value)||20))}
                    />
                    <div style={{fontSize:11,color:C.text,whiteSpace:"nowrap"}}>1/{forcePflichtramschChance}</div>
                  </div>
                </div>
                <div style={{fontSize:10,color:C.dim,lineHeight:1.35}}>
                  Wenn aktiv, kann jede neue Runde zufaellig als Pflichtramsch starten. Dann sind andere Spiele fuer diese Runde gesperrt.
                </div>
              </div>
              <div style={s.card()}>
                <div style={s.sec}>Bock</div>
                <Toggle label="Bock aktiv" value={bockMode} onChange={setBockMode}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8}}>
                  <Toggle label="Solo" value={bockAllowSolo} onChange={v=>updateBockAllowed("solo",v)} small/>
                  <Toggle label="Wenz" value={bockAllowWenz} onChange={v=>updateBockAllowed("wenz",v)} small/>
                  <Toggle label="Geier" value={bockAllowGeier} onChange={v=>updateBockAllowed("geier",v)} small/>
                  <Toggle label="Ramsch" value={bockAllowRamsch} onChange={v=>updateBockAllowed("ramsch",v)} small/>
                </div>
                <div style={{fontSize:10,color:C.dim,lineHeight:1.35,marginTop:8}}>
                  Nach einem verlorenen eigenen Solo, Wenz oder Geier wird die naechste Runde als Bock markiert. Hier legst du fest, welche Spielarten dann sichtbar bleiben.
                </div>
              </div>
              <div style={s.card()}>
                <div style={s.sec}>Spielernamen</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {players.map((p,i)=><div key={i}>
                    <div style={{fontSize:9,color:PCOLORS[i],marginBottom:4}}>Spieler {i+1}</div>
                    <input style={{...s.input,borderColor:PCOLORS[i]+"55"}} value={p} onChange={e=>setPlayers(pl=>pl.map((n,j)=>j===i?e.target.value:n))}/>
                  </div>)}
                </div>
              </div>
              <div style={s.card()}>
                <div style={s.sec}>Tarif</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  {[["Schneider & Lfd.","sl"],["Sauspiel","sauspiel"],["Solo1","solo"]].map(([label,key])=><div key={key}>
                    <div style={{fontSize:9,color:C.dim,marginBottom:4}}>{label}</div>
                    <input style={s.input} type="number" value={tariff[key]} onChange={e=>updT(key,Number(e.target.value))}/>
                  </div>)}
                </div>
                <div style={{fontSize:9,color:C.mute,marginTop:10,display:"flex",alignItems:"center",gap:8}}>
                  Standard: S&L 25 · Sauspiel 25 · Solo 50
                  <button onClick={()=>setTariff({sl:25,sauspiel:25,solo:50})} style={{...s.btn(false),padding:"3px 8px",fontSize:9}}>Reset</button>
                </div>
              </div>
              <div style={s.card()}>
                <div style={s.sec}>Startkapital</div>
                <input style={s.input} type="number" value={startkapital} onChange={e=>setStart(Number(e.target.value))}/>
              </div>
            </>}
            {settingsTab==="spiele"&&<>
              <div style={s.card()}>
                <div style={s.sec}>Spielarten</div>
                <GameTypeEditor gameTypes={gameTypes} setGameTypes={setGameTypes} tariff={tariff}/>
              </div>
            </>}

            <div style={s.card()}>
              <div style={s.sec}>Daten</div>
              <div style={{fontSize:10,color:C.dim,marginBottom:6}}>Export</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <button onClick={exportData} style={{...s.btn(false,"#7de87a"),padding:10}}>📤 Link teilen</button>
                <button onClick={exportSession} style={{...s.btn(false,"#7de87a"),padding:10}}>💾 Sicherung exportieren</button>
              </div>
              <button onClick={exportConfig} style={{...s.btn(false,"#5a9a5a"),width:"100%",padding:10,marginBottom:12}}>⚙ Einstellungen exportieren</button>
              <div style={{fontSize:10,color:C.dim,marginBottom:6}}>Import</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8,marginBottom:12}}>
                <label style={{...s.btn(false,"#4ab8e8"),padding:10,textAlign:"center",cursor:"pointer"}}>
                  ↑ Datei importieren<input type="file" accept=".json,.html" style={{display:"none"}} onChange={importFile}/>
                </label>
              </div>
              <div style={{fontSize:10,color:C.dim,marginBottom:6}}>Löschen</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{if(window.confirm("Alle Runden löschen?"))setRounds([]);}}
                  style={{...s.btn(false,"#e85d4a"),flex:1,padding:8}}>🗑 Alle Runden löschen</button>
                <button onClick={()=>{if(window.confirm("Alles zurücksetzen? Runden UND Einstellungen werden auf Standard zurückgesetzt.")){
                  setPlayers(["Spieler 1","Spieler 2","Spieler 3","Spieler 4"]);
                  setTariff({sl:25,sauspiel:25,solo:50});
                  setStart(1500);
                  setGameTypes(DEFAULT_GAME_TYPES);
                  setYellowCards(Object.fromEntries(["Spieler 1","Spieler 2","Spieler 3","Spieler 4"].map(p=>[p,0])));
                  setForcePflichtramsch(false);
                  setForcePflichtramschChance(20);
                  setBockMode(false);
                  setBockAllowSolo(true);
                  setBockAllowWenz(true);
                  setBockAllowGeier(true);
                  setBockAllowRamsch(true);
                  setNextRoundBock(false);
                  setNextRoundRamsch({rolled:false,forced:false});
                  setCurrentPflichtramsch(false);
                  setCurrentBockRound(false);
                  setRounds([]);
                }}} style={{...s.btn(false,"#e85d4a"),flex:1,padding:8}}>🔄 Alles zurücksetzen</button>
              </div>
            </div>
          </>}

        </div>

        <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.navBg,borderTop:`1px solid ${C.border}`,display:"flex",boxShadow:C.mode==="light"?"0 -2px 12px rgba(35,70,35,0.08)":"none"}}>
          {[["home","🂡","Spiel"],["verlauf",`📋 ${rounds.length}`,"Verlauf"],["chart","📊","Chart"],["settings","⚙","Einst."]].map(([key,icon,label])=><button key={key}
            style={s.navBtn(nav===key||(nav==="entry"&&key==="home")||(aussetzenStep>0&&key==="home"))}
            onClick={()=>{if(nav==="entry")cancelEntry();else{setAussetzer(null);setAussetzenStep(0);}setNav(key);if(key!=="entry")setSelType(null);}}>
            <div style={{fontSize:16}}>{icon}</div><div>{label}</div>
          </button>)}
        </div>
      </div>;
    }


    // ── Viewer-Modus (URL-Hash) ──────────────────────────────────
