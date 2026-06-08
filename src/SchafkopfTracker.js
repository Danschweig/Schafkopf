    function emptyForm(){return{spieler:null,partner:null,solist:null,verlierer:null,name:"",gewonnen:true,schneider:false,schwarz:false,laufende:0,jungfrauen:0,sticht:0,pflichtramsch:false,durchmarsch:false,mitFarbe:false,tout:false};}

    function renamePlayerRefs(value,renameMap){
      if(typeof value!=="string"||!renameMap.has(value))return value;
      return renameMap.get(value);
    }

    function migrateRoundPlayerRefs(round,renameMap){
      if(!round||renameMap.size===0)return round;
      const deltas=round.deltas?Object.entries(round.deltas).reduce((acc,[name,delta])=>{
        const key=renameMap.get(name)||name;
        acc[key]=(acc[key]||0)+delta;
        return acc;
      },{}):round.deltas;
      const migrated={
        ...round,
        spieler:renamePlayerRefs(round.spieler,renameMap),
        partner:renamePlayerRefs(round.partner,renameMap),
        solist:renamePlayerRefs(round.solist,renameMap),
        verlierer:renamePlayerRefs(round.verlierer,renameMap),
        cardPlayer:renamePlayerRefs(round.cardPlayer,renameMap),
        aussetzer:renamePlayerRefs(round.aussetzer,renameMap),
        deltas
      };
      if(round.cardPenalty&&migrated.cardPlayer){
        const label=round.cardKind==="gelbrot"?"Gelb-Rot":"Rot";
        migrated.name=`${label}e Karte: ${migrated.cardPlayer}`;
      }
      return migrated;
    }

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
      const prevPlayersRef=useRef(players);
      applyThemeMode(themeMode);

      useEffect(()=>{
        const prevPlayers=prevPlayersRef.current;
        if(prevPlayers===players)return;
        const renameMap=new Map();
        prevPlayers.forEach((oldName,i)=>{
          const newName=players[i];
          if(oldName&&newName&&oldName!==newName)renameMap.set(oldName,newName);
        });
        if(renameMap.size>0){
          setRounds(rs=>rs.map(r=>migrateRoundPlayerRefs(r,renameMap)));
          setYellowCards(cards=>Object.fromEntries(players.map((p,i)=>[p,Math.min(1,cards[prevPlayers[i]]||cards[p]||0)])));
          setForm(f=>({
            ...f,
            spieler:renamePlayerRefs(f.spieler,renameMap),
            partner:renamePlayerRefs(f.partner,renameMap),
            solist:renamePlayerRefs(f.solist,renameMap),
            verlierer:renamePlayerRefs(f.verlierer,renameMap)
          }));
          setAussetzer(a=>renamePlayerRefs(a,renameMap));
          setEditRound(er=>er?migrateRoundPlayerRefs(er,renameMap):er);
        }
        prevPlayersRef.current=players;
      },[players]);
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
              .then(()=>alert('Link kopiert! OK\nEinfach per WhatsApp oder iMessage teilen.'))
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

      const standings=players.map((p,i)=>({name:p,color:PCOLORS[i],value:konten[p],diff:konten[p]-startkapital}));
      const playTabs=[...PLAY_TYPE_SECTIONS,{id:"aussetzen",label:"Aussetzen",color:"#a080e0",cats:[]}];
      const visiblePlayTabs=forcedRamschActive
        ?playTabs.filter(t=>t.id==="ramsch")
        :bockActive
          ?playTabs.filter(t=>(t.id==="solo"&&gameTypes.some(g=>(g.cat==="solo1"||g.cat==="solo2")&&isBockAllowedType(g)))||(t.id==="ramsch"&&bockAllowRamsch&&gameTypes.some(g=>g.cat==="ramsch")))
          :playTabs;
      const uiPlayTab=forcedRamschActive?"ramsch":visiblePlayTabs.some(t=>t.id===playTab)?playTab:visiblePlayTabs[0]?.id;
      const activePlayTab=visiblePlayTabs.find(t=>t.id===uiPlayTab)||visiblePlayTabs[0];

      return <div style={s.page}>
        <TopBar
          nav={nav} aussetzenStep={aussetzenStep} editRound={editRound} typeCfg={typeCfg}
          aussetzer={aussetzer} rounds={rounds} tariff={tariff} standings={standings}/>
        <InstallHint show={showInstallHint} onDismiss={dismissInstallHint}/>

        <div style={{padding:"14px 16px"}}>
          {nav==="home"&&<HomeView
            rounds={rounds} roundSummary={roundSummary} konten={konten} players={players} tariff={tariff}
            showCardPenalties={showCardPenalties} setShowCardPenalties={setShowCardPenalties}
            yellowCards={yellowCards} addYellowCard={addYellowCard} addRedCard={addRedCard} clearPlayerCards={clearPlayerCards}
            forcedRamschActive={forcedRamschActive} bockActive={bockActive}
            visiblePlayTabs={visiblePlayTabs} uiPlayTab={uiPlayTab} setPlayTab={setPlayTab}
            activePlayTab={activePlayTab} gameTypes={gameTypes} isBockAllowedType={isBockAllowedType}
            startRound={startRound} undoLastRound={undoLastRound}
            aussetzenStep={aussetzenStep} setAussetzenStep={setAussetzenStep}
            aussetzer={aussetzer} setAussetzer={setAussetzer}/>} 

          {nav==="entry"&&typeCfg&&<EntryForm form={form} upd={upd} players={players} tariff={tariff}
            konten={editRound?kontenForEdit:konten} typeCfg={typeCfg} preview={preview}
            onSave={saveRound} onBack={cancelEntry} isEdit={!!editRound} roundNr={rounds.length+1} aussetzer={aussetzer}
            forcedPflichtramsch={currentPflichtramsch} forcedBockRound={currentBockRound}/>} 

          {nav==="verlauf"&&<HistoryView rounds={rounds} players={players} openEdit={openEdit}/>} 

          {nav==="chart"&&<ChartTab rounds={rounds} players={players} startkapital={startkapital} gameTypes={gameTypes}/>} 

          {nav==="settings"&&<SettingsView
            settingsTab={settingsTab} setSettingsTab={setSettingsTab}
            themeMode={themeMode} setThemeMode={setThemeMode} runeMode={runeMode} setRuneMode={setRuneMode}
            forcePflichtramsch={forcePflichtramsch} setForcePflichtramsch={setForcePflichtramsch}
            forcePflichtramschChance={forcePflichtramschChance} setForcePflichtramschChance={setForcePflichtramschChance}
            bockMode={bockMode} setBockMode={setBockMode}
            bockAllowSolo={bockAllowSolo} bockAllowWenz={bockAllowWenz} bockAllowGeier={bockAllowGeier} bockAllowRamsch={bockAllowRamsch}
            updateBockAllowed={updateBockAllowed}
            setBockAllowSolo={setBockAllowSolo} setBockAllowWenz={setBockAllowWenz}
            setBockAllowGeier={setBockAllowGeier} setBockAllowRamsch={setBockAllowRamsch}
            players={players} setPlayers={setPlayers}
            tariff={tariff} setTariff={setTariff} updT={updT}
            startkapital={startkapital} setStart={setStart}
            gameTypes={gameTypes} setGameTypes={setGameTypes}
            yellowCards={yellowCards} setYellowCards={setYellowCards}
            setRounds={setRounds} setNextRoundBock={setNextRoundBock} setNextRoundRamsch={setNextRoundRamsch}
            setCurrentPflichtramsch={setCurrentPflichtramsch} setCurrentBockRound={setCurrentBockRound}
            exportData={exportData} exportSession={exportSession} exportConfig={exportConfig} importFile={importFile}/>} 
        </div>

        <BottomNav
          nav={nav} roundsCount={rounds.length} aussetzenStep={aussetzenStep}
          setNav={setNav} setSelType={setSelType} setAussetzer={setAussetzer}
          setAussetzenStep={setAussetzenStep} cancelEntry={cancelEntry}/>
      </div>;
    }

    // â”€â”€ Viewer-Modus (URL-Hash) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
