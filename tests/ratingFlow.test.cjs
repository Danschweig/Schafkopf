const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const crypto=require("node:crypto");
const React=require("react");
const {create,act}=require("react-test-renderer");
const Babel=require("@babel/standalone");
const root=path.resolve(__dirname,"..");
const players=["Anna","Ben","Clara","David"];
const oldDeal={id:"historic",createdAt:100,dealer:"Anna",ratings:{Ben:7,Clara:5}};

function app(saved={players,dealRatings:[oldDeal]},existingStorage,configure=()=>{}){
  const storage=existingStorage||new Map([["schafkopf-v1",JSON.stringify(saved)]]);
  const context={React,crypto,console,setTimeout,clearTimeout,
    Recharts:Object.fromEntries(["LineChart","Line","XAxis","YAxis","CartesianGrid","Tooltip","ReferenceLine","ResponsiveContainer","BarChart","Bar"].map(name=>[name,()=>null])),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    document:{currentScript:{src:"http://localhost/src/cardScanner.js"},body:{style:{}},querySelector:()=>({setAttribute(){}})},
    URL,AbortController,
    navigator:{userAgent:"Node integration test"},matchMedia:()=>({matches:false}),
    location:{hash:"",href:"http://localhost/"},confirm:()=>true
  };
  context.window=context;
  vm.createContext(context);
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  for(const [,attributes,file] of html.matchAll(/<script([^>]*?)src="([^"]+)"[^>]*>/g)){
    if(file.startsWith("https:")||["src/main.js","src/registerServiceWorker.js"].includes(file))continue;
    const source=fs.readFileSync(path.join(root,file),"utf8");
    vm.runInContext(attributes.includes('type="text/babel"')?Babel.transform(source,{presets:["react"],filename:file}).code:source,context,{filename:file});
  }
  configure(context);
  let rendered;
  act(()=>{rendered=create(React.createElement(context.SchafkopfTracker),{
    createNodeMock:element=>element.type==="dialog"?{showModal(){},close(){}}:null
  });});
  return {rendered,context,storage,state:()=>JSON.parse(storage.get("schafkopf-v1"))};
}
const text=node=>typeof node==="string"?node:node.children.map(text).join("");
const button=(app,label)=>{
  const match=app.rendered.root.findAllByType("button").find(node=>typeof label==="string"?text(node)===label:label.test(text(node)));
  assert.ok(match,`Missing button: ${label}`);
  return match;
};
const click=node=>{assert.ok(!node.props.disabled,"Cannot click a disabled button");act(()=>node.props.onClick());};
const card=(app,label)=>app.rendered.root.findAllByType("button").find(node=>node.props["aria-label"]===label);
const confirmation=app=>button(app,/^Bewertung bestätigen/);
const open=app=>click(button(app,/Austeilen$/));
const privateState=instance=>JSON.parse(instance.storage.get("schafkopf-private-ratings-v1")||"{}");
function enterSauspiel(instance){
  click(button(instance,/Spiel$/));
  act(()=>instance.rendered.root.findByType(instance.context.HomeView).props.startRound("sauspiel"));
  act(()=>instance.rendered.root.findByType(instance.context.EntryForm).props.upd("spieler","Ben"));
  act(()=>instance.rendered.root.findByType(instance.context.EntryForm).props.upd("partner","Clara"));
  click(button(instance,/Runde \d+ eintragen$/));
}

