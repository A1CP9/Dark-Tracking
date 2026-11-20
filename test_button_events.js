const assert=require('node:assert/strict'), ButtonEvents=require('./button-events');
const edges=new ButtonEvents();
edges.record('CROSS',true,5);edges.record('CROSS',false,10);
assert.deepEqual(edges.take(25),[['CROSS',true],['CROSS',false]]);
assert.deepEqual(edges.take(26),[]);
edges.record('R2',true,0);assert.deepEqual(edges.take(200),[]);
edges.record('SQUARE',true,201);edges.clear();assert.deepEqual(edges.take(205),[]);
console.log('PASS taps, no replay, stale expiry and focus reset');
