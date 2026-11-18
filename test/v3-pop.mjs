// Тест ветки v3-pop: мирные NPC, типы врагов, группы, подкрепления, союзники.
// GAME_URL=http://127.0.0.1:5324/?test node test/v3-pop.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5324/?test';
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

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const shot = (name) => page.screenshot({ path: OUT + name + '.png' });
const cam = (pos, look) => g(([p, l]) => {
  const c = window.__game, V = c.cam.position.constructor;
  c.state.camOverride = p ? { pos: new V(...p), look: new V(...l) } : null;
}, [pos, look]);

await page.goto(GAME_URL);
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
await page.click('#play');
await g(() => { const c = window.__game; c.state.god = true; c.war.update = () => {}; }); // без волн войны
await page.keyboard.press('KeyF'); // выходим из машины
await page.waitForTimeout(1500);

// 1. Толпа вокруг игрока.
const crowd = await g(() => {
  const c = window.__game, p = c.player.position;
  const alive = c.npcs.list.filter((n) => !n.dead);
  return { total: alive.length, near: alive.filter((n) => n.position.distanceTo(p) < 120).length, close: alive.filter((n) => n.position.distanceTo(p) < 40).length };
});
check(crowd.near >= 40 && crowd.near <= 60, `NPC в радиусе 120 м: ${crowd.near} (рядом <40 м: ${crowd.close})`);

