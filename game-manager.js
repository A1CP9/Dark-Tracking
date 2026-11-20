'use strict';
function showPanel(selected){
 release();
 for(const id of ['library','profile','remotePanel'])get(id).hidden=id!==selected;
 if(selected==='profile'){
  get('navigateProfile').disabled=false;
  get('navigateRemote').disabled=false;
 }
 for(const [panel,id] of Object.entries({library:'showLibrary',profile:'navigateProfile',remotePanel:'navigateRemote'})){
  get(id).setAttribute('aria-current',panel===selected?'page':'false');
 }
 const heading=get(selected).querySelector('h1');
 heading?.focus({preventScroll:true});
 heading?.scrollIntoView({block:'nearest'});
}
const games={
 mw4:['chooseMW4','Modern Warfare 4','مودرن وورفير كود'],
 warzone:['chooseWarzone','Warzone','وارزون وورزون كود'],
 apex:['chooseApex','Apex Legends','أبيكس ايبكس ايبيكس'],
 fortnite:['chooseFortnite','Fortnite','فورتنايت فورت نايت']
};
let activeGame='mw4', switching=false;
let lastGame=null;
let recentWrite=Promise.resolve();
function showRecent(game){
 lastGame=game;
 get('resumeTitle').textContent=games[game][1];
 get('resumeGame').hidden=false;
}
function rememberGame(game){
 showRecent(game);
 recentWrite=recentWrite.then(()=>post('last-game',{game})).catch(()=>{});
 return recentWrite;
}
get('resumeGame').onclick=()=>lastGame && chooseGame(lastGame);
if(token)post('last-game').then(response=>response.json()).then(({game})=>{
 if(lastGame===null && Object.hasOwn(games,game))showRecent(game);
}).catch(()=>{});
function profilePost(action,data={}){
 return post(action,{game:activeGame,...data});
}
async function chooseGame(game){
 if(switching || openingArena)return;
 if(game===activeGame && !get('profileFields').disabled){showPanel('profile');return rememberGame(game);}
 switching=true;
 const status=get('libraryState');
 try{
  if(initialLoad)await initialLoad;
  if(presetPending)await presetPending;
  if(!await profileSaved){
   try{await profilePost('profile',{profile:readGameProfile()});profileSaved=Promise.resolve(true);}
   catch{status.textContent='تعذّر حفظ تعديلات اللعبة الحالية. اضغط بطاقة اللعبة للمحاولة مجددًا.';return;}
  }
  const {profile}=await (await post('profile',{game})).json();
  applyProfile(profile);
  activeGame=game;
  selectedSlot=1;
  slotRecords=[];
  get('gameTitle').textContent=games[game][1];
  get('profileState').textContent='';
  get('profileFields').disabled=false;
  profileSaved=Promise.resolve(true);
  get('editInput').onclick();
  status.textContent='';
  showPanel('profile');
  await rememberGame(game);
 }catch{status.textContent='تعذّر فتح ملف اللعبة. اضغط بطاقتها للمحاولة مجددًا.';}
 finally{switching=false;}
}
for(const [key,[button]] of Object.entries(games)){
 get(button).onclick=()=>chooseGame(key);
}
get('gameSearch').oninput=()=>{
 const term=get('gameSearch').value.trim().toLowerCase();
 let count=0;
 for(const [key,[button,name,aliases]] of Object.entries(games)){
  const visible=(key+' '+name+' '+aliases).toLowerCase().includes(term);
  get(button).hidden=!visible;
  if(visible)count++;
 }
 get('noGames').hidden=count>0;
};
get('backProfile').onclick=()=>showPanel('profile');
get('showLibrary').onclick=()=>showPanel('library');
get('navigateProfile').onclick=get('backProfile').onclick;
get('navigateRemote').onclick=get('openRemote').onclick=()=>showPanel('remotePanel');

const profileControls=['device','sensitivity','interval','doubleSwap','track','correct','gain','adsSensitivity','rapid','katm','recoil','rapidPeriod','recoilPower','katmTime','yyTime','region','tolerance'];
function readGameProfile(){
 return Object.fromEntries(profileControls.map(id=>{
  const control=get(id);
  if(control.type==='checkbox')return [id,control.checked];
  return [id,id==='device'?control.value:Number(control.value)];
 }));
}
function applyProfile(profile){
   for(const id of profileControls){
    if(get(id).type==='checkbox')get(id).checked=profile[id];
    else get(id).value=profile[id];
   }
   get('device').onchange();
 showProfileValues();
}
function showProfileValues(){
 get('summaryDevice').textContent=get('device').value==='pad'?'يد تحكم':'ماوس وكيبورد';
 get('summaryHip').textContent=get('sensitivity').value+'%';
 get('summaryAds').textContent=get('adsSensitivity').value+'%';
 get('adsValue').value=get('summaryAds').textContent;
 for(const [id,unit] of [['rapidPeriod',' ms'],['recoilPower','%'],['katmTime',' ms'],['yyTime',' ms'],['region','%'],['tolerance','']]){
  get(id).nextElementSibling.value=get(id).value+unit;
 }
 get('sensValue').value=get('sensitivity').value+'%';
 get('gain').nextElementSibling.value=get('gain').value+'%';
}
let profileSaved=Promise.resolve(true);
async function loadGameProfile(){
 const fields=get('profileFields'),status=get('profileState');
 fields.disabled=true;
 try{
  const {profile}=await (await profilePost('profile')).json();
  if(profile){
   applyProfile(profile);
  }
  showProfileValues();
  fields.disabled=false;
 }catch{
  status.textContent='تعذّرت قراءة ملف اللعبة. أعد فتح التطبيق لاستعادة إعداداتك.';
 }
 let revision=0;
 for(const id of profileControls){
  get(id).addEventListener('change',()=>{
   showProfileValues();
   const profile=readGameProfile(),edit=++revision;
   status.textContent='جارٍ الحفظ…';
   profileSaved=profileSaved.then(()=>profilePost('profile',{profile})).then(()=>{
    if(edit===revision)status.textContent='حُفظت إعدادات اللعبة.';
    return true;
   }).catch(()=>{if(edit===revision)status.textContent='تعذّر حفظ آخر تعديل.';return false;});
  });
 }
 for(const id of ['sensitivity','adsSensitivity','rapidPeriod','recoilPower','katmTime','yyTime','region','tolerance'])get(id).addEventListener('input',showProfileValues);
}
const returningGame=location.hash.slice(1);
if(Object.hasOwn(games,returningGame)){activeGame=returningGame;get('gameTitle').textContent=games[activeGame][1];showPanel('profile');}
const initialLoad=token && loadGameProfile().then(()=>{
 if(!get('profileFields').disabled){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   post('window-ready').catch(()=>{});
  }));
 }
});

