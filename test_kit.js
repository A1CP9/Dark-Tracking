const assert=require('node:assert/strict');
const {Kit,hud,identify}=require('./arena-kit');
const Arena=require('./arena');
const pixels=new Uint8ClampedArray(160*90*4);
assert.equal(identify(pixels),-1);
for(const slot of [0,1]){hud(pixels,slot);assert.equal(identify(pixels),slot);}
for(const rapid of [false,true]){
 const k=new Kit();for(let t=0;t<=900;t+=10)k.advance(t,{fire:true},{rapid},pixels);
 assert.equal(k.shots,rapid?10:1);
}
for(const slot of [0,1]){
 const k=new Kit();k.slot=slot;
 for(let i=0;i<20;i++){
  const a=k.advance(i*400,{fire:true,ads:true},{rapid:true,katm:true,stabilize:true},pixels);
  assert.deepEqual([a.x,a.y],[0,0]);assert.equal(a.ads,slot===0);
  assert.equal(k.advance(i*400+80,{ads:true},{},pixels).ads,true);
 }
}
const k=new Kit();
for(const [t,slot] of [[0,1],[99,1],[100,0],[200,0]]){
 k.advance(t,{swap:true},{yy:true},pixels);assert.equal(k.slot,slot);
}
const input={walk:0,dx:0,dy:0}, marker=[{x:86,y:47}];
function camera(settings){const g=new Arena();g.step(input,marker,true,0,settings);return g.camera;}
assert.equal(camera({radius:3}).x,0);
assert.equal(camera({gain:1}).x,6);
assert.ok(camera({zone:'head'}).y<camera({zone:'chest'}).y);
console.log('PASS simulated rapid fire, ADS timing, YY, two-axis compensation and aim settings');
