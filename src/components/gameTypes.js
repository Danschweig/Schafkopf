    // ── Spielart-Edit-Panel ──────────────────────────────────────
    function GameTypeEditPanel({type,onChange,onSave,onCancel,tariff}){
      const upd=(k,v)=>onChange(t=>({...t,[k]:v}));
      const base=type.useDefaultTariff?(type.cat==="2vs2"?tariff.sauspiel:tariff.solo):(type.customBetrag||25);
      return <div style={{...s.card("#2a5a2a",C.successBg),margin:"8px 0"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <div><div style={{fontSize:9,color:C.dim,marginBottom:4}}>Name</div><input style={s.input} value={type.label} onChange={e=>upd("label",e.target.value)}/></div>
          <div><div style={{fontSize:9,color:C.dim,marginBottom:4}}>Beschreibung</div><input style={s.input} value={type.desc||""} onChange={e=>upd("desc",e.target.value)}/></div>
        </div>
        <div style={s.sec}>Gruppe</div>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {Object.entries(TYPE_CATS).map(([cat,info])=><button key={cat} style={{...s.btn(type.cat===cat,info.color),flex:1}} onClick={()=>upd("cat",cat)}>{info.label}</button>)}
        </div>
        {type.cat!=="ramsch"&&<>
          <div style={s.sec}>Spielfunktionen</div>
          <Toggle label="Schneider / Schwarz" value={type.hasSchneiderSchwarz} onChange={v=>upd("hasSchneiderSchwarz",v)} small/>
          <Toggle label="Laufende" value={type.hasLaufende} onChange={v=>upd("hasLaufende",v)} small/>
          {type.hasLaufende&&<div style={{marginLeft:12,marginBottom:8}}>
            <Stepper label="Laufende ab" value={type.laufendeFrom||3} min={1} max={8} onChange={v=>upd("laufendeFrom",v)} color="#f5c842" small/>
          </div>}
          {(type.cat==="solo1"||type.cat==="solo2")&&<>
            <Toggle label="Mit Farbe-Option" value={type.hasFarbe} onChange={v=>upd("hasFarbe",v)} small/>
            <Toggle label="Tout-Option (×2)" value={type.hasTout} onChange={v=>upd("hasTout",v)} small/>
          </>}
        </>}
        <div style={s.sec}>Tarif</div>
        <Toggle label={`Standard-Tarif (${base} Chips)`} value={type.useDefaultTariff} onChange={v=>upd("useDefaultTariff",v)} small/>
        {!type.useDefaultTariff&&<div style={{marginLeft:12,marginBottom:8}}>
          <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Eigener Betrag (Chips)</div>
          <input style={{...s.input,width:120}} type="number" value={type.customBetrag||0} onChange={e=>upd("customBetrag",Number(e.target.value))}/>
        </div>}
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button onClick={()=>onSave(type)} style={{...s.btn(true,"#5a9a5a"),flex:1}}>✓ Speichern</button>
          <button onClick={onCancel} style={{...s.btn(false,"#5a5a8a"),padding:"8px 14px"}}>✕</button>
        </div>
      </div>;
    }

    // ── Spielarten-Editor ────────────────────────────────────────
    function GameTypeEditor({gameTypes,setGameTypes,tariff}){
      const [editing,setEditing]=useState(null);
      const [editBuf,setEditBuf]=useState(null);
      const [showNew,setShowNew]=useState(false);
      const [newBuf,setNewBuf]=useState(null);

      function moveType(id,dir){setGameTypes(ts=>{const a=[...ts];const i=a.findIndex(t=>t.id===id);const ni=i+dir;if(ni<0||ni>=a.length)return a;[a[i],a[ni]]=[a[ni],a[i]];return a;});}
      function startEdit(t){setEditing(t.id);setEditBuf({...t});setShowNew(false);}
      function saveEdit(updated){setGameTypes(ts=>ts.map(t=>t.id===updated.id?updated:t));setEditing(null);setEditBuf(null);}
      function deleteType(id){if(window.confirm("Spielart löschen?"))setGameTypes(ts=>ts.filter(t=>t.id!==id));}
      function startNew(){setShowNew(true);setNewBuf({id:"custom_"+Date.now(),label:"Neues Spiel",desc:"",cat:"solo1",isBuiltin:false,hasFarbe:false,hasTout:false,hasSchneiderSchwarz:true,hasLaufende:true,laufendeFrom:3,useDefaultTariff:true,customBetrag:null});setEditing(null);}
      function saveNew(t){setGameTypes(ts=>[...ts,t]);setShowNew(false);setNewBuf(null);}

      return <div>
        {gameTypes.map((t,i)=>{
          const catInfo=TYPE_CATS[t.cat]||{color:"#888",label:t.cat};
          const isEdit=editing===t.id;
          return <div key={t.id}>
            <div style={{...s.card(),display:"flex",alignItems:"center",gap:8,padding:"10px 12px",marginBottom:4}}>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <button style={{...s.btn(false),padding:"2px 6px",fontSize:10,lineHeight:1}} onClick={()=>moveType(t.id,-1)} disabled={i===0}>↑</button>
                <button style={{...s.btn(false),padding:"2px 6px",fontSize:10,lineHeight:1}} onClick={()=>moveType(t.id,1)} disabled={i===gameTypes.length-1}>↓</button>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:"bold",color:catInfo.color}}>{t.label}</div>
                <div style={{fontSize:9,color:C.dim}}>{t.desc}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:9,color:catInfo.color,background:catInfo.color+"22",border:`1px solid ${catInfo.color}44`,borderRadius:10,padding:"2px 7px"}}>{catInfo.label}</span>
                <button style={{...s.btn(isEdit,"#5a9a5a"),padding:"5px 8px"}} onClick={()=>isEdit?(setEditing(null),setEditBuf(null)):startEdit(t)}>✏</button>
                {!t.isBuiltin&&<button style={{...s.btn(false,"#e85d4a"),padding:"5px 8px"}} onClick={()=>deleteType(t.id)}>🗑</button>}
              </div>
            </div>
            {isEdit&&editBuf&&<GameTypeEditPanel type={editBuf} onChange={setEditBuf} onSave={saveEdit} onCancel={()=>{setEditing(null);setEditBuf(null);}} tariff={tariff}/>}
          </div>;
        })}
        {showNew&&newBuf&&<GameTypeEditPanel type={newBuf} onChange={setNewBuf} onSave={saveNew} onCancel={()=>{setShowNew(false);setNewBuf(null);}} tariff={tariff}/>}
        <button onClick={startNew} style={{...s.btn(false,"#4ab8e8"),width:"100%",padding:10,marginTop:6}}>+ Neues Spiel anlegen</button>
      </div>;
    }

