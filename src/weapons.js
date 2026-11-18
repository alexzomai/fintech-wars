import * as THREE from 'three';
import { BANKS, rayBoxes, randomRoadPoint, resolveCircle } from './city.js';

// Арсенал в духе классических GTA: слоты 1–5, обойма/запас, перезарядка,
// листание Q/E/колесом, колесо оружия на Tab с замедлением, крутящиеся пикапы.

export const WEAPONS = [
  { id: 'fists', slot: 1, name: 'Кулаки', short: 'Кулаки', melee: true, cd: 0.45, dmg: 20, range: 1.8 },
  { id: 'pistol', slot: 2, name: 'Пистолет «Платёжный»', short: 'Платёжный', cd: 0.2, dmg: 25, head: 50, mag: 12, reserve: 60, maxReserve: 120, reload: 1.1, spread: 0.004, tracer: 0xb8ffc8 },
  { id: 'smg', slot: 3, name: 'Автомат «Микрозайм»', short: 'Микрозайм', cd: 0.08, dmg: 10, head: 20, mag: 30, reserve: 120, maxReserve: 240, reload: 1.6, spread: 0.035, tracer: 0xffe07a },
  { id: 'grenade', slot: 4, name: 'Граната «Дефолт»', short: 'Дефолт', thrown: true, cd: 0.8, count: 2, maxCount: 6 },
  { id: 'spray', slot: 5, name: 'Баллончик', short: 'Баллончик', spray: true },
];
const BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

// Пиктограммы в сетке 24×14: [x, y, w, h, цвет]. Рисуются с чёрной пиксельной обводкой.
const ICONS = {
  fists: [[0, 5, 5, 6, '#2ecc59'], [5, 3, 13, 9, '#d9a77c'], [6, 2, 3, 3, '#e8b88e'], [10, 2, 3, 3, '#e8b88e'], [14, 2, 3, 3, '#e8b88e'], [17, 7, 4, 4, '#d9a77c'], [6, 5, 11, 1, '#a8724e'], [9, 3, 1, 2, '#a8724e'], [13, 3, 1, 2, '#a8724e']],
  pistol: [[3, 3, 19, 4, '#c8ccd6'], [20, 4, 3, 2, '#8a909c'], [4, 7, 5, 7, '#3a3d46'], [9, 7, 4, 3, '#3a3d46'], [10, 8, 2, 1, '#c8ccd6'], [5, 4, 9, 1, '#2ecc59']],
  smg: [[0, 3, 3, 6, '#5a5f6a'], [3, 4, 17, 5, '#9aa0ac'], [20, 5, 4, 2, '#5a5f6a'], [12, 9, 3, 5, '#3a3d46'], [5, 9, 3, 4, '#3a3d46'], [4, 5, 10, 1, '#f5c518'], [16, 2, 2, 2, '#5a5f6a']],
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
  pistol: { give: 24, color: 0xb8ffc8, label: '+24 патрона «Платёжный»' },
  smg: { give: 60, color: 0xffe07a, label: '+60 патронов «Микрозайм»' },
  grenade: { give: 2, color: 0xff6a3a, label: '+2 гранаты «Дефолт»' },
};
const RESPAWN = 30;

function pickupModel(type) {
  const g = new THREE.Group();
  const col = PICKUPS[type].color;
  const glow = new THREE.MeshBasicMaterial({ color: col });
  const dark = new THREE.MeshBasicMaterial({ color: 0x2a2d34 });
  const model = new THREE.Group();
  if (type === 'grenade') {
    model.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), glow));
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), dark);
    top.position.y = 0.34; model.add(top);
  } else {
    const len = type === 'smg' ? 0.9 : 0.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.14), glow);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.12), dark);
    grip.position.set(-len * 0.3, -0.22, 0);
    model.add(body, grip);
    if (type === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.1), dark);
      mag.position.set(0.1, -0.26, 0); model.add(mag);
    }
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

