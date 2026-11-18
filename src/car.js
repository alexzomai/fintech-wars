import * as THREE from 'three';
import { resolveCircle } from './city.js';
import { enableSnap } from './retro.js';

// Меш машинки из боксов. Перед машины смотрит в +Z.
export function makeCarMesh(color = 0xff4d4d) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 4.4), new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 }));
  body.position.y = 0.8;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 2.2), new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.6, roughness: 0.2 }));
  cabin.position.set(0, 1.5, -0.3);
  g.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const [x, z] of [[-1.1, 1.4], [1.1, 1.4], [-1.1, -1.4], [1.1, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.45, z);
    g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const x of [-0.7, 0.7]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.05), lightMat);
    l.position.set(x, 0.9, 2.21);
    g.add(l);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; enableSnap(o.material); } });
  return g;
}

// --- Частицы: дым из-под колёс, из капота, огонь. Общий пул, шаг в Car.tick(dt). ---
const PUFF_GEO = new THREE.IcosahedronGeometry(0.5, 0);
const puffs = [];
let puffScene = null;
function puff(at, { color = 0xcfcfcf, size = 0.6, life = 0.9, rise = 1.2, grow = 2.2, opacity = 0.55, vel = null } = {}) {
  if (!puffScene || puffs.length > 220) return;
  const m = new THREE.Mesh(PUFF_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.position.copy(at);
  m.scale.setScalar(size);
  m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  puffScene.add(m);
  puffs.push({ m, t: 0, life, rise, grow, size, opacity, vel: vel || new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8) });
}
function stepPuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.t += dt;
    const k = p.t / p.life;
    if (k >= 1) { puffScene.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); continue; }
    p.m.position.addScaledVector(p.vel, dt);
    p.m.position.y += p.rise * dt;
    p.vel.multiplyScalar(Math.max(0, 1 - 2 * dt));
    p.m.scale.setScalar(p.size * (1 + k * p.grow));
    p.m.material.opacity = p.opacity * (1 - k);
  }
}

const _v = new THREE.Vector3();
const BLAST_R = 9;

// Физика «потяжелее»: курс и скорость раздельно, боковое скольжение (занос), крен и подвеска,
// ручник срывает зад в занос. Повреждения: дым → огонь → взрыв с отбрасыванием.
// `speed` — продольная скорость (её читают трамплины и main), `slip` — боковая (вправо +).
export class Car {
  // Контекст мира для взрывов; ставится из main.js: { scene, fx, enemies, player, cars, hurt, onKill, getVehicle, exit, state }.
  static ctx = null;
  static wrecks = [];

  constructor(scene, pos, { mesh = null, heading = 0, color = 0x2ecc59 } = {}) {
    this.mesh = mesh || makeCarMesh(color);
    this.mesh.position.copy(pos);
    if (!mesh) scene.add(this.mesh);
    puffScene ||= scene;
    this.heading = heading;
    this.speed = 0;
    this.slip = 0;
    this.yawRate = 0;
    this.radius = 1.9;
    this.vy = 0;
    this.airborne = false;
    this.maxHp = 100;
    this.hp = 100;
    this.wrecked = false;
    this.roll = 0; this.rollV = 0;
    this.pitch = 0; this.pitchV = 0;
    this.drifting = false;
    this._lastSpeed = 0;
    this._lastSlip = 0;
    this._fxT = 0;
    this.mesh.rotation.order = 'YXZ'; // курс, затем тангаж и крен в локальных осях
  }

  // Прыжок с трамплина: вертикальная скорость, горизонтальная сохраняется.
  launch(vy) {
    this.vy = vy;
    this.airborne = true;
  }

  get position() { return this.mesh.position; }

  damage(n) {
    if (this.wrecked || n <= 0) return;
    const ctx = Car.ctx;
    if (ctx?.state?.god && ctx.getVehicle?.() === this) return; // бессмертие распространяется на свою машину
    this.hp = Math.max(0, this.hp - n);
  }

