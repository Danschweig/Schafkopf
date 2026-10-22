// Run only with the local Firestore emulator. Never contacts the live project.
const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const crypto=require('node:crypto');
const localRequire=createRequire(path.join(__dirname,'../.tools/firestore-tests/package.json'));
const {initializeTestEnvironment,assertSucceeds,assertFails}=localRequire('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc,collection,query,where,getDocs,Timestamp,serverTimestamp}=localRequire('firebase/firestore');
if(!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:'))throw new Error('Only the localhost Firestore emulator is allowed.');
const roomId='ABCDE',dealId='deal-test-1234567890',players=['Anna','Ben','Clara','David'];
const createdAt=Timestamp.fromMillis(1000);
const entry={id:dealId,roundId:dealId,createdAt:1000,dealer:'Anna',sealed:true,ratings:{},ratingMeta:{}};
const initial={players,rounds:[],dealRatings:[entry],completedDeals:{},openDealId:dealId};
const game={id:1234,runde:1,typeId:'sauspiel',typeCat:'2vs2',spieler:'Anna',partner:'Ben',gewonnen:true,deltas:{Anna:25,Ben:25,Clara:-25,David:-25},dealId};
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-schafkopf-private',firestore:{host:'127.0.0.1',port:8189,rules:fs.readFileSync(path.join(__dirname,'../firebase.rules'),'utf8')}});});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'schafkopfRooms',roomId),{schemaVersion:1,ownerId:'host',state:initial,revision:1,createdAt,updatedAt:createdAt,updatedBy:'host'}));
});
const db=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const roomRef=database=>doc(database,'schafkopfRooms',roomId);
const ratings=database=>collection(database,'schafkopfRooms',roomId,'privateDealRatings',dealId,'players');
const ratingRef=(database,index=1)=>doc(ratings(database),String(index));
function value(uid,index=1,extra={}){return {ownerId:uid,player:players[index],playerIndex:index,score:7.4,meta:{method:'automatic',algorithmVersion:'hand-v2',rules:{deck:'long',hochzeit:true,wenz:true}},roomCreatedAt:createdAt,updatedAt:serverTimestamp(),...extra};}
async function submit(uid,index=1,extra={}){return setDoc(ratingRef(db(uid),index),value(uid,index,extra));}
async function finish(extra={}){
 const state={...initial,rounds:[game],completedDeals:{[dealId]:game.id},ratingRelease:{dealId,roundIndex:0},openDealId:null,...extra};
 return updateDoc(roomRef(db('host')),{state,revision:2,updatedAt:serverTimestamp(),updatedBy:'host'});
}