// FPS в swiftshader.
const fps = await g(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
check(fps >= 15, `FPS ${fps.toFixed(1)} (цель ~20)`);

// Скриншот улицы с толпой: подгоняем прохожих поближе к камере.
const street = await g(() => {
  const c = window.__game, p = c.player.position;
  for (let k = 0; k < 10; k++) c.npcs.spawnInRing(p, 4, 22);
  return [p.x, p.z];
});
await page.waitForTimeout(1200);
await cam([street[0] + 3, 3.2, street[1] - 14], [street[0], 1.2, street[1] + 6]);
await page.waitForTimeout(600);
await shot('pop-crowd');
await cam([street[0] - 16, 7, street[1] + 2], [street[0] + 4, 1, street[1]]);
await page.waitForTimeout(400);
await shot('pop-crowd2');
await cam(null);

// 2. Паника от выстрела.
const panic = await g(() => {
  const c = window.__game, p = c.player.position;
  const n = c.npcs.spawnAt(p.clone().add(new p.constructor(5, 0, 3)), { free: true });
  c.shoot();
  return { mode: n.mode, all: c.npcs.list.filter((x) => x.mode === 'panic').length };
});
check(panic.mode === 'panic', `прохожий в панике после выстрела (паникуют: ${panic.all})`);
await page.waitForTimeout(800);
await g(() => { window.__game.npcs.list.forEach((n) => { if (n.mode === 'panic') n.modeT = 0; }); });

// 3. Рекрутинг на G.
for (let k = 0; k < 5; k++) {
  await g(() => {
    const c = window.__game, p = c.player.position, yaw = c.camYaw;
    c.npcs.spawnAt(new p.constructor(p.x + Math.sin(yaw) * 3, 0, p.z + Math.cos(yaw) * 3), { free: true, bank: 'green' });
  });
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(150);
}
const al = await g(() => window.__game.allies.list.map((a) => a.type));
check(al.length === 4, `амбассадоры по G: ${al.join(', ')} (лимит 4)`);
check(al.includes('medic') && al.includes('rifle'), 'есть медик и автоматчик');

// Идём вперёд — амбассадоры следуют.
await page.keyboard.down('KeyW'); await page.waitForTimeout(1800); await page.keyboard.up('KeyW');
await page.waitForTimeout(1200);
const follow = await g(() => { const c = window.__game, p = c.player.position; return Math.max(...c.allies.list.map((a) => a.position.distanceTo(p))); });
check(follow < 8, `амбассадоры идут следом (макс. отставание ${follow.toFixed(1)} м)`);
const pp = await g(() => { const c = window.__game, p = c.player.position, h = c.player.heading; return [p.x, p.z, Math.sin(h), Math.cos(h)]; });
await cam([pp[0] - pp[2] * 9 + pp[3] * 3, 3.5, pp[1] - pp[3] * 9 - pp[2] * 3], [pp[0] - pp[2] * 2, 1.2, pp[1] - pp[3] * 2]);
await page.waitForTimeout(500);
await shot('pop-allies');
await cam(null);

// Медик лечит.
await g(() => { window.__game.player.hp = 50; });
await page.waitForTimeout(2200);
const hp = await g(() => window.__game.player.hp);
check(hp > 50, `медик лечит игрока (hp 50 → ${hp})`);

// 4. Союзники стреляют по врагу.
const shotRes = await g(() => new Promise((res) => {
  const c = window.__game, p = c.player.position, yaw = c.player.heading;
  c.allies.shots = 0;
  const e = c.enemies.spawn(new p.constructor(p.x + Math.sin(yaw) * 12, 0, p.z + Math.cos(yaw) * 12), 'red', { type: 'broker' });
  e.frozen = true; e.hp = e.maxHp = 400;
  setTimeout(() => { res({ shots: c.allies.shots, hp: e.hp }); c.enemies.kill(e); }, 2500);
}));
check(shotRes.shots > 0 && shotRes.hp < 400, `амбассадоры стреляют (выстрелов ${shotRes.shots}, hp врага ${shotRes.hp}/400)`);

// Машина: прячутся и выходят.
await g(() => { const c = window.__game; c.cars[0].position.copy(c.player.position).add(new c.player.position.constructor(2, 0, 0)); });
await page.keyboard.press('KeyF');
await page.waitForTimeout(300);
const hidden = await g(() => window.__game.allies.list.every((a) => !a.h.root.visible));
await page.keyboard.press('KeyF');
await page.waitForTimeout(300);
const back = await g(() => window.__game.allies.list.every((a) => a.h.root.visible));
check(hidden && back, 'амбассадоры садятся в машину и выходят');

// 5. Группа промоутеров.
const grp = await g(() => {
  const c = window.__game, p = c.player.position;
  const center = new p.constructor(p.x + 40, 0, p.z + 40);
  const gr = c.enemies.spawnGroup(center, 'red', 4, 'test-group');
  return { n: gr.members.length, idle: gr.members.every((m) => !m.aggro), x: center.x, z: center.z };
});
check(grp.n === 4 && grp.idle, 'группа из 4 промоутеров стоит спокойно');
await page.waitForTimeout(1500);
await cam([grp.x + 5, 2.6, grp.z + 5], [grp.x, 1.2, grp.z]);
await page.waitForTimeout(500);
await shot('pop-group');
const aggroAll = await g(() => {
  const c = window.__game, m = c.enemies.alive((e) => e.tag === 'test-group');
  c.enemies.damage(m[0], 1);
  return new Promise((res) => setTimeout(() => res(c.enemies.alive((e) => e.tag === 'test-group').every((e) => e.aggro)), 200));
});
check(aggroAll, 'группа агрится вместе');
await g(() => { const c = window.__game; c.enemies.alive((e) => e.tag === 'test-group').forEach((e) => c.enemies.kill(e)); });

// 6. Типы врагов (линейка для скриншота).
const types = await g(() => {
  const c = window.__game, p = c.player.position;
  const list = ['collector', 'broker', 'thug', 'courier', 'seller', 'sysadmin'];
  const out = [];
  list.forEach((t, k) => {
    const e = c.enemies.spawn(new p.constructor(p.x - 30 + k * 1.8, 0, p.z - 30), k < 3 ? 'red' : 'yellow', { type: t, tag: 'lineup' });
    e.frozen = true;
    out.push(e.T === undefined ? null : t);
  });
  return { types: out.filter(Boolean).length, x: p.x - 30 + 4.5, z: p.z - 30 };
});
check(types.types === 6, 'шесть типов врагов создаются');
await cam([types.x, 2, types.z + 7], [types.x, 1.2, types.z]);
await page.waitForTimeout(500);
await shot('pop-enemy-types');
await g(() => { const c = window.__game; c.enemies.alive((e) => e.tag === 'lineup').forEach((e) => c.enemies.remove(e)); });

// Менеджер тёплых продаж замедляет, сисадмин ставит турель.
const sell = await g(() => new Promise((res) => {
  const c = window.__game, p = c.player.position;
  const se = c.enemies.spawn(p.clone().add(new p.constructor(1.5, 0, 0)), 'yellow', { type: 'seller', aggro: true, tag: 'sell' });
  se.hp = 900; // амбассадоры не успеют его застрелить
  const sa = c.enemies.spawn(p.clone().add(new p.constructor(-15, 0, 5)), 'yellow', { type: 'sysadmin', aggro: true, tag: 'sys' });
  setTimeout(() => res({ slow: c.enemies.playerSlowT > 0 || c.enemies.slowHits > 0, turret: sa.turretPlaced }), 2600);
}));
check(sell.slow, 'менеджер «Оформим страховку?» замедляет игрока');
check(sell.turret, 'сисадмин ставит турель');
await g(() => { const c = window.__game; c.enemies.alive().forEach((e) => c.enemies.kill(e)); });

// 7. Подкрепление на машине.
const rf = await g(() => {
  const c = window.__game, p = c.player.position;
  const conv = c.enemies.spawnReinforcements(p.clone().add(new p.constructor(0, 0, 20)), 'yellow', 3, 'rf');
  window.__conv = conv;
  return { x: conv.to.x, z: conv.to.z, d: conv.from.distanceTo(conv.to) };
});
await page.waitForTimeout(2000);
await cam([rf.x + 8, 4, rf.z + 8], [rf.x, 1, rf.z]);
await page.waitForTimeout(300);
await shot('pop-reinf-drive');
await page.waitForTimeout(4000);
const rfr = await g(() => ({ n: window.__conv.spawned.length, st: window.__game.enemies.convoys.map((c) => c.state) }));
check(rfr.n === 3, `подкрепление приехало (бойцов ${rfr.n}, машина: ${rfr.st.join(',')}, путь ${rf.d} м)`);
await shot('pop-reinf');
await cam(null);

// 8. Сбить прохожего машиной.
const run = await g(() => new Promise((res) => {
  const c = window.__game;
  c.enemies.alive().forEach((e) => c.enemies.kill(e));
  c.toggleCar();
  const v = c.vehicle;
  const n = c.npcs.spawnAt(v.position.clone().add(new v.position.constructor(Math.sin(v.heading) * 6, 0, Math.cos(v.heading) * 6)), { free: true });
  v.speed = 15;
  setTimeout(() => res(n.dead), 600);
}));
check(run, 'прохожего сбивает машина');

check(errors.length === 0, `нет ошибок в консоли ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
