// Оружие и SA-интерфейс: слоты Q/E/цифры, патроны, перезарядка, колесо на Tab, пикапы, тексты HUD.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5322/';
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
const cur = () => g(() => window.__game.weapon);
const press = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(60); };
const wheel = async (dy) => { await page.mouse.move(640, 360); await page.mouse.wheel(0, dy); await page.waitForTimeout(100); };

await page.goto(GAME_URL);
await page.waitForFunction(() => window.__game);
await page.waitForTimeout(800);
await page.click('#play');
await g(() => { window.__game.state.god = true; });
await g(() => { const c = window.__game; c.vehicle.speed = 0; });
await press('KeyF'); // выходим из машины
await page.waitForTimeout(300);

// Переключение.
check(await cur() === 'pistol', 'старт с пистолетом');
await wheel(120); check(await cur() === 'smg', 'колесо вниз → автомат');
await wheel(120); check(await cur() === 'grenade', 'колесо вниз → граната');
await wheel(-120); check(await cur() === 'smg', 'колесо вверх → автомат');
await press('Digit1'); check(await cur() === 'fists', '1 → кулаки');
await press('Digit5'); check(await cur() === 'spray', '5 → баллончик');
await wheel(120); check(await cur() === 'fists', 'по кругу: баллончик → кулаки');
await press('KeyQ'); await press('KeyE'); check(await cur() === 'fists', 'Q/E оружие не листают');
await g(() => { window.__game.arsenal.ammo.grenade.mag = 0; });
await press('Digit3'); await wheel(120);
check(await cur() === 'spray', 'граната без запаса пропускается (автомат → баллончик)');
await press('Digit4'); check(await cur() === 'spray', 'пустую гранату цифрой не выбрать');
await g(() => { window.__game.arsenal.ammo.grenade.mag = 2; });
await wheel(120);
check(await cur() === 'fists', 'колесо мыши листает');

// Расход патронов.
await press('Digit2');
const a0 = await g(() => ({ ...window.__game.arsenal.ammo.pistol }));
await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
const a1 = await g(() => ({ ...window.__game.arsenal.ammo.pistol }));
check(a1.mag < a0.mag && a1.res === a0.res, `пистолет тратит обойму (${a0.mag}-${a0.res} → ${a1.mag}-${a1.res})`);
const ammoTxt = await g(() => document.getElementById('weaponAmmo').textContent);
check(ammoTxt === `${a1.mag}-${a1.res}`, `патроны в иконке «${ammoTxt}»`);

// Перезарядка.
await g(() => { window.__game.arsenal.ammo.pistol.mag = 1; });
await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up();
const rl = await g(() => window.__game.arsenal.reloadT);
check(rl > 0, `пустая обойма → перезарядка (${rl.toFixed(2)} с)`);
await page.waitForTimeout(1400);
const a2 = await g(() => ({ ...window.__game.arsenal.ammo.pistol }));
check(a2.mag === 12 && a2.res === a1.res - 12, `после перезарядки ${a2.mag}-${a2.res}`);

// Ручная перезарядка на R.
await g(() => { window.__game.arsenal.ammo.pistol.mag = 5; });
await press('KeyR');
check(await g(() => window.__game.arsenal.reloadT > 0), 'R — перезарядка');
await page.waitForTimeout(1400);

// Кулаки.
const punched = await g(() => {
  const c = window.__game, p = c.player.position, h = c.player.heading;
  const pos = p.clone(); pos.x += Math.sin(h) * 1.4; pos.z += Math.cos(h) * 1.4;
  const e = c.enemies.spawn(pos, 'red'); e.frozen = true;
  c.arsenal.select('fists'); c.arsenal.cd = 0;
  c.arsenal.punch();
  const hp = e.hp; c.enemies.damage(e, 999);
  return { hp, punchT: c.player.h.punchT };
});
check(punched.hp === 20 && punched.punchT > 0, `удар кулаком: −20 hp (осталось ${punched.hp})`);
await press('Digit3');

// HUD-тексты для скриншота.
await g(() => {
  const { hud } = window.__game;
  hud.setWanted(3); hud.setArmor(60); hud.setClock(21, 7);
  hud.help('Нажмите ~F~, чтобы угнать машину. ~Tab~ — колесо оружия.');
  hud.subtitle('Перекрась <b style="color:#e8423a">теги Алого</b> в районе <b style="color:#ffd23f">Меркурий</b>');
  hud.showDistrict('Ипотечные холмы', '#e8423a');
  window.__game.war.addMoney(548);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + 'v3-hud.png' });
const hudOk = await g(() => ({
  score: !!document.getElementById('scoreG'), alert: !!document.getElementById('alert'),
  stars: document.getElementById('wanted').textContent, help: document.getElementById('help').classList.contains('show'),
}));
check(!hudOk.score && !hudOk.alert, 'аркадные счёт и баннер убраны');
check(hudOk.stars === '★★★' && hudOk.help, 'звёзды розыска и хелпбокс');

// Колесо на Tab.
await page.keyboard.down('Tab');
await page.waitForTimeout(200);
const ts = await g(() => window.__game.state.timeScale);
check(ts < 1 && await g(() => document.getElementById('wheel').classList.contains('show')), `Tab открывает колесо, время замедлено (×${ts})`);
const box = await page.locator('.wheelItem[data-id="pistol"]').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
await page.waitForTimeout(250);
await page.screenshot({ path: OUT + 'v3-wheel.png' });
await page.keyboard.up('Tab');
await page.waitForTimeout(100);
check(await cur() === 'pistol' && await g(() => window.__game.state.timeScale) === 1, 'отпустил Tab → выбран пистолет, время нормальное');
// Выбор направлением мыши (pointer lock в headless нет — дергаем тот же обработчик).
await page.keyboard.down('Tab');
await g(() => window.__game.arsenal.wheelMove(0, 80)); // вниз → между 3 и 4: слот 3/4
await g(() => window.__game.arsenal.wheelMove(-200, -60)); // влево-вверх → баллончик (слот 5)
await page.keyboard.up('Tab');
check(await cur() === 'spray', 'колесо: выбор направлением мыши');

// Пикап.
const pk = await g(() => {
  const c = window.__game, p = c.arsenal.pickups.find((x) => x.type === 'smg');
  const before = c.arsenal.ammo.smg.res;
  c.player.position.set(p.pos.x + 0.5, 0, p.pos.z);
  return { before, n: c.arsenal.pickups.length, x: p.pos.x, z: p.pos.z };
});
await page.waitForTimeout(300);
const pk2 = await g(() => { const c = window.__game, p = c.arsenal.pickups.find((x) => x.type === 'smg'); return { res: c.arsenal.ammo.smg.res, hidden: !p.g.visible, t: p.t }; });
check(pk.n >= 5 && pk2.res > pk.before && pk2.hidden && pk2.t > 25, `пикап даёт патроны (${pk.before} → ${pk2.res}), респаун через ${pk2.t.toFixed(0)} с`);
await g(([x, z]) => {
  const c = window.__game, T = c.cam.position.constructor;
  c.arsenal.pickups.forEach((p) => { p.t = 0; p.g.visible = true; });
  c.player.position.set(x + 30, 0, z + 30);
  c.state.camOverride = { pos: new T(x + 5, 3, z + 6), look: new T(x, 1, z) };
}, [pk.x, pk.z]);
await g(() => window.__game.hud.missionPassed(500));
await page.waitForTimeout(900);
await page.screenshot({ path: OUT + 'v3-pickup-passed.png' });

check(errors.length === 0, `нет ошибок в консоли${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
