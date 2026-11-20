const {evaluate}=require('./evaluate_samples');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const fs=require('node:fs');
 const os=require('node:os');
 const {execFileSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tracking-sequence-'));
 try {
  const clip=path.join(dir,'sequence.mkv');
  const width=64,height=24;
  const raw=Buffer.alloc(width*height*3*2);
  function marker(frame,x){
   for(let y=10;y<14;y++)for(let i=x;i<x+4;i++){
    const offset=((frame*height+y)*width+i)*3;
    raw[offset]=255;
    raw[offset+2]=10;
   }
  }
  marker(0,6);marker(1,7);marker(1,31);
  execFileSync('ffmpeg',['-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','64x24',
   '-r','10','-i','pipe:0','-c:v','ffv1',clip],{input:raw});
  const regions=[{label:'enemy',x:5,y:9,w:8,h:6}];
  const manifest={width,height,fps:'10/1',frames:[regions,[...regions,{label:'hud',x:30,y:9,w:6,h:6}]]};
  assert.deepEqual(await evaluate(clip,manifest),{enemy:2});
  assert.deepEqual(await evaluate(clip,{...manifest,options:{maxGap:50}}),{enemy:1,hud:1});
  console.log('PASS temporal continuity and expiry on encoded sequence with centered distractor');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
 const frames=Array.from({length:90},(_,i)=> i<30?
  [{label:'enemy',x:15+i,y:30,w:12,h:14}]:i<60?[]:[{label:'hud',x:70,y:30,w:12,h:14}]);
 const manifest={width:160,height:90,fps:15,frames,options:{rgb:[255,0,10],requireSingle:true,tolerance:45,minArea:12}};
 const clip=path.join(__dirname,'ambiguity.mp4');
 assert.deepEqual(await evaluate(clip,manifest),{enemy:30,correctAbstention:30,hud:30});
 const uncertain = frames.map((boxes,i) => i<30 ? boxes.map(b=>({...b,label:'unknown'})) :
  i<60 ? [{label:'unknown',x:10,y:8,w:15,h:14}] : boxes);
 assert.deepEqual(await evaluate(clip,{...manifest,frames:uncertain}),
  {unknown:30,unresolvedAbstention:30,hud:30});
 console.log('PASS uncertain-role manifest: 30 unknown picks, 30 unresolved abstentions, 30 HUD picks');
 await assert.rejects(evaluate(clip,{...manifest,frames:[...frames,[]]}),/sample count/);
 await assert.rejects(evaluate(clip,{...manifest,frames:frames.slice(0,-1)}),/sample count/);
 assert.deepEqual(await evaluate(clip,{...manifest,coverage:'prefix',frames:frames.slice(0,30)}),{enemy:30});
 for(const fps of ['0','1/0'])await assert.rejects(evaluate(clip,{...manifest,fps}),/sample rate/);
 await assert.rejects(evaluate(clip,{...manifest,frames:[[{label:'enemy',x:159,y:0,w:2,h:1}]]}),/sample 1/);
 console.log('PASS short manifest rejected, explicit prefix evaluated, rate and annotation geometry checked');
 console.log('PASS 90 encoded frames scored; excess annotation rejected');
})().catch(error=>{console.error(error);process.exitCode=1;});
