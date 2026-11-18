// Больше оружия: 9 слотов SA, замена в слоте, дробовик, ракетница IPO, денежная пушка, чит ARSENAL.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5322/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const aimAt = async (x, y, z) => {
  for (let i = 0; i < 3; i++) {
    await g(([x, y, z]) => { const c = window.__game, cam = c.cam; const dx = x - cam.position.x, dy = y - cam.position.y, dz = z - cam.position.z; c.aim(Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))); }, [x, y, z]);
    await page.waitForTimeout(200);
  }
};
// Боец в dist м по взгляду.
const enemyAhead = (dist, hp) => g(([dist, hp]) => {
  const c = window.__game, p = c.player.position, y = c.camYaw;
  const pos = p.clone(); pos.x += Math.sin(y) * dist; pos.z += Math.cos(y) * dist; pos.y = 0;
  const e = c.enemies.spawn(pos, 'red'); e.frozen = true; if (hp) e.hp = e.maxHp = hp;
  window.__e = e; return { x: pos.x, z: pos.z };
}, [dist, hp]);

await page.goto(GAME_URL);
await page.waitForFunction(() => window.__game);
await page.waitForTimeout(800);
if (await page.locator('#play').isVisible()) await page.click('#play');
await page.waitForFunction(() => window.__game.state.mode === 'play', null, { timeout: 15000 }).catch(() => page.click('#tagDone').catch(() => {}));
await g(() => {
  const c = window.__game; c.state.god = true;
  if (c.vehicle) { c.vehicle.speed = 0; c.toggleCar(); }
  // Трафик рядом убираем, чтобы не мешал.
  c.traffic.cars.filter((t) => t.mesh.position.distanceTo(c.player.position) < 40).forEach((t) => { t.mesh.visible = false; });
  c.traffic.cars = c.traffic.cars.filter((t) => t.mesh.visible);
});
await page.waitForTimeout(300);

// Слоты и замена.
const s0 = await g(() => [...window.__game.arsenal.slots]);
check(s0[1] === 'fists' && s0[2] === 'pistol' && s0[4] === 'smg' && s0[8] === 'grenade' && s0[9] === 'spray', `стартовый набор по слотам SA: ${s0.filter(Boolean).join(', ')}`);
await g(() => { const a = window.__game.arsenal; a.give('bat'); a.selectSlot(1); });
check(await g(() => window.__game.arsenal.slots[1] === 'bat' && window.__game.weapon === 'bat'), 'бита «Просрочка» заменила кулаки в слоте 1');
const bat = await g(() => { const c = window.__game, p = c.player.position, h = c.player.heading; const pos = p.clone(); pos.x += Math.sin(h) * 1.6; pos.z += Math.cos(h) * 1.6; const e = c.enemies.spawn(pos, 'red'); e.frozen = true; e.hp = 100; c.arsenal.cd = 0; c.arsenal.punch(); const hp = e.hp; c.enemies.damage(e, 999); return hp; });
check(bat === 62, `бита: −38 hp (осталось ${bat})`);

// Дробовик.
await g(() => { const a = window.__game.arsenal; a.give('shotgun'); a.selectSlot(3); });
const t1 = await enemyAhead(7, 200);
await aimAt(t1.x, 1.3, t1.z);
const sg = await g(() => { const c = window.__game, e = window.__e, p0 = e.position.clone(); c.arsenal.cd = 0; c.arsenal.shoot(); return { hp: e.hp, moved: e.position.distanceTo(p0), mag: c.arsenal.ammo.shotgun.mag, recoil: c.player.h.recoil }; });
check(sg.hp < 200 - 18 && sg.moved > 0.2 && sg.mag === 5, `дробовик: дробь (hp 200 → ${sg.hp}), отбрасывание ${sg.moved.toFixed(2)} м, обойма ${sg.mag}`);
check(sg.recoil > 1.5, `отдача дробовика ${sg.recoil}`);
await g(() => window.__game.enemies.damage(window.__e, 999));

