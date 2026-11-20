// Coordinates are local to this 160x90 game. No external input/output.
(function(root){
 const Detector = typeof module === 'object' ? require('./tracker').ColorTracker : root.ColorTracker;
 class Arena {
  constructor(){
   this.width=160; this.height=90;
   this.pixels=new Uint8ClampedArray(160*90*4);
   this.camera={x:0,y:0}; this.playerX=0;
   this.detector=new Detector();this.rgb=[255,0,10];
  }
  paint(markers){
   this.pixels.fill(this.rgb.every(v=>v<=45)?255:0);
   for(let i=3;i<this.pixels.length;i+=4)this.pixels[i]=255;
   for(const marker of markers){
    const left=Math.round(marker.x-this.camera.x-this.playerX)-3;
    const top=Math.round(marker.y-this.camera.y)-3;
    for(let y=Math.max(0,top);y<Math.min(90,top+7);y++){
     for(let x=Math.max(0,left);x<Math.min(160,left+7);x++){
      const p=(160*y+x)*4;
      this.pixels.set(this.rgb,p);
     }
    }
   }
  }
  step(input,markers,assist,time,settings={}){
   this.playerX+=input.walk;
   this.camera.x+=input.dx;
   this.camera.y+=input.dy;
   this.paint(markers);
   const {target}=this.detector.process(this.pixels,160,90,{rgb:this.rgb,requireSingle:true,alpha:1},time);
   const aimY=target ? target.top+(settings.zone==='head'?0.15:0.5)*(target.height-1) : 0;
   const error=target ? Math.hypot(target.x-80,aimY-45) : null;
   const engaged=Boolean(assist && (!settings.adsOnly || input.ads) && target && error<=(settings.radius??Infinity));
   if(engaged){
    const follow=(settings.gain??0.25)*(error<5?(settings.lock??1):1);
    const gain=this.engaged ? follow : (settings.acquire??follow);
    this.camera.x+=(target.x-80)*gain;
    this.camera.y+=(aimY-45)*gain;
    this.paint(markers);
   }
   this.engaged=engaged;
   return error;
  }
 }
 if(typeof module==='object')module.exports=Arena;else root.Arena=Arena;
})(globalThis);