test("full app: pick eight cards, explicitly confirm, replace and reload without exposing cards",()=>{
  const instance=app();
  open(instance);
  assert.match(text(instance.rendered.root),/Manuell · Altbestand/);
  click(button(instance,/^Ben7,0/));
  assert.equal(button(instance,"Karten auswählen").props["aria-pressed"],true);
  assert.ok(button(instance,"Karten fotografieren"));
  assert.equal(confirmation(instance).props.disabled,true);
  const hand=["Eichel-Unter","Gras-Unter","Herz-Ass","Herz-Zehn","Eichel-Ass","Eichel-Zehn","Schellen-König","Gras-Neun"];
  for(const label of hand.slice(0,7))click(card(instance,label));
  assert.match(text(instance.rendered.root),/7 von 8 Karten/);
  assert.equal(confirmation(instance).props.disabled,true);
  assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
  click(card(instance,hand[7]));
  assert.match(text(instance.rendered.root),/8 von 8 Karten/);
  assert.match(text(instance.rendered.root),/6,8 \/ 10/);
  assert.equal(card(instance,"Herz-Sieben").props.disabled,true);
  assert.equal(card(instance,"Gras-Neun").props["aria-pressed"],true);
  assert.equal(confirmation(instance).props.disabled,false);
  // Preview never writes, even once the hand is complete.
  assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
  click(confirmation(instance));
  let entries=instance.state().dealRatings;
  assert.equal(entries.length,1);
  assert.equal(entries[0].ratings.Ben,6.8);
  assert.equal(entries[0].ratings.Clara,5);
  assert.equal(entries[0].ratingMeta.Ben.method,"automatic");
  assert.equal(entries[0].ratingMeta.Ben.algorithmVersion,"hand-v2");
  assert.deepEqual(entries[0].ratingMeta.Ben.rules,{deck:"long",sauspiel:true,hochzeit:true,wenz:true,farbwenz:true,geier:true,farbsolo:true,ramsch:false});
  assert.ok(!JSON.stringify(entries).includes("eichel-"));
  click(confirmation(instance));
  assert.deepEqual(instance.state().dealRatings,entries);
  // The same card toggles off, removing the final preview and disabling save.
  click(card(instance,"Gras-Neun"));
  assert.equal(confirmation(instance).props.disabled,true);
  assert.equal(card(instance,"Herz-Sieben").props.disabled,false);
  assert.match(text(instance.rendered.root),/7 von 8 Karten/);
  act(()=>instance.rendered.unmount());
  const restored=app(undefined,instance.storage);
  open(restored);
  assert.match(text(restored.rendered.root),/Automatisch · hand-v2/);
  click(button(restored,/^Ben6,8/));
  assert.match(text(restored.rendered.root),/0 von 8 Karten/);
  assert.equal(confirmation(restored).props.disabled,true);
  assert.deepEqual(restored.state().dealRatings,entries);
  click(button(restored,"Manuell bewerten"));
  click(card(restored,"Ben: 4 von 10"));
  click(confirmation(restored));
  entries=restored.state().dealRatings;
  assert.equal(entries.length,1);
  assert.deepEqual(entries[0].ratings,{Ben:4,Clara:5});
  assert.equal(entries[0].ratingMeta.Ben.method,"manual");
  assert.equal(entries[0].ratingMeta.Ben.algorithmVersion,"manual-v1");
  assert.equal(restored.context.SchafkopfDealRatings.dealerStats(players,entries).Anna.count,2);
  act(()=>restored.rendered.unmount());
});

test("full app: create shared empty dealing, choose players, keep each rating separate",()=>{
  const instance=app({players,dealRatings:[]});
  open(instance);
  assert.equal(button(instance,"Neue Austeilung anlegen").props.disabled,true);
  // Selecting the dealer alone never creates or saves an entry.
  click(button(instance,"Anna"));
  assert.equal(instance.state().dealRatings.length,0);
  click(button(instance,"Neue Austeilung anlegen"));
  let entry=instance.state().dealRatings[0];
  assert.equal(entry.dealer,"Anna");
  assert.equal(entry.id,entry.roundId);
  assert.deepEqual(entry.ratings,{});
  click(button(instance,/^BenVerdeckt/));
  assert.equal(button(instance,"Karten auswählen").props["aria-pressed"],true);
  click(button(instance,"Manuell bewerten"));
  click(card(instance,"Ben: 8 von 10"));
  assert.deepEqual(instance.state().dealRatings[0].ratings,{});
  click(confirmation(instance));
  click(button(instance,/^ClaraVerdeckt/));
  assert.equal(confirmation(instance).props.disabled,true);
  assert.equal(button(instance,"Karten auswählen").props["aria-pressed"],true);
  assert.ok(button(instance,"Karten fotografieren"));
  click(button(instance,"Manuell bewerten"));
  click(card(instance,"Clara: 3 von 10"));
  click(confirmation(instance));
  entry=instance.state().dealRatings[0];
  assert.deepEqual(entry.ratings,{});
  assert.deepEqual(Object.fromEntries(privateState(instance)[entry.id].map(item=>[item.player,item.score])),{Ben:8,Clara:3});
  assert.equal(instance.state().dealRatings.length,1);
  assert.match(text(instance.rendered.root),/0 bewertete Austeilungen/);
  enterSauspiel(instance);
  assert.equal(instance.state().completedDeals[entry.id],instance.state().rounds[0].id);
  assert.equal(instance.state().rounds[0].dealId,entry.id);
  open(instance);
  assert.match(text(instance.rendered.root),/5,5 \(2\)/);
  act(()=>instance.rendered.unmount());
});

test("full app: player rename preserves score, metadata and dealer reference",()=>{
  const instance=app();
  open(instance);
  click(button(instance,/^Ben7,0/));
  click(button(instance,"Manuell bewerten"));
  click(card(instance,"Ben: 9 von 10"));
  click(confirmation(instance));
  click(button(instance,/Einst\.$/));
  const nameInput=instance.rendered.root.findAllByType("input").find(node=>node.props.value==="Ben");
  assert.ok(nameInput);
  act(()=>nameInput.props.onChange({target:{value:"Benedikt"}}));
  const entry=instance.state().dealRatings[0];
  assert.equal(entry.ratings.Benedikt,9);
  assert.equal(entry.ratingMeta.Benedikt.algorithmVersion,"manual-v1");
  assert.ok(!Object.hasOwn(entry.ratings,"Ben"));
  assert.ok(!Object.hasOwn(entry.ratingMeta,"Ben"));
  act(()=>instance.rendered.unmount());
});

