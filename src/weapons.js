import * as THREE from 'three';
import { BANKS, rayBoxes, randomRoadPoint, resolveCircle } from './city.js';
import { sfx } from './audio.js'; // [v3-audio]
import { Car } from './car.js';

// Арсенал в духе GTA SA: 9 слотов по категориям, в каждом одно оружие — подобранное заменяет прежнее.
// Обойма/запас, перезарядка, отдача, листание Q/E/колесом, колесо оружия на Tab, крутящиеся пикапы.

export const SLOTS = ['', 'Ближний бой', 'Пистолеты', 'Дробовики', 'Пистолеты-пулемёты', 'Автоматы', 'Винтовки', 'Тяжёлое', 'Метательное', 'Особое'];

export const WEAPONS = [
  { id: 'fists', slot: 1, name: 'Кулаки', short: 'Кулаки', melee: true, cd: 0.45, dmg: 20, range: 1.8, push: 0.6 },
  { id: 'bat', slot: 1, name: 'Бита «Просрочка»', short: 'Просрочка', melee: true, cd: 0.6, dmg: 38, range: 2.3, push: 1.6, recoil: 0.5 },
  { id: 'pistol', slot: 2, name: 'Пистолет «Платёжный»', short: 'Платёжный', cd: 0.2, dmg: 25, head: 50, mag: 12, reserve: 60, maxReserve: 120, reload: 1.1, spread: 0.004, tracer: 0xb8ffc8, recoil: 1, kick: 0.012 },
  { id: 'shotgun', slot: 3, name: 'Дробовик «Рефинансирование»', short: 'Рефинанс.', cd: 0.85, dmg: 9, head: 14, pellets: 8, mag: 6, reserve: 24, maxReserve: 48, reload: 2, spread: 0.075, tracer: 0xffc070, recoil: 2.2, kick: 0.05, push: 1.4 },
  { id: 'smg', slot: 4, name: 'ПП «Микрозайм»', short: 'Микрозайм', cd: 0.08, dmg: 10, head: 20, mag: 30, reserve: 120, maxReserve: 240, reload: 1.6, spread: 0.035, tracer: 0xffe07a, recoil: 0.6, kick: 0.006 },
  { id: 'ipo', slot: 7, name: 'Ракетница «IPO»', short: 'IPO', rocket: true, cd: 1.2, mag: 1, reserve: 3, maxReserve: 6, reload: 1.8, recoil: 2.6, kick: 0.07 },
  { id: 'moneygun', slot: 7, name: 'Денежная пушка', short: 'Кэш-пушка', money: true, cd: 0.14, mag: 50, reserve: 100, maxReserve: 300, reload: 1.4, recoil: 0.5, kick: 0.004 },
  { id: 'grenade', slot: 8, name: 'Граната «Дефолт»', short: 'Дефолт', thrown: true, cd: 0.8, count: 2, maxCount: 6 },
  { id: 'spray', slot: 9, name: 'Баллончик', short: 'Баллончик', spray: true },
];
const BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
const START = ['fists', 'pistol', 'smg', 'grenade', 'spray'];

