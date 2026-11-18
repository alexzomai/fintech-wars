import * as THREE from 'three';
import { N, HALF, groundAt } from './city.js';
import { enableSnap } from './retro.js';
import { perimPoint, perimParam, blockAt, speechSprite } from './npc.js';

// Пасхалка: бревно-человечек с битой. Один на город, на радаре не виден.
// Носится по тротуарам, рядом слышно «тунг-тунг-тунг». Трижды не обернёшься —
// гоняется и бьёт битой. Догнал и нажал E — достижение «Сахур наступил».

const rnd = (a, b) => a + Math.random() * (b - a);
const m = (c) => enableSnap(new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
const SIDE = 38.2; // сторона тротуара квартала (BLOCK - 2·0.9)

function makeLog() {
  const root = new THREE.Group();
  const wood = m(0x8a5a2b), dark = m(0x5a3a1a), white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 1.5, 8), wood);
  body.position.y = 1.35;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 8), m(0xd9b07a));
  top.position.y = 2.11;
  root.add(body, top);
  for (const y of [0.9, 1.6]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.025, 4, 10), dark); r.rotation.x = Math.PI / 2; r.position.y = y; root.add(r); }
  for (const x of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), white); eye.position.set(x, 1.75, 0.3); eye.scale.z = 0.5;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), black); pupil.position.set(x, 1.74, 0.36);
    root.add(eye, pupil);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.02), black); mouth.position.set(0, 1.45, 0.37); root.add(mouth);
  const limb = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4).translate(0, -0.3, 0);
  const mk = (x, y) => { const j = new THREE.Group(); j.position.set(x, y, 0); j.add(new THREE.Mesh(limb, dark)); root.add(j); return j; };
  const armL = mk(-0.38, 1.5), armR = mk(0.38, 1.5), legL = mk(-0.15, 0.62), legR = mk(0.15, 0.62);
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.9, 6).translate(0, 0.45, 0), m(0xc89a5a));
  bat.position.y = -0.6; bat.rotation.x = 1.2; armR.add(bat);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, armL, armR, legL, legR };
}

export class Sahur {
  constructor(scene, { hud = null, onCatch = null } = {}) {
    this.scene = scene;
    this.hud = hud;
    this.onCatch = onCatch;
    this.m = makeLog();
    this.position = this.m.root.position;
    scene.add(this.m.root);
    this.i = 1; this.j = 1; this.s = 0; this.dir = 1;
    this.mode = 'roam'; // roam | chase
    this.drumT = 3; this.ignored = 0; this.hitCd = 0; this.chaseT = 0; this.t = 0;
    this.caught = false; this.bubble = null; this.bubbleT = 0;
    this.relocate(new THREE.Vector3(0, 0, 0), 0);
  }

  // Перенос на тротуар в 50–80 м от игрока.
  relocate(center, minR = 50, spread = 30, a = Math.random() * Math.PI * 2) {
    const r = rnd(minR, minR + spread);
    const x = Math.max(-HALF + 5, Math.min(HALF - 5, center.x + Math.sin(a) * r));
    const z = Math.max(-HALF + 5, Math.min(HALF - 5, center.z + Math.cos(a) * r));
    [this.i, this.j] = blockAt(x, z);
    this.s = perimParam(this.i, this.j, x, z);
    perimPoint(this.i, this.j, this.s, this.position);
  }

