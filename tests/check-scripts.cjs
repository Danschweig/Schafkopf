// The production app uses Babel in the browser and intentionally has no build.
// Validate the exact script order and React preset from index.html instead.
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const Babel=require("@babel/standalone");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const files=[...html.matchAll(/<script([^>]*?)src="([^"]+)"[^>]*>/g)].filter(match=>!match[2].startsWith("https:"));
let combined="";
for(const [,attributes,file] of files){
  const source=fs.readFileSync(path.join(root,file),"utf8");
  combined+=attributes.includes('type="text/babel"')?Babel.transform(source,{presets:["react"],filename:file}).code:source;
  combined+="\n";
}
new vm.Script(combined,{filename:"combined-production-scripts.js"});
const serviceWorker=fs.readFileSync(path.join(root,"sw.js"),"utf8");
new vm.Script(serviceWorker,{filename:"sw.js"});
new vm.Script(fs.readFileSync(path.join(root,"src/cardScannerWorker.js"),"utf8"),{filename:"cardScannerWorker.js"});
new vm.Script(fs.readFileSync(path.join(root,"src/scannerCheck.js"),"utf8"),{filename:"scannerCheck.js"});
for(const asset of ["models/bavarian-cards.onnx","models/bavarian-cards.metadata.json","models/bavarian-corners.onnx","models/bavarian-corners.metadata.json","vendor/onnxruntime/ort.wasm.min.js","vendor/onnxruntime/ort-wasm-simd-threaded.mjs","vendor/onnxruntime/ort-wasm-simd-threaded.wasm"]){
  assert.ok(fs.existsSync(path.join(root,asset)),`Missing scanner asset: ${asset}`);
}
const cacheFiles=[...serviceWorker.matchAll(/'\.\/([^']+)'/g)].map(match=>match[1]);
for(const file of cacheFiles)assert.ok(fs.existsSync(path.join(root,file)),`Missing precache asset: ${file}`);
for(const [, ,file] of files)assert.ok(cacheFiles.includes(file),`Script not precached: ${file}`);
console.log(`${files.length} local production scripts: JSX, syntax, global declarations and PWA assets OK.`);