// Пиктограммы в сетке 24×14: [x, y, w, h, цвет]. Рисуются с чёрной пиксельной обводкой.
const ICONS = {
  fists: [[0, 5, 5, 6, '#2ecc59'], [5, 3, 13, 9, '#d9a77c'], [6, 2, 3, 3, '#e8b88e'], [10, 2, 3, 3, '#e8b88e'], [14, 2, 3, 3, '#e8b88e'], [17, 7, 4, 4, '#d9a77c'], [6, 5, 11, 1, '#a8724e'], [9, 3, 1, 2, '#a8724e'], [13, 3, 1, 2, '#a8724e']],
  bat: [[1, 9, 6, 2, '#3a2a1a'], [0, 8, 2, 4, '#3a2a1a'], [6, 8, 2, 3, '#e8423a'], [8, 7, 6, 3, '#c48a4a'], [14, 6, 5, 4, '#d29a58'], [19, 5, 4, 5, '#d29a58'], [15, 7, 6, 1, '#e8423a'], [16, 5, 2, 1, '#ffffff']],
  pistol: [[3, 3, 19, 4, '#c8ccd6'], [20, 4, 3, 2, '#8a909c'], [4, 7, 5, 7, '#3a3d46'], [9, 7, 4, 3, '#3a3d46'], [10, 8, 2, 1, '#c8ccd6'], [5, 4, 9, 1, '#2ecc59']],
  shotgun: [[0, 5, 4, 5, '#8a5a2a'], [3, 4, 3, 3, '#8a5a2a'], [5, 4, 8, 4, '#5a5f6a'], [12, 4, 12, 2, '#7a7f8a'], [12, 6, 11, 1, '#5a5f6a'], [14, 7, 6, 2, '#a86a32'], [8, 8, 2, 3, '#3a3d46'], [6, 5, 5, 1, '#ffd23f']],
  smg: [[0, 3, 3, 6, '#5a5f6a'], [3, 4, 17, 5, '#9aa0ac'], [20, 5, 4, 2, '#5a5f6a'], [12, 9, 3, 5, '#3a3d46'], [5, 9, 3, 4, '#3a3d46'], [4, 5, 10, 1, '#f5c518'], [16, 2, 2, 2, '#5a5f6a']],
  ipo: [[1, 5, 19, 4, '#4a6a3a'], [0, 4, 2, 6, '#3a5230'], [19, 4, 2, 6, '#3a5230'], [21, 5, 2, 4, '#e8423a'], [23, 6, 1, 2, '#ffd23f'], [7, 9, 2, 4, '#2a2d34'], [12, 9, 2, 3, '#2a2d34'], [9, 2, 4, 3, '#2a2d34'], [3, 6, 14, 1, '#ffd23f']],
  moneygun: [[1, 4, 14, 6, '#2e8b4a'], [15, 3, 4, 8, '#3aa65a'], [4, 10, 3, 3, '#2a2d34'], [7, 5, 1, 4, '#ffd23f'], [6, 6, 3, 1, '#ffd23f'], [6, 8, 3, 1, '#ffd23f'], [20, 1, 3, 2, '#9be89b'], [21, 6, 3, 2, '#9be89b'], [19, 11, 3, 2, '#9be89b']],
  grenade: [[7, 4, 10, 9, '#ff6a3a'], [8, 3, 8, 11, '#ff6a3a'], [6, 5, 12, 7, '#ff6a3a'], [10, 1, 4, 3, '#5a5f6a'], [14, 1, 5, 2, '#c8ccd6'], [6, 8, 12, 1, '#b8361c'], [9, 6, 2, 2, '#ffffff'], [13, 10, 2, 2, '#ffffff'], [10, 9, 1, 1, '#ffffff'], [11, 8, 1, 1, '#ffffff'], [12, 7, 1, 1, '#ffffff'], [13, 6, 1, 1, '#ffffff']],
  spray: [[8, 3, 8, 11, '#2ecc59'], [9, 1, 6, 2, '#d8d8d8'], [15, 1, 2, 1, '#ffffff'], [8, 7, 8, 3, '#ffffff'], [10, 8, 4, 1, '#2ecc59'], [19, 0, 1, 1, '#7dff8a'], [21, 2, 1, 1, '#7dff8a'], [19, 3, 1, 1, '#7dff8a'], [22, 0, 1, 1, '#7dff8a']],
};

