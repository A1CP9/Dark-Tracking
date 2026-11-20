'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const nodes=new Map(), saved=[], checks=[];
let time=0,iteration=0,filter;
const drawing={drawImage(){},getImageData(){return {data:new Uint8Array(4)};},strokeRect(){}};
const get=id=>{
 if(!nodes.has(id))nodes.set(id,{getContext:()=>drawing,textContent:'',value:'0',width:640,height:360});
 return nodes.get(id);
};
get('track').checked=true;
get('region').value='40';
get('tolerance').value='37';
class Tracker{
 static bindColor(){}
 static rgb(){return [255,0,0];}
 process(data,w,h,options){filter=options;return {target:null};}
 reset(){}
}
const env=vm.createContext({document:{getElementById:get,hasFocus:()=>true},window:{},location:{hash:''},
 URLSearchParams,sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},ColorTracker:Tracker,
 PadInput:require('./remote-pad'),ButtonEvents:require('./button-events'),remoteLook:require('./remote-aim'),
 performance:{now:()=>time},setInterval(){},setTimeout(fn){time+=100;fn();},
 createImageBitmap:async()=>({width:1280,height:720,close(){}}),
 fetch:async(url,options)=>{
  if(url.endsWith('last-console')){saved.push(JSON.parse(options.body));return {ok:true};}
  iteration++;
  if(iteration===12)checks.push([get('videoRate').textContent,get('videoSize').textContent,get('rate').textContent]);
  if(iteration>11)return {ok:true,headers:{get:()=>null},json:async()=>({running:false})};
  return {ok:true,headers:{get:key=>({'Content-Type':'image/jpeg','X-Frame':String(iteration)}[key])},blob:async()=>({})};
 }});
vm.runInContext(fs.readFileSync(__dirname+'/remote.js','utf8'),env);
(async()=>{
 await vm.runInContext("live=true;poll(0,'192.168.1.17')",env);
 assert.deepEqual(saved,[{host:'192.168.1.17'}]);
 assert.deepEqual(checks,[['10 FPS','1280 × 720','11 Hz']]);
 assert.equal(get('connectionSetup').open,false);
 assert.equal(filter.roi,.4);assert.equal(filter.tolerance,37);
 assert.equal(get('rate').textContent,'—');
})().catch(e=>{console.error(e);process.exitCode=1;});
