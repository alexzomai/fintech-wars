import * as THREE from 'three';
import { BANKS, BLOCK, rayBoxes, resolveCircle, groundAt } from './city.js';
import { makeHuman, animateHuman, JOCK_PRESET } from './humans.js';
import { speechSprite } from './npc.js';

// Союзники Сбережёнки: амбассадоры (до 4, зовутся на G) и охрана штаба у Евразии.

const rnd = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export const ALLY_TYPES = {
  shooter: { name: 'стрелок', jacket: 0x1f6e3c, cap: false, cd: 0.6, dmg: 14, spread: 0.035, range: 30 },
  rifle: { name: 'автоматчик', jacket: 0x155a30, cap: true, cd: 0.14, dmg: 6, spread: 0.06, range: 34 },
  medic: { name: 'медик', jacket: 0xe8f4ec, cap: false, cd: 1.0, dmg: 9, spread: 0.05, range: 24, heal: 6 },
  tank: { name: 'качок-танк', jacket: 0x1f6e3c, cap: false, cd: 0.8, dmg: 16, spread: 0.05, range: 20, tank: true, hp: 300 },
  guard: { name: 'охрана', jacket: 0x0f3d22, cap: true, cd: 0.5, dmg: 12, spread: 0.04, range: 32 },
};
const ORDER = ['shooter', 'rifle', 'medic', 'tank'];
// Слоты построения за спиной игрока: [вправо, вперёд].
const SLOTS = [[-1.8, -2], [1.8, -2], [-1.6, -4.2], [1.6, -4.2]];
const triGeo = new THREE.ConeGeometry(0.22, 0.35, 3).rotateX(Math.PI);
const triMat = new THREE.MeshBasicMaterial({ color: 0x5dffa0 });

export class Allies {
  constructor(scene, { enemies, npcs, fx, hud, districts, colliders, onKill = null, max = 4 }) {
    Object.assign(this, { scene, enemies, npcs, fx, hud, districts, colliders, onKill, max });
    this.list = [];
    this.guards = [];
    this.inCar = false;
    this.spawnGuards();
  }

  get count() { return this.list.length + this.guards.length; }

  make(type, pos) {
    const T = ALLY_TYPES[type];
    const h = makeHuman({ ...(T.tank ? JOCK_PRESET : {}), jacket: T.jacket, accent: BANKS.green.color, pants: 0x22252c, cap: T.cap });
    const tri = new THREE.Mesh(triGeo, triMat);
    tri.position.y = 2.45;
    h.root.add(tri);
    h.root.position.copy(pos).setY(groundAt(pos.x, pos.z));
    this.scene.add(h.root);
    const a = { h, type, T, position: h.root.position, radius: 0.45, cooldown: rnd(0.2, 0.8), target: null, speed: 0, healT: 0, bubble: null, bubbleT: 0, tri };
    if (T.tank) {
      // Танк отвлекает огонь врагов на себя; выдохся — отдыхает 8 с.
      a.hp = T.hp;
      a.decoy = { position: a.position, active: true, hurt: (dmg) => {
        a.hp -= dmg; a.h.hitT = 1;
        if (a.hp <= 0) { a.decoy.active = false; a.restT = 8; this.say(a, 'Братан, я выдохся!'); }
      } };
      this.enemies.decoys.push(a.decoy);
    }
    return a;
  }

  spawnGuards() {
    const d = this.districts[0];
    if (!d?.hq) return;
    // Тротуар у штаба (восточная сторона квартала, где спавнится игрок).
    const x = d.hq.x + BLOCK / 2 - 1;
    for (const dz of [-4, 0, 4]) {
      const g = this.make('guard', new THREE.Vector3(x, 0, d.hq.z + dz));
      resolveCircle(g.position, g.radius, this.colliders);
      g.home = g.position.clone();
      g.h.root.rotation.y = Math.PI / 2; // смотрят на улицу
      this.guards.push(g);
    }
  }

