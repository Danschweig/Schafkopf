const {test}=require("node:test");
const assert=require("node:assert/strict");
const {CLASS_IDS,letterbox,rgbaToTensor,decodeOutput,intersectionOverUnion}=require("../src/cardScannerCore.js");
const {CARDS,evaluateHand}=require("../src/handEvaluation.js");
function tensor(rows,transposed=true){
  const data=new Float32Array(rows.length*36);
  rows.forEach((row,index)=>{
    const values=[...row.box,...Array(32).fill(0)];
    values[4+row.classId]=row.confidence??.95;
    if(row.second!==undefined)values[4+(row.classId+1)%32]=row.second;
    values.forEach((value,col)=>{data[transposed?col*rows.length+index:index*36+col]=value;});
  });
  return {data,dims:transposed?[1,36,rows.length]:[1,rows.length,36]};
}
const row=(classId,x=100,y=100)=>({classId,box:[x,y,60,90]});
test("scanner class mapping contains exactly the existing 32 card IDs",()=>{
  assert.equal(new Set(CLASS_IDS).size,32);
  assert.deepEqual([...CLASS_IDS].sort(),CARDS.map(card=>card.id).sort());
  assert.equal(CLASS_IDS[0],"eichel-sieben");
  assert.equal(CLASS_IDS[4],"eichel-unter");
  assert.equal(CLASS_IDS[31],"schellen-ass");
});
test("letterboxing preserves portrait and landscape proportions",()=>{
  assert.deepEqual(letterbox(400,800),{width:320,height:640,x:160,y:0,size:640});
  assert.deepEqual(letterbox(800,400),{width:640,height:320,x:0,y:160,size:640});
  for(const dims of [[0,800],[NaN,400],[-1,100]])assert.throws(()=>letterbox(...dims));
});
test("RGBA becomes RGB channel-first normalized input without swapping red and blue",()=>{
  assert.deepEqual([...rgbaToTensor(new Uint8Array([255,0,0,255,0,255,255,255]),2,1)],[1,0,0,1,0,1]);
  assert.throws(()=>rgbaToTensor(new Uint8Array(2),2,1));
});
test("eight decoded class IDs feed the existing evaluator without depending on output layout",()=>{
  const rows=Array.from({length:8},(_,index)=>row(index,70+(index%4)*150,150+Math.floor(index/4)*300));
  const result=decodeOutput(tensor(rows));
  assert.equal(result.cardIds.length,8);
  assert.deepEqual(decodeOutput(tensor(rows,false)),result);
  assert.ok(evaluateHand(result.cardIds).score>=1);
});
test("uncertain and close competing classes are preselected for manual correction",()=>{
  const result=decodeOutput(tensor([{...row(0),confidence:.5},{...row(8,300),confidence:.8,second:.75}]));
  assert.deepEqual(result.cardIds,["gras-sieben","eichel-sieben"]);
  assert.equal(result.detections.length,2);
  assert.ok(result.detections.every(item=>item.uncertain));
  assert.ok(result.detections.every(item=>item.selected));
});
test("overlapping detections of the same card are suppressed once",()=>{
  const result=decodeOutput(tensor([row(4),{...row(4,102,102),confidence:.8}]));
  assert.deepEqual(result.cardIds,["eichel-unter"]);
  assert.equal(result.detections.length,1);
});
test("different overlapping cards survive unless their boxes conflict almost completely",()=>{
  const result=decodeOutput(tensor([row(4),row(12,120)]));
  assert.equal(result.cardIds.length,2);
  const conflict=decodeOutput(tensor([row(4),row(12)]));
  assert.equal(conflict.cardIds.length,1);
  assert.ok(conflict.detections.every(item=>item.uncertain));
  assert.equal(conflict.detections.filter(item=>item.selected).length,1);
});
test("a weak alternative class at the same position does not veto a clearly stronger prediction",()=>{
  const result=decodeOutput(tensor([{...row(4),confidence:.9},{...row(12),confidence:.4}]));
  assert.deepEqual(result.cardIds,["eichel-unter"]);
  assert.equal(result.detections.length,1);
});
test("duplicate identities are uncertain but preselect the card only once",()=>{
  const result=decodeOutput(tensor([row(4),row(4,400)]));
  assert.deepEqual(result.cardIds,["eichel-unter"]);
  assert.ok(result.detections.every(item=>item.uncertain));
  assert.equal(result.detections.filter(item=>item.selected).length,1);
});
test("more than eight confident cards keep the strongest eight and explain the limit",()=>{
  const rows=Array.from({length:9},(_,index)=>({...row(index,70+(index%3)*200,100+Math.floor(index/3)*200),confidence:.99-index*.02})).reverse();
  const result=decodeOutput(tensor(rows));
  assert.deepEqual(result.cardIds,CLASS_IDS.slice(0,8));
  assert.ok(result.warnings.some(text=>text.includes("Mehr als acht")));
  assert.ok(result.detections.every(item=>!item.uncertain));
  assert.equal(result.detections.filter(item=>item.selected).length,8);
  assert.equal(result.detections.find(item=>item.cardId===CLASS_IDS[8]).selected,false);
});
test("blank, malformed and non-finite model outputs do not invent cards",()=>{
  assert.deepEqual(decodeOutput(tensor([])).cardIds,[]);
  assert.throws(()=>decodeOutput({dims:[1,84,8400],data:new Float32Array(0)}));
  assert.throws(()=>decodeOutput(null));
  const output=tensor([row(0)]);output.data.fill(NaN);
  assert.deepEqual(decodeOutput(output).cardIds,[]);
  assert.equal(intersectionOverUnion([0,0,20,20],[10,0,30,20]),1/3);
});
test("candidate boxes are clipped and invalid/zero-sized boxes are rejected",()=>{
  const result=decodeOutput(tensor([{...row(0,5,5),box:[5,5,60,90]},{...row(1),box:[100,100,0,20]}]));
  assert.deepEqual(result.detections[0].box,[0,0,35,50]);
  assert.equal(result.detections.length,1);
});

