// Two original pixel glyphs used only in the local arena's synthetic HUD.
(function(root){
 const icons=['111101000111','100111101001'];
 const names=['تدريب A','قنص تدريبي B'];
 function identify(pixels){
  const sample=Array.from({length:12},(_,i)=>pixels[((2+Math.floor(i/4))*160+2+i%4)*4+1]>127?'1':'0').join('');
  const distances=icons.map(icon=>[...icon].filter((bit,i)=>bit!==sample[i]).length);
  const closest=Math.min(...distances);
  return closest<=1 && distances.indexOf(closest)===distances.lastIndexOf(closest)?distances.indexOf(closest):-1;
 }
 function hud(pixels,slot){
  [...icons[slot]].forEach((bit,i)=>{pixels[((2+Math.floor(i/4))*160+2+i%4)*4+1]=bit==='1'?255:0;});
 }
 class Kit{
  constructor(){this.slot=0;this.shots=0;this.last=-Infinity;this.reset();}
  reset(){this.held=false;this.swapHeld=false;this.returnAt=null;this.releaseUntil=-Infinity;}
  advance(t,input,options,pixels){
   if(this.returnAt!==null && t>=this.returnAt){this.slot^=1;this.returnAt=null;}
   if(input.swap&&!this.swapHeld&&this.returnAt===null){
    this.slot^=1;if(options.yy)this.returnAt=t+100;
   }
   this.swapHeld=input.swap;
   hud(pixels,this.slot);
   const detected=identify(pixels);
   const fire=input.fire&&(options.rapid||!this.held)&&t-this.last>=(this.slot?350:100);
   this.held=input.fire;
   let x=0,y=0;
   if(fire){
    this.shots++;this.last=t;
    const kick=slot=>[(this.shots%2?1:-1)*(slot?3:1),slot?-5:-2];
    [x,y]=kick(this.slot);
    if(options.stabilize && detected>=0){const [cx,cy]=kick(detected);x-=cx;y-=cy;}
    if(options.katm&&detected===1)this.releaseUntil=t+80;
   }
   return {x,y,ads:input.ads&&t>=this.releaseUntil,name:names[detected]||'غير معروف'};
  }
 }
 const api={Kit,hud,identify};
 if(typeof module==='object')module.exports=api;else root.ArenaKit=api;
})(globalThis);
