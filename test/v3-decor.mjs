// [v3-decor] Декорации: скриншоты каждой крупной декорации, попадания (копилка, банкомат, дирижабль), FPS с декором и без.
// Запуск: flock /home/zomai/.cache/agent-tmp/sber-chromium.lock -c 'GAME_URL=http://127.0.0.1:5328/ node test/v3-decor.mjs'
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const url = new URL(process.env.GAME_URL || 'http://127.0.0.1:5328/');
url.searchParams.set('test', '1');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);

await page.goto(url.href);
await page.waitForFunction(() => window.__game && window.__decor);
await page.click('#play');
await page.waitForFunction(() => window.__game.state.mode === 'play');
await g(() => { window.__game.state.god = true; });
check(await g(() => window.__decor.root.children.length > 40), 'декорации построены');

// Ждём, пока отрисуется хотя бы n кадров (по событию, а не по таймеру).
const frames = (n) => g((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const view = async (name, pos, look, n = 4) => {
  await g(([p, l]) => { const T = window.__game.cam.position.constructor; window.__game.state.camOverride = { pos: new T(...p), look: new T(...l) }; }, [pos, look]);
  await frames(n);
  await page.screenshot({ path: `${OUT}decor-${name}.png` });
};

// Попадания: трассер в банкомат и копилку даёт деньги.
const money0 = await g(() => window.__game.war.money);
await g(() => { const d = window.__decor, fx = window.__game.fx; const a = d.atms[0]; fx.tracer(a.pos.clone().setY(5), a.pos.clone()); });
await g(() => { const d = window.__decor, fx = window.__game.fx, h = d.hittables[0]; fx.tracer(h.pos.clone().setY(9), h.pos.clone()); });
const money1 = await g(() => window.__game.war.money);
check(money1 > money0, `выстрел в банкомат и копилку даёт деньги (${money0} → ${money1})`);
check(await g(() => window.__decor.burst.items.some((i) => i.m.visible)), 'купюры и монеты летят');

// Скриншоты (кадр с полётом купюр — первым).
await view('atm-piggy', [-66, 6, -58], [-78, 1.5, -40]);
await view('arch-start', [-51, 5, -32], [-54, 8, -12]);
await view('piggy', [-73, 4.5, -50], [-81, 2.2, -42]);
await view('queue', [-56, 3.5, -18], [-65, 1.5, -28]);
await view('repair', [-30, 4, 2], [-36, 1, 11.5]);
await view('scooters', [-80, 4, -1], [-88, 1, -10]);
await view('rebrand', [-51, 4, -74], [-54, 5, -92]);
await view('board', [-15, 4.5, 2], [-18, 4.6, -9.5]);
await view('ticker', [-5, 22, 20], [27, 34, -26]);
await view('parking', [-54, 3.5, -71], [-62.4, 3.4, -73]);
await view('shops', [-46, 3, -48], [-30, 5, -70]);
await g(() => { (window.__game.vehicle || window.__game.player).position.set(-81, 0, 54); });
await view('holo', [-76, 3.5, 55], [-81, 4, 42.5], 6);
const bp = await g(() => window.__decor.big.blimp.position.toArray());
await view('blimp', [bp[0] * 0.55, 45, bp[2] * 0.55 + 20], bp);

// Дирижабль: 10 попаданий — ставка падает.
await g(() => { const d = window.__decor, fx = window.__game.fx, h = d.hittables.find((x) => x.seg); for (let k = 0; k < 12; k++) fx.tracer(h.pos.clone().add({ x: 0, y: -30, z: 0 }), h.pos.clone().add({ x: 0, y: 30, z: 0 })); });
await frames(3);
const blimp2 = await g(() => window.__decor.big.blimp.position.toArray());
await view('blimp-down', [blimp2[0] * 0.55, 45, blimp2[2] * 0.55 + 20], blimp2);

// Ребрендинг: ставим машину на полосу.
const rebr = await g(async () => {
  const G = window.__game;
  if (!G.vehicle) G.toggleCar();
  const v = G.vehicle; if (!v) return 'нет машины';
  let body; v.mesh.traverse((o) => { if (o.isMesh && o.material?.metalness === 0.3 && !body) body = o; });
  const c0 = body.material.color.getHex();
  v.position.set(-54, 0, -92); v.speed = 0;
  await new Promise((r) => { let k = 0; const f = () => (++k > 3 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  return c0 !== body.material.color.getHex() || G.state.wanted === 0 ? 'ok' : 'цвет не сменился';
});
check(rebr === 'ok', `ребрендинг перекрашивает машину (${rebr})`);

// FPS: одна и та же обзорная точка, декор включён/выключен, попеременно.
const fps = (on) => g(async (on) => {
  window.__decor.root.visible = on;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t0 = performance.now(); let k = 0;
  await new Promise((r) => { const f = () => (++k >= 30 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  return (k * 1000) / (performance.now() - t0);
}, on);
await g(() => { const T = window.__game.cam.position.constructor; window.__game.state.camOverride = { pos: new T(-51, 6, -40), look: new T(-60, 3, -10) }; });
const on = [], off = [];
for (let r = 0; r < 3; r++) { on.push(await fps(true)); off.push(await fps(false)); }
const med = (a) => a.sort((x, y) => x - y)[1];
const info = await g(() => { window.__decor.root.visible = true; const i = window.__game.renderer.info.render; return `${i.calls} draw calls, ${i.triangles} tris`; });
console.log(`FPS с декором ${med(on).toFixed(1)}, без ${med(off).toFixed(1)} (${info})`);
check(med(on) >= med(off) * 0.9, 'FPS просел не больше чем на 10%');

check(errors.length === 0, `нет ошибок страницы ${errors.join(' | ')}`);
await browser.close();
console.log(failed ? `FAILED ${failed}` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
