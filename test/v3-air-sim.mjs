// v3-air без браузера: полёт с понтона на крышу Евразии (заглушки DOM/canvas). Запуск: node test/v3-air-sim.mjs
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true });
const el = () => ({ width: 1, height: 1, getContext: () => ctx, style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} });
globalThis.document = { createElement: el, createElementNS: el };
globalThis.addEventListener = () => {};
const W = new URL('../src/', import.meta.url).href;
const THREE = await import(new URL('../node_modules/three/build/three.module.js', import.meta.url).href);
const { buildCity } = await import(W + 'city.js');
const { Aircraft } = await import(W + 'aircraft.js');
const scene = new THREE.Scene();
const { colliders, districts } = buildCity(scene);
const hud = { toast: (t) => console.log('toast', t), help() {}, subtitle() {}, showVehicle() {}, setHint() {}, setCrosshair() {}, setSpeed() {} };
const state = { mode: 'play' };
const player = { position: new THREE.Vector3(), mesh: { visible: true }, vy: 0 };
const a = new Aircraft({ scene, colliders, districts, hud, state, player });
const input = {};
a.update(0.016, input);
const h = a.helis[1], pad = a.pads[0];
console.log('pads', a.pads.map((p) => p.toArray().map((v) => +v.toFixed(1))), 'boxes', a.boxes.length);
for (let i = 0; i < 20; i++) a.update(0.05, input);
console.log('heli rest y', a.helis.map((x) => x.position.y.toFixed(2)), 'landed', a.helis.map((x) => x.landed));
player.position.copy(h.position).x += 3;
console.log('enter', a.tryEnter(player));
let phase = 'climb', maxY = 0, t = 0;
for (; t < 300 && phase !== 'done'; t += 0.05) {
  const p = h.position; maxY = Math.max(maxY, p.y);
  const dx = pad.x - p.x, dz = pad.z - p.z, d = Math.hypot(dx, dz);
  for (const k of ['up', 'down', 'left', 'right', 'brake']) input[k] = false; a.keys.down = false;
  const want = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - h.heading), Math.cos(want - h.heading));
  const sp = Math.hypot(h.vel.x, h.vel.z);
  if (phase === 'climb') { input.brake = true; if (p.y > pad.y + 15) phase = 'cruise'; }
  else if (phase === 'cruise') {
    if (Math.abs(turn) > 0.08) input[turn > 0 ? 'left' : 'right'] = true;
    if (p.y < pad.y + 10) input.brake = true;
    if (Math.abs(turn) < 0.5) { if (sp < Math.min(26, d * 0.5)) input.up = true; else if (sp > d * 0.6) input.down = true; }
    if (d < 4 && sp < 3) phase = 'land';
  } else if (phase === 'land') { if (sp > 1.5) input.down = true; a.keys.down = true; if (h.landed) phase = 'done'; }
  a.update(0.05, input);
}
console.log({ t: t.toFixed(1), phase, maxY: maxY.toFixed(1), y: h.position.y.toFixed(2), roof: pad.y.toFixed(2), d: Math.hypot(h.position.x - pad.x, h.position.z - pad.z).toFixed(2) });
console.log('exit', a.tryEnter(player), player.position.y.toFixed(1), !!a.flying);
const tc = colliders.find((c) => c.minX < pad.x && c.maxX > pad.x && c.minZ < pad.z && c.maxZ > pad.z && c.maxY > 50);
console.log('tower collider maxY', tc?.maxY);
// Таран башни сбоку: летим горизонтально в Федерацию на высоте 60.
const pass = phase === 'done' && maxY > 30 && Math.abs(h.position.y - pad.y) < 1 && !a.flying && player.position.y > 100;
console.log(pass ? 'ALL PASSED' : 'FAILED');
process.exit(pass ? 0 : 1);
