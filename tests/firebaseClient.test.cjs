const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const crypto=require("node:crypto");
const {normalizeDealRatings,upsertRating}=require("../src/dealRatings.js");
const clone=value=>JSON.parse(JSON.stringify(value));

async function harness(){
  const records=new Map();
  const listeners=new Map();
  const paths=[];
  const snapshot=(ref,metadata={fromCache:false,hasPendingWrites:false})=>({
    metadata,exists:()=>records.has(ref.path),data:()=>records.get(ref.path)
  });
  const firestore={
    getFirestore:()=>({}),
    doc:(_db,collection,id)=>({path:`${collection}/${id}`}),
    collection:(_db,name)=>({path:name}),
    serverTimestamp:()=>({serverTimestamp:true}),
    async getDocFromServer(ref){paths.push(ref.path);return snapshot(ref);},
    onSnapshot(ref,options,next,error){
      if(typeof options==="function"){error=next;next=options;options={};}
      listeners.set(ref.path,{next,error,options});
      paths.push(ref.path);
      return ()=>listeners.delete(ref.path);
    },
    async runTransaction(_db,callback){
      return callback({
        get:async ref=>snapshot(ref),
        set:(ref,value)=>{paths.push(ref.path);records.set(ref.path,clone(value));},
        update:(ref,value)=>{paths.push(ref.path);records.set(ref.path,{...records.get(ref.path),...clone(value)});}
      });
    },
    async deleteDoc(ref){paths.push(ref.path);records.delete(ref.path);}
  };
  const modules={
    "firebase-app.js":{getApps:()=>[],initializeApp:()=>({})},
    "firebase-auth.js":{getAuth:()=>({}),signInAnonymously:async()=>({user:{uid:"test-device"}})},
    "firebase-firestore.js":firestore
  };
  const context={window:{},crypto,TextEncoder,__importForTest:async url=>{
    const module=modules[url.split("/").at(-1)];
    assert.ok(module,`Unexpected import: ${url}`);
    return module;
  }};
  // Substitute only the SDK import transport. The production client logic,
  // listener filters and transaction callback execute unchanged.
  const source=fs.readFileSync(require.resolve("../src/firebaseSync.js"),"utf8").replace(/\bimport\(/g,"__importForTest(");
  vm.runInNewContext(source,context);
  const api=context.window.SchafkopfFirebase;
  const client=await api.createClient({apiKey:"test",authDomain:"test",projectId:"test",appId:"test"});
  return {client,api,records,listeners,paths,firestore,
    emit(code,metadata){listeners.get(`schafkopfRooms/${code}`).next(snapshot({path:`schafkopfRooms/${code}`},metadata));}
  };
}

test("Firebase client: join accepts five/ten-character codes and forwards only committed server snapshots",async()=>{
  const h=await harness();
  h.records.set("schafkopfRooms/ABCDE",{state:{players:["Anna"]},revision:1});
  const received=[];
  const errors=[];
  await h.client.joinRoom("abcde",(state,meta)=>received.push({state,meta}),error=>errors.push(error));
  assert.equal(h.listeners.get("schafkopfRooms/ABCDE").options.includeMetadataChanges,true);
  h.emit("ABCDE",{fromCache:true,hasPendingWrites:false});
  h.emit("ABCDE",{fromCache:false,hasPendingWrites:true});
  assert.equal(received.length,0);
  h.emit("ABCDE",{fromCache:false,hasPendingWrites:false});
  assert.deepEqual(clone(received[0].state),{players:["Anna"]});
  assert.equal(received[0].meta.revision,1);
  h.records.delete("schafkopfRooms/ABCDE");
  h.emit("ABCDE",{fromCache:false,hasPendingWrites:false});
  assert.equal(errors[0].code,"room-deleted");
  h.records.set("schafkopfRooms/ABCDEFGHIJ",{state:{},revision:1});
  assert.equal(await h.client.joinRoom("ABCDEFGHIJ",()=>{}),"ABCDEFGHIJ");
  assert.equal(h.listeners.has("schafkopfRooms/ABCDE"),false);
  await assert.rejects(()=>h.client.joinRoom("ABCD",()=>{}));
  h.client.disconnect();
});

test("Firebase client: stale-base transaction keeps both players and their matching provenance",async()=>{
  const h=await harness();
  const base={dealRatings:normalizeDealRatings([{id:"deal",dealer:"Anna",ratings:{Ben:7,Clara:5}}])};
  const automatic={method:"automatic",algorithmVersion:"hand-v1",rules:{deck:"long",hochzeit:true,wenz:true}};
  const manual={method:"manual",algorithmVersion:"manual-v1",rules:null};
  const local={dealRatings:upsertRating(base.dealRatings,"deal","Ben",6.8,automatic)};
  const remote={dealRatings:upsertRating(base.dealRatings,"deal","Clara",3,manual)};
  h.records.set("schafkopfRooms/ABCDE",{schemaVersion:1,ownerId:"owner",state:remote,revision:2,createdAt:100});
  await h.client.joinRoom("ABCDE",()=>{});
  const saved=await h.client.saveState(local,base,1);
  assert.equal(saved.revision,3);
  assert.deepEqual(clone(saved.state.dealRatings[0].ratings),{Ben:6.8,Clara:3});
  assert.deepEqual(clone(saved.state.dealRatings[0].ratingMeta.Ben),automatic);
  const document=h.records.get("schafkopfRooms/ABCDE");
  assert.equal(document.schemaVersion,1);
  assert.equal(document.ownerId,"owner");
  assert.equal(document.createdAt,100);
  assert.equal(document.updatedBy,"test-device");
  // Retrying the same edit replaces its slot rather than appending a dealing.
  const retry=await h.client.saveState(local,base,1);
  assert.equal(retry.state.dealRatings.length,1);
  assert.deepEqual(clone(retry.state.dealRatings[0].ratings),{Ben:6.8,Clara:3});
});

test("Firebase client: create, room discovery and deletion touch only schafkopfRooms",async()=>{
  const h=await harness();
  h.records.set("smashBingo/sharedPool",{fields:["keep"]});
  const code=await h.client.createRoom({players:["Anna"],rounds:[]},()=>{});
  assert.match(code,/^[A-Z2-9]{5}$/);
  assert.equal(h.records.get(`schafkopfRooms/${code}`).schemaVersion,1);
  const received=[];
  const stop=h.client.watchRooms(rooms=>received.push(rooms),assert.fail);
  h.listeners.get("schafkopfRooms").next({docs:[
    {id:code,data:()=>({state:{players:["Anna"],rounds:[{}]},updatedAt:{toMillis:()=>100}})},
    {id:"ABCDE",data:()=>({state:{players:["Ben"],rounds:[]},updatedAt:{toMillis:()=>200}})}
  ]});
  assert.deepEqual(clone(received[0].map(room=>room.code)),["ABCDE",code]);
  assert.equal(received[0][1].roundCount,1);
  await h.client.deleteRoom(code);
  assert.equal(h.records.has(`schafkopfRooms/${code}`),false);
  assert.deepEqual(h.records.get("smashBingo/sharedPool"),{fields:["keep"]});
  assert.ok(h.paths.every(path=>path==="schafkopfRooms"||path.startsWith("schafkopfRooms/")));
  await assert.rejects(()=>h.client.deleteRoom("../smashBingo/sharedPool"));
  stop();h.client.disconnect();
});
