const {test}=require("node:test");
const assert=require("node:assert/strict");
const {evaluateHand,evaluateHandV1,CARDS,SUITS,GAME_OPTIONS,DEFAULT_RULES,normalizeRules,toggleGame,rulesForGameTypes}=require("../src/handEvaluation.js");
const only=game=>({deck:"long",...Object.fromEntries(GAME_OPTIONS.map(({id})=>[id,id===game]))});
const low=["eichel-sieben","eichel-acht","eichel-neun","gras-sieben","gras-acht","gras-neun","schellen-sieben","schellen-acht"];
const top=SUITS.flatMap(({id})=>[`${id}-ober`,`${id}-unter`]);

test("v2: each requested game has its own candidate, with Hochzeit requiring one normal trump",()=>{
  const wedding=[...low.slice(0,7),"herz-sieben"];
  for(const {id} of GAME_OPTIONS){
    const value=evaluateHand(wedding,only(id));
    assert.equal(value.algorithmVersion,"hand-v2");
    assert.deepEqual(value.candidates.map(candidate=>candidate.game),[id]);
    assert.ok(value.score>=1&&value.score<=10);
  }
  assert.equal(evaluateHand(low,only("hochzeit")).score,null);
  assert.equal(evaluateHand(wedding,only("hochzeit")).score,evaluateHandV1(wedding,{hochzeit:true,wenz:false}).score);
  assert.equal(evaluateHand(top,only("sauspiel")).score,evaluateHandV1(top,{hochzeit:false,wenz:false}).score);
});

test("v2: Farb-Wenz uses only Unter plus chosen suit; Farbsolo also makes off-suit Ober trumps",()=>{
  const hand=["eichel-ober","gras-ober","herz-ober","schellen-ober","eichel-unter","gras-sieben","herz-ass","schellen-zehn"];
  const wenz=evaluateHand(hand,only("wenz")),geier=evaluateHand(hand,only("geier"));
  assert.equal(wenz.bestCandidate.trumpCount,1);assert.equal(geier.bestCandidate.trumpCount,4);
  const colorWenz=evaluateHand(hand,only("farbwenz")).bestCandidate.alternatives;
  const solo=evaluateHand(hand,only("farbsolo")).bestCandidate.alternatives;
  assert.deepEqual(colorWenz.map(item=>item.trumpSuit),SUITS.map(item=>item.id));
  assert.equal(colorWenz.find(item=>item.trumpSuit==="herz").trumpCount,3);
  assert.equal(colorWenz.find(item=>item.trumpSuit==="eichel").trumpCount,2);
  assert.equal(solo.find(item=>item.trumpSuit==="herz").trumpCount,6);
  assert.equal(solo.find(item=>item.trumpSuit==="eichel").trumpCount,5);
});

test("v2: Geier mirrors Wenz with Ober and Unter exchanged",()=>{
  const hand=["eichel-unter","gras-unter","herz-ass","herz-zehn","eichel-ass","eichel-zehn","schellen-koenig","gras-neun"];
  const swapped=hand.map(id=>id.replace(/-(ober|unter)$/,(match,rank)=>rank==="ober"?"-unter":"-ober"));
  assert.equal(evaluateHand(hand,only("wenz")).score,6.8);
  assert.equal(evaluateHand(swapped,only("geier")).score,6.8);
  assert.equal(evaluateHand(hand,only("geier")).bestCandidate.trumpCount,0);
});

test("v2: color games select the strongest of all four suits and disabled games cannot win",()=>{
  const hand=SUITS.map(({id})=>`${id}-unter`).concat(["schellen-sieben","schellen-acht","schellen-neun","schellen-koenig"]);
  for(const game of ["farbwenz","farbsolo"]){
    const value=evaluateHand(hand,only(game));
    assert.equal(value.bestCandidate.trumpSuit,"schellen");
    assert.equal(value.bestCandidate.trumpCount,8);
    assert.equal(value.bestCandidate.alternatives.length,4);
    assert.equal(value.bestCandidate.value,Math.max(...value.bestCandidate.alternatives.map(item=>item.value)));
    assert.equal(value.winningCandidate,`${game}:schellen`);
  }
  const mixed=evaluateHand(hand,{...only("sauspiel"),farbwenz:true});
  assert.equal(mixed.bestCandidate.game,"farbwenz");
  assert.equal(evaluateHand(hand,only("sauspiel")).bestCandidate.game,"sauspiel");
});

