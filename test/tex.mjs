// Обзорные скриншоты карты с заданных ракурсов (ручная проверка визуала).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto((process.env.GAME_URL || 'http://127.0.0.1:5332/') + '?test');
await page.waitForFunction(() => window.__game);
await page.click('#play');
await page.evaluate(() => { window.__game.state.god = true; });
const views = {
  'tex-street': [[-51, 3, 60], [10, 4, -20]],
  'tex-wide': [[-120, 30, 120], [0, 5, 0]],
};
for (const [name, [pos, look]] of Object.entries(views)) {
  await page.evaluate(([p, l]) => { const T = window.__game.cam.position.constructor; window.__game.state.camOverride = { pos: new T(...p), look: new T(...l) }; }, [pos, look]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `test/out/${process.env.TAG}-${name}.png` });
}
await browser.close();
