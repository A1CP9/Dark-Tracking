'use strict';
const el=id=>document.getElementById(id);
const surface=el('surface'),ctx=surface.getContext('2d');
const names={unknown:'اختيار لاعب فريقه غير محسوم',unresolvedAbstention:'امتناع مع فريق غير محسوم',enemy:'عدو',ally:'زميل',hud:'واجهة',background:'خلفية',miss:'فاته عدو',correctAbstention:'امتناع صحيح',overlapNeedsReview:'تداخل يحتاج مراجعة'};
const colors={unknown:'#af8cff',enemy:'#f45',ally:'#3cf',hud:'#fc4'};
let exportedRows=0;
let files=[],rows=[],index=0,regions=[],source=null,start=null,selection=null,locked=false,generation=0;
function redraw(preview){
 ctx.clearRect(0,0,surface.width,surface.height);
 if(!source)return;
 ctx.putImageData(source,0,0);
 for(const box of preview?[...regions,preview]:regions){
  ctx.strokeStyle=colors[box.label];ctx.strokeRect(box.x,box.y,box.w,box.h);
 }
 if(selection){ctx.strokeStyle='#fff';ctx.beginPath();ctx.arc(selection.x,selection.y,5,0,2*Math.PI);ctx.stroke();}
}
const reviewOptions=Object.freeze({requireSingle:true,tolerance:45,minArea:12});
ColorTracker.bindColor(el('reviewColor'));
const video=el('video');
let clip=null,clipUrl=null,frameTime=null;
function clearClip(){
 video.pause();video.removeAttribute('src');video.load();
 if(clipUrl)URL.revokeObjectURL(clipUrl);
 clip=null;clipUrl=null;frameTime=null;el('player').hidden=true;el('next').hidden=false;
}
function readFrame(media,width,height){
 surface.width=Math.min(640,width);surface.height=Math.max(1,Math.round(height*surface.width/width));
 ctx.drawImage(media,0,0,surface.width,surface.height);
 return ctx.getImageData(0,0,surface.width,surface.height);
}
async function load(){
 const token=++generation;
 source=null;selection=null;start=null;locked=false;regions=[];redraw();
 if(!files[index])return;
 try{
  const bitmap=await createImageBitmap(files[index]);
  try{
   if(token!==generation)return;
   source=readFrame(bitmap,bitmap.width,bitmap.height);
   el('msg').textContent=(index+1)+' / '+files.length+' • '+files[index].name;
  }finally{bitmap.close();}
 }catch{if(token===generation)el('msg').textContent='تعذّر فتح الصورة. يمكنك تجاوزها.';}
}
function point(event){
 const r=surface.getBoundingClientRect();
 return {x:Math.max(0,Math.min(surface.width,Math.round((event.clientX-r.left)*surface.width/r.width))),y:Math.max(0,Math.min(surface.height,Math.round((event.clientY-r.top)*surface.height/r.height)))};
}
function box(end){return {label:el('label').value,x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(start.x-end.x),h:Math.abs(start.y-end.y)};}
surface.onpointerdown=e=>{if(source&&!locked&&e.isPrimary){start=point(e);surface.setPointerCapture(e.pointerId);}};
surface.onpointermove=e=>{if(start&&e.isPrimary)redraw(box(point(e)));};
surface.onpointerup=e=>{if(!start||!e.isPrimary)return;const result=box(point(e));start=null;if(result.w&&result.h)regions.push(result);redraw();};
surface.onpointercancel=()=>{start=null;redraw();};
el('undo').onclick=()=>{if(!locked){regions.pop();redraw();}};
function canReplaceSource(input){
 if(rows.length===exportedRows && (!source || locked))return true;
 if(confirm('فيه مراجعة لم تُحفظ. هل تريد فتح مصدر جديد؟'))return true;
 input.value='';
 return false;
}
el('files').onchange=e=>{if(!e.target.files.length||!canReplaceSource(e.target))return;clearClip();el('clip').value='';files=Array.from(e.target.files);index=0;rows=[];exportedRows=0;el('summary').textContent='';load();};
el('clip').onchange=e=>{
 const file=e.target.files[0];if(!file||!canReplaceSource(e.target))return;
 clearClip();files=[];index=0;rows=[];exportedRows=0;load();
 clip=file;clipUrl=URL.createObjectURL(file);video.src=clipUrl;
 el('files').value='';el('summary').textContent='';el('player').hidden=false;el('next').hidden=true;
 el('msg').textContent='اختر وقتًا في الفيديو ثم اضغط اختيار الإطار.';
};
video.onerror=()=>{if(clip)el('msg').textContent='تعذّر فتح الفيديو. جرّب صيغة يدعمها متصفحك.';};
el('freeze').onclick=()=>{
 if(!clip)return;
 if(source&&!locked){el('msg').textContent='اعتمد اللقطة الحالية أولًا.';return;}
 video.pause();
 if(video.seeking||video.readyState<2||!video.videoWidth){el('msg').textContent='انتظر اكتمال تحميل الإطار.';return;}
 const seconds=video.currentTime;
 if(rows.some(row=>row.timeSeconds===seconds)){el('msg').textContent='سبق تقييم هذا التوقيت.';return;}
 try{source=readFrame(video,video.videoWidth,video.videoHeight);}
 catch{source=null;el('msg').textContent='تعذرت قراءة الإطار.';return;}
 frameTime=seconds;selection=null;start=null;regions=[];locked=false;redraw();
 el('msg').textContent=clip.name+' • '+seconds.toFixed(3)+' ث';
};
el('score').onclick=()=>{
 if(!source||locked||start)return;
 const color=el('reviewColor').value;
 const rgb=[1,3,5].map(offset=>Number.parseInt(color.slice(offset,offset+2),16));
 const result=new ColorTracker().process(source.data,source.width,source.height,{...reviewOptions,rgb},0);
 selection=result.target?{x:result.target.x,y:result.target.y}:null;
 const verdict=classify(selection,regions);
 rows.push({...(clip?{file:clip.name,timeSeconds:frameTime}:{file:files[index].name}),width:source.width,height:source.height,regions:[...regions],color,selection,verdict,matchingPixels:result.matched,candidateCount:result.components.length});
 const total=reviewSummary(rows);el('summary').textContent='لقطات فيها عدو: '+total.enemyFrames+'، منها باختيار عدو مؤكد: '+total.enemySelected+' | اختيارات الزميل: '+total.allySelected+' | الواجهة: '+total.hudSelected+' | الخلفية: '+total.backgroundSelected+' | لقطات عدو بلا اختيار صحيح: '+total.enemyFramesWithoutConfirmedHit+' | اختيارات متداخلة تحتاج مراجعة: '+total.ambiguousSelections+' | اختيارات فريق غير محسوم: '+total.unknownSelected+' | امتناع غير محسوم: '+total.unresolvedAbstentions;
 locked=true;redraw();el('msg').textContent='نتيجة اختيار الكاشف: '+names[verdict]+' • بكسلات مطابقة: '+result.matched+' • مناطق مرشحة: '+result.components.length;
};
el('next').onclick=()=>{if(source&&!locked){el('msg').textContent='اعتمد اللقطة أولًا.';return;}if(index+1<files.length){index++;load();}else el('msg').textContent='انتهت اللقطات. يمكنك تنزيل التقرير.';};
el('save').onclick=()=>{
 if(!rows.length)return;
 const counts={};for(const row of rows)counts[row.verdict]=(counts[row.verdict]||0)+1;
 const url=URL.createObjectURL(new Blob([JSON.stringify({detector:'single-color-v0.29',evaluation:{mode:'independent-frames',options:reviewOptions},counts,summary:reviewSummary(rows),rows},null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='dark-review.json';a.click();exportedRows=rows.length;setTimeout(()=>URL.revokeObjectURL(url),1000);
};
