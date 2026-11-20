// Mocked browser lifecycle regression tests. Not an actual browser/PS5 test.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||__dirname+'/app.js','utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function setup(){
 const elements={},revoked=[],frames=new Map();let id=0;
 const context2d={clearRect(){},fillRect(){},drawImage(){},strokeRect(){},beginPath(){},arc(){},stroke(){},getImageData(){return {data:new Uint8ClampedArray(640*360*4)};}};
 const element=()=>({textContent:'',value:'',width:640,height:360,getContext:()=>context2d,removeAttribute(){},load(){},pause(){this.paused=true;this.onpause?.();},play:async function(){this.paused=false;},getBoundingClientRect:()=>({left:0,top:0,width:640,height:360})});
 const env={console,Uint8ClampedArray,document:{getElementById:id=>elements[id]??(elements[id]=element()),createElement:element},window:{addEventListener(){}},navigator:{mediaDevices:{}},performance:{now:()=>100},requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:i=>frames.delete(i),URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:u=>revoked.push(u)},ColorTracker:class{static bindColor(input,fn){input.oninput=fn;}reset(){}process(data,w,h,options){env.lastOptions=options;return {components:[],target:null};}},setTimeout,Blob};
 for(const name of ['ms','fps','count','status'])env.document.getElementById(name);
 vm.createContext(env);vm.runInContext(source,env);
 return {env,elements,revoked,frames,run:s=>vm.runInContext(s,env)};
}
function makeStream(){const track={readyState:'live',stopped:false,onended:null,stop(){this.stopped=true;this.readyState='ended';}};return {track,getTracks:()=>[track],getVideoTracks:()=>[track]};}
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
(async()=>{
 await test('starting the demo preserves the selected color',()=>{
  const h=setup();
  h.elements.color.value='#00ff00';
  h.elements.demo.onclick();
  assert.equal(h.elements.color.value,'#00ff00');
  h.env.document.getElementById('diamond').checked=true;
  h.elements.tolerance.value='150';
  h.run('tick(100)');
  assert.deepEqual(Array.from(h.env.lastOptions.rgb),[0,255,0]);
  assert.equal(h.env.lastOptions.tolerance,0);
  assert.equal(h.env.lastOptions.shape,undefined);
 });
 await test('max profile holds 1080p60 caps under load and restores adaptive fallback',async()=>{
  const h=setup(),selector=h.elements.qualityMode;
  selector.value='max';selector.onchange();h.elements.demo.onclick();
  h.run('for(let i=0;i<80;i++)adjustLoad(150)');
  assert.deepEqual(Array.from(h.run('[currentQuality().width,currentQuality().shortSide,currentQuality().fps]')),[1920,1080,60]);
  selector.value='auto';selector.onchange();
  assert.equal(h.run('currentQuality().width'),640);
  h.run('for(let i=0;i<4;i++)adjustLoad(150)');assert.equal(h.run('currentQuality().width'),480);
 });
 await test('adaptive quality ignores spikes, steps down under load and resets on restart',async()=>{
  const h=setup();h.elements.demo.onclick();
  h.run('adjustLoad(90);adjustLoad(2);adjustLoad(90);adjustLoad(90);adjustLoad(90)');
  assert.equal(h.run('qualityLevel'),0);h.run('adjustLoad(90)');assert.equal(h.run('qualityLevel'),1);
  h.run('for(let i=0;i<40;i++)adjustLoad(90)');assert.equal(h.run('qualityLevel'),3);
  h.elements.demo.onclick();assert.equal(h.run('qualityLevel'),0);
 });
 await test('USB opens only selected source and releases it',async()=>{
  const h=setup(),s=makeStream();
  h.env.document.getElementById('source').value='capture1';
  h.env.navigator.mediaDevices.getUserMedia=async opts=>{
   assert.equal(opts.video.deviceId.exact,'capture1');assert.equal(opts.audio,false);return s;
  };
  await h.elements.usb.onclick();assert.equal(h.run('mode'),'usb');h.elements.stop.onclick();assert.ok(s.track.stopped);
 });
 await test('failed screen play releases stream',async()=>{const h=setup(),s=makeStream();h.env.navigator.mediaDevices.getDisplayMedia=async()=>s;h.elements.video.play=async()=>{throw Error('decode failure');};await h.elements.screen.onclick();assert.equal(s.track.stopped,true);assert.equal(h.run('stream'),null);});
 await test('late permission result cannot replace demo',async()=>{const h=setup(),d=deferred(),s=makeStream();h.env.navigator.mediaDevices.getDisplayMedia=()=>d.promise;const pending=h.elements.screen.onclick();h.elements.demo.onclick();d.resolve(s);await pending;assert.equal(s.track.stopped,true);assert.equal(h.run('mode'),'demo');});
 await test('queued old track-ended callback cannot stop new source',async()=>{const h=setup(),s=makeStream();h.env.navigator.mediaDevices.getDisplayMedia=async()=>s;await h.elements.screen.onclick();const stale=s.track.onended;h.elements.demo.onclick();stale();assert.equal(h.run('mode'),'demo');});
 await test('screen ends while play is pending',async()=>{const h=setup(),s=makeStream(),d=deferred();h.env.navigator.mediaDevices.getDisplayMedia=async()=>s;h.elements.video.play=()=>d.promise;const pending=h.elements.screen.onclick();await Promise.resolve();s.track.readyState='ended';s.track.onended?.();d.resolve();await pending;assert.equal(h.run('mode'),null);assert.equal(s.track.stopped,true);});
 await test('failed file play revokes URL and permits reselect',async()=>{const h=setup();h.elements.video.play=async()=>{throw Error('unsupported');};const input={files:[{}],value:'clip.mp4'};await h.elements.file.onchange({target:input});assert.equal(input.value,'');assert.ok(h.revoked.includes('blob:test'));assert.equal(h.run('mode'),null);});
 await test('stop clears metrics and frame selection',async()=>{const h=setup();h.elements.demo.onclick();h.elements.ms.textContent='10 ms';h.run('hasFrame=true');h.elements.stop.onclick();assert.equal(h.elements.ms.textContent,'—');assert.equal(h.run('hasFrame'),false);assert.equal(h.frames.size,0);});
 await test('pause and end have explicit states',async()=>{const h=setup();await h.elements.file.onchange({target:{files:[{}],value:'a'}});h.elements.video.onpause();assert.match(h.elements.status.textContent,/مؤقت/);h.elements.video.onended();assert.match(h.elements.status.textContent,/انتهى الفيديو/);h.elements.video.onplaying();assert.match(h.elements.status.textContent,/يعمل/);});
 await test('late file play cannot replace demo',async()=>{const h=setup(),d=deferred();h.elements.video.play=()=>d.promise;const pending=h.elements.file.onchange({target:{files:[{}],value:'a'}});h.elements.demo.onclick();d.resolve();await pending;assert.equal(h.run('mode'),'demo');assert.ok(h.revoked.includes('blob:test'));});
 console.log(`${passed} passed, ${failed} failed (mocked lifecycle)`);process.exitCode=failed?1:0;
})();
