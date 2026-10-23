const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
// Use the archive's pinned dependency; Windows cannot load two libvips ABIs in one process.
const sharp=require("node:module").createRequire(require.resolve("../server/training-archive/server.cjs"))("sharp");
const {createArchive}=require("../server/training-archive/server.cjs");
const {entries,exportDataset}=require("../server/training-archive/dataset.cjs");
const {CLASS_IDS:cards}=require("../src/cardScannerCore.js");
const {spawnSync}=require("node:child_process");
const origin="https://schafkopf.example.test",token="a".repeat(43);
async function sample(overrides={},colour="#aabbcc"){
  const image=await sharp({create:{width:80,height:120,channels:3,background:colour}}).withMetadata({exif:{IFD0:{Artist:"PRIVATE-EXIF"}}}).jpeg().toBuffer();
  return {image:image.toString("base64"),metadata:{schemaVersion:1,id:crypto.randomUUID(),sessionId:"abend-2026-10-23",capturedAt:"2026-10-23T20:00:00Z",confirmedAt:"2026-10-23T20:01:00Z",modelVersion:"test",detectionTarget:"rank-and-suit-index",image:{width:80,height:120,originalWidth:800,originalHeight:1200},detections:[],suggestedCardIds:cards.slice(0,8),confirmedCardIds:cards.slice(0,8),...overrides}};
}
async function fixture(t,options={}){
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),"schafkopf-archive-test-")),directory=path.join(temporary,"archive");
  const archive=await createArchive({directory,token,allowedOrigins:[origin],...options});const address=await archive.listen(0),url=`http://127.0.0.1:${address.port}`;
  t.after(async()=>{archive.server.closeAllConnections();await new Promise(resolve=>archive.server.close(resolve));await fs.rm(temporary,{recursive:true,force:true});});
  const post=(body,headers={})=>fetch(url+"/v1/samples",{method:"POST",headers:{Authorization:"Bearer "+token,Origin:origin,"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
  return {directory,temporary,url,post};
}
test("archive server: authentication, exact CORS, no image downloads or cross-origin token leakage",async t=>{
  const f=await fixture(t),body=await sample();
  assert.equal((await f.post(body,{Authorization:"Bearer wrong"})).status,401);
  const denied=await f.post(body,{Origin:"https://evil.test"});assert.equal(denied.status,403);assert.equal(denied.headers.get("access-control-allow-origin"),null);
  const preflight=await fetch(f.url+"/v1/samples",{method:"OPTIONS",headers:{Origin:origin,"Access-Control-Request-Headers":"authorization,content-type"}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get("access-control-allow-origin"),origin);
  assert.equal((await fetch(f.url+"/v1/health",{headers:{Authorization:"Bearer "+token}})).status,200);
  assert.equal((await fetch(f.url+"/samples/anything/image.jpg",{headers:{Authorization:"Bearer "+token}})).status,404);
  assert.deepEqual(await entries(f.directory),[]);
});
test("archive server: durable idempotent image+metadata, EXIF stripping and immutable retry identity",async t=>{
  const f=await fixture(t),body=await sample({players:["Private Name"],token:"do-not-store"});
  const response=await f.post(body);assert.equal(response.status,201);assert.deepEqual(await response.json(),{id:body.metadata.id,stored:true});
  const duplicate=await f.post(body);assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).duplicate,true);
  const stored=await entries(f.directory);assert.equal(stored.length,1);
  assert.equal((await sharp(await fs.readFile(path.join(stored[0].folder,"image.jpg"))).metadata()).exif,undefined);
  assert.equal(stored[0].metadata.labelStatus,"hand-confirmed-needs-regions");assert.equal(stored[0].metadata.players,undefined);assert.equal(stored[0].metadata.token,undefined);
  const changed=structuredClone(body);changed.metadata.confirmedCardIds=[...cards.slice(1,9)];assert.equal((await f.post(changed)).status,409);
  assert.equal((await fs.readdir(path.join(f.directory,"staging"))).length,0);
});
test("archive server: reject traversal, invalid hands, malformed JPEG, mismatched dimensions and full archive",async t=>{
  const f=await fixture(t);
  for(const changes of [{sessionId:"../../outside"},{id:"../bad"},{confirmedCardIds:cards.slice(0,7)},{confirmedCardIds:Array(8).fill(cards[0])},{image:{width:999,height:120,originalWidth:800,originalHeight:1200}}])assert.equal((await f.post(await sample(changes))).status,400);
  const bad=await sample();bad.image=Buffer.from("not jpeg").toString("base64");assert.equal((await f.post(bad)).status,400);assert.deepEqual(await entries(f.directory),[]);
  const full=await fixture(t,{quotaBytes:4400000});
  await fs.writeFile(path.join(full.directory,"staging","filler"),Buffer.alloc(4400000));
  // Quota is initialized at startup; restart with a pre-existing occupied archive.
  const second=await createArchive({directory:full.directory,token,allowedOrigins:[origin],quotaBytes:4400000});const addr=await second.listen(0);
  t.after(async()=>{second.server.closeAllConnections();await new Promise(resolve=>second.server.close(resolve));});
  const response=await fetch(`http://127.0.0.1:${addr.port}/v1/samples`,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(await sample())});assert.equal(response.status,507);
});
test("archive dataset: only reviewed regions, all samples of an evening stay together, test remains separate",async t=>{
  const f=await fixture(t),bodies=[await sample({},"#111111"),await sample({},"#333333"),await sample({sessionId:"abend-2026-10-30"},"#777777"),await sample({sessionId:"abend-2026-11-01"},"#999999")];
  for(const body of bodies)assert.equal((await f.post(body)).status,201);
  const stored=await entries(f.directory);
  for(const record of stored.filter(entry=>entry.metadata.sessionId!=="abend-2026-11-01")){
    await fs.writeFile(path.join(record.folder,"regions.json"),JSON.stringify({visuallyReviewed:true,imageSha256:record.metadata.imageSha256,objects:cards.slice(0,8).map((cardId,index)=>({cardId,polygon:[[index*8,0],[index*8+6,0],[index*8+6,100],[index*8,100]]}))}));
  }
  const manifest=await exportDataset(f.directory,path.join(f.temporary,"dataset"),{"abend-2026-10-23":"train","abend-2026-10-30":"test"});
  assert.equal(manifest.samples.length,3);assert.equal(manifest.excludedUnreviewed,1);assert.equal(manifest.samples.filter(item=>item.split==="train").length,2);
  assert.equal(manifest.samples.filter(item=>item.split==="test").length,1);
  assert.equal((await fs.readdir(path.join(f.temporary,"dataset","labels","train"))).length,2);
  const testRecord=stored.find(entry=>entry.metadata.sessionId==="abend-2026-10-30");
  await fs.writeFile(path.join(testRecord.folder,"image.jpg"),"corrupt");await assert.rejects(()=>entries(f.directory),/Archivprüfung/);
});

test("archive Windows backup: real private snapshot verifies and restores without copying the upload token",{skip:process.platform!=="win32"},async t=>{
  const f=await fixture(t);assert.equal((await f.post(await sample())).status,201);
  await fs.writeFile(path.join(f.directory,"config.json"),JSON.stringify({token:"PRIVATE-DO-NOT-BACKUP"}));
  const backup=path.join(f.temporary,"backup");
  const result=spawnSync("powershell.exe",["-NoProfile","-ExecutionPolicy","Bypass","-File",path.resolve(__dirname,"../server/training-archive/Backup-TrainingArchive.ps1"),"-ArchiveDirectory",f.directory,"-BackupDirectory",backup],{encoding:"utf8",windowsHide:true});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const days=await fs.readdir(backup);assert.equal(days.length,1);
  const snapshot=path.join(backup,days[0]);assert.equal((await entries(snapshot)).length,1);
  assert.ok(!(await fs.readdir(snapshot)).includes("config.json"));
  const restored=path.join(f.temporary,"restored");await fs.cp(snapshot,restored,{recursive:true});
  const records=await entries(restored);assert.equal(records.length,1);
  assert.equal(records[0].metadata.imageSha256,(await entries(f.directory))[0].metadata.imageSha256);
});
