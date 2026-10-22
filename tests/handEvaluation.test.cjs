const {test}=require("node:test");
const assert=require("node:assert/strict");
const {evaluateHand,CARDS,SUITS,WEIGHTS}=require("../src/handEvaluation.js");
const rules={deck:"long",hochzeit:true,wenz:false};
const quiet=["eichel-koenig","eichel-neun","eichel-acht","gras-koenig","gras-neun","schellen-koenig","schellen-neun"];
const trumps=CARDS.filter(card=>card.suit==="herz"||["ober","unter"].includes(card.rank)).map(card=>card.id);
const nonTrumps=CARDS.filter(card=>!trumps.includes(card.id)).map(card=>card.id);
const codes=candidate=>candidate.bonuses.map(bonus=>bonus.code);

test("32 unique IDs, separate labels and immutable central weights",()=>{
  assert.equal(CARDS.length,32);
  assert.equal(new Set(CARDS.map(card=>card.id)).size,32);
  assert.ok(CARDS.every(card=>card.label&&card.id!==card.label));
  assert.ok(Object.isFrozen(WEIGHTS)&&Object.isFrozen(WEIGHTS.trumpQuality));
});
test("full result and input remain identical under permutations",()=>{
  const hand=["eichel-unter","gras-unter","herz-ass","herz-zehn","eichel-ass","eichel-zehn","schellen-koenig","gras-neun"];
  const before=[...hand];
  const expected=evaluateHand(hand);
  for(let offset=0;offset<8;offset++){
    const rotated=hand.slice(offset).concat(hand.slice(0,offset));
    assert.deepEqual(evaluateHand(rotated),expected);
    assert.deepEqual(evaluateHand(rotated.reverse()),expected);
  }
  assert.deepEqual(hand,before);
});
test("reject invalid, duplicate, incomplete, sparse and overfull hands",()=>{
  for(const hand of [null,{},"cards",[],quiet,[...quiet,"unknown"],[...quiet,7],[...quiet,quiet[0]],CARDS.slice(0,9).map(card=>card.id)]){
    assert.throws(()=>evaluateHand(hand));
  }
  const sparse=[...quiet];sparse.length=8;
  assert.throws(()=>evaluateHand(sparse),/ungültige/);
});
test("short deck and malformed rule settings are rejected",()=>{
  for(const settings of [null,[],{deck:"short"},{wenz:"true"},{hochzeit:1}])assert.throws(()=>evaluateHand([...quiet,"herz-sieben"],settings));
});
test("all normal trump bases, including Hochzeit on/off",()=>{
  for(let count=0;count<=8;count++){
    const hand=trumps.slice(0,count).concat(nonTrumps.slice(0,8-count));
    assert.equal(evaluateHand(hand,{...rules,hochzeit:false}).normal.base,[1,1,1.5,2.5,3.5,4.5,5.5,6.5,7.5][count]);
    assert.equal(evaluateHand(hand,rules).normal.base,count===1?3:[1,1,1.5,2.5,3.5,4.5,5.5,6.5,7.5][count]);
  }
});
test("one weak trump outranks two with comparable color quality only under Hochzeit",()=>{
  const one=[...quiet,"herz-sieben"];
  const two=[...quiet.slice(1),"herz-sieben","herz-acht"];
  assert.equal(evaluateHand(one,rules).score,3);
  assert.equal(evaluateHand(two,rules).score,1.5);
  assert.equal(evaluateHand(one,{...rules,hochzeit:false}).score,1);
});
test("every quality bonus is suppressed for the single Hochzeit trump",()=>{
  for(const cardId of Object.keys(WEIGHTS.trumpQuality)){
    const on=evaluateHand([...quiet,cardId],rules);
    assert.equal(on.normal.hochzeitExchange,true);
    assert.deepEqual(on.normal.bonuses,[]);
    const off=evaluateHand([...quiet,cardId],{...rules,hochzeit:false});
    assert.equal(off.normal.bonuses[0].value,WEIGHTS.trumpQuality[cardId]/100);
  }
});
test("short and long ace bonuses are exclusive; ace-ten is additional",()=>{
  const short=evaluateHand(["eichel-ass","eichel-zehn",...trumps.slice(0,6)],rules);
  assert.equal(short.normal.bonuses.find(b=>b.code==="ace:eichel").value,.7);
  assert.equal(short.normal.bonuses.find(b=>b.code==="ace-ten:eichel").value,.2);
  const long=evaluateHand(["eichel-ass","eichel-zehn","eichel-koenig","eichel-neun","gras-neun","gras-koenig","herz-sieben","herz-acht"],rules);
  assert.equal(long.normal.bonuses.find(b=>b.code==="ace:eichel").value,.4);
  assert.equal(long.normal.bonuses.filter(b=>b.code==="ace:eichel").length,1);
  assert.equal(long.normal.bonuses.find(b=>b.code==="ace-ten:eichel").value,.2);
});
test("a ten alone gives no suit bonus and heart ace is only trump quality",()=>{
  const hand=["eichel-zehn",...quiet.slice(1),"herz-ass"];
  const value=evaluateHand(hand,{...rules,hochzeit:false});
  assert.deepEqual(codes(value.normal),["trump:herz-ass"]);
});
test("void bonus requires three trumps, excluding Ober and Unter from suit length",()=>{
  const two=["eichel-ober","eichel-unter","gras-koenig","gras-neun","gras-acht","schellen-koenig","schellen-neun","schellen-acht"];
  assert.ok(!codes(evaluateHand(two,rules).normal).includes("void:eichel"));
  const three=[...two.slice(0,7),"herz-sieben"];
  assert.equal(evaluateHand(three,rules).normal.bonuses.find(b=>b.code==="void:eichel").value,.3);
});
test("Wenz requires enabled rule and at least two Unter; Ober are not Wenz trumps",()=>{
  const hand=["eichel-unter","eichel-ober","gras-ober","herz-ober",...quiet.slice(0,4)];
  assert.equal(evaluateHand(hand).wenz,null);
  for(let count=2;count<=4;count++){
    const unders=SUITS.slice(0,count).map(suit=>`${suit.id}-unter`);
    const h=unders.concat(nonTrumps.slice(0,8-count));
    assert.equal(evaluateHand(h).wenz.base,{2:4,3:6.5,4:8}[count]);
    assert.equal(evaluateHand(h,rules).wenz,null);
  }
});
test("Wenz bonuses include heart ace-ten, independently from normal bonuses",()=>{
  const hand=["eichel-unter","gras-unter","herz-ass","herz-zehn","eichel-ass","eichel-zehn","schellen-koenig","gras-neun"];
  const value=evaluateHand(hand);
  assert.equal(value.normal.value,5.2);
  assert.equal(value.wenz.value,6.8);
  assert.equal(value.wenz.bonuses.length,6);
  assert.equal(value.winningCandidate,"wenz");
  assert.equal(value.score,6.8);
});
test("normal can beat Wenz and final scores are clamped at 10",()=>{
  const eight=SUITS.flatMap(suit=>[`${suit.id}-ober`,`${suit.id}-unter`]);
  const normal=evaluateHand(eight);
  assert.equal(normal.normal.value,11.2);
  assert.equal(normal.wenz.value,9.2);
  assert.equal(normal.winningCandidate,"normal");
  assert.equal(normal.score,10);
  const wenz=evaluateHand(SUITS.flatMap(suit=>[`${suit.id}-unter`,`${suit.id}-ass`]));
  assert.equal(wenz.wenz.value,11.6);
  assert.equal(wenz.score,10);
  assert.equal(wenz.winningCandidate,"wenz");
});
test("round only the final value: 1.25 becomes 1.3, lower bound is 1",()=>{
  const value=evaluateHand([...quiet,"eichel-unter"],{...rules,hochzeit:false});
  assert.equal(value.normal.value,1.25);
  assert.equal(value.score,1.3);
  const low=evaluateHand([...quiet,"schellen-acht"],rules);
  assert.equal(low.score,1);
});
test("sampled hands always stay within bounds with one decimal, without mutation",()=>{
  let seed=91;
  for(let sample=0;sample<1000;sample++){
    const deck=CARDS.map(card=>card.id);
    for(let i=31;i>0;i--){seed=(seed*1664525+1013904223)>>>0;const j=seed%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
    const hand=Object.freeze(deck.slice(0,8));
    const value=evaluateHand(hand,{deck:"long",hochzeit:sample%2===0,wenz:sample%3===0});
    assert.ok(value.score>=1&&value.score<=10);
    assert.ok(Number.isInteger(value.score*10));
    assert.deepEqual(evaluateHand([...hand].reverse(),value.rules),value);
  }
});