test("full app: changing rules recomputes a preview but saves only after confirmation",()=>{
  const instance=app();
  open(instance);
  click(button(instance,/^Ben7,0/));
  click(button(instance,"Karten auswählen"));
  for(const label of ["Eichel-Unter","Gras-Unter","Herz-Ass","Herz-Zehn","Eichel-Ass","Eichel-Zehn","Schellen-König","Gras-Neun"])click(card(instance,label));
  assert.match(text(instance.rendered.root),/6,8 \/ 10/);
  click(button(instance,"Wenz berücksichtigen: an"));
  assert.equal(button(instance,"Wenz berücksichtigen: aus").props["aria-checked"],false);
  assert.match(text(instance.rendered.root),/5,2 \/ 10/);
  assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
  click(confirmation(instance));
  assert.equal(instance.state().dealRatings[0].ratings.Ben,5.2);
  assert.equal(instance.state().dealRatings[0].ratingMeta.Ben.rules.wenz,false);
  act(()=>instance.rendered.unmount());
});

// Deterministic transport and timers: these exercise the real Tracker effects,
// not just the pure merge helper, without talking to the live shared database.
async function onlineApp(local={players,dealRatings:[oldDeal]},server=local){
  const storage=new Map([["schafkopf-v1",JSON.stringify(local)],["schafkopf-firebase-room-v1","ABCDE"]]);
  const timers=new Map();
  const writes=[];
  const privateWrites=[],privateListeners=new Map(),privateValues={};
  let timerId=0;
  let receive;
  let firstReceive;
  let fail;
  let revision=1;
  let instance;
  const client={
    uid:"test-device",
    async joinRoom(code,onState,onError){receive=onState;firstReceive??=onState;fail=onError;onState(server,{roomCode:code,revision});return code;},
    async saveState(state,baseState,baseRevision){
      writes.push(JSON.parse(JSON.stringify({state,baseState,baseRevision})));
      return {state,revision:baseRevision+1};
    },
    async submitPrivateRating(dealId,player,score,meta){
      const saved={player,score,meta,ownerId:"test-device"};privateWrites.push({dealId,...saved});
      privateValues[dealId]=[...(privateValues[dealId]||[]).filter(item=>item.player!==player),saved];
      privateListeners.get(dealId)?.(privateValues[dealId]);return saved;
    },
    watchPrivateRatings(dealId,next){privateListeners.set(dealId,next);next(privateValues[dealId]||[]);return ()=>privateListeners.delete(dealId);},
    disconnect(){privateListeners.clear();},watchRooms(){return ()=>{};}
  };
  await act(async()=>{
    instance=app(local,storage,context=>{
      context.setTimeout=(callback,delay)=>{const id=++timerId;timers.set(id,{callback,delay});return id;};
      context.clearTimeout=id=>timers.delete(id);
      context.SchafkopfFirebase.createClient=async()=>client;
    });
  });
  return {...instance,writes,client,privateWrites,
    async emitPrivate(dealId,values){await act(async()=>privateListeners.get(dealId)?.(values));},
    async emit(state,nextRevision=revision+1){revision=nextRevision;await act(async()=>receive(state,{roomCode:"ABCDE",revision}));},
    async fail(error){await act(async()=>fail(error));},
    async emitFromFirst(state){await act(async()=>firstReceive(state,{roomCode:"ABCDE",revision:100}));},
    runTimer(){
      const [id,timer]=[...timers][0];
      timers.delete(id);
      return timer.callback();
    },
    async flush(){
      const queued=[...timers];
      for(const [id,timer] of queued){
        if(!timers.delete(id))continue;
        await act(async()=>timer.callback());
      }
    }
  };
}
function rateBen(instance,score=9){
  open(instance);
  click(button(instance,/^Ben7,0/));
  click(button(instance,"Manuell bewerten"));
  click(card(instance,`Ben: ${score} von 10`));
  click(confirmation(instance));
}

