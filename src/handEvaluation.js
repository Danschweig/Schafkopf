/* Shared input contract for the picker and a future local scanner: eight card IDs.
   Pure evaluation: no DOM, storage, network, or dependency on input order. */
(function(root){
  "use strict";
  const ALGORITHM_VERSION="hand-v1";
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
  const DEFAULT_RULES=Object.freeze({deck:"long",hochzeit:true,wenz:true});

  function normalizeRules(rules=DEFAULT_RULES){
    if(!rules||typeof rules!=="object"||Array.isArray(rules))throw new Error("Ungültige Regeleinstellungen.");
    const result={...DEFAULT_RULES,...rules};
    if(result.deck!=="long")throw new Error("Algorithmus v1 unterstützt nur das lange Blatt (8 aus 32 Karten).");
    if(typeof result.hochzeit!=="boolean"||typeof result.wenz!=="boolean")throw new Error("Hochzeit und Wenz müssen aktiviert oder deaktiviert sein.");
    return {deck:result.deck,hochzeit:result.hochzeit,wenz:result.wenz};
  }

  function evaluateHand(cardIds,rules=DEFAULT_RULES){
    const settings=normalizeRules(rules);
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
      normal,wenz,winningCandidate,algorithmVersion:ALGORITHM_VERSION,rules:settings};
  }

  const api={ALGORITHM_VERSION,SUITS,RANKS,CARDS,WEIGHTS,DEFAULT_RULES,normalizeRules,evaluateHand};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SchafkopfHandEvaluation=api;
})(typeof window!=="undefined"?window:globalThis);
