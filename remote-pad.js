'use strict';
const PadInput=(()=>{
 const defaults={CROSS:0,CIRCLE:1,SQUARE:2,TRIANGLE:3,L1:4,R1:5,L2:6,R2:7,L3:10,R3:11};
 const neutral=()=>({left:[0,0],right:[0,0],buttons:[]});
 class Reader{
  reset(){this.identity=null;this.armed=false;}
  read(pad,map){
   if(!pad||pad.mapping!=='standard'||!pad.connected){this.reset();return neutral();}
   const id=pad.index+'|'+pad.id;
   if(id!==this.identity){this.identity=id;this.armed=false;}
   const axes=[0,1,2,3].map(i=>{const n=pad.axes[i];return Number.isFinite(n)&&Math.abs(n)>.12?Math.max(-1,Math.min(1,n)):0;});
   const buttons=Object.keys(defaults).filter(name=>pad.buttons[map[name]]?.pressed);
   if(!this.armed){
    this.armed=!buttons.length&&axes.every(n=>n===0);
    return neutral();
   }
   return {left:axes.slice(0,2),right:axes.slice(2),buttons};
  }
 }
 class DoubleSwap{
  constructor(){this.reset();}
  reset(){this.phase=0;this.deadline=0;this.held=false;}
  update(pressed,tap,enabled,now,delay=65){
   if(!enabled){this.reset();this.held=pressed;return pressed;}
   if(!this.phase && (tap || (pressed&&!this.held))){this.phase=1;this.deadline=now+delay;}
   this.held=pressed;
   if(this.phase && now>=this.deadline){
    this.phase=this.phase===3?0:this.phase+1;
    this.deadline=now+delay;
   }
   return this.phase===1||this.phase===3;
  }
 }
 class WeaponActions{
  constructor(){this.reset();}
  reset(){this.triggerHeld=false;this.pulse=false;this.nextPulse=0;this.releaseAimUntil=0;}
  apply(buttons,events,right,options,now){
   const fire=buttons.includes('R2'), aim=buttons.includes('L2');
   const tap=events.some(([key,down])=>key==='R2'&&down);
   let shot=tap || (fire&&!this.triggerHeld);
   let output=buttons.slice();
   if(options.rapid && fire){
    if(!this.triggerHeld || now>=this.nextPulse){
     this.pulse=!this.triggerHeld || !this.pulse;
     this.nextPulse=now+options.rapidPeriod/2;
     shot=this.pulse;
    }
    if(!this.pulse)output=output.filter(key=>key!=='R2');
   }else this.pulse=false;
   if(options.katm && aim && shot)this.releaseAimUntil=now+options.katmTime;
   if(options.katm && now<this.releaseAimUntil){
    output=output.filter(key=>key!=='L2');
    events=events.filter(([key])=>key!=='L2');
   }
   this.triggerHeld=fire;
   if(options.recoil && fire && aim)right=[right[0],Math.min(1,right[1]+options.recoilPower/100)];
   return {buttons:output,edges:events,right};
  }
 }
 return {defaults,Reader,neutral,DoubleSwap,WeaponActions};
})();
if(typeof module==='object')module.exports=PadInput;
