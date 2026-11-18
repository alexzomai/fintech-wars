import * as THREE from 'three';
import { BANKS, resolveCircle, rayBoxes, roadCoord, HALF, CELL } from './city.js';
import { makeHuman, animateHuman } from './humans.js';
import { makeCarMesh } from './car.js';
import { enableSnap } from './retro.js';
import { speechSprite } from './npc.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Типы бойцов. melee — бьёт вблизи, seller — «страховка» (замедляет игрока), turret — ставит турель.
export const ENEMY_TYPES = {
  grunt: { hp: 40, speed: 4.5, scale: 1, jacket: 0x2a2d34, dmg: [5, 9], cd: 1.1 },
  promoter: { hp: 35, speed: 4.5, scale: 1, jacket: 0x34363e, dmg: [4, 8], cd: 1.2, cap: true },
  // 🔴 Алый-банк
  collector: { hp: 130, speed: 2.6, scale: 1.22, jacket: 0x4a1010, pants: 0x111111, dmg: [18, 24], cd: 1.3, melee: true, bat: true },
  broker: { hp: 22, speed: 6.8, scale: 0.94, jacket: 0x707684, pants: 0x3a3f4a, dmg: [4, 6], cd: 0.75 },
  thug: { hp: 80, speed: 4.8, scale: 1.3, jacket: 0x161616, dmg: [12, 16], cd: 0.9, melee: true, cap: true },
  // 🟡 Тёплый-Банк
  courier: { hp: 28, speed: 8.5, scale: 0.95, jacket: 0xffb300, dmg: [6, 9], cd: 0.8, melee: true, cap: true, scooter: true },
  seller: { hp: 35, speed: 5.5, scale: 1, jacket: 0xfff0b0, pants: 0x6b5a3a, cd: 3, seller: true },
  sysadmin: { hp: 40, speed: 3.5, scale: 1, jacket: 0x3b4a5a, pants: 0x2a3340, dmg: [4, 6], cd: 1.4, sysadmin: true },
};
export const BANK_TYPES = { red: ['collector', 'broker', 'broker', 'thug'], yellow: ['courier', 'seller', 'sysadmin', 'courier'], green: ['grunt'] };
export const randomType = (bank) => pick(BANK_TYPES[bank] || ['grunt']);

const SELLER_LINES = ['Оформим страховку?', 'Кэшбэк 0,5%!', 'Всего одна подпись!', 'Кредитка в подарок!'];

const propMat = (c) => enableSnap(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true }));
const PROP = {
  bat: new THREE.CylinderGeometry(0.035, 0.06, 0.8, 6).rotateX(Math.PI / 2).translate(0, -0.08, 0.4),
  deck: new THREE.BoxGeometry(0.22, 0.06, 0.95),
  pole: new THREE.CylinderGeometry(0.025, 0.025, 1.05, 5),
  bar: new THREE.BoxGeometry(0.5, 0.04, 0.04),
  wheel: new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8).rotateZ(Math.PI / 2),
  turret: new THREE.BoxGeometry(0.9, 0.9, 0.9),
  turretHead: new THREE.BoxGeometry(0.5, 0.35, 0.5),
  barrel: new THREE.BoxGeometry(0.1, 0.1, 0.7).translate(0, 0, 0.35),
};

