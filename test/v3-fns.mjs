// ФНС: патрули существуют и двигаются; проверка NPC; НДФЛ 13% при $2000; скриншот с мигалкой.
import { chromium } from 'playwright-core';
const URL = (process.env.GAME_URL || 'http://127.0.0.1:5333/') + '?test';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let failed = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'OK  ' : 'FAIL'} ${n} ${x}`); if (!c) failed++; };
await page.goto(URL);
await page.waitForFunction(() => window.__game);
await page.click('#play');
await page.evaluate(() => { window.__game.state.god = true; });

const pos = () => page.evaluate(() => window.__game.fns.cars.map((c) => [c.mesh.position.x, c.mesh.position.z]));
const p0 = await pos();
ok('патрули существуют', p0.length >= 3, `(${p0.length})`);
await page.waitForFunction((a) => window.__game.fns.cars.some((c, i) => Math.hypot(c.mesh.position.x - a[i][0], c.mesh.position.z - a[i][1]) > 5), p0, { timeout: 30000 });
ok('патрули двигаются', true);

// Проверка NPC-машины: ждём, пока какой-нибудь патруль перейдёт в 'check'.
await page.evaluate(() => { // ставим патруль на хвост NPC-машины
  const g = window.__game, n = g.traffic.cars[0], c = g.fns.cars[0];
  for (const o of g.fns.cars) o.cd = 999;
  c.cd = 0; c.i = n.i; c.j = n.j; c.dir = n.dir; c.t = Math.max(0, n.t - 0.3); c.speed = 10; c.state = 'patrol';
});
const gotCheck = await page.waitForFunction(() => window.__game.fns.cars.some((c) => c.state === 'check'), null, { timeout: 120000 }).then(() => true, () => false);
ok('патруль останавливает NPC на проверку', gotCheck);
if (gotCheck) {
  await page.evaluate(() => {
    const c = window.__game.fns.cars.find((c) => c.state === 'check');
    const p = c.mesh.position, T = window.__game.cam.position.constructor;
    window.__game.state.camOverride = { pos: new T(p.x + 7, 3.2, p.z + 5), look: new T(p.x, 1.2, p.z) };
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test/out/fns-check.png' });
}

// НДФЛ: $2000, инспектор рядом.
await page.evaluate(() => {
  const g = window.__game, f = g.fns;
  g.state.camOverride = null;
  for (const c of f.cars) { c.state = 'patrol'; c.cd = 999; }
  g.war.addMoney(-g.war.money); g.war.addMoney(2000);
  const car = f.cars[0], P = g.player.position;
  car.mesh.position.set(P.x + 6, 0, P.z); car.state = 'chase'; car.chaseT = 0;
  window.__money0 = g.war.money; window.__fee = null;
  const orig = g.war.addMoney.bind(g.war);
  g.war.addMoney = (v) => { if (v < 0 && window.__fee === null) { window.__fee = [g.war.money, v]; } orig(v); };
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'test/out/fns-chase.png' });
await page.waitForFunction(() => window.__fee, null, { timeout: 60000 });
const m = await page.evaluate(() => window.__fee);
ok('НДФЛ 13%', Math.abs(-m[1] - m[0] * 0.13) <= 1, `(было ${m[0]}, списано ${-m[1]})`);
ok('без ошибок', errors.length === 0, errors.join('|'));
await browser.close();
process.exit(failed ? 1 : 0);