let presetPending=null;
let openingArena=false;
get('openArena').onclick=async event=>{
 event.preventDefault();
 if(openingArena)return;
 openingArena=true;
 try{
  if(presetPending && !await presetPending)return;
  if(!await profileSaved)return;
 if(live){
  if(!window.confirm('إنهاء جلسة اللعب عن بُعد وفتح ساحة التدريب؟'))return;
  try{await post('stop');}
  catch{get('profileState').textContent='تعذّر تأكيد قطع الاتصال. حاول مرة أخرى.';return;}
  ++seq;
  live=false;
  release();
 }
 location.assign(activeGame==='mw4'?'arena.html':'arena.html#'+activeGame);
 }finally{openingArena=false;}
};

let selectedSlot=1;
let slotVersion=0;
let slotRecords=[];
function renderSlots(){
 for(let slot=1;slot<=3;slot++){
  const record=slotRecords[slot];
  get('slot'+slot).setAttribute('aria-pressed',String(slot===selectedSlot));
  get('slotName'+slot).textContent=record?.name || 'ضبطة '+slot;
  const profile=record?.profile;
  get('slotInfo'+slot).textContent=profile
   ? 'حركة '+profile.sensitivity+'% · تصويب '+profile.adsSensitivity+'%'
   : record?'فارغة':'جارٍ القراءة…';
 }
 get('presetName').value=slotRecords[selectedSlot]?.name || '';
 get('applyPreset').disabled=!slotRecords[selectedSlot]?.profile;
}
for(let slot=1;slot<=3;slot++){
 get('slot'+slot).onclick=()=>{selectedSlot=slot;renderSlots();};
}
async function refreshSlots(){
 const version=++slotVersion,game=activeGame;
 slotRecords=[];
 renderSlots();
 get('presetName').disabled=get('savePreset').disabled=true;
 try{
  const records=await Promise.all([1,2,3].map(async slot=>
   (await profilePost('preset',{slot})).json()));
  if(version!==slotVersion || game!==activeGame)return;
  slotRecords=[null,...records];
  renderSlots();
  get('presetName').disabled=get('savePreset').disabled=false;
 }catch{
  if(version!==slotVersion || game!==activeGame)return;
  for(let slot=1;slot<=3;slot++)get('slotInfo'+slot).textContent='تعذّرت القراءة';
  get('profileState').textContent='تعذّرت قراءة الضبطات. افتح قسم ضبطاتي للمحاولة مجددًا.';
 }
}
const sections={editInput:'inputPage',editBindings:'bindingsPage',editTracking:'trackingPage',editScripts:'scriptsPage',editPresets:'presetsPage'};
for(const selected of Object.keys(sections)){
 get(selected).onclick=()=>{
  for(const [button,panel] of Object.entries(sections)){
   get(panel).hidden=button!==selected;
   get(button).setAttribute('aria-pressed',String(button===selected));
  }
  if(selected==='editPresets')return refreshSlots();
 };
}

function usePreset(action){
 if(openingArena || get('profileFields').disabled)return;
 presetPending=performPreset(action).finally(()=>{presetPending=null;});
 return presetPending;
}
async function performPreset(action){
 const fields=get('profileFields'),status=get('profileState');
 fields.disabled=true;
 try{
  await profileSaved;
  const slot=action==='reset'?0:selectedSlot;
  const saved=await (await profilePost('preset',{slot})).json();
  if(action==='save'){
   if(saved.profile && !window.confirm('استبدال الإعدادات المحفوظة في ضبطة '+slot+'؟'))return;
   const name=get('presetName').value.trim();
   slotRecords[slot]=await (await profilePost('preset',{slot,name,profile:readGameProfile()})).json();
   renderSlots();
   status.textContent='حُفظت ضبطة '+slot+'.';
   return true;
  }
  if(!saved.profile){status.textContent='هذه الخانة فارغة. احفظ إعداداتك فيها أولًا.';return;}
  if(action==='reset' && !window.confirm('استعادة إعدادات اللعبة الافتراضية؟'))return;
  await profilePost('profile',{profile:saved.profile});
  applyProfile(saved.profile);
  profileSaved=Promise.resolve(true);
  status.textContent=slot?'تم تطبيق ضبطة '+slot+'.':'استُعيدت الإعدادات الافتراضية.';
  return true;
 }catch{status.textContent='تعذّرت العملية. أعد المحاولة.';}
 finally{fields.disabled=false;}
}
get('savePreset').onclick=()=>usePreset('save');
get('applyPreset').onclick=()=>usePreset('apply');
get('resetProfile').onclick=()=>usePreset('reset');
