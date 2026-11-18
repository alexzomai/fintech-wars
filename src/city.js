import * as THREE from 'three';
import { crunchTexture } from './retro.js';
import { TOWERS, towerContext } from './towers.js';

// Город — сетка N×N кварталов, между ними дороги.
// 6 районов = 3 колонки × 2 ряда, каждый район — 2×3 квартала.
export const N = 6;
export const BLOCK = 40;
export const ROAD = 14;
export const CELL = BLOCK + ROAD;
export const HALF = (N * CELL) / 2;
export const roadCoord = (i) => i * CELL - HALF;

export const BANKS = {
  green: { color: 0x2ecc59, css: '#2ecc59', name: 'Сбережёнка', emoji: '🟢' },
  red: { color: 0xe8423a, css: '#e8423a', name: 'Алый Капитал', emoji: '🔴' },
  yellow: { color: 0xf5c518, css: '#f5c518', name: 'ЖЁЛТ', emoji: '🟡' },
};
// Стилизованный Москва-Сити. Север — к −Z, запад — к −X. Река на юге и востоке.
// Районы: 0 СЗ, 1 С, 2 СВ, 3 ЮЗ, 4 Ю, 5 ЮВ.
const START_OWNERS = ['green', 'red', 'red', 'green', 'yellow', 'yellow'];
export const DISTRICT_NAMES = [
  'Евразия и ЦМТ', 'Меркурий и Око', 'Экспоцентр',
  'Башня на набережной', 'Империя и Город Столиц', 'IQ-квартал',
];
// Кварталы с башнями Сити: (i, j) → силуэт. hq: штаб банка (точка возрождения у зелёного).
const TOWER_BLOCKS = {
  '1,1': { kind: 'cmt' }, '1,2': { kind: 'evrazia', hq: true },
  '2,1': { kind: 'oko' }, '3,1': { kind: 'mercury', hq: true },
  '2,2': { kind: 'afimall', neutral: true }, '3,2': { kind: 'federation', neutral: true },
  '1,3': { kind: 'embankment' }, '2,3': { kind: 'capitals' }, '3,3': { kind: 'imperia', hq: true },
  '4,3': { kind: 'iq' }, '4,1': { kind: 'expo' }, '5,1': { kind: 'expo' },
};

export const districtIndex = (i, j) => Math.floor(i / 2) + 3 * Math.floor(j / 3);

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
// Грузим текстуру один раз; при ошибке (файла нет) — тихо остаёмся на цвете.
function loadTex(url, cb) {
  if (!texCache.has(url)) {
    const entry = { tex: null, waiters: [] };
    texCache.set(url, entry);
    texLoader.load(url, (src) => {
      // Ретро: ужимаем до 128 px (билборды — 256), фильтрация nearest.
      const ground = /asphalt|grass|sidewalk/.test(url);
      const t = crunchTexture(src.image, url.includes('billboard') ? 256 : 128, ground);
      src.dispose();
      entry.tex = t;
      entry.waiters.forEach((w) => w(t));
    }, undefined, () => {});
  }
  const e = texCache.get(url);
  if (e.tex) cb(e.tex); else e.waiters.push(cb);
}
// Текстура с собственным repeat (клон делит картинку с оригиналом).
function texInto(material, url, rx, ry, keepColor = false) {
  loadTex(url, (t) => {
    const c = t.clone();
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    material.map = c;
    if (!keepColor) material.color.set(0xffffff);
    material.needsUpdate = true;
  });
}

const tint = (bank, k = 0.35) => new THREE.Color(0xffffff).lerp(new THREE.Color(BANKS[bank].color), k);

