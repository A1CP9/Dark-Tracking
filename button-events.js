// Edges retain quick taps between polls; the held-key snapshot remains authoritative.
class ButtonEvents {
  constructor(){this.clear();}
  clear(){this.events=[];this.overflow=false;}
  record(button,down,time){
    if(!button || this.overflow)return;
    if(this.events.length>=64){this.events=[];this.overflow=true;return;}
    this.events.push({button,down,time});
  }
  take(now){
    const recent=this.events.filter(event=>now-event.time<150).map(({button,down})=>[button,down]);
    this.clear();
    return recent;
  }
}
if(typeof module==='object')module.exports=ButtonEvents;