export class Arsenal {
  // ctx: { scene, camera, player, enemies, fx, hud, graffiti, war, colliders, state, getVehicle, onKill }
  constructor(ctx) {
    this.ctx = ctx;
    this.current = 'pistol';
    this.ammo = {
      pistol: { mag: BY_ID.pistol.mag, res: BY_ID.pistol.reserve },
      smg: { mag: BY_ID.smg.mag, res: BY_ID.smg.reserve },
      grenade: { mag: BY_ID.grenade.count, res: 0 },
    };
    this.cd = 0;
    this.reloadT = 0;
    this.prevFire = false;
    this.grenades = [];
    this.wheel = null; // { sel, mx, my } пока зажат Tab
    this.pickups = [];
    this.placePickups();
  }

  get def() { return BY_ID[this.current]; }
  infinite(id) { return !this.ammo[id]; }
  hasAmmo(id) { const a = this.ammo[id]; return !a || a.mag + a.res > 0; }
  ammoText(id) {
    const a = this.ammo[id], d = BY_ID[id];
    if (!a) return '';
    return d.thrown ? `${a.mag}` : `${a.mag}-${a.res}`;
  }

  // --- Выбор ---
  select(id, quiet = false) {
    if (!BY_ID[id]) return false;
    if (!this.hasAmmo(id)) { if (!quiet) this.ctx.hud.toast('Нет патронов', '#ff6b6b'); return false; }
    if (this.current !== id) { this.reloadT = 0; this.cd = Math.max(this.cd, 0.15); }
    this.current = id;
    this.refreshHud();
    return true;
  }
  selectSlot(n) { const w = WEAPONS.find((x) => x.slot === n); return w ? this.select(w.id) : false; }
  cycle(dir) {
    const i = WEAPONS.findIndex((w) => w.id === this.current);
    for (let k = 1; k <= WEAPONS.length; k++) {
      const w = WEAPONS[(i + dir * k + WEAPONS.length * k) % WEAPONS.length];
      if (this.hasAmmo(w.id)) return this.select(w.id);
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
    this.ctx.hud.showWheel(WEAPONS.map((w) => ({ ...w, ammo: this.ammoText(w.id), empty: !this.hasAmmo(w.id) })), this.current, (id) => this.hoverWheel(id));
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
    const k = Math.round(a / (Math.PI * 2 / WEAPONS.length)) % WEAPONS.length;
    this.hoverWheel(WEAPONS[k].id);
  }
  hoverWheel(id) {
    if (!this.wheel || !this.hasAmmo(id)) return;
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
    this.updatePickups(dt, vehicle ? vehicle.position : player.position, vehicle ? 3 : 1.4);
    hud.setReload(this.reloadT > 0 ? 1 - this.reloadT / (d.reload || 1) : null);
  }

  hint() {
    const d = this.def;
    if (d.spray) return 'ЛКМ на чужом граффити — перекрасить · Q/E, 1–5 — оружие · Tab — колесо';
    if (d.melee) return 'ЛКМ — удар · Q/E, 1–5 — оружие · Tab — колесо · R — «Дефолт» ($150)';
    if (d.thrown) return 'ЛКМ — бросить · Q/E, 1–5 — оружие · Tab — колесо';
    return 'ЛКМ — огонь · Q/E, 1–5 — оружие · Tab — колесо · R — «Дефолт» ($150)';
  }

  // --- Огнестрел ---
  shoot() {
    const d = this.def, a = this.ammo[d.id];
    if (this.reloadT > 0) return;
    if (a.mag <= 0) {
      if (a.res > 0) return this.startReload();
      this.ctx.hud.toast('Нет патронов', '#ff6b6b');
      this.cd = 0.4;
      return this.cycle(1);
    }
    const { camera, colliders, enemies, fx, player } = this.ctx;
    this.cd = d.cd;
    a.mag--;
    camera.getWorldDirection(_dir);
    if (d.spread) {
      _dir.x += (Math.random() - 0.5) * 2 * d.spread;
      _dir.y += (Math.random() - 0.5) * 2 * d.spread;
      _dir.z += (Math.random() - 0.5) * 2 * d.spread;
      _dir.normalize();
    }
    const o = camera.position.clone();
    const wallT = rayBoxes(o, _dir, colliders, 150);
    const hit = enemies.raycast(o, _dir, wallT);
    const end = o.clone().addScaledVector(_dir, hit ? hit.t : Math.min(wallT, 150));
    const h = player.heading;
    const muzzle = player.position.clone().add(new THREE.Vector3(0, 1.6, 0))
      .add(new THREE.Vector3(-Math.cos(h) * 0.45 + Math.sin(h) * 0.8, 0, Math.sin(h) * 0.45 + Math.cos(h) * 0.8));
    fx.tracer(muzzle, end, d.tracer);
    fx.spark(muzzle, 0xfff0a0, 0.15);
    player.h.recoil = 1; // отдача в анимации руки
    if (hit) {
      fx.spark(end, hit.head ? 0xff4040 : 0xffd27a);
      if (enemies.damage(hit.e, hit.head ? d.head : d.dmg)) this.ctx.onKill(hit.e);
    }
    if (a.mag <= 0 && a.res > 0) this.startReload();
    this.refreshHud();
  }
  startReload() {
    const d = this.def, a = this.ammo[d.id];
    if (!a || d.thrown || this.reloadT > 0 || a.res <= 0 || a.mag >= d.mag) return;
    this.reloadT = d.reload;
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

  // --- Кулаки: удар по всем в ~1,8 м перед игроком ---
  punch() {
    const { player, enemies, fx } = this.ctx;
    const d = this.def;
    this.cd = d.cd;
    player.h.punchT = 1;
    const fx0 = Math.sin(player.heading), fz0 = Math.cos(player.heading);
    let hitAny = false;
    for (const e of enemies.alive()) {
      _v.subVectors(e.position, player.position).setY(0);
      const dist = _v.length() - e.radius;
      if (dist > d.range) continue;
      if (dist > 0.2 && (_v.x * fx0 + _v.z * fz0) / Math.max(1e-3, _v.length()) < 0.35) continue;
      hitAny = true;
      e.position.addScaledVector(_v.normalize(), 0.6);
      fx.spark(e.position.clone().setY(1.4), 0xffd27a, 0.25);
      if (enemies.damage(e, d.dmg)) this.ctx.onKill(e);
    }
    return hitAny;
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
  // R — быстрый бросок за $150 (как раньше); слот 4 — бросок ЛКМ из запаса.
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
    if (a.mag <= 0) return this.cycle(1);
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
    mesh.position.copy(player.position).setY(1.8);
    scene.add(mesh);
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

  // --- Крутящиеся пикапы на дорогах ---
  placePickups() {
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const types = ['pistol', 'smg', 'grenade', 'pistol', 'smg', 'grenade'];
    for (const type of types) {
      let p;
      for (let n = 0; n < 50; n++) {
        p = randomRoadPoint(rand);
        const q = p.clone();
        if (!resolveCircle(q, 1.2, this.ctx.colliders) && this.pickups.every((x) => x.pos.distanceTo(p) > 40)) break;
      }
      const { g, model } = pickupModel(type);
      g.position.copy(p);
      this.ctx.scene.add(g);
      this.pickups.push({ type, pos: p, g, model, t: 0, phase: rand() * 6 });
    }
  }
  // Пикапы рядом со спавном, чтобы далеко не бегать.
  movePickupsNear(center) {
    this.pickups.forEach((pk, i) => {
      const a = (i / this.pickups.length) * Math.PI * 2;
      pk.pos.set(center.x + Math.cos(a) * 6, 0, center.z + Math.sin(a) * 6);
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
      if (Math.hypot(at.x - pk.pos.x, at.z - pk.pos.z) > r + 0.6) continue;
      this.give(pk.type);
      pk.t = RESPAWN;
      pk.g.visible = false;
    }
  }
  give(type) {
    const d = BY_ID[type], a = this.ammo[type], info = PICKUPS[type];
    if (d.thrown) a.mag = Math.min(d.maxCount, a.mag + info.give);
    else a.res = Math.min(d.maxReserve, a.res + info.give);
    this.ctx.hud.toast(info.label, '#' + info.color.toString(16).padStart(6, '0'));
    if (this.current === type && a.mag === 0 && !d.thrown) this.startReload();
    this.refreshHud();
  }
}
