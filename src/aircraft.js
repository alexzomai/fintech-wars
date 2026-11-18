import * as THREE from 'three';
import { BANKS, HALF, ROAD, roadCoord } from './city.js';

// Авиация: вертолёты «Сбережёнки» на площадках (крыша Евразии и понтон на набережной),
// живое небо (лайнеры с инверсионным следом, кукурузник с рекламным баннером) и листовки на L.
// Всё из примитивов. Коллизии вертолёта — по AABB `colliders` с maxY; у башен Сити
// (там maxY = 200) — по реальным коробкам их частей, чтобы можно было сесть на крышу.

const UP_V = 9, DOWN_V = 8, MAX_ALT = 230, WORLD = 430;
const _v = new THREE.Vector3();

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const padTex = () => canvasTex(128, 128, (g, w) => {
  g.fillStyle = '#2b2d33'; g.fillRect(0, 0, w, w);
  g.strokeStyle = '#ffd23f'; g.lineWidth = 8;
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#f2f2f2'; g.font = 'bold 72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('H', 64, 68);
});

// --- Вертолёт ---
function buildHeli() {
  const root = new THREE.Group();
  const body = new THREE.Group(); // наклоняется
  root.add(body);
  const green = new THREE.MeshStandardMaterial({ color: BANKS.green.color, roughness: 0.5, metalness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.6, emissive: 0x16304a });
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const sph = new THREE.SphereGeometry(1, 10, 8), box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
  add(sph, green, 0, 1.9, 0.2, 1.3, 1.15, 2.3);           // кабина-фюзеляж
  add(sph, glass, 0, 2.15, 1.35, 1.0, 0.8, 1.15);          // остекление
  add(box, white, 0, 1.55, 0.1, 2.0, 0.25, 3.2);           // белая полоса
  const boom = add(cyl, green, 0, 2.2, -3.4, 0.28, 4.4, 0.28);
  boom.rotation.x = Math.PI / 2;
  add(box, green, 0, 2.9, -5.4, 0.12, 1.4, 0.9);           // киль
  add(box, white, 0, 2.3, -5.0, 1.6, 0.08, 0.5);           // стабилизатор
  for (const s of [-1, 1]) {                                // полозья
    add(box, dark, s * 1.0, 0.1, 0.2, 0.12, 0.12, 3.6);
    add(box, dark, s * 0.85, 0.55, 1.0, 0.08, 0.9, 0.08).rotation.z = s * 0.3;
    add(box, dark, s * 0.85, 0.55, -0.6, 0.08, 0.9, 0.08).rotation.z = s * 0.3;
  }
  add(cyl, dark, 0, 3.15, 0.1, 0.18, 0.5, 0.18);            // вал
  const rotor = new THREE.Group();
  rotor.position.set(0, 3.42, 0.1);
  body.add(rotor);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  for (let k = 0; k < 2; k++) add(box, bladeMat, 0, 0, 0, 0.32, 0.06, 10.5, rotor).rotation.y = (k * Math.PI) / 2;
  const tail = new THREE.Group();
  tail.position.set(0.18, 2.9, -5.55);
  body.add(tail);
  add(box, bladeMat, 0, 0, 0, 0.05, 1.8, 0.18, tail);
  add(box, bladeMat, 0, 0, 0, 0.05, 0.18, 1.8, tail);
  // Подпись по борту.
  const logo = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = BANKS.green.css; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('СБЕРЕЖЁНКА', w / 2, h / 2 + 2);
  });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: logo }));
    p.position.set(s * 1.27, 1.85, -0.4);
    p.rotation.y = s * Math.PI / 2;
    body.add(p);
  }
  return { root, body, rotor, tail };
}