export function buildCity(scene) {
  const rand = rng(1337);
  const colliders = []; // AABB {minX,maxX,minZ,maxZ,maxY}
  const walls = []; // наружные стены домов для граффити: {district, pos, normal}
  const size = N * CELL + ROAD;

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4a4c50, roughness: 0.95 });
  texInto(asphalt, '/textures/asphalt.png', size / 10, size / 10);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const outerMat = new THREE.MeshStandardMaterial({ color: 0x5b7f45 });
  texInto(outerMat, '/textures/grass.png', 120, 120, true);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(size * 5, size * 5), outerMat);
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.05;
  scene.add(outer);

  // Разметка.
  const dashGeo = new THREE.PlaneGeometry(0.35, 3);
  dashGeo.rotateX(-Math.PI / 2);
  const dashCount = Math.floor(size / 6);
  const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({ color: 0xd9cfa0 }), (N + 1) * dashCount * 2);
  const m = new THREE.Matrix4(), rotY = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  let k = 0;
  for (let i = 0; i <= N; i++) {
    const c = roadCoord(i);
    for (let d = 0; d < dashCount; d++) {
      const t = -size / 2 + d * 6 + 3;
      dashes.setMatrixAt(k++, m.makeTranslation(c, 0.02, t));
      dashes.setMatrixAt(k++, m.makeTranslation(t, 0.02, c).multiply(rotY));
    }
  }
  scene.add(dashes);

  // Районы: свои материалы плитки, неона и билборда — перекрашиваются при захвате.
  const districts = [];
  for (let d = 0; d < 6; d++) {
    const c = d % 3, r = Math.floor(d / 3);
    const owner = START_OWNERS[d];
    const baseMat = new THREE.MeshStandardMaterial({ color: tint(owner) });
    texInto(baseMat, '/textures/sidewalk.png', BLOCK / 4, BLOCK / 4, true);
    const neonMat = new THREE.MeshBasicMaterial({ color: BANKS[owner].color });
    const boardMat = new THREE.MeshBasicMaterial({ color: BANKS[owner].color });
    districts.push({
      k: d, owner, name: DISTRICT_NAMES[d], baseMat, neonMat, boardMat,
      zone: new THREE.Vector3(roadCoord(2 * c + 1), 0, roadCoord(3 * r + 1) + CELL / 2),
      minX: roadCoord(2 * c), maxX: roadCoord(2 * c + 2), minZ: roadCoord(3 * r), maxZ: roadCoord(3 * r + 3),
    });
  }

  const grassMat = new THREE.MeshStandardMaterial({ color: 0x6f9f50 });
  texInto(grassMat, '/textures/grass.png', 6, 6, true);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x77736e, roughness: 1 });
  const FACADES = {
    brick: { url: '/textures/facade_brick.png', color: 0xa0604a },
    concrete: { url: '/textures/facade_concrete.png', color: 0xb5b0a6 },
    glass: { url: '/textures/facade_glass.png', color: 0x6d8fa8 },
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a30 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4d7a35, flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.5, 6);
  const leafGeo = new THREE.IcosahedronGeometry(2, 0);

  function addBuilding(x, z, w, h, d, kind, district, hq = false) {
    const f = FACADES[kind];
    const side = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.85 });
    // Тайл фасада = 2 окна × 2 этажа ≈ 8×8 м.
    texInto(side, f.url, Math.max(1, Math.round(Math.max(w, d) / 8)), Math.max(1, Math.round(h / 8)));
    const mesh = new THREE.Mesh(boxGeo, [side, side, roofMat, roofMat, side, side]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2 + 0.25, z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    // Неоновый пояс по крыше в цвете владельца района.
    const neon = new THREE.Mesh(boxGeo, district.neonMat);
    neon.scale.set(w + 0.3, hq ? 2.5 : 0.5, d + 0.3);
    neon.position.set(x, h + 0.25 - (hq ? 6 : 1.2), z);
    scene.add(neon);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, maxY: h + 0.25 });
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x0 = roadCoord(i) + ROAD / 2, z0 = roadCoord(j) + ROAD / 2;
      const cx = x0 + BLOCK / 2, cz = z0 + BLOCK / 2;
      const district = districts[districtIndex(i, j)];
      const tower = TOWER_BLOCKS[`${i},${j}`];
      const isPark = !tower && rand() < 0.12;

      const base = new THREE.Mesh(boxGeo, isPark ? grassMat : district.baseMat);
      base.scale.set(BLOCK, 0.25, BLOCK);
      base.position.set(cx, 0.125, cz);
      base.receiveShadow = true;
      scene.add(base);

      if (tower) {
        const t = towerContext(scene, cx, cz, district, texInto);
        const [x0b, x1b, z0b, z1b] = TOWERS[tower.kind](t);
        colliders.push({ minX: cx + x0b, maxX: cx + x1b, minZ: cz + z0b, maxZ: cz + z1b, maxY: 200 });
        if (tower.hq) district.hq = new THREE.Vector3(cx, 0, cz);
        continue;
      }
      if (isPark) {
        for (let t = 0; t < 7; t++) {
          const tx = x0 + 4 + rand() * (BLOCK - 8), tz = z0 + 4 + rand() * (BLOCK - 8);
          const trunk = new THREE.Mesh(trunkGeo, trunkMat);
          trunk.position.set(tx, 1.25, tz);
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          leaf.position.set(tx, 3.5, tz);
          trunk.castShadow = leaf.castShadow = true;
          scene.add(trunk, leaf);
          colliders.push({ minX: tx - 0.5, maxX: tx + 0.5, minZ: tz - 0.5, maxZ: tz + 0.5, maxY: 5 });
        }
        continue;
      }
      const lot = BLOCK / 2;
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          const w = lot - 3 - rand() * 4, d = lot - 3 - rand() * 4;
          // Обычная застройка ниже башен, чтобы силуэт Сити читался издалека.
          const h = 8 + Math.floor(rand() * 3) * 8 + (rand() < 0.15 ? 8 : 0);
          const kind = h <= 16 ? 'brick' : 'concrete';
          const bx = x0 + a * lot + lot / 2, bz = z0 + b * lot + lot / 2;
          addBuilding(bx, bz, w, h, d, kind, district);
          // Стена, выходящая на улицу (наружу квартала), — кандидат под граффити.
          const sx = a ? 1 : -1, sz = b ? 1 : -1;
          walls.push(rand() < 0.5
            ? { district, pos: new THREE.Vector3(bx + sx * w / 2, 0, bz), normal: new THREE.Vector3(sx, 0, 0) }
            : { district, pos: new THREE.Vector3(bx, 0, bz + sz * d / 2), normal: new THREE.Vector3(0, 0, sz) });
        }
      }
    }
  }

  // Билборд-арка над дорогой в центре каждого района (видно, чей район).
  const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
  for (const d of districts) {
    const g = new THREE.Group();
    // Две односторонние плоскости спина к спине — текст читается с обеих сторон, не зеркально.
    for (const rot of [0, Math.PI]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5), d.boardMat);
      board.position.y = 11;
      board.rotation.y = rot;
      g.add(board);
    }
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 14, 0.5), postMat);
      post.position.set(s * 6.6, 7, 0);
      post.castShadow = true;
      g.add(post);
      colliders.push({ minX: d.zone.x + s * 6.6 - 0.3, maxX: d.zone.x + s * 6.6 + 0.3, minZ: d.zone.z + 18 - 0.3, maxZ: d.zone.z + 18 + 0.3, maxY: 14 });
    }
    g.position.set(d.zone.x, 0, d.zone.z + 18);
    scene.add(g);
  }

  const edge = HALF + ROAD / 2;
  buildSurroundings(scene, edge, rand);
  colliders.push({ minX: -edge - 5, maxX: edge + 5, minZ: -edge - 5, maxZ: -edge, maxY: 200 });
  colliders.push({ minX: -edge - 5, maxX: edge + 5, minZ: edge, maxZ: edge + 5, maxY: 200 });
  colliders.push({ minX: -edge - 5, maxX: -edge, minZ: -edge - 5, maxZ: edge + 5, maxY: 200 });
  colliders.push({ minX: edge, maxX: edge + 5, minZ: -edge - 5, maxZ: edge + 5, maxY: 200 });

  districts.forEach((d) => setOwner(d, d.owner));
  return { colliders, districts, size, walls };
}

