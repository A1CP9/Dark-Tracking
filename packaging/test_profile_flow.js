/* Simulated profile UI events; sends actual profile requests to the local test server. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function exercise() {
  const [root, attempt] = process.argv.slice(2);
  const html = fs.readFileSync(path.join(root, 'remote.html'), 'utf8');
  const nodes = new Map();
  for (const match of html.matchAll(/<(\w+)\b([^>]*?\bid="([^"]+)"[^>]*)>/g)) {
    const [, tag, attrs, id] = match;
    const node = {
      type: attrs.match(/\btype="([^"]+)"/)?.[1], hidden: /\bhidden\b/.test(attrs),
      checked: /\bchecked\b/.test(attrs), value: attrs.match(/\bvalue="([^"]+)"/)?.[1] || '',
      setAttribute(k,v){this[k]=v;}, listeners: {}, nextElementSibling: {}, querySelector: () => null,
      addEventListener(event, callback) { this.listeners[event] = callback; },
    };
    if (tag === 'select') {
      const options = html.slice(match.index + match[0].length).split('</select>')[0];
      node.value = (options.match(/<option value="([^"]+)" selected/) || options.match(/<option value="([^"]+)"/))[1];
    }
    nodes.set(id, node);
  }
  const get = id => { assert.ok(nodes.has(id), id); return nodes.get(id); };
  const url = new URL(process.env.DT_LOCAL_TEST_URL);
  assert.equal(url.hostname, '127.0.0.1');
  const token = new URLSearchParams(url.hash.slice(1)).get('desktop');
  let beforePost = null;
  const post = async (action, data = {}) => {
    assert.ok(['profile','window-ready','preset','last-game'].includes(action));
    if (beforePost) await beforePost(action, data);
    const r = await fetch(url.origin + '/rp/' + action, {
      method: 'POST', headers: {Origin: url.origin, 'X-Dark-Session': token, 'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    assert.equal(r.status, 200);
    return r;
  };
  get('device').onchange = () => {};
  const destinations=[];
  const context = vm.createContext({get, post, token, window:{confirm:()=>true}, requestAnimationFrame:fn=>fn(), live:false, location:{hash:'',assign:url=>destinations.push(url)}, release() {}});
  await vm.runInContext(fs.readFileSync(path.join(root, 'game-manager.js'), 'utf8'), context);
  const timeout = Date.now() + 4000;
  while (get('profileFields').disabled && Date.now() < timeout) await new Promise(resolve => setTimeout(resolve, 20));
  assert(!get('library').hidden);
  assert(get('remotePanel').hidden);
  if(attempt==='1'){
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(get('resumeTitle').textContent,'Modern Warfare 4');
    await get('resumeGame').onclick();
  }else await get('chooseMW4').onclick();
  assert(!get('profile').hidden && get('library').hidden);
  assert.equal(get('profileFields').disabled, false);
  get('editScripts').onclick();
  assert(!get('scriptsPage').hidden && get('inputPage').hidden);
  get('editBindings').onclick();
  assert(!get('bindingsPage').hidden && get('scriptsPage').hidden);
  assert.equal(get('editBindings')['aria-pressed'], 'true');
  get('editTracking').onclick();
  assert(get('bindingsPage').hidden);
  assert(!get('trackingPage').hidden && get('scriptsPage').hidden);
  get('editInput').onclick();
  assert(!get('inputPage').hidden && get('trackingPage').hidden);
  if (attempt === '0') {
    for (const key of ['katm','rapid','recoil','doubleSwap']){
      get(key).checked=true;
      get(key).listeners.change();
    }
    for (const [key, value] of Object.entries({device:'pad', sensitivity:'200', adsSensitivity:'58', rapidPeriod:'225', region:'38', tolerance:'26', interval:'1'})) {
      get(key).value = value;
      get(key).listeners.change();
    }
    const end = Date.now() + 5000;
    while (get('profileState').textContent === 'جارٍ الحفظ…' && Date.now() < end) {
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.match(get('profileState').textContent, /حُفظت/);
  } else {
    assert.equal(get('device').value, 'pad');
    assert.equal(Number(get('sensitivity').value), 200);
    assert.equal(Number(get('interval').value), 1);
    assert.equal(Number(get('adsSensitivity').value),58);
    assert.equal(Number(get('region').value),38);
    assert.equal(Number(get('tolerance').value),26);
    assert.equal(Number(get('rapidPeriod').value),225);
    for(const key of ['katm','rapid','recoil','doubleSwap'])assert.equal(get(key).checked,true);
  }
  await get('editPresets').onclick();
  assert(!get('presetsPage').hidden && get('inputPage').hidden);
  assert.equal(get('applyPreset').disabled,attempt==='0');
  if(attempt==='0')get('presetName').value='قنص سريع';
  else assert.equal(get('slotName1').textContent,'قنص سريع');
  if(attempt==='0'){
    await get('savePreset').onclick();
    assert.match(get('profileState').textContent,/حُفظت/);
    assert.match(get('slotInfo1').textContent,/200%/);
    get('slot2').onclick();
    assert.equal(get('applyPreset').disabled,true);
    get('slot1').onclick();
    assert.equal(get('presetName').value,'قنص سريع');
    await get('resetProfile').onclick();
    assert.equal(Number(get('sensitivity').value),100);
  }
  await get('applyPreset').onclick();
  assert.equal(Number(get('sensitivity').value),200);
  get('openRemote').onclick();
  assert(!get('remotePanel').hidden && get('profile').hidden);
  get('backProfile').onclick();
  assert(get('remotePanel').hidden && !get('profile').hidden);
  for (const fail of [true, false]) {
    let signalStarted, resumeWrite;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const gate = new Promise(resolve => { resumeWrite = resolve; });
    beforePost = async (action, data) => {
      if (action === 'profile' && data.profile) {
        signalStarted();
        await gate;
        if (fail) throw new Error('Simulated save failure');
      }
    };
    const restore = get('resetProfile').onclick();
    await started;
    const event = {preventDefault() {}};
    const navigation = get('openArena').onclick(event);
    await get('openArena').onclick(event);
    assert.deepEqual(destinations, []);
    resumeWrite();
    await Promise.all([restore, navigation]);
    assert.deepEqual(destinations, fail ? [] : ['arena.html']);
    assert.equal(Number(get('sensitivity').value), fail ? 200 : 100);
    if (fail) assert.match(get('profileState').textContent, /تعذّرت/);
    assert.equal(get('profileFields').disabled, false);
  }
  beforePost = null;
  await get('applyPreset').onclick();
  get('showLibrary').onclick();
  get('gameSearch').value='وارزون';
  get('gameSearch').oninput();
  assert.equal(get('chooseMW4').hidden,true);
  assert.equal(get('chooseWarzone').hidden,false);
  get('gameSearch').value='xyz';
  get('gameSearch').oninput();
  assert.equal(get('noGames').hidden,false);
  get('gameSearch').value='';
  get('gameSearch').oninput();
  for(const [button,title,value] of [
    ['chooseWarzone','Warzone',67],['chooseApex','Apex Legends',82],['chooseFortnite','Fortnite',143]
  ]){
    await get(button).onclick();
    assert.equal(get('gameTitle').textContent,title);
    await get('editPresets').onclick();
    assert.equal(get('presetName').value,'');
    assert.equal(Number(get('sensitivity').value),attempt==='0'?100:value);
    if(attempt==='0'){
      await get('applyPreset').onclick();
      assert.match(get('profileState').textContent,/فارغة/);
      get('sensitivity').value=value;
      get('sensitivity').listeners.change();
      await get('savePreset').onclick();
    }else{
      await get('resetProfile').onclick();
      await get('applyPreset').onclick();
      assert.equal(Number(get('sensitivity').value),value);
    }
    get('showLibrary').onclick();
  }
  await get('chooseMW4').onclick();
  assert.equal(Number(get('sensitivity').value),200);
  console.log('PASS simulated profile UI + actual HTTP', attempt);
}

exercise().catch(err => { console.error(err); process.exitCode = 1; });
