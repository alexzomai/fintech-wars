// Надписи SA: мелкие (14–16 px при 1080p), по одному сообщению каждого типа, очередь. Скриншот в бою.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5322/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);

await page.goto(GAME_URL);
await page.waitForFunction(() => window.__game);
await page.waitForTimeout(800);
if (await page.locator('#play').isVisible()) await page.click('#play');
await page.waitForFunction(() => window.__game.state.mode === 'play', null, { timeout: 15000 }).catch(async () => { await page.click('#tagDone').catch(() => {}); });
await g(() => { window.__game.state.god = true; });

const px = await g(() => ['help', 'subtitle', 'zoneName', 'carName'].map((id) => parseFloat(getComputedStyle(document.getElementById(id)).fontSize)));
check(px.every((v) => v >= 13 && v <= 18), `размер надписей при 1080p: ${px.join(', ')} px`);

// Бой: район 1 с зелёными граффити, встаём в круг → волна.
await g(() => {
  const c = window.__game;
  if (c.vehicle) { c.vehicle.speed = 0; c.toggleCar(); }
  c.graffiti.inDistrict(c.districts[1]).forEach((t) => c.graffiti.setTag(t, 'green'));
  c.player.position.copy(c.districts[1].zone); c.player.position.x += 3;
});
await page.waitForFunction(() => { const c = window.__game; return c.war.capture && c.war.capture.waitT <= 0 && c.enemies.alive((e) => e.tag === c.war.capture.tag).length > 0; }, null, { timeout: 20000 });
// Поток событий за секунду.
await g(() => {
  const { hud } = window.__game;
  hud.toast('Граффити 3/5 · Охваты +5', '#2ecc59');
  hud.toast('Граффити 4/5 · Охваты +5', '#2ecc59');
  hud.alert('Тёплый-Банк атакует ваш район!', '#f5c518');
  hud.toast('Региональный директор уволен!', '#2ecc59');
  hud.help('Нажмите ~Tab~, чтобы открыть колесо оружия');
  hud.help('Держите ~ЛКМ~ на чужом теге');
  hud.showDistrict('Меркурий и Око', '#e8423a');
  hud.showDistrict('Экспоцентр', '#e8423a');
});
await page.waitForTimeout(300);
const st = await g(() => {
  const h = window.__game.hud;
  return { sub: h.ch.subtitle.queue.length, help: h.ch.help.queue.length, dist: h.ch.district.queue.length, subText: document.getElementById('subtitle').textContent,
    centered: [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.childElementCount === 0 && el.textContent.trim() && r.top > 200 && r.bottom < 880 && r.left > 500 && r.right < 1420; }).map((el) => el.id || el.className || el.tagName) };
});
check(st.sub >= 1 && st.sub <= 3, `субтитры в очереди: ${st.sub} (сейчас «${st.subText}»), дубль «Граффити» схлопнут`);
check(st.help >= 1 && st.help <= 3 && st.dist === 1, `хелпбокс и район тоже в очереди (${st.help}, ${st.dist})`);
check(st.centered.length === 0, `в центре экрана нет надписей${st.centered.length ? ': ' + st.centered.join(', ') : ''}`);
await page.screenshot({ path: OUT + 'v3-texts-battle.png' });
await page.waitForTimeout(2200);
const next = await g(() => document.getElementById('subtitle').textContent);
check(next !== st.subText && next.length > 0, `очередь сменилась: «${next}»`);
await page.screenshot({ path: OUT + 'v3-texts-battle2.png' });
check(errors.length === 0, `нет ошибок${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
