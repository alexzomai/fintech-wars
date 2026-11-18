import * as THREE from 'three';
import { BANKS, resolveCircle, rayBoxes } from './city.js';
import { makeHuman, animateHuman } from './humans.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

// Бойцы банков. Простое ИИ: стоят на посту → замечают игрока → сближаются и стреляют.
export class Enemies {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.list = [];
  }

  spawn(pos, bank, { tag = null, aggro = false, boss = false } = {}) {
    const h = makeHuman({ accent: BANKS[bank].color, suit: boss ? 0x111111 : 0x2a2d34, scale: boss ? 1.35 : 1 });
    h.root.position.copy(pos);
    this.scene.add(h.root);
    const hp = boss ? 250 : 40;
    const e = {
      h, bank, tag, boss, hp, maxHp: hp,
      position: h.root.position, radius: boss ? 0.8 : 0.55,
      home: pos.clone(), aggro, cooldown: 1 + Math.random(), slowT: 0,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, dead: false, deadT: 0, speed: 0,
    };
    this.list.push(e);
    return e;
  }

  alive(filter = () => true) { return this.list.filter((e) => !e.dead && filter(e)); }

  damage(e, dmg) {
    if (e.dead) return false;
    e.hp -= dmg;
    e.aggro = true;
    if (e.hp <= 0) { this.kill(e); return true; }
    return false;
  }

  kill(e, fling = null) {
    if (e.dead) return;
    e.dead = true;
    e.deadT = 0;
    e.fling = fling;
  }

  remove(e) {
    this.scene.remove(e.h.root);
    this.list.splice(this.list.indexOf(e), 1);
  }

  // Ближайшее попадание луча по живым бойцам: сфера тела + сфера головы (×2 урон).
  raycast(o, dir, maxT) {
    let best = null;
    for (const e of this.list) {
      if (e.dead) continue;
      const s = e.boss ? 1.35 : 1;
      for (const [y, r, head] of [[1.25 * s, 0.6 * s, false], [1.95 * s, 0.3 * s, true]]) {
        _v.set(e.position.x, y, e.position.z).sub(o);
        const tc = _v.dot(dir);
        if (tc < 0) continue;
        const d2 = _v.lengthSq() - tc * tc;
        if (d2 > r * r) continue;
        const t = tc - Math.sqrt(r * r - d2);
        if (t < maxT && (!best || t < best.t)) best = { e, t, head };
      }
    }
    return best;
  }

  // ctx: { target (Vector3), targetAlive, colliders, hurt(dmg, from) }
  update(dt, ctx) {
    for (const e of [...this.list]) {
      if (e.dead) {
        e.deadT += dt;
        // Падает на спину; после «полёта» от тарана — отлетает.
        e.h.root.rotation.x = Math.max(-Math.PI / 2, -e.deadT * 6);
        if (e.fling) { e.position.addScaledVector(e.fling, dt * Math.max(0, 1 - e.deadT * 2)); }
        if (e.deadT > 4) this.remove(e);
        continue;
      }
      if (e.frozen) { animateHuman(e.h, dt, 0, false); continue; } // для тестов и катсцен
      const slow = e.slowT > 0 ? 0.3 : 1;
      e.slowT -= dt;
      _d.subVectors(ctx.target, e.position).setY(0);
      const dist = _d.length();
      if (!e.aggro && ctx.targetAlive && dist < 32) e.aggro = true;

      let mx = 0, mz = 0;
      if (e.aggro && ctx.targetAlive) {
        _d.normalize();
        e.h.root.rotation.y = Math.atan2(_d.x, _d.z);
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = 1.5 + Math.random() * 2; }
        const sp = (e.boss ? 3.2 : 4.5) * slow;
        if (dist > 14) { mx = _d.x * sp; mz = _d.z * sp; }
        else if (dist < 7) { mx = -_d.x * sp; mz = -_d.z * sp; }
        else { mx = -_d.z * e.strafe * sp * 0.6; mz = _d.x * e.strafe * sp * 0.6; }

        e.cooldown -= dt * slow;
        if (e.cooldown <= 0 && dist < 45) {
          e.cooldown = (e.boss ? 0.5 : 1.1) + Math.random() * 0.6;
          this.shoot(e, ctx, dist);
        }
      } else {
        // На посту: медленно возвращаемся домой.
        _v.subVectors(e.home, e.position).setY(0);
        if (_v.length() > 2) { _v.normalize(); mx = _v.x * 2; mz = _v.z * 2; e.h.root.rotation.y = Math.atan2(_v.x, _v.z); }
      }
      e.position.x += mx * dt;
      e.position.z += mz * dt;
      e.speed = Math.hypot(mx, mz);
      // Расталкиваемся друг с другом и со зданиями.
      for (const o of this.list) {
        if (o === e || o.dead) continue;
        const dx = e.position.x - o.position.x, dz = e.position.z - o.position.z;
        const dd = Math.hypot(dx, dz), r = e.radius + o.radius;
        if (dd < r && dd > 1e-4) { e.position.x += (dx / dd) * (r - dd) * 0.5; e.position.z += (dz / dd) * (r - dd) * 0.5; }
      }
      resolveCircle(e.position, e.radius, ctx.colliders);
      animateHuman(e.h, dt, e.speed, e.aggro);
    }
  }

  shoot(e, ctx, dist) {
    const s = e.boss ? 1.35 : 1;
    const from = new THREE.Vector3(e.position.x, 1.6 * s, e.position.z);
    const to = ctx.target.clone().setY(1.3);
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    // Стена между бойцом и игроком — не стреляем.
    if (rayBoxes(from, dir, ctx.colliders, len) < len - 0.5) { e.cooldown = 0.4; return; }
    const hitChance = Math.max(0.15, Math.min(0.7, 0.75 - dist / 70));
    const hit = Math.random() < hitChance;
    const end = hit ? to : to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 3));
    this.fx.tracer(from, end, BANKS[e.bank].color);
    if (hit) ctx.hurt(e.boss ? 10 : 5 + Math.floor(Math.random() * 4), e);
  }
}
