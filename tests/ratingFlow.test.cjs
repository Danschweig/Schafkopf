const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const crypto=require("node:crypto");
const React=require("react");
const {create,act}=require("react-test-renderer");
const Babel=require("@babel/standalone");
const root=path.resolve(__dirname,"..");
const players=["Anna","Ben","Clara","David"];
const oldDeal={id:"historic",createdAt:100,dealer:"Anna",ratings:{Ben:7,Clara:5}};

function app(saved={players,dealRatings:[oldDeal]},existingStorage){
  const storage=existingStorage||new Map([["schafkopf-v1",JSON.stringify(saved)]]);
  const context={React,crypto,console,setTimeout,clearTimeout,
    Recharts:Object.fromEntries(["LineChart","Line","XAxis","YAxis","CartesianGrid","Tooltip","ReferenceLine","ResponsiveContainer","BarChart","Bar"].map(name=>[name,()=>null])),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    document:{body:{style:{}},querySelector:()=>({setAttribute(){}})},
    navigator:{userAgent:"Node integration test"},matchMedia:()=>({matches:false}),
    location:{hash:"",href:"http://localhost/"},confirm:()=>true
  };
  context.window=context;
  vm.createContext(context);
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  for(const [,attributes,file] of html.matchAll(/<script([^>]*?)src="([^"]+)"[^>]*>/g)){
    if(file.startsWith("https:")||["src/main.js","src/registerServiceWorker.js"].includes(file))continue;
    const source=fs.readFileSync(path.join(root,file),"utf8");
    vm.runInContext(attributes.includes('type="text/babel"')?Babel.transform(source,{presets:["react"],filename:file}).code:source,context,{filename:file});
  }
  let rendered;
  act(()=>{rendered=create(React.createElement(context.SchafkopfTracker));});
  return {rendered,context,storage,state:()=>JSON.parse(storage.get("schafkopf-v1"))};
}
const text=node=>typeof node==="string"?node:node.children.map(text).join("");
const button=(app,label)=>{
  const match=app.rendered.root.findAllByType("button").find(node=>typeof label==="string"?text(node)===label:label.test(text(node)));
  assert.ok(match,`Missing button: ${label}`);
  return match;
};
const click=node=>{assert.ok(!node.props.disabled,"Cannot click a disabled button");act(()=>node.props.onClick());};
const card=(app,label)=>app.rendered.root.findAllByType("button").find(node=>node.props["aria-label"]===label);
const confirmation=app=>button(app,/^Bewertung bestätigen/);
const open=app=>click(button(app,/Austeilen$/));

test("full app: pick eight cards, explicitly confirm, replace and reload without exposing cards",()=>{
  const instance=app();
  open(instance);
  assert.match(text(instance.rendered.root),/Manuell · Altbestand/);
  click(button(instance,/^Ben7,0/));
  click(button(instance,"Karten auswählen"));
  assert.equal(confirmation(instance).props.disabled,true);
  const hand=["Eichel-Unter","Gras-Unter","Herz-Ass","Herz-Zehn","Eichel-Ass","Eichel-Zehn","Schellen-König","Gras-Neun"];
  for(const label of hand.slice(0,7))click(card(instance,label));
  assert.match(text(instance.rendered.root),/7 von 8 Karten/);
  assert.equal(confirmation(instance).props.disabled,true);
  assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
  click(card(instance,hand[7]));
  assert.match(text(instance.rendered.root),/8 von 8 Karten/);
  assert.match(text(instance.rendered.root),/6,8 \/ 10/);
  assert.equal(card(instance,"Herz-Sieben").props.disabled,true);
  assert.equal(card(instance,"Gras-Neun").props["aria-pressed"],true);
  assert.equal(confirmation(instance).props.disabled,false);
  // Preview never writes, even once the hand is complete.
  assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
  click(confirmation(instance));
  let entries=instance.state().dealRatings;
  assert.equal(entries.length,1);
  assert.equal(entries[0].ratings.Ben,6.8);
  assert.equal(entries[0].ratings.Clara,5);
  assert.equal(entries[0].ratingMeta.Ben.method,"automatic");
  assert.equal(entries[0].ratingMeta.Ben.algorithmVersion,"hand-v1");
  assert.deepEqual(entries[0].ratingMeta.Ben.rules,{deck:"long",hochzeit:true,wenz:true});
  assert.ok(!JSON.stringify(entries).includes("eichel-"));
  click(confirmation(instance));
  assert.deepEqual(instance.state().dealRatings,entries);
  // The same card toggles off, removing the final preview and disabling save.
  click(card(instance,"Gras-Neun"));
  assert.equal(confirmation(instance).props.disabled,true);
  assert.equal(card(instance,"Herz-Sieben").props.disabled,false);
  assert.match(text(instance.rendered.root),/7 von 8 Karten/);
  act(()=>instance.rendered.unmount());
  const restored=app(undefined,instance.storage);
  open(restored);
  assert.match(text(restored.rendered.root),/Automatisch · hand-v1/);
  click(button(restored,/^Ben6,8/));
  assert.match(text(restored.rendered.root),/0 von 8 Karten/);
  assert.equal(confirmation(restored).props.disabled,true);
  assert.deepEqual(restored.state().dealRatings,entries);
  click(button(restored,"Manuell bewerten"));
  click(card(restored,"Ben: 4 von 10"));
  click(confirmation(restored));
  entries=restored.state().dealRatings;
  assert.equal(entries.length,1);
  assert.deepEqual(entries[0].ratings,{Ben:4,Clara:5});
  assert.equal(entries[0].ratingMeta.Ben.method,"manual");
  assert.equal(entries[0].ratingMeta.Ben.algorithmVersion,"manual-v1");
  assert.equal(restored.context.SchafkopfDealRatings.dealerStats(players,entries).Anna.count,2);
  act(()=>restored.rendered.unmount());
});

