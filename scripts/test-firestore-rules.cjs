// Local demo-project emulator only. No Firebase login or deployment.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),testRoot=path.join(root,'.tools/firestore-tests');
const cli=path.join(testRoot,'node_modules/firebase-tools/lib/bin/firebase.js');
if(!fs.existsSync(cli)){
  console.error('Install first: npm.cmd install --prefix .tools/firestore-tests --no-audit --no-fund firebase-tools@15.34.1 @firebase/rules-unit-testing@6.0.0 firebase@13.1.0');
  process.exit(1);
}
fs.writeFileSync(path.join(testRoot,'firebase.json'),JSON.stringify({
  firestore:{rules:'firebase.rules'},
  emulators:{firestore:{host:'127.0.0.1',port:8189},ui:{enabled:false},singleProjectMode:true}
},null,2)+'\n');
fs.copyFileSync(path.join(root,'firebase.rules'),path.join(testRoot,'firebase.rules'));
const env={...process.env,CI:'true',FIREBASE_EMULATORS_PATH:path.join(testRoot,'emulators')};
const javaRoot=path.join(root,'.tools/java21');
if(fs.existsSync(javaRoot)){
  const localJava=fs.readdirSync(javaRoot,{withFileTypes:true}).find(item=>item.isDirectory()&&fs.existsSync(path.join(javaRoot,item.name,'bin',process.platform==='win32'?'java.exe':'java')));
  if(localJava){
    env.JAVA_HOME=path.join(javaRoot,localJava.name);
    const key=Object.keys(env).find(key=>key.toUpperCase()==='PATH')||'PATH';
    env[key]=path.join(env.JAVA_HOME,'bin')+path.delimiter+env[key];
  }
}
const child=spawn(process.execPath,[cli,'emulators:exec','--config',path.join(testRoot,'firebase.json'),'--project','demo-schafkopf-private','--only','firestore','node tests/firestorePrivacy.cjs'],{cwd:root,env,stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('close',code=>{
  for(const file of ['firebase-debug.log','firestore-debug.log']){
    try{if(fs.existsSync(path.join(root,file)))fs.renameSync(path.join(root,file),path.join(testRoot,file));}catch{}
  }
  process.exitCode=code??1;
});
