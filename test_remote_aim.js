const look=require('./remote-aim'),assert=require('node:assert/strict');
const point={x:480,y:90};
for(const [target,age,on,ads] of [[null,0,true,true],[point,150,true,true],[point,0,false,true],[point,0,true,false]])
 assert.deepEqual(look(3,0,target,age,on,ads,1,640,360),[.1,0]);
assert.deepEqual(look(0,0,point,20,true,true,1,640,360),[.5,-.5]);
assert.deepEqual(look(60,0,point,20,true,true,.5,640,360),[1,-.25]);
console.log('PASS manual look, opt-in ADS color correction, saturation and stale/absent detection');