test("online: remote edits cannot discard a confirmed rating awaiting upload",async()=>{
  const instance=await onlineApp();
  try{
    rateBen(instance);
    const remote=instance.context.SchafkopfDealRatings.upsertRating(
      instance.context.SchafkopfDealRatings.normalizeDealRatings([oldDeal]),"historic","Clara",3,
      {method:"manual",algorithmVersion:"manual-v1",rules:null});
    await instance.emit({players,dealRatings:remote});
    assert.equal(instance.state().dealRatings[0].ratings.Ben,9);
    assert.equal(instance.state().dealRatings[0].ratings.Clara,3);
    await instance.flush();
    assert.equal(instance.writes.length,1);
    assert.deepEqual(instance.writes[0].state.dealRatings[0].ratings,{Ben:9,Clara:3});
    assert.equal(instance.writes[0].baseRevision,2);
  }finally{act(()=>instance.rendered.unmount());}
});

test("online: acknowledgement of an older save keeps newer local confirmations",async()=>{
  const instance=await onlineApp();
  try{
    rateBen(instance);
    await instance.flush();
    assert.equal(instance.writes.length,1);
    click(card(instance,"Ben: 4 von 10"));
    click(confirmation(instance));
    await instance.emit(instance.writes[0].state);
    assert.equal(instance.state().dealRatings[0].ratings.Ben,4);
    await instance.flush();
    assert.equal(instance.writes.length,2);
    assert.equal(instance.writes[1].state.dealRatings[0].ratings.Ben,4);
  }finally{act(()=>instance.rendered.unmount());}
});

test("online: initial join replaces local players and ratings without uploading them",async()=>{
  const local={players:["Old A","Old B","Old C","Old D"],dealRatings:[{...oldDeal,dealer:"Old A",ratings:{"Old B":10}}],startkapital:2300};
  const instance=await onlineApp(local,{players,dealRatings:[oldDeal],startkapital:1000});
  try{
    assert.deepEqual(instance.state().players,players);
    assert.equal(instance.state().startkapital,1000);
    assert.deepEqual(instance.state().dealRatings[0].ratings,oldDeal.ratings);
    await instance.flush();
    assert.equal(instance.writes.length,0);
    rateBen(instance);
    await instance.flush();
    assert.equal(instance.writes.length,1);
  }finally{act(()=>instance.rendered.unmount());}
});

test("online: deleting a room stops queued uploads and keeps the local game",async()=>{
  const instance=await onlineApp();
  try{
    rateBen(instance);
    await instance.fail(Object.assign(new Error("Raum gelöscht"),{code:"room-deleted"}));
    await instance.flush();
    assert.equal(instance.writes.length,0);
    assert.equal(instance.state().dealRatings[0].ratings.Ben,9);
    assert.equal(instance.storage.has("schafkopf-firebase-room-v1"),false);
  }finally{act(()=>instance.rendered.unmount());}
});

test("online: duplicate and stale snapshots cannot replace newer local confirmations",async()=>{
  const instance=await onlineApp();
  try{
    rateBen(instance);
    await instance.emit({players,dealRatings:[oldDeal]},1);
    assert.equal(instance.state().dealRatings[0].ratings.Ben,9);
    await instance.emit({players,dealRatings:[oldDeal]},0);
    assert.equal(instance.state().dealRatings[0].ratings.Ben,9);
    await instance.flush();
    assert.equal(instance.writes.length,1);
    assert.equal(instance.writes[0].state.dealRatings[0].ratings.Ben,9);
  }finally{act(()=>instance.rendered.unmount());}
});

test("online: a confirmed room switch replaces the old session and ignores old callbacks",async()=>{
  const instance=await onlineApp();
  try{
    rateBen(instance);
    const nextPlayers=["New A","New B","New C","New D"];
    instance.client.joinRoom=async(code,onState)=>{
      onState({players:nextPlayers,dealRatings:[],startkapital:2000},{roomCode:code,revision:1});
      return code;
    };
    click(button(instance,/Einst\.$/));
    await act(async()=>{instance.rendered.root.findByType(instance.context.SettingsView).props.online.joinRoom("FGHJK");});
    assert.equal(instance.state().dealRatings[0].ratings.Ben,9);
    assert.equal(instance.rendered.root.findAllByType("dialog").length,1);
    await act(async()=>click(button(instance,"Beitreten")));
    assert.deepEqual(instance.state().players,nextPlayers);
    assert.deepEqual(instance.state().dealRatings,[]);
    assert.equal(instance.state().startkapital,2000);
    await instance.emitFromFirst({players,dealRatings:[oldDeal]});
    assert.deepEqual(instance.state().players,nextPlayers);
    await instance.flush();
    assert.equal(instance.writes.length,0);
  }finally{act(()=>instance.rendered.unmount());}
});

