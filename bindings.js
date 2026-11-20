// Local arena controls. Each configurable input belongs to one action.
const ArenaBindings = (() => {
  const defaults = {left:'KeyA', right:'KeyD', fire:'Space', aim:'ShiftLeft', swap:'KeyQ'};
  const options = ['KeyA','KeyD','KeyQ','KeyE','KeyF','KeyJ','KeyL','KeyZ','KeyX',
    'ArrowLeft','ArrowRight','Space','ShiftLeft','ControlLeft','Mouse0','Mouse1','Mouse2'];
  function valid(mapping) {
    if (!mapping || typeof mapping !== 'object') return false;
    const values = Object.keys(defaults).map(key => mapping[key]);
    return values.every(value => options.includes(value)) && new Set(values).size === values.length;
  }
  function read(storage) {
    try {
      const saved = JSON.parse(storage.getItem('dark-arena-bindings'));
      if (valid(saved)) return saved;
    } catch {}
    return {...defaults};
  }
  function held(keys, binding) {
    return keys.has(binding) || (binding === 'ShiftLeft' && keys.has('ShiftRight'));
  }
  return {defaults,options,valid,read,held};
})();
if (typeof module === 'object') module.exports = ArenaBindings;
