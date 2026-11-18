// Обзорные скриншоты карты с заданных ракурсов (ручная проверка визуала).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5317/');
await page.waitForFunction(() => window.__game);
await page.click('#play');
await page.evaluate(() => { window.__game.state.god = true; });
const views = {
  'map-sw': [[-150, 60, 230], [10, 50, 0]],
  'map-river': [[230, 25, 230], [0, 40, 0]],
  'map-street': [[-51, 3, 60], [10, 40, -20]],
};
for (const [name, [pos, look]] of Object.entries(views)) {
  await page.evaluate(([p, l]) => { const T = window.__game.cam.position.constructor; window.__game.state.camOverride = { pos: new T(...p), look: new T(...l) }; }, [pos, look]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `test/out/${name}.png` });
}
await browser.close();
