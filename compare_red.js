// Offline comparison on user-annotated video. Counts every reviewed frame.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {ColorTracker} = require('./tracker');
const {classify} = require('./score');
const [reportPath, videoPath] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(reportPath)).rows.filter(r =>
  r.file === path.basename(videoPath) && Number.isFinite(r.timeSeconds));
if (!rows.length) throw Error('No matching annotations');
const profiles = ['gameRed','darkRed','compactCentralRed'];
const results = Object.fromEntries(profiles.map(p=>[p,{}]));
for (const row of rows) {
  const {width,height,regions,timeSeconds} = row;
  const frame = execFileSync('ffmpeg',['-v','error','-ss',String(timeSeconds),'-i',videoPath,
    '-frames:v','1','-vf',`scale=${width}:${height}`,'-pix_fmt','rgba','-f','rawvideo','pipe:1'],
    {maxBuffer:width*height*4+65536});
  const mask = Buffer.alloc(frame.length);
  for(let i=0;i<frame.length;i+=4){
    const [r,g,b]=[frame[i],frame[i+1],frame[i+2]];
    if(r>=75 && r-Math.max(g,b)>=40 && Math.abs(g-b)<=35) mask[i]=255;
  }
  for(const profile of profiles){
    const baseline=profile==='gameRed';
    const compact=profile==='compactCentralRed';
    const options={rgb:baseline?[255,0,10]:[255,0,0],tolerance:baseline?45:0,minArea:compact?3:12,requireSingle:true};
    const detection=new ColorTracker().process(baseline?frame:mask,width,height,options);
    const candidates=compact?detection.components.filter(c=>
      c.x>width*.2 && c.x<width*.8 && c.y>height*.15 && c.y<height*.8 &&
      c.width<=width*.02 && c.height<=height*.03 &&
      c.width/c.height>=.5 && c.width/c.height<=2):detection.components;
    const verdict=classify(candidates.length===1?candidates[0]:null,regions);
    results[profile][verdict]=(results[profile][verdict]||0)+1;
  }
}
console.log(JSON.stringify({frames:rows.length,enemyFrames:rows.filter(r=>r.regions.some(b=>b.label==='enemy')).length,results},null,2));
