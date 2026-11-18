import * as THREE from 'three';
import { enableSnap } from './retro.js';

// «Новости рынка»: раз в 60–90 с случайное событие на 20–30 с.
// Диктор объявляет его в субтитрах (реплика «Диктор: …» озвучивается voice.js).
// API: events.trigger(name), events.stop(), events.active. Цикл крутится сам (свой requestAnimationFrame).

const GRAVITY = 24; // как в player.js

const DEFS = {
  inflation: {
    title: 'Инфляция',
    news: 'Инфляция! Цены растут, головы клиентов раздуваются.',
    color: '#ffd23f',
  },
  rate: {
    title: 'Курс взлетел',
    news: 'Курс взлетел! Гравитация упала в пять раз. Держитесь за кошельки.',
    color: '#7ad7ff',
  },
  rain: {
    title: 'Денежный дождь',
    news: 'Денежный дождь! Регулятор напечатал лишнего. Собирайте купюры.',
    color: '#7dff8a',
  },
  swan: {
    title: 'Чёрный лебедь',
    news: 'Чёрный лебедь! Над городом непредсказуемое событие. Всем сохранять панику.',
    color: '#ff6b6b',
  },
};
const ALIASES = { 'инфляция': 'inflation', 'курс': 'rate', 'курс взлетел': 'rate', 'дождь': 'rain', 'денежный дождь': 'rain', 'лебедь': 'swan', 'чёрный лебедь': 'swan' };

const smooth = (t) => t * t * (3 - 2 * t);
// Огибающая события: плавный вход 1.5 с, плавный выход 1.5 с.
const envelope = (t, dur) => smooth(Math.min(1, t / 1.5, Math.max(0, dur - t) / 1.5));

