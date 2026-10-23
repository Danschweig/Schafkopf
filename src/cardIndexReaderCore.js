/* Pure helpers for the optional rank/suit reader. No photo or network IO. */
(function(root){
  "use strict";
  const SIZE=96;
  const RANKS=Object.freeze(["sieben","acht","neun","zehn","unter","ober","koenig","ass","unlesbar"]);
  const SUITS=Object.freeze(["eichel","gras","herz","schellen","unlesbar"]);
  function component(values,names){
    if(values.length!==names.length||Array.from(values).some(value=>!Number.isFinite(value)))throw new Error("Ungültige Leser-Ausgabe.");
    const maximum=Math.max(...values),weights=Array.from(values,value=>Math.exp(value-maximum)),total=weights.reduce((sum,value)=>sum+value,0);
    const order=weights.map((value,index)=>({score:value/total,index})).sort((a,b)=>b.score-a.score);
    return {label:names[order[0].index],confidence:order[0].score,margin:order[0].score-order[1].score};
  }
  function decodeReader(rank,suit){
    const r=component(rank,RANKS),s=component(suit,SUITS),unknown=r.label==="unlesbar"||s.label==="unlesbar";
    return {cardId:unknown?null:s.label+"-"+r.label,rank:r,suit:s,confidence:Math.min(r.confidence,s.confidence),uncertain:unknown||r.confidence<.65||s.confidence<.65||r.margin<.12||s.margin<.12};
  }
  function iou(a,b){
    const intersection=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
    return intersection/Math.max(1,(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-intersection);
  }
  function proposals(tensor){
    const {dims:shape,data}=tensor||{};
    if(!shape||shape.length!==3||shape[0]!==1||shape[1]!==36||!data||data.length!==36*shape[2])throw new Error("Unbekanntes Lokalisierungsmodell.");
    const count=shape[2],candidates=[];
    for(let row=0;row<count;row++){
      let confidence=0;
      for(let cls=0;cls<32;cls++){const score=data[(cls+4)*count+row];if(Number.isFinite(score)&&score<=1)confidence=Math.max(confidence,score);}
      if(confidence<.15)continue;
      const [cx,cy,width,height]=[0,1,2,3].map(channel=>data[channel*count+row]);
      if(![cx,cy,width,height].every(Number.isFinite)||width<5||height<5)continue;
      const clamp=value=>Math.max(0,Math.min(640,value)),box=[clamp(cx-width/2),clamp(cy-height/2),clamp(cx+width/2),clamp(cy+height/2)];
      if(box[2]-box[0]<5||box[3]-box[1]<5)continue;
      candidates.push({box,localizerConfidence:confidence});
    }
    const kept=[];
    for(const item of candidates.sort((a,b)=>b.localizerConfidence-a.localizerConfidence)){
      if(kept.every(previous=>iou(previous.box,item.box)<.45))kept.push(item);
      if(kept.length===32)break;
    }
    return kept;
  }
  function cropTensor(source,box,fit){
    const {width,height,rgba}=source;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||!rgba||rgba.length!==width*height*4)throw new Error("Ungültige Eckzeichenpixel.");
    const left=Math.max(0,Math.floor((box[0]-fit.x)*width/fit.width)),top=Math.max(0,Math.floor((box[1]-fit.y)*height/fit.height));
    const right=Math.min(width,Math.ceil((box[2]-fit.x)*width/fit.width)),bottom=Math.min(height,Math.ceil((box[3]-fit.y)*height/fit.height));
    const cw=right-left,ch=bottom-top;
    if(cw<2||ch<2)return null;
    const scale=SIZE/Math.max(cw,ch),rw=Math.max(1,Math.round(cw*scale)),rh=Math.max(1,Math.round(ch*scale));
    const dx=Math.floor((SIZE-rw)/2),dy=Math.floor((SIZE-rh)/2),plane=SIZE*SIZE,pixels=new Float32Array(3*plane).fill(1);
    // Bilinear white letterbox, like the training recipe. No OffscreenCanvas
    // requirement in the worker (also works in mobile Safari).
    for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
      const sx=Math.max(0,Math.min(cw-1,(x+.5)*cw/rw-.5)),sy=Math.max(0,Math.min(ch-1,(y+.5)*ch/rh-.5));
      const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(cw-1,x0+1),y1=Math.min(ch-1,y0+1),ax=sx-x0,ay=sy-y0;
      const a=((top+y0)*width+left+x0)*4,b=((top+y0)*width+left+x1)*4,c=((top+y1)*width+left+x0)*4,d=((top+y1)*width+left+x1)*4;
      for(let channel=0;channel<3;channel++)pixels[channel*plane+(dy+y)*SIZE+dx+x]=((rgba[a+channel]*(1-ax)+rgba[b+channel]*ax)*(1-ay)+(rgba[c+channel]*(1-ax)+rgba[d+channel]*ax)*ay)/255;
    }
    return pixels;
  }
  function assemble(detections,modelVersion){
    const selected=[];
    for(const item of [...detections].sort((a,b)=>b.confidence-a.confidence)){
      item.selected=false;
      if(item.cardId&&item.confidence>=.35&&!selected.some(other=>other.cardId===item.cardId)&&selected.length<8){item.selected=true;selected.push(item);}
    }
    const warnings=[];
    if(detections.some(item=>item.uncertain))warnings.push("Unsichere Erkennungen bitte von Hand prüfen.");
    if(selected.length<8)warnings.push("Nicht alle acht Karten erkannt. Bitte die Auswahl unten ergänzen.");
    if(new Set(detections.filter(item=>item.cardId&&item.confidence>=.35).map(item=>item.cardId)).size>8)warnings.push("Mehr als acht Kartenvorschläge erkannt. Bitte die acht vorausgewählten Karten prüfen.");
    return {cardIds:selected.map(item=>item.cardId),detections,warnings,modelVersion,detectionTarget:"rank-and-suit-index"};
  }
  const api={SIZE,RANKS,SUITS,decodeReader,proposals,cropTensor,assemble};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SchafkopfCardIndexReaderCore=api;
})(typeof window!=="undefined"?window:globalThis);
