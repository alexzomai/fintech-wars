// Smoke-тест «Финтех-войн» в headless Chromium.
// Нужен запущенный dev-сервер (npm run dev) или GAME_URL.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5317/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/textures/')) errors.push(`${r.status()} ${r.url()}`); });

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
const shot = (name) => page.screenshot({ path: OUT + name + '.png' });
// Наводим камеру на точку (позиция камеры зависит от угла, поэтому пара итераций).
const aimAt = async (x, y, z) => {
  for (let i = 0; i < 3; i++) {
    await g(([x, y, z]) => {
      const c = window.__game, cam = c.cam;
      const dx = x - cam.position.x, dy = y - cam.position.y, dz = z - cam.position.z;
      c.aim(Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz)));
    }, [x, y, z]);
    await page.waitForTimeout(150);
  }
};

await page.goto(GAME_URL + '?test');
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
await page.waitForTimeout(1500);
await shot('0-menu');
await page.click('#play');
check(await g(() => window.__game.state.mode === 'play'), 'игра стартует по кнопке');
await g(() => { window.__game.state.god = true; }); // тест проверяет механики, а не выживаемость
await page.waitForTimeout(800);
await shot('1-start');

// Езда. Трафик рядом со стартом убираем, чтобы случайная NPC-машина не тормозила проверку.
await g(() => {
  const c = window.__game, near = (t) => t.mesh.position.distanceTo(c.vehicle.position) < 60;
  c.traffic.cars.filter(near).forEach((t) => { t.mesh.visible = false; });
  c.traffic.cars = c.traffic.cars.filter((t) => !near(t));
});
await hold('KeyW', 1500);
const sp = await g(() => window.__game.vehicle.speed);
check(sp > 6, `машина едет (${(sp * 3.6).toFixed(0)} км/ч)`);
await hold('Space', 1500);

// Трамплин: разгоняемся к первому трамплину — полёт, замедление, «ВИРУСНЫЙ РОЛИК».
await g(() => {
  const c = window.__game, r = c.stunts.ramps[0], v = c.vehicle;
  v.position.set(r.x - r.dir[0] * 14, 0, r.z - r.dir[1] * 14);
  v.heading = Math.atan2(r.dir[0], r.dir[1]);
  v.speed = 34;
});
await page.keyboard.down('KeyW'); // газ в пол, как живой игрок
await page.waitForFunction(() => window.__game.vehicle.airborne, null, { timeout: 8000 }).catch(() => {});
await page.keyboard.up('KeyW');
const air = await g(() => ({ air: window.__game.vehicle.airborne, ts: window.__game.state.timeScale, y: window.__game.vehicle.position.y }));
check(air.air && air.ts < 1, `трамплин: полёт с замедлением (y=${air.y.toFixed(1)}, timeScale=${air.ts})`);
await page.waitForTimeout(600);
await shot('1a-stunt-air');
await page.waitForFunction(() => window.__game.stunts.done > 0, null, { timeout: 15000 }).catch(() => {});
const st = await g(() => ({ done: window.__game.stunts.done, text: document.getElementById('stunt').textContent, ts: window.__game.state.timeScale }));
check(st.done === 1 && st.text.includes('ВИРУСНЫЙ РОЛИК') && st.ts === 1, `приземление: «${st.text}»`);
await page.waitForTimeout(300);
await shot('1b-stunt-landed');
await g(() => { window.__game.vehicle.speed = 0; });

// Выход и ходьба.
await g(() => { window.__game.vehicle.speed = 0; });
await page.keyboard.press('KeyF');
check(await g(() => !window.__game.vehicle), 'выход из машины по F');
const w0 = await g(() => ({ ...window.__game.player.position }));
await hold('KeyW', 800);
const w1 = await g(() => ({ ...window.__game.player.position }));
check(Math.hypot(w1.x - w0.x, w1.z - w0.z) > 1, 'персонаж ходит');