test("online: after a successful save a newer server rating wins without being uploaded again",async()=>{
  const instance=await onlineApp();
  try{
    rateBen(instance);
    await instance.flush();
    const remote=instance.context.SchafkopfDealRatings.upsertRating(
      instance.context.SchafkopfDealRatings.normalizeDealRatings([oldDeal]),"historic","Ben",4,
      {method:"manual",algorithmVersion:"manual-v1",rules:null});
    await instance.emit({players,dealRatings:remote},3);
    assert.equal(instance.state().dealRatings[0].ratings.Ben,4);
    await instance.flush();
    assert.equal(instance.writes.length,1);
  }finally{act(()=>instance.rendered.unmount());}
});

for(const laterLocal of [false,true])test(`online: late transaction acknowledgement ${laterLocal?"preserves a later local edit":"respects a newer server edit"}`,async()=>{
  const instance=await onlineApp();
  let finish;
  let saving;
  const normalSave=instance.client.saveState;
  instance.client.saveState=(state,baseState,baseRevision)=>{
    instance.writes.push(JSON.parse(JSON.stringify({state,baseState,baseRevision})));
    return new Promise(resolve=>{finish=()=>resolve({state,revision:2});});
  };
  try{
    rateBen(instance);
    act(()=>{saving=instance.runTimer();});
    assert.equal(instance.writes.length,1);
    if(laterLocal){click(card(instance,"Ben: 10 von 10"));click(confirmation(instance));}
    const remote=instance.context.SchafkopfDealRatings.upsertRating(
      instance.context.SchafkopfDealRatings.normalizeDealRatings([oldDeal]),"historic","Ben",4,
      {method:"manual",algorithmVersion:"manual-v1",rules:null});
    await instance.emit({players,dealRatings:remote},3);
    finish();
    await act(async()=>{await saving;});
    assert.equal(instance.state().dealRatings[0].ratings.Ben,laterLocal?10:4);
    instance.client.saveState=normalSave;
    await instance.flush();
    assert.equal(instance.writes.length,laterLocal?2:1);
    if(laterLocal)assert.equal(instance.writes[1].baseRevision,3);
  }finally{finish?.();act(()=>instance.rendered.unmount());}
});

const photographedHand=["eichel-unter","gras-unter","herz-ass","herz-zehn","eichel-ass","eichel-zehn","schellen-koenig","gras-neun"];
function legacyToggle(instance){
  return instance.rendered.root.findByProps({role:"switch","aria-label":"Legacy Bewertung"});
}

test("game variants: Ramsch exclusively previews weak cards, persists its rules and supports leaving the mode",()=>{
  const instance=app();let restored;
  const low=["eichel-sieben","eichel-acht","eichel-neun","gras-sieben","gras-acht","gras-neun","schellen-sieben","schellen-acht"];
  try{
    open(instance);click(button(instance,/^Ben7,0/));
    for(const id of low)click(card(instance,instance.context.SchafkopfHandEvaluation.CARDS.find(item=>item.id===id).label));
    for(const label of ["Sauspiel","Hochzeit","Wenz","Farb-Wenz","Geier","Farbsolo"])assert.equal(button(instance,`${label} berücksichtigen: an`).props["aria-checked"],true);
    click(button(instance,"Ramsch berücksichtigen: aus"));
    for(const label of ["Sauspiel","Hochzeit","Wenz","Farb-Wenz","Geier","Farbsolo"])assert.equal(button(instance,`${label} berücksichtigen: aus`).props["aria-checked"],false);
    assert.match(text(instance.rendered.root),/10,0 \/ 10/);
    assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
    click(confirmation(instance));
    const entry=instance.state().dealRatings[0];
    assert.equal(entry.ratings.Ben,10);assert.equal(entry.ratingMeta.Ben.algorithmVersion,"hand-v2");
    assert.deepEqual(entry.ratingMeta.Ben.rules,{deck:"long",hochzeit:false,wenz:false,sauspiel:false,farbwenz:false,geier:false,farbsolo:false,ramsch:true});
    act(()=>instance.rendered.unmount());
    restored=app(undefined,instance.storage);
    open(restored);click(button(restored,/^Ben10,0/));
    assert.equal(button(restored,"Ramsch berücksichtigen: an").props["aria-checked"],true);
    for(const id of low)click(card(restored,restored.context.SchafkopfHandEvaluation.CARDS.find(item=>item.id===id).label));
    click(button(restored,"Ramsch berücksichtigen: an"));
    assert.equal(confirmation(restored).props.disabled,true);
    assert.match(text(restored.rendered.root),/Kein bewertbarer Kandidat/);
    assert.equal(restored.state().dealRatings[0].ratings.Ben,10);
    click(button(restored,"Ramsch berücksichtigen: aus"));
    click(button(restored,"Geier berücksichtigen: aus"));
    assert.equal(button(restored,"Ramsch berücksichtigen: aus").props["aria-checked"],false);
    assert.equal(button(restored,"Geier berücksichtigen: an").props["aria-checked"],true);
    assert.equal(confirmation(restored).props.disabled,false);
    assert.equal(restored.state().dealRatings[0].ratings.Ben,10);
  }finally{act(()=>{if(restored)restored.rendered.unmount();else instance.rendered.unmount();});}
});

