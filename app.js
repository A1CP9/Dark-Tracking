'use strict';
const $=id=>document.getElementById(id),video=$('video'),canvas=$('view'),ctx=canvas.getContext('2d');
const raw=document.createElement('canvas'),rc=raw.getContext('2d',{willReadFrequently:true});
const tracker=new ColorTracker();let mode=null,stream=null,url=null,raf=null,lastMedia=-1,seq=0,samples=[],lastTick=0,fpsCount=0,fpsStart=0,hasFrame=false;
for(const id of ['tolerance','area','maxArea','roi','alpha'])$(id).oninput=()=>{$(id+'Out').value=$(id).value;tracker.reset();};
ColorTracker.bindColor($('color'),()=>tracker.reset());
function resetMetrics(){$('quality').textContent='—';for(const id of ['ms','fps','count'])$(id).textContent='—';}
function stop(){
 seq++;mode=null;cancelAnimationFrame(raf);raf=null;
 const previous=stream;stream=null;
 previous?.getTracks().forEach(t=>{t.onended=null;t.stop();});
 video.onpause=null;video.onplaying=null;video.onended=null;video.onerror=null;
 video.pause();video.srcObject=null;video.removeAttribute('src');video.load();video.hidden=true;
 if(url)URL.revokeObjectURL(url);url=null;tracker.reset();hasFrame=false;
 ctx.clearRect(0,0,canvas.width,canvas.height);resetMetrics();$('status').textContent='متوقف.';
}
function fail(token,message){if(token!==seq)return;stop();$('status').textContent=message;}
const qualityLevels=[{width:640,fps:30},{width:480,fps:24},{width:320,fps:20},{width:240,fps:15}];
let qualityLevel=0, slowFrames=0;
const highQuality={width:1920,shortSide:1080,fps:60};
function currentQuality(){
 return $('qualityMode').value==='max'?highQuality:qualityLevels[qualityLevel];
}
$('qualityMode').onchange=()=>{
 qualityLevel=0;slowFrames=0;tracker.reset();lastMedia=-1;
 const track=stream?.getVideoTracks()[0];
 if(track?.applyConstraints){
  track.applyConstraints({frameRate:{ideal:currentQuality().fps}}).catch(()=>{});
 }
};
function adjustLoad(cost){
 if($('qualityMode').value==='max')return;
 if(cost<=600/qualityLevels[qualityLevel].fps){slowFrames=0;return;}
 if(++slowFrames>=4){
  qualityLevel=Math.min(qualityLevel+1,qualityLevels.length-1);
  slowFrames=0;
 }
}
function start(m){
 qualityLevel=0;slowFrames=0;
 mode=m;lastMedia=-1;lastTick=0;fpsCount=0;fpsStart=performance.now();samples=[];
 tracker.reset();resetMetrics();$('status').textContent='يعمل — تحليل الصورة فقط';raf=requestAnimationFrame(tick);
}
function bindVideo(token){
 video.onerror=()=>fail(token,'تعذر فك الفيديو. جرّب MP4 بترميز H.264.');
 video.onpause=()=>{if(token===seq && mode==='video'){tracker.reset();resetMetrics();$('status').textContent=video.ended?'انتهى الفيديو — يمكنك إعادة تشغيله.':'الفيديو متوقف مؤقتًا.';}};
 video.onended=()=>{if(token===seq && mode==='video'){tracker.reset();resetMetrics();$('status').textContent='انتهى الفيديو — يمكنك إعادة تشغيله.';}};
 video.onplaying=()=>{if(token===seq && mode){tracker.reset();fpsStart=performance.now();fpsCount=0;$('status').textContent='يعمل — تحليل الصورة فقط';}};
}
$('stop').onclick=stop;
$('demo').onclick=()=>{stop();start('demo');};
$('file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;e.target.value='';stop();const token=seq;
 url=URL.createObjectURL(file);video.src=url;video.hidden=false;bindVideo(token);
 try{await video.play();if(token===seq)start('video');}
 catch(err){fail(token,'تعذر تشغيل الفيديو. جرّب MP4 بترميز H.264.');}
};
$('devices').onclick=async()=>{
 const list=$('source');
 try {
  const devices=await navigator.mediaDevices.enumerateDevices();
  list.replaceChildren();
  for(const device of devices.filter(d=>d.kind==='videoinput' && d.deviceId)){
   list.add(new Option(device.label || 'مصدر فيديو '+(list.length+1),device.deviceId));
  }
  if(!list.length) $('status').textContent='اسمح للصفحة بالوصول إلى الكاميرا من إعدادات المتصفح ثم أعد عرض المصادر.';
 } catch(error){$('status').textContent='تعذر عرض المصادر: '+error.message;}
};
$('usb').onclick=()=>openStream('usb');
$('screen').onclick=()=>openStream('screen');
async function openStream(kind){
 stop();const token=seq;
 try{
  if(kind==='screen' && !navigator.mediaDevices?.getDisplayMedia)throw Error('تحتاج Chrome/Edge وفتح الصفحة عبر localhost.');
  if(kind==='usb' && !$('source').value)throw Error('اختر كرت الالتقاط من قائمة مصادر الفيديو.');
  const s=kind==='usb'
   ? await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:$('source').value},frameRate:{ideal:currentQuality().fps}},audio:false})
   : await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:currentQuality().fps}},audio:false});
  if(token!==seq){s.getTracks().forEach(t=>t.stop());return;}
  stream=s;video.srcObject=s;bindVideo(token);
  const track=s.getVideoTracks()[0];
  if(!track||track.readyState==='ended')throw Error('مصدر المشاركة غير متاح.');
  track.onended=()=>{if(token===seq)stop();};
  await video.play();if(token!==seq)return;
  if(track.readyState==='ended')throw Error('انتهت مشاركة الشاشة.');
  start(kind);
 }catch(err){fail(token,'لم تبدأ المشاركة: '+err.message);}
};
video.onseeked=()=>{tracker.reset();lastMedia=-1;};
function tick(now){
 if(!mode)return;raf=requestAnimationFrame(tick);
 const quality=currentQuality();
 if(now-lastTick<1000/quality.fps)return;
 if(mode!=='demo' && (video.readyState<2 || video.paused || video.ended || video.currentTime===lastMedia)){
  if(lastTick && now-lastTick>1000){tracker.reset();resetMetrics();if(mode==='screen')$('status').textContent='بانتظار إطار جديد من المصدر…';}
  return;
 }
 lastTick=now;lastMedia=video.currentTime;
 const beginFrame=performance.now();
 const srcW=mode==='demo'?640:video.videoWidth,srcH=mode==='demo'?360:video.videoHeight;
 if(!srcW||!srcH)return;
 const scale=Math.min(1,quality.width/Math.max(srcW,srcH),(quality.shortSide??quality.width)/Math.min(srcW,srcH));
 const w=Math.max(1,Math.round(srcW*scale)),h=Math.max(1,Math.round(srcH*scale));
 const baselineScale=Math.min(1,640/srcW);
 if(!w||!h)return;if(raw.width!==w||raw.height!==h){raw.width=canvas.width=w;raw.height=canvas.height=h;tracker.reset();}
 const hex=$('color').value,rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 if(mode==='demo'){
  // Use a contrasting background even for very dark or very light selections.
  rc.fillStyle=rgb.some(channel=>channel<128)?'#ffffff':'#000000';
  rc.fillRect(0,0,w,h);
  rc.fillStyle=hex;
  rc.fillRect((300+Math.sin(now/1000)*220)*scale,(150+Math.cos(now/1300)*100)*scale,26*scale,36*scale);
 }else rc.drawImage(video,0,0,w,h);
 const begin=performance.now(),result=tracker.process(rc.getImageData(0,0,w,h).data,w,h,mode==='demo'?{rgb,tolerance:0}:{rgb,shape:$('diamond').checked?'diamond':'any',requireSingle:$('requireSingle').checked,tolerance:+$('tolerance').value,minArea:Math.max(1,Math.round(+$('area').value*(scale/baselineScale)**2)),maxAreaRatio:+$('maxArea').value/100,roi:+$('roi').value/100,alpha:+$('alpha').value/100},now),ms=performance.now()-begin;
 hasFrame=true;$('status').textContent=mode==='demo'?'هدف متحرك — اختبار اللون المختار بإعدادات ثابتة':$('requireSingle').checked && result.components.length>1 ? 'تطابق اللون في عدة مناطق؛ توقف الاختيار' : 'يعمل — تحليل الصورة فقط';ctx.drawImage(raw,0,0);const roi=+$('roi').value/100;ctx.strokeStyle='#667f99';ctx.strokeRect(w*(1-roi)/2,h*(1-roi)/2,w*roi,h*roi);
 for(const c of result.components){ctx.strokeStyle='#6480a2';ctx.strokeRect(c.left,c.top,c.width,c.height);}
 const t=result.target;if(t){ctx.strokeStyle='#a5ee54';ctx.lineWidth=2;ctx.strokeRect(t.left-2,t.top-2,t.width+4,t.height+4);ctx.beginPath();ctx.arc(t.smoothedX,t.smoothedY,6,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1;}
 $('ms').textContent=ms.toFixed(1)+' ms';$('count').textContent=result.components.length;
 fpsCount++;if(now-fpsStart>=1000){$('fps').textContent=(fpsCount*1000/(now-fpsStart)).toFixed(1);fpsStart=now;fpsCount=0;}
 samples.push([now.toFixed(2),mode,w,h,t?.x??'',t?.y??'',t?.smoothedX??'',t?.smoothedY??'',t?.area??0,ms.toFixed(3)]);if(samples.length>10000)samples.shift();
 $('quality').textContent=w+' × '+h+' • '+quality.fps+' إطار/ث كحد أقصى';
 adjustLoad(performance.now()-beginFrame);
}
canvas.onclick=e=>{if(!hasFrame||!mode)return;const r=canvas.getBoundingClientRect(),x=Math.min(raw.width-1,Math.max(0,Math.floor((e.clientX-r.left)*raw.width/r.width))),y=Math.min(raw.height-1,Math.max(0,Math.floor((e.clientY-r.top)*raw.height/r.height)));const p=rc.getImageData(x,y,1,1).data;$('color').value='#'+[...p.slice(0,3)].map(v=>v.toString(16).padStart(2,'0')).join('');$('color').oninput();};
$('export').onclick=()=>{if(!samples.length){$('status').textContent='شغّل تجربة أولًا لتسجيل القياسات.';return;}const b=new Blob(['time_ms,source,width,height,x,y,smoothed_x,smoothed_y,area,processing_ms\n'+samples.map(r=>r.join(',')).join('\n')],{type:'text/csv'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='dark-tracking-metrics.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
window.addEventListener('beforeunload',stop);
