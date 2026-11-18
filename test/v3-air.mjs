// v3-air: сел в вертолёт на понтоне, набрал высоту > 30 м, долетел до Евразии, сел на крышу, вышел.
// Плюс скриншоты: полёт над Сити, кукурузник с баннером, лайнер со следом.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test/out', { recursive: true });
const url = (process.env.GAME_URL || 'http://127.0.0.1:5329/').replace(/\/?$/, '/') + '?test';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(String(e)); console.log('ERR', String(e)); });
let fails = 0;
const ok = (cond, name) => { console.log(cond ? 'PASS' : 'FAIL', name); if (!cond) fails++; };
const T = { timeout: 240000, polling: 200 };

await page.goto(url, { timeout: 180000 });
await page.waitForFunction(() => window.__game?.aircraft, null, { timeout: 240000 });
await page.click('#play');
await page.waitForFunction(() => window.__game.state.mode === 'play' && window.__game.aircraft.ready, null, T);
await page.evaluate(() => {
  const g = window.__game;
  g.state.god = true;
  if (g.vehicle) g.toggleCar();
  const h = g.aircraft.helis[1]; // понтон на набережной
  g.player.position.set(h.position.x + 3, h.position.y, h.position.z);
});
await page.keyboard.press('KeyF');
await page.waitForFunction(() => !!window.__game.aircraft.flying, null, { timeout: 20000 }).catch(() => {});
ok(await page.evaluate(() => window.__game.aircraft.flying === window.__game.aircraft.helis[1]), 'F рядом с вертолётом — сел');

// Автопилот в странице: ставит флаги ввода на каждом кадре игры.
await page.evaluate(() => {
  const g = window.__game, a = g.aircraft, h = a.flying, pad = a.pads[0];
  const st = window.__ap = { phase: 'climb', maxY: 0, dist0: Math.hypot(pad.x - h.position.x, pad.z - h.position.z) };
  const loop = () => {
    const p = h.position, i = g.input;
    st.maxY = Math.max(st.maxY, p.y);
    const dx = pad.x - p.x, dz = pad.z - p.z, d = Math.hypot(dx, dz);
    i.up = i.down = i.left = i.right = i.brake = false; a.keys.down = false;
    const want = Math.atan2(dx, dz);
    const turn = Math.atan2(Math.sin(want - h.heading), Math.cos(want - h.heading));
    if (st.phase === 'climb') { i.brake = true; if (p.y > pad.y + 15) st.phase = 'cruise'; }
    else if (st.phase === 'cruise') {
      if (Math.abs(turn) > 0.08) i[turn > 0 ? 'left' : 'right'] = true;
      if (p.y < pad.y + 10) i.brake = true;
      const sp = Math.hypot(h.vel.x, h.vel.z);
      if (Math.abs(turn) < 0.5) { if (sp < Math.min(26, d * 0.5)) i.up = true; else if (sp > d * 0.6) i.down = true; }
      if (d < 4 && sp < 3) st.phase = 'land';
    } else if (st.phase === 'land') {
      const sp = Math.hypot(h.vel.x, h.vel.z);
      if (sp > 1.5) i.down = true;
      a.keys.down = true;
      if (h.landed) { st.phase = 'done'; }
    }
    if (st.phase !== 'done') requestAnimationFrame(loop);
  };
  loop();
});
await page.waitForFunction(() => window.__ap.maxY > 30, null, T).catch(() => {});
ok(await page.evaluate(() => window.__ap.maxY > 30), 'набрал высоту > 30 м');
await page.waitForFunction(() => window.__ap.phase === 'cruise' && window.__game.aircraft.flying.position.y > 100 && Math.hypot(window.__game.aircraft.flying.vel.x, window.__game.aircraft.flying.vel.z) > 10, null, T).catch(() => {});
await page.screenshot({ path: 'test/out/air-flight.png' });
await page.waitForFunction(() => window.__ap.phase === 'done', null, { timeout: 600000, polling: 300 }).catch(() => {});
const r = await page.evaluate(() => { const a = window.__game.aircraft, h = a.flying; return { y: h.position.y, roof: a.pads[0].y, d: Math.hypot(h.position.x - a.pads[0].x, h.position.z - a.pads[0].z), landed: h.landed, phase: window.__ap.phase }; });
console.log('посадка', JSON.stringify(r));
ok(r.landed && r.y > 100 && Math.abs(r.y - r.roof) < 1 && r.d < 6, 'сел на крышу Евразии');
await page.screenshot({ path: 'test/out/air-roof.png' });
await page.keyboard.press('KeyF');
await page.waitForFunction(() => !window.__game.aircraft.flying, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
const py = await page.evaluate(() => window.__game.player.position.y);
ok(!(await page.evaluate(() => !!window.__game.aircraft.flying)) && py > 100, `вышел на крышу (y=${py.toFixed(1)})`);

// Небо: кукурузник и лайнер крупным планом.
const shot = async (name, fn) => {
  await page.evaluate(fn);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `test/out/${name}.png` });
};
await shot('air-biplane', () => {
  const g = window.__game, b = g.aircraft.biplane.g, V = g.cam.position.constructor;
  const p = b.position.clone();
  const side = new V(-p.x, 0, -p.z).normalize().multiplyScalar(-1); // снаружи круга
  g.state.camOverride = { pos: p.clone().addScaledVector(side, 45).add(new V(0, 3, 0)), look: p.clone().add(new V(0, -1, 0)) };
  g.state.timeScale = 0.0001;
});
await shot('air-liner', () => {
  const g = window.__game, l = g.aircraft.liners[0].g, V = g.cam.position.constructor;
  g.state.camOverride = { pos: new V(l.position.x + 60, l.position.y - 40, l.position.z + 60), look: l.position.clone() };
});
ok(errors.length === 0, 'без ошибок в консоли');
await browser.close();
console.log(fails ? `FAILED ${fails}` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
