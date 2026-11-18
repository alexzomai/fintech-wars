// Тест ветки v3-palych: рация, пролог, маркер задания → катсцена → «Ребрендинг» → «ЗАДАНИЕ ВЫПОЛНЕНО».
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5326/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const g = (fn, a) => page.evaluate(fn, a);
const wait = (fn, a, timeout = 15000) => page.waitForFunction(fn, a, { timeout }).then(() => true, () => false);
const shot = (n) => page.screenshot({ path: OUT + n + '.png' });

// 1. Пролог (без ?test, редактор тега пропускаем через localStorage-независимый путь: кликаем «Готово»).
await page.goto(GAME_URL + '?palych');
await wait(() => window.__game);
await page.click('#play');
if (await page.locator('#tagEditor').isVisible().catch(() => false)) await page.click('#tagDone');
check(await wait(() => document.querySelector('#palPrologue .card.show'), null, 5000), 'после редактора тега показывается пролог');
check(await g(() => window.__game.state.mode === 'menu'), 'во время пролога игра не идёт');
await shot('palych-1-prologue');
await page.keyboard.press('Space');
await wait(() => document.querySelector('#palPrologue .dots')?.textContent.startsWith('□■'), null, 3000);
check(await g(() => document.querySelector('#palPrologue .dots').textContent.startsWith('□■')), 'пробел — следующая карточка');
await page.click('#palSkip');
check(await wait(() => window.__game.state.mode === 'play', null, 5000), '«Пропустить» запускает игру');

// 2. Режим теста с заданиями.
await page.goto(GAME_URL + '?test&palych');
await wait(() => window.__game);
await page.click('#play');
check(await g(() => window.__game.state.mode === 'play' && !document.getElementById('palPrologue')), '?test: пролог пропущен');
await g(() => { window.__game.state.god = true; });
check(await wait(() => document.querySelector('#palRadio.show') && /команду/.test(document.querySelector('#palRadio .txt').textContent), null, 8000), 'рация: реплика Палыча на старте');
await shot('palych-2-radio');

// Вход в маркер (выходим из машины и ставим игрока в маркер).
await g(() => { const c = window.__game; if (c.vehicle) c.toggleCar(); });
await g(() => { const c = window.__game, m = c.palych.marker.position; c.player.position.set(m.x, 0, m.z); });
check(await wait(() => window.__game.palych.inCutscene, null, 5000), 'вход в маркер запускает катсцену');
await page.waitForTimeout(700);
const cs = await g(() => ({
  mode: window.__game.state.mode, cam: !!window.__game.state.camOverride,
  bars: getComputedStyle(document.querySelector('.palBars'), '::before').transform,
  sub: document.querySelector('.palBars .sub').textContent,
}));
check(cs.mode === 'cutscene' && cs.cam, `катсцена: управление отключено, камера переопределена (${cs.mode})`);
check(/none|matrix\(1, 0, 0, 1, 0, 0\)/.test(cs.bars), `чёрные полосы выехали (${cs.bars})`);
check(cs.sub.includes('Палыч'), `субтитры катсцены: «${cs.sub}»`);
await shot('palych-3-cutscene');
await page.keyboard.press('Space');
check(await wait(() => /Это не вандализм/.test(document.querySelector('.palBars .sub').textContent), null, 3000), 'пробел — следующая реплика катсцены');
check(await wait(() => !window.__game.palych.inCutscene && window.__game.state.mode === 'play' && !window.__game.state.camOverride, null, 30000), 'после катсцены управление и камера вернулись');
check(await g(() => window.__game.palych.missions.active?.id === 'rebrand'), 'выдано задание «Ребрендинг»');
check(await g(() => /Ребрендинг/.test(document.getElementById('help').textContent)), 'хелпбокс с заданием');

// Перекрашиваем 3 тега Алого-банка в «Меркурий и Око».
const money0 = await g(() => window.__game.war.money);
await g(() => {
  const c = window.__game, d = c.districts[1];
  c.graffiti.tags.filter((t) => t.d === d && t.owner === 'red').slice(0, 2).forEach((t) => c.graffiti.setTag(t, 'green'));
});
check(await g(() => /2\/3/.test(document.getElementById('help').textContent)), 'счётчик в хелпбоксе: 2/3');
await g(() => { const c = window.__game, d = c.districts[1]; const t = c.graffiti.tags.find((x) => x.d === d && x.owner === 'red'); c.graffiti.setTag(t, 'green'); });
check(await wait(() => document.querySelector('#passed.show'), null, 3000), '«ЗАДАНИЕ ВЫПОЛНЕНО!» на экране');
await page.waitForTimeout(500);
await shot('palych-4-passed');
check(await g((m0) => window.__game.war.money - m0 >= 500, money0), 'награда $500 начислена');
check(await wait(() => window.__game.palych.marker.visible, null, 8000), 'появился следующий маркер');
await page.waitForTimeout(300);
const mp = await g(() => window.__game.palych.marker.position.toArray());
await g((p) => { const T = window.__game.cam.position.constructor; window.__game.state.camOverride = { pos: new T(p[0] + 8, 4, p[2] + 8), look: new T(p[0], 1, p[2]) }; }, mp);
await page.waitForTimeout(800);
await shot('palych-5-marker');
await g(() => { window.__game.state.camOverride = null; });

check(errors.length === 0, `нет ошибок в консоли${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
