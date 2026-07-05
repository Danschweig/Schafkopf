    function SettingsView({
      settingsTab,setSettingsTab,themeMode,setThemeMode,runeMode,setRuneMode,
      forcePflichtramsch,setForcePflichtramsch,forcePflichtramschChance,setForcePflichtramschChance,
      bockMode,setBockMode,bockAllowSolo,bockAllowWenz,bockAllowGeier,bockAllowRamsch,updateBockAllowed,
      players,setPlayers,fivePlayerMode,setFivePlayerMode,tariff,setTariff,updT,startkapital,setStart,
      gameTypes,setGameTypes,exportData,exportSession,exportConfig,importFile,
      setYellowCards,setRounds,setNextRoundBock,setNextRoundRamsch,setCurrentPflichtramsch,setCurrentBockRound,
      setBockAllowSolo,setBockAllowWenz,setBockAllowGeier,setBockAllowRamsch
    }){
      return <>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <button style={s.subTab(settingsTab==="allg")} onClick={()=>setSettingsTab("allg")}>Allgemein</button>
          <button style={s.subTab(settingsTab==="spiele")} onClick={()=>setSettingsTab("spiele")}>Spielarten</button>
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

        <DataSettings
          players={players} setPlayers={setPlayers} setTariff={setTariff} setStart={setStart}
          setGameTypes={setGameTypes} setYellowCards={setYellowCards} setRounds={setRounds}
          setFivePlayerMode={setFivePlayerMode}
          setForcePflichtramsch={setForcePflichtramsch} setForcePflichtramschChance={setForcePflichtramschChance}
          setBockMode={setBockMode} setBockAllowSolo={setBockAllowSolo} setBockAllowWenz={setBockAllowWenz}
          setBockAllowGeier={setBockAllowGeier} setBockAllowRamsch={setBockAllowRamsch}
          setNextRoundBock={setNextRoundBock} setNextRoundRamsch={setNextRoundRamsch}
          setCurrentPflichtramsch={setCurrentPflichtramsch} setCurrentBockRound={setCurrentBockRound}
          exportData={exportData} exportSession={exportSession} exportConfig={exportConfig} importFile={importFile}/>
      </>;
    }

    function GeneralSettings({
      themeMode,setThemeMode,runeMode,setRuneMode,
      forcePflichtramsch,setForcePflichtramsch,forcePflichtramschChance,setForcePflichtramschChance,
      bockMode,setBockMode,bockAllowSolo,bockAllowWenz,bockAllowGeier,bockAllowRamsch,updateBockAllowed,
      players,setPlayers,fivePlayerMode,setFivePlayerMode,tariff,setTariff,updT,startkapital,setStart
    }){
      function changeFivePlayerMode(enabled){
        if(enabled){setFivePlayerMode(true);return;}
        if(!fivePlayerMode){setFivePlayerMode(false);return;}
        if(players.length<=4){setFivePlayerMode(false);return;}
        const list=players.map((p,i)=>`${i+1}: ${p}`).join("\n");
        const raw=window.prompt(`Welcher Spieler soll entfernt werden?\n\n${list}\n\nBitte Nummer 1-${players.length} eingeben:`,String(players.length));
        if(raw==null)return;
        const idx=Number(raw)-1;
        if(!Number.isInteger(idx)||idx<0||idx>=players.length){
          alert("Ungueltige Auswahl. Der 5-Spieler-Modus bleibt aktiv.");
          return;
        }
        const removed=players[idx];
        if(!window.confirm(`${removed} entfernen und 5-Spieler-Modus ausschalten?`))return;
        setPlayers(ps=>ps.filter((_,i)=>i!==idx).slice(0,4));
        setFivePlayerMode(false);
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
