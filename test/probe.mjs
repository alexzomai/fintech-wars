// Отладка трамплина: траектория машины.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:5317/');
await page.waitForFunction(() => window.__game);
await page.click('#play');
await page.evaluate(() => { const c = window.__game, r = c.stunts.ramps[0], v = c.vehicle; window.__r = r; v.position.set(r.x - r.dir[0] * 25, 0, r.z - r.dir[1] * 25); v.heading = Math.atan2(r.dir[0], r.dir[1]); v.speed = 32; });
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(150);
  console.log(JSON.stringify(await page.evaluate(() => { const v = window.__game.vehicle, r = window.__r; return { x: v.position.x.toFixed(1), y: v.position.y.toFixed(2), z: v.position.z.toFixed(1), sp: v.speed.toFixed(1), h: v.heading.toFixed(2), air: v.airborne, rx: r.x, rz: r.z, mode: window.__game.state.mode }; })));
}
await browser.close();