// Бойцы банков. Простое ИИ: стоят на посту → замечают игрока → сближаются и стреляют/бьют.
export class Enemies {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.list = [];
    this.convoys = [];
    this.groups = [];
    this.playerSlowT = 0; // «страховка» менеджера тёплых продаж
    this.onShot = null; // (pos) => void — выстрел врага (паника мирных)
    this._prev = null;
  }

  // type: см. ENEMY_TYPES; без type — прежний универсальный боец.
  spawn(pos, bank, { tag = null, aggro = false, boss = false, type = 'grunt' } = {}) {
    const T = ENEMY_TYPES[type] || ENEMY_TYPES.grunt;
    const scale = boss ? 1.35 : T.scale;
    const h = makeHuman({ accent: BANKS[bank].color, jacket: boss ? 0x111111 : T.jacket, pants: T.pants, cap: T.cap, scale });
    if (T.bat) { h.gun.visible = false; h.gun = new THREE.Mesh(PROP.bat, propMat(0x6b4a2a)); h.armR.hand.add(h.gun); }
    if (T.seller) { h.armR.hand.remove(h.gun); h.gun = new THREE.Object3D(); const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.02), propMat(0xffffff)); p.position.set(0, -0.1, 0.06); h.armR.hand.add(p); }
    if (T.scooter) {
      const s = new THREE.Group();
      const deck = new THREE.Mesh(PROP.deck, propMat(0x222222)); deck.position.y = 0.12;
      const pole = new THREE.Mesh(PROP.pole, propMat(BANKS[bank].color)); pole.position.set(0, 0.62, 0.42);
      const bar = new THREE.Mesh(PROP.bar, propMat(0x222222)); bar.position.set(0, 1.12, 0.42);
      s.add(deck, pole, bar);
      for (const z of [-0.42, 0.42]) { const w = new THREE.Mesh(PROP.wheel, propMat(0x111111)); w.position.set(0, 0.09, z); s.add(w); }
      h.root.add(s);
      h.root.position.y = 0.12;
    }
    h.root.position.x = pos.x; h.root.position.z = pos.z;
    this.scene.add(h.root);
    const hp = boss ? 250 : T.hp;
    const e = {
      h, bank, tag, boss, hp, maxHp: hp, type, T, scale,
      position: h.root.position, radius: boss ? 0.8 : 0.55 * scale,
      home: pos.clone().setY(0), aggro, cooldown: 1 + Math.random(), slowT: 0, swingT: 0,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, dead: false, deadT: 0, speed: 0,
    };
    this.list.push(e);
    return e;
  }

  // Банда промоутеров: n человек кругом, болтают и курят, агрятся вместе.
  spawnGroup(center, bank, n = 4, tag = null) {
    const group = { members: [], center: center.clone().setY(0), aggro: false };
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd(-0.2, 0.2);
      const p = new THREE.Vector3(center.x + Math.sin(a) * 1.6, 0, center.z + Math.cos(a) * 1.6);
      const e = this.spawn(p, bank, { tag, type: 'promoter' });
      e.group = group;
      e.h.root.rotation.y = a + Math.PI; // лицом в круг
      e.smoker = k % 2 === 0;
      e.lookT = Math.random() * 2;
      e.headYaw = 0;
      group.members.push(e);
    }
    this.groups.push(group);
    return group;
  }

  // Подкрепление: машина цвета банка подъезжает по ближайшей дороге, бойцы выбегают.
  spawnReinforcements(pos, bank, n = 3, tag = null) {
    const ix = Math.round((pos.x + HALF) / CELL), iz = Math.round((pos.z + HALF) / CELL);
    const rx = roadCoord(ix), rz = roadCoord(iz);
    const alongZ = Math.abs(pos.x - rx) < Math.abs(pos.z - rz); // дорога, идущая вдоль Z
    // Едем от центра карты наружу, так что старт (за 40 м) всегда внутри города.
    const sgn = (alongZ ? pos.z : pos.x) > 0 ? 1 : -1;
    const dir = alongZ ? new THREE.Vector3(0, 0, sgn) : new THREE.Vector3(sgn, 0, 0);
    const lane = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(3); // правая полоса
    const to = (alongZ ? new THREE.Vector3(rx, 0, pos.z) : new THREE.Vector3(pos.x, 0, rz)).add(lane);
    const from = to.clone().addScaledVector(dir, -40);
    const mesh = makeCarMesh(BANKS[bank].color);
    mesh.position.copy(from);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    this.scene.add(mesh);
    const c = { mesh, position: mesh.position, from, to, dir, bank, n, tag, state: 'drive', speed: 16, t: 0, spawned: [] };
    this.convoys.push(c);
    return c;
  }

  alive(filter = () => true) { return this.list.filter((e) => !e.dead && filter(e)); }

  damage(e, dmg) {
    if (e.dead) return false;
    e.hp -= dmg;
    e.aggro = true;
    if (e.group) e.group.aggro = true;
    e.h.hitT = 1; // откидывание корпуса
    if (e.hp <= 0) { this.kill(e); return true; }
    return false;
  }

  kill(e, fling = null) {
    if (e.dead) return;
    e.dead = true;
    e.deadT = 0;
    e.fling = fling;
    if (e.bubble) { e.h.root.remove(e.bubble); e.bubble = null; }
  }

  remove(e) {
    this.scene.remove(e.h.root);
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
  }

  // Ближайшее попадание луча по живым бойцам: сфера тела + сфера головы (×2 урон).
  raycast(o, dir, maxT, skip = null) {
    let best = null;
    for (const e of this.list) {
      if (e.dead || e === skip) continue;
      const s = e.scale;
      const spheres = e.turret ? [[0.7, 0.75, false]] : [[1.25 * s, 0.6 * s, false], [1.95 * s, 0.3 * s, true]];
      for (const [y, r, head] of spheres) {
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

  placeTurret(owner) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(PROP.turret, propMat(0x4a5560)); base.position.y = 0.45;
    const head = new THREE.Group(); head.position.y = 1.05;
    head.add(new THREE.Mesh(PROP.turretHead, propMat(BANKS[owner.bank].color)));
    const barrel = new THREE.Mesh(PROP.barrel, propMat(0x111111)); head.add(barrel);
    g.add(base, head);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const side = new THREE.Vector3(Math.cos(owner.h.root.rotation.y), 0, -Math.sin(owner.h.root.rotation.y));
    g.position.copy(owner.position).addScaledVector(side, 1.6).setY(0);
    this.scene.add(g);
    const t = {
      h: { root: g, hitT: 0, recoil: 0 }, turretHead: head, bank: owner.bank, tag: null, boss: false, hp: 60, maxHp: 60,
      type: 'turret', T: { dmg: [4, 6] }, scale: 1, turret: true, position: g.position, radius: 0.7,
      home: g.position.clone(), aggro: true, cooldown: 1.5, life: 40, dead: false, deadT: 0, speed: 0, slowT: 0,
    };
    this.list.push(t);
    return t;
  }

  say(e, text, life = 2) {
    if (e.bubble) e.h.root.remove(e.bubble);
    e.bubble = speechSprite(text);
    e.bubble.position.y = 2.6 / e.scale;
    e.bubble.scale.multiplyScalar(1 / e.scale);
    e.bubbleT = life;
    e.h.root.add(e.bubble);
  }

  updateConvoys(dt) {
    for (const c of [...this.convoys]) {
      c.t += dt;
      if (c.state === 'drive') {
        const left = c.position.distanceTo(c.to);
        c.speed = Math.max(5, Math.min(16, left * 1.5));
        c.position.addScaledVector(c.dir, Math.min(left, c.speed * dt));
        if (left < 0.3) {
          c.state = 'unload'; c.t = 0;
          const side = new THREE.Vector3(c.dir.z, 0, -c.dir.x);
          for (let k = 0; k < c.n; k++) {
            const p = c.position.clone().addScaledVector(side, k % 2 ? 2 : -2).addScaledVector(c.dir, (k >> 1) * 1.4 - 1);
            const pool = BANK_TYPES[c.bank] || ['grunt'];
            const e = this.spawn(p, c.bank, { tag: c.tag, aggro: true, type: pool[k % pool.length] });
            e.fromCar = c;
            c.spawned.push(e);
          }
          this.say(c.spawned[0], 'Где он?!');
        }
      } else if (c.state === 'unload' && c.t > 6) {
        c.state = 'leave'; c.t = 0;
      } else if (c.state === 'leave') {
        c.speed = Math.min(18, c.speed + dt * 8);
        c.position.addScaledVector(c.dir, c.speed * dt);
        if (c.t > 4) { this.scene.remove(c.mesh); this.convoys.splice(this.convoys.indexOf(c), 1); }
      }
    }
  }

  // ctx: { target (Vector3), targetAlive, colliders, hurt(dmg, from) }
  update(dt, ctx) {
    // «Страховка»: игрок вязнет — откатываем часть смещения за кадр.
    if (this._prev && this.playerSlowT > 0) {
      ctx.target.x = this._prev.x + (ctx.target.x - this._prev.x) * 0.4;
      ctx.target.z = this._prev.z + (ctx.target.z - this._prev.z) * 0.4;
    }
    this.playerSlowT = Math.max(0, this.playerSlowT - dt);
    (this._prev ||= new THREE.Vector3()).copy(ctx.target);
    this.updateConvoys(dt);
    for (const g of this.groups) {
      if (!g.aggro && g.members.some((m) => m.aggro && !m.dead)) g.aggro = true;
      if (g.aggro) g.members.forEach((m) => { m.aggro = true; });
    }
    this.groups = this.groups.filter((g) => g.members.some((m) => !m.dead));

    for (const e of [...this.list]) {
      if (e.bubble && (e.bubbleT -= dt) <= 0) { e.h.root.remove(e.bubble); e.bubble = null; }
      if (e.turret) { this.updateTurret(e, dt, ctx); continue; }
      if (e.dead) {
        e.deadT += dt;
        // Падает на спину; после «полёта» от тарана — отлетает.
        e.h.root.rotation.x = Math.max(-Math.PI / 2, -e.deadT * e.deadT * 14);
        animateHuman(e.h, dt, { speed: 0, crouch: Math.min(1, e.deadT * 2) });
        if (e.fling) { e.position.addScaledVector(e.fling, dt * Math.max(0, 1 - e.deadT * 2)); }
        if (e.deadT > 4) this.remove(e);
        continue;
      }
      if (e.frozen) { animateHuman(e.h, dt, { speed: 0 }); continue; } // для тестов и катсцен
      const T = e.T;
      const slow = e.slowT > 0 ? 0.3 : 1;
      e.slowT -= dt;
      e.swingT = Math.max(0, e.swingT - dt * 3);
      _d.subVectors(ctx.target, e.position).setY(0);
      const dist = _d.length();
      if (!e.aggro && ctx.targetAlive && dist < (e.group ? 22 : 32)) e.aggro = true;

      let mx = 0, mz = 0;
      if (e.aggro && ctx.targetAlive) {
        _d.normalize();
        e.h.root.rotation.y = Math.atan2(_d.x, _d.z);
        const sp = (e.boss ? 3.2 : T.speed) * slow;
        e.cooldown -= dt * slow;
        if (T.melee || T.seller) {
          // Ближний бой: в упор, без стрейфа.
          const reach = 1.3 + e.radius;
          if (dist > reach) { mx = _d.x * sp; mz = _d.z * sp; }
          if (dist < reach + 0.4 && e.cooldown <= 0) {
            e.cooldown = T.cd * rnd(0.85, 1.2);
            e.swingT = 1;
            if (T.seller) {
              this.playerSlowT = 2.5; this.slowHits = (this.slowHits || 0) + 1;
              this.say(e, pick(SELLER_LINES));
            } else ctx.hurt(Math.round(rnd(...T.dmg)), e);
          }
        } else {
          e.strafeT -= dt;
          if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = 1.5 + Math.random() * 2; }
          if (dist > 14) { mx = _d.x * sp; mz = _d.z * sp; }
          else if (dist < 7) { mx = -_d.x * sp; mz = -_d.z * sp; }
          else { mx = -_d.z * e.strafe * sp * 0.6; mz = _d.x * e.strafe * sp * 0.6; }
          if (T.sysadmin && !e.turretPlaced && dist < 30) { e.turretPlaced = true; this.placeTurret(e); this.say(e, 'Перезагрузите игрока'); }
          if (e.cooldown <= 0 && dist < 45) {
            e.cooldown = (e.boss ? 0.5 : T.cd) + Math.random() * 0.6;
            this.shoot(e, ctx, dist);
          }
        }
      } else if (e.group && !e.group.aggro) {
        // Тусовка: болтают, крутят головами, курят.
        e.lookT -= dt;
        if (e.lookT <= 0) { e.lookT = rnd(1.2, 3); e.headYawT = rnd(-0.9, 0.9); }
        e.headYaw += ((e.headYawT || 0) - e.headYaw) * Math.min(1, dt * 4);
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
      if (T.scooter) {
        // Самокат: стоит на деке, слегка присел, ноги не шагают.
        animateHuman(e.h, dt, { speed: 0, crouch: 0.25, aiming: false });
        e.h.root.rotation.z = Math.sin(e.h.t * 3) * 0.05;
      } else {
        animateHuman(e.h, dt, { speed: e.speed, run: e.speed > 5, aiming: e.aggro && !T.melee && !T.seller });
      }
      if (e.swingT > 0) {
        // Замах битой/кулаком/планшетом.
        e.h.armR.shoulder.rotation.x = -2.6 + (1 - e.swingT) * 2.4;
        e.h.armR.shoulder.rotation.z = 0.5;
      }
      if (e.group && !e.group.aggro) {
        e.h.head.rotation.y = e.headYaw;
        if (e.smoker) {
          // Сигарета ко рту каждые несколько секунд.
          const k = Math.max(0, Math.sin(e.h.t * 1.3 + e.lookT));
          e.h.armL.shoulder.rotation.x = -k * 1.6;
          e.h.armL.elbow.rotation.x = -k * 2.2;
        }
        e.h.gun.visible = false;
      }
    }
  }

  updateTurret(e, dt, ctx) {
    if (e.dead) {
      e.deadT += dt;
      e.h.root.scale.setScalar(Math.max(0.01, 1 - e.deadT));
      if (e.deadT > 1) this.remove(e);
      return;
    }
    e.life -= dt;
    if (e.life <= 0) { this.kill(e); return; }
    _d.subVectors(ctx.target, e.position).setY(0);
    const dist = _d.length();
    e.turretHead.rotation.y = Math.atan2(_d.x, _d.z);
    e.cooldown -= dt;
    if (ctx.targetAlive && e.cooldown <= 0 && dist < 35) {
      e.cooldown = 0.9 + Math.random() * 0.5;
      this.shoot(e, ctx, dist, 1.1);
    }
  }

  shoot(e, ctx, dist, y = null) {
    const s = e.scale;
    const from = new THREE.Vector3(e.position.x, y ?? 1.6 * s, e.position.z);
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
    e.h.recoil = 1;
    this.onShot?.(from);
    const [a, b] = e.T.dmg || [5, 9];
    if (hit) ctx.hurt(e.boss ? 10 : Math.round(rnd(a, b)), e);
  }
}