  say(a, text, life = 2) {
    if (a.bubble) a.h.root.remove(a.bubble);
    a.bubble = speechSprite(text, '#0b6b30');
    a.bubble.position.y = 2.9;
    a.bubbleT = life;
    a.h.root.add(a.bubble);
  }

  // G: позвать в амбассадоры зелёного прохожего, на которого смотрит игрок.
  recruit(playerPos, lookDir) {
    if (this.list.length >= this.max) { this.hud?.toast(`Максимум ${this.max} амбассадора`, '#ff6b6b'); return null; }
    let best = null, bestScore = -Infinity;
    const lx = lookDir.x, lz = lookDir.z, ll = Math.hypot(lx, lz) || 1;
    for (const n of this.npcs.list) {
      if (n.dead || n.bank !== 'green') continue;
      _d.subVectors(n.position, playerPos).setY(0);
      const dist = _d.length();
      if (dist > 8) continue;
      const dot = dist < 1.5 ? 1 : (_d.x * lx + _d.z * lz) / (dist * ll);
      if (dot < 0.6) continue;
      const score = dot * 2 - dist * 0.15;
      if (score > bestScore) { bestScore = score; best = n; }
    }
    if (!best) { this.hud?.toast('Посмотри на зелёного прохожего рядом', '#ffd27a'); return null; }
    const pos = best.position.clone();
    const h = this.npcs.release(best);
    this.scene.remove(h.root);
    const hasTank = this.list.some((x) => x.type === 'tank');
    let type = best.type === 'jock' && !hasTank ? 'tank' : ORDER[this.list.length % ORDER.length];
    if (type === 'tank' && hasTank) type = 'shooter';
    const a = this.make(type, pos);
    a.h.root.rotation.y = h.root.rotation.y;
    a.slot = this.list.length;
    this.list.push(a);
    this.say(a, type === 'medic' ? 'Медик с вами!' : 'Я за Сбережёнку!');
    this.hud?.toast(`Амбассадор присоединился! (${ALLY_TYPES[type].name})`, BANKS.green.css);
    return a;
  }

  dismissAll() {
    this.list.forEach((a) => { this.scene.remove(a.h.root); if (a.decoy) this.enemies.decoys.splice(this.enemies.decoys.indexOf(a.decoy), 1); });
    this.list = [];
  }

