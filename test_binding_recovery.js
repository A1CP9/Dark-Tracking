'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/remote.js', 'utf8');
async function check(failedRoute) {
  const nodes = new Map();
  const writes = [];
  let fail = true;
  function element() {
    return {children: [], append(...items) { this.children.push(...items); }, add() {}, getContext() { return {}; }};
  }
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, element());
      return nodes.get(id);
    },
    createElement: element
  };
  const ctx = vm.createContext({
    document, window: {}, location: {hash: ''}, URLSearchParams, Option: class {},
    sessionStorage: {getItem: () => null}, localStorage: {getItem: () => null, setItem() {}},
    PadInput: require('./remote-pad'), ColorTracker: class { static bindColor() {} },
    ButtonEvents: class { clear() {} },
    async fetch(url, options) {
      const edit = JSON.parse(options.body);
      if (Object.keys(edit).length) writes.push(url);
      if (url === '/rp/' + failedRoute && fail) throw Error('read failed');
      return {ok: true, json: async () => ({map: null})};
    }
  });
  vm.runInContext(source, ctx);
  await vm.runInContext('Promise.all([setupBindings(), setupPad()])', ctx);
  const padFailed = failedRoute === 'pad-bindings';
  const failed = nodes.get(padFailed ? 'padBindings' : 'bindings');
  const healthy = nodes.get(padFailed ? 'bindings' : 'padBindings');
  assert.equal(failed.children.length, 0);
  assert.match(failed.textContent, /أعد فتح/);
  assert.equal(healthy.children.length, 10);
  const select = healthy.children[0].children.at(-1);
  select.value = padFailed ? 'KeyZ' : '8';
  select.onchange();
  await vm.runInContext(padFailed ? 'pendingSave' : 'padSave', ctx);
  assert.deepEqual(writes, ['/rp/' + (padFailed ? 'bindings' : 'pad-bindings')]);
  fail = false;
  await vm.runInContext(padFailed ? 'setupPad()' : 'setupBindings()', ctx);
  assert.equal(failed.children.length, 10);
}
(async () => { await check('bindings'); await check('pad-bindings'); })().catch(error => {
  console.error(error); process.exitCode = 1;
});
