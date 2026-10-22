/* Numeric ratings remain compatible with historical sessions. Metadata is per
   player so switching method replaces, rather than adds to, the same rating. */
(function(root){
  "use strict";
  const validScore=score=>typeof score==="number"&&Number.isFinite(score)&&score>=1&&score<=10;
  function cleanMeta(meta){
    const method=meta?.method==="automatic"?"automatic":"manual";
    const rules=meta?.rules;
    let cleanRules=null;
    if(rules&&typeof rules.deck==="string"&&typeof rules.hochzeit==="boolean"&&typeof rules.wenz==="boolean"){
      cleanRules={deck:rules.deck,hochzeit:rules.hochzeit,wenz:rules.wenz};
      for(const key of ["sauspiel","farbwenz","geier","farbsolo","ramsch"])if(typeof rules[key]==="boolean")cleanRules[key]=rules[key];
    }
    return {method,algorithmVersion:typeof meta?.algorithmVersion==="string"?meta.algorithmVersion:"legacy",rules:cleanRules};
  }
  function normalizeDealRatings(entries){
    if(!Array.isArray(entries))return [];
    return entries.filter(entry=>entry&&entry.dealer).map((entry,index)=>{
      const id=String(entry.id||`deal-${entry.createdAt||index}`);
      const ratings=Object.fromEntries(Object.entries(entry.ratings||{})
        .map(([player,score])=>[player,Number(score)]).filter(([,score])=>validScore(score)));
      return {id,roundId:String(entry.roundId||id),createdAt:Number(entry.createdAt)||0,dealer:String(entry.dealer),
        ...(entry.sealed===true?{sealed:true}:{}),ratings:entry.sealed?{}:ratings,
        ratingMeta:entry.sealed?{}:Object.fromEntries(Object.keys(ratings).map(player=>[player,cleanMeta(entry.ratingMeta?.[player])]))};
    });
  }
  function upsertRating(entries,dealId,player,score,meta){
    if(!validScore(score))throw new Error("Die Bewertung muss zwischen 1,0 und 10,0 liegen.");
    const entry=entries.find(deal=>deal.id===dealId);
    if(!entry)throw new Error("Diese Austeilung ist nicht mehr vorhanden. Bitte neu auswählen.");
    if(entry.sealed)throw new Error("Diese Bewertung muss verdeckt gespeichert werden.");
    if(!player||player===entry.dealer)throw new Error("Bitte einen anderen Spieler als den Austeiler wählen.");
    return entries.map(deal=>deal.id===dealId?{...deal,
      ratings:{...deal.ratings,[player]:score},ratingMeta:{...deal.ratingMeta,[player]:cleanMeta(meta)}}:deal);
  }
  function dealerStats(players,entries){
    entries=entries.filter(entry=>!entry.sealed||entry.released===true);
    return Object.fromEntries(players.map(dealer=>{
      const deals=entries.filter(entry=>entry.dealer===dealer);
      const valuesFor=player=>deals.map(entry=>Number(entry.ratings?.[player])).filter(validScore);
      const summary=values=>({average:values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null,count:values.length});
      const raters=players.filter(player=>player!==dealer);
      const values=raters.flatMap(valuesFor);
      return [dealer,{...summary(values),deals:deals.filter(entry=>raters.some(player=>validScore(Number(entry.ratings?.[player])))).length,
        byPlayer:Object.fromEntries(raters.map(player=>[player,summary(valuesFor(player))]))}];
    }));
  }
  function normalizeCompletions(value={}){
    return Object.fromEntries(Object.entries(value||{}).filter(([id,roundId])=>id.startsWith("deal-")&&Number.isSafeInteger(roundId)&&roundId>0));
  }
  function activeDeal(entries,completed={}){
    return entries.find(entry=>entry.sealed&&!Object.hasOwn(completed,entry.id))||null;
  }
  function projectRatings(entries,privateRatings={},completed={},includeOwn=false,players=[]){
    return entries.map(entry=>{
      if(!entry.sealed)return entry;
      const released=Object.hasOwn(completed,entry.id);
      const values=released||includeOwn?privateRatings[entry.id]||[]:[];
      const ratings={},ratingMeta={};
      for(const value of values){
        const player=players.length&&Number.isInteger(value.playerIndex)?players[value.playerIndex]:value.player;
        if(!player||!validScore(value.score))continue;
        ratings[player]=value.score;ratingMeta[player]=cleanMeta(value.meta);
      }
      return {...entry,released,ratings,ratingMeta};
    });
  }
  function exportRatings(entries){
    return entries.filter(entry=>!entry.sealed||entry.released).map(({sealed,released,...entry})=>entry);
  }
  const api={validScore,cleanMeta,normalizeDealRatings,upsertRating,dealerStats,normalizeCompletions,activeDeal,projectRatings,exportRatings};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SchafkopfDealRatings=api;
})(typeof window!=="undefined"?window:globalThis);