// Прыжок пешком: игрок отрывается от земли и приземляется.
await page.keyboard.press('Space');
await page.waitForTimeout(150);
const jy = await g(() => window.__game.player.position.y);
check(jy > 0.5, `прыжок на Пробел (высота ${jy.toFixed(2)} м)`);
await page.waitForTimeout(900);
check(await g(() => window.__game.player.grounded), 'приземление после прыжка');
// Запрыгнуть на крышу машины.
const roof = await g(() => new Promise((resolve) => {
  const c = window.__game, car = c.cars[0], p = c.player;
  p.position.set(car.position.x, 2.6, car.position.z - 0.3);
  p.grounded = false; p.vy = 0;
  setTimeout(() => resolve(p.position.y), 700);
}));
check(roof > 1.7, `стоит на крыше машины (y = ${roof.toFixed(2)})`);
// Перекат.
await g(() => { const p = window.__game.player; p.position.x += 4; p.position.y = 0; p.grounded = false; });
await page.waitForTimeout(500);
await page.keyboard.press('ControlLeft');
await page.waitForTimeout(100);
check(await g(() => window.__game.player.rolling), 'перекат на Ctrl');
await page.waitForTimeout(700);

// Стрельба: ставим бойца в 10 м впереди и стреляем.
const target = await g(() => {
  const c = window.__game, p = c.player.position, y = c.camYaw;
  const pos = p.clone(); pos.x += Math.sin(y) * 10; pos.z += Math.cos(y) * 10;
  window.__testEnemy = c.enemies.spawn(pos, 'red', { tag: 'test' });
  window.__testEnemy.frozen = true;
  return { x: pos.x, z: pos.z };
});
await aimAt(target.x, 1.3, target.z);
await page.mouse.down();
await page.waitForFunction(() => window.__testEnemy.hp < 40, null, { timeout: 15000 }).catch(() => {});
await page.mouse.up();
const eh = await g(() => ({ hp: window.__testEnemy.hp, dead: window.__testEnemy.dead }));
check(eh.dead || eh.hp < 40, `стрельба попадает (hp врага ${eh.hp}${eh.dead ? ', убит' : ''})`);
await shot('2-shooting');

// Граффити: подходим к красному тегу и держим ЛКМ с баллончиком.
const tag = await g(() => {
  const c = window.__game, t = c.graffiti.tags.find((x) => x.d.k === 1 && x.owner === 'red');
  window.__tag = t;
  c.player.position.copy(t.pos).addScaledVector(t.normal, 2.5).setY(0);
  // Трафик рядом убираем: NPC-машина может столкнуть игрока от стены.
  const near = (x) => x.mesh.position.distanceTo(t.pos) < 50;
  c.traffic.cars.filter(near).forEach((x) => { x.mesh.visible = false; });
  c.traffic.cars = c.traffic.cars.filter((x) => !near(x));
  return { x: t.pos.x, z: t.pos.z, total: c.graffiti.inDistrict(t.d).length };
});
check(tag.total >= 4, `в районе есть теги конкурента (${tag.total})`);
await page.keyboard.press('Digit5');
check(await g(() => window.__game.weapon === 'spray'), 'баллончик выбирается клавишей 5');
await aimAt(tag.x, 2.6, tag.z);
await page.mouse.down();
await page.waitForTimeout(1000);
await shot('3a-spraying');
// Ждём событие, а не фиксированное время: под нагрузкой FPS падает и игровое время замедляется.
await page.waitForFunction(() => window.__tag.owner === 'green', null, { timeout: 20000 }).catch(() => {});
await page.mouse.up();
check(await g(() => window.__tag.owner === 'green'), 'тег перекрашен баллончиком в зелёный');
await page.keyboard.press('Digit1');

