// Модели машин и реквизит: загрузка GLB, рендер, FPS с реквизитом и без. Скриншоты — test/out/models-*.png.
import { chromium } from 'playwright-core';
const URL = (process.env.GAME_URL || 'http://127.0.0.1:5331/') + '?test';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
let fails = 0;
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails++; };
await page.goto(URL);
await page.waitForFunction(() => window.__game);
await page.click('#play');
await page.evaluate(() => { window.__game.state.god = true; });

const cam = (pos, look) => page.evaluate(([p, l]) => { const T = window.__game.cam.position.constructor; window.__game.state.camOverride = { pos: new T(...p), look: new T(...l) }; }, [pos, look]);
const settle = () => page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n > 20 ? r() : requestAnimationFrame(f)); f(); }));

// Реквизит расставлен.
const counts = await page.evaluate(() => window.__props.counts);
console.log('props', JSON.stringify(counts));
check(counts.lamp > 50 && counts.bench > 5 && counts.bin > 5 && counts.treeS + counts.treeL > 5, 'реквизит расставлен');

// Линейка всех моделей машин на пустом месте у старта.
const kinds = await page.evaluate(async () => {
  const { makeCarMesh } = await import('/src/car.js');
  const { CAR_TYPES } = await import('/src/props.js');
  window.__spin = (await import('/src/props.js')).spinWheels;
  const scene = window.__game.traffic.cars[0].mesh.parent;
  const p0 = window.__game.player.position;
  const names = Object.keys(CAR_TYPES), meshes = [];
  names.forEach((k, i) => {
    const m = makeCarMesh([0x4d8dff, 0xff4d4d, 0x2ecc59, 0xffc94d, 0x9b6bff, 0xffffff, 0xff8a3d, 0x4d8dff, 0x2ecc59][i], k);
    m.position.set(p0.x - 14 + (i % 5) * 6, 0.25, p0.z - 20 - Math.floor(i / 5) * 8);
    scene.add(m); meshes.push(m);
  });
  window.__lineup = meshes;
  await new Promise((r) => { const t = setInterval(() => { if (meshes.every((m) => m.children.length === 1 && m.children[0].isGroup)) { clearInterval(t); r(); } }, 100); setTimeout(r, 15000); });
  return names.map((k, i) => ({ k, loaded: meshes[i].children.length === 1 && meshes[i].children[0].isGroup }));
});
check(kinds.every((k) => k.loaded), 'все модели машин загрузились: ' + kinds.map((k) => k.k).join(','));
const dims = await page.evaluate(async () => {
  const T = window.__game.cam.position.constructor;
  const THREE = { Box3: (await import('/node_modules/three/build/three.module.js')).Box3 };
  return window.__lineup.map((m) => { m.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m.children[0]); const s = b.getSize(new T()); return [s.x, s.y, s.z, b.min.y - m.position.y]; });
});
console.log('dims', JSON.stringify(dims.map((d) => d.map((v) => +v.toFixed(2)))));
const spin = await page.evaluate(() => { const m = window.__lineup[0]; const w = m.userData.holder.userData.wheels; const a = w[0].rotation.x; window.__spin(m, 10, 0.1); return [w.length, w[0].rotation.x - a]; });
check(spin[0] === 4 && spin[1] > 0.1, 'колёса крутятся: ' + spin.join(' '));
check(dims.every((d) => d[2] > 3.5 && d[2] < 6 && Math.abs(d[3]) < 0.1), 'длина 3.5–6 м, колёса на земле');
const p0 = await page.evaluate(() => { const p = window.__game.player.position; return [p.x, p.z]; });
await page.evaluate(() => window.__lineup.forEach((m) => { m.rotation.y = 0.6; }));
await cam([p0[0] + 2, 7, p0[1] - 6], [p0[0] + 2, 1, p0[1] - 22]);
await settle();
await page.screenshot({ path: 'test/out/models-lineup.png' });
await page.evaluate(() => window.__lineup.forEach((m) => m.parent.remove(m)));

// Улица с реквизитом (SW-угол, у земли) + угол кадра повыше.
const e = await page.evaluate(() => window.__game.colliders.length);
await cam([-60, 2.6, 120], [-52, 3, 40]);
await settle();
await page.screenshot({ path: 'test/out/models-street.png' });
await cam([-54, 9, 150], [-54, 0, 60]);
await settle();
await page.screenshot({ path: 'test/out/models-street2.png' });

// FPS: с реквизитом и без (камера над улицей), среднее по 3 с, дважды чередуя.
const fps = (vis) => page.evaluate(async (v) => {
  window.__props.group.visible = v;
  await new Promise((r) => requestAnimationFrame(r));
  let n = 0; const t0 = performance.now();
  await new Promise((r) => { const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(); }; f(); });
  return n / ((performance.now() - t0) / 1000);
}, vis);
const res = { off: [], on: [] };
for (let i = 0; i < 2; i++) { res.off.push(await fps(false)); res.on.push(await fps(true)); }
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log('fps без реквизита', avg(res.off).toFixed(1), 'с реквизитом', avg(res.on).toFixed(1));
check(avg(res.on) >= avg(res.off) * 0.9, 'FPS с реквизитом не упал больше чем на 10%');
await browser.close();
console.log(fails ? `FAILED ${fails}` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
