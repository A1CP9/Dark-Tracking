const b=require('./bindings'),assert=require('node:assert/strict');
const saved={...b.defaults,fire:'Mouse0',aim:'Mouse2',left:'ArrowLeft'};
assert.deepEqual(b.read({getItem:()=>JSON.stringify(saved)}),saved);
assert.deepEqual(b.read(null),b.defaults);
for(const data of [null,{}, {...saved,fire:'Mouse2'},{...saved,left:'Unknown'}])assert.equal(b.valid(data),false);
assert.equal(b.held(new Set(['Mouse2']),saved.aim),true);
assert.equal(b.held(new Set(['ShiftRight']),b.defaults.aim),true);
assert.equal(b.held(new Set(),saved.fire),false);
console.log('PASS local remapping, persistence fallback, conflicting inputs and release');
