const assert=require('node:assert/strict');
const Arena=require('./arena');
const marker=[{x:118,y:58}], idle={dx:0,dy:0,walk:0};
function run(assist){
 const game=new Arena();let error;
 for(let i=0;i<40;i++){
  const input=i===5?{dx:4,dy:-2,walk:1}:idle;
  const before={...game.camera};
  error=game.step(input,marker,assist,i*16);
  if(i===5){
   assert.equal(game.playerX,1);
   if(!assist){assert.equal(game.camera.x-before.x,4);assert.equal(game.camera.y-before.y,-2);}
  }
 }
 return error;
}
const manual=run(false),assisted=run(true);
assert.ok(manual>30 && assisted<1);
const g=new Arena();g.step(idle,marker,true,0);
const before={...g.camera};
for(const markers of [[],[...marker,{x:80,y:45}]]){
 assert.equal(g.step(idle,markers,true,16),null);assert.deepEqual(g.camera,before);
}
console.log('Same input, 40 frames; final distance in pixels:',{manual,assisted});