test('before result: only the submitting device can read its value; room document contains no score',async()=>{
 await assertSucceeds(submit('alice'));
 assert.equal((await assertSucceeds(getDoc(ratingRef(db('alice'))))).data().score,7.4);
 await assertFails(getDoc(ratingRef(db('bob'))));
 await assertFails(getDoc(ratingRef(db())));
 const room=(await getDoc(roomRef(db('bob')))).data();
 assert.deepEqual(room.state.dealRatings[0].ratings,{});
 assert.ok(!JSON.stringify(room).includes('7.4'));
});
test('pending queries must include ownership and current room generation',async()=>{
 await submit('alice');await submit('bob',2);
 await assertFails(getDocs(ratings(db('alice'))));
 await assertFails(getDocs(query(ratings(db('alice')),where('roomCreatedAt','==',createdAt))));
 const own=await assertSucceeds(getDocs(query(ratings(db('alice')),where('roomCreatedAt','==',createdAt),where('ownerId','==','alice'))));
 assert.equal(own.size,1);assert.equal(own.docs[0].data().player,'Ben');
});
test('another device cannot take over a confirmed player slot or change its metadata',async()=>{
 await submit('alice');
 await assertFails(submit('bob'));
 await assertSucceeds(submit('alice',1,{score:6.2}));
 assert.equal((await getDoc(ratingRef(db('alice')))).data().score,6.2);
});
test('private documents reject cards, photos, malformed scores and mismatched player slots',async()=>{
 for(const extra of [{photo:'private'},{cardIds:['herz-ass']},{score:11},{score:'8'},{player:'Clara'},{playerIndex:2},{ownerId:'bob'},{roomCreatedAt:Timestamp.fromMillis(1)},{meta:{method:'automatic',algorithmVersion:'hand-v2',rules:{deck:'long',hochzeit:true,wenz:true,cardIds:['private']}}}])await assertFails(submit('alice',1,extra));
 await assertFails(deleteDoc(ratingRef(db('alice'))));
});
test('round result and release marker commit together; all players can then read the ratings',async()=>{
 await submit('alice');await submit('bob',2,{score:4.2});
 await assertSucceeds(finish());
 assert.equal((await assertSucceeds(getDoc(ratingRef(db('bob'))))).data().score,7.4);
 const all=await assertSucceeds(getDocs(query(ratings(db('bob')),where('roomCreatedAt','==',createdAt))));
 assert.equal(all.size,2);
 await assertFails(submit('alice',1,{score:9}));
 await assertFails(submit('third',3));
});
test('a release marker without a game, without a result, or for a card penalty is denied',async()=>{
 await assertFails(finish({rounds:[]}));
 await assertFails(finish({rounds:[{...game,gewonnen:null}]}));
 await assertFails(finish({rounds:[{...game,spieler:null,partner:null}]}));
 await assertFails(finish({rounds:[{...game,cardPenalty:true,typeId:'kartenstrafe'}]}));
 await assertFails(finish({ratingRelease:{dealId,roundIndex:8}}));
 await assertFails(finish({completedDeals:{[dealId]:999}}));
});
test('a released marker cannot be removed and an edited game does not release a different hand',async()=>{
 await submit('alice');await finish();
 await assertFails(updateDoc(roomRef(db('host')),{state:{...initial,rounds:[game]},revision:3,updatedAt:serverTimestamp(),updatedBy:'host'}));
 await assertFails(finish({completedDeals:{[dealId]:1234,'deal-other-1234567890':1234},ratingRelease:{dealId:'deal-other-1234567890',roundIndex:0}}));
});
test('deleting and reusing a room code does not expose submissions of the previous room',async()=>{
 await submit('alice');
 await env.withSecurityRulesDisabled(async ctx=>setDoc(roomRef(ctx.firestore()),{schemaVersion:1,ownerId:'new-host',state:{...initial,completedDeals:{[dealId]:1234}},revision:1,createdAt:Timestamp.fromMillis(9999),updatedAt:Timestamp.fromMillis(9999),updatedBy:'new-host'}));
 await assertFails(getDoc(ratingRef(db('alice'))));
 await assertFails(getDoc(ratingRef(db('bob'))));
});