test("rating modes: legacy batches save once, persist across reload and share unchanged history with the photo mode",()=>{
  const original={...oldDeal,ratingMeta:{Ben:{method:"automatic",algorithmVersion:"hand-v1",rules:{deck:"long",hochzeit:true,wenz:true}}}};
  const instance=app({players,dealRatings:[original]});
  let restored;
  try{
    click(button(instance,/Einst\.$/));
    assert.equal(legacyToggle(instance).props["aria-checked"],false);
    click(legacyToggle(instance));
    open(instance);
    assert.doesNotMatch(text(instance.rendered.root),/Austeilung bewerten/);
    assert.equal(instance.rendered.root.findAllByType("button").some(node=>text(node)==="Neue Austeilung anlegen"),false);
    click(button(instance,"Anna"));
    assert.equal(card(instance,"Anna: 1 von 10"),undefined);
    click(card(instance,"Ben: 8 von 10"));
    click(card(instance,"Clara: 4 von 10"));
    assert.equal(instance.state().dealRatings.length,1);
    assert.equal(button(instance,"2 von 3 Bewertungen ausgewählt").props.disabled,true);
    click(card(instance,"David: 6 von 10"));
    assert.equal(instance.state().dealRatings.length,1);
    click(button(instance,"Bewertung speichern"));
    const entries=instance.state().dealRatings;
    assert.equal(entries.length,2);
    assert.deepEqual(entries[1].ratings,{});
    assert.deepEqual(Object.fromEntries(privateState(instance)[entries[1].id].map(item=>[item.player,item.score])),{Ben:8,Clara:4,David:6});
    assert.equal(entries[1].id,entries[1].roundId);
    for(const {meta} of privateState(instance)[entries[1].id])assert.deepEqual(meta,{method:"manual",algorithmVersion:"manual-v1",rules:null});
    assert.deepEqual(entries[0].ratingMeta.Ben,original.ratingMeta.Ben);
    assert.equal(instance.context.SchafkopfDealRatings.dealerStats(players,entries).Anna.count,2);
    assert.equal(instance.context.SchafkopfDealRatings.dealerStats(players,entries).Anna.average,6);
    act(()=>instance.rendered.unmount());
    restored=app(undefined,instance.storage);
    click(button(restored,/Einst\.$/));
    assert.equal(legacyToggle(restored).props["aria-checked"],true);
    click(legacyToggle(restored));
    open(restored);
    assert.equal(restored.rendered.root.findAllByType(restored.context.LegacyDealRatingForm).length,0);
    assert.match(text(restored.rendered.root),/Austeilung bewerten/);
    assert.deepEqual(restored.state().dealRatings,entries);
    click(button(restored,/^Ben8,0/));
    assert.equal(button(restored,"Karten auswählen").props["aria-pressed"],true);
    assert.ok(button(restored,"Karten fotografieren"));
    assert.deepEqual(restored.state().dealRatings,entries);
  }finally{act(()=>{if(restored)restored.rendered.unmount();else instance.rendered.unmount();});}
});

test("legacy mode: five players need four ratings and changing dealer discards only the unsaved form",()=>{
  const fivePlayers=[...players,"Eva"];
  const instance=app({players:fivePlayers,fivePlayerMode:true,legacyRating:true,dealRatings:[oldDeal]});
  try{
    open(instance);click(button(instance,"Anna"));
    for(const name of ["Ben","Clara","David"])click(card(instance,`${name}: 7 von 10`));
    assert.equal(button(instance,"3 von 4 Bewertungen ausgewählt").props.disabled,true);
    assert.equal(instance.state().dealRatings.length,1);
    click(button(instance,"Ben"));
    assert.equal(button(instance,"0 von 4 Bewertungen ausgewählt").props.disabled,true);
    for(const name of ["Anna","Clara","David","Eva"])click(card(instance,`${name}: 5 von 10`));
    click(button(instance,"Bewertung speichern"));
    assert.equal(instance.state().dealRatings.length,2);
    assert.deepEqual(instance.state().dealRatings[1].ratings,{});
    assert.deepEqual(Object.fromEntries(privateState(instance)[instance.state().dealRatings[1].id].map(item=>[item.player,item.score])),{Anna:5,Clara:5,David:5,Eva:5});
    assert.equal(instance.state().dealRatings[1].dealer,"Ben");
    assert.deepEqual(instance.state().dealRatings[0].ratings,oldDeal.ratings);
  }finally{act(()=>instance.rendered.unmount());}
});