  // Ближайший враг в зоне видимости.
  findTarget(a, range) {
    let best = null, bd = range;
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const d = Math.hypot(e.position.x - a.position.x, e.position.z - a.position.z);
      if (d >= bd) continue;
      const from = _v.set(a.position.x, 1.6, a.position.z);
      _d.set(e.position.x - from.x, (e.turret ? 0.7 : 1.3 * e.scale) - 1.6, e.position.z - from.z);
      const len = _d.length();
      _d.normalize();
      if (rayBoxes(from, _d, this.colliders, len) < len - 0.5) continue;
      bd = d; best = e;
    }
    return best;
  }

  fire(a, e) {
    const from = new THREE.Vector3(a.position.x, 1.55, a.position.z);
    const to = new THREE.Vector3(e.position.x, e.turret ? 0.7 : 1.3 * e.scale, e.position.z);
    const dir = to.sub(from).normalize();
    dir.x += rnd(-1, 1) * a.T.spread; dir.y += rnd(-1, 1) * a.T.spread; dir.z += rnd(-1, 1) * a.T.spread;
    dir.normalize();
    const wallT = rayBoxes(from, dir, this.colliders, a.T.range + 5);
    const hit = this.enemies.raycast(from, dir, wallT);
    const end = from.clone().addScaledVector(dir, hit ? hit.t : Math.min(wallT, a.T.range + 5));
    this.fx.tracer(from, end, 0x9dffc0);
    a.h.recoil = 1;
    this.shots = (this.shots || 0) + 1;
    if (hit) {
      this.fx.spark(end, 0xffd27a, 0.25);
      if (this.enemies.damage(hit.e, hit.head ? a.T.dmg * 2 : a.T.dmg)) this.onKill?.(hit.e);
    }
  }

  combat(a, dt) {
    a.cooldown -= dt;
    a.retarget = (a.retarget || 0) - dt;
    if (a.retarget <= 0 || a.target?.dead) { a.retarget = 0.4; a.target = this.findTarget(a, a.T.range); }
    if (!a.target) return false;
    _d.subVectors(a.target.position, a.position);
    a.h.root.rotation.y = Math.atan2(_d.x, _d.z);
    if (a.cooldown <= 0) { a.cooldown = a.T.cd * rnd(0.8, 1.3); this.fire(a, a.target); }
    return true;
  }

  // ctx: { player, vehicle }
  update(dt, { player, vehicle }) {
    const pp = player.position;
    // Машина: амбассадоры «садятся» (прячем) и выходят рядом.
    if (vehicle && !this.inCar) { this.inCar = true; this.list.forEach((a) => { a.h.root.visible = false; }); }
    if (!vehicle && this.inCar) {
      this.inCar = false;
      this.list.forEach((a, k) => {
        const ang = player.heading + Math.PI + (k - 1.5) * 0.6;
        a.position.set(pp.x + Math.sin(ang) * 2.2, 0, pp.z + Math.cos(ang) * 2.2);
        resolveCircle(a.position, a.radius, this.colliders);
        a.h.root.visible = true;
      });
    }

    for (const a of this.list) {
      if (a.bubble && (a.bubbleT -= dt) <= 0) { a.h.root.remove(a.bubble); a.bubble = null; }
      if (a.decoy) {
        a.decoy.active = !this.inCar && a.hp > 0;
        if (a.restT > 0 && (a.restT -= dt) <= 0) a.hp = a.T.hp;
      }
      if (this.inCar) { a.position.copy(vehicle.position); continue; }
      a.tri.rotation.y += dt * 3;
      // Слот построения относительно направления игрока.
      const [sx, sz] = SLOTS[a.slot % SLOTS.length];
      const hd = player.heading;
      const tx = pp.x + Math.cos(hd) * -sx + Math.sin(hd) * sz;
      const tz = pp.z + -Math.sin(hd) * -sx + Math.cos(hd) * sz;
      _v.set(tx - a.position.x, 0, tz - a.position.z);
      const far = _v.length();
      if (far > 45) { a.position.set(tx, 0, tz); _v.set(0, 0, 0); }
      const sp = far > 6 ? 7 : far > 1 ? 4 : 0;
      let mx = 0, mz = 0;
      if (sp && far > 1e-3) { mx = (_v.x / far) * sp; mz = (_v.z / far) * sp; }
      a.position.x += mx * dt;
      a.position.z += mz * dt;
      resolveCircle(a.position, a.radius, this.colliders);
      a.position.y = groundAt(a.position.x, a.position.z);
      a.speed = Math.hypot(mx, mz);
      const fighting = this.combat(a, dt);
      if (!fighting && a.speed > 0.3) a.h.root.rotation.y = Math.atan2(mx, mz);
      else if (!fighting) a.h.root.rotation.y = hd;
      // Медик подлечивает игрока.
      if (a.T.heal && player.hp < player.maxHp && Math.hypot(pp.x - a.position.x, pp.z - a.position.z) < 9) {
        a.healT -= dt;
        if (a.healT <= 0) {
          a.healT = 1;
          player.hp = Math.min(player.maxHp, player.hp + a.T.heal);
          this.fx.spark(new THREE.Vector3(pp.x, 2.2, pp.z), 0x5dffa0, 0.3);
        }
      }
      animateHuman(a.h, dt, { speed: a.speed, run: a.speed > 5, aiming: fighting });
    }

    for (const g of this.guards) {
      const d = Math.hypot(g.position.x - pp.x, g.position.z - pp.z);
      if (d > 110) continue; // далеко — не тратим расчёт
      const fighting = this.combat(g, dt);
      if (!fighting) g.h.root.rotation.y = Math.PI / 2;
      animateHuman(g.h, dt, { speed: 0, aiming: fighting });
      g.tri.rotation.y += dt * 3;
    }
  }
}
