const assert=require('node:assert/strict');
const {classify}=require('./score');
const point={x:5,y:4};
for(const label of ['enemy','ally','hud']){
 const region={label,x:5,y:4,w:2,h:2};
 assert.equal(classify(point,[region]),label);
 assert.equal(classify({x:7,y:4},[region]),'background');
 assert.equal(classify(point,[region,region]),'overlapNeedsReview');
 assert.equal(classify(null,[region]),label==='enemy'?'miss':'correctAbstention');
}
console.log('PASS scoring boundaries, ambiguity and abstention');

const enemy={label:'enemy',x:0,y:0,w:10,h:10};
const ally={label:'ally',x:20,y:20,w:8,h:8};
const hud={...enemy,label:'hud'};
const {reviewSummary}=require('./score');
const summary=reviewSummary([
 {selection:{x:22,y:22},regions:[enemy,ally]},
 {selection:{x:3,y:3},regions:[enemy,hud]},
 {selection:null,regions:[enemy]},
 {selection:{x:0,y:0},regions:[enemy]},
 {selection:null,regions:[]}
]);
assert.deepEqual(summary,{frames:5,enemyFrames:4,enemySelected:1,allySelected:1,hudSelected:0,
 backgroundSelected:0,unknownSelected:0,unresolvedAbstentions:0,abstained:2,ambiguousSelections:1,enemyFramesWithoutConfirmedHit:3});
console.log('PASS mixed-scene denominators and unresolved overlap');

const unknown={...ally,label:'unknown'};
assert.equal(classify(null,[unknown]),'unresolvedAbstention');
assert.equal(classify(null,[unknown,enemy]),'miss');
const mixed=reviewSummary([{regions:[enemy,unknown],selection:{x:22,y:22}},
 {regions:[unknown],selection:null}]);
assert.equal(mixed.unknownSelected,1);
assert.equal(mixed.unresolvedAbstentions,1);
assert.equal(mixed.enemyFramesWithoutConfirmedHit,1);
assert.equal(mixed.enemySelected,0);