// Перекраска района: плитка, неон крыш, билборд.
// Подписчики на смену владельца района (граффити, радио и т. п.).
export const ownerListeners = [];

export function setOwner(d, owner) {
  d.owner = owner;
  ownerListeners.forEach((f) => f(d));
  d.baseMat.color.copy(tint(owner));
  d.neonMat.color.set(BANKS[owner].color);
  d.boardMat.map = null;
  d.boardMat.color.set(BANKS[owner].color);
  d.boardMat.needsUpdate = true;
  loadTex(`/textures/billboard_${owner}.png`, (t) => {
    if (d.owner !== owner) return;
    d.boardMat.map = t;
    d.boardMat.color.set(0xffffff);
    d.boardMat.needsUpdate = true;
  });
}

export function districtAt(districts, p) {
  return districts.find((d) => p.x >= d.minX && p.x < d.maxX && p.z >= d.minZ && p.z < d.maxZ) || null;
}

// Случайная точка на полосе дороги.
export function randomRoadPoint(rand = Math.random) {
  const i = Math.floor(rand() * (N + 1));
  const seg = Math.floor(rand() * N);
  const t = roadCoord(seg) + ROAD / 2 + 4 + rand() * (BLOCK - 8);
  const lane = (rand() < 0.5 ? -1 : 1) * 3;
  return rand() < 0.5 ? new THREE.Vector3(roadCoord(i) + lane, 0, t) : new THREE.Vector3(t, 0, roadCoord(i) + lane);
}

