"use strict";
const http=require("node:http"),fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const sharp=require("sharp");
const MAX_BODY=4400000,MAX_IMAGE=3*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SESSION=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const CARDS=new Set(["eichel","gras","herz","schellen"].flatMap(suit=>["sieben","acht","neun","zehn","unter","ober","koenig","ass"].map(rank=>`${suit}-${rank}`)));
const hash=value=>crypto.createHash("sha256").update(value).digest("hex");
const problem=(status,message)=>Object.assign(Error(message),{status});
function check(condition,message){if(!condition)throw problem(400,message);}
function cardList(value,max,exact=false){
  check(Array.isArray(value)&&value.length<=max&&(!exact||value.length===max)&&new Set(value).size===value.length&&value.every(id=>CARDS.has(id)),"Ungültige Kartenliste.");return [...value];
}
function validateMetadata(input){
  check(input&&input.schemaVersion===1&&typeof input.id==="string"&&UUID.test(input.id)&&typeof input.sessionId==="string"&&SESSION.test(input.sessionId),"Ungültige Bild- oder Spielabend-ID.");
  check(UUID.test(input.sourceCaptureId||input.id),"Ungültige Aufnahme-ID.");
  check([input.capturedAt,input.confirmedAt].every(value=>typeof value==="string"&&value.length<40&&Number.isFinite(Date.parse(value))),"Ungültiger Aufnahmezeitpunkt.");
  check(typeof input.modelVersion==="string"&&input.modelVersion.length>0&&input.modelVersion.length<=120,"Modellversion fehlt.");
  check(["card","rank-and-suit-index","unknown"].includes(input.detectionTarget),"Ungültiges Erkennungsziel.");
  const image=input.image;
  check(image&&[image.width,image.height,image.originalWidth,image.originalHeight].every(value=>Number.isInteger(value)&&value>0)&&Math.max(image.width,image.height)<=2000&&image.originalWidth*image.originalHeight<=50000000,"Ungültige Bildabmessungen.");
  check(Array.isArray(input.detections)&&input.detections.length<=64,"Ungültige Erkennungen.");
  const detections=input.detections.map(item=>{
    check(item&&CARDS.has(item.cardId)&&Number.isFinite(item.confidence)&&item.confidence>=0&&item.confidence<=1&&Array.isArray(item.box)&&item.box.length===4&&item.box.every(value=>Number.isFinite(value)&&value>=0&&value<=640)&&item.box[2]>item.box[0]&&item.box[3]>item.box[1],"Ungültige Erkennungsregion.");
    return {cardId:item.cardId,confidence:item.confidence,uncertain:item.uncertain===true,box:[...item.box]};
  });
  const scale=Math.min(640/image.originalWidth,640/image.originalHeight),width=Math.max(1,Math.round(image.originalWidth*scale)),height=Math.max(1,Math.round(image.originalHeight*scale));
  // Never accept arbitrary annotations or private game/session fields from clients.
  return {schemaVersion:1,id:input.id,sourceCaptureId:input.sourceCaptureId||input.id,sessionId:input.sessionId,capturedAt:new Date(input.capturedAt).toISOString(),confirmedAt:new Date(input.confirmedAt).toISOString(),
    modelVersion:input.modelVersion,detectionTarget:input.detectionTarget,confirmedCardIds:cardList(input.confirmedCardIds,8,true),suggestedCardIds:cardList(input.suggestedCardIds,8),detections,
    image:{width:image.width,height:image.height,originalWidth:image.originalWidth,originalHeight:image.originalHeight},
    detectorSpace:{width:640,height:640,letterbox:{width,height,x:Math.floor((640-width)/2),y:Math.floor((640-height)/2),size:640}},labelStatus:"hand-confirmed-needs-regions"};
}
async function readJson(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers["content-type"]||""))throw problem(415,"JSON erwartet.");
  if(Number(req.headers["content-length"])>MAX_BODY)throw problem(413,"Upload zu groß.");
  const buffers=[];let total=0;
  for await(const chunk of req){total+=chunk.length;if(total>MAX_BODY)throw problem(413,"Upload zu groß.");buffers.push(chunk);}
  try{return JSON.parse(Buffer.concat(buffers).toString("utf8"));}catch{throw problem(400,"Ungültiges JSON.");}
}
async function durableWrite(file,bytes){
  const handle=await fs.open(file,"wx",0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
}
async function scanUsage(directory){
  let total=0;
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw Error("Verknüpfungen im Archiv sind nicht erlaubt.");
    if(entry.isDirectory())total+=await scanUsage(path.join(directory,entry.name));else if(entry.isFile())total+=(await fs.stat(path.join(directory,entry.name))).size;
  }return total;
}
async function createArchive({directory,token,allowedOrigins,quotaBytes=20*1024**3,ratePerMinute=60,host="127.0.0.1"}){
  if(!["127.0.0.1","::1"].includes(host))throw Error("Das Archiv darf nur an die lokale Loopback-Adresse gebunden werden.");
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(token||""))throw Error("Ein zufälliger Upload-Schlüssel mit mindestens 32 Zeichen ist erforderlich.");
  if(!Array.isArray(allowedOrigins)||!allowedOrigins.length||allowedOrigins.some(origin=>{try{return new URL(origin).origin!==origin||!(origin.startsWith("https://")||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));}catch{return true;}}))throw Error("Erlaubte App-Ursprünge müssen ausdrücklich konfiguriert sein.");
  if(!Number.isSafeInteger(quotaBytes)||quotaBytes<MAX_BODY)throw Error("Ungültiges Archivlimit.");
  directory=path.resolve(directory);await fs.mkdir(directory,{recursive:true,mode:0o700});
  const samples=path.join(directory,"samples"),staging=path.join(directory,"staging");
  await fs.mkdir(samples,{recursive:true,mode:0o700});await fs.mkdir(staging,{recursive:true,mode:0o700});
  // Fail closed if the data root or subdirectories were replaced with links.
  for(const folder of [directory,samples,staging])if((await fs.lstat(folder)).isSymbolicLink())throw Error("Archivpfade dürfen keine Verknüpfungen sein.");
  let usage=await scanUsage(directory),busy=false,windowStart=Date.now(),accepted=0;
  const expected=crypto.createHash("sha256").update(token).digest();
  const authorized=req=>crypto.timingSafeEqual(expected,crypto.createHash("sha256").update(String(req.headers.authorization||"").replace(/^Bearer /,"")).digest());
  function send(res,status,value){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify(value));}
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:30000,headersTimeout:10000},async(req,res)=>{
    res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","no-referrer");
    const origin=req.headers.origin;
    if(origin&&!allowedOrigins.includes(origin))return send(res,403,{error:"App-Ursprung nicht erlaubt."});
    if(origin){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Vary","Origin");}
    if(req.method==="OPTIONS"){
      if(req.url!=="/v1/samples"&&req.url!=="/v1/health")return send(res,404,{error:"Nicht gefunden."});
      res.setHeader("Access-Control-Allow-Methods","POST, GET, OPTIONS");res.setHeader("Access-Control-Allow-Headers","Authorization, Content-Type");res.setHeader("Access-Control-Max-Age","600");return res.writeHead(204).end();
    }
    if(!authorized(req))return send(res,401,{error:"Upload-Schlüssel ungültig."});
    if(req.method==="GET"&&req.url==="/v1/health")return send(res,200,{ok:true,version:1});
    if(req.method!=="POST"||req.url!=="/v1/samples")return send(res,404,{error:"Nicht gefunden."});
    if(Date.now()-windowStart>60000){windowStart=Date.now();accepted=0;}
    if(accepted++>=ratePerMinute){res.setHeader("Retry-After","60");return send(res,429,{error:"Zu viele Uploads. Bitte später versuchen."});}
    if(busy){res.setHeader("Retry-After","5");return send(res,503,{error:"Archiv beschäftigt."});}
    busy=true;let temporary;
    try{
      const data=await readJson(req),metadata=validateMetadata(data.metadata);
      check(typeof data.image==="string"&&data.image.length>0&&data.image.length<=Math.ceil(MAX_IMAGE/3)*4&&/^[A-Za-z0-9+/]+={0,2}$/.test(data.image)&&data.image.length%4===0,"Ungültige JPEG-Daten.");
      const input=Buffer.from(data.image,"base64");check(input.length<=MAX_IMAGE&&input[0]===255&&input[1]===216,"JPEG erwartet.");
      let encoded;
      try{
        const image=sharp(input,{limitInputPixels:4000000,failOn:"warning"}),info=await image.metadata();
        check(info.format==="jpeg"&&info.width===metadata.image.width&&info.height===metadata.image.height&&(!info.orientation||info.orientation===1),"Bildabmessungen stimmen nicht überein.");
        // Re-encode to strip GPS/EXIF and reject malformed image data. No overlays.
        encoded=await image.jpeg({quality:95,chromaSubsampling:"4:4:4"}).toBuffer();
      }catch(error){if(error.status)throw error;throw problem(400,"Beschädigte oder unzulässige Bilddatei.");}
      const imageHash=hash(encoded),payloadHash=hash(JSON.stringify(metadata)+hash(input));
      const session=path.join(samples,metadata.sessionId),target=path.join(session,metadata.id);
      await fs.mkdir(session,{recursive:true,mode:0o700});if((await fs.lstat(session)).isSymbolicLink())throw Error("Unsicherer Archivpfad.");
      try{
        const stored=JSON.parse(await fs.readFile(path.join(target,"metadata.json"),"utf8"));
        if(stored.payloadSha256!==payloadHash)throw problem(409,"Diese Bild-ID gehört bereits zu einem anderen Inhalt.");
        if(hash(await fs.readFile(path.join(target,"image.jpg")))!==stored.imageSha256)throw Error("Gespeichertes Bild ist beschädigt.");
        return send(res,200,{id:metadata.id,stored:true,duplicate:true});
      }catch(error){if(error.code!=="ENOENT")throw error;}
      const record={...metadata,receivedAt:new Date().toISOString(),imageSha256:imageHash,uploadSha256:hash(input),payloadSha256:payloadHash};
      const json=JSON.stringify(record,null,2)+"\n",bytes=encoded.length+Buffer.byteLength(json);
      if(usage+bytes>quotaBytes)throw problem(507,"Archivlimit erreicht. Bitte Speicher freigeben oder Limit erhöhen.");
      temporary=path.join(staging,crypto.randomUUID());await fs.mkdir(temporary,{mode:0o700});
      await durableWrite(path.join(temporary,"image.jpg"),encoded);await durableWrite(path.join(temporary,"metadata.json"),json);
      await fs.rename(temporary,target);temporary=null;usage+=bytes;
      send(res,201,{id:metadata.id,stored:true});
    }catch(error){send(res,error.status||500,{error:error.status?error.message:"Archiv kann momentan nicht speichern. Bitte Serverprotokoll prüfen."});if(!error.status)console.error("Archive storage error:",error.code||error.name);}
    finally{if(temporary)await fs.rm(temporary,{recursive:true,force:true}).catch(()=>{});busy=false;}
  });
  server.on("clientError",(_error,socket)=>socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
  return {server,host,listen:(port=8787)=>new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,host,()=>resolve(server.address()));})};
}
async function main(){
  const configPath=process.argv[2];if(!configPath)throw Error("Aufruf: node server.cjs <Pfad zu config.json>");
  const config=JSON.parse(await fs.readFile(path.resolve(configPath),"utf8"));
  const archive=await createArchive(config);await archive.listen(config.port||8787);
  console.log("Trainingsarchiv läuft auf 127.0.0.1:"+(config.port||8787)+". HTTPS-Zugriff über Tailscale Serve.");
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={createArchive,validateMetadata,hash,UUID,SESSION};
