// Read-only HTTP deployment check. Does not claim browser/phone compatibility.
const crypto=require("node:crypto");
async function checkPages(base){
  const url=new URL(base);
  if(!/^https?:$/.test(url.protocol)||!url.pathname.endsWith("/"))throw new Error("Bitte eine HTTP(S)-Adresse mit abschließendem / angeben.");
  const failures=[],checked=new Map();
  async function get(file,kind){
    const response=await fetch(new URL(file,url),{signal:AbortSignal.timeout(30000),cache:"no-store"});
    const type=response.headers.get("content-type")||"";
    if(!response.ok)throw new Error(`${file}: HTTP ${response.status}`);
    if(kind==="html"&&!type.includes("text/html"))throw new Error(`${file}: falscher HTML Content-Type ${type}`);
    if(response.headers.get("content-length")>64*1024*1024)throw new Error(`${file}: unerwartet groß`);
    if(kind==="script"&&!/(java|ecma)script/.test(type))throw new Error(`${file}: falscher Content-Type ${type}`);
    if(kind==="wasm"&&!type.includes("application/wasm"))throw new Error(`${file}: falscher WASM Content-Type ${type}`);
    if(kind!=="html"&&type.includes("text/html"))throw new Error(`${file}: HTML statt benötigter Datei`);
    const bytes=Buffer.from(await response.arrayBuffer());
    checked.set(file,{bytes:bytes.length,type});
    return bytes;
  }
  const html=(await get("index.html","html")).toString("utf8");
  const sw=(await get("sw.js","script")).toString("utf8");
  const files=new Set(["scanner-check.html","src/scannerCheck.js","src/cardScannerCore.js","src/cardScanner.js","src/cardScannerWorker.js","src/components/photoCardScanner.js",...[...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(item=>item[1]).filter(file=>!/^https?:/.test(file)),
    ...[...sw.matchAll(/'\.\/([^']+)'/g)].map(item=>item[1]),
    "vendor/onnxruntime/ort.wasm.min.js","vendor/onnxruntime/ort-wasm-simd-threaded.mjs","vendor/onnxruntime/ort-wasm-simd-threaded.wasm"]);
  // Sequential downloads avoid measuring a burst of parallel large downloads.
  for(const file of files){
    if(checked.has(file))continue;
    try{
      const kind=/\.(m?js)$/.test(file)?"script":file.endsWith(".wasm")?"wasm":file.endsWith(".html")?"html":"asset";
      const bytes=await get(file,kind);
      if(file.endsWith(".wasm")&&!bytes.subarray(0,4).equals(Buffer.from([0,97,115,109])))throw new Error(`${file}: ungültiger WASM-Header`);
    }catch(error){failures.push(error.message);}
  }
  const models=[...new Set(Object.values(require("../src/cardScannerCore.js").MODELS).map(profile=>profile.file))];
  for(const model of models){
    try{
      const metadata=JSON.parse((await get(`models/${model}.metadata.json`,"json")).toString("utf8"));
      const bytes=await get(`models/${model}.onnx`,"model");
      const hash=crypto.createHash("sha256").update(bytes).digest("hex");
      if(hash!==metadata.onnxSha256)throw new Error(`${model}: Modell passt nicht zu seinen Metadaten`);
    }catch(error){failures.push(error.message);}
  }
  return {base:url.href,status:failures.length?"FAILED":"HTTP_ASSETS_OK",checked:checked.size,failures,
    limitation:"HTTP-/Dateiprüfung; kein visueller Browser- oder Smartphone-Test."};
}
if(require.main===module)checkPages(process.argv[2]).then(result=>{console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=2;});
module.exports={checkPages};
