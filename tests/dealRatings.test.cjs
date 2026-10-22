const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {normalizeDealRatings,upsertRating,dealerStats}=require("../src/dealRatings.js");
const context={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve("../src/firebaseSync.js"),"utf8"),context);
const merge=(base,local,remote)=>JSON.parse(JSON.stringify(context.window.SchafkopfFirebase.mergeSessionState(
  {dealRatings:base},{dealRatings:local},{dealRatings:remote}).dealRatings));
const players=["Anna","Ben","Clara","David"];
const automatic={method:"automatic",algorithmVersion:"hand-v1",rules:{deck:"long",hochzeit:true,wenz:false}};
const manual={method:"manual",algorithmVersion:"manual-v1",rules:null};
const original=()=>normalizeDealRatings([{id:"round-1",createdAt:100,dealer:"Anna",ratings:{Ben:7,Clara:5}}]);

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