test("v2: Ramsch rewards weak hands and penalizes high trumps and isolated point cards",()=>{
  const weak=evaluateHand(low,only("ramsch")),strong=evaluateHand(top,only("ramsch"));
  assert.equal(weak.score,10);assert.equal(strong.score,1);
  const singleton=evaluateHand([...low.slice(0,6),"herz-sieben","schellen-ass"],only("ramsch"));
  assert.ok(singleton.score<weak.score);
  assert.ok(singleton.bestCandidate.bonuses.some(item=>item.code==="risk:singleton:schellen"));
  assert.ok(strong.bestCandidate.bonuses.some(item=>item.code==="risk:trump-control"));
  assert.equal(weak.bestCandidate.goal,"avoid-tricks");
  assert.ok(strong.bestCandidate.bonuses.every(item=>item.value<0));
});

test("v2: Ramsch is exclusive in normalization and both directions of selection",()=>{
  const source=Object.freeze({...DEFAULT_RULES,ramsch:true});
  const ramsch=normalizeRules(source);
  for(const {id} of GAME_OPTIONS)assert.equal(ramsch[id],id==="ramsch");
  assert.equal(source.sauspiel,true);
  for(const {id} of GAME_OPTIONS.filter(({id})=>id!=="ramsch")){
    const changed=toggleGame(ramsch,id);
    assert.equal(changed.ramsch,false);assert.equal(changed[id],true);
  }
  assert.deepEqual(toggleGame(DEFAULT_RULES,"ramsch"),ramsch);
  const none=toggleGame(ramsch,"ramsch");
  const value=evaluateHand(low,none);
  assert.equal(value.score,null);assert.equal(value.bestCandidate,null);assert.deepEqual(value.candidates,[]);
  assert.throws(()=>toggleGame(ramsch,"unknown"));
});

test("v2: presets follow app game types and never silently select Ramsch with normal games",()=>{
  const types=[{id:"sauspiel"},{id:"wenz",hasFarbe:true},{id:"geier"},{id:"farbsolo"},{id:"ramsch"}];
  assert.deepEqual(rulesForGameTypes(types),{deck:"long",sauspiel:true,hochzeit:false,wenz:true,farbwenz:true,geier:true,farbsolo:true,ramsch:false});
  assert.equal(rulesForGameTypes([{id:"wenz",hasFarbe:false}]).farbwenz,false);
  assert.equal(rulesForGameTypes([{id:"ramsch"}]).ramsch,true);
  for(const {id} of GAME_OPTIONS)assert.throws(()=>normalizeRules({[id]:"true"}));
  for(const value of [null,[],{deck:null},{deck:"short"}])assert.throws(()=>normalizeRules(value));
});

test("v2: sampled hands stay canonical, bounded and immutable for every game and combination",()=>{
  let seed=712;
  for(let sample=0;sample<128;sample++){
    const deck=CARDS.map(card=>card.id);
    for(let i=31;i>0;i--){seed=(seed*1664525+1013904223)>>>0;const j=seed%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
    const hand=Object.freeze(deck.slice(0,8));
    for(const settings of [DEFAULT_RULES,...GAME_OPTIONS.map(({id})=>only(id))]){
      const value=evaluateHand(hand,settings);
      assert.deepEqual(evaluateHand([...hand].reverse(),settings),value);
      if(value.candidates.length){assert.ok(value.score>=1&&value.score<=10);assert.ok(Number.isInteger(value.score*10));}
      else assert.equal(value.score,null);
      assert.doesNotThrow(()=>JSON.stringify(value));
    }
  }
  for(const hand of [[],[...low,low[0]],[...low.slice(0,7),low[0]],[...low.slice(0,7),"bad"]])assert.throws(()=>evaluateHand(hand));
});