export function drawWeaponIcon(canvas, id) {
  const ctx = canvas.getContext('2d');
  const u = Math.floor(Math.min(canvas.width / 26, canvas.height / 16));
  const ox = Math.floor((canvas.width - 24 * u) / 2), oy = Math.floor((canvas.height - 14 * u) / 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const rects = ICONS[id] || [];
  ctx.fillStyle = '#000';
  for (const [x, y, w, h] of rects) ctx.fillRect(ox + (x - 1) * u, oy + (y - 1) * u, (w + 2) * u, (h + 2) * u);
  for (const [x, y, w, h, c] of rects) { ctx.fillStyle = c; ctx.fillRect(ox + x * u, oy + y * u, w * u, h * u); }
}

// Пикапы: тип → что даёт и как выглядит.
const PICKUPS = {
  pistol: { give: 24, color: 0xb8ffc8 },
  bat: { give: 0, color: 0xd29a58 },
  shotgun: { give: 12, color: 0xffc070 },
  smg: { give: 60, color: 0xffe07a },
  ipo: { give: 2, color: 0xff5050 },
  moneygun: { give: 100, color: 0x7dff8a },
  grenade: { give: 2, color: 0xff6a3a },
};
const RESPAWN = 30;

function pickupModel(type) {
  const g = new THREE.Group();
  const col = PICKUPS[type].color;
  const glow = new THREE.MeshBasicMaterial({ color: col });
  const dark = new THREE.MeshBasicMaterial({ color: 0x2a2d34 });
  const model = new THREE.Group();
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); model.add(b); return b; };
  if (type === 'grenade') {
    model.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), glow));
    box(0.14, 0.16, 0.14, dark, 0, 0.34);
  } else if (type === 'bat') {
    box(1, 0.14, 0.14, glow).rotation.z = 0.5;
  } else if (type === 'ipo') {
    box(1.1, 0.22, 0.22, glow);
    box(0.18, 0.3, 0.3, new THREE.MeshBasicMaterial({ color: 0xffd23f }), 0.6);
    box(0.1, 0.25, 0.1, dark, -0.1, -0.22);
  } else if (type === 'moneygun') {
    box(0.7, 0.28, 0.22, glow);
    box(0.25, 0.4, 0.3, new THREE.MeshBasicMaterial({ color: 0x3aa65a }), 0.45);
    box(0.12, 0.3, 0.1, dark, -0.15, -0.25);
  } else {
    const len = type === 'smg' ? 0.9 : type === 'shotgun' ? 1.1 : 0.6;
    box(len, 0.2, 0.14, glow);
    box(0.16, 0.32, 0.12, dark, -len * 0.3, -0.22);
    if (type === 'smg') box(0.12, 0.36, 0.1, dark, 0.1, -0.26);
  }
  model.position.y = 1.1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: col }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.08;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.4, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 1.2;
  g.add(model, ring, beam);
  return { g, model };
}

const _dir = new THREE.Vector3();
const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const BILL_GEO = new THREE.BoxGeometry(0.36, 0.06, 0.18);
const BILL_MAT = new THREE.MeshLambertMaterial({ color: 0x5fc46a, emissive: 0x123a18 });

export class Arsenal {
  // ctx: { scene, camera, player, enemies, fx, hud, graffiti, war, colliders, state, cars, traffic, getVehicle, onKill, kick }
  constructor(ctx) {
    this.ctx = ctx;
    this.slots = Array(10).fill(null);
    this.ammo = {};
    for (const id of START) this.equip(id, true);
    this.current = 'pistol';
    this.cd = 0;
    this.reloadT = 0;
    this.prevFire = false;
    this.grenades = [];
    this.rockets = [];
    this.bills = [];
    this.wheel = null; // { sel, mx, my } пока зажат Tab
    this.pickups = [];
    this.placePickups();
  }

  get def() { return BY_ID[this.current]; }
  get aiming() { const d = this.def; return !d.melee && !d.thrown && !d.spray; }
  owned(id) { return BY_ID[id] && this.slots[BY_ID[id].slot] === id; }
  hasAmmo(id) { if (!this.owned(id)) return false; const a = this.ammo[id]; return !a || a.mag + a.res > 0; }
  ammoText(id) {
    const a = this.ammo[id], d = BY_ID[id];
    if (!a) return '';
    return d.thrown ? `${a.mag}` : `${a.mag}-${a.res}`;
  }

  // Положить оружие в его слот (заменяет прежнее в этом слоте) или добавить патроны.
  equip(id, fresh = false) {
    const d = BY_ID[id];
    const prev = this.slots[d.slot];
    if (prev !== id) {
      if (prev) delete this.ammo[prev];
      this.slots[d.slot] = id;
      if (d.thrown) this.ammo[id] = { mag: d.count, res: 0 };
      else if (d.mag) this.ammo[id] = { mag: d.mag, res: fresh ? d.reserve : Math.min(d.reserve, PICKUPS[id]?.give ?? d.reserve) };
      if (prev && this.current === prev) this.current = id;
      return prev;
    }
    const a = this.ammo[id], give = PICKUPS[id]?.give ?? 0;
    if (d.thrown) a.mag = Math.min(d.maxCount, a.mag + give);
    else if (a) a.res = Math.min(d.maxReserve, a.res + give);
    return prev;
  }