test("online: legacy preference stays local and online rounds always use private individual submissions",async()=>{
  const instance=await onlineApp();
  try{
    await instance.flush();assert.equal(instance.writes.length,0);
    click(button(instance,/Einst\.$/));click(legacyToggle(instance));
    await instance.flush();assert.equal(instance.writes.length,0);
    open(instance);click(button(instance,"Anna"));
    assert.equal(instance.rendered.root.findAllByType(instance.context.LegacyDealRatingForm).length,0);
    await instance.flush();assert.equal(instance.writes.length,0);
    click(button(instance,"Neue Austeilung anlegen"));
    await instance.flush();assert.equal(instance.writes.length,1);
    const shared=instance.writes[0].state;
    assert.equal(Object.hasOwn(shared,"legacyRating"),false);
    assert.equal(shared.dealRatings.length,2);
    assert.deepEqual(shared.dealRatings[1].ratings,{});
    assert.equal(shared.dealRatings[1].sealed,true);
    await instance.emit(shared,3);
    assert.equal(instance.state().legacyRating,true);
    await instance.flush();assert.equal(instance.writes.length,1);
  }finally{act(()=>instance.rendered.unmount());}
});

test("online: own scan uploads privately, statistics wait for the game and other values arrive only after release",async()=>{
  const instance=await onlineApp({players,dealRatings:[]});
  try{
    open(instance);click(button(instance,"Anna"));click(button(instance,"Neue Austeilung anlegen"));
    const entry=instance.state().dealRatings[0];
    click(button(instance,/^BenVerdeckt/));
    instance.context.SchafkopfCardScanner.scanPhoto=async()=>scanResult(photographedHand);
    await act(async()=>photoInput(instance).props.onChange({target:{files:[{type:"image/jpeg",size:1234}],value:"photo.jpg"}}));
    await act(async()=>confirmation(instance).props.onClick());
    assert.equal(instance.privateWrites.length,1);
    assert.equal(instance.privateWrites[0].score,6.8);
    assert.deepEqual(instance.state().dealRatings[0].ratings,{});
    assert.match(text(instance.rendered.root),/Verdeckt hochgeladen/);
    assert.match(text(instance.rendered.root),/0 bewertete Austeilungen/);
    assert.ok(instance.writes.every(write=>Object.keys(write.state.dealRatings[0].ratings).length===0));
    assert.ok(!JSON.stringify(instance.writes).includes("cardIds"));
    enterSauspiel(instance);
    await instance.flush();
    await instance.emitPrivate(entry.id,[{player:"Ben",score:6.8,meta:{method:"automatic",algorithmVersion:"hand-v2",rules:null}},{player:"Clara",score:4.2,meta:{method:"manual",algorithmVersion:"manual-v1",rules:null}}]);
    open(instance);
    assert.match(text(instance.rendered.root),/Runde abgeschlossen/);
    assert.match(text(instance.rendered.root),/5,5 \(2\)/);
    assert.equal(instance.rendered.root.findAllByType(instance.context.HandRatingEditor).length,0);
  }finally{act(()=>instance.rendered.unmount());}
});

test("online: a failed private upload never falls back to publishing a score",async()=>{
  const instance=await onlineApp({players,dealRatings:[]});
  try{
    instance.client.submitPrivateRating=async()=>{throw Object.assign(new Error('denied'),{code:'permission-denied'});};
    open(instance);click(button(instance,"Anna"));click(button(instance,"Neue Austeilung anlegen"));
    click(button(instance,/^BenVerdeckt/));click(button(instance,"Manuell bewerten"));click(card(instance,"Ben: 9 von 10"));
    await act(async()=>confirmation(instance).props.onClick());
    assert.match(text(instance.rendered.root),/Hochladen verweigert/);
    assert.deepEqual(instance.state().dealRatings[0].ratings,{});
    assert.ok(instance.writes.every(write=>Object.keys(write.state.dealRatings[0].ratings).length===0));
    assert.equal(instance.privateWrites.length,0);
  }finally{act(()=>instance.rendered.unmount());}
});

const photoInput=instance=>instance.rendered.root.findAllByType("input").find(node=>node.props.type==="file"&&node.props.capture==="environment");
const scanResult=cardIds=>({cardIds,detections:cardIds.map((cardId,index)=>({cardId,box:[index*30,20,index*30+25,80],uncertain:false,confidence:.9})),warnings:[],previewUrl:"blob:local-preview"});

