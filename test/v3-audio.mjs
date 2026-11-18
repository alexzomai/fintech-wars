// Звук и радио: AudioContext запущен, в машине играет станция, Z переключает, диджей читает статистику.
import { chromium } from 'playwright-core';
const URL = (process.env.GAME_URL || 'http://127.0.0.1:5325/') + '?test';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fails = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

await page.goto(URL);
await page.waitForFunction(() => window.__game?.audio);
await page.click('#play');
check(await wait(() => window.__game.audio.ctx?.state === 'running'), 'AudioContext запущен по кнопке «Играть»');
check(await wait(() => window.__game.vehicle && window.__game.audio.radioOn), 'в машине играет станция');
check(await g(() => window.__game.audio.stationName) === 'Ставка FM', 'первая станция — «Ставка FM»');
check(await wait(() => window.__game.audio.step > 16), 'секвенсор станции идёт');
// Диджей: ускоряем таймер.
await g(() => { window.__game.state.god = true; window.__game.audio.djT = 0; });
check(await wait(() => /Ставка FM/.test(window.__game.audio.lastDj) && /\d/.test(window.__game.audio.lastDj)), 'диджей выдал реплику со статистикой');
check(await g(() => document.getElementById('subtitle').textContent.includes('Ставка FM')), 'реплика диджея в субтитрах');
await page.screenshot({ path: 'test/out/audio-dj.png' });
await g(() => { window.__game.audio.djT = 0; });
check(await wait(() => /реклама/.test(window.__game.audio.lastDj)), 'вторая реплика — реклама');
// Z: станции по кругу.
await page.keyboard.press('KeyZ');
check(await wait(() => window.__game.audio.stationName === 'Ретро-кэш' && /Ретро-кэш/.test(document.getElementById('subtitle').textContent)), 'Z → «Ретро-кэш», субтитр');
await page.screenshot({ path: 'test/out/audio-station.png' });
check(await wait(() => window.__game.audio.step > 16), '«Ретро-кэш» играет');
await page.keyboard.press('KeyZ');
check(await wait(() => window.__game.audio.stationName === 'Радио выключено' && !window.__game.audio.radioOn), 'Z → «Радио выключено»');
await page.keyboard.press('KeyZ');
check(await wait(() => window.__game.audio.stationName === 'Ставка FM'), 'Z → снова «Ставка FM»');
// Выход из машины глушит радио.
await g(() => { window.__game.vehicle.speed = 0; window.__game.toggleCar(); });
check(await wait(() => !window.__game.vehicle && !window.__game.audio.radioOn), 'выход из машины — радио выключено');
// SFX.
await g(() => { const a = window.__game.arsenal; a.select('pistol', true); window.__game.shoot(); });
check(await wait(() => window.__game.audio.sfx.played.pistol > 0), 'звук выстрела пистолета');
await g(() => { window.__game.input.up = true; });
check(await wait(() => window.__game.audio.sfx.played.step > 0), 'звук шагов');
await g(() => { window.__game.input.up = false; window.__game.arsenal.selectSlot(3); window.__game.shoot(); });
check(await wait(() => window.__game.audio.sfx.played.smg > 0), 'звук автомата');
await g(() => { const d = window.__game.districts.find((x) => x.owner !== 'green'); d.owner = 'green'; });
check(await wait(() => window.__game.audio.sfx.played.capture > 0), 'джингл захвата района');
const before = await g(() => window.__game.player.hp);
await g(() => { window.__game.state.god = false; window.__game.hurt(5); });
check(await wait((h) => window.__game.player.hp < h && window.__game.audio.sfx.played.hurt > 0, before), 'звук урона игроку');
await g(() => { window.__game.state.god = true; });
check(errors.length === 0, `нет ошибок страницы ${errors.join('; ')}`);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
