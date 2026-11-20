const assert=require('node:assert/strict');
const {ColorTracker}=require('./tracker.js');
const w=100,h=60;function frame(rects=[]){const a=new Uint8ClampedArray(w*h*4);for(const [x,y,rw,rh,c=[255,0,10]] of rects)for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++)a.set([...c,255],(yy*w+xx)*4);return a;}
const t=new ColorTracker(),opt={minArea:4,tolerance:0,alpha:1};let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name);}
check('empty frame has no target',()=>assert.equal(t.process(frame(),w,h,opt,0).target,null));
check('centroid and bounds',()=>{const r=t.process(frame([[30,20,10,8]]),w,h,opt,10).target;assert.equal(r.x,34.5);assert.equal(r.y,23.5);assert.equal(r.area,80);assert.equal(r.width,10);});
check('color distractor rejected',()=>assert.equal(t.process(frame([[20,10,5,5,[0,255,0]]]),w,h,opt,20).target,null));
check('small isolated noise rejected',()=>assert.equal(t.process(frame([[10,10,1,1]]),w,h,opt,30).target,null));
check('ROI excludes edge',()=>assert.equal(t.process(frame([[0,0,5,5]]),w,h,{...opt,roi:.5},40).target,null));
check('components do not wrap rows',()=>{const r=t.process(frame([[99,0,1,1],[0,1,1,1]]),w,h,{...opt,minArea:1},50);assert.equal(r.components.length,2);});
check('smoothing and target loss reset',()=>{t.reset();t.process(frame([[20,20,4,4]]),w,h,opt,100);let r=t.process(frame([[30,20,4,4]]),w,h,{...opt,alpha:.5},110);assert.equal(r.target.smoothedX,26.5);t.process(frame(),w,h,opt,120);r=t.process(frame([[70,20,4,4]]),w,h,{...opt,alpha:.5},130);assert.equal(r.target.smoothedX,71.5);});
check('long gaps reset temporal state',()=>{const r=t.process(frame([[10,20,4,4]]),w,h,{...opt,alpha:.5},2000);assert.equal(r.target.smoothedX,11.5);});
check('RGB tolerance includes boundary',()=>{const r=t.process(frame([[20,20,4,4,[245,10,20]]]),w,h,{...opt,tolerance:10},2010);assert.equal(r.target.area,16);});
console.log(`${checks} tests passed`);
