// Evaluate ordered, individually annotated samples without retaining the whole movie.
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const {ColorTracker} = require('./tracker');
const {classify} = require('./score');

async function evaluate(video, manifest) {
 const {frames,width,height,fps,options,coverage="full"} = manifest;
 if (!Array.isArray(frames) || !frames.length || !frames.every(Array.isArray))
  throw Error('Expected a nonempty list of frame annotations');
 if (![width,height].every(n=>Number.isInteger(n)&&n>0) || width*height>4096*2160)
  throw Error('Invalid analysis dimensions');
 if (!/^\d+(?:[./]\d+)?$/.test(String(fps))) throw Error('Invalid sample rate');
 if (coverage !== 'full' && coverage !== 'prefix') throw Error('Invalid coverage');
 const [rate, divisor='1'] = String(fps).split('/');
 if (!(Number(rate)>0 && Number(divisor)>0 && Number.isFinite(Number(rate)/Number(divisor))))
  throw Error('Invalid sample rate');
 const labels = new Set(['enemy','ally','hud','unknown']);
 for(const [index,regions] of frames.entries()){
  for(const region of regions){
   if(!region || !labels.has(region.label) || ![region.x,region.y,region.w,region.h].every(Number.isFinite)
      || region.x<0 || region.y<0 || region.w<=0 || region.h<=0
      || region.x+region.w>width || region.y+region.h>height)
    throw Error('Invalid annotated region at sample '+(index+1));
  }
 }
 const tracker = new ColorTracker();
 const sampleIntervalMs = 1000 * Number(divisor) / Number(rate);
 const limit = frames.length + Number(coverage === 'full');
 const args=['-v','error','-i',video,'-vf',`fps=${fps},scale=${width}:${height}`,
  '-frames:v',String(limit),'-f','rawvideo','-pix_fmt','rgba','-'];
 const decoder=spawn('ffmpeg',args,{stdio:['ignore','pipe','inherit']});
 const completion=new Promise(resolve=>{
  decoder.once('error',error=>resolve({error}));
  decoder.once('close',code=>resolve({code}));
 });
 const buffer=Buffer.alloc(width*height*4);
 const counts={};
 let filled=0, index=0;
 try {
  for await(const chunk of decoder.stdout){
   let pos=0;
   while(pos<chunk.length){
    const length=Math.min(buffer.length-filled,chunk.length-pos);
    chunk.copy(buffer,filled,pos,pos+length);
    filled+=length;pos+=length;
    if(filled!==buffer.length) continue;
    if(index===frames.length){
     index++;
     filled=0;
     continue;
    }
    const prediction=tracker.process(buffer,width,height,options,index * sampleIntervalMs);
    const label=classify(prediction.target,frames[index++]);
    counts[label]=(counts[label]||0)+1;
    filled=0;
   }
  }
 } finally {
  if(decoder.exitCode===null && !decoder.stdout.readableEnded) decoder.kill();
 }
 const {error,code}=await completion;
 if(error) throw error;
 if(code!==0) throw Error('FFmpeg failed');
 if(filled || index!==frames.length) throw Error('Decoded sample count differs from annotations');
 return counts;
}
if(require.main===module){
 const [video,path]=process.argv.slice(2);
 evaluate(video,JSON.parse(fs.readFileSync(path))).then(
  counts=>console.log(JSON.stringify(counts)),
  error=>{console.error(error.message);process.exitCode=1;}
 );
}
module.exports={classify,evaluate};