  update(dt, input, colliders) {
    if (this.wrecked) return;
    const MAX = 38, REV = -12;
    // Удар: резкая потеря скорости с прошлого кадра (стена, трафик, другая машина) — урон.
    if (!this.airborne) {
      const dv = Math.hypot(this.speed - this._lastSpeed, this.slip - this._lastSlip);
      if (dv > 9 && Math.hypot(this.speed, this.slip) < Math.hypot(this._lastSpeed, this._lastSlip)) this.damage((dv - 9) * 1.6);
    }
    const accel0 = this.speed;
    const brake = !!(input && input.brake);
    if (input) {
      if (input.up) this.speed += (this.speed < 0 ? 40 : 20) * dt;
      else if (input.down) this.speed -= (this.speed > 0 ? 36 : 13) * dt;
      if (brake) this.speed *= Math.max(0, 1 - 1.4 * dt); // ручник: колёса блокируются, но машина скользит
    }
    // Сопротивление качению и воздуха; скольжение боком тоже тормозит.
    this.speed -= this.speed * 0.45 * dt;
    if (!input || (!input.up && !input.down)) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3.5 * dt);
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), Math.abs(this.slip) * 0.35 * dt);
    this.speed = Math.max(REV, Math.min(MAX, this.speed));

    if (this.airborne) {
      // Полёт: без управления, гравитация, нос плавно опускается.
      this.vy -= 22 * dt;
      this.mesh.position.y += this.vy * dt;
      this.mesh.rotation.x = Math.max(-0.5, Math.min(0.35, -this.vy * 0.03));
      if (this.mesh.position.y <= 0) {
        this.mesh.position.y = 0;
        this.vy = 0;
        this.airborne = false;
        this.mesh.rotation.x = 0;
        this.speed *= 0.85;
        this.pitchV += 1.5; // подвеска проседает при приземлении
      }
      input = null;
    }
    // Руль: поворот курса. Скорость в мире сохраняется — часть уходит в боковое скольжение.
    let yaw = 0;
    if (input) {
      const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      const grip = Math.min(1, Math.abs(this.speed) / 8) * Math.sign(this.speed);
      const highSpeedDamp = 1 - Math.min(0.35, Math.abs(this.speed) / 110); // на скорости руль «тяжелее»
      yaw = steer * 2.2 * grip * highSpeedDamp * (brake ? 1.7 : 1);
    }
    this.yawRate += (yaw - this.yawRate) * Math.min(1, dt * 8); // инерция руля/кузова
    const dth = this.yawRate * dt;
    if (dth) {
      const c = Math.cos(dth), s = Math.sin(dth);
      const f = this.speed, r = this.slip;
      this.speed = f * c - r * s;
      this.slip = f * s + r * c;
      this.heading += dth;
    }
    // Сцепление шин гасит боковую скорость; на ручнике — почти нет.
    const k = this.airborne ? 0 : brake ? 1.3 : Math.abs(this.slip) > 7 ? 5 : 11;
    this.slip *= Math.exp(-k * dt);
    this.drifting = !this.airborne && Math.abs(this.slip) > 3.5 && Math.hypot(this.speed, this.slip) > 6;

    const p = this.mesh.position;
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    p.x += (sh * this.speed - ch * this.slip) * dt;
    p.z += (ch * this.speed + sh * this.slip) * dt;
    if (resolveCircle(p, this.radius, colliders, p.y)) {
      const dv = Math.abs(this.speed) * 1.3;
      if (dv > 9 && !this.airborne) this.damage((dv - 9) * 1.6);
      this.speed *= -0.3;
      this.slip *= 0.3;
    }

    // Крен наружу поворота и клевок/приседание на газе и тормозе — пружина подвески.
    if (!this.airborne) {
      const lat = this.speed * this.yawRate + this.slip * 1.5;
      const rollT = Math.max(-0.13, Math.min(0.13, lat * 0.0042));
      const lon = (this.speed - accel0) / Math.max(dt, 1e-3);
      const pitchT = Math.max(-0.07, Math.min(0.07, -lon * 0.0028));
      this.rollV += ((rollT - this.roll) * 90 - this.rollV * 9) * dt;
      this.pitchV += ((pitchT - this.pitch) * 90 - this.pitchV * 8) * dt;
      this.roll += this.rollV * dt;
      this.pitch += this.pitchV * dt;
      this.mesh.rotation.x = this.pitch;
    }
    this.mesh.rotation.z = this.roll;
    this.mesh.rotation.y = this.heading;

    this.emitFx(dt);
    this._lastSpeed = this.speed;
    this._lastSlip = this.slip;
  }

  // Точка в локальных координатах машины (вперёд +Z, влево +X) → мир.
  local(x, y, z, out = _v) {
    const p = this.mesh.position, sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    return out.set(p.x + ch * x + sh * z, p.y + y, p.z - sh * x + ch * z);
  }

  emitFx(dt) {
    this._fxT -= dt;
    if (this._fxT > 0) return;
    this._fxT = 0.05;
    if (this.drifting || (Math.abs(this.speed - this._lastSpeed) / Math.max(dt, 1e-3) > 30 && Math.abs(this.speed) > 8)) {
      for (const x of [-1, 1]) puff(this.local(x * 1.05, 0.3, -1.5).clone(), { color: 0xd8d4cc, size: 0.4, life: 0.9, rise: 0.8, grow: 2.4, opacity: 0.45 });
    }
    // Дым из капота при малом здоровье, затем огонь.
    if (this.hp < 50) {
      const hood = this.local(0, 1.3, 1.6).clone();
      const dark = this.hp < 25;
      puff(hood, { color: dark ? 0x2a2a2a : 0x9a9a9a, size: dark ? 0.7 : 0.5, life: 1.6, rise: 2.4, grow: 3, opacity: dark ? 0.7 : 0.5 });
      if (dark) puff(hood, { color: Math.random() < 0.5 ? 0xff7a1a : 0xffc23a, size: 0.45, life: 0.45, rise: 2.5, grow: 0.8, opacity: 0.95 });
    }
  }

  // Шаг состояния машин раз в кадр (горение, взрывы, частицы). Вызывается из main.js.
  static tick(dt) {
    const ctx = Car.ctx;
    if (ctx) {
      for (const c of [...ctx.cars]) {
        if (c.wrecked) continue;
        if (c.hp < 25) c.damage(6 * dt); // огонь доедает машину
        if (c.hp <= 0) c.explode();
      }
    }
    for (const w of Car.wrecks) {
      w.burnT -= dt;
      // Обломок подскакивает от взрыва и падает обратно.
      if (w.mesh.position.y > 0 || w.vy > 0) {
        w.vy -= 22 * dt;
        w.mesh.position.y = Math.max(0, w.mesh.position.y + w.vy * dt);
        if (w.mesh.position.y === 0) w.vy = 0;
      }
      if (w.burnT > 0 && Math.random() < dt * 14) {
        const at = w.local((Math.random() - 0.5) * 1.6, 1.2, (Math.random() - 0.5) * 3).clone();
        puff(at, { color: Math.random() < 0.6 ? 0xff7a1a : 0x222222, size: 0.6, life: 0.9, rise: 2.8, grow: 1.6, opacity: 0.85 });
      }
    }
    stepPuffs(dt);
  }

  explode() {
    if (this.wrecked) return;
    const ctx = Car.ctx;
    this.wrecked = true;
    this.hp = 0;
    this.burnT = 12;
    this.speed = 0; this.slip = 0; this.yawRate = 0;
    if (ctx?.getVehicle?.() === this) ctx.exit?.();
    if (ctx) { const i = ctx.cars.indexOf(this); if (i >= 0) ctx.cars.splice(i, 1); }
    Car.wrecks.push(this);
    this.vy = 6;
    this.roll = (Math.random() - 0.5) * 0.4;
    this.mesh.rotation.z = this.roll;
    // Обгоревший кузов.
    this.mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.color?.multiplyScalar(0.18);
      if (o.material.emissive) o.material.emissive.setHex(0x000000);
    });
    const at = this.position.clone().setY(1);
    Car.blast(at, this);
  }

  // Взрыв: огненный шар, урон и отбрасывание людей и машин вокруг.
  static blast(at, source = null) {
    const ctx = Car.ctx;
    ctx?.fx?.blast(at, BLAST_R * 0.8, 0xff8a3a);
    ctx?.fx?.spark(at, 0xfff0a0, 1.6);
    for (let i = 0; i < 26; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      puff(at.clone().addScaledVector(dir, 0.5), { color: [0xff5a1a, 0xffb02a, 0x333333][i % 3], size: 0.9, life: 0.9 + Math.random() * 0.6, rise: 2, grow: 2.5, opacity: 0.9, vel: dir.multiplyScalar(9 + Math.random() * 6) });
    }
    if (!ctx) return;
    const fall = (pos) => { const d = Math.hypot(pos.x - at.x, pos.z - at.z); return d < BLAST_R ? 1 - d / BLAST_R : 0; };
    for (const e of ctx.enemies?.alive?.() || []) {
      const k = fall(e.position);
      if (!k) continue;
      if (ctx.enemies.damage(e, 140 * k)) {
        e.fling = _v.subVectors(e.position, at).setY(0).normalize().multiplyScalar(14 * k + 4).clone();
        ctx.onKill?.(e);
      }
    }
    const pl = ctx.player;
    if (pl && !ctx.getVehicle?.()) {
      const k = fall(pl.position);
      if (k) {
        ctx.hurt?.(75 * k);
        const dir = _v.subVectors(pl.position, at).setY(0);
        if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
        pl.knock?.(dir.normalize().multiplyScalar(16 * k + 4), 6 * k + 2);
      }
    }
    for (const c of ctx.cars) {
      if (c === source) continue;
      const k = fall(c.position);
      if (!k) continue;
      c.damage(70 * k);
      // Толчок в мировых координатах раскладываем на продольную и боковую скорость.
      const dir = _v.subVectors(c.position, at).setY(0).normalize().multiplyScalar(12 * k);
      const sh = Math.sin(c.heading), ch = Math.cos(c.heading);
      c.speed += dir.x * sh + dir.z * ch;
      c.slip += -dir.x * ch + dir.z * sh;
      c._lastSpeed = c.speed; c._lastSlip = c.slip; // толчок взрывом — не «удар о стену»
    }
  }
}
