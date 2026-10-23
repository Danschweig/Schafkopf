const {test}=require("node:test"),assert=require("node:assert/strict");
const {decodeReader,proposals,cropTensor,assemble}=require("../src/cardIndexReaderCore.js");
const {rgbTensor}=require("../scripts/check-card-index-reader.cjs");
const logits=(count,winner)=>Array.from({length:count},(_,index)=>index===winner?8:-8);
test("rank reader: the same letter combines with all four suits without changing its rank",()=>{
  const ranks=["sieben","acht","neun","zehn","unter","ober","koenig","ass"],suits=["eichel","gras","herz","schellen"];
  for(let rank=0;rank<8;rank++)for(let suit=0;suit<4;suit++){
    const result=decodeReader(logits(9,rank),logits(5,suit));
    assert.equal(result.cardId,suits[suit]+"-"+ranks[rank]);assert.equal(result.uncertain,false);
  }
});
test("rank reader: unreadable character or symbol abstains; close alternatives remain uncertain",()=>{
  assert.equal(decodeReader(logits(9,8),logits(5,0)).cardId,null);
  assert.equal(decodeReader(logits(9,0),logits(5,4)).cardId,null);
  const ranks=logits(9,5);ranks[6]=7.99;assert.equal(decodeReader(ranks,logits(5,0)).uncertain,true);
  assert.throws(()=>decodeReader([NaN,...Array(8).fill(0)],Array(5).fill(0)));
});
test("rank reader: localization ignores the old class, deduplicates positions and rejects empty images",()=>{
  const data=new Float32Array(36*3);
  [[100,120,25,35],[101,121,25,35],[240,200,25,35]].forEach((box,index)=>box.forEach((value,channel)=>{data[channel*3+index]=value;}));
  data[4*3]=.9;data[(4+17)*3+1]=.8;data[(4+31)*3+2]=.7;
  const found=proposals({dims:[1,36,3],data});assert.equal(found.length,2);assert.ok(!Object.hasOwn(found[0],"cardId"));
  assert.equal(proposals({dims:[1,36,1],data:new Float32Array(36)}).length,0);
});
test("rank reader: RGB patches become normalized channel-first input",()=>{
  const rgb=Buffer.alloc(96*96*3);rgb[0]=255;rgb[1]=128;rgb[2]=64;
  const tensor=rgbTensor(rgb);assert.equal(tensor.length,3*96*96);assert.equal(tensor[0],1);assert.ok(Math.abs(tensor[96*96]-128/255)<1e-7);assert.ok(Math.abs(tensor[96*96*2]-64/255)<1e-7);
});

test("rank reader: crops map out of detector letterbox into source pixels with white aspect padding",()=>{
  const rgba=new Uint8Array(2*4*4);for(let index=0;index<8;index++){rgba[index*4]=255;rgba[index*4+3]=255;}
  const source={width:2,height:4,rgba},fit={x:160,y:0,width:320,height:640};
  const pixels=cropTensor(source,[160,0,480,640],fit),plane=96*96;
  assert.equal(pixels.length,plane*3);
  for(const index of [0,23,72,95])assert.equal(pixels[plane+index],1,"white horizontal padding");
  assert.equal(pixels[48],1);assert.equal(pixels[plane+48],0);assert.equal(pixels[2*plane+48],0);
  assert.equal(cropTensor(source,[0,0,20,20],fit),null,"No crop from detector padding");
  assert.throws(()=>cropTensor({...source,rgba:new Uint8Array(4)},[160,0,480,640],fit));
});

test("rank reader: uncertain eighth suggestion is selected, unknowns and duplicate corners never fill slots",()=>{
  const ids=require("../src/cardScannerCore.js").CLASS_IDS.slice(0,8);
  const detections=ids.map((cardId,index)=>({cardId,confidence:index===7?.5:.9,uncertain:index===7,box:[index*50,0,index*50+20,40]}));
  detections.push({...detections[0],confidence:.8},{cardId:null,confidence:.99,uncertain:true,box:[0,200,20,240]});
  const result=assemble(detections,"reader-version");
  assert.deepEqual(result.cardIds,ids);assert.equal(result.detections.filter(item=>item.selected).length,8);
  assert.equal(result.modelVersion,"reader-version");assert.ok(result.warnings.some(item=>item.includes("Unsichere")));
});
