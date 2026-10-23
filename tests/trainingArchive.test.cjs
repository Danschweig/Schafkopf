const {test}=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {createClient,eveningId}=require("../src/trainingArchive.js");
const core=require("../src/cardScannerCore.js");
const cards=core.CLASS_IDS.slice(0,8),token="x".repeat(43),address="https://archive.example.test";
function fixture({fetchImpl=async()=>{throw Error("Offline");},compressPhoto=async()=>({image:new Blob(["jpeg"],{type:"image/jpeg"}),width:1500,height:2000,originalWidth:3000,originalHeight:4000})}={}){
  const records=new Map(),settings=new Map();let calls=0;
  const store={list:async()=>[...records.values()],put:async item=>records.set(item.id,item),remove:async id=>records.delete(id),clear:async()=>records.clear()};
  const storage={getItem:key=>settings.get(key)||null,setItem:(key,value)=>settings.set(key,value)};
  const options={storage,store,fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);},compressPhoto,scannerCore:core,uuid:crypto.randomUUID,now:()=>Date.parse("2026-10-23T20:00:00Z")};
  const client=createClient(options);
  const enable=()=>client.configure({enabled:true,endpoint:address,token});
  const capture=()=>client.capture({type:"image/jpeg"},{cardIds:cards,detections:[{cardId:cards[0],confidence:.7,uncertain:false,box:[1,2,3,4]}],modelVersion:"test-v1"});
  return {client,enable,capture,records,settings,options,calls:()=>calls};
}
test("archive: off by default; capture and unconfirmed scans never enter storage or the network",async()=>{
  let compressed=0;const f=fixture({compressPhoto:async()=>{compressed++;}});
  assert.equal(f.client.getSettings().enabled,false);assert.equal(await f.capture(),null);assert.equal(compressed,0);assert.equal(f.calls(),0);assert.equal(f.records.size,0);
  const enabled=fixture();enabled.enable();await enabled.client.flush();const photo=await enabled.capture();
  assert.ok(photo);assert.equal(enabled.records.size,0);assert.equal(enabled.calls(),0);
});
test("archive: HTTPS and token validation prevent accidental or insecure destinations",()=>{
  const f=fixture();
  for(const endpoint of ["http://archive.test","https://user:password@archive.test","https://archive.test/upload","https://archive.test/?token=secret"]){assert.throws(()=>f.client.configure({enabled:true,endpoint,token}));}
  assert.throws(()=>f.client.configure({enabled:true,endpoint:address,token:"short"}));assert.equal(f.client.getSettings().enabled,false);
});
test("archive: queue survives offline/reload, uploads corrected cards only, and requires a storage receipt",async()=>{
  const f=fixture();f.enable();await f.client.flush();const photo=await f.capture();
  await assert.rejects(()=>f.client.enqueue(photo,cards.slice(0,7)));assert.equal(f.records.size,0);
  const corrected=[...cards.slice(0,7),core.CLASS_IDS[8]];
  await f.client.enqueue(photo,corrected);await f.client.flush();assert.equal(f.records.size,1);
  const item=[...f.records.values()][0];assert.deepEqual(item.metadata.confirmedCardIds,corrected);assert.deepEqual(item.metadata.suggestedCardIds,cards);
  const uploaded=[];
  const restored=createClient({...f.options,fetchImpl:async(url,request)=>{
    uploaded.push({url,request});return {ok:true,json:async()=>({id:JSON.parse(request.body).metadata.id,stored:true})};
  }});
  await restored.flush();assert.equal(f.records.size,0);assert.equal(uploaded.length,1);
  assert.equal(uploaded[0].url,address+"/v1/samples");assert.equal(uploaded[0].request.credentials,"omit");assert.equal(uploaded[0].request.redirect,"error");
  assert.deepEqual(JSON.parse(uploaded[0].request.body).metadata.confirmedCardIds,corrected);
  assert.ok(!uploaded[0].request.body.includes(token));
});
test("archive: repeated confirmations deduplicate; later corrections keep a distinct revision in the same evening",async()=>{
  const f=fixture();f.enable();await f.client.flush();const photo=await f.capture();
  await f.client.enqueue(photo,cards);await f.client.enqueue(photo,[...cards].reverse());await f.client.flush();assert.equal(f.records.size,1);
  await f.client.enqueue(photo,[...cards.slice(0,7),core.CLASS_IDS[8]]);await f.client.flush();assert.equal(f.records.size,2);
  assert.equal(new Set([...f.records.values()].map(item=>item.metadata.sourceCaptureId)).size,1);
  assert.equal(new Set([...f.records.values()].map(item=>item.metadata.sessionId)).size,1);
});
test("archive: disabling pauses uploads, never reroutes old images, and permits clearing locally",async()=>{
  const f=fixture();f.enable();await f.client.flush();const photo=await f.capture();await f.client.enqueue(photo,cards);await f.client.flush();
  f.client.configure({enabled:false});const count=f.calls();await f.client.flush();assert.equal(f.calls(),count);assert.equal(await f.client.enqueue(photo,cards),false);
  f.client.configure({enabled:true,endpoint:"https://other.example.test"});await f.client.flush();assert.equal(f.calls(),count);assert.equal(f.records.size,1);
  await f.client.clear();assert.equal(f.records.size,0);
});
test("archive: queue quota retains existing images and an invalid acknowledgement never drops a photo",async()=>{
  const f=fixture({fetchImpl:async()=>({ok:true,json:async()=>({stored:true,id:"wrong"})})});f.enable();await f.client.flush();
  const photo=await f.capture();await f.client.enqueue(photo,cards);await f.client.flush();assert.equal(f.records.size,1);
  for(let index=1;index<100;index++){const id=crypto.randomUUID();f.records.set(id,{...photo,id});}
  const extra=await f.capture();await assert.rejects(()=>f.client.enqueue(extra,cards));
  assert.equal(f.records.size,100);
});
test("archive: whole evenings use the Berlin date across midnight, including a DST night",()=>{
  assert.equal(eveningId(Date.parse("2026-10-23T21:00:00Z")),"abend-2026-10-23");
  assert.equal(eveningId(Date.parse("2026-10-24T01:00:00Z")),"abend-2026-10-23");
  assert.equal(eveningId(Date.parse("2026-10-24T04:00:00Z")),"abend-2026-10-24");
  assert.equal(eveningId(Date.parse("2026-10-25T02:00:00Z")),"abend-2026-10-24");
});
