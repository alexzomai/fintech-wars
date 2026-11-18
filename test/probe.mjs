// Отладка: FPS и число draw calls.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:5317/');
await page.waitForFunction(() => window.__game);
await page.click('#play');
await page.waitForTimeout(1000);
console.log(JSON.stringify(await page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => (++n, performance.now() - t < 2000 ? requestAnimationFrame(f) : r({ fps: n / 2, calls: window.__game.renderer?.info.render.calls })); requestAnimationFrame(f); }))));
await browser.close();