  drum() {
    try {
      const ac = (this.ac ||= new (window.AudioContext || window.webkitAudioContext)());
      const t0 = ac.currentTime + 0.02;
      const vol = Math.max(0.05, 1 - this.dist / 30) * 0.5;
      for (let k = 0; k < 3; k++) {
        const t = t0 + k * 0.3;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(170, t);
        o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + 0.3);
      }
    } catch { /* без звука */ }
    this.drums = (this.drums || 0) + 1;
    this.say('Тунг-тунг-тунг…');
  }

  say(text) {
    if (this.bubble) this.m.root.remove(this.bubble);
    this.bubble = speechSprite(text, '#5a3a1a');
    this.bubble.position.y = 2.7;
    this.bubbleT = 1.5;
    this.m.root.add(this.bubble);
  }

  // E рядом: поймал.
  tryCatch(playerPos) {
    if (Math.hypot(playerPos.x - this.position.x, playerPos.z - this.position.z) > 2.8) return false;
    const first = !this.caught;
    this.caught = true;
    this.hud?.alert(first ? 'Достижение: «Сахур наступил» · Охваты +100' : 'Сахур снова пойман!', '#d9b07a');
    if (first) this.onCatch?.();
    this.mode = 'roam'; this.ignored = 0;
    this.relocate(playerPos, 90);
    return first;
  }

  // ctx: { player, camera, vehicle, hurt(dmg) }
  update(dt, { player, camera, vehicle, hurt }) {
    this.t += dt;
    const pp = player.position;
    const dx = pp.x - this.position.x, dz = pp.z - this.position.z;
    this.dist = Math.hypot(dx, dz);
    if (this.dist > 160) this.relocate(pp, 60);
    if (this.bubble && (this.bubbleT -= dt) <= 0) { this.m.root.remove(this.bubble); this.bubble = null; }
    this.hitCd -= dt;
    let speed = 0, yaw = this.m.root.rotation.y;

    if (this.mode === 'roam') {
      // Быстрее всех по тротуарам; на углах иногда сворачивает в соседний квартал.
      speed = 10;
      const s0 = this.s;
      this.s += this.dir * speed * dt;
      const old = this.position.clone();
      perimPoint(this.i, this.j, this.s, this.position);
      const k0 = Math.floor(s0 / SIDE), k1 = Math.floor(this.s / SIDE);
      if (k0 !== k1 && Math.random() < 0.35) {
        // Угол: перебегает дорогу в соседний квартал.
        const corner = ((Math.max(k0, k1) % 4) + 4) % 4;
        const sx = [-1, 1, 1, -1][corner], sz = [-1, -1, 1, 1][corner];
        const ax = Math.random() < 0.5;
        const ni = this.i + (ax ? sx : 0), nj = this.j + (ax ? 0 : sz);
        if (ni >= 0 && ni < N && nj >= 0 && nj < N) {
          const p0 = this.position.clone();
          const tgt = perimPoint(ni, nj, perimParam(ni, nj, p0.x + (ax ? sx * 16 : 0), p0.z + (ax ? 0 : sz * 16)), new THREE.Vector3());
          this.cross = { to: tgt, i: ni, j: nj };
          this.mode = 'cross';
        }
      }
      yaw = Math.atan2(this.position.x - old.x, this.position.z - old.z);
      // Барабан рядом с игроком; не обернулся — счётчик растёт.
      if (this.dist < 28 && !vehicle && (this.drumT -= dt) <= 0) {
        this.drumT = 4;
        this.drum();
        const look = camera.getWorldDirection(new THREE.Vector3());
        const facing = (-dx * look.x - dz * look.z) / (this.dist || 1) > 0.6;
        if (facing) this.ignored = 0;
        else if (++this.ignored >= 3) { this.mode = 'chase'; this.chaseT = 15; this.say('ТУНГ ТУНГ ТУНГ САХУР!'); }
      }
    } else if (this.mode === 'cross') {
      speed = 10;
      const c = this.cross, ddx = c.to.x - this.position.x, ddz = c.to.z - this.position.z, l = Math.hypot(ddx, ddz);
      if (l < 0.4) { this.i = c.i; this.j = c.j; this.s = perimParam(c.i, c.j, c.to.x, c.to.z); this.mode = 'roam'; }
      else { const st = Math.min(l, speed * dt); this.position.x += (ddx / l) * st; this.position.z += (ddz / l) * st; yaw = Math.atan2(ddx, ddz); }
    } else {
      this.chaseT -= dt;
      speed = 7.6;
      if (this.dist > 1.3) {
        this.position.x += (dx / this.dist) * speed * dt;
        this.position.z += (dz / this.dist) * speed * dt;
      }
      yaw = Math.atan2(dx, dz);
      if (this.dist < 1.8 && this.hitCd <= 0 && !vehicle) {
        // Удар битой: малый урон и отбрасывание.
        this.hitCd = 1.2; this.swingT = 1;
        hurt?.(6, this);
        pp.x += (dx / (this.dist || 1)) * 2.5;
        pp.z += (dz / (this.dist || 1)) * 2.5;
        this.hits = (this.hits || 0) + 1;
      }
      if (this.chaseT <= 0 || vehicle) { this.mode = 'roam'; this.ignored = 0; this.s = perimParam(this.i, this.j, this.position.x, this.position.z); }
    }
    this.position.y = groundAt(this.position.x, this.position.z);
    this.m.root.rotation.y = yaw;
    // Беготня: мельтешащие ножки, бита над головой.
    const ph = this.t * (speed > 0 ? 18 : 2);
    this.m.legL.rotation.x = Math.sin(ph) * 0.9;
    this.m.legR.rotation.x = -Math.sin(ph) * 0.9;
    this.m.armL.rotation.x = -Math.sin(ph) * 0.8;
    this.swingT = Math.max(0, (this.swingT || 0) - dt * 3);
    this.m.armR.rotation.x = this.swingT > 0 ? -3 + (1 - this.swingT) * 3 : -2.4 + Math.sin(this.t * 6) * 0.3;
    this.m.root.position.y += Math.abs(Math.sin(ph)) * 0.08;
  }
}
