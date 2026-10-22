/* Image-model output -> the same card IDs used by evaluateHand(). No IO. */
(function(root){
  "use strict";
  const IMAGE_SIZE=640;
  const MODEL_VERSION="bavarian-yolov8n-2026-03-13";
  const DETECTION_TARGET="card";
  const MODELS=Object.freeze({
    standard:Object.freeze({file:"bavarian-cards",version:MODEL_VERSION,target:"card",label:"Allgemeines Kartenmodell"}),
    personal:Object.freeze({file:"bavarian-corners",version:"bavarian-corners-pilot-2026-10-22-v2",target:"rank-and-suit-index",label:"Dein Kartenblatt · neu trainiert (Beta)"})
  });
  // Camera default; direct decodeOutput() defaults remain the legacy model.
  const DEFAULT_MODEL="personal";
  const CLASS_IDS=Object.freeze(["eichel","gras","herz","schellen"].flatMap(suit=>
    ["sieben","acht","neun","zehn","unter","ober","koenig","ass"].map(rank=>`${suit}-${rank}`)));
  const LIMITS=Object.freeze({suggestion:.35,accept:.65,margin:.12,iou:.45,conflictIou:.82,indexConflictIou:.35,maxCards:8});

  function letterbox(width,height,size=IMAGE_SIZE){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error("Ungültige Bildgröße.");
    const scale=Math.min(size/width,size/height);
    const scaledWidth=Math.max(1,Math.round(width*scale));
    const scaledHeight=Math.max(1,Math.round(height*scale));
    return {width:scaledWidth,height:scaledHeight,x:Math.floor((size-scaledWidth)/2),y:Math.floor((size-scaledHeight)/2),size};
  }
  function rgbaToTensor(rgba,width=IMAGE_SIZE,height=IMAGE_SIZE){
    if(!rgba||rgba.length!==width*height*4)throw new Error("Ungültige Bilddaten.");
    const plane=width*height;
    const data=new Float32Array(plane*3);
    for(let i=0;i<plane;i++){
      data[i]=rgba[i*4]/255;
      data[i+plane]=rgba[i*4+1]/255;
      data[i+plane*2]=rgba[i*4+2]/255;
    }
    return data;
  }
  function intersectionOverUnion(a,b){
    const width=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]));
    const height=Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
    const intersection=width*height;
    const union=(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-intersection;
    return union>0?intersection/union:0;
  }
  function decodeOutput(tensor,{target=DETECTION_TARGET}={}){
    if(!["card","rank-and-suit-index"].includes(target))throw new Error("Unbekanntes Erkennungsziel.");
    const {dims,data}=tensor||{};
    const channels=4+CLASS_IDS.length;
    if(!Array.isArray(dims)||dims.length!==3||dims[0]!==1||!data||
      (dims[1]!==channels&&dims[2]!==channels)||data.length!==dims[1]*dims[2]){
      throw new Error("Das Erkennungsmodell liefert ein unerwartetes Ausgabeformat.");
    }
    const transposed=dims[1]===channels;
    const count=transposed?dims[2]:dims[1];
    const at=(row,col)=>transposed?data[col*count+row]:data[row*channels+col];
    const candidates=[];
    for(let row=0;row<count;row++){
      let best=-1,second=-1,classId=-1;
      for(let col=0;col<CLASS_IDS.length;col++){
        const score=at(row,col+4);
        if(!Number.isFinite(score)||score<0||score>1)continue;
        if(score>best){second=best;best=score;classId=col;}
        else if(score>second)second=score;
      }
      if(best<LIMITS.suggestion)continue;
      const [cx,cy,width,height]=[0,1,2,3].map(col=>at(row,col));
      if(![cx,cy,width,height].every(Number.isFinite)||width<8||height<8)continue;
      const clamp=value=>Math.max(0,Math.min(IMAGE_SIZE,value));
      const box=[clamp(cx-width/2),clamp(cy-height/2),clamp(cx+width/2),clamp(cy+height/2)];
      if(box[2]-box[0]<8||box[3]-box[1]<8)continue;
      candidates.push({cardId:CLASS_IDS[classId],confidence:best,box,
        uncertain:best<LIMITS.accept||best-second<LIMITS.margin});
    }
    candidates.sort((a,b)=>b.confidence-a.confidence||a.cardId.localeCompare(b.cardId));
    const detections=[];
    // Class-aware suppression keeps distinct overlapping cards in a fan.
    for(const candidate of candidates){
      if(detections.some(other=>candidate.cardId===other.cardId&&intersectionOverUnion(candidate.box,other.box)>LIMITS.iou))continue;
      detections.push(candidate);
      if(detections.length>=64)break;
    }
    const warnings=[];
    const suppressed=new Set();
    for(let i=0;i<detections.length;i++)for(let j=i+1;j<detections.length;j++){
      if(suppressed.has(i)||suppressed.has(j))continue;
      const a=detections[i],b=detections[j];
      // A corner detector can see both ends of the same physical card.
      if(a.cardId===b.cardId){if(target==="card"){a.uncertain=true;b.uncertain=true;}}
      else if(intersectionOverUnion(a.box,b.box)>(target==="rank-and-suit-index"?LIMITS.indexConflictIou:LIMITS.conflictIou)){
        // An anchor may also propose a much weaker alternative class for the
        // same physical card. Only close competing predictions are ambiguous.
        if(a.confidence>=LIMITS.accept&&a.confidence-b.confidence>=LIMITS.margin)suppressed.add(j);
        else{a.uncertain=true;b.uncertain=true;}
      }
    }
    const kept=detections.filter((item,index)=>!suppressed.has(index));
    let cardIds=[...new Set(kept.filter(item=>!item.uncertain).map(item=>item.cardId))];
    if(kept.some(item=>item.uncertain))warnings.push("Unsichere oder widersprüchliche Erkennungen bitte von Hand prüfen.");
    if(cardIds.length>LIMITS.maxCards){
      cardIds=[];
      kept.forEach(item=>{item.uncertain=true;});
      warnings.push("Mehr als acht Karten erkannt. Bitte nur deine acht Handkarten fotografieren.");
    }
    if(cardIds.length<LIMITS.maxCards)warnings.push("Fehlende Karten bitte von Hand ergänzen; unsichere Vorschläge wurden nicht automatisch übernommen.");
    return {cardIds,detections:kept,warnings,modelVersion:MODEL_VERSION};
  }
  const api={IMAGE_SIZE,MODEL_VERSION,DETECTION_TARGET,MODELS,DEFAULT_MODEL,CLASS_IDS,LIMITS,letterbox,rgbaToTensor,intersectionOverUnion,decodeOutput};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SchafkopfCardScannerCore=api;
})(typeof window!=="undefined"?window:globalThis);