test('production Firebase client: two devices upload privately and both see all scores only after the result',async()=>{
 const sdk=localRequire('firebase/firestore');
 const clients=[],events={alice:[],bob:[]};
 const stateEvents={alice:[],bob:[],host:[]};
 async function clientFor(uid){
  const database=db(uid);
  const modules={
   'firebase-app.js':{getApps:()=>[],initializeApp:()=>({})},
   'firebase-auth.js':{getAuth:()=>({}),signInAnonymously:async()=>({user:{uid}})},
   'firebase-firestore.js':{...sdk,getFirestore:()=>database}
  };
  const context={window:{SchafkopfDealRatings:require('../src/dealRatings.js')},crypto,TextEncoder,__import:async url=>modules[url.split('/').at(-1)]};
  const source=fs.readFileSync(path.join(__dirname,'../src/firebaseSync.js'),'utf8').replace(/\bimport\(/g,'__import(');
  // Run in the SDK's JavaScript realm: Firestore intentionally rejects
  // cross-VM object prototypes, unlike the browser's single document realm.
  new Function('window','crypto','TextEncoder','__import',source)(context.window,crypto,TextEncoder,context.__import);
  const client=await context.window.SchafkopfFirebase.createClient({apiKey:'emulator',authDomain:'emulator',projectId:'demo-schafkopf-private',appId:uid});
  clients.push(client);
  await client.joinRoom(roomId,state=>stateEvents[uid].push(state));
  return client;
 }
 async function until(condition){
  const deadline=Date.now()+5000;
  while(!condition()){if(Date.now()>deadline)throw new Error('Timed out waiting for server snapshot');await new Promise(resolve=>setTimeout(resolve,15));}
 }
 try{
  const alice=await clientFor('alice'),bob=await clientFor('bob'),host=await clientFor('host');
  let stopAlice=alice.watchPrivateRatings(dealId,values=>events.alice.push(values),error=>{throw error;});
  let stopBob=bob.watchPrivateRatings(dealId,values=>events.bob.push(values),error=>{throw error;});
  const meta={method:'automatic',algorithmVersion:'hand-v2',rules:{deck:'long',hochzeit:true,wenz:true}};
  await alice.submitPrivateRating(dealId,'Ben',6.8,meta);
  await bob.submitPrivateRating(dealId,'Clara',4.2,meta);
  await until(()=>events.alice.at(-1)?.length===1&&events.bob.at(-1)?.length===1);
  assert.equal(events.alice.at(-1)[0].player,'Ben');assert.equal(events.bob.at(-1)[0].player,'Clara');
  assert.ok(events.alice.every(values=>values.every(item=>item.ownerId==='alice')));
  assert.ok(events.bob.every(values=>values.every(item=>item.ownerId==='bob')));
  const saved=await host.saveState({...initial,rounds:[game],completedDeals:{[dealId]:game.id}},initial,1);
  assert.equal(saved.state.completedDeals[dealId],game.id);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.state.dealRatings[0].ratings)),{});
  await until(()=>stateEvents.alice.at(-1)?.completedDeals?.[dealId]&&stateEvents.bob.at(-1)?.completedDeals?.[dealId]);
  stopAlice();stopBob();
  stopAlice=alice.watchPrivateRatings(dealId,values=>events.alice.push(values),error=>{throw error;});
  stopBob=bob.watchPrivateRatings(dealId,values=>events.bob.push(values),error=>{throw error;});
  await until(()=>events.alice.at(-1)?.length===2&&events.bob.at(-1)?.length===2);
  assert.deepEqual(events.bob.at(-1).map(value=>value.score).sort(),[4.2,6.8]);
  await assert.rejects(()=>alice.submitPrivateRating(dealId,'Ben',9,meta),/abgeschlossen/);
  stopAlice();stopBob();
 }finally{clients.forEach(client=>client.disconnect());}
});
test('Smash Bingo pool, immutable round results and manual corrections retain their rules',async()=>{
 const database=db();
 await assertSucceeds(setDoc(doc(database,'smashBingo','sharedPool'),{fields:['Test'],bonusFields:[],updatedAt:serverTimestamp()}));
 await assertSucceeds(getDoc(doc(database,'smashBingo','sharedPool')));
 await assertFails(deleteDoc(doc(database,'smashBingo','sharedPool')));
 const round=doc(database,'smashBingoRounds','test_round_123456789012345');
 await assertSucceeds(setDoc(round,{player:'Daniel',boardSize:4,bingos:1,bonusBingo:false,completedAt:serverTimestamp()}));
 await assertFails(updateDoc(round,{bingos:2}));
 const adjustments=doc(database,'smashBingo','leaderboardAdjustments');
 await assertSucceeds(setDoc(adjustments,{Daniel:1,Fabian:0,Tim:0,revision:1,updatedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(adjustments,{Tim:1,revision:2,updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(adjustments,{Tim:2,revision:2,updatedAt:serverTimestamp()}));
});