  // --- Выбор ---
  select(id, quiet = false) {
    if (!BY_ID[id] || !this.owned(id)) return false;
    if (!this.hasAmmo(id)) { if (!quiet) this.ctx.hud.toast('Нет патронов', '#ff6b6b'); return false; }
    if (this.current !== id) { this.reloadT = 0; this.cd = Math.max(this.cd, 0.15); }
    this.current = id;
    this.refreshHud();
    return true;
  }
  selectSlot(n) { const id = this.slots[n]; return id ? this.select(id) : false; }
  cycle(dir) {
    const i = BY_ID[this.current].slot;
    for (let k = 1; k <= 9; k++) {
      const s = ((i - 1 + dir * k) % 9 + 9) % 9 + 1;
      const id = this.slots[s];
      if (id && this.hasAmmo(id)) return this.select(id);
    }
    return false;
  }
  refreshHud() {
    const d = this.def;
    this.ctx.hud.setWeapon(d, this.ammoText(d.id), this.reloadT > 0);
  }

  // --- Колесо оружия (Tab) ---
  openWheel() {
    if (this.wheel) return;
    this.wheel = { sel: this.current, mx: 0, my: 0 };
    this.ctx.state.timeScale = 0.25;
    const items = [];
    for (let s = 1; s <= 9; s++) {
      const id = this.slots[s], d = id && BY_ID[id];
      items.push(d ? { ...d, ammo: this.ammoText(id), empty: !this.hasAmmo(id) } : { id: '', slot: s, short: SLOTS[s], ammo: '', empty: true });
    }
    this.ctx.hud.showWheel(items, this.current, (id) => this.hoverWheel(id));
  }
  // Направление мыши (в pointer lock — накопленный вектор).
  wheelMove(dx, dy) {
    const w = this.wheel;
    if (!w) return;
    w.mx += dx; w.my += dy;
    const len = Math.hypot(w.mx, w.my);
    if (len > 120) { w.mx *= 120 / len; w.my *= 120 / len; }
    if (len < 25) return;
    // Слот 1 сверху, дальше по часовой стрелке.
    let a = Math.atan2(w.mx, -w.my);
    if (a < 0) a += Math.PI * 2;
    const k = Math.round(a / (Math.PI * 2 / 9)) % 9;
    const id = this.slots[k + 1];
    if (id) this.hoverWheel(id);
  }
  hoverWheel(id) {
    if (!this.wheel || !id || !this.hasAmmo(id)) return;
    this.wheel.sel = id;
    this.ctx.hud.wheelSelect(id, BY_ID[id].name);
  }
  closeWheel() {
    if (!this.wheel) return;
    const id = this.wheel.sel;
    this.wheel = null;
    this.ctx.state.timeScale = 1;
    this.ctx.hud.hideWheel();
    this.select(id, true);
  }

