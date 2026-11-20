const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const {ColorTracker} = require('./tracker');
const decoded = execFileSync('ffmpeg', ['-loglevel','error','-i',path.join(__dirname,'ambiguity.mp4'),'-f','rawvideo','-pix_fmt','rgba','-'], {maxBuffer: 8000000});
const stride = 160 * 90 * 4;
assert.equal(decoded.length, 90 * stride);
for (const requireSingle of [false,true]) {
 const tracker = new ColorTracker();
 const counts = [0,0,0];
 for (let i=0;i<90;i++) {
  const frame = decoded.subarray(i*stride,(i+1)*stride);
  const result = tracker.process(frame,160,90,{rgb:[255,0,10],requireSingle,minArea:12,tolerance:45},i*1000/15);
  if (result.target) counts[Math.floor(i/30)]++;
 }
 assert.deepEqual(counts, [30,requireSingle ? 0 : 30,30]);
 console.log({requireSingle, movingMarker:counts[0], twoMatches:counts[1], singleDecoy:counts[2]});
}