test("full app: create shared empty dealing, choose players, keep each rating separate",()=>{
  const instance=app({players,dealRatings:[]});
  open(instance);
  assert.equal(button(instance,"Neue Austeilung anlegen").props.disabled,true);
  // Selecting the dealer alone never creates or saves an entry.
  click(button(instance,"Anna"));
  assert.equal(instance.state().dealRatings.length,0);
  click(button(instance,"Neue Austeilung anlegen"));
  let entry=instance.state().dealRatings[0];
  assert.equal(entry.dealer,"Anna");
  assert.equal(entry.id,entry.roundId);
  assert.deepEqual(entry.ratings,{});
  click(button(instance,/^BenNoch/));
  click(card(instance,"Ben: 8 von 10"));
  assert.deepEqual(instance.state().dealRatings[0].ratings,{});
  click(confirmation(instance));
  click(button(instance,/^ClaraNoch/));
  assert.equal(confirmation(instance).props.disabled,true);
  click(card(instance,"Clara: 3 von 10"));
  click(confirmation(instance));
  entry=instance.state().dealRatings[0];
  assert.deepEqual(entry.ratings,{Ben:8,Clara:3});
  assert.equal(instance.state().dealRatings.length,1);
  assert.match(text(instance.rendered.root),/5,5 \(2\)/);
  act(()=>instance.rendered.unmount());
});

test("full app: player rename preserves score, metadata and dealer reference",()=>{
  const instance=app();
  open(instance);
  click(button(instance,/^Ben7,0/));
  click(card(instance,"Ben: 9 von 10"));
  click(confirmation(instance));
  click(button(instance,/Einst\.$/));
  const nameInput=instance.rendered.root.findAllByType("input").find(node=>node.props.value==="Ben");
  assert.ok(nameInput);
  act(()=>nameInput.props.onChange({target:{value:"Benedikt"}}));
  const entry=instance.state().dealRatings[0];
  assert.equal(entry.ratings.Benedikt,9);
  assert.equal(entry.ratingMeta.Benedikt.algorithmVersion,"manual-v1");
  assert.ok(!Object.hasOwn(entry.ratings,"Ben"));
  assert.ok(!Object.hasOwn(entry.ratingMeta,"Ben"));
  act(()=>instance.rendered.unmount());
});

test("full app: changing rules recomputes a preview but saves only after confirmation",()=>{
  const instance=app();
  open(instance);
  click(button(instance,/^Ben7,0/));
  click(button(instance,"Karten auswählen"));
  for(const label of ["Eichel-Unter","Gras-Unter","Herz-Ass","Herz-Zehn","Eichel-Ass","Eichel-Zehn","Schellen-König","Gras-Neun"])click(card(instance,label));
  assert.match(text(instance.rendered.root),/6,8 \/ 10/);
  click(button(instance,"Wenz berücksichtigen: an"));
  assert.equal(button(instance,"Wenz berücksichtigen: aus").props["aria-checked"],false);
  assert.match(text(instance.rendered.root),/5,2 \/ 10/);
  assert.equal(instance.state().dealRatings[0].ratings.Ben,7);
  click(confirmation(instance));
  assert.equal(instance.state().dealRatings[0].ratings.Ben,5.2);
  assert.equal(instance.state().dealRatings[0].ratingMeta.Ben.rules.wenz,false);
  act(()=>instance.rendered.unmount());
});