  // --- Кадр ---
  update(dt, fire) {
    const { player, hud } = this.ctx;
    const vehicle = this.ctx.getVehicle();
    this.cd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }
    const d = this.def;
    const pressed = fire && !this.prevFire;
    this.prevFire = fire;
    if (!vehicle && !this.wheel) {
      if (fire && d.spray) this.sprayPaint(dt);
      else this.ctx.graffiti.current = null;
      if (fire && this.cd <= 0) {
        if (d.melee) this.punch();
        else if (d.thrown) { if (pressed) this.throwFromSlot(); }
        else if (d.mag) this.shoot();
      }
    } else this.ctx.graffiti.current = null;
    this.updateGrenades(dt);
    this.updateRockets(dt);
    this.updateBills(dt);
    this.updatePickups(dt, vehicle ? vehicle.position : player.position, vehicle ? 3 : 1.4);
    hud.setReload(this.reloadT > 0 ? 1 - this.reloadT / (d.reload || 1) : null);
  }

  hint() {
    const d = this.def, keys = 'колесо мыши, ~1~–~9~, ~Tab~ — оружие · ~G~ — «Дефолт» ($150)';
    if (d.spray) return `~ЛКМ~ на чужом граффити — перекрасить · ${keys}`;
    if (d.melee) return `~ЛКМ~ — удар · ${keys}`;
    if (d.thrown) return `~ЛКМ~ — бросить · ${keys}`;
    if (d.money) return `~ЛКМ~ — раздавать деньги · ~R~ — перезарядка · ${keys}`;
    return `~ЛКМ~ — огонь · ~R~ — перезарядка · ${keys}`;
  }
  // R — перезарядка вручную.
  manualReload() { if (!this.ctx.getVehicle()) this.startReload(); }

  // Отдача: рывок руки и камеры.
  recoil(d) {
    this.ctx.player.h.recoil = d.recoil ?? 1;
    if (d.kick) this.ctx.kick?.(d.kick * (0.8 + Math.random() * 0.4));
  }
  muzzle() {
    const { player } = this.ctx, h = player.heading;
    return player.position.clone().add(new THREE.Vector3(-Math.cos(h) * 0.45 + Math.sin(h) * 0.8, 1.6, Math.sin(h) * 0.45 + Math.cos(h) * 0.8));
  }

  // --- Огнестрел, ракетница, денежная пушка ---
  shoot() {
    const d = this.def, a = this.ammo[d.id];
    if (this.reloadT > 0) return;
    if (a.mag <= 0) {
      if (a.res > 0) return this.startReload();
      this.ctx.hud.toast('Нет патронов', '#ff6b6b');
      this.cd = 0.4;
      return this.cycle(1);
    }
    const { camera, colliders, enemies, fx } = this.ctx;
    this.cd = d.cd;
    a.mag--;
    sfx.play(d.id); // [v3-audio]
    const muzzle = this.muzzle();
    this.recoil(d);
    fx.spark(muzzle, d.money ? 0x9be89b : 0xfff0a0, d.pellets ? 0.3 : 0.15);
    camera.getWorldDirection(_dir);
    if (d.rocket) this.fireRocket(muzzle, _dir);
    else if (d.money) this.fireBills(muzzle, _dir);
    else {
      const o = camera.position.clone();
      for (let n = 0; n < (d.pellets || 1); n++) {
        const dir = _v.copy(_dir);
        if (d.spread) {
          dir.x += (Math.random() - 0.5) * 2 * d.spread;
          dir.y += (Math.random() - 0.5) * 2 * d.spread;
          dir.z += (Math.random() - 0.5) * 2 * d.spread;
          dir.normalize();
        }
        const wallT = rayBoxes(o, dir, colliders, 150);
        const hit = enemies.raycast(o, dir, wallT);
        const end = o.clone().addScaledVector(dir, hit ? hit.t : Math.min(wallT, 150));
        fx.tracer(muzzle, end, d.tracer);
        if (hit) {
          fx.spark(end, hit.head ? 0xff4040 : 0xffd27a);
          if (d.push) hit.e.position.addScaledVector(_o.set(dir.x, 0, dir.z).normalize(), d.push / (d.pellets || 1));
          const killed = enemies.damage(hit.e, hit.head ? d.head : d.dmg);
          if (killed) {
            if (d.push) hit.e.fling = _o.set(dir.x, 0, dir.z).normalize().multiplyScalar(9);
            this.ctx.onKill(hit.e);
          }
        }
      }
    }
    if (a.mag <= 0 && a.res > 0) this.startReload();
    this.refreshHud();
  }
  startReload() {
    const d = this.def, a = this.ammo[d.id];
    if (!a || d.thrown || this.reloadT > 0 || a.res <= 0 || a.mag >= d.mag) return;
    this.reloadT = d.reload;
    sfx.play('reload'); // [v3-audio]
    this.refreshHud();
  }
  finishReload() {
    const d = this.def, a = this.ammo[d.id];
    this.reloadT = 0;
    if (a && !d.thrown) {
      const n = Math.min(d.mag - a.mag, a.res);
      a.mag += n; a.res -= n;
    }
    this.refreshHud();
  }

  // --- Ближний бой: удар по всем в радиусе перед игроком ---
  punch() {
    const { player, enemies, fx } = this.ctx;
    const d = this.def;
    this.cd = d.cd;
    player.h.punchT = 1;
    if (d.recoil) player.h.recoil = d.recoil;
    const fx0 = Math.sin(player.heading), fz0 = Math.cos(player.heading);
    let hitAny = false;
    for (const e of enemies.alive()) {
      _v.subVectors(e.position, player.position).setY(0);
      const dist = _v.length() - e.radius;
      if (dist > d.range) continue;
      if (dist > 0.2 && (_v.x * fx0 + _v.z * fz0) / Math.max(1e-3, _v.length()) < 0.35) continue;
      hitAny = true;
      e.position.addScaledVector(_v.normalize(), d.push);
      fx.spark(e.position.clone().setY(1.4), 0xffd27a, 0.25);
      if (enemies.damage(e, d.dmg)) {
        if (d.id === 'bat') e.fling = _v.clone().multiplyScalar(8);
        this.ctx.onKill(e);
      }
    }
    sfx.play(hitAny ? 'punch' : 'swing'); // [v3-audio]
    return hitAny;
  }

  // --- Ракетница «IPO»: ракета, взрыв, машины подбрасывает ---
  fireRocket(from, dir) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xd8d8d8 }));
    body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 6), new THREE.MeshBasicMaterial({ color: 0xe8423a }));
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.45;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb030 }));
    flame.position.z = -0.42;
    g.add(body, tip, flame);
    g.position.copy(from);
    g.lookAt(from.clone().add(dir));
    this.ctx.scene.add(g);
    this.rockets.push({ g, dir: dir.clone(), t: 0, trail: 0 });
  }
  updateRockets(dt) {
    const { colliders, enemies, fx, scene } = this.ctx;
    for (const r of [...this.rockets]) {
      r.t += dt;
      const step = 48 * dt, p = r.g.position;
      let hitT = rayBoxes(p, r.dir, colliders, step);
      for (const e of enemies.alive()) if (_v.set(e.position.x, 1.2, e.position.z).distanceTo(p) < 1.1) hitT = 0;
      if (hitT < step || p.y < 0.2 || r.t > 3) {
        if (hitT < step) p.addScaledVector(r.dir, hitT);
        scene.remove(r.g);
        this.rockets.splice(this.rockets.indexOf(r), 1);
        this.explode(p.clone().setY(Math.max(0.5, p.y)), 8);
        continue;
      }
      p.addScaledVector(r.dir, step);
      if ((r.trail -= dt) <= 0) { r.trail = 0.04; fx.spark(p.clone(), 0xbbbbbb, 0.18); }
    }
  }
  explode(at, R) {
    const { fx, enemies, hud, cars, traffic, scene } = this.ctx;
    fx.blast(at, R, 0xffa030);
    fx.spark(at, 0xffffff, 1.2);
    for (const e of enemies.alive()) {
      _v.subVectors(e.position, at).setY(0);
      const d = _v.length();
      if (d > R) continue;
      if (enemies.damage(e, 40 + 140 * (1 - d / R))) {
        e.fling = _v.normalize().multiplyScalar(14).setY(0);
        this.ctx.onKill(e);
      } else e.position.addScaledVector(_v.normalize(), 2);
    }
    // Машины в воздух: свои — прыжком, машины трафика становятся «нашими» и тоже летят.
    const vehicle = this.ctx.getVehicle();
    for (const npc of [...(traffic?.cars || [])]) {
      if (npc.mesh.position.distanceTo(at) > R + 1) continue;
      traffic.cars.splice(traffic.cars.indexOf(npc), 1);
      const car = new Car(scene, npc.mesh.position, { mesh: npc.mesh, heading: npc.mesh.rotation.y });
      cars?.push(car);
    }
    for (const car of cars || []) {
      if (car === vehicle || car.position.distanceTo(at) > R + 1) continue;
      car.launch(10 + Math.random() * 4);
      car.speed = (Math.random() - 0.5) * 8;
      car.heading += (Math.random() - 0.5) * 1.5;
    }
    hud.subtitle('<b style="color:#ffa030">IPO!</b> Акции взлетели. Вместе с машинами', 2500);
  }

  // --- Денежная пушка: пачки купюр, урона нет; NPC сбегаются собирать ---
  fireBills(from, dir) {
    for (let n = 0; n < 3; n++) {
      const m = new THREE.Mesh(BILL_GEO, BILL_MAT);
      m.position.copy(from);
      const v = dir.clone().multiplyScalar(14 + Math.random() * 6);
      v.x += (Math.random() - 0.5) * 3; v.y += 2 + Math.random() * 3; v.z += (Math.random() - 0.5) * 3;
      this.ctx.scene.add(m);
      this.bills.push({ m, v, spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), t: 0, landed: false });
    }
    if (this.bills.length > 240) for (const b of this.bills.splice(0, this.bills.length - 240)) this.ctx.scene.remove(b.m);
  }
  updateBills(dt) {
    for (const b of [...this.bills]) {
      b.t += dt;
      if (!b.landed) {
        b.v.y -= 9 * dt;
        b.v.multiplyScalar(1 - 1.2 * dt); // купюры планируют
        b.m.position.addScaledVector(b.v, dt);
        b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
        if (b.m.position.y <= 0.3) {
          b.landed = true;
          b.m.position.y = 0.3;
          b.m.rotation.set(0, Math.random() * 6, 0);
          this.attractNpcs(b.m.position);
        }
      } else if (b.t > 25) {
        this.ctx.scene.remove(b.m);
        this.bills.splice(this.bills.indexOf(b), 1);
      }
    }
  }
  // Если в игре есть прохожие (window.__game.npcs) — зовём их к деньгам.
  attractNpcs(pos) {
    const npcs = window.__game?.npcs;
    if (!npcs) return;
    if (typeof npcs.attract === 'function') return npcs.attract(pos.clone());
    const list = Array.isArray(npcs) ? npcs : npcs.list;
    for (const n of list || []) {
      const p = n.position || n.mesh?.position;
      if (p && p.distanceTo(pos) < 30) n.cashTarget = pos.clone();
    }
  }

  // --- Баллончик ---
  sprayPaint(dt) {
    const { camera, player, graffiti, war, hud } = this.ctx;
    camera.getWorldDirection(_dir);
    const muzzle = player.position.clone().add(new THREE.Vector3(Math.sin(player.heading) * 0.8, 1.6, Math.cos(player.heading) * 0.8));
    const tag = graffiti.spray(dt, camera.position, _dir, player.position, muzzle);
    if (!tag) return;
    war.reach += 5;
    war.addMoney(25);
    const total = graffiti.inDistrict(tag.d).length, green = graffiti.greenCount(tag.d);
    const need = Math.ceil(total / 2);
    hud.toast(green >= need && green - 1 < need
      ? `Граффити ${green}/${total} · ${BANKS[tag.d.owner].name} заметил вас!`
      : `Граффити ${green}/${total} · Охваты +5`, BANKS.green.css);
  }

  // --- Граната «Дефолт»: взрыв с уроном, выжившие в радиусе замедлены на 5 с («счета заморожены») ---
  // G — быстрый бросок за $150; слот 8 — бросок ЛКМ из запаса.
  throwGrenade() {
    const { war, hud } = this.ctx;
    if (this.ctx.getVehicle()) return false;
    if (war.money < 150) { hud.toast('Нужно $150 на гранату «Дефолт»', '#ff6b6b'); return false; }
    war.addMoney(-150);
    this.launch();
    return true;
  }
  throwFromSlot() {
    const a = this.ammo.grenade;
    if (!a || a.mag <= 0) return this.cycle(1);
    a.mag--;
    this.cd = this.def.cd;
    this.ctx.player.h.punchT = 1;
    this.launch();
    if (a.mag <= 0) this.cycle(-1); else this.refreshHud();
  }
  launch() {
    const { camera, player, scene } = this.ctx;
    camera.getWorldDirection(_dir);
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xff6a3a }));
    mesh.position.copy(player.position).setY(player.position.y + 1.8);
    scene.add(mesh);
    sfx.play('throw'); // [v3-audio]
    this.grenades.push({ mesh, vel: new THREE.Vector3(_dir.x * 18, 7 + _dir.y * 12, _dir.z * 18), t: 0 });
  }
  updateGrenades(dt) {
    const { fx, enemies, hud, scene } = this.ctx;
    for (const g of [...this.grenades]) {
      g.t += dt;
      g.vel.y -= 20 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y > 0.3 && g.t < 2.5) continue;
      const at = g.mesh.position.clone().setY(0.5);
      sfx.play('explosion'); // [v3-audio]
      fx.blast(at, 11, 0xff8a3a);
      let n = 0;
      for (const e of enemies.alive()) {
        if (e.position.distanceTo(at) > 11) continue;
        n++;
        e.slowT = 5;
        if (enemies.damage(e, 35)) this.ctx.onKill(e);
      }
      hud.subtitle(`<b style="color:#ff8a3a">Объявлен дефолт!</b> Счета заморожены: ${n}`);
      scene.remove(g.mesh);
      this.grenades.splice(this.grenades.indexOf(g), 1);
    }
  }

  // --- Чит ARSENAL: всё оружие, полный боезапас. Слот «Тяжёлое» чередует IPO и денежную пушку. ---
  giveAll() {
    for (const d of WEAPONS) {
      if (d.id === 'fists' || d.id === 'ipo' || d.id === 'moneygun') continue;
      if (this.slots[d.slot] !== d.id) this.equip(d.id, true);
      const a = this.ammo[d.id];
      if (a && d.thrown) a.mag = d.maxCount;
      else if (a) { a.mag = d.mag; a.res = d.maxReserve; }
    }
    const heavy = this.slots[7] === 'ipo' ? 'moneygun' : 'ipo';
    this.equip(heavy, true);
    this.ammo[heavy].res = BY_ID[heavy].maxReserve;
    this.select(heavy, true);
    this.refreshHud();
    return BY_ID[heavy].name;
  }

  // --- Крутящиеся пикапы: кольцо у штаба + по улицам ---
  placePickups() {
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const types = ['bat', 'shotgun', 'smg', 'ipo', 'grenade', 'moneygun', 'pistol', 'shotgun', 'ipo', 'grenade', 'smg', 'bat', 'moneygun', 'pistol'];
    for (const type of types) {
      let p;
      for (let n = 0; n < 50; n++) {
        p = randomRoadPoint(rand);
        const q = p.clone();
        if (!resolveCircle(q, 1.2, this.ctx.colliders) && this.pickups.every((x) => x.pos.distanceTo(p) > 30)) break;
      }
      const { g, model } = pickupModel(type);
      g.position.copy(p);
      this.ctx.scene.add(g);
      this.pickups.push({ type, pos: p, g, model, t: 0, phase: rand() * 6 });
    }
  }
  // Первые 6 пикапов — кольцом у штаба, чтобы на демо далеко не бегать.
  movePickupsNear(center, n = 6) {
    this.pickups.slice(0, n).forEach((pk, i) => {
      const a = (i / n) * Math.PI * 2;
      pk.pos.set(center.x + Math.cos(a) * 7, 0, center.z + Math.sin(a) * 7);
      resolveCircle(pk.pos, 1.2, this.ctx.colliders);
      pk.g.position.copy(pk.pos);
    });
  }
  updatePickups(dt, at, r) {
    for (const pk of this.pickups) {
      if (pk.t > 0) {
        pk.t -= dt;
        if (pk.t <= 0) pk.g.visible = true;
        continue;
      }
      pk.phase += dt;
      pk.model.rotation.y = pk.phase * 2.2;
      pk.model.position.y = 1.1 + Math.sin(pk.phase * 3) * 0.12;
      if (Math.hypot(at.x - pk.pos.x, at.z - pk.pos.z) > r + 0.6 || Math.abs(at.y - pk.pos.y) > 2.5) continue;
      this.give(pk.type);
      pk.t = RESPAWN;
      pk.g.visible = false;
    }
  }
  give(type) {
    sfx.play('pickup'); // [v3-audio]
    const d = BY_ID[type];
    const had = this.slots[d.slot];
    this.equip(type);
    const color = '#' + PICKUPS[type].color.toString(16).padStart(6, '0');
    if (had === type) this.ctx.hud.toast(`${d.short}: +${PICKUPS[type].give}`, color);
    else this.ctx.hud.toast(had ? `${d.name} вместо «${BY_ID[had].short}»` : `Подобрано: ${d.name}`, color);
    const a = this.ammo[type];
    if (this.current === type && a && a.mag === 0 && !d.thrown) this.startReload();
    this.refreshHud();
  }
}