class Heli {
  constructor(scene, pos, heading, name) {
    Object.assign(this, buildHeli());
    this.name = name;
    this.position = this.root.position;
    this.position.copy(pos);
    this.heading = heading;
    this.vel = new THREE.Vector3();
    this.pitch = 0; this.roll = 0;
    this.spool = 0; // обороты винта 0..1
    this.landed = true;
    this.floor = pos.y;
    scene.add(this.root);
  }
  get forward() { return _v.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
}

// --- Небо ---
function contrailMat() {
  const t = canvasTex(8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
}

function buildLiner() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xf4efe8, fog: false });
  const tailM = new THREE.MeshBasicMaterial({ color: 0x8a4a7a, fog: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const add = (mat, x, y, z, sx, sy, sz) => { const b = new THREE.Mesh(box, mat); b.position.set(x, y, z); b.scale.set(sx, sy, sz); g.add(b); return b; };
  add(m, 0, 0, 0, 3.6, 3.6, 38);        // фюзеляж
  add(m, 0, -0.6, 2, 36, 0.4, 5.5);     // крылья
  add(tailM, 0, 3.5, -17, 0.4, 6, 4);   // киль
  add(m, 0, 0.6, -17, 12, 0.3, 3);      // хвостовое оперение
  const trailM = contrailMat();
  for (const s of [-1, 1]) {
    const tr = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 260), trailM);
    tr.rotation.x = Math.PI / 2;
    tr.position.set(s * 11, -0.6, -18 - 130);
    g.add(tr);
  }
  return g;
}

const BANNERS = [
  ['red', 'АЛЫЙ-БАНК: КРЕДИТ ЗА 5 МИНУТ', 'ВЫПЛАТЫ — ЗА 30 ЛЕТ'],
  ['yellow', 'ТЁПЛЫЙ-БАНК: КЭШБЭК 100%*', '*НА ВОЗДУХ, КОТОРЫМ ДЫШИТЕ'],
  ['green', 'СБЕРЕЖЁНКА: МЫ ДАЖЕ В НЕБЕ', 'ПОДНИМЕМ ВАМ ПРОЦЕНТ'],
  ['red', 'АЛЫЙ-БАНК: ИПОТЕКА 0%', 'НА ОБЛАКО. БЕЗ ВЗНОСА'],
];
function bannerTex(i) {
  const [bank, a, b] = BANNERS[i % BANNERS.length];
  return canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = BANKS[bank].css; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 34px sans-serif'; g.fillText(a, w / 2, 36);
    g.font = 'bold 22px sans-serif'; g.fillStyle = BANKS[bank].css; g.fillText(b, w / 2, 70);
  });
}

function buildBiplane() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xc9d65a, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const add = (mat, x, y, z, sx, sy, sz, parent = g) => { const b = new THREE.Mesh(box, mat); b.position.set(x, y, z); b.scale.set(sx, sy, sz); parent.add(b); return b; };
  add(body, 0, 0, 0, 1.8, 2, 9);          // фюзеляж
  add(body, 0, 1.6, 1.4, 18, 0.18, 2.2);   // верхнее крыло
  add(body, 0, -0.7, 1.4, 14, 0.18, 2);    // нижнее
  for (const s of [-1, 1]) add(dark, s * 5, 0.45, 1.4, 0.12, 2.2, 0.12);
  add(body, 0, 1.2, -4.2, 0.2, 2.2, 1.4);  // киль
  add(body, 0, 0.2, -4.2, 5, 0.15, 1.2);
  const prop = new THREE.Group(); prop.position.set(0, 0, 4.7); g.add(prop);
  add(dark, 0, 0, 0, 0.25, 3.4, 0.1, prop);
  // Трос и баннер позади.
  add(dark, 0, -0.2, -10, 0.05, 0.05, 11);
  const bmat = new THREE.MeshBasicMaterial({ map: bannerTex(0), side: THREE.FrontSide });
  const banner = new THREE.Group(); banner.position.set(0, -0.2, -15.5 - 11); g.add(banner);
  for (const rot of [Math.PI / 2, -Math.PI / 2]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.2), bmat);
    p.rotation.y = rot;
    banner.add(p);
  }
  return { g, prop, banner, bmat };
}

