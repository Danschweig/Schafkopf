"use strict";
const fs=require("node:fs/promises"),path=require("node:path");
const {hash,validateMetadata,UUID,SESSION}=require("./server.cjs");
async function entries(directory){
  const samples=path.join(path.resolve(directory),"samples"),records=[];
  for(const session of await fs.readdir(samples,{withFileTypes:true})){
    if(!session.isDirectory()||session.isSymbolicLink()||!SESSION.test(session.name))throw Error("Ungültiger Spielabend-Ordner: "+session.name);
    for(const sample of await fs.readdir(path.join(samples,session.name),{withFileTypes:true})){
      if(!sample.isDirectory()||sample.isSymbolicLink()||!UUID.test(sample.name))throw Error("Ungültiger Bildordner: "+sample.name);
      const folder=path.join(samples,session.name,sample.name),metadata=JSON.parse(await fs.readFile(path.join(folder,"metadata.json"),"utf8"));
      validateMetadata(metadata);
      if(metadata.id!==sample.name||metadata.sessionId!==session.name||hash(await fs.readFile(path.join(folder,"image.jpg")))!==metadata.imageSha256)throw Error("Archivprüfung fehlgeschlagen: "+sample.name);
      records.push({folder,metadata});
    }
  }return records;
}
function reviewRegions(review,metadata){
  if(review.visuallyReviewed!==true||review.imageSha256!==metadata.imageSha256)throw Error("Die sichtbaren Kartenflächen müssen am richtigen Bild geprüft sein: "+metadata.id);
  if(!Array.isArray(review.objects)||review.objects.length!==8||new Set(review.objects.map(item=>item.cardId)).size!==8)throw Error("Acht verschiedene Kartenflächen erforderlich: "+metadata.id);
  validateMetadata({...metadata,confirmedCardIds:review.objects.map(item=>item.cardId)});
  return review.objects.map(item=>{
    if(!Array.isArray(item.polygon)||item.polygon.length<3||item.polygon.length>100||item.polygon.some(point=>!Array.isArray(point)||point.length!==2||point.some(value=>!Number.isFinite(value))||point[0]<0||point[0]>metadata.image.width||point[1]<0||point[1]>metadata.image.height))throw Error("Ungültige sichtbare Kartenfläche: "+metadata.id);
    let area=0;
    for(let index=0;index<item.polygon.length;index++){const a=item.polygon[index],b=item.polygon[(index+1)%item.polygon.length];area+=a[0]*b[1]-b[0]*a[1];}
    if(Math.abs(area)<20)throw Error("Kartenfläche zu klein: "+metadata.id);
    const xs=item.polygon.map(point=>point[0]),ys=item.polygon.map(point=>point[1]);
    return {cardId:item.cardId,box:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]};
  });
}
async function exportDataset(directory,output,overrides={}){
  directory=path.resolve(directory);output=path.resolve(output);
  if(output===directory||output.startsWith(directory+path.sep)||directory.startsWith(output+path.sep))throw Error("Datensatz muss außerhalb des Archivs liegen.");
  const all=await entries(directory),reviewed=[];
  for(const entry of all){
    let review;
    try{review=JSON.parse(await fs.readFile(path.join(entry.folder,"regions.json"),"utf8"));}catch(error){if(error.code==="ENOENT")continue;throw error;}
    if(review.visuallyReviewed!==true)continue;
    reviewed.push({...entry,regions:reviewRegions(review,entry.metadata)});
  }
  const sessionSplits={};
  for(const {metadata} of reviewed){
    const split=overrides[metadata.sessionId]||((parseInt(hash("schafkopf-archive-v1/"+metadata.sessionId).slice(0,8),16)%100)<20?"test":"train");
    if(!["train","test"].includes(split))throw Error("Aufteilung muss train oder test sein: "+metadata.sessionId);
    sessionSplits[metadata.sessionId]=split;
  }
  if(!Object.values(sessionSplits).includes("train")||!Object.values(sessionSplits).includes("test"))throw Error("Geprüfte Bilder aus mindestens zwei Abenden mit Training und Test benötigt. Bei Bedarf splits.json mit Spielabend-ID -> train/test angeben.");
  const seen=new Map();
  for(const {metadata} of reviewed){
    const split=sessionSplits[metadata.sessionId];
    for(const key of [metadata.imageSha256,metadata.sourceCaptureId]){
      if(seen.has(key)&&seen.get(key)!==split)throw Error("Dasselbe Bild oder dieselbe Aufnahme liegt in Training und Test. Betroffene Abende zusammenlegen.");seen.set(key,split);
    }
  }
  await fs.mkdir(output,{recursive:false,mode:0o700});
  const ids=["eichel","gras","herz","schellen"].flatMap(suit=>["sieben","acht","neun","zehn","unter","ober","koenig","ass"].map(rank=>`${suit}-${rank}`));
  const manifest={schemaVersion:1,createdAt:new Date().toISOString(),policy:"Only visually reviewed regions; whole evening groups stay together. Test is held out and must not guide tuning.",sessionSplits,excludedUnreviewed:all.length-reviewed.length,samples:[]};
  for(const split of ["train","test"]){await fs.mkdir(path.join(output,"images",split),{recursive:true});await fs.mkdir(path.join(output,"labels",split),{recursive:true});}
  for(const {folder,metadata,regions} of reviewed){
    const split=sessionSplits[metadata.sessionId],name=metadata.id;
    await fs.copyFile(path.join(folder,"image.jpg"),path.join(output,"images",split,name+".jpg"));
    const labels=regions.map(({cardId,box:[left,top,right,bottom]})=>[ids.indexOf(cardId),(left+right)/2/metadata.image.width,(top+bottom)/2/metadata.image.height,(right-left)/metadata.image.width,(bottom-top)/metadata.image.height].join(" "));
    await fs.writeFile(path.join(output,"labels",split,name+".txt"),labels.join("\n")+"\n");
    manifest.samples.push({id:metadata.id,sessionId:metadata.sessionId,split,imageSha256:metadata.imageSha256,regionsSha256:hash(await fs.readFile(path.join(folder,"regions.json")))});
  }
  await fs.writeFile(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  await fs.writeFile(path.join(output,"classes.json"),JSON.stringify(ids,null,2)+"\n");
  // Deliberately no val=test YAML: test evenings must not become tuning data.
  return manifest;
}
async function main(){
  const [command,directory,output,splitsFile]=process.argv.slice(2);
  if(command==="verify"){
    const records=await entries(directory);console.log(JSON.stringify({verifiedImages:records.length,evenings:new Set(records.map(item=>item.metadata.sessionId)).size}));
  }else if(command==="export"){
    const overrides=splitsFile?JSON.parse(await fs.readFile(splitsFile,"utf8")):{};
    const manifest=await exportDataset(directory,output,overrides);console.log(JSON.stringify({exported:manifest.samples.length,excludedUnreviewed:manifest.excludedUnreviewed,sessionSplits:manifest.sessionSplits},null,2));
  }else throw Error("Aufruf: node dataset.cjs verify <Archiv> | export <Archiv> <neuer Ausgabeordner> [splits.json]");
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={entries,reviewRegions,exportDataset};
