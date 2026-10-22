const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {normalizeDealRatings,upsertRating,dealerStats,projectRatings,exportRatings,activeDeal,normalizeCompletions}=require("../src/dealRatings.js");
const context={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve("../src/firebaseSync.js"),"utf8"),context);
const merge=(base,local,remote)=>JSON.parse(JSON.stringify(context.window.SchafkopfFirebase.mergeSessionState(
  {dealRatings:base},{dealRatings:local},{dealRatings:remote}).dealRatings));
const players=["Anna","Ben","Clara","David"];
const automatic={method:"automatic",algorithmVersion:"hand-v1",rules:{deck:"long",hochzeit:true,wenz:false}};
const manual={method:"manual",algorithmVersion:"manual-v1",rules:null};
const original=()=>normalizeDealRatings([{id:"round-1",createdAt:100,dealer:"Anna",ratings:{Ben:7,Clara:5}}]);

test("sealed ratings never normalize into public values or update dealer statistics before release",()=>{
  const entry=normalizeDealRatings([{id:"deal-private-123456",dealer:"Anna",sealed:true,ratings:{Ben:9},ratingMeta:{Ben:automatic}}]);
  assert.deepEqual(entry[0].ratings,{});assert.deepEqual(entry[0].ratingMeta,{});
  assert.throws(()=>upsertRating(entry,entry[0].id,"Ben",8,automatic),/verdeckt/);
  const privateValues={[entry[0].id]:[{player:"Ben",score:8.3,meta:automatic},{player:"Clara",score:3,meta:manual}]};
  const own=projectRatings(entry,privateValues,{},true);
  assert.equal(own[0].ratings.Ben,8.3);
  assert.equal(dealerStats(players,own).Anna.count,0);
  assert.deepEqual(projectRatings(entry,privateValues)[0].ratings,{});
  assert.deepEqual(exportRatings(own),[]);
  const released=projectRatings(entry,privateValues,{[entry[0].id]:123});
  assert.equal(dealerStats(players,released).Anna.count,2);
  assert.equal(dealerStats(players,released).Anna.average,5.65);
  assert.deepEqual(exportRatings(released)[0].ratings,{Ben:8.3,Clara:3});
  assert.equal(Object.hasOwn(exportRatings(released)[0],"sealed"),false);
  assert.equal(activeDeal(entry).id,entry[0].id);
  assert.equal(activeDeal(entry,{[entry[0].id]:123}),null);
  assert.deepEqual(normalizeCompletions({[entry[0].id]:123,"deal-invalid":-1,other:124}),{[entry[0].id]:123});
});

test("legacy scores and identity survive normalization, metadata is inferred",()=>{
  const entries=original();
  assert.deepEqual(entries[0].ratings,{Ben:7,Clara:5});
  assert.equal(entries[0].id,"round-1");
  assert.equal(entries[0].roundId,"round-1");
  assert.deepEqual(entries[0].ratingMeta.Ben,{method:"manual",algorithmVersion:"legacy",rules:null});
  assert.deepEqual(normalizeDealRatings(entries),entries);
});
test("automatic -> manual -> automatic replaces the same player slot; repeated saves are idempotent",()=>{
  const entries=original();
  const auto=upsertRating(entries,"round-1","Ben",8.3,automatic);
  assert.equal(auto.length,1);
  assert.equal(auto[0].ratings.Ben,8.3);
  assert.equal(auto[0].ratings.Clara,5);
  assert.deepEqual(upsertRating(auto,"round-1","Ben",8.3,automatic),auto);
  const replaced=upsertRating(auto,"round-1","Ben",4,manual);
  assert.equal(replaced[0].ratings.Ben,4);
  assert.deepEqual(replaced[0].ratingMeta.Ben,manual);
  assert.deepEqual(upsertRating(replaced,"round-1","Ben",8.3,automatic),auto);
  assert.equal(entries[0].ratings.Ben,7);
});
test("unnecessary cards, photos and breakdowns are not persisted; versions survive reload/export JSON",()=>{
  const entries=upsertRating(original(),"round-1","Ben",8.3,{...automatic,cardIds:["secret"],photo:"private",breakdown:{}});
  assert.deepEqual(entries[0].ratingMeta.Ben,automatic);
  assert.deepEqual(normalizeDealRatings(JSON.parse(JSON.stringify(entries))),entries);
  const future=upsertRating(entries,"round-1","Ben",7,{...automatic,algorithmVersion:"hand-v2"});
  assert.equal(normalizeDealRatings(future)[0].ratingMeta.Ben.algorithmVersion,"hand-v2");
});
test("reject invalid scores, dealer self-rating and missing dealing",()=>{
  for(const value of [NaN,Infinity,0,10.1,"5",null])assert.throws(()=>upsertRating(original(),"round-1","Ben",value,manual));
  assert.throws(()=>upsertRating(original(),"round-1","Anna",5,manual));
  assert.throws(()=>upsertRating(original(),"missing","Ben",5,manual));
});

