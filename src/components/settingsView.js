    function SettingsView({
      settingsTab,setSettingsTab,themeMode,setThemeMode,runeMode,setRuneMode,
      forcePflichtramsch,setForcePflichtramsch,forcePflichtramschChance,setForcePflichtramschChance,
      bockMode,setBockMode,bockAllowSolo,bockAllowWenz,bockAllowGeier,bockAllowRamsch,updateBockAllowed,
      players,setPlayers,fivePlayerMode,setFivePlayerMode,tariff,setTariff,updT,startkapital,setStart,
      gameTypes,setGameTypes,exportData,exportSession,exportConfig,importFile,
      setYellowCards,setRounds,setNextRoundBock,setNextRoundRamsch,setCurrentPflichtramsch,setCurrentBockRound,
      setBockAllowSolo,setBockAllowWenz,setBockAllowGeier,setBockAllowRamsch,online
    }){
      return <>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <button style={s.subTab(settingsTab==="allg")} onClick={()=>setSettingsTab("allg")}>Allgemein</button>
          <button style={s.subTab(settingsTab==="spiele")} onClick={()=>setSettingsTab("spiele")}>Spielarten</button>
          <button style={s.subTab(settingsTab==="online")} onClick={()=>setSettingsTab("online")}>Online</button>
        </div>

        {settingsTab==="allg"&&<GeneralSettings
          themeMode={themeMode} setThemeMode={setThemeMode} runeMode={runeMode} setRuneMode={setRuneMode}
          forcePflichtramsch={forcePflichtramsch} setForcePflichtramsch={setForcePflichtramsch}
          forcePflichtramschChance={forcePflichtramschChance} setForcePflichtramschChance={setForcePflichtramschChance}
          bockMode={bockMode} setBockMode={setBockMode}
          bockAllowSolo={bockAllowSolo} bockAllowWenz={bockAllowWenz} bockAllowGeier={bockAllowGeier} bockAllowRamsch={bockAllowRamsch}
          updateBockAllowed={updateBockAllowed}
          players={players} setPlayers={setPlayers} fivePlayerMode={fivePlayerMode} setFivePlayerMode={setFivePlayerMode}
          tariff={tariff} setTariff={setTariff} updT={updT}
          startkapital={startkapital} setStart={setStart}/>}

        {settingsTab==="spiele"&&<div style={s.card()}>
          <div style={s.sec}>Spielarten</div>
          <GameTypeEditor gameTypes={gameTypes} setGameTypes={setGameTypes} tariff={tariff}/>
        </div>}

        {settingsTab==="online"&&<OnlineSettings online={online}/>}

        {settingsTab!=="online"&&<DataSettings
          players={players} setPlayers={setPlayers} setTariff={setTariff} setStart={setStart}
          setGameTypes={setGameTypes} setYellowCards={setYellowCards} setRounds={setRounds}
          setFivePlayerMode={setFivePlayerMode}
          setForcePflichtramsch={setForcePflichtramsch} setForcePflichtramschChance={setForcePflichtramschChance}
          setBockMode={setBockMode} setBockAllowSolo={setBockAllowSolo} setBockAllowWenz={setBockAllowWenz}
          setBockAllowGeier={setBockAllowGeier} setBockAllowRamsch={setBockAllowRamsch}
          setNextRoundBock={setNextRoundBock} setNextRoundRamsch={setNextRoundRamsch}
          setCurrentPflichtramsch={setCurrentPflichtramsch} setCurrentBockRound={setCurrentBockRound}
          exportData={exportData} exportSession={exportSession} exportConfig={exportConfig} importFile={importFile}/>}
      </>;
    }

    function OnlineSettings({online}){
      const connecting=online.status==="connecting";
      const connected=online.status==="online";
      return <>
        <div style={s.card(connected?"#7de87a55":C.border,connected?C.successBg:C.bg1)}>
          <div style={s.sec}>Firebase Online-Modus</div>
          <div style={{fontSize:11,color:C.dim,lineHeight:1.45,marginBottom:12}}>
            Optionaler gemeinsamer Spielstand fuer mehrere Geraete. Runden, Spieler, Tarife, Spielarten und Rundenregeln werden in Echtzeit synchronisiert. Darstellung und gerade offene Eingabeformulare bleiben lokal.
          </div>

          {connected?<div>
            <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Aktueller Raumcode</div>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
              <div style={{flex:1,fontSize:22,fontWeight:"bold",letterSpacing:3,color:"#7de87a",background:C.inputBg,border:`1px solid #7de87a55`,borderRadius:7,padding:"9px 10px",textAlign:"center"}}>{online.roomCode}</div>
              <button onClick={online.copyRoomCode} style={{...s.btn(false,"#4ab8e8"),padding:11}}>Kopieren</button>
            </div>
            <div style={{fontSize:10,color:C.dim,marginBottom:12}}>
              Diesen Code auf den anderen Geraeten unter „Raum beitreten“ eingeben.
            </div>
            <button onClick={online.disconnect} style={{...s.btn(false,"#e85d4a"),width:"100%",padding:10}}>Online-Raum verlassen</button>
          </div>:<div>
            <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Firebase-Webkonfiguration</div>
            <textarea
              style={{...s.input,minHeight:132,resize:"vertical",fontSize:10,lineHeight:1.35}}
              value={online.configText}
              onChange={e=>online.setConfigText(e.target.value)}
              spellCheck={false}
              placeholder={'{\n  "apiKey": "...",\n  "authDomain": "...",\n  "projectId": "...",\n  "appId": "..."\n}'}
            />
            <div style={{fontSize:9,color:C.mute,lineHeight:1.35,margin:"6px 0 12px"}}>
              Du kannst das Objekt aus der Firebase-Konsole direkt einfuegen. Es wird nur auf diesem Geraet gespeichert. Fuer eine feste Installation kann es in src/firebaseConfig.js hinterlegt werden.
            </div>

            <button disabled={connecting} onClick={online.createRoom}
              style={{...s.btn(false,"#7de87a"),width:"100%",padding:11,marginBottom:12,opacity:connecting?0.6:1}}>
              {connecting?"Firebase wird verbunden ...":"Neuen Raum mit diesem Spielstand erstellen"}
            </button>

            <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Vorhandenem Raum beitreten</div>
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8}}>
              <input
                style={{...s.input,textTransform:"uppercase",letterSpacing:2}}
                value={online.roomInput}
                maxLength={10}
                onChange={e=>online.setRoomInput(e.target.value)}
                placeholder="RAUMCODE"
              />
              <button disabled={connecting||online.roomInput.length!==10} onClick={online.joinRoom}
                style={{...s.btn(false,"#4ab8e8"),padding:"8px 12px",opacity:(connecting||online.roomInput.length!==10)?0.45:1}}>
                Beitreten
              </button>
            </div>
          </div>}

          {online.error&&<div style={{marginTop:10,fontSize:10,lineHeight:1.35,color:"#e85d4a",background:"#e85d4a12",border:"1px solid #e85d4a44",borderRadius:6,padding:8}}>
            {online.error}
          </div>}
        </div>

        <div style={s.card()}>
          <div style={s.sec}>Firebase vorbereiten</div>
          <div style={{fontSize:10,color:C.dim,lineHeight:1.5}}>
            1. Firebase-Web-App anlegen.<br/>
            2. Cloud Firestore erstellen.<br/>
            3. Anonyme Anmeldung aktivieren.<br/>
            4. Die Regeln aus firebase.rules veroeffentlichen.<br/>
            5. Webkonfiguration oben einfuegen oder in firebaseConfig.js hinterlegen.
          </div>
        </div>
      </>;
    }

    function GeneralSettings({
      themeMode,setThemeMode,runeMode,setRuneMode,
      forcePflichtramsch,setForcePflichtramsch,forcePflichtramschChance,setForcePflichtramschChance,
      bockMode,setBockMode,bockAllowSolo,bockAllowWenz,bockAllowGeier,bockAllowRamsch,updateBockAllowed,
      players,setPlayers,fivePlayerMode,setFivePlayerMode,tariff,setTariff,updT,startkapital,setStart
    }){
      const [removeFivePlayerMode,setRemoveFivePlayerMode]=useState(false);
      function changeFivePlayerMode(enabled){
        if(enabled){setRemoveFivePlayerMode(false);setFivePlayerMode(true);return;}
        if(!fivePlayerMode){setFivePlayerMode(false);return;}
        if(players.length<=4){setFivePlayerMode(false);return;}
        setRemoveFivePlayerMode(true);
      }
      function removePlayerAndDisable(idx){
        setPlayers(ps=>ps.filter((_,i)=>i!==idx).slice(0,4));
        setFivePlayerMode(false);
        setRemoveFivePlayerMode(false);
      }
      return <>
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
          <Toggle label="5-Spieler-Modus" value={fivePlayerMode} onChange={changeFivePlayerMode}/>
          <div style={{fontSize:10,color:C.dim,lineHeight:1.35,marginBottom:10}}>
            Aktiviert einen fuenften Spieler. Vor jeder Runde wird abgefragt, wer aussetzt; die Abrechnung laeuft dann fuer die vier aktiven Spieler.
          </div>
          {removeFivePlayerMode&&fivePlayerMode&&players.length>4&&<div style={{...s.card("#a080e044",C.purpleBg),marginTop:8,marginBottom:10}}>
            <div style={{fontSize:10,color:"#a080e0",fontWeight:"bold",marginBottom:6}}>Welcher Spieler soll entfernt werden?</div>
            <div style={{fontSize:10,color:C.dim,lineHeight:1.35,marginBottom:10}}>
              Waehle den Spieler, der aus der aktuellen Runde entfernt werden soll. Bestehende alte Runden bleiben unveraendert gespeichert.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:6}}>
              {players.map((p,i)=><button key={p} onClick={()=>removePlayerAndDisable(i)} style={{...s.btn(false,PCOLORS[i]||"#a080e0"),padding:10,textAlign:"left"}}>
                Spieler {i+1}: {p} entfernen
              </button>)}
            </div>
            <button onClick={()=>setRemoveFivePlayerMode(false)} style={{...s.btn(false,"#5a5a8a"),width:"100%",padding:9,marginTop:8}}>Abbrechen</button>
          </div>}
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
            Standard: S&L 25 - Sauspiel 25 - Solo 50
            <button onClick={()=>setTariff({sl:25,sauspiel:25,solo:50})} style={{...s.btn(false),padding:"3px 8px",fontSize:9}}>Reset</button>
          </div>
        </div>

        <div style={s.card()}>
          <div style={s.sec}>Startkapital</div>
          <input style={s.input} type="number" value={startkapital} onChange={e=>setStart(Number(e.target.value))}/>
        </div>
      </>;
    }

    function DataSettings({
      setPlayers,setTariff,setStart,setGameTypes,setYellowCards,setRounds,setFivePlayerMode,
      setForcePflichtramsch,setForcePflichtramschChance,setBockMode,
      setBockAllowSolo,setBockAllowWenz,setBockAllowGeier,setBockAllowRamsch,
      setNextRoundBock,setNextRoundRamsch,setCurrentPflichtramsch,setCurrentBockRound,
      exportData,exportSession,exportConfig,importFile
    }){
      return <div style={s.card()}>
        <div style={s.sec}>Daten</div>
        <div style={{fontSize:10,color:C.dim,marginBottom:6}}>Export</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <button onClick={exportData} style={{...s.btn(false,"#7de87a"),padding:10}}>Link teilen</button>
          <button onClick={exportSession} style={{...s.btn(false,"#7de87a"),padding:10}}>Sicherung exportieren</button>
        </div>
        <button onClick={exportConfig} style={{...s.btn(false,"#5a9a5a"),width:"100%",padding:10,marginBottom:12}}>Einstellungen exportieren</button>
        <div style={{fontSize:10,color:C.dim,marginBottom:6}}>Import</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8,marginBottom:12}}>
          <label style={{...s.btn(false,"#4ab8e8"),padding:10,textAlign:"center",cursor:"pointer"}}>
            Datei importieren<input type="file" accept=".json,.html" style={{display:"none"}} onChange={importFile}/>
          </label>
        </div>
        <div style={{fontSize:10,color:C.dim,marginBottom:6}}>Loeschen</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{if(window.confirm("Alle Runden loeschen?"))setRounds([]);}}
            style={{...s.btn(false,"#e85d4a"),flex:1,padding:8}}>Alle Runden loeschen</button>
          <button onClick={()=>{if(window.confirm("Alles zuruecksetzen? Runden UND Einstellungen werden auf Standard zurueckgesetzt.")){
            const defaultPlayers=["Spieler 1","Spieler 2","Spieler 3","Spieler 4"];
            setPlayers(defaultPlayers);
            setFivePlayerMode(false);
            setTariff({sl:25,sauspiel:25,solo:50});
            setStart(1500);
            setGameTypes(DEFAULT_GAME_TYPES);
            setYellowCards(Object.fromEntries(defaultPlayers.map(p=>[p,0])));
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
          }}} style={{...s.btn(false,"#e85d4a"),flex:1,padding:8}}>Alles zuruecksetzen</button>
        </div>
      </div>;
    }
