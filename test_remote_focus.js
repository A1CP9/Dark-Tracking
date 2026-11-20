'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const nodes=new Map();
const document={
 hidden:false,hasFocus:()=>true,
 getElementById(id){
  if(!nodes.has(id))nodes.set(id,{value:'',getContext:()=>({}),focus(){document.activeElement=this;}});
  return nodes.get(id);
 }
};
const env=vm.createContext({document,window:{},location:{hash:''},URLSearchParams,
 sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},setInterval(){},
 performance:{now:()=>100},PadInput:require('./remote-pad'),
 ColorTracker:class{static bindColor(){} reset(){}},ButtonEvents:class{clear(){}}});
vm.runInContext(fs.readFileSync(__dirname+'/remote.js','utf8'),env);
const run=src=>vm.runInContext(src,env);
const scene=document.getElementById('game');
run('padMode=true;live=true;seen=1;displayAt=100');
scene.onclick();
assert.equal(run('padCaptured'),true);
env.window.onblur();
assert.equal(run('padCaptured'),false);
scene.onclick();
assert.equal(run('padCaptured'),true);
scene.onblur();
assert.equal(run('padCaptured'),false);
scene.onclick();
document.hidden=true;
document.onvisibilitychange();
assert.equal(run('padCaptured'),false);

async function testMouseCapture(){
 document.hidden=false;
 run('padMode=false');
 let exits=0;
 document.exitPointerLock=()=>{document.pointerLockElement=null;exits++;};
 scene.requestPointerLock=()=>Promise.reject(new Error('denied'));
 scene.onclick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(run('mouseRequest'),null);
 assert.match(document.getElementById('status').textContent,/تعذّر/);
 scene.requestPointerLock=()=>undefined;
 scene.onclick();
 document.onpointerlockerror();
 assert.equal(run('mouseRequest'),null);
 scene.onclick();
 env.window.onblur();
 document.pointerLockElement=scene;
 document.onpointerlockchange();
 assert.equal(exits,1);
 assert.equal(run('mouseActive()'),false);
 scene.onclick();
 document.pointerLockElement=scene;
 document.onpointerlockchange();
 assert.equal(run('mouseActive()'),true);
 document.hasFocus=()=>false;
 assert.equal(run('mouseActive()'),false);
}
testMouseCapture().catch(error=>{console.error(error);process.exitCode=1;});
