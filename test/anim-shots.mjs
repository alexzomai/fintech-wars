// Скриншоты анимаций: бег, прыжок, перекат (ручная проверка визуала).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5317/');
await page.waitForFunction(() => window.__game);
await page.click('#play');
await page.evaluate(() => { const g = window.__game; g.state.god = true; g.vehicle.speed = 0; g.toggleCar(); g.aim(Math.PI / 2, 0.05); });
await page.waitForTimeout(400);
// Бег боком к камере: камера смотрит на +X, бежим влево-вправо.
await page.evaluate(() => window.__game.aim(0, 0.05));
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyD');
await page.waitForTimeout(900);
await page.screenshot({ path: 'test/out/anim-run.png' });
await page.keyboard.press('Space');
await page.waitForTimeout(180);
await page.screenshot({ path: 'test/out/anim-jump.png' });
await page.keyboard.up('KeyD'); await page.keyboard.up('ShiftLeft');
await page.waitForTimeout(900);
await page.keyboard.press('ControlLeft');
await page.waitForTimeout(250);
await page.screenshot({ path: 'test/out/anim-roll.png' });
await browser.close();
