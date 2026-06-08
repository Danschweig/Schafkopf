    const {useState,useMemo,useEffect,useRef}=React;
    const {LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,ReferenceLine,ResponsiveContainer,BarChart,Bar}=Recharts;

    const LS_KEY="schafkopf-v1";
    const PCOLORS=["#e85d4a","#f5c842","#4ab8e8","#7de87a"];
    const BUILTIN_IDS=["sauspiel","hochzeit","wenz","geier","farbsolo","ramsch"];

    const TYPE_CATS={"2vs2":{label:"2 vs 2",color:"#4ab8e8"},"solo1":{label:"Solo",color:"#f5c842"},"solo2":{label:"Solo",color:"#d08b3a"},"ramsch":{label:"Ramsch",color:"#e85d4a"},"strafe":{label:"Strafe",color:"#ff8c42"}};
    const PLAY_TYPE_SECTIONS=[
      {id:"2vs2",label:"2 vs 2",color:TYPE_CATS["2vs2"].color,cats:["2vs2"]},
      {id:"solo",label:"Solo",color:TYPE_CATS.solo1.color,cats:["solo1","solo2"]},
      {id:"ramsch",label:"Ramsch",color:TYPE_CATS.ramsch.color,cats:["ramsch"]},
    ];

    const DEFAULT_GAME_TYPES=[
      {id:"sauspiel", label:"Sauspiel",  desc:"Rufspiel – Spieler + Sau-Partner",cat:"2vs2",   isBuiltin:true, hasFarbe:false,hasTout:false,hasSchneiderSchwarz:true, hasLaufende:true, laufendeFrom:3,useDefaultTariff:true,customBetrag:null},
      {id:"hochzeit", label:"Hochzeit",  desc:"Partner via ersten Stich",         cat:"2vs2",   isBuiltin:true, hasFarbe:false,hasTout:false,hasSchneiderSchwarz:true, hasLaufende:true, laufendeFrom:3,useDefaultTariff:true,customBetrag:null},
      {id:"wenz",     label:"Wenz",      desc:"Nur Unter als Trumpf",             cat:"solo2",  isBuiltin:true, hasFarbe:true, hasTout:true, hasSchneiderSchwarz:true, hasLaufende:true, laufendeFrom:2,useDefaultTariff:true,customBetrag:null},
      {id:"geier",    label:"Geier",     desc:"Nur Ober als Trumpf",              cat:"solo1",  isBuiltin:true, hasFarbe:false, hasTout:true, hasSchneiderSchwarz:true, hasLaufende:true, laufendeFrom:2,useDefaultTariff:true,customBetrag:null},
      {id:"farbsolo", label:"Farbsolo",  desc:"Farbe + Ober/Unter Trumpf",        cat:"solo1",  isBuiltin:true, hasFarbe:false,hasTout:true, hasSchneiderSchwarz:true, hasLaufende:true, laufendeFrom:3,useDefaultTariff:true,customBetrag:null},
      {id:"ramsch",   label:"Ramsch",    desc:"Meiste Augen verliert",            cat:"ramsch", isBuiltin:true, hasFarbe:false,hasTout:false,hasSchneiderSchwarz:false,hasLaufende:false,laufendeFrom:3,useDefaultTariff:true,customBetrag:null},
    ];

    const ALL_DISPLAY_TYPES=[...DEFAULT_GAME_TYPES,{id:"farbwenz",label:"Farbwenz",cat:"solo2"},{id:"farbgeier",label:"Farbgeier",cat:"solo1"}];

    function effectiveType(r){
      if(r.typeCat==="strafe")return{id:r.typeId||"kartenstrafe",label:r.typeLabel||"Kartenstrafe",cat:"strafe"};
      if(r.typeId==="wenz"&&r.mitFarbe)return{id:"farbwenz",label:"Farbwenz",cat:"solo2"};
      if(r.typeId==="geier"&&r.mitFarbe)return{id:"farbgeier",label:"Farbgeier",cat:"solo1"};
      return{id:r.typeId,label:r.typeLabel,cat:r.typeCat};
    }

    function calcBetrag(form,typeCfg,tariff){
      const base=typeCfg.useDefaultTariff?(typeCfg.cat==="2vs2"?tariff.sauspiel:typeCfg.cat==="ramsch"?tariff.sauspiel:tariff.solo):(typeCfg.customBetrag||25);
      let mods=0;
      const isTout=typeCfg.hasTout&&form.tout;
      if(!isTout&&typeCfg.hasSchneiderSchwarz){mods+=(form.schneider?1:0)+(form.schwarz?1:0);}
      if(typeCfg.hasLaufende){const minL=typeCfg.laufendeFrom||3;mods+=form.laufende>=minL?form.laufende:0;}
      let b=base+mods*tariff.sl;
      if(isTout)b*=2;
      return b;
    }

    function calcDeltas(form,players,betrag,typeCfg,aussetzer=null){
      const active=aussetzer?players.filter(p=>p!==aussetzer):players;
      const d=Object.fromEntries(players.map(p=>[p,0]));
      const sm=Math.pow(2,form.sticht||0);
      const B=betrag*sm;
      if(typeCfg.cat==="2vs2"){
        if(!form.spieler||!form.partner)return null;
        const w=form.gewonnen?[form.spieler,form.partner]:active.filter(p=>p!==form.spieler&&p!==form.partner);
        const l=active.filter(p=>!w.includes(p));
        w.forEach(p=>d[p]=+B);l.forEach(p=>d[p]=-Math.round(B*w.length/l.length));
      }else if(typeCfg.cat==="solo1"||typeCfg.cat==="solo2"){
        if(!form.solist)return null;
        const gegner=active.filter(p=>p!==form.solist);
        const sign=form.gewonnen?1:-1;
        d[form.solist]=sign*gegner.length*B;
        gegner.forEach(p=>d[p]=-sign*B);
      }else if(typeCfg.cat==="ramsch"){
        if(!form.verlierer)return null;
        const jm=Math.pow(2,form.jungfrauen||0);
        const RB=B*jm;
        const w=active.filter(p=>p!==form.verlierer);
        if(form.durchmarsch){d[form.verlierer]=+w.length*RB;w.forEach(p=>d[p]=-RB);}
        else{d[form.verlierer]=-w.length*RB;w.forEach(p=>d[p]=+RB);}
      }
      return d;
    }

    const THEMES={
      dark:{mode:"dark",bg1:"#0c180c",bg2:"#111f11",border:"#1a321a",text:"#c8e0c8",title:"#e8ead0",dim:"#4a7a4a",mute:"#2a4a2a",pageBg:"linear-gradient(160deg,#0b160b,#101e10)",topbarBg:"#080f08",inputBg:"#080f08",roundBg:"#0f1f0f",navBg:"#080f08",navActive:"#8ad08a",subBg:"#1e3a1e",subBorder:"#3a6a3a",subText:"#a0d0a0",buttonBg:"#0c180c",buttonBorder:"#1a321a",buttonText:"#4a7a4a",buttonShadow:"none",switchOff:"#1a2a1a",switchOn:"#2a5a2a",switchKnob:"#7de87a",switchKnobOff:"#3a5a3a",chartGrid:"#1e3a1e",chartAxis:"#5a8a5a",tooltipBg:"#0a1a0a",zero:"#2a4a2a",purpleBg:"#1a0a1a",successBg:"#1a4a1a",themeColor:"#0b160b"},
      light:{mode:"light",bg1:"#ffffff",bg2:"#f4f8f2",border:"#c1d2bd",text:"#17311b",title:"#0d2110",dim:"#3f6545",mute:"#617b64",pageBg:"linear-gradient(160deg,#f8fbf5,#e8f0e4)",topbarBg:"#ffffff",inputBg:"#fbfdf9",roundBg:"#eef6ea",navBg:"#ffffff",navActive:"#2f7d36",subBg:"#d9ecd5",subBorder:"#6f9b70",subText:"#1f5725",buttonBg:"#e7f0e3",buttonBorder:"#9fb89b",buttonText:"#315d37",buttonShadow:"0 1px 4px rgba(42,86,46,0.12)",switchOff:"#dce8d9",switchOn:"#4f9a57",switchKnob:"#ffffff",switchKnobOff:"#8aa08a",chartGrid:"#d6e4d3",chartAxis:"#5d7d61",tooltipBg:"#ffffff",zero:"#9bae9a",purpleBg:"#fbf7ff",successBg:"#e8f7e7",themeColor:"#f8fbf5"}
    };
    let C=THEMES.dark;
    function createStyles(C){
      return {
        page:{background:C.pageBg,minHeight:"100vh",fontFamily:"'Courier New',monospace",color:C.text,paddingBottom:72},
        topbar:{background:C.topbarBg,borderBottom:`1px solid ${C.border}`,padding:"10px 16px",position:"sticky",top:0,zIndex:10,boxShadow:C.mode==="light"?"0 1px 10px rgba(35,70,35,0.08)":"none"},
        card:(bc=C.border,bg=C.bg1)=>({background:bg,border:`1px solid ${bc}`,borderRadius:10,padding:"12px 14px",marginBottom:10,boxShadow:C.mode==="light"?"0 1px 6px rgba(35,70,35,0.05)":"none"}),
        sec:{fontSize:9,color:C.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:8},
        btn:(on,ac="#5a9a5a")=>({background:on?ac+(C.mode==="light"?"2e":"24"):C.buttonBg,border:`1px solid ${on?ac:C.buttonBorder}`,color:on?ac:C.buttonText,borderRadius:7,padding:"8px 12px",cursor:"pointer",fontSize:12,fontFamily:"'Courier New',monospace",transition:"all 0.15s",boxShadow:on&&C.mode==="light"?`inset 0 0 0 1px ${ac}33`:C.buttonShadow}),
        pBtn:(on,col)=>({flex:1,padding:"10px 4px",textAlign:"center",background:on?col+(C.mode==="light"?"2f":"22"):C.buttonBg,border:`2px solid ${on?col:C.buttonBorder}`,color:on?col:C.buttonText,borderRadius:8,cursor:"pointer",fontSize:12,fontFamily:"'Courier New',monospace",transition:"all 0.15s",boxShadow:on&&C.mode==="light"?`inset 0 0 0 1px ${col}33`:C.buttonShadow}),
        navBtn:(on)=>({flex:1,padding:"10px 4px",background:on&&C.mode==="light"?C.subBg:"transparent",border:"none",borderTop:`2px solid ${on?C.navActive:"transparent"}`,color:on?C.navActive:C.mute,cursor:"pointer",fontSize:10,fontFamily:"'Courier New',monospace"}),
        subTab:(on)=>({background:on?C.subBg:C.buttonBg,border:`1px solid ${on?C.subBorder:C.buttonBorder}`,color:on?C.subText:C.buttonText,borderRadius:7,padding:"7px 16px",cursor:"pointer",fontSize:11,fontFamily:"'Courier New',monospace",boxShadow:on&&C.mode==="light"?"inset 0 0 0 1px rgba(47,125,54,0.12)":C.buttonShadow}),
        input:{background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px",color:C.text,fontSize:13,fontFamily:"'Courier New',monospace",width:"100%"},
        pChip:(on,col)=>({background:on?col+(C.mode==="light"?"2f":"22"):C.buttonBg,border:`1px solid ${on?col:C.buttonBorder}`,color:on?col:C.buttonText,borderRadius:20,padding:"5px 14px",cursor:"pointer",fontSize:11,fontFamily:"'Courier New',monospace",transition:"all 0.15s",boxShadow:C.mode==="light"?C.buttonShadow:"none"}),
      };
    }
    let s=createStyles(C);
    function applyThemeMode(mode){C=THEMES[mode]||THEMES.dark;s=createStyles(C);return C;}

    const RUNE_MAP={
      a:"ᚨ",b:"ᛒ",c:"ᚲ",d:"ᛞ",e:"ᛖ",f:"ᚠ",g:"ᚷ",h:"ᚺ",i:"ᛁ",j:"ᛃ",k:"ᚲ",l:"ᛚ",m:"ᛗ",n:"ᚾ",o:"ᛟ",p:"ᛈ",q:"ᚲ",r:"ᚱ",s:"ᛋ",t:"ᛏ",u:"ᚢ",v:"ᚹ",w:"ᚹ",x:"ᛉ",y:"ᛇ",z:"ᛉ",
      0:"ᛟ",1:"ᛁ",2:"ᛁᛁ",3:"ᛁᛁᛁ",4:"ᚲᚹ",5:"ᚹ",6:"ᚹᛁ",7:"ᚹᛁᛁ",8:"ᚹᛁᛁᛁ",9:"ᛁᛉ"
    };
    const runeOriginals=new WeakMap();
    const runeNodes=new Set();
    let runeObserver=null;
    function toRunes(text){return String(text).replace(/[A-Za-z0-9]/g,ch=>RUNE_MAP[ch.toLowerCase()]||ch);}
    function runeSkipParent(node){
      const el=node?.parentElement;
      return !el||el.closest("script,style,textarea,input,select,option");
    }
    function restoreRuneText(){
      if(runeObserver){runeObserver.disconnect();runeObserver=null;}
      runeNodes.forEach(node=>{const original=runeOriginals.get(node);if(original!=null&&node.isConnected)node.nodeValue=original;});
      runeNodes.clear();
    }
    function transformRuneTextNode(node){
      if(!node||node.nodeType!==Node.TEXT_NODE||runeSkipParent(node))return;
      const current=node.nodeValue;
      if(!/[A-Za-z0-9]/.test(current))return;
      const saved=runeOriginals.get(node);
      const original=saved&&current===toRunes(saved)?saved:current;
      const runes=toRunes(original);
      if(runes===current)return;
      runeOriginals.set(node,original);
      runeNodes.add(node);
      node.nodeValue=runes;
    }
    function transformRuneTree(root){
      if(!root)return;
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      let node;
      while((node=walker.nextNode()))transformRuneTextNode(node);
    }
    function setRuneTextMode(enabled){
      restoreRuneText();
      if(!enabled)return;
      const root=document.getElementById("root");
      transformRuneTree(root);
      runeObserver=new MutationObserver(mutations=>{
        mutations.forEach(m=>{
          if(m.type==="characterData")transformRuneTextNode(m.target);
          m.addedNodes&&m.addedNodes.forEach(node=>{
            if(node.nodeType===Node.TEXT_NODE)transformRuneTextNode(node);
            else transformRuneTree(node);
          });
        });
      });
      if(root)runeObserver.observe(root,{childList:true,subtree:true,characterData:true});
    }

    // ── Toggle-Switch ────────────────────────────────────────────
