const Arena=require('./arena'),assert=require('node:assert/strict');
for(const zone of ['head','chest']){
 const g=new Arena(), marker=[{x:108,y:60}];
 const opts={zone,adsOnly:true,acquire:1,gain:0.25,radius:90};
 const step=ads=>g.step({ads,walk:0,dx:0,dy:0},marker,true,0,opts);
 step(false);assert.deepEqual(g.camera,{x:0,y:0});
 step(true);assert.equal(g.camera.x,28);assert.ok(Math.abs(g.camera.y-(zone==='head'?12.9:15))<1e-8);
 marker[0].x+=8;step(true);assert.equal(g.camera.x,30);
 step(false);assert.equal(g.camera.x,30);
 step(true);assert.equal(g.camera.x,36);
}
console.log('PASS ADS gating, both zones, instant acquisition, quarter-rate follow, release and reacquisition');
