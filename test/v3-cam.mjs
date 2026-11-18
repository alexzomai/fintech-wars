// v3-cam: занос, крен, взрыв машины, инерция игрока + скриншоты камеры.
// GAME_URL=http://127.0.0.1:5330/ node test/v3-cam.mjs
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
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const shot = (name) => page.screenshot({ path: OUT + name + '.png' });

await page.goto(GAME_URL + '?test');
await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
await page.click('#play');
await g(() => {
  const c = window.__game;
  c.state.god = true;
  c.traffic.cars.forEach((t) => { t.mesh.visible = false; });
  c.traffic.cars = [];
  // Ставим машину на дорогу трамплина, носом от трамплина.
  const v = c.vehicle, r = c.stunts.ramps[0];
  v.position.set(r.x - r.dir[0] * 14, 0, r.z - r.dir[1] * 14); v.heading = Math.atan2(-r.dir[0], -r.dir[1]); v.speed = 0;
  c.aim(v.heading, 0.05);
});

// Крен в повороте без ручника + запаздывание камеры (снимок в повороте).
await g(() => {
  const c = window.__game, v = c.vehicle;
  v.speed = 26; window.__maxRoll = 0; window.__maxSlip = 0; window.__drift = false;
  window.__probe = setInterval(() => {
    window.__maxRoll = Math.max(window.__maxRoll, Math.abs(v.roll));
    window.__maxSlip = Math.max(window.__maxSlip, Math.abs(v.slip));
    window.__drift ||= v.drifting;
  }, 16);
});
await page.keyboard.down('KeyW');
await page.keyboard.down('KeyA');
await page.waitForFunction(() => window.__maxRoll > 0.04, null, { timeout: 6000 }).catch(() => {});
await shot('cam-car-turn');
await page.keyboard.up('KeyA');
const roll = await g(() => window.__maxRoll);
check(roll > 0.04, `крен кузова в повороте (${roll.toFixed(3)} рад)`);
const camLag = await g(() => { const c = window.__game; return Math.abs(Math.atan2(Math.sin(c.vehicle.heading - c.camYaw), Math.cos(c.vehicle.heading - c.camYaw))); });
check(camLag > 0.02, `камера запаздывает на повороте (${camLag.toFixed(2)} рад)`);

// Занос на ручнике: боковая скорость, дым из-под колёс.
await g(() => { const v = window.__game.vehicle; v.speed = 30; window.__maxSlip = 0; window.__drift = false; });
await page.keyboard.down('Space');
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.__drift && window.__maxSlip > 4, null, { timeout: 6000 }).catch(() => {});
await shot('cam-car-drift');
await page.keyboard.up('KeyD');
await page.keyboard.up('Space');
await page.keyboard.up('KeyW');
const slip = await g(() => ({ s: window.__maxSlip, d: window.__drift }));
check(slip.d && slip.s > 4, `занос на ручнике (боковая скорость ${slip.s.toFixed(1)} м/с)`);
await g(() => clearInterval(window.__probe));

// Выход, инерция игрока: разгон не мгновенный, спринт тратит выносливость.
await g(() => { const v = window.__game.vehicle; v.speed = 0; v.slip = 0; v.yawRate = 0; });
await page.keyboard.press('KeyF');
check(await g(() => !window.__game.vehicle), 'выход из машины');
await page.waitForFunction(() => window.__game.player.grounded, null, { timeout: 4000 }).catch(() => {});
const acc = await g(() => new Promise((res) => {
  const c = window.__game, p = c.player, r = c.stunts.ramps[0];
  // Пешком — по той же дороге, лицом от трамплина.
  p.position.set(r.x - r.dir[0] * 20, 0, r.z - r.dir[1] * 20); p.vx = p.vz = 0;
  c.aim(Math.atan2(-r.dir[0], -r.dir[1]), 0.05);
  c.input.up = true; c.input.run = true;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const early = p.speed;
    setTimeout(() => { const late = p.speed, st = p.stamina; c.input.up = false; c.input.run = false; res({ early, late, st }); }, 900);
  }));
}));
check(acc.early < 9 && acc.late > 9, `разгон с инерцией (${acc.early.toFixed(1)} → ${acc.late.toFixed(1)} м/с)`);
check(acc.st < 1, `спринт тратит выносливость (${acc.st.toFixed(2)})`);
await page.waitForFunction(() => window.__game.player.speed < 0.1, null, { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(500);
await shot('cam-foot');

// Взрыв: боец рядом с машиной, игрок в 6 м; машина получает смертельный урон.
const setup = await g(() => {
  const c = window.__game, car = c.cars[0], p = c.player;
  const pos = car.position.clone(); pos.x += 3;
  window.__boom = c.enemies.spawn(pos, 'red', { tag: 'test' });
  window.__boom.frozen = true;
  p.position.set(car.position.x - 6, 0, car.position.z); p.grounded = false;
  c.aim(Math.PI / 2, -0.15);
  car.hp = 30; // дым из капота
  return c.cars.length;
});
await page.waitForTimeout(600);
await shot('cam-car-smoke');
await g(() => { window.__boomCar = window.__game.cars[0]; window.__boomCar.damage(500); });
await page.waitForFunction(() => window.__boomCar.wrecked, null, { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(250);
await shot('cam-explosion');
const ex = await g(() => {
  const c = window.__game, p = c.player;
  return { wrecked: window.__boomCar.wrecked, inList: c.cars.includes(window.__boomCar), enemy: window.__boom.dead, knock: Math.hypot(p.kx, p.kz) + Math.max(0, p.vy) };
});
check(ex.wrecked && !ex.inList, 'машина взорвалась и стала обломком');
check(ex.enemy, 'взрыв убивает бойца рядом');
check(ex.knock > 0.5, `взрыв отбрасывает игрока (${ex.knock.toFixed(1)})`);
await page.waitForTimeout(1200);
await shot('cam-wreck');

check(errors.length === 0, `без ошибок в консоли${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
