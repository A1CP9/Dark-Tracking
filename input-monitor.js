// Original local diagnostic only. No controller, network or OS input output.
(function(root){
 class InputMonitor {
  constructor(win,doc,onChange=()=>{}) {
   this.keys=new Set(); this.buttons=new Set(); this.active=false;
   this.motion={x:0,y:0}; this.reason='idle'; this.onChange=onChange; this.listeners=[];
   const bind=(target,type,fn)=>{target.addEventListener(type,fn);this.listeners.push([target,type,fn]);};
   bind(win,'keydown',e=>{if(!this.active)return;if(e.code==='Escape'){this.stop('escape');return;}this.keys.add(e.code);this.emit();});
   bind(win,'keyup',e=>{this.keys.delete(e.code);this.emit();});
   bind(win,'mousedown',e=>{if(this.active){this.buttons.add(e.button);this.emit();}});
   bind(win,'mouseup',e=>{this.buttons.delete(e.button);this.emit();});
   bind(win,'mousemove',e=>{if(this.active){this.motion={x:Number.isFinite(e.movementX)?e.movementX:0,y:Number.isFinite(e.movementY)?e.movementY:0};this.emit();}});
   bind(win,'blur',()=>this.stop('blur'));
   bind(win,'pagehide',()=>this.stop('pagehide'));
   bind(doc,'visibilitychange',()=>{if(doc.hidden)this.stop('hidden');});
   bind(doc,'pointerlockchange',()=>{if(!doc.pointerLockElement)this.stop('pointer-unlocked');});
  }
  snapshot(){return {active:this.active,keys:[...this.keys].sort(),buttons:[...this.buttons].sort(),motion:{...this.motion},reason:this.reason};}
  emit(){this.onChange(this.snapshot());}
  start(){this.clear();this.active=true;this.reason='started';this.emit();}
  clear(){this.keys.clear();this.buttons.clear();this.motion={x:0,y:0};}
  stop(reason='stopped'){this.clear();this.active=false;this.reason=reason;this.emit();}
  dispose(){this.stop('disposed');for(const [target,type,fn] of this.listeners)target.removeEventListener(type,fn);this.listeners=[];}
 }
 if(typeof module==='object'&&module.exports)module.exports=InputMonitor;
 else root.InputMonitor=InputMonitor;
})(globalThis);
