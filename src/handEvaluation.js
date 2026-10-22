/* Shared input contract for the picker and local scanner: eight card IDs.
   Pure evaluation: no DOM, storage, network, or dependency on input order. */
(function(root){
  "use strict";
  const ALGORITHM_VERSION="hand-v2";
  const SUITS=Object.freeze([
    Object.freeze({id:"eichel",label:"Eichel",symbol:"🌰"}),
    Object.freeze({id:"gras",label:"Gras",symbol:"♣"}),
    Object.freeze({id:"herz",label:"Herz",symbol:"♥"}),
    Object.freeze({id:"schellen",label:"Schellen",symbol:"🔔"})
  ]);
  const RANKS=Object.freeze([
    ["ass","Ass","A"],["zehn","Zehn","10"],["koenig","König","K"],
    ["ober","Ober","O"],["unter","Unter","U"],["neun","Neun","9"],
    ["acht","Acht","8"],["sieben","Sieben","7"]
  ].map(([id,label,short])=>Object.freeze({id,label,short})));
  const CARDS=Object.freeze(SUITS.flatMap(suit=>RANKS.map(rank=>Object.freeze({
    id:`${suit.id}-${rank.id}`,suit:suit.id,rank:rank.id,label:`${suit.label}-${rank.label}`,short:rank.short
  }))));
  const CARD_BY_ID=new Map(CARDS.map(card=>[card.id,card]));
  // All weights in hundredths of a point; candidates stay exact until final rounding.
  const WEIGHTS=Object.freeze({
    normalBase:Object.freeze([100,100,150,250,350,450,550,650,750]),
    hochzeitBase:300,
    trumpQuality:Object.freeze({"eichel-ober":80,"gras-ober":60,"herz-ober":40,"schellen-ober":30,
      "eichel-unter":25,"gras-unter":20,"herz-unter":15,"schellen-unter":10,"herz-ass":25,"herz-zehn":10}),
    shortAce:70,longAce:40,normalAceTen:20,voidSuit:30,voidMinTrumps:3,
    shortAceMaxLength:2,
    wenzBase:Object.freeze({2:400,3:650,4:800}),
    wenzQuality:Object.freeze({"eichel-unter":60,"gras-unter":40,"herz-unter":20}),
    wenzAce:60,wenzAceTen:30,min:100,max:1000
  });
  const LEGACY_DEFAULT_RULES=Object.freeze({deck:"long",hochzeit:true,wenz:true});
  const GAME_OPTIONS=Object.freeze([
    ["sauspiel","Sauspiel"],["hochzeit","Hochzeit"],["wenz","Wenz"],["farbwenz","Farb-Wenz"],
    ["geier","Geier"],["farbsolo","Farbsolo"],["ramsch","Ramsch"]
  ].map(([id,label])=>Object.freeze({id,label})));
  const DEFAULT_RULES=Object.freeze({deck:"long",sauspiel:true,hochzeit:true,wenz:true,farbwenz:true,geier:true,farbsolo:true,ramsch:false});
  // Additional hand-v2 heuristics, also in hundredths. These are tunable
  // estimates of hand potential, not official rules or win probabilities.
  const VARIANT_WEIGHTS=Object.freeze({
    loneBase:Object.freeze([100,200,WEIGHTS.wenzBase[2],WEIGHTS.wenzBase[3],WEIGHTS.wenzBase[4]]),
    loneQuality:Object.freeze([60,40,20,0]),soloPenalty:100,
    ramschBase:1000,ramschTrumpControl:40,ramschSingleton:25,
    ramschSuitRisk:Object.freeze({ass:90,zehn:80,koenig:40,neun:0,acht:0,sieben:0}),
    ramschTrumpRisk:Object.freeze({"eichel-ober":140,"gras-ober":130,"herz-ober":120,"schellen-ober":110,
      "eichel-unter":100,"gras-unter":90,"herz-unter":80,"schellen-unter":70,
      "herz-ass":100,"herz-zehn":80,"herz-koenig":60,"herz-neun":40,"herz-acht":30,"herz-sieben":20})
  });

  function normalizeLegacyRules(rules=LEGACY_DEFAULT_RULES){
    if(!rules||typeof rules!=="object"||Array.isArray(rules))throw new Error("Ungültige Regeleinstellungen.");
    const result={...LEGACY_DEFAULT_RULES,...rules};
    if(result.deck!=="long")throw new Error("Algorithmus v1 unterstützt nur das lange Blatt (8 aus 32 Karten).");
    if(typeof result.hochzeit!=="boolean"||typeof result.wenz!=="boolean")throw new Error("Hochzeit und Wenz müssen aktiviert oder deaktiviert sein.");
    return {deck:result.deck,hochzeit:result.hochzeit,wenz:result.wenz};
  }

  function evaluateHandV1(cardIds,rules=LEGACY_DEFAULT_RULES){
    const settings=normalizeLegacyRules(rules);
    if(!Array.isArray(cardIds)||cardIds.length!==8)throw new Error("Bitte genau 8 Karten auswählen.");
    if(Array.from(cardIds).some(id=>typeof id!=="string"||!CARD_BY_ID.has(id)))throw new Error("Die Hand enthält eine ungültige Karten-ID.");
    if(new Set(cardIds).size!==8)throw new Error("Eine Karte darf nur einmal vorkommen.");
    // Canonical deck order also makes the full breakdown independent of input order.
    const selected=new Set(cardIds);
    const hand=CARDS.filter(card=>selected.has(card.id));
    const isTrump=card=>card.rank==="ober"||card.rank==="unter"||card.suit==="herz";
    const trumpCount=hand.filter(isTrump).length;
    const exchange=trumpCount===1&&settings.hochzeit;
    const normalBase=exchange?WEIGHTS.hochzeitBase:WEIGHTS.normalBase[trumpCount];
    const normalBonuses=[];
    const add=(list,code,label,amount)=>list.push({code,label,value:amount/100});
    if(!exchange)hand.forEach(card=>{
      const amount=WEIGHTS.trumpQuality[card.id];
      if(amount)add(normalBonuses,`trump:${card.id}`,card.label,amount);
    });
    SUITS.filter(suit=>suit.id!=="herz").forEach(suit=>{
      const color=hand.filter(card=>card.suit===suit.id&&!isTrump(card));
      const ace=color.some(card=>card.rank==="ass");
      if(ace){
        const short=color.length<=WEIGHTS.shortAceMaxLength;
        add(normalBonuses,`ace:${suit.id}`,`${suit.label}-Ass (${color.length} Farbkarten)`,short?WEIGHTS.shortAce:WEIGHTS.longAce);
        if(color.some(card=>card.rank==="zehn"))add(normalBonuses,`ace-ten:${suit.id}`,`${suit.label}: Ass und Zehn`,WEIGHTS.normalAceTen);
      }
      if(color.length===0&&trumpCount>=WEIGHTS.voidMinTrumps)add(normalBonuses,`void:${suit.id}`,`${suit.label} frei`,WEIGHTS.voidSuit);
    });
    const sum=(base,bonuses)=>base+bonuses.reduce((total,bonus)=>total+Math.round(bonus.value*100),0);
    const normalTotal=sum(normalBase,normalBonuses);
    const normal={base:normalBase/100,bonuses:normalBonuses,value:normalTotal/100,trumpCount,hochzeitExchange:exchange};
    let wenz=null;
    let wenzTotal=null;
    const underCount=hand.filter(card=>card.rank==="unter").length;
    if(settings.wenz&&WEIGHTS.wenzBase[underCount]!==undefined){
      const bonuses=[];
      hand.forEach(card=>{
        if(WEIGHTS.wenzQuality[card.id])add(bonuses,`under:${card.id}`,card.label,WEIGHTS.wenzQuality[card.id]);
        if(card.rank==="ass")add(bonuses,`ace:${card.suit}`,card.label,WEIGHTS.wenzAce);
      });
      SUITS.forEach(suit=>{
        if(selected.has(`${suit.id}-ass`)&&selected.has(`${suit.id}-zehn`))add(bonuses,`ace-ten:${suit.id}`,`${suit.label}: Ass und Zehn`,WEIGHTS.wenzAceTen);
      });
      wenzTotal=sum(WEIGHTS.wenzBase[underCount],bonuses);
      wenz={base:WEIGHTS.wenzBase[underCount]/100,bonuses,value:wenzTotal/100,underCount};
    }
    const winningCandidate=wenzTotal!==null&&wenzTotal>normalTotal?"wenz":"normal";
    const best=winningCandidate==="wenz"?wenzTotal:normalTotal;
    return {score:Math.round(Math.max(WEIGHTS.min,Math.min(WEIGHTS.max,best))/10)/10,
      normal,wenz,winningCandidate,algorithmVersion:"hand-v1",rules:settings};
  }

  function normalizeRules(rules=DEFAULT_RULES){
    if(!rules||typeof rules!=="object"||Array.isArray(rules))throw new Error("Ungültige Regeleinstellungen.");
    const result={deck:Object.hasOwn(rules,"deck")?rules.deck:"long"};
    if(result.deck!=="long")throw new Error("Die Handbewertung unterstützt nur das lange Blatt (8 aus 32 Karten).");
    GAME_OPTIONS.forEach(({id})=>{
      const value=Object.hasOwn(rules,id)?rules[id]:DEFAULT_RULES[id];
      if(typeof value!=="boolean")throw new Error("Spielarten müssen aktiviert oder deaktiviert sein.");
      result[id]=value;
    });
    if(result.ramsch)GAME_OPTIONS.filter(({id})=>id!=="ramsch").forEach(({id})=>{result[id]=false;});
    return result;
  }

  function toggleGame(rules,id){
    if(!GAME_OPTIONS.some(option=>option.id===id))throw new Error("Unbekannte Spielart.");
    const next={...normalizeRules(rules)};
    next[id]=!next[id];
    if(next[id]&&id!=="ramsch")next.ramsch=false;
    return normalizeRules(next);
  }

  function rulesForGameTypes(types){
    const has=id=>types.some(type=>type.id===id);
    const result={deck:"long",sauspiel:has("sauspiel"),hochzeit:has("hochzeit"),wenz:has("wenz"),
      farbwenz:has("farbwenz")||types.some(type=>type.id==="wenz"&&type.hasFarbe===true),
      geier:has("geier"),farbsolo:has("farbsolo"),ramsch:false};
    if(!GAME_OPTIONS.some(({id})=>result[id])&&has("ramsch"))result.ramsch=true;
    return normalizeRules(result);
  }

  function evaluateHand(cardIds,rules=DEFAULT_RULES){
    const settings=normalizeRules(rules);
    // Validate using the unchanged v1 implementation; reuse its Sauspiel and
    // Hochzeit arithmetic so these established weights stay identical.
    const legacy=evaluateHandV1(cardIds,{deck:"long",hochzeit:false,wenz:true});
    const selected=new Set(cardIds),hand=CARDS.filter(card=>selected.has(card.id));
    const candidates=[];
    const add=(bonuses,code,label,amount)=>bonuses.push({code,label,value:amount/100});
    const make=(id,game,label,base,bonuses,extra={})=>({id,game,label,base:base/100,bonuses,
      value:(base+bonuses.reduce((sum,bonus)=>sum+Math.round(bonus.value*100),0))/100,...extra});
    const strongest=list=>list.reduce((best,item)=>!best||item.value>best.value?item:best,null);
    const normalTrump=card=>card.rank==="ober"||card.rank==="unter"||card.suit==="herz";

    if(settings.ramsch){
      const bonuses=[];
      hand.forEach(card=>{
        const risk=VARIANT_WEIGHTS.ramschTrumpRisk[card.id]??VARIANT_WEIGHTS.ramschSuitRisk[card.rank];
        if(risk)add(bonuses,`risk:${card.id}`,`${card.label}: Stich-/Augenrisiko`,-risk);
      });
      const trumpCount=hand.filter(normalTrump).length;
      if(trumpCount>4)add(bonuses,"risk:trump-control","Viele Trümpfe: zusätzliche Stichkontrolle",-(trumpCount-4)*VARIANT_WEIGHTS.ramschTrumpControl);
      SUITS.filter(suit=>suit.id!=="herz").forEach(suit=>{
        const color=hand.filter(card=>card.suit===suit.id&&!normalTrump(card));
        if(color.length===1&&["ass","zehn"].includes(color[0].rank))add(bonuses,`risk:singleton:${suit.id}`,`${suit.label}: einzelnes hohes Blatt`,-VARIANT_WEIGHTS.ramschSingleton);
      });
      candidates.push(make("ramsch","ramsch","Ramsch",VARIANT_WEIGHTS.ramschBase,bonuses,{trumpCount,goal:"avoid-tricks"}));
    }else{
      if(settings.sauspiel)candidates.push({...legacy.normal,id:"sauspiel",game:"sauspiel",label:"Sauspiel"});
      if(settings.hochzeit&&legacy.normal.trumpCount===1){
        const wedding=evaluateHandV1(cardIds,{deck:"long",hochzeit:true,wenz:false}).normal;
        candidates.push({...wedding,id:"hochzeit",game:"hochzeit",label:"Hochzeit"});
      }
      for(const [game,rank,label] of [["wenz","unter","Wenz"],["geier","ober","Geier"]]){
        if(!settings[game])continue;
        const bonuses=[],heads=hand.filter(card=>card.rank===rank);
        heads.forEach(card=>{
          const amount=VARIANT_WEIGHTS.loneQuality[SUITS.findIndex(suit=>suit.id===card.suit)];
          if(amount)add(bonuses,`head:${card.id}`,card.label,amount);
        });
        hand.filter(card=>card.rank==="ass").forEach(card=>add(bonuses,`ace:${card.suit}`,card.label,WEIGHTS.wenzAce));
        SUITS.forEach(suit=>{
          if(selected.has(`${suit.id}-ass`)&&selected.has(`${suit.id}-zehn`))add(bonuses,`ace-ten:${suit.id}`,`${suit.label}: Ass und Zehn`,WEIGHTS.wenzAceTen);
        });
        candidates.push(make(game,game,label,VARIANT_WEIGHTS.loneBase[heads.length],bonuses,{trumpCount:heads.length}));
      }
      for(const game of ["farbwenz","farbsolo"]){
        if(!settings[game])continue;
        const alternatives=SUITS.map(trumpSuit=>{
          const isTrump=card=>card.rank==="unter"||(game==="farbsolo"&&card.rank==="ober")||card.suit===trumpSuit.id;
          const trumps=hand.filter(isTrump),bonuses=[];
          add(bonuses,"solo:opponents","Alleinspiel gegen drei Gegner",-VARIANT_WEIGHTS.soloPenalty);
          trumps.forEach(card=>{
            let amount=0;
            if(game==="farbsolo"&&["ober","unter"].includes(card.rank))amount=WEIGHTS.trumpQuality[card.id]||0;
            else if(card.rank==="unter")amount=VARIANT_WEIGHTS.loneQuality[SUITS.findIndex(suit=>suit.id===card.suit)];
            else if(card.rank==="ass")amount=WEIGHTS.trumpQuality["herz-ass"];
            else if(card.rank==="zehn")amount=WEIGHTS.trumpQuality["herz-zehn"];
            if(amount)add(bonuses,`trump:${card.id}`,card.label,amount);
          });
          SUITS.filter(suit=>suit.id!==trumpSuit.id).forEach(suit=>{
            const color=hand.filter(card=>card.suit===suit.id&&!isTrump(card));
            if(color.some(card=>card.rank==="ass")){
              add(bonuses,`ace:${suit.id}`,`${suit.label}-Ass (${color.length} Farbkarten)`,color.length<=WEIGHTS.shortAceMaxLength?WEIGHTS.shortAce:WEIGHTS.longAce);
              if(color.some(card=>card.rank==="zehn"))add(bonuses,`ace-ten:${suit.id}`,`${suit.label}: Ass und Zehn`,WEIGHTS.normalAceTen);
            }
            if(!color.length&&trumps.length>=WEIGHTS.voidMinTrumps)add(bonuses,`void:${suit.id}`,`${suit.label} frei`,WEIGHTS.voidSuit);
          });
          return make(`${game}:${trumpSuit.id}`,game,`${game==="farbwenz"?"Farb-Wenz":"Farbsolo"} (${trumpSuit.label})`,WEIGHTS.normalBase[trumps.length],bonuses,{trumpCount:trumps.length,trumpSuit:trumpSuit.id});
        });
        candidates.push({...strongest(alternatives),alternatives});
      }
    }
    const bestCandidate=strongest(candidates);
    return {score:bestCandidate?Math.round(Math.max(WEIGHTS.min,Math.min(WEIGHTS.max,Math.round(bestCandidate.value*100)))/10)/10:null,
      candidates,bestCandidate,winningCandidate:bestCandidate?.id||null,algorithmVersion:ALGORITHM_VERSION,rules:settings};
  }

  const api={ALGORITHM_VERSION,SUITS,RANKS,CARDS,WEIGHTS,VARIANT_WEIGHTS,GAME_OPTIONS,DEFAULT_RULES,LEGACY_DEFAULT_RULES,
    normalizeRules,normalizeLegacyRules,toggleGame,rulesForGameTypes,evaluateHand,evaluateHandV1};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SchafkopfHandEvaluation=api;
})(typeof window!=="undefined"?window:globalThis);