// Без половины граффити война не начинается.
await g(() => { const c = window.__game; c.player.position.copy(c.districts[1].zone); c.player.position.x += 3; });
await page.waitForTimeout(500);
check(await g(() => !window.__game.war.capture), 'без граффити рекламная война не стартует');
await g(() => { const c = window.__game; c.graffiti.inDistrict(c.districts[1]).forEach((t) => c.graffiti.setTag(t, 'green')); });
await page.waitForTimeout(500);
check(await g(() => window.__game.war.capture?.d.k === 1), 'после граффити вход в круг запускает войну');
let waves = 0, shotWave = false;
for (let i = 0; i < 80; i++) {
  const st = await g(() => {
    const { war, enemies, districts } = window.__game;
    if (districts[1].owner === 'green') return 'done';
    const c = war.capture;
    if (!c) return 'none';
    const alive = enemies.alive((e) => e.tag === c.tag);
    if (c.waitT <= 0 && alive.length) return `wave${c.wave}`;
    return 'wait';
  });
  if (st.startsWith('wave')) {
    waves = Math.max(waves, +st.slice(4));
    if (waves === 3 && !shotWave) { shotWave = true; await page.waitForTimeout(1500); await shot('3-wave3'); }
    await g(() => { const { war, enemies } = window.__game; enemies.alive((e) => e.tag === war.capture.tag).forEach((e) => enemies.damage(e, 999)); });
  }
  if (st === 'done' || st === 'none') break;
  await page.waitForTimeout(400);
}
const owner = await g(() => window.__game.districts[1].owner);
check(owner === 'green' && waves === 3, `3 волны → район перекрашен (владелец ${owner}, волн ${waves})`);
const score = await g(() => window.__game.war.count('green'));
check(score === 3, `счёт районов обновился (🟢 ${score})`);
await page.waitForTimeout(600);
await shot('4-captured');

// Граната.
await g(() => { window.__game.player.hp = 100; });
const m0 = await g(() => window.__game.war.money);
await g(() => { const c = window.__game; c.aim(c.camYaw, -0.3); });
await page.keyboard.press('KeyR');
await page.waitForTimeout(50);
// Деньги сразу после броска: через пару секунд их маскирует доход с районов.
const gr = await g(() => window.__game.war.money);
const blasts = await g(() => new Promise((r) => setTimeout(() => r(window.__game.fx.items.length), 2500)));
check(m0 >= 150 && gr === m0 - 150, `граната «Дефолт» (R) стоит $150 ($${m0} → $${gr})`);

// Угон машины из трафика.
const t0 = await g(() => {
  const c = window.__game, npc = c.traffic.cars[0];
  c.player.position.copy(npc.mesh.position); c.player.position.x += 2.5;
  return c.traffic.cars.length;
});
await page.keyboard.press('KeyF');
const hj = await g(() => ({ inCar: !!window.__game.vehicle, n: window.__game.traffic.cars.length }));
check(hj.inCar && hj.n === t0 - 1, 'угон машины из трафика');

// Контратака.
await g(() => { window.__game.war.counterT = 0.01; });
await page.waitForTimeout(400);
const ca = await g(() => ({ c: !!window.__game.war.counter, alert: document.getElementById('subtitle').textContent }));
check(ca.c, `контратака на зелёный район («${ca.alert}»)`);
await shot('5-counter');

// Смерть и возрождение.
await g(() => window.__game.hurt(999));
await page.waitForTimeout(200);
check(await g(() => !document.getElementById('dead').classList.contains('hidden')), 'экран «ОТЗЫВ ЛИЦЕНЗИИ»');
await shot('6-dead');
await page.waitForFunction(() => window.__game.state.mode === 'play', null, { timeout: 20000 });
check(await g(() => window.__game.player.hp === 100), 'возрождение в штабе с полным здоровьем');

// Конец матча по таймеру.
await g(() => { window.__game.war.time = 0.2; });
await page.waitForTimeout(800);
const end = await g(() => ({ shown: !document.getElementById('end').classList.contains('hidden'), title: document.getElementById('endTitle').textContent, text: document.getElementById('endText').textContent }));
check(end.shown, `финальный экран: ${end.title} — ${end.text}`);
await shot('7-end');

check(errors.length === 0, `нет ошибок в консоли${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
