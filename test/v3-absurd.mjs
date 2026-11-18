// Тест «абсурда»: события рынка (events.trigger) и озвучка (voice.js).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5334/';
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

await page.goto(GAME_URL + '?test');
await page.waitForFunction(() => window.__game && window.__absurd, null, { timeout: 20000 });
await page.click('#play');
await g(() => {
  const c = window.__game;
  c.state.god = true;
  c.vehicle.speed = 0;
  c.toggleCar(); // пешком
  try { localStorage.removeItem('fintech-wars-voice-v1'); } catch {}
  window.__absurd.voice.toggle(true);
});
check(await g(() => !window.__game.vehicle), 'игрок пешком');
check(await g(() => window.__absurd.events.names.join() === 'inflation,rate,rain,swan'), 'четыре события');
check(await g(() => window.__absurd.events.nextIn >= 55 && window.__absurd.events.nextIn <= 90), 'первое событие через 60–90 с');
check(await g(() => window.__absurd.events.auto === false), 'в ?test события сами не стартуют');

// --- Озвучка ---
await g(() => window.__game.hud.subtitle('Палыч: Кредит одобрен, сынок!'));
check(await wait(() => window.__absurd.voice.log.some((l) => l.text === 'Кредит одобрен, сынок!' && l.pitch < 0.5)), 'реплика «Палыч: …» уходит в озвучку басом');
const n0 = await g(() => window.__absurd.voice.log.length);
await g(() => window.__game.hud.subtitle('Просто подсказка без имени'));
await page.waitForTimeout(300);
check(await g((n) => window.__absurd.voice.log.length === n, n0), 'обычный субтитр не озвучивается');
await page.keyboard.press('KeyV');
check(await g(() => window.__absurd.voice.enabled === false), 'V выключает озвучку');
check(await g(() => window.__absurd.voice.say('тест') === false), 'выключенная озвучка молчит');
await page.keyboard.press('KeyV');
check(await g(() => window.__absurd.voice.enabled === true), 'V включает обратно');
console.log('  голос ru-RU доступен:', await g(() => window.__absurd.voice.available));

// Камера перед игроком.
const camFront = (dist, h = 1.8, side = 0, lookY = 1.6) => g(([dist, h, side, lookY]) => {
  const c = window.__game, p = c.player.position, V = p.constructor, yaw = c.player.heading + side;
  c.state.camOverride = { pos: new V(p.x + Math.sin(yaw) * dist, p.y + h, p.z + Math.cos(yaw) * dist), look: new V(p.x, p.y + lookY, p.z) };
}, [dist, h, side, lookY]);

// --- Инфляция ---
await g(() => {
  const c = window.__game, p = c.player.position, V = p.constructor, f = new V(Math.sin(c.player.heading), 0, Math.cos(c.player.heading));
  // Пара «замёрзших» клиентов рядом с игроком, для кадра.
  for (const s of [-1, 1]) { const e = c.enemies.spawn(p.clone().addScaledVector(f, 3).add(new V(-f.z * s * 1.6, 0, f.x * s * 1.6)), s < 0 ? 'red' : 'yellow'); e.frozen = true; e.h.root.rotation.y = c.player.heading + Math.PI; }
  window.__absurd.events.trigger('inflation');
});
check(await wait(() => window.__game.hud.el.subtitle.textContent.includes('Инфляция')), 'заголовок «Инфляция» в субтитрах');
check(await wait(() => window.__absurd.voice.log.some((l) => l.text.includes('Инфляция'))), 'диктор озвучивает событие');
check(await wait(() => window.__game.player.h.head.scale.x > 2.2), 'голова игрока раздулась');
check(await g(() => window.__game.enemies.list.filter((e) => !e.dead).every((e) => e.h.head.scale.x > 2.2)), 'головы врагов раздулись');
await camFront(6, 2.4, Math.PI / 2 + 0.5, 1.8);
await page.waitForTimeout(400);
await shot('absurd-1-inflation');
await g(() => window.__absurd.events.stop());
check(await g(() => Math.abs(window.__game.player.h.head.scale.x - 1) < 1e-6), 'после события голова вернулась');

