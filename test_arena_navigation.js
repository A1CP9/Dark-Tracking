const vm=require('node:vm'), fs=require('node:fs'), assert=require('node:assert/strict');
async function check(live,confirm,stopFails,saved,expected){
 const calls=[],nodes=new Map();
 const ctx={live,seq:0,token:null,location:{hash:'',assign:url=>calls.push(url)},
  get:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},
  release:()=>calls.push('release'),window:{confirm:()=>confirm},
  post:async action=>{calls.push(action);if(stopFails)throw Error();}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(__dirname+'/game-manager.js','utf8'),ctx);
 vm.runInContext('profileSaved=Promise.resolve('+saved+')',ctx);
 await ctx.get('openArena').onclick({preventDefault(){}});
 assert.deepEqual(calls,expected);
}
(async()=>{
 await check(false,true,false,true,['arena.html']);
 await check(false,true,false,false,[]);
 await check(true,false,false,true,[]);
 await check(true,true,true,true,['stop']);
 await check(true,true,false,true,['stop','release','arena.html']);
})().catch(e=>{console.error(e);process.exitCode=1;});
