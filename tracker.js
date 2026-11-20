/* DARK TRACKING: original CPU color component tracker; no input injection. */
(function(root){
'use strict';
// Compare the actual component pixels with a filled diamond at the same scale.
function matchesDiamond(pixels, count, stride, left, right, top, bottom) {
 const width=right-left+1, height=bottom-top+1;
 if(Math.min(width,height)<5 || Math.min(width,height)/Math.max(width,height)<0.65)return false;
 const inside=(x,y)=>Math.abs(2*x-width+1)/width+Math.abs(2*y-height+1)/height<=1;
 let templateArea=0, intersection=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(inside(x,y))templateArea++;
 for(let i=0;i<count;i++){
  const p=pixels[i];
  if(inside(p%stride-left,Math.floor(p/stride)-top))intersection++;
 }
 return intersection/(templateArea+count-intersection)>=0.8;
}
class ColorTracker {
 static rgb(hex){
  return [1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16));
 }
 static bindColor(input,onChange){
  const key='darkTrackingColorV2';
  input.value='#ff000a';
  try{
   const saved=localStorage.getItem(key);
   if(/^#[0-9a-f]{6}$/i.test(saved))input.value=saved;
  }catch{}
  let token;
  try { token=sessionStorage.getItem('darkDesktopToken'); } catch {}
  let changed=false;
  let pending=Promise.resolve();
  const exchange=async data=>{
   const response=await fetch('/rp/color',{method:'POST',headers:{'Content-Type':'application/json','X-Dark-Session':token},body:JSON.stringify(data)});
   if(!response.ok)throw Error('تعذّر حفظ إعداد اللون.');
   return response.json();
  };
  if(token)exchange({}).then(({color})=>{
   if(!changed && /^#[0-9a-f]{6}$/i.test(color)){
    input.value=color;
    onChange?.();
   }
  }).catch(()=>{});
  input.oninput=()=>{
   changed=true;
   try{localStorage.setItem(key,input.value);}catch{}
   onChange?.();
  };
  input.onchange=()=>{
   changed=true;
   const color=input.value;
   if(token)pending=pending.then(()=>exchange({color})).catch(()=>{input.title='تعذّر حفظ اللون للفتح القادم.';});
  };
 }
 constructor(){this.reset();}
 reset(){this.point=null;this.lastTime=null;}
 process(rgba,w,h,opt={},time=0){
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||rgba.length!==w*h*4)throw Error('Invalid frame dimensions');
  const rgb=opt.rgb||[255,0,10], tolerance=Math.max(0,Math.min(255,opt.tolerance??45));
  const roi=Math.max(.1,Math.min(1,opt.roi??1));
  const minArea=Math.max(1,opt.minArea??8), maxGap=opt.maxGap??250;
  const maxAreaRatio=Math.max(.001,Math.min(1,opt.maxAreaRatio??.25));
  const maxArea=Math.floor(w*h*maxAreaRatio);
  if(this.lastTime!==null && (time-this.lastTime>maxGap||time<this.lastTime))this.point=null;
  this.lastTime=time;
  const x0=Math.floor(w*(1-roi)/2),x1=w-x0,y0=Math.floor(h*(1-roi)/2),y1=h-y0;
  if(this.mask?.length!==w*h){
   this.mask=new Uint8Array(w*h);
   this.queue=new Int32Array(w*h);
  } else this.mask.fill(0);
  const mask=this.mask,queue=this.queue;let matched=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   let n=y*w+x,i=n*4;
   if(Math.abs(rgba[i]-rgb[0])<=tolerance&&Math.abs(rgba[i+1]-rgb[1])<=tolerance&&Math.abs(rgba[i+2]-rgb[2])<=tolerance){mask[n]=1;matched++;}
  }
  const components=[];
  for(let n=0;n<mask.length;n++){
   if(mask[n]!==1)continue;
   let head=0,tail=1,sx=0,sy=0,left=w,right=0,top=h,bottom=0;queue[0]=n;mask[n]=2;
   while(head<tail){
    const p=queue[head++],x=p%w,y=Math.floor(p/w);sx+=x;sy+=y;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    const visit=q=>{if(mask[q]===1){mask[q]=2;queue[tail++]=q;}};
    if(x>0)visit(p-1);if(x+1<w)visit(p+1);if(y>0)visit(p-w);if(y+1<h)visit(p+w);
   }
   if(tail<minArea || tail>maxArea)continue;
   if(opt.shape==="diamond" && !matchesDiamond(queue,tail,w,left,right,top,bottom))continue;
   components.push({x:sx/tail,y:sy/tail,area:tail,left,top,width:right-left+1,height:bottom-top+1});
  }
  if (opt.requireSingle && components.length > 1) {
   this.point = null;
   return {target: null, components, matched};
  }
  // Prefer nearest component to previous observation, then frame center.
  const anchor=this.point||{x:w/2,y:h/2};
  components.sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y));
  const target=components[0]||null;
  if(!target){this.point=null;return {target:null,components,matched};}
  const alpha=Math.max(.01,Math.min(1,opt.alpha??.65));
  const point=this.point?{x:alpha*target.x+(1-alpha)*this.point.x,y:alpha*target.y+(1-alpha)*this.point.y}:{x:target.x,y:target.y};
  this.point=point;
  return {target:{...target,smoothedX:point.x,smoothedY:point.y},components,matched};
 }
}
if(typeof module!=='undefined')module.exports={ColorTracker};else root.ColorTracker=ColorTracker;
})(globalThis);
