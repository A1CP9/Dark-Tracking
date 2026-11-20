'use strict';
function classify(point, regions) {
 if (!point) {
  if (regions.some(r => r.label === 'enemy')) return 'miss';
  if (regions.some(r => r.label === 'unknown')) return 'unresolvedAbstention';
  return 'correctAbstention';
 }
 const hits = regions.filter(r => point.x >= r.x && point.x < r.x+r.w && point.y >= r.y && point.y < r.y+r.h);
 if (hits.length > 1) return 'overlapNeedsReview';
 return hits[0]?.label ?? 'background';
}
function reviewSummary(rows) {
 const result={frames:rows.length,enemyFrames:0,enemySelected:0,allySelected:0,hudSelected:0,
  backgroundSelected:0,unknownSelected:0,unresolvedAbstentions:0,abstained:0,ambiguousSelections:0,enemyFramesWithoutConfirmedHit:0};
 for(const {regions,selection} of rows){
  const enemyPresent=regions.some(region=>region.label==='enemy');
  const verdict=classify(selection,regions);
  if(enemyPresent)result.enemyFrames++;
  if(!selection){
   result.abstained++;
   if(verdict==='unresolvedAbstention')result.unresolvedAbstentions++;
  }
  else if(verdict==='overlapNeedsReview')result.ambiguousSelections++;
  else result[verdict+'Selected']++;
  if(enemyPresent && verdict!=='enemy')result.enemyFramesWithoutConfirmedHit++;
 }
 return result;
}
if(typeof module !== 'undefined') module.exports={classify,reviewSummary};
