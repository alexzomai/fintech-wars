import * as THREE from 'three';
import { N, BLOCK, ROAD, HALF, CELL, BANKS, roadCoord, districtAt, resolveCircle, groundAt } from './city.js';
import { makeHuman, animateHuman } from './humans.js';
import { enableSnap } from './retro.js';

// Мирные жители: гуляют по тротуарам (периметр кварталов), переходят дорогу,
// звонят по телефону, разбегаются от стрельбы, гибнут под колёсами.

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clampI = (v) => Math.max(0, Math.min(N - 1, v));
const INSET = 0.9; // от края квартала
const SIDE = BLOCK - 2 * INSET;
const PERIM = SIDE * 4;

// --- Реплики над головой: CanvasTexture-спрайт, кэш по тексту ---
const bubbleCache = new Map();
export function speechSprite(text, color = '#111') {
  const key = text + color;
  let mat = bubbleCache.get(key);
  if (!mat) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.font = '20px "Press Start 2P", monospace';
    const w = Math.min(500, g.measureText(text).width + 36);
    const x = (512 - w) / 2;
    g.fillStyle = 'rgba(255,255,255,0.94)';
    g.beginPath(); g.roundRect(x, 8, w, 58, 14); g.fill();
    g.beginPath(); g.moveTo(246, 64); g.lineTo(266, 64); g.lineTo(256, 86); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(x, 8, w, 58, 14); g.stroke();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 38);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false });
    bubbleCache.set(key, mat);
  }
  const s = new THREE.Sprite(mat);
  s.scale.set(4, 0.75, 1);
  s.renderOrder = 10;
  return s;
}

const LINES = {
  any: ['Алый звонил мне 40 раз', 'Опять кэшбэк урезали…', 'Ипотека до 2077 года', 'Я на созвоне!', 'Где тут банкомат?',
    'Тёплый-Банк, только не это', 'Мне одобрили, а я не просил', 'Курс опять вырос?'],
  green: ['Сбережёнка — это надёжно', 'Зелёные тут за порядок'],
  red: ['Алый опять поднял ставку…', 'Коллекторы под окнами'],
  yellow: ['Мне снова «тёплое» предложение', 'Страховку навязали…'],
  granny: ['Сынок, а где тут Сбережёнка?', 'Пенсию перевели в Алый?!', 'Ох уж эти ваши банки'],
  tourist: ['Какие башни!', 'Сфоткай меня у Евразии!'],
  courier: ['Заказ на 42 этаж…', 'Опаздываю!'],
  phone: ['Алло? Нет, мне не нужен кредит', 'Да, я в Сити', 'Перезвоню!'],
  panic: ['А-а-а!', 'Помогите!', 'Мои вклады!', 'Стреляют!', 'Звоните в ЦБ!'],
};

const propMat = (c) => enableSnap(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true }));
const PROPS = {
  laptop: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.24), propMat(0x9aa0aa)); m.position.set(0, -0.1, 0.08); return ['handR', m]; },
  coffee: () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.13, 6), propMat(0xf2f2f2)); m.position.set(0, -0.08, 0.05); return ['handR', m]; },
  box: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.35), propMat(0x2ec4b6)); m.position.set(0, 0.32, -0.32); return ['torso', m]; },
  camera: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), propMat(0x111111)); m.position.set(0, -0.08, 0.06); return ['handR', m]; },
  bag: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.12), propMat(0x5a3a2a)); m.position.set(0, -0.2, 0); return ['handR', m]; },
};

