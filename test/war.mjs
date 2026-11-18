// Тест союзных бригад: отряд едет из штаба, красит теги, дерётся, район зеленеет или отряд отступает.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5327/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);

await page.goto(GAME_URL + '?test');
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
await page.click('#play');
await g(() => { const c = window.__game; c.state.god = true; c.war.counterT = 1e9; c.war.aiT = 1e9; });
const info = await g(() => {
  const c = window.__game, sq = c.war.squads;
  const d = sq.pickTarget();
  sq.launchT = 1e9;
  sq.timeMul = 6; // ускоряем бригаду, FPS под нагрузкой низкий
  sq.launch(d, 'attack');
  window.__sq = sq.list[0];
  return { k: d.k, name: d.name, max: sq.max, sub: document.getElementById('subtitle').textContent };
});
check(info.max === 1, `1 отряд на 2 района (max ${info.max})`);
check(/штурмует/.test(info.sub), `субтитр: «${info.sub}»`);
await page.waitForFunction(() => window.__sq.state === 'fight', null, { timeout: 60000 }).catch(() => {});
check(await g(() => window.__sq.state === 'fight' && window.__sq.men.length >= 4), 'микроавтобус доехал, бригада высадилась');
// Камера на бригаду.
await g(() => {
  const c = window.__game, v = window.__sq.van.position;
  c.state.camOverride = { pos: v.clone().add(new c.cam.position.constructor(10, 7, 12)), look: v.clone() };
});
await page.waitForFunction(() => window.__game.graffiti.inDistrict(window.__sq.d).some((t) => t.owner === 'green'), null, { timeout: 90000 }).catch(() => {});
check(await g(() => window.__game.graffiti.inDistrict(window.__sq.d).some((t) => t.owner === 'green')), 'бригада перекрасила тег');
await page.screenshot({ path: OUT + 'war-squad-fight.png' });
await page.waitForFunction(() => window.__sq.state === 'leave', null, { timeout: 240000 }).catch(() => {});
const res = await g(() => ({ st: window.__sq.state, win: window.__sq.win, owner: window.__sq.d.owner, sub: document.getElementById('subtitle').textContent }));
check(res.st === 'leave' && (res.win ? res.owner === 'green' : /отступила/.test(res.sub)), `итог штурма: ${res.win ? 'район взят' : 'отступление'} («${res.sub}», владелец ${res.owner})`);
await g(() => { window.__game.state.camOverride = null; });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + 'war-squad-result.png' });
check(errors.length === 0, `нет ошибок${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
