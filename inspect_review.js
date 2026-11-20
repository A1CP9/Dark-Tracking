// Replay labeled video frames and count detector evidence before target selection.
'use strict';
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const {ColorTracker} = require('./tracker');
const [reportPath, videoPath] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const videoName = require('node:path').basename(videoPath);
const rows = report.rows.filter(row => row.file === videoName && Number.isFinite(row.timeSeconds));
if (!rows.length) throw Error('No matching video annotations');
const summary = {frames: rows.length, enemyFrames: 0, withMatchingPixels: 0, withCandidateCenter: 0};
for (const row of rows) {
  const boxes = row.regions.filter(box => box.label === 'enemy');
  if (!boxes.length) continue;
  summary.enemyFrames++;
  const {width, height} = row;
  const result = spawnSync('ffmpeg', ['-v','error','-ss',String(row.timeSeconds),'-i',videoPath,
    '-frames:v','1','-vf',`scale=${width}:${height}`,'-f','rawvideo','-pix_fmt','rgba','pipe:1'],
    {maxBuffer: width * height * 4 + 65536});
  if (result.status !== 0 || result.stdout.length !== width * height * 4) throw Error('Frame decoding failed at ' + row.timeSeconds);
  const rgb = row.color.slice(1).match(/../g).map(pair => parseInt(pair,16));
  const options = {...report.evaluation.options,rgb};
  const inside = (x,y) => boxes.some(b => x >= b.x && x < b.x+b.w && y >= b.y && y < b.y+b.h);
  const frame = result.stdout;
  const observed = new ColorTracker().process(frame,width,height,options);
  if (observed.components.some(c => inside(c.x,c.y))) summary.withCandidateCenter++;
  const match = boxes.some(b => {
    for (let y=Math.max(0,Math.ceil(b.y)); y<Math.min(height,b.y+b.h); y++) {
      for (let x=Math.max(0,Math.ceil(b.x)); x<Math.min(width,b.x+b.w); x++) {
        const i=(y*width+x)*4;
        if (rgb.every((v,k) => Math.abs(frame[i+k]-v)<=options.tolerance)) return true;
      }
    }
    return false;
  });
  if (match) summary.withMatchingPixels++;
}
console.log(JSON.stringify(summary,null,2));