// --- Купюры ---
function billTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#3f9b4f'; g.fillRect(0, 0, 64, 32);
  g.strokeStyle = '#d9ffcf'; g.lineWidth = 2; g.strokeRect(3, 3, 58, 26);
  g.fillStyle = '#c8f5b0'; g.beginPath(); g.arc(32, 16, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1f5a2a'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 32, 17);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

class MoneyRain {
  constructor(scene) {
    this.max = 400;
    const mat = enableSnap(new THREE.MeshBasicMaterial({ map: billTexture(), side: THREE.DoubleSide }));
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 0.55), mat, this.max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.bills = [];
    this.spawnAcc = 0;
    this.collected = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3();
  }

  // rate — купюр в секунду (0 — не сыплем, оставшиеся долёживают).
  update(dt, center, rate, onPick) {
    this.spawnAcc += dt * rate;
    while (this.spawnAcc >= 1 && this.bills.length < this.max) {
      this.spawnAcc -= 1;
      const a = Math.random() * Math.PI * 2, r = 1 + Math.sqrt(Math.random()) * 22;
      this.bills.push({
        x: center.x + Math.cos(a) * r, y: 18 + Math.random() * 14, z: center.z + Math.sin(a) * r,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        sw: Math.random() * 6, ground: 0, life: 0,
      });
    }
    if (this.spawnAcc > 1) this.spawnAcc = 1;
    let n = 0;
    for (let i = this.bills.length - 1; i >= 0; i--) {
      const b = this.bills[i];
      b.life += dt;
      if (b.y > 0.03) {
        // Планирует: медленное падение, покачивание, кувырки.
        b.sw += dt * 2.5;
        b.y = Math.max(0.03, b.y - dt * (2.2 + Math.sin(b.sw * 1.3) * 0.8));
        b.x += Math.sin(b.sw) * dt * 1.2;
        b.z += Math.cos(b.sw * 0.7) * dt * 1.2;
        b.rx += dt * 3; b.rz += dt * 2;
        if (b.y <= 0.03) { b.rx = -Math.PI / 2; b.rz = 0; }
      } else b.ground += dt;
      const dx = b.x - center.x, dz = b.z - center.z;
      const picked = dx * dx + dz * dz < 2.2 * 2.2 && b.y < center.y + 3;
      if (picked) { this.collected++; onPick(b); }
      if (picked || b.ground > 8 || b.life > 40) { this.bills.splice(i, 1); continue; }
    }
    for (const b of this.bills) {
      this._e.set(b.rx, b.ry, b.rz);
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(b.x, b.y, b.z), this._q, this._s);
      this.mesh.setMatrixAt(n++, this._m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// --- Чёрный лебедь (low-poly, ~25 м размах) ---
function makeSwan() {
  const black = enableSnap(new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.6, flatShading: true }));
  const red = enableSnap(new THREE.MeshStandardMaterial({ color: 0xd8202a, roughness: 0.5, flatShading: true }));
  const white = enableSnap(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0).scale(2.6, 1.6, 5.2), black);
  g.add(body);
  // Шея S-образно: цепочка сегментов вперёд и вверх.
  let y = 0.8, z = 4.2;
  const neck = [[0.5, 0.9], [0.9, 0.6], [1.0, 0.1], [0.8, -0.2], [0.5, 0.2]];
  for (const [dy, dz] of neck) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.3, 5), black);
    seg.position.set(0, y + dy / 2, z + dz / 2);
    seg.rotation.x = Math.atan2(dz, dy);
    g.add(seg);
    y += dy; z += dz;
  }
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0).scale(1, 0.9, 1.3), black);
  head.position.set(0, y + 0.2, z + 0.4);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 4).rotateX(Math.PI / 2), red);
  beak.position.set(0, y + 0.05, z + 1.6);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), white);
  eyeL.position.set(0.55, y + 0.4, z + 0.6);
  const eyeR = eyeL.clone(); eyeR.position.x = -0.55;
  g.add(head, beak, eyeL, eyeR);
  // Хвост.
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 4).rotateX(-Math.PI / 2), black);
  tail.position.set(0, 0.5, -5.6);
  g.add(tail);
  // Крылья: шарнир у корпуса, две плоские секции (взмах — rotation.z).
  const wing = (side) => {
    const root = new THREE.Group();
    root.position.set(side * 1.8, 0.7, 0.6);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(6, 1.6); shape.lineTo(11, -0.6); shape.lineTo(5.5, -3.8); shape.lineTo(0, -3.2);
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    if (side < 0) geo.scale(-1, 1, 1);
    const m = new THREE.Mesh(geo, black);
    m.material = black.clone(); m.material.side = THREE.DoubleSide; enableSnap(m.material);
    root.add(m);
    g.add(root);
    return root;
  };
  const wingL = wing(1), wingR = wing(-1);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.25);
  return { root: g, wingL, wingR };
}

