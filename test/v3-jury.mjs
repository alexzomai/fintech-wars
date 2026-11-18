// Тест «фишек для жюри»: редактор тега, чит-коды, сторис, Афимолл.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5323/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const g = (fn, a) => page.evaluate(fn, a);
const shot = (n) => page.screenshot({ path: OUT + n + '.png' });

await page.goto(GAME_URL);
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
await page.waitForTimeout(1000);
await page.click('#play');
check(await page.locator('#tagEditor').isVisible(), 'по «Играть» открывается редактор тега');
check(await g(() => window.__game.state.mode === 'menu'), 'игра ещё не стартовала');
// Рисуем штрихи.
const box = await page.locator('#tagCanvas').boundingBox();
const stroke = async (pts) => {
  await page.mouse.move(box.x + pts[0][0] * box.width, box.y + pts[0][1] * box.height);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(box.x + x * box.width, box.y + y * box.height, { steps: 8 });
  await page.mouse.up();
};
await stroke([[.1, .8], [.3, .2], [.5, .8], [.7, .2], [.9, .8]]);
await page.click('#tagB2'); await page.click('.sw[data-color="#39ff14"]');
await stroke([[.1, .9], [.9, .9]]);
await page.click('.sw[data-color="#ff2bd6"]');
await stroke([[.2, .5], [.8, .5]]);
const painted = await g(() => { const c = document.getElementById('tagCanvas'); const d = c.getContext('2d').getImageData(0, 0, 128, 128).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
check(painted > 300, `на холсте есть штрихи (${painted} px)`);
await shot('jury-1-editor');
await page.click('#tagDone');
check(await g(() => window.__game.state.mode === 'play'), 'после «Готово» игра стартует');
check(await g(() => !!localStorage.getItem('fintech-wars-tag-v1')), 'рисунок сохранён в localStorage');
check(await g(() => { const G = window.__game.graffiti; return !!G.customTag && G.mats.green.map === G.customTag && G.customTag.image.tagName === 'CANVAS'; }), 'зелёный тег использует пользовательскую текстуру');
await g(() => { window.__game.state.god = true; });
// Камера на зелёный тег.
const tagPos = await g(() => { const t = window.__game.graffiti.tags.find((x) => x.owner === 'green'); return t ? { p: t.pos.toArray(), n: t.normal.toArray() } : null; });
check(!!tagPos, 'есть зелёный тег на стене');
await g((t) => { const T = window.__game.cam.position.constructor; const p = new T(...t.p), n = new T(...t.n); window.__game.state.camOverride = { pos: p.clone().addScaledVector(n, 5).setY(2.6), look: p }; }, tagPos);
await page.waitForTimeout(1500);
await shot('jury-2-wall-tag');
await g(() => { window.__game.state.camOverride = null; });

// Читы.
const money0 = await g(() => window.__game.war.money);
await page.keyboard.type('cashback', { delay: 40 });
await page.waitForTimeout(400);
const money1 = await g(() => window.__game.war.money);
check(money1 - money0 === 5000, `CASHBACK: +$5000 (${money0} → ${money1})`);
check((await page.locator('#subtitle.show').textContent()).includes('ЧИТ АКТИВИРОВАН'), 'субтитр «ЧИТ АКТИВИРОВАН»');
await shot('jury-3-cheat');
await page.keyboard.type('ipo', { delay: 40 });
check(await g(() => window.__game.war.money) - money1 === 1000, 'IPO: +$1000');
await page.keyboard.type('sanctions', { delay: 40 });
const p0 = await g(() => window.__game.traffic.cars.map((c) => c.mesh.position.x + c.mesh.position.z));
await page.waitForTimeout(800);
const p1 = await g(() => window.__game.traffic.cars.map((c) => c.mesh.position.x + c.mesh.position.z));
check(p0.every((v, i) => v === p1[i]), 'SANCTIONS: трафик стоит');
await page.keyboard.type('keyrate', { delay: 40 });
check(await g(() => window.__game.hud.ch.subtitle.log.some((t) => t.includes('Розыск сброшен'))), 'KEYRATE: субтитр');

// Сторис.
await page.keyboard.press('KeyP');
await page.waitForTimeout(1500);
check(await page.locator('#storyFrame').isVisible(), 'P: рамка сторис видна');
check(!(await page.locator('#hud').isVisible()), 'HUD спрятан');
await shot('jury-4-story');
const dl = page.waitForEvent('download', { timeout: 8000 });
await page.keyboard.press('Enter');
const d = await dl;
await d.saveAs(OUT + 'jury-story-saved.png');
check(d.suggestedFilename().endsWith('.png'), 'сторис скачана как PNG');
await page.keyboard.press('Escape');
check(!(await page.locator('#storyFrame').isVisible()), 'Esc закрывает сторис');

// Афимолл.
await g(() => { const G = window.__game; if (G.vehicle) G.toggleCar(); G.player.position.set(-27, 0, -2); });
await page.waitForTimeout(300);
await page.keyboard.press('KeyF');
check(await page.locator('#mallSign.show').count() === 1, 'F у таблички: коридор Афимолла');
await page.waitForTimeout(9000);
await shot('jury-5-mall');
check((await page.locator('#mallMsg').textContent()).includes('нет'), 'достижение «выход… нет»');
await page.keyboard.press('Escape');
check(await page.locator('#mallSign.show').count() === 0, 'Esc выходит из коридора');

// Перезагрузка: сохранённый тег подставляется.
await page.goto(GAME_URL);
await page.waitForFunction(() => window.__game && window.__game.graffiti.customTag, null, { timeout: 8000 }).then(() => check(true, 'после перезагрузки тег подставлен'), () => check(false, 'после перезагрузки тег подставлен'));
check(errors.length === 0, 'нет ошибок в консоли' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
await browser.close();
process.exit(failed ? 1 : 0);
