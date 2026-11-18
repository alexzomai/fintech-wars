// Отладка баллончика: куда смотрит камера и попадает ли луч в тег.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:5317/');
await page.waitForFunction(() => window.__game);
await page.click('#play');
await page.evaluate(() => { const c = window.__game; c.state.god = true; c.vehicle.speed = 0; c.toggleCar(); });
const g = (f, a) => page.evaluate(f, a);
const t = await g(() => { const c = window.__game, t = c.graffiti.tags.find((x) => x.d.k === 1 && x.owner === 'red'); window.__tag = t; c.player.position.copy(t.pos).addScaledVector(t.normal, 2.5).setY(0); return { x: t.pos.x, z: t.pos.z, n: [t.normal.x, t.normal.z] }; });
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(200);
  console.log(JSON.stringify(await g(([x, z]) => { const c = window.__game, cam = c.cam; const dx = x - cam.position.x, dy = 2.6 - cam.position.y, dz = z - cam.position.z; c.aim(Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))); const p = c.player.position; return { cam: [cam.position.x.toFixed(2), cam.position.y.toFixed(2), cam.position.z.toFixed(2)], player: [p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)], yaw: c.camYaw.toFixed(3) }; }, [t.x, t.z])));
}
console.log(JSON.stringify(t));
await browser.close();