test("corner detections at both ends select a card once without invalidating a complete hand",()=>{
  const rows=Array.from({length:8},(_,index)=>row(index,70+(index%4)*150,100+Math.floor(index/4)*200));
  rows.push({...row(0,100,580),confidence:.85});
  const result=decodeOutput(tensor(rows),{target:"rank-and-suit-index"});
  assert.equal(result.cardIds.length,8);
  assert.equal(result.detections.length,9);
  assert.ok(evaluateHand(result.cardIds).score>=1);
});

test("an uncertain second corner cannot veto a confident card index",()=>{
  const result=decodeOutput(tensor([row(0),{...row(0,400),confidence:.4}]),{target:"rank-and-suit-index"});
  assert.deepEqual(result.cardIds,["eichel-sieben"]);
  assert.throws(()=>decodeOutput(tensor([]),{target:"unknown"}));
});

test("alternative classes on the same corner are resolved without suppressing separate indices",()=>{
  const result=decodeOutput(tensor([row(0),{...row(1,120),confidence:.4},row(2,300)]),{target:"rank-and-suit-index"});
  assert.deepEqual([...result.cardIds].sort(),["eichel-neun","eichel-sieben"]);
  const ambiguous=decodeOutput(tensor([row(0),{...row(1,120),confidence:.9}]),{target:"rank-and-suit-index"});
  assert.deepEqual(ambiguous.cardIds,["eichel-sieben"]);
  assert.ok(ambiguous.detections.every(item=>item.uncertain));
  assert.equal(ambiguous.detections.filter(item=>item.selected).length,1);
});

test("seven confident cards plus one uncertain card form an editable eight-card hand",()=>{
  const rows=Array.from({length:8},(_,index)=>({...row(index,70+(index%4)*150,100+Math.floor(index/4)*250),confidence:index===7?.4:.9}));
  const result=decodeOutput(tensor(rows),{target:"rank-and-suit-index"});
  assert.deepEqual([...result.cardIds].sort(),CLASS_IDS.slice(0,8).sort());
  assert.equal(result.detections.filter(item=>item.selected&&item.uncertain).length,1);
  assert.ok(evaluateHand(result.cardIds).score>=1);
  assert.ok(result.warnings.some(text=>text.includes("Unsichere")));
  assert.ok(!result.warnings.some(text=>text.includes("ergänzen")));
});

test("repeated corners and competing classes do not consume places needed by other cards",()=>{
  const rows=[{...row(0),confidence:.6},{...row(1,105),confidence:.59},
    {...row(0,400,500),confidence:.55},{...row(2,300),confidence:.5}];
  const result=decodeOutput(tensor(rows),{target:"rank-and-suit-index"});
  assert.deepEqual(result.cardIds,["eichel-sieben","eichel-neun"]);
  assert.equal(result.detections.filter(item=>item.selected).length,2);
});
