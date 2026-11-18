// v3-neon: баннеры и голограммы штабов, медиафасад с новостями, неоновая ночь, голобилборды и QR,
// игровое время, карта паузы и стартовое меню. Скриншоты — в test/out/neon-*.png.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const URL_ = process.env.GAME_URL || 'http://127.0.0.1:5321/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/40[34]/.test(m.text())) errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const g = (fn, a) => page.evaluate(fn, a);
const shot = (n) => page.screenshot({ path: `${OUT}neon-${n}.png` });
const cam = (pos, look) => g(([p, l]) => { const T = window.__game.cam.position.constructor; window.__game.state.camOverride = { pos: new T(...p), look: new T(...l) }; }, [pos, look]);
const fps = () => g(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));

await page.goto(URL_);
await page.waitForFunction(() => window.__game?.neon);
await page.waitForTimeout(2500);
check(await page.isVisible('#saMenu'), 'стартовое меню видно');
check(await page.isVisible('#play'), 'кнопка #play в меню');
await page.keyboard.press('ArrowDown');
check(await g(() => document.querySelectorAll('#saMenu .sel').length === 1 && document.querySelector('#saMenu .sel').textContent.includes('Продолжить')), 'стрелка вниз выбирает «Продолжить»');
await page.keyboard.press('ArrowUp');
await shot('menu');

await page.click('#play');
await g(() => { window.__game.state.god = true; });
check(!(await page.isVisible('#saMenu')), 'меню скрылось после «Начать игру»');
check(await g(() => window.__game.state.mode === 'play'), 'режим play');
check(await g(() => window.__game.neon.hqs.length === 3), 'три штаба с баннерами и голограммами');

// Игровое время.
const t0 = await g(() => window.__game.neon.daytime.minutes);
await page.waitForTimeout(2000);
const t1 = await g(() => window.__game.neon.daytime.minutes);
check(t0 >= 18 * 60 + 30 && t1 - t0 > 1.2, `время идёт: ${t0.toFixed(1)} → ${t1.toFixed(1)} мин`);

// День: панорама Сити.
await cam([-150, 60, 230], [10, 60, -30]);
await page.waitForTimeout(1500);
await shot('day');
const fpsDay = await fps();

// Медиафасад с новостью: смена владельца района генерирует новость.
await g(() => window.__game.war && null);
await g(async () => { const m = await import('/src/city.js'); m.setOwner(window.__game.districts[2], 'green'); });
const head = await g(() => window.__game.neon.headlines[0]);
check(head.includes('ЗАХВАТИЛА ЭКСПОЦЕНТР'), `новость о захвате: ${head}`);
await g(() => window.__game.neon.news('Сбережёнка захватила Экспоцентр'));
await cam([27, 42, -40], [27, 42, -70]);
await page.waitForTimeout(1500);
await shot('facade');

// Ночь на N.
await cam([-150, 60, 230], [10, 60, -30]);
await page.keyboard.press('KeyN');
await page.waitForTimeout(3000);
check(await g(() => window.__game.neon.night && window.__game.neon.nightLevel > 0.95), 'N перематывает к неоновой ночи');
await shot('night');
await cam([-60, 6, 140], [0, 30, 0]);
await page.waitForTimeout(800);
await shot('night-street');
const fpsNight = await fps();
check(fpsNight >= 12, `FPS: день ${fpsDay.toFixed(1)}, ночь ${fpsNight.toFixed(1)}`);

// QR на голобилборде у набережной: должен сканироваться.
await page.keyboard.press('KeyN');
await page.waitForTimeout(3000);
const qb = await g(() => window.__game.neon.qrBoard);
await cam([qb.x, qb.y, qb.z - 16], [qb.x, qb.y, qb.z]);
await page.waitForTimeout(1200);
await shot('qr');
let decoded = '';
try { decoded = execFileSync('zbarimg', ['-q', '--raw', `${OUT}neon-qr.png`]).toString().trim(); } catch { /* не распознан */ }
check(decoded === 'https://sber-game.vercel.app', `QR сканируется: «${decoded}»`);

// Голобилборд ТТК.
await cam([-150, 18, -70], [-180, 18, -70]);
await page.waitForTimeout(800);
await shot('billboard');

// Карта паузы.
await g(() => { window.__game.state.camOverride = null; });
await page.keyboard.press('KeyM');
check(await g(() => window.__game.state.mode === 'pause') && await page.isVisible('#saPause'), 'M открывает карту паузы');
const m0 = await g(() => window.__game.neon.daytime.minutes);
await page.waitForTimeout(1000);
check(await g((m) => window.__game.neon.daytime.minutes === m, m0), 'время стоит на паузе');
await shot('pause-map');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
const st = await page.textContent('#saPause .stats');
check(st.includes('Охваты') && st.includes('Граффити'), 'вкладка статистики');
await shot('pause-stats');
await page.keyboard.press('Escape');
check(await g(() => window.__game.state.mode === 'play'), 'Esc возвращает в игру');

check(errors.length === 0, `ошибок нет${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `FAILED ${failed}` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