// Точка на дороге в кольце [minR, maxR] вокруг center.
export function roadPointNear(center, minR, maxR) {
  for (let n = 0; n < 200; n++) {
    const p = randomRoadPoint();
    const d = p.distanceTo(center);
    if (d >= minR && d <= maxR) return p;
  }
  return center.clone().add(new THREE.Vector3(minR, 0, 0));
}

export function resolveCircle(pos, r, colliders) {
  let hit = false;
  for (const c of colliders) {
    const px = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const pz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - px, dz = pos.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = px + (dx / d) * r;
      pos.z = pz + (dz / d) * r;
    } else {
      const opts = [[c.minX - r - pos.x, 0], [c.maxX + r - pos.x, 0], [0, c.minZ - r - pos.z], [0, c.maxZ + r - pos.z]]
        .sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
      pos.x += opts[0][0];
      pos.z += opts[0][1];
    }
  }
  return hit;
}

// Луч против AABB зданий (y от 0 до maxY). Возвращает расстояние или Infinity.
export function rayBoxes(o, dir, colliders, maxT = 200) {
  let best = maxT;
  for (const c of colliders) {
    let t0 = 0, t1 = best;
    const ax = [[o.x, dir.x, c.minX, c.maxX], [o.y, dir.y, 0, c.maxY], [o.z, dir.z, c.minZ, c.maxZ]];
    let ok = true;
    for (const [p, v, lo, hi] of ax) {
      if (Math.abs(v) < 1e-8) { if (p < lo || p > hi) { ok = false; break; } continue; }
      let ta = (lo - p) / v, tb = (hi - p) / v;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
}

// Окрестности: Москва-река с набережной на юге и востоке, мост, эстакада ТТК с пробкой на западе.
function buildSurroundings(scene, edge, rand) {
  const water = new THREE.MeshStandardMaterial({ color: 0x5a9ec0, metalness: 0.2, roughness: 0.15, emissive: 0x1d3f5a, emissiveIntensity: 0.6 });
  const granite = new THREE.MeshStandardMaterial({ color: 0x8a7f78, roughness: 0.9 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9c968c, roughness: 0.95 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const add = (mat, x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(box, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.receiveShadow = m.castShadow = true;
    scene.add(m);
    return m;
  };
  const far = 600;
  // Река: L-образная полоса вдоль южного и восточного края.
  for (const [x, z, w, d] of [[0, edge + 6 + 70, far * 2, 140], [edge + 6 + 70, 0, 140, far * 2]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), water);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, -0.02, z);
    scene.add(p);
  }
  // Гранитная набережная с парапетом.
  add(granite, 0, 0.3, edge + 3, (edge + 6) * 2, 0.6, 6);
  add(granite, edge + 3, 0.3, -far / 2 + edge / 2, 6, 0.6, far + edge);
  add(granite, 0, 1, edge + 5.7, (edge + 6) * 2, 1, 0.6);
  add(granite, edge + 5.7, 1, -far / 2 + edge / 2, 0.6, 1, far + edge);
  // Багратионовский мост — крытая галерея через реку.
  const bx = roadCoord(5);
  add(concrete, bx, 6, edge + 6 + 70, 10, 1.5, 140);
  add(new THREE.MeshStandardMaterial({ color: 0x9fc7d6, metalness: 0.4, roughness: 0.2, transparent: true, opacity: 0.7 }), bx, 9.5, edge + 6 + 70, 9, 5.5, 140);
  for (const z of [edge + 30, edge + 76, edge + 122]) add(concrete, bx, 3, z, 4, 6, 4);
  // ТТК: эстакада на западе и вечная пробка из машин (жёлтые — такси).
  const tx = -edge - 22;
  add(concrete, tx, 7, 0, 18, 1.2, far * 2);
  for (let z = -far; z <= far; z += 24) add(concrete, tx, 3.2, z, 3, 6.4, 3);
  add(concrete, tx - 8.7, 8.2, 0, 0.6, 1.2, far * 2);
  add(concrete, tx + 8.7, 8.2, 0, 0.6, 1.2, far * 2);
  const carColors = [0xf5c518, 0xf5c518, 0xffffff, 0x333333, 0x8a1c1c, 0x2d4f7a, 0xb0b0b0];
  for (let z = -far + 10; z < far; z += 5 + rand() * 4) {
    for (const lane of [-5, -1.5, 2, 5.5]) {
      if (rand() < 0.3) continue;
      const c = carColors[Math.floor(rand() * carColors.length)];
      add(new THREE.MeshStandardMaterial({ color: c }), tx + lane, 8.4, z, 2, 1.4, 4.2);
    }
  }
}
