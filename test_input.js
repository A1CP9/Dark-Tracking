const assert=require('node:assert/strict');
const InputMonitor=require('./input-monitor');
class Surface extends EventTarget{fire(type,props={}){const e=new Event(type);Object.assign(e,props);this.dispatchEvent(e);}}
let passed=0;
function test(name,fn){const win=new Surface(),doc=new Surface();doc.hidden=false;const m=new InputMonitor(win,doc);fn(m,win,doc);passed++;console.log('PASS',name);}
function held(m,w){m.start();w.fire('keydown',{code:'KeyW'});w.fire('mousedown',{button:0});w.fire('mousemove',{movementX:4,movementY:-2});}
function neutral(m){assert.deepEqual(m.snapshot().keys,[]);assert.deepEqual(m.snapshot().buttons,[]);assert.deepEqual(m.snapshot().motion,{x:0,y:0});assert.equal(m.active,false);}
test('inactive events ignored',(m,w)=>{w.fire('keydown',{code:'KeyW'});neutral(m);});
test('simultaneous keys and releases',(m,w)=>{m.start();for(const code of ['KeyW','KeyD','KeyW'])w.fire('keydown',{code});assert.equal(m.keys.size,2);for(const code of ['KeyW','KeyD'])w.fire('keyup',{code});assert.equal(m.keys.size,0);});
test('mouse press release',(m,w)=>{held(m,w);w.fire('mouseup',{button:0});assert.equal(m.buttons.size,0);});
for(const type of ['blur','pagehide'])test(type+' neutralizes and requires explicit restart',(m,w)=>{held(m,w);w.fire(type);neutral(m);w.fire('focus');w.fire('keydown',{code:'KeyD'});neutral(m);});
test('hidden document neutralizes',(m,w,d)=>{held(m,w);d.hidden=true;d.fire('visibilitychange');neutral(m);});
test('pointer unlock neutralizes',(m,w,d)=>{held(m,w);d.pointerLockElement=null;d.fire('pointerlockchange');neutral(m);});
test('Escape neutralizes',(m,w)=>{held(m,w);w.fire('keydown',{code:'Escape'});neutral(m);});
test('restart clears old state',(m,w)=>{held(m,w);m.start();assert.equal(m.keys.size,0);assert.equal(m.buttons.size,0);});
test('dispose removes handlers',(m,w)=>{held(m,w);m.dispose();w.fire('keydown',{code:'KeyD'});neutral(m);assert.equal(m.listeners.length,0);});
test('snapshot does not leak mutable state',(m,w)=>{held(m,w);const s=m.snapshot();s.keys.push('KeyD');s.motion.x=99;assert.equal(m.keys.size,1);assert.equal(m.motion.x,4);});
console.log(`${passed} passed (mock events; not browser or PS5)`);