const TYPES = {
  clerk: { w: 4, jackets: [0x2b3a55, 0x3a3a3a, 0x4b4f58, 0x2e2e3e], pants: 0x22252c, speed: [1.3, 1.7], props: ['laptop', 'coffee', null] },
  courier: { w: 2, jackets: [0xff7a1a, 0x2a7bd6], pants: 0x1d1f24, cap: true, speed: [1.9, 2.3], props: ['box'] },
  tourist: { w: 2, jackets: [0xff6fa8, 0x6fd3ff, 0xfff06f, 0xffffff], pants: 0xc9b48a, speed: [1.0, 1.3], props: ['camera'] },
  granny: { w: 1, jackets: [0x7a4a6a, 0x5a6a4a, 0x8a6a5a], pants: 0x4a3a4a, scale: 0.86, speed: [0.7, 0.9], props: ['bag'], skin: 0xe8c0a0 },
};
const TYPE_BAG = Object.entries(TYPES).flatMap(([k, t]) => Array(t.w).fill(k));
const SKINS = [0xd9a77c, 0xf0c8a0, 0xb07850, 0x8a5a3a, 0xe8b890];

// Прямоугольник тротуара квартала (i, j) и точка на нём по параметру s.
const rect = (i, j) => {
  const x0 = roadCoord(i) + ROAD / 2 + INSET, z0 = roadCoord(j) + ROAD / 2 + INSET;
  return [x0, z0, x0 + SIDE, z0 + SIDE];
};
function perimPoint(i, j, s, out) {
  const [x0, z0, x1, z1] = rect(i, j);
  s = ((s % PERIM) + PERIM) % PERIM;
  if (s < SIDE) return out.set(x0 + s, 0, z0);
  if (s < 2 * SIDE) return out.set(x1, 0, z0 + s - SIDE);
  if (s < 3 * SIDE) return out.set(x1 - (s - 2 * SIDE), 0, z1);
  return out.set(x0, 0, z1 - (s - 3 * SIDE));
}
// Ближайшая точка периметра → s.
function perimParam(i, j, x, z) {
  const [x0, z0, x1, z1] = rect(i, j);
  const cx = Math.max(x0, Math.min(x1, x)), cz = Math.max(z0, Math.min(z1, z));
  const d = [cz - z0, x1 - cx, z1 - cz, cx - x0];
  const k = d.indexOf(Math.min(...d));
  return [cx - x0, SIDE + cz - z0, 2 * SIDE + x1 - cx, 3 * SIDE + z1 - cz][k];
}
export const blockAt = (x, z) => [clampI(Math.floor((x + HALF - ROAD / 2) / CELL)), clampI(Math.floor((z + HALF - ROAD / 2) / CELL))];
// Углы периметра: 0 (x0,z0), 1 (x1,z0), 2 (x1,z1), 3 (x0,z1).
const CORNER_SX = [-1, 1, 1, -1], CORNER_SZ = [-1, -1, 1, 1];
const cornerOf = (sx, sz) => (sz < 0 ? (sx < 0 ? 0 : 1) : (sx < 0 ? 3 : 2));

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Npcs {
  constructor(scene, { colliders, districts, max = 50 } = {}) {
    this.scene = scene;
    this.colliders = colliders;
    this.districts = districts;
    this.max = max;
    this.list = [];
    this.bubbles = 0;
    this.filled = false;
    this.spawnT = 0;
    this.onKilled = null; // (npc) => void — сбит машиной
  }

  get alive() { return this.list.filter((n) => !n.dead); }

  // Новый прохожий. pos — точка (будет притянута к тротуару, если не free).
  spawnAt(pos, { type = pick(TYPE_BAG), bank = null, free = false } = {}) {
    const T = TYPES[type];
    const d = districtAt(this.districts, pos);
    bank ||= d ? d.owner : 'green';
    const accent = BANKS[bank].color;
    // Треть прохожих — «клиенты»: куртка в цвете банка района.
    const jacket = Math.random() < 0.33 ? new THREE.Color(accent).lerp(new THREE.Color(0x111111), 0.45).getHex() : pick(T.jackets);
    const h = makeHuman({ jacket, accent, pants: T.pants, skin: T.skin || pick(SKINS), cap: T.cap, scale: T.scale || 1 });
    h.armR.hand.remove(h.gun);
    h.gun = new THREE.Object3D(); // мирные без оружия (animateHuman трогает h.gun.visible)
    h.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    const props = [];
    const pk = pick(T.props);
    if (pk) {
      const [where, m] = PROPS[pk]();
      (where === 'torso' ? h.torso : h.armR.hand).add(m);
      props.push(m);
    }
    const [i, j] = blockAt(pos.x, pos.z);
    const n = {
      h, type, bank, props, i, j, s: perimParam(i, j, pos.x, pos.z), dir: Math.random() < 0.5 ? 1 : -1,
      walk: rnd(...T.speed), speed: 0, mode: 'walk', modeT: rnd(4, 12), target: null,
      position: h.root.position, radius: 0.4, dead: false, deadT: 0, talkT: rnd(3, 20), bubble: null, bubbleT: 0, far: false,
    };
    if (free) { h.root.position.copy(pos); n.mode = 'idle'; n.modeT = rnd(4, 8); } else perimPoint(i, j, n.s, h.root.position);
    h.root.position.y = groundAt(h.root.position.x, h.root.position.z);
    h.root.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(h.root);
    this.list.push(n);
    return n;
  }

  // Случайная точка тротуара в кольце [minR, maxR] вокруг center.
  spawnInRing(center, minR, maxR) {
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, r = rnd(minR, maxR);
      const x = center.x + Math.sin(a) * r, z = center.z + Math.cos(a) * r;
      if (Math.abs(x) > HALF || Math.abs(z) > HALF) continue;
      const [i, j] = blockAt(x, z);
      perimPoint(i, j, perimParam(i, j, x, z), _p);
      const d = Math.hypot(_p.x - center.x, _p.z - center.z);
      if (d < minR || d > maxR + 5) continue;
      return this.spawnAt(_p);
    }
    return null;
  }

  remove(n) {
    if (n.bubble) this.unsay(n);
    this.scene.remove(n.h.root);
    const i = this.list.indexOf(n);
    if (i >= 0) this.list.splice(i, 1);
  }

  // Отдать человека (например, в амбассадоры): убираем из толпы, модель остаётся в сцене.
  release(n) {
    if (n.bubble) this.unsay(n);
    n.props.forEach((m) => m.parent?.remove(m));
    this.list.splice(this.list.indexOf(n), 1);
    n.h.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return n.h;
  }

  say(n, text, life = 2) {
    if (n.bubble) this.unsay(n);
    n.bubble = speechSprite(text);
    const s = n.h.root.scale.x;
    n.bubble.position.y = 2.55 / s;
    n.bubble.scale.multiplyScalar(1 / s);
    n.h.root.add(n.bubble);
    n.bubbleT = life;
    this.bubbles++;
  }
  unsay(n) { n.h.root.remove(n.bubble); n.bubble = null; this.bubbles--; }

  // Выстрел/взрыв: все в радиусе бегут прочь.
  panic(pos, radius = 25) {
    let k = 0;
    for (const n of this.list) {
      if (n.dead) continue;
      const dx = n.position.x - pos.x, dz = n.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      if (n.mode !== 'panic' && Math.random() < 0.25 && this.bubbles < 6) this.say(n, pick(LINES.panic), 1.5);
      n.mode = 'panic';
      n.modeT = rnd(4, 7);
      const a = Math.atan2(dx, dz) + rnd(-0.5, 0.5);
      n.flee = [Math.sin(a), Math.cos(a)];
      k++;
    }
    return k;
  }

  // Сбит машиной.
  hit(n, vel) {
    n.dead = true;
    n.deadT = 0;
    n.fling = vel.clone().multiplyScalar(0.7);
    n.fling.y = 0;
    if (n.bubble) this.unsay(n);
    this.onKilled?.(n);
  }

  // ctx: { center: Vector3, vehicle: {position, speed, heading}|null, traffic: [{mesh, speed}], budget }
  update(dt, ctx) {
    const c = ctx.center;
    const want = Math.max(0, Math.min(this.max, ctx.budget ?? this.max));
    const living = this.list.filter((n) => !n.dead).length;
    if (!this.filled) {
      // Первое заполнение — сразу вокруг игрока.
      for (let k = living; k < want; k++) this.spawnInRing(c, 8, 110);
      this.filled = true;
    } else if (living < want && (this.spawnT -= dt) <= 0) {
      this.spawnT = 0.15;
      this.spawnInRing(c, 45, 115);
    }

    for (const n of [...this.list]) {
      const dist = Math.hypot(n.position.x - c.x, n.position.z - c.z);
      if (dist > 130 || (living > want + 4 && dist > 60 && !n.dead)) { this.remove(n); continue; }
      const far = dist > 75;
      n.h.root.visible = !far;

      if (n.dead) {
        n.deadT += dt;
        n.h.root.rotation.x = Math.max(-Math.PI / 2, -n.deadT * n.deadT * 14);
        if (n.fling) n.position.addScaledVector(n.fling, dt * Math.max(0, 1 - n.deadT * 1.5));
        if (!far) animateHuman(n.h, dt, { speed: 0, crouch: Math.min(1, n.deadT * 2) });
        if (n.deadT > 8) this.remove(n);
        continue;
      }

      // Машины: игрок на скорости сбивает, остальных обходим/отпрыгиваем.
      if (dist < 40) {
        const v = ctx.vehicle;
        if (v && Math.abs(v.speed) > 6 && Math.hypot(n.position.x - v.position.x, n.position.z - v.position.z) < (v.radius || 1.9) + n.radius) {
          this.hit(n, _v.set(Math.sin(v.heading), 0, Math.cos(v.heading)).multiplyScalar(Math.abs(v.speed)));
          continue;
        }
        for (const car of ctx.traffic || []) {
          const p = car.mesh ? car.mesh.position : car.position;
          const dx = n.position.x - p.x, dz = n.position.z - p.z, dd = Math.hypot(dx, dz);
          if (dd < 2.6 && dd > 1e-3) { n.position.x += (dx / dd) * (2.6 - dd); n.position.z += (dz / dd) * (2.6 - dd); }
        }
      }

      let mx = 0, mz = 0, run = false;
      n.modeT -= dt;
      if (n.mode === 'walk') {
        const s0 = n.s;
        n.s += n.dir * n.walk * dt;
        perimPoint(n.i, n.j, n.s, _p);
        mx = (_p.x - n.position.x) / dt; mz = (_p.z - n.position.z) / dt;
        if (Math.hypot(mx, mz) > n.walk * 3) { n.position.x = _p.x; n.position.z = _p.z; mx = mz = 0; } // рывок после выталкивания
        // Угол квартала: иногда переходим дорогу.
        const k0 = Math.floor(s0 / SIDE), k1 = Math.floor(n.s / SIDE);
        if (k0 !== k1 && Math.random() < 0.3) {
          const corner = ((Math.max(k0, k1) % 4) + 4) % 4;
          const sx = CORNER_SX[corner], sz = CORNER_SZ[corner];
          const acrossX = Math.random() < 0.5;
          const ni = n.i + (acrossX ? sx : 0), nj = n.j + (acrossX ? 0 : sz);
          if (ni >= 0 && ni < N && nj >= 0 && nj < N) {
            const nc = cornerOf(acrossX ? -sx : sx, acrossX ? sz : -sz);
            n.next = [ni, nj, nc * SIDE];
            n.target = perimPoint(ni, nj, nc * SIDE, new THREE.Vector3());
            n.mode = 'wait'; n.modeT = rnd(0.8, 2.2); // ждём у перехода
          }
        } else if (n.modeT <= 0) {
          n.modeT = rnd(6, 16);
          const r = Math.random();
          if (r < 0.3) { n.mode = 'phone'; n.modeT = rnd(3, 6); if (dist < 30 && Math.random() < 0.5 && this.bubbles < 4) this.say(n, pick(LINES.phone)); }
          else if (r < 0.45) n.dir *= -1;
        }
      } else if (n.mode === 'wait' || n.mode === 'phone' || n.mode === 'idle') {
        if (n.modeT <= 0) {
          if (n.mode === 'wait') n.mode = 'cross';
          else if (n.mode === 'idle') { n.mode = 'cross'; n.s = perimParam(n.i, n.j, n.position.x, n.position.z); n.target = perimPoint(n.i, n.j, n.s, new THREE.Vector3()); n.next = [n.i, n.j, n.s]; }
          else { n.mode = 'walk'; n.modeT = rnd(6, 16); }
        }
      } else if (n.mode === 'cross') {
        _v.set(n.target.x - n.position.x, 0, n.target.z - n.position.z);
        const l = _v.length();
        if (l < 0.3) { [n.i, n.j, n.s] = n.next; n.mode = 'walk'; n.modeT = rnd(6, 16); }
        else { const sp = Math.min(n.walk * 1.2, l / dt); mx = (_v.x / l) * sp; mz = (_v.z / l) * sp; }
      } else if (n.mode === 'panic') {
        run = true;
        mx = n.flee[0] * 5.5; mz = n.flee[1] * 5.5;
        if (n.modeT <= 0) {
          // Успокоились — возвращаемся на ближайший тротуар.
          [n.i, n.j] = blockAt(n.position.x, n.position.z);
          const s = perimParam(n.i, n.j, n.position.x, n.position.z);
          n.next = [n.i, n.j, s];
          n.target = perimPoint(n.i, n.j, s, new THREE.Vector3());
          n.mode = 'cross';
        }
      }

      if (n.mode !== 'walk') { n.position.x += mx * dt; n.position.z += mz * dt; }
      else { n.position.x = _p.x; n.position.z = _p.z; }
      n.speed = Math.hypot(mx, mz);
      if (n.speed > 0.2) {
        const yaw = Math.atan2(mx, mz);
        n.h.root.rotation.y += Math.atan2(Math.sin(yaw - n.h.root.rotation.y), Math.cos(yaw - n.h.root.rotation.y)) * Math.min(1, dt * 10);
      }
      if (n.mode === 'panic' && dist < 80) {
        const before = n.position.x + n.position.z;
        resolveCircle(n.position, n.radius, this.colliders);
        if (Math.abs(before - n.position.x - n.position.z) > 0.01) { const a = Math.atan2(n.flee[0], n.flee[1]) + rnd(0.8, 2); n.flee = [Math.sin(a), Math.cos(a)]; }
      }
      n.position.y = groundAt(n.position.x, n.position.z);

      // Реплики изредка и только рядом с игроком.
      if (n.bubble && (n.bubbleT -= dt) <= 0) this.unsay(n);
      if ((n.talkT -= dt) <= 0) {
        n.talkT = rnd(10, 30);
        if (dist < 25 && this.bubbles < 3 && n.mode !== 'panic') {
          const pool = LINES[n.type] && Math.random() < 0.5 ? LINES[n.type] : Math.random() < 0.3 ? LINES[n.bank] : LINES.any;
          this.say(n, pick(pool));
        }
      }

      if (far) continue; // дальних не анимируем
      animateHuman(n.h, dt, { speed: n.speed, run });
      if (n.mode === 'phone') {
        // Телефон у уха.
        n.h.armL.shoulder.rotation.x = -2.5; n.h.armL.shoulder.rotation.z = 0.6; n.h.armL.elbow.rotation.x = -2.3;
      } else if (n.mode === 'panic') {
        n.h.armL.shoulder.rotation.x = -2.8; n.h.armR.shoulder.rotation.x = -2.8; // руки вверх
      }
    }
  }
}
