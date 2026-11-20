const assert=require('node:assert/strict');
const {ColorTracker}=require('./tracker');
function frame(i,kind){
 const data=new Uint8ClampedArray(160*90*4);
 const radius=3+i%8, cx=25+i%95, cy=20+i%45;
 for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
  if(kind==='diamond' && Math.abs(x)+Math.abs(y)>radius)continue;
  if(kind==='bar' && Math.abs(y)>1)continue;
  const p=((cy+y)*160+cx+x)*4;
  data.set([240+i%16,8,10,255],p);
 }
 return data;
}
for(const kind of ['diamond','square','bar']){
 const counts={any:0,diamond:0};
 for(const shape of Object.keys(counts)){
  const tracker=new ColorTracker();
  for(let i=0;i<90;i++){
   const result=tracker.process(frame(i,kind),160,90,{rgb:[255,0,10],shape,tolerance:45,minArea:12,requireSingle:true},i*16);
   if(result.target)counts[shape]++;
  }
 }
 assert.equal(counts.any,90);
 assert.equal(counts.diamond,kind==='diamond'?90:0);
 console.log(kind,counts);
}
