// Frame-space correction for a single in-game color marker.
function remoteLook(dx, dy, target, age, enabled, aiming, strength, width, height) {
  const clamp = value => Math.max(-1, Math.min(1, value));
  let x = dx / 30, y = dy / 30;
  if (enabled && aiming && target && age >= 0 && age < 150) {
    const gain = Math.max(0, Math.min(1, strength));
    x += gain * (target.x - width / 2) / (width / 2);
    y += gain * (target.y - height / 2) / (height / 2);
  }
  return [clamp(x), clamp(y)];
}
if (typeof module === 'object') module.exports = remoteLook;