export function initEvents({ scene, player, enemies, traffic, war, hud, state, getActor }) {
  const rain = new MoneyRain(scene);
  let swan = null;
  const ev = {
    active: null, // { name, t, dur }
    nextIn: 60 + Math.random() * 30,
    // В автотестах (?test) события сами не стартуют — только через trigger.
    auto: !/[?&]test/.test(location.search),
    history: [],
    rain,
    get swan() { return swan; },
  };
  const headBase = new WeakMap();

  // Гравитация игрока: поле player.gravityScale. Пока player.js его не читает — компенсируем в обёртке.
  player.gravityScale = 1;
  if (!player.supportsGravityScale) {
    const origUpdate = player.update.bind(player);
    player.update = (dt, ...rest) => {
      const gs = player.gravityScale ?? 1;
      if (gs !== 1 && !player.grounded) player.vy += GRAVITY * (1 - gs) * dt;
      return origUpdate(dt, ...rest);
    };
  }

  // Паника при лебеде: враги замирают (e.frozen), задирают голову и руки; трафик встаёт.
  const origEnemies = enemies.update.bind(enemies);
  enemies.update = (dt, ctx) => {
    origEnemies(dt, ctx);
    if (ev.active?.name !== 'swan' || !swan) return;
    for (const e of enemies.list) {
      if (e.dead) continue;
      const h = e.h;
      const dx = swan.root.position.x - e.position.x, dz = swan.root.position.z - e.position.z;
      h.root.rotation.y = Math.atan2(dx, dz);
      h.head.rotation.x = -0.9;
      const shake = Math.sin(h.t * 25 + e.position.x) * 0.15;
      h.armL.shoulder.rotation.x = -2.9 + shake; h.armR.shoulder.rotation.x = -2.9 - shake;
      h.armL.shoulder.rotation.z = -0.4; h.armR.shoulder.rotation.z = 0.4;
    }
  };
  const origTraffic = traffic.update.bind(traffic);
  traffic.update = (dt, obs) => { if (ev.active?.name === 'swan') return; origTraffic(dt, obs); };

  const people = () => [player.h, ...enemies.list.map((e) => e.h)];
  function setHeads(k) {
    for (const h of people()) {
      if (!headBase.has(h.head)) headBase.set(h.head, h.head.scale.clone());
      const b = headBase.get(h.head);
      h.head.scale.set(b.x * k, b.y * k, b.z * k);
    }
  }

  function announce(def) {
    hud.subtitle(`Диктор: <b style="color:${def.color}">НОВОСТИ РЫНКА</b> — ${def.news}`, 6500);
  }

  function begin(name) {
    const def = DEFS[name];
    ev.active = { name, t: 0, dur: 20 + Math.random() * 10 };
    ev.history.push(name);
    announce(def);
    if (name === 'swan') {
      swan ||= makeSwan();
      scene.add(swan.root);
      const c = getActor().position;
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      swan.from = c.clone().addScaledVector(dir, -180).setY(34);
      swan.to = c.clone().addScaledVector(dir, 180).setY(30);
      swan.root.position.copy(swan.from);
      swan.root.rotation.y = a;
      ev.frozenBefore = new Map();
      for (const e of enemies.list) { ev.frozenBefore.set(e, e.frozen); e.frozen = true; }
    }
  }

  function end() {
    const a = ev.active;
    if (!a) return;
    ev.active = null;
    if (a.name === 'inflation') setHeads(1);
    if (a.name === 'rate') player.gravityScale = 1;
    if (a.name === 'swan') {
      if (swan) scene.remove(swan.root);
      for (const [e, f] of ev.frozenBefore || []) e.frozen = f;
      ev.frozenBefore = null;
    }
    hud.subtitle('Диктор: Рынок стабилизировался. Пока что.', 3000);
  }

  function update(dt) {
    const a = ev.active;
    const center = getActor().position;
    rain.update(dt, center, a?.name === 'rain' ? 40 * envelope(a.t, a.dur) + 4 : 0, () => {
      war.addMoney(10);
    });
    if (!a) {
      if (!ev.auto) return;
      ev.nextIn -= dt;
      if (ev.nextIn <= 0) {
        const names = Object.keys(DEFS).filter((n) => n !== ev.history.at(-1));
        begin(names[Math.floor(Math.random() * names.length)]);
      }
      return;
    }
    a.t += dt;
    const k = envelope(a.t, a.dur);
    if (a.name === 'inflation') setHeads(1 + k * (1.6 + Math.sin(a.t * 3) * 0.12));
    if (a.name === 'rate') player.gravityScale = 1 - 0.8 * k;
    if (a.name === 'swan' && swan) {
      const u = Math.min(1, a.t / a.dur);
      swan.root.position.lerpVectors(swan.from, swan.to, u);
      swan.root.position.y += Math.sin(a.t * 0.8) * 3;
      const flap = Math.sin(a.t * 3.2) * 0.55;
      swan.wingL.rotation.z = flap; swan.wingR.rotation.z = -flap;
      for (const e of enemies.list) if (!ev.frozenBefore.has(e)) { ev.frozenBefore.set(e, e.frozen); e.frozen = true; }
    }
    if (a.t >= a.dur) { end(); ev.nextIn = 60 + Math.random() * 30; }
  }

  ev.trigger = (name) => {
    name = DEFS[name] ? name : ALIASES[String(name).toLowerCase()];
    if (!name) return false;
    end();
    begin(name);
    return true;
  };
  ev.stop = () => { end(); ev.nextIn = 60 + Math.random() * 30; };
  ev.update = update;
  ev.names = Object.keys(DEFS);

  // Свой цикл: тикаем только в режиме игры, с учётом замедления времени.
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000) * (state.timeScale ?? 1);
    last = now;
    if (state.mode === 'play') update(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return ev;
}