test("photo flow: camera recognition previews eight cards and saves only the confirmed numeric result",async()=>{
  const instance=app();
  try{
    let usedModel;
    instance.context.SchafkopfCardScanner.scanPhoto=async(file,options)=>{usedModel=options.model;return {...scanResult(photographedHand),modelVersion:instance.context.SchafkopfCardScannerCore.MODELS.personal.version};};
    open(instance);click(button(instance,/^Ben7,0/));
    assert.equal(button(instance,"Karten auswählen").props["aria-pressed"],true);
    assert.equal(instance.rendered.root.findAllByType("select").filter(node=>node.findAllByType("option").some(option=>["personal","standard"].includes(option.props.value))).length,0);
    assert.match(text(instance.rendered.root),/Kartenscan \(Beta\)/);
    assert.doesNotMatch(text(instance.rendered.root),/Allgemeines Kartenmodell/);
    assert.equal(photoInput(instance).props.accept,"image/*");
    await act(async()=>photoInput(instance).props.onChange({target:{files:[{type:"image/jpeg",size:1234}],value:"photo.jpg"}}));
    assert.equal(usedModel,"personal");
    assert.match(text(instance.rendered.root),/8 von 8 Karten vorgeschlagen/);
    assert.match(text(instance.rendered.root),/6,8 \/ 10/);
    assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
    click(confirmation(instance));
    assert.equal(instance.state().dealRatings[0].ratings.Ben,6.8);
    assert.equal(instance.state().dealRatings[0].ratingMeta.Ben.algorithmVersion,"hand-v2");
    assert.ok(!JSON.stringify(instance.state()).includes("blob:"));
    assert.ok(!JSON.stringify(instance.state()).includes("eichel-unter"));
  }finally{act(()=>instance.rendered.unmount());}
});

test("photo flow: incomplete recognition never creates a rating and can be corrected with the picker",async()=>{
  const instance=app();
  try{
    instance.context.SchafkopfCardScanner.scanPhoto=async()=>scanResult(photographedHand.slice(0,7));
    open(instance);click(button(instance,/^Ben7,0/));click(button(instance,"Karten auswählen"));
    await act(async()=>photoInput(instance).props.onChange({target:{files:[{type:"image/jpeg",size:1234}],value:"photo.jpg"}}));
    assert.equal(confirmation(instance).props.disabled,true);
    assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
    click(card(instance,"Gras-Neun"));
    assert.equal(confirmation(instance).props.disabled,false);
    click(confirmation(instance));
    assert.equal(instance.state().dealRatings[0].ratings.Ben,6.8);
  }finally{act(()=>instance.rendered.unmount());}
});

test("photo flow: abort prevents a late recognition result from replacing a manual correction",async()=>{
  const instance=app();
  let finish;
  let pending;
  try{
    instance.context.SchafkopfCardScanner.scanPhoto=()=>new Promise(resolve=>{finish=resolve;});
    open(instance);click(button(instance,/^Ben7,0/));click(button(instance,"Karten auswählen"));
    act(()=>{pending=photoInput(instance).props.onChange({target:{files:[{type:"image/jpeg",size:1234}],value:"photo.jpg"}});});
    assert.equal(card(instance,"Gras-Neun").props.disabled,true);
    assert.equal(confirmation(instance).props.disabled,true);
    click(button(instance,"Erkennung abbrechen"));
    click(card(instance,"Gras-Neun"));
    finish(scanResult(photographedHand));
    await act(async()=>{await pending;});
    assert.match(text(instance.rendered.root),/1 von 8 Karten/);
    assert.equal(card(instance,"Eichel-Unter").props["aria-pressed"],false);
    assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
  }finally{act(()=>instance.rendered.unmount());}
});

test("photo flow: incorrect suggestion from the real-photo failure can be replaced before confirmation",async()=>{
  const instance=app();
  // Reproduce the measured failure in the UI. This is not an inference test.
  const reference=JSON.parse(fs.readFileSync(path.join(__dirname,"fixtures","handkarten.expected.json"),"utf8"));
  try{
    instance.context.SchafkopfCardScanner.scanPhoto=async()=>scanResult(["gras-ass","gras-zehn"]);
    open(instance);click(button(instance,/^Ben7,0/));click(button(instance,"Karten auswählen"));
    await act(async()=>photoInput(instance).props.onChange({target:{files:[{type:"image/jpeg",size:1234}],value:"photo.jpg"}}));
    assert.match(text(instance.rendered.root),/2 von 8 Karten vorgeschlagen/);
    assert.equal(confirmation(instance).props.disabled,true);
    click(card(instance,"Gras-Zehn"));
    for(const id of reference.cardIds.filter(id=>id!=="gras-ass")){
      const label=instance.context.SchafkopfHandEvaluation.CARDS.find(item=>item.id===id).label;
      click(card(instance,label));
    }
    assert.match(text(instance.rendered.root),/4,4 \/ 10/);
    assert.equal(card(instance,"Gras-Zehn").props["aria-pressed"],false);
    assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
    click(confirmation(instance));
    assert.equal(instance.state().dealRatings[0].ratings.Ben,4.4);
  }finally{act(()=>instance.rendered.unmount());}
});