// Ракетница IPO: враг и машина рядом с точкой попадания.
await g(() => { const a = window.__game.arsenal; a.give('ipo'); a.selectSlot(7); });
const t2 = await enemyAhead(16, 300);
await g(([x, z]) => { const c = window.__game, car = c.cars[0]; car.position.set(x + 3, 0, z); car.airborne = false; window.__car = car; }, [t2.x, t2.z]);
await aimAt(t2.x, 1.2, t2.z);
await g(() => { const c = window.__game; c.arsenal.cd = 0; c.arsenal.shoot(); window.__maxY = 0; window.__iv = setInterval(() => { window.__maxY = Math.max(window.__maxY, window.__car.position.y); }, 30); });
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + 'v3-arsenal-ipo.png' });
await page.waitForTimeout(800);
const ipo = await g(() => { clearInterval(window.__iv); return { dead: window.__e.dead, hp: window.__e.hp, carY: window.__maxY, rockets: window.__game.arsenal.rockets.length }; });
check(ipo.dead || ipo.hp < 300, `IPO: взрыв по врагу (hp ${ipo.hp}${ipo.dead ? ', убит' : ''})`);
check(ipo.carY > 1, `IPO: машину подбросило на ${ipo.carY.toFixed(1)} м`);

// Денежная пушка: купюры, урона нет.
await g(() => { const a = window.__game.arsenal; a.give('moneygun'); a.selectSlot(7); });
check(await g(() => window.__game.arsenal.slots[7] === 'moneygun'), 'денежная пушка заменила IPO в слоте «Тяжёлое»');
const t3 = await enemyAhead(6, 40);
await aimAt(t3.x, 1.2, t3.z);
await page.mouse.move(640, 360);
await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
await page.waitForTimeout(1500);
const mg = await g(() => ({ bills: window.__game.arsenal.bills.length, landed: window.__game.arsenal.bills.filter((b) => b.landed).length, hp: window.__e.hp }));
check(mg.bills > 0 && mg.landed > 0 && mg.hp === 40, `денежная пушка: ${mg.bills} купюр, на земле ${mg.landed}, враг цел (${mg.hp})`);
await g(([x, z]) => { const T = window.__game.cam.position.constructor; window.__game.state.camOverride = { pos: new T(x - 4, 2.5, z - 4), look: new T(x, 0.3, z) }; }, [t3.x, t3.z]);
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + 'v3-arsenal-money.png' });
await g(() => { window.__game.state.camOverride = null; window.__game.enemies.damage(window.__e, 999); });

// Чит ARSENAL.
await g(() => { const a = window.__game.arsenal; a.slots[3] = null; delete a.ammo.shotgun; a.selectSlot(2); });
await page.keyboard.type('arsenal', { delay: 30 });
await page.waitForTimeout(300);
const ar = await g(() => [...window.__game.arsenal.slots]);
check(ar[1] === 'bat' && ar[2] === 'pistol' && ar[3] === 'shotgun' && ar[4] === 'smg' && ['ipo', 'moneygun'].includes(ar[7]) && ar[8] === 'grenade' && ar[9] === 'spray', `ARSENAL выдал всё: ${ar.filter(Boolean).join(', ')}`);
await page.keyboard.type('arsenal', { delay: 30 });
const ar2 = await g(() => window.__game.arsenal.slots[7]);
check(ar2 !== ar[7], `повторный ARSENAL переключает «Тяжёлое»: ${ar[7]} → ${ar2}`);

// Колесо: 9 слотов с иконками.
await page.keyboard.down('Tab');
await page.waitForTimeout(300);
const n = await page.locator('.wheelItem').count();
check(n === 9, `в колесе 9 слотов (${n})`);
await page.screenshot({ path: OUT + 'v3-arsenal-wheel.png' });
await page.keyboard.up('Tab');

check(errors.length === 0, `нет ошибок${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