// --- Курс взлетел ---
await g(() => { window.__game.state.camOverride = null; window.__absurd.events.trigger('rate'); });
check(await wait(() => window.__game.player.gravityScale < 0.25), 'гравитация игрока ×0,2');
await g(() => {
  const pl = window.__game.player; window.__maxY = 0; pl.jump();
  const t = setInterval(() => { window.__maxY = Math.max(window.__maxY, pl.position.y); if (pl.grounded) clearInterval(t); }, 30);
});
check(await wait(() => window.__maxY > 4.5), 'прыжок выше 4,5 м');
console.log('  высота прыжка:', (await g(() => window.__maxY)).toFixed(1));
await g(() => window.__absurd.events.stop());
check(await g(() => window.__game.player.gravityScale === 1), 'гравитация вернулась');
await wait(() => window.__game.player.grounded, null, 20000);

// --- Денежный дождь ---
const money0 = await g(() => window.__game.war.money);
await g(() => window.__absurd.events.trigger('rain'));
check(await wait(() => window.__absurd.events.rain.bills.length > 40), 'с неба падают купюры');
// Одна купюра прямо на игрока — подбор.
await g(() => { const p = window.__game.player.position; window.__absurd.events.rain.bills.push({ x: p.x + 0.5, y: 1, z: p.z, rx: 0, ry: 0, rz: 0, sw: 0, ground: 0, life: 0 }); });
check(await wait((m) => window.__absurd.events.rain.collected > 0 && window.__game.war.money > m, money0), 'подбор купюры даёт $');
await page.waitForTimeout(2500);
await camFront(8, 1.6, 0.6, 4);
await page.waitForTimeout(400);
await shot('absurd-2-rain');
await g(() => window.__absurd.events.stop());

// --- Чёрный лебедь ---
const fr0 = await g(() => window.__game.enemies.list.map((e) => !!e.frozen).join());
await g(() => { window.__game.state.camOverride = null; window.__absurd.events.trigger('swan'); });
check(await g(() => !!window.__absurd.events.swan?.root.parent), 'лебедь в сцене');
check(await g(() => window.__game.enemies.list.filter((e) => !e.dead).every((e) => e.frozen)), 'враги замерли');
const tr0 = await g(() => window.__game.traffic.cars.map((c) => c.mesh.position.x + c.mesh.position.z).join());
await page.waitForTimeout(600);
check(await g((t) => window.__game.traffic.cars.map((c) => c.mesh.position.x + c.mesh.position.z).join() === t, tr0), 'трафик встал');
// Перематываем полёт к середине и смотрим снизу вверх.
await g(() => { const a = window.__absurd.events.active; a.t = a.dur * 0.47; });
await page.waitForTimeout(300);
await g(() => {
  const c = window.__game, p = c.player.position, s = window.__absurd.events.swan.root.position, V = p.constructor;
  const back = new V(p.x - s.x, 0, p.z - s.z).normalize();
  c.state.camOverride = { pos: new V(p.x + back.x * 14, 3, p.z + back.z * 14), look: s.clone().lerp(new V(p.x, 1.5, p.z), 0.35) };
});
await page.waitForTimeout(500);
await shot('absurd-3-swan');
await g(() => { window.__absurd.events.stop(); window.__game.state.camOverride = null; });
check(await g(() => !window.__absurd.events.swan.root.parent), 'лебедь улетел');
check(await g((f) => window.__game.enemies.list.map((e) => !!e.frozen).join() === f, fr0), 'после лебедя заморозка врагов как была');
check(await g(() => !window.__absurd.events.trigger('нет-такого')), 'неизвестное событие — false');
check(errors.length === 0, `нет ошибок в консоли${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `FAILED: ${failed}` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
