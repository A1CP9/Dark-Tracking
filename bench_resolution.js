const {performance}=require('node:perf_hooks');
const {ColorTracker}=require('./tracker');
for(const width of [640,480,320,240]){
 const height=Math.round(width*9/16), pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++) for(let x=0;x<width;x++){
  if(x/width>.35&&x/width<.43&&y/height>.25&&y/height<.42){
   pixels.set([255,0,10,255],4*(y*width+x));
  }
 }
 const durations=[],tracker=new ColorTracker();
 for(let i=0;i<150;i++){
  const start=performance.now();
  const result=tracker.process(pixels,width,height,{rgb:[255,0,10],requireSingle:true},i*33);
  if(i>=30)durations.push(performance.now()-start);
  if(!result.target)throw Error('missing marker');
 }
 durations.sort((a,b)=>a-b);
 console.log(width+'x'+height,'p50_ms',durations[59].toFixed(2),'p95_ms',durations[113].toFixed(2));
}
