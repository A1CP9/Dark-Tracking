const assert=require('node:assert/strict');const {ColorTracker}=require('./tracker.js');
const w=40,h=20,a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4)a.set([255,0,10,255],i);
assert.equal(new ColorTracker().process(a,w,h).target,null,'default rejects frame-sized color');
assert.equal(new ColorTracker().process(a,w,h,{maxAreaRatio:1}).target.area,w*h,'explicit full-frame option');
assert.throws(()=>new ColorTracker().process([],0,0),/dimensions/);
assert.throws(()=>new ColorTracker().process([],1.5,2),/dimensions/);
console.log('4 area/input tests passed');
