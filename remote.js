'use strict';
const get=id=>document.getElementById(id), scene=get('game'), ctx=scene.getContext('2d',{willReadFrequently:true});
const incomingToken=new URLSearchParams(location.hash.slice(1)).get('desktop');
if(incomingToken){sessionStorage.setItem('darkDesktopToken',incomingToken);history.replaceState(null,'',location.pathname);}
const token=sessionStorage.getItem('darkDesktopToken'), tracker=new ColorTracker(), keys=new Set();
let displayAt=-Infinity, stalled=false;
let targetPoint=null, detectedAt=0;
ColorTracker.bindColor(get('remoteColor'),()=>{targetPoint=null;tracker.reset();});
let padMode=false;
let padCaptured=false;
let mouseRequest=null, mouseCaptured=false;
const padReader=new PadInput.Reader();
const weapons=new PadInput.WeaponActions();
const doubleSwap=new PadInput.DoubleSwap();
let padMap={...PadInput.defaults};
let padSave=Promise.resolve();
const padNames=['×','○','□','△','L1','R1','L2','R2','Create','Options','L3','R3','↑','↓','←','→','PS'];
async function setupPad(){
 try{const result=await (await post('pad-bindings')).json();if(result.map)padMap=result.map;}
 catch{
  get('padBindings').textContent='تعذّرت قراءة أزرار اليد المحفوظة. أعد فتح التطبيق للمحاولة.';
  return;
 }
 const selectors={};
 for(const key of Object.keys(padMap)){
  const label=document.createElement('label'),select=document.createElement('select');
  selectors[key]=select;
  label.append('زر PS5 '+padNames[PadInput.defaults[key]],select);
  padNames.forEach((name,i)=>select.add(new Option(name,i)));
  select.value=String(padMap[key]);get('padBindings').append(label);
  select.onchange=()=>{
   const value=Number(select.value),prior=padMap[key];
   const other=Object.keys(padMap).find(k=>k!==key&&padMap[k]===value);
   if(other){padMap[other]=prior;selectors[other].value=String(prior);}
   padMap[key]=value;padReader.reset();
   const map={...padMap};
   padSave=padSave.then(()=>post('pad-bindings',{map})).catch(()=>message('تعذّر حفظ أزرار اليد.'));
  };
 }
}
if(token)setupPad();
get('device').onchange=()=>{
 release();padReader.reset();padMode=get('device').value==='pad';
 get('bindings').hidden=padMode;get('padBindings').hidden=!padMode;
 get('hint').textContent=padMode?'وصّل اليد بالكمبيوتر واضغط زرًا ثم اتركه. بعد ظهور البث، اضغط داخل الصورة لتفعيل اليد. إذا خرجت من النافذة، اضغط داخل الصورة مرة أخرى ثم اترك الأزرار والعصوين.':'اضغط داخل الصورة للتحكم بالماوس. اضغط Esc لتحريره.';
};
let dx=0,dy=0,seq=0,seen=0,live=false;
async function post(action,data={}){
 const response=await fetch('/rp/'+action,{method:'POST',headers:{'X-Dark-Session':token||'','Content-Type':'application/json'},body:JSON.stringify(data)});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.message||'تعذر الاتصال بالمشغّل المحلي.');}
 return response;
}
const defaultMap={up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',aim:'Mouse2',fire:'Mouse0',jump:'Space',reload:'KeyR',swap:'KeyQ',crouch:'KeyC'};
const labels={up:'أمام',down:'خلف',left:'يسار',right:'يمين',aim:'تصويب',fire:'إطلاق',jump:'قفز',reload:'تعمير',swap:'تبديل',crouch:'انحناء'};
const choices=[...new Set([...Object.values(defaultMap),...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ',c=>'Key'+c),
 ...Array.from('0123456789',c=>'Digit'+c),'Mouse1','Mouse3','Mouse4','ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','Tab','KeyE','KeyF','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'])];
const keyText=code=>({Mouse0:'الماوس الأيسر',Mouse1:'عجلة الماوس',Mouse2:'الماوس الأيمن',Mouse3:'زر الماوس الرابع',Mouse4:'زر الماوس الخامس',Space:'المسافة'}[code]||code.replace(/^Key|^Digit/,''));
let keymap={...defaultMap};
try{
 const saved=JSON.parse(localStorage.getItem('darkRemoteBindings'));
 if(saved && Object.keys(defaultMap).every(k=>choices.includes(saved[k])) && new Set(Object.keys(defaultMap).map(k=>saved[k])).size===Object.keys(defaultMap).length)keymap={...keymap,...saved};
}catch{}
let pendingSave=Promise.resolve();
async function setupBindings(){
 try{
  const result=await (await post('bindings')).json();
  if(result.map)keymap=result.map;
  else if(JSON.stringify(keymap)!==JSON.stringify(defaultMap))await post('bindings',{map:keymap});
 }catch{
  get('bindings').textContent='تعذّرت قراءة أزرار الماوس والكيبورد المحفوظة. أعد فتح التطبيق للمحاولة.';
  return;
 }
 const selects={};
 for(const key of Object.keys(defaultMap)){
 const label=document.createElement('label'),select=document.createElement('select');
 label.append(labels[key]+' ');
 for(const code of choices)select.add(new Option(keyText(code),code));
 selects[key]=select;select.value=keymap[key];label.append(select);get('bindings').append(label);
 select.onchange=()=>{
  const other=Object.keys(keymap).find(k=>k!==key&&keymap[k]===select.value);
  if(other){keymap[other]=keymap[key];selects[other].value=keymap[key];}
  keymap[key]=select.value;reset();
  const snapshot={...keymap};
  pendingSave=pendingSave.then(()=>post('bindings',{map:snapshot})).catch(()=>message('تغيّرت الأزرار لهذه الجلسة فقط. تعذّر حفظها.'));
  try{localStorage.setItem('darkRemoteBindings',JSON.stringify(snapshot));}catch{}
 };
}
}
if(token)setupBindings();
const buttonNames={fire:'R2',aim:'L2',jump:'CROSS',reload:'SQUARE',swap:'TRIANGLE',crouch:'CIRCLE'};
const edges=new ButtonEvents();
function changeKey(code,down){
 if(keys.has(code)===down)return;
 if(down)keys.add(code);else keys.delete(code);
 const entry=Object.entries(buttonNames).find(([action])=>keymap[action]===code);
 if(entry)edges.record(entry[1],down,performance.now());
}
const held=action=>keys.has(keymap[action]);
function reset(){weapons.reset();doubleSwap.reset();keys.clear();edges.clear();dx=dy=0;targetPoint=null;}
function freshFocusedFrame(){
 return live && seen && performance.now()-displayAt<500 && !document.hidden && document.hasFocus();
}
function mouseActive(){
 return mouseCaptured && !padMode && document.pointerLockElement===scene && freshFocusedFrame();
}
function clearMetrics(){
 for(const id of ['aimState','buttonState','videoSize','videoRate','rate'])get(id).textContent='—';
}
function release(){
 get('aimState').textContent=get('buttonState').textContent='—';
 if(mouseRequest)mouseRequest.cancelled=true;
 mouseCaptured=false;
 padCaptured=false;padReader.reset();reset();if(document.pointerLockElement===scene)document.exitPointerLock();}
function message(text){get('status').textContent=text;}
function captureFailed(request){
 if(!request || request!==mouseRequest)return;
 mouseRequest=null;
 if(!request.cancelled)message('تعذّر تفعيل الماوس. اضغط داخل صورة اللعب للمحاولة مجددًا.');
}
document.onpointerlockchange=()=>{
 reset();
 mouseCaptured=false;
 if(document.pointerLockElement!==scene)return;
 const request=mouseRequest;
 mouseRequest=null;
 if(!request || request.cancelled || padMode || !freshFocusedFrame()){
  document.exitPointerLock();
  return;
 }
 mouseCaptured=true;
 stalled=false;
};
document.onpointerlockerror=()=>{if(mouseRequest?.legacy)captureFailed(mouseRequest);};
window.onblur=release;
scene.onblur=release;
document.onvisibilitychange=()=>{if(document.hidden)release();};
scene.onclick=()=>{
 if(!freshFocusedFrame())return;
 if(padMode){scene.focus();padCaptured=true;stalled=false;return;}
 if(document.pointerLockElement || mouseRequest)return;
 const request={cancelled:false,legacy:false};
 mouseRequest=request;
 try{
  const result=scene.requestPointerLock();
  if(result)result.catch(()=>captureFailed(request));
  else request.legacy=true;
 }catch{captureFailed(request);}
};
document.onmousemove=e=>{if(mouseActive()){dx+=e.movementX;dy+=e.movementY;}};
document.onkeydown=e=>{if(mouseActive()){changeKey(e.code,true);e.preventDefault();}};
document.onkeyup=e=>changeKey(e.code,false);
scene.oncontextmenu=e=>e.preventDefault();
document.onmousedown=e=>{if(mouseActive())changeKey('Mouse'+e.button,true);};
document.onmouseup=e=>changeKey('Mouse'+e.button,false);

function checkVideo(){
 if(!live || !seen || stalled || performance.now()-displayAt<500)return;
 stalled=true;release();tracker.reset();
 message('توقفت الصورة. عُلّق التحكم حتى يعود البث.');
}

async function restoreConsole(){
 try{
  const {host}=await (await post('last-console')).json();
  if(host && !get('host').value && !live)get('host').value=host;
 }catch{}
}
if(token)restoreConsole();
async function poll(id,host){
 let rateStart=performance.now(),requests=0,frames=0;
 let firstFrame=true;
 while(id===seq && live){
  const padActive=padMode && padCaptured && !document.hidden && document.hasFocus() && document.activeElement===scene && !stalled && seen && performance.now()-displayAt<500;
  const gamepad=padActive?Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected&&p.mapping==='standard'):null;
  const pad=padReader.read(gamepad,padMap);
  const buttons=padMode?pad.buttons:Object.entries(buttonNames).filter(([key])=>held(key)).map(([,button])=>button);
  const left=padMode?pad.left:[Number(held('right'))-Number(held('left')),Number(held('down'))-Number(held('up'))];
  const mouseScale=Number(get(held('aim')?'adsSensitivity':'sensitivity').value)/100;
  const right=remoteLook(padMode?pad.right[0]*30:dx*mouseScale,padMode?pad.right[1]*30:dy*mouseScale,targetPoint,performance.now()-detectedAt,get('correct').checked && get('track').checked && (!padMode || Boolean(gamepad)&&padReader.armed),padMode?buttons.includes('L2'):held('aim'),Number(get('gain').value)/100,scene.width,scene.height);dx=dy=0;
  const requestedAt=performance.now();
  let events=padMode?[]:edges.take(requestedAt);
  const active=padMode?Boolean(gamepad)&&padReader.armed:mouseActive();
  const yy=get('doubleSwap').checked&&active;
  if(!active)doubleSwap.reset();
  const swap=doubleSwap.update(buttons.includes('TRIANGLE'),events.some(([b,down])=>b==='TRIANGLE'&&down),yy,requestedAt,Number(get('yyTime').value));
  if(yy)events=events.filter(([b])=>b!=='TRIANGLE');
  const outgoing=buttons.filter(b=>b!=='TRIANGLE');
  if(swap)outgoing.push('TRIANGLE');
  if(!active)weapons.reset();
  const command=active?weapons.apply(outgoing,events,right,{
   rapid:get('rapid').checked,rapidPeriod:Number(get('rapidPeriod').value),
   katm:get('katm').checked,katmTime:Number(get('katmTime').value),
   recoil:get('recoil').checked,recoilPower:Number(get('recoilPower').value)
  },requestedAt):null;
  const mode=active?(command.buttons.includes('L2')?'ADS':'HIP'):'—';
  const pressed=active&&command.buttons.length?command.buttons.join(' + '):'—';
  if(get('aimState').textContent!==mode)get('aimState').textContent=mode;
  if(get('buttonState').textContent!==pressed)get('buttonState').textContent=pressed;
  const response=await post('poll',active?{seen,left,...command}:{seen,left:[0,0],right:[0,0],buttons:[],edges:[]});
  if(id!==seq)return;
  requests++;
  const elapsed=performance.now()-rateStart;
  if(elapsed>=1000){
   get('rate').textContent=Math.round(requests*1000/elapsed)+' Hz';
   get('videoRate').textContent=Math.round(frames*1000/elapsed)+' FPS';
   requests=0;frames=0;rateStart=performance.now();
  }
  if(response.headers.get('Content-Type')==='image/jpeg'){
   const frame=await createImageBitmap(await response.blob());
   try{
    if(id!==seq)return;
    checkVideo();
    displayAt=requestedAt-Number(response.headers.get('X-Frame-Age-Ms')||0);
    frames++;
    if(firstFrame){
     firstFrame=false;
     get('connectionSetup').open=false;
     post('last-console',{host:host.trim()}).catch(()=>{});
    }
    get('videoSize').textContent=frame.width+' × '+frame.height;
    ctx.drawImage(frame,0,0,scene.width,scene.height);seen=Number(response.headers.get('X-Frame'));
    if(get('track').checked){
     const pixels=ctx.getImageData(0,0,scene.width,scene.height);
     const roi=Number(get('region').value)/100;
     const {target}=tracker.process(pixels.data,scene.width,scene.height,{requireSingle:true,roi,tolerance:Number(get('tolerance').value),rgb:ColorTracker.rgb(get('remoteColor').value)},performance.now());
     targetPoint=target;detectedAt=requestedAt-Number(response.headers.get('X-Frame-Age-Ms')||0);
     if(roi<1){
      const x=Math.floor(scene.width*(1-roi)/2),y=Math.floor(scene.height*(1-roi)/2);
      ctx.strokeStyle='rgba(245,210,124,.65)';ctx.strokeRect(x,y,scene.width-2*x,scene.height-2*y);
     }
     if(target){ctx.strokeStyle='#a5ee54';ctx.strokeRect(target.left,target.top,target.width,target.height);}
    }
    if(performance.now()-displayAt<500){
     if(stalled && !document.pointerLockElement)message('عادت الصورة. اضغط داخلها لاستئناف التحكم.');
     else message('استُقبلت الصورة • إطار '+seen);
     if(document.pointerLockElement===scene)stalled=false;
    }else checkVideo();
   }finally{frame.close();}
  }else{
   const result=await response.json();if(id!==seq)return;
   if(!seen || !result.running)message(result.message);
   if(!result.running){live=false;release();clearMetrics();break;}
  }
  await new Promise(resolve=>setTimeout(resolve,Number(get('interval').value)));
 }
}
get('login').onclick=async()=>{get('login').disabled=true;get('pairing').open=true;message('جارٍ تجهيز تسجيل الدخول…');try{const result=await (await post('login')).json();if(result.embedded){message('أكمل تسجيل الدخول في نافذة PlayStation ثم أدخل رمز الربط.');return;}const a=document.createElement('a');a.href=result.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='متابعة إلى PlayStation';get('status').replaceChildren(a);}catch(e){message(e.message);}finally{get('login').disabled=false;}};
get('connect').onclick=async()=>{
 if(live)return;
 clearMetrics();
 const id=++seq;live=true;seen=0;stalled=false;displayAt=-Infinity;tracker.reset();ctx.clearRect(0,0,640,360);reset();message('جارٍ الاتصال');
 const data=Object.fromEntries(['host','user','pin','redirect'].map(k=>[k,get(k).value]));
 try{await post('connect',data);if(id!==seq)return;get('pin').value=get('redirect').value='';const watchdog=setInterval(checkVideo,75);try{await poll(id,data.host);}finally{clearInterval(watchdog);}}
 catch(e){if(id===seq){live=false;release();clearMetrics();message(e.message);}}
};
get('stop').onclick=async()=>{clearMetrics();++seq;live=false;release();ctx.clearRect(0,0,640,360);try{await post('stop');message('طُلب قطع الاتصال');}catch(e){message(e.message);}};
window.onpagehide=()=>{if(live){release();fetch('/rp/stop',{method:'POST',headers:{'X-Dark-Session':token||''},body:'{}',keepalive:true}).catch(()=>{});}};
if(!token)message('افتح DARK_TRACKING.cmd ثم ادخل لهذه الصفحة من الرئيسية.');
