const assert=require('node:assert/strict');
const fs=require('node:fs');
const {ColorTracker}=require('./tracker');
const Arena=require('./arena');
for(const [page,id] of Object.entries({'index':'color','review':'reviewColor','remote':'remoteColor','arena':'arenaColor'})){
 const html=fs.readFileSync(__dirname+'/'+page+'.html','utf8');
 assert.ok(html.includes('id="'+id+'" type="color" value="#ff000a"'),page);
}
const storage=new Map();
global.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
const picker={value:'#ff000a'};
storage.set('darkTrackingColorV1','#ff00ff');
ColorTracker.bindColor(picker);
assert.equal(picker.value,'#ff000a');
const defaultArena=new Arena();
defaultArena.rgb=ColorTracker.rgb(picker.value);
defaultArena.paint([{x:90,y:45}]);
const pixel=(45*160+90)*4;
assert.deepEqual(Array.from(defaultArena.pixels.slice(pixel,pixel+4)),[255,0,10,255]);
picker.value='#0088af';picker.oninput();
const next={value:'#ff000a'};ColorTracker.bindColor(next);
assert.equal(next.value,picker.value);
for(const color of ['#ff000a','#0088af','#000000','#ffffff']){
 const arena=new Arena();arena.rgb=ColorTracker.rgb(color);
 assert.notEqual(arena.step({dx:0,dy:0,walk:0},[{x:90,y:45}],false,0),null,color);
}
console.log('PASS game color defaults, persisted change and four arena colors');

async function desktopColor() {
 global.sessionStorage={getItem:()=>'test-session'};
 let finishRead;
 const writes=[];
 global.fetch=async (_,options)=>{
  const body=JSON.parse(options.body);
  if(body.color)writes.push(body.color);
  return {ok:true,json:()=>body.color?body:new Promise(resolve=>{finishRead=resolve;})};
 };
 const input={};
 ColorTracker.bindColor(input);
 await new Promise(resolve=>setImmediate(resolve));
 input.value='#00ff44';input.oninput();input.onchange();
 finishRead({color:'#ff000a'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(input.value,'#00ff44');
 assert.deepEqual(writes,['#00ff44']);
}
desktopColor().catch(error=>{console.error(error);process.exitCode=1;});