test("v2 game settings survive reload and JSON export without rewriting historical v1 settings",()=>{
  const modern={method:"automatic",algorithmVersion:"hand-v2",rules:{deck:"long",sauspiel:false,hochzeit:false,wenz:false,farbwenz:false,geier:false,farbsolo:false,ramsch:true}};
  const historical=upsertRating(original(),"round-1","Ben",8.3,automatic);
  const both=upsertRating(historical,"round-1","Clara",9.4,{...modern,cardIds:["private"],photo:"private"});
  const loaded=normalizeDealRatings(JSON.parse(JSON.stringify(both)));
  assert.deepEqual(loaded[0].ratingMeta.Ben,automatic);
  assert.deepEqual(loaded[0].ratingMeta.Clara,modern);
  assert.deepEqual(loaded[0].ratings,{Ben:8.3,Clara:9.4});
  assert.ok(!JSON.stringify(loaded).includes("private"));
  const remote=upsertRating(historical,"round-1","Ben",6,{...modern,rules:{...modern.rules,ramsch:false,farbwenz:true}});
  const merged=normalizeDealRatings(merge(historical,both,remote));
  assert.deepEqual(merged[0].ratingMeta.Clara,modern);
  assert.equal(merged[0].ratingMeta.Ben.rules.farbwenz,true);
  assert.equal(merged[0].ratingMeta.Ben.rules.ramsch,false);
});
test("dealer average still weights all individual ratings equally, with counts",()=>{
  const entries=original().concat(normalizeDealRatings([
    {id:"round-2",dealer:"Anna",ratings:{Ben:10}},
    {id:"draft",dealer:"Anna",ratings:{}},
    {id:"other",dealer:"Ben",ratings:{Anna:2}}
  ]));
  const stats=dealerStats(players,entries);
  assert.equal(stats.Anna.average,22/3);
  assert.equal(stats.Anna.count,3);
  assert.equal(stats.Anna.deals,2);
  assert.deepEqual(stats.Anna.byPlayer.Ben,{average:8.5,count:2});
  assert.deepEqual(stats.David.byPlayer.Ben,{average:null,count:0});
});
test("concurrent saves for different players keep both scores and matching provenance",()=>{
  const base=original();
  const local=upsertRating(base,"round-1","Ben",8.3,automatic);
  const remote=upsertRating(base,"round-1","Clara",3,manual);
  const merged=merge(base,local,remote);
  assert.deepEqual(merged[0].ratings,{Ben:8.3,Clara:3});
  assert.deepEqual(merged[0].ratingMeta.Ben,automatic);
  assert.deepEqual(merged[0].ratingMeta.Clara,manual);
});
test("concurrent edits of one rating choose the synchronizing edit atomically",()=>{
  const base=original();
  const local=upsertRating(base,"round-1","Ben",8.3,automatic);
  const remote=upsertRating(base,"round-1","Ben",3,manual);
  const merged=merge(base,local,remote);
  assert.equal(merged[0].ratings.Ben,8.3);
  assert.deepEqual(merged[0].ratingMeta.Ben,automatic);
});
test("retries/reconnection of identical state never create new dealing entries",()=>{
  const base=original();
  const local=upsertRating(base,"round-1","Ben",8.3,automatic);
  const first=merge(base,local,base);
  assert.deepEqual(merge(base,local,first),first);
  assert.deepEqual(merge(first,first,first),first);
  assert.equal(first.length,1);
});
test("concurrent new dealings and historical deletion behavior are preserved",()=>{
  const base=original();
  const local=base.concat(normalizeDealRatings([{id:"new-local",createdAt:200,dealer:"Ben",ratings:{Anna:3}}]));
  const remote=base.concat(normalizeDealRatings([{id:"new-remote",createdAt:300,dealer:"Clara",ratings:{Anna:4}}]));
  assert.deepEqual(merge(base,local,remote).map(entry=>entry.id),["round-1","new-local","new-remote"]);
  assert.deepEqual(merge(base,[],base),[]);
  assert.deepEqual(merge(base,base,[]),[]);
});