export class Aircraft {
  constructor({ scene, colliders, districts, hud, state, player }) {
    Object.assign(this, { scene, colliders, districts, hud, state, player });
    this.flying = null; // вертолёт, которым управляет игрок
    this.keys = { down: false };
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.leaflets = [];
    this.leafCd = 0;
    this.ready = false;
    addEventListener('keydown', (e) => {
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.keys.down = true;
      if (e.code === 'KeyL' && !e.repeat && this.flying && state.mode === 'play') this.dropLeaflets();
    });
    addEventListener('keyup', (e) => { if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.keys.down = false; });
    addEventListener('blur', () => { this.keys.down = false; });

    // Небо создаём сразу — его видно и на заставке.
    this.liners = [buildLiner(), buildLiner()].map((g, i) => {
      scene.add(g);
      const l = { g, alt: 205 + i * 30, speed: 62 + i * 9 };
      this.resetLiner(l, i * 0.5);
      return l;
    });
    this.biplane = buildBiplane();
    scene.add(this.biplane.g);
    this.bi = { ang: 0, lap: 0 };
    this.time = 0;
  }

  resetLiner(l, start = 0) {
    const a = Math.random() * Math.PI * 2;
    l.dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-l.dir.z, 0, l.dir.x).multiplyScalar((Math.random() - 0.5) * 300);
    l.g.position.copy(l.dir).multiplyScalar(-520 + start * 600).add(side).setY(l.alt);
    l.g.rotation.y = Math.atan2(l.dir.x, l.dir.z);
    l.t = 0;
  }

  // Ленивая инициализация: к первому кадру сцена построена целиком.
  init() {
    this.ready = true;
    this.scene.updateMatrixWorld(true);
    // Коллизии: обычные AABB (кроме башен и краевых стен с maxY 200)…
    this.boxes = this.colliders.filter((c) => c.maxY < 200).map((c) => ({ ...c, minY: 0 }));
    // …плюс реальные коробки частей башен.
    const towers = this.colliders.filter((c) => c.maxY >= 200 && c.maxX - c.minX < 100 && c.maxZ - c.minZ < 100);
    const bb = new THREE.Box3();
    this.scene.traverse((o) => {
      if (!o.isMesh || o.material?.transparent) return;
      bb.setFromObject(o);
      if (Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) < 2) return;
      const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      if (!towers.some((c) => cx > c.minX && cx < c.maxX && cz > c.minZ && cz < c.maxZ)) return;
      this.boxes.push({ minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z, minY: bb.min.y, maxY: bb.max.y });
    });
    // У башен maxY был условный (200): ставим реальную высоту крыши, чтобы по крыше можно было ходить.
    for (const c of towers) {
      let top = 0;
      for (const b of this.boxes) {
        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        if (b.minY !== undefined && cx > c.minX && cx < c.maxX && cz > c.minZ && cz < c.maxZ) top = Math.max(top, b.maxY);
      }
      if (top > 10) c.maxY = top;
    }

    const edge = HALF + ROAD / 2;
    const padMat = new THREE.MeshStandardMaterial({ map: padTex(), roughness: 0.8 });
    const mkPad = (x, y, z, size = 11) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size, 0.2, size), padMat);
      m.position.set(x, y + 0.1, z);
      m.receiveShadow = true;
      this.scene.add(m);
      this.boxes.push({ minX: x - size / 2, maxX: x + size / 2, minZ: z - size / 2, maxZ: z + size / 2, minY: y, maxY: y + 0.2 });
      return new THREE.Vector3(x, y + 0.2, z);
    };
    // 1) Крыша Евразии.
    const hq = (this.districts[0].hq || this.districts[0].zone).clone();
    const roof = this.floorAt(hq.x, hq.z, 1, 1e9);
    this.pads = [mkPad(hq.x, roof, hq.z)];
    // 2) Понтон на реке у набережной: проход в парапете и ограждение, чтобы не уйти в воду.
    const px = roadCoord(2), pz = edge + 16, half = 8;
    const deck = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9 });
    const rail = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 0.4 });
    const add = (mat, x, y, z, sx, sy, sz) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      b.position.set(x, y, z); b.receiveShadow = b.castShadow = true;
      this.scene.add(b);
    };
    add(deck, px, 0.02, edge + 4.5, 4, 0.1, 9);              // мостки
    add(deck, px, 0.02, pz, half * 2 + 1, 0.1, half * 2 + 1); // понтон
    this.pads.push(mkPad(px, 0.07, pz, 12));
    // Ограждение: коллайдеры для пешехода и машины; вертолёт выше 1.2 м их не замечает.
    const railC = (x0, x1, z0, z1) => {
      const c = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, maxY: 1.2 };
      this.colliders.push(c);
      this.boxes.push({ ...c, minY: 0 });
      add(rail, (x0 + x1) / 2, 0.6, (z0 + z1) / 2, x1 - x0, 1.2, z1 - z0);
    };
    railC(px - 2.3, px - 2, edge, pz - half);
    railC(px + 2, px + 2.3, edge, pz - half);
    railC(px - half - 0.3, px - 2.3, pz - half - 0.3, pz - half);
    railC(px + 2.3, px + half + 0.3, pz - half - 0.3, pz - half);
    railC(px - half - 0.3, px - half, pz - half, pz + half);
    railC(px + half, px + half + 0.3, pz - half, pz + half);
    railC(px - half - 0.3, px + half + 0.3, pz + half, pz + half + 0.3);
    // Проём в южной краевой стене напротив мостков.
    const wi = this.colliders.findIndex((c) => c.maxY >= 200 && c.minZ >= edge - 0.1 && c.maxX - c.minX > 100);
    if (wi >= 0) {
      const w = this.colliders[wi];
      this.colliders.splice(wi, 1, { ...w, maxX: px - 2 }, { ...w, minX: px + 2 });
    }

    this.helis = [
      new Heli(this.scene, this.pads[0], Math.PI, 'Вертушка «Овернайт»'),
      new Heli(this.scene, this.pads[1], Math.PI, 'Вертушка «Ликвидность»'),
    ];
    this.sun = null;
    this.scene.traverse((o) => { if (o.isDirectionalLight && !this.sun) this.sun = o; });
  }

  // Высота опоры под точкой (радиус r) для тела, находящегося на высоте y.
  floorAt(x, z, r, y) {
    let f = 0;
    for (const b of this.boxes) {
      if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
      if (b.maxY <= y + 0.6 && b.maxY > f) f = b.maxY;
    }
    return f;
  }

  nearest(p, maxD = 6) {
    let best = null, bd = maxD;
    for (const h of this.helis || []) {
      const d = Math.hypot(h.position.x - p.x, h.position.z - p.z);
      if (d < bd && Math.abs(h.position.y - p.y) < 4) { bd = d; best = h; }
    }
    return best;
  }

  // Обработчик F: true — клавишу обработали мы (сели или вышли).
  tryEnter(player) {
    if (!this.ready) return false;
    if (this.flying) return this.exit(), true;
    const h = this.nearest(player.position);
    if (!h) return false;
    this.flying = h;
    player.mesh.visible = false;
    player.grounded = false;
    player.rollT = 0;
    this.camInit = true;
    this.hud.showVehicle(h.name);
    this.hud.help('~W~/~S~ — наклон · ~A~/~D~ — поворот · ~Пробел~ — вверх · ~Ctrl~ — вниз · ~L~ — листовки · ~F~ — выйти', 7000);
    return true;
  }

  exit(force = false) {
    const h = this.flying;
    if (!h) return false;
    if (!force && (!h.landed || h.vel.length() > 3)) { this.hud.toast('Сначала сядь: на землю или на крышу'); return false; }
    const p = this.player.position;
    const side = new THREE.Vector3(Math.cos(h.heading), 0, -Math.sin(h.heading));
    p.copy(h.position).addScaledVector(side, 2.6);
    p.y = h.position.y;
    this.player.vy = 0;
    this.player.rollT = 0;
    this.player.grounded = true;
    this.player.mesh.visible = true;
    this.player.heading = h.heading;
    this.flying = null;
    // Поддержка игрока на крыше/понтоне: groundAt о крышах не знает.
    this.roofSupport = p.y > 0.4 ? { y: p.y, h } : null;
    if (this.state.camOverride === this.cam) this.state.camOverride = null;
    return true;
  }

  dropLeaflets() {
    if (this.leafCd > 0) return;
    this.leafCd = 1.5;
    const h = this.flying;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const matG = new THREE.MeshBasicMaterial({ color: BANKS.green.color, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(0.5, 0.7);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(geo, i % 3 ? mat : matG);
      m.position.copy(h.position).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.5, (Math.random() - 0.5) * 3));
      m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      this.scene.add(m);
      this.leaflets.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 4, -1.5 - Math.random() * 2, (Math.random() - 0.5) * 4).add(h.vel.clone().multiplyScalar(0.6)), spin: Math.random() * 6, life: 40 });
    }
    this.hud.subtitle(`<b style="color:${BANKS.green.css}">Листовки «Сбережёнки»</b>: «Вклад под 0,01% — зато с вертолёта!»`, 3000);
  }

  updateHeli(h, dt, input, piloted) {
    const p = h.position;
    h.spool = THREE.MathUtils.clamp(h.spool + (piloted ? dt / 1.6 : -dt / 4), 0, 1);
    let f = 0, turn = 0, vyT;
    if (piloted && h.spool > 0.85) {
      f = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      vyT = (input.brake ? UP_V : 0) - (this.keys.down ? DOWN_V : 0);
    } else vyT = h.landed ? 0 : -14; // без пилота падает
    if (h.landed && vyT <= 0) f = 0;
    h.heading += turn * 1.5 * dt;
    h.pitch += (f * 0.32 - h.pitch) * Math.min(1, dt * 3);
    h.roll += (-turn * 0.28 - h.roll) * Math.min(1, dt * 3);
    const fw = h.forward;
    h.vel.x += fw.x * h.pitch * 70 * dt;
    h.vel.z += fw.z * h.pitch * 70 * dt;
    const drag = Math.exp(-dt * (h.landed ? 6 : 0.9));
    h.vel.x *= drag; h.vel.z *= drag;
    h.vel.y += (vyT - h.vel.y) * Math.min(1, dt * (piloted ? 2.5 : 1));
    p.addScaledVector(h.vel, dt);
    if (p.y > MAX_ALT) { p.y = MAX_ALT; h.vel.y = Math.min(0, h.vel.y); }
    p.x = THREE.MathUtils.clamp(p.x, -WORLD, WORLD);
    p.z = THREE.MathUtils.clamp(p.z, -WORLD, WORLD);

    // Столкновения корпуса (радиус 2.2, высота 3.4) со зданиями: выталкиваем по горизонтали.
    const R = 2.2;
    for (const b of this.boxes) {
      if (p.x + R < b.minX || p.x - R > b.maxX || p.z + R < b.minZ || p.z - R > b.maxZ) continue;
      if (p.y >= b.maxY - 0.6 || p.y + 3.4 < b.minY) continue;
      const opts = [[b.minX - R - p.x, 0], [b.maxX + R - p.x, 0], [0, b.minZ - R - p.z], [0, b.maxZ + R - p.z]];
      opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
      p.x += opts[0][0]; p.z += opts[0][1];
      if (opts[0][0]) h.vel.x *= -0.3; else h.vel.z *= -0.3;
      if (piloted && !this.bumpCd) { this.bumpCd = 1; this.hud.toast('Бум! Аккуратнее со стеклом за миллиард'); }
    }
    // Посадка: опора под полозьями.
    h.floor = this.floorAt(p.x, p.z, 1.1, p.y);
    if (p.y <= h.floor) {
      p.y = h.floor;
      if (h.vel.y < 0) h.vel.y = 0;
      h.landed = true;
    } else h.landed = p.y - h.floor < 0.05;

    h.root.rotation.y = h.heading;
    h.body.rotation.x = h.pitch;
    h.body.rotation.z = h.roll;
    h.rotor.rotation.y += h.spool * 32 * dt;
    h.tail.rotation.x += h.spool * 45 * dt;
  }

  updateSky(dt) {
    for (const l of this.liners) {
      l.g.position.addScaledVector(l.dir, l.speed * dt);
      if (Math.hypot(l.g.position.x, l.g.position.z) > 560) this.resetLiner(l);
    }
    // Кукурузник: широкий круг над Сити, баннер меняется каждый круг.
    const b = this.biplane, s = this.bi;
    s.ang += dt * 0.11;
    if (s.ang > Math.PI * 2 * (s.lap + 1)) {
      s.lap++;
      b.bmat.map.dispose();
      b.bmat.map = bannerTex(s.lap);
      b.bmat.needsUpdate = true;
    }
    const R = 120;
    b.g.position.set(Math.cos(s.ang) * R, 150 + Math.sin(s.ang * 3) * 6, Math.sin(s.ang) * R);
    // Направление движения — касательная к кругу (против часовой в плане XZ).
    b.g.rotation.set(0, Math.atan2(-Math.sin(s.ang), Math.cos(s.ang)), 0);
    b.g.rotateZ(-0.18);
    b.prop.rotation.z += dt * 40;
    b.banner.rotation.y = Math.sin(this.time * 2.3) * 0.05; // полощется
  }

  update(dt, input) {
    this.time += dt;
    this.updateSky(dt);
    if (!this.ready) this.init();
    this.leafCd = Math.max(0, this.leafCd - dt);
    this.bumpCd = Math.max(0, (this.bumpCd || 0) - dt);
    const play = this.state.mode === 'play';
    // Смерть в воздухе: вертолёт без пилота падает.
    if (this.flying && this.state.mode === 'dead') this.exit(true), this.player.mesh.visible = false;
    for (const h of this.helis) if (play || h !== this.flying) this.updateHeli(h, dt, input, play && h === this.flying);

    for (let i = this.leaflets.length - 1; i >= 0; i--) {
      const L = this.leaflets[i];
      L.life -= dt;
      if (L.m.position.y > 0.05) {
        L.v.x *= Math.exp(-dt); L.v.z *= Math.exp(-dt);
        L.m.position.addScaledVector(L.v, dt);
        L.m.position.x += Math.sin(this.time * 3 + L.spin) * dt * 1.5;
        L.m.rotation.x += dt * L.spin; L.m.rotation.y += dt;
        if (L.m.position.y <= 0.05) { L.m.position.y = 0.05; L.m.rotation.set(-Math.PI / 2, 0, L.spin); }
      }
      if (L.life <= 0) { this.scene.remove(L.m); this.leaflets.splice(i, 1); }
    }

    const pl = this.player;
    const h = this.flying;
    if (h) {
      pl.position.copy(h.position).add(_v.set(0, 1.2, 0));
      // Камера сзади-сверху, плавно.
      const fw = h.forward.clone();
      const want = h.position.clone().addScaledVector(fw, -17).add(_v.set(0, 7, 0));
      const look = h.position.clone().addScaledVector(fw, 8).add(_v.set(0, 1.5, 0));
      if (this.camInit) { this.cam.pos.copy(want); this.cam.look.copy(look); this.camInit = false; }
      const k = Math.min(1, dt * 4);
      this.cam.pos.lerp(want, k);
      this.cam.look.lerp(look, k);
      if (!this.state.camOverride || this.state.camOverride === this.cam) this.state.camOverride = this.cam;
      if (this.sun) { this.sun.position.set(h.position.x - 110, h.position.y + 70, h.position.z + 50); this.sun.target.position.copy(h.position); }
      const alt = Math.round(h.position.y);
      this.hud.setHint(h.landed ? `Высота ${alt} м · ~Пробел~ — взлёт · ~F~ — выйти` : `Высота ${alt} м · ~L~ — листовки · ~Ctrl~ — снижение`);
      this.hud.setCrosshair(false);
      this.hud.setSpeed?.(Math.hypot(h.vel.x, h.vel.z), true);
    } else if (play) {
      // Игрок на крыше после высадки: не даём провалиться сквозь неё.
      const rs = this.roofSupport;
      if (rs) {
        const fl = this.floorAt(pl.position.x, pl.position.z, 0.3, rs.y + 0.1);
        if (fl > 0.4 && pl.position.y <= fl + 0.05 && pl.position.y > fl - 1.5) { pl.position.y = fl; pl.vy = 0; pl.grounded = true; }
        else if (pl.position.y < 0.5) this.roofSupport = null;
        else if (fl <= 0.4 && pl.position.y < rs.y - 2) this.roofSupport = null;
      }
      if (this.nearest(pl.position)) this.hud.setHint('~F~ — сесть в вертолёт');
    }
  }
}
