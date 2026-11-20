// Deterministic generated scenes, not game footage or a PS5 performance test.
const {performance}=require('node:perf_hooks');
const {ColorTracker}=require(process.argv[2]||'./tracker.js');
const W=160,H=90,N=120;
function rect(a,x,y,w,h,c){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)a.set([...c,255],4*(yy*W+xx));}
const cases=['motion','brightness_noise','occlusion','large_panel','panel_only','same_color_distractor'];
const summaries=[];
for(const name of cases){
 const tracker=new ColorTracker();let detected=0,expected=0,falsePositive=0,correct=0,sumError=0,maxError=0;const timings=[];
 for(let i=0;i<N;i++){
  const a=new Uint8ClampedArray(W*H*4),x=70+Math.round(Math.sin(i/20)*20),y=40;
  let truth={x:x+3.5,y:y+3.5};
  if(name==='large_panel'||name==='panel_only')rect(a,0,0,W,25,[255,0,10]);
  if(name==='panel_only'||(name==='occlusion'&&i>=40&&i<60))truth=null;
  if(truth)rect(a,x,y,8,8,name==='brightness_noise'?[225,15,15]:[255,0,10]);
  if(name==='brightness_noise')for(let j=0;j<20;j++)rect(a,(j*37+i*7)%W,(j*13+i*3)%H,1,1,[255,0,10]);
  // Same-color component near the central acquisition point; identity ambiguity is intentional.
  if(name==='same_color_distractor')rect(a,80,40,3,8,[255,0,10]);
  const begin=performance.now();const result=tracker.process(a,W,H,{rgb:[255,0,10],tolerance:40,minArea:8,alpha:1},i*33.34);timings.push(performance.now()-begin);
  if(truth)expected++;
  if(result.target){detected++;if(!truth)falsePositive++;else{const error=Math.hypot(result.target.x-truth.x,result.target.y-truth.y);sumError+=error;maxError=Math.max(maxError,error);if(error<=2)correct++;}}
 }
 timings.sort((a,b)=>a-b);
 summaries.push({scene:name,frames:N,expectedTargetFrames:expected,detectedFrames:detected,correctWithin2px:correct,falsePositiveFrames:falsePositive,meanErrorOnDetectedTargetFrames:expected&&detected-falsePositive?+(sumError/(detected-falsePositive)).toFixed(3):null,maxErrorPx:+maxError.toFixed(3),medianProcessingMs:+timings[Math.floor(N/2)].toFixed(3),p95ProcessingMs:+timings[Math.floor(N*.95)].toFixed(3)});
}
console.log(JSON.stringify({fixture:'synthetic-160x90-v1',environment:'Node.js CPU on development host; excludes decoding, browser, stream and input latency',summaries},null,2));
