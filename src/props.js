import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { N, BLOCK, ROAD, roadCoord } from './city.js';
import { enableSnap } from './retro.js';

// Модели: Kenney Car Kit (CC0), см. CREDITS.md. Всё грузится асинхронно и кэшируется.
const loader = new GLTFLoader();
const gltfCache = new Map();
export function loadGLB(url) {
  if (!gltfCache.has(url)) gltfCache.set(url, loader.loadAsync(url).then((g) => g.scene));
  return gltfCache.get(url);
}

// --- Машины ---
// Таблица типов: len — длина (м), paint — клетка палитры 8×8 под цвет машины (null = фиксированная раскраска),
// fixed — принудительный цвет. radius/maxSpeed/accel/mass — для физики (Car её подхватывает отдельно).
export const CAR_TYPES = {
  sedan: { id: 'sedan', name: 'Ипотека Седан', mesh: 'sedan', len: 4.4, paint: [6, 2], radius: 1.9, maxSpeed: 38, accel: 22, mass: 1.0 },
  hatch: { id: 'hatch', name: 'Депозит Хэтч', mesh: 'hatchback-sports', len: 3.9, paint: [3, 2], radius: 1.8, maxSpeed: 40, accel: 25, mass: 0.85 },
  suv: { id: 'suv', name: 'Кредит Внедорожник', mesh: 'suv', len: 4.7, paint: [3, 2], radius: 2.0, maxSpeed: 35, accel: 20, mass: 1.4 },
  sports: { id: 'sports', name: 'Микрозайм GT', mesh: 'sedan-sports', len: 4.4, paint: [6, 2], radius: 1.9, maxSpeed: 52, accel: 32, mass: 0.9 },
  taxi: { id: 'taxi', name: 'Кэшбэк Такси', mesh: 'taxi', len: 4.4, paint: null, radius: 1.9, maxSpeed: 40, accel: 24, mass: 1.0 },
  van: { id: 'van', name: 'Сбережёнка-мобиль', mesh: 'van', len: 5.0, paint: [7, 2], radius: 2.1, maxSpeed: 32, accel: 17, mass: 1.6 },
  armored: { id: 'armored', name: 'Инкассатор', mesh: 'delivery', len: 5.4, paint: [3, 2], fixed: 0x55595f, radius: 2.3, maxSpeed: 28, accel: 14, mass: 3.0 },
  fns: { id: 'fns', name: 'Служебный ФНС', mesh: 'sedan', len: 4.4, paint: [6, 2], fixed: 0x8a8f98, siren: true, radius: 1.9, maxSpeed: 45, accel: 28, mass: 1.1 },
  police: { id: 'police', name: 'Патруль ЦБ', mesh: 'police', len: 4.6, paint: null, siren: true, radius: 1.9, maxSpeed: 46, accel: 28, mass: 1.1 },
};
const CAR_ORDER = ['sedan', 'sedan', 'hatch', 'hatch', 'suv', 'sports', 'taxi', 'van', 'armored', 'fns', 'police'];
export const randomCarType = () => CAR_ORDER[Math.floor(Math.random() * CAR_ORDER.length)];
export const carModelUrl = (type) => `/models/cars/${CAR_TYPES[type].mesh}.glb`;
export const preloadCars = () => Object.keys(CAR_TYPES).forEach((k) => loadGLB(carModelUrl(k)).catch(() => {}));

const paintCache = new Map();
// Материал с перекрашенной палитрой: градиент кузова заменяется оттенками нужного цвета.
function paintedMaterial(kind, orig, color) {
  const spec = CAR_TYPES[kind];
  if (spec.fixed != null) color = spec.fixed;
  const key = `${kind}:${spec.paint ? color : 'fixed'}`;
  if (paintCache.has(key)) return paintCache.get(key);
  const mat = orig.clone();
  if (spec.paint && orig.map?.image) {
    const img = orig.map.image;
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const cell = img.width / 8, [cx, cy] = spec.paint;
    const c = new THREE.Color(color);
    const grad = ctx.createLinearGradient(0, cy * cell, 0, (cy + 2) * cell);
    grad.addColorStop(0, '#' + c.clone().offsetHSL(0, 0, 0.1).getHexString());
    grad.addColorStop(1, '#' + c.clone().offsetHSL(0, 0, -0.14).getHexString());
    ctx.fillStyle = grad;
    ctx.fillRect(cx * cell, cy * cell, cell, cell * 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    mat.map = tex;
  }
  mat.metalness = 0.15; mat.roughness = 0.6;
  enableSnap(mat);
  paintCache.set(key, mat);
  return mat;
}

// Готовая модель машины: «перед = +Z», длина по таблице, колёса на y = 0.
// userData: wheels (для spinWheels), wheelR, brake (стоп-сигналы), siren (мигалка).
export async function buildCarModel(kind, color) {
  const spec = CAR_TYPES[kind];
  const src = await loadGLB(carModelUrl(kind));
  const model = src.clone(true);
  const wheels = [];
  model.traverse((o) => {
    if (/^wheel/.test(o.name)) wheels.push(o);
    if (!o.isMesh) return;
    o.material = paintedMaterial(kind, o.material, color);
    o.castShadow = true;
  });
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = spec.len / size.z;
  const holder = new THREE.Group();
  model.scale.setScalar(s);
  model.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
  holder.add(model);
  holder.userData.wheels = wheels;
  holder.userData.wheelR = 0.3 * s;

  // Фары, стоп-сигналы, мигалка (самосветящиеся коробки).
  const w = size.x * s, h = size.y * s, L = spec.len;
  const head = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tail = new THREE.MeshBasicMaterial({ color: 0x7a1010 });
  const lg = new THREE.BoxGeometry(0.38, 0.2, 0.06);
  for (const x of [-1, 1]) {
    const f = new THREE.Mesh(lg, head); f.position.set(x * w * 0.32, h * 0.3, L / 2 + 0.02);
    const r = new THREE.Mesh(lg, tail); r.position.set(x * w * 0.32, h * 0.32, -L / 2 - 0.02);
    holder.add(f, r);
  }
  holder.userData.tail = tail;
  if (spec.siren) {
    const red = new THREE.MeshBasicMaterial({ color: 0xff2222 }), blue = new THREE.MeshBasicMaterial({ color: 0x2255ff });
    const sg = new THREE.BoxGeometry(0.4, 0.14, 0.3);
    const a = new THREE.Mesh(sg, red), b = new THREE.Mesh(sg, blue);
    a.position.set(-0.25, h + 0.05, 0); b.position.set(0.25, h + 0.05, 0);
    holder.add(a, b);
    holder.userData.siren = [red, blue];
  }
  return holder;
}

// Крутит колёса и мигалку. speed — скорость вдоль курса (м/с), dt — секунды. Вызывать каждый кадр.
export function spinWheels(mesh, speed, dt) {
  const u = mesh.userData;
  const holder = u.holder;
  const d = holder?.userData;
  if (!d) return;
  const k = (speed * dt) / d.wheelR;
  for (const w of d.wheels) w.rotation.x += k;
  if (d.siren) {
    const on = Math.floor(performance.now() / 180) % 2 === 0;
    d.siren[0].color.set(on ? 0xff2222 : 0x331111);
    d.siren[1].color.set(on ? 0x112244 : 0x2255ff);
  }
}

// Стоп-сигналы: ярче, когда тормозим.
export function setBrakeLights(mesh, on) {
  const d = mesh.userData.holder?.userData;
  if (d) d.tail.color.set(on ? 0xff2a2a : 0x7a1010);
}

// --- Реквизит ---
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Склейка примитивов в одну геометрию с вершинными цветами.
function parts(list) {
  const geos = list.map(({ geo, pos = [0, 0, 0], rot = [0, 0, 0], color }) => {
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)));
    const col = new THREE.Color(color), n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(arr, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g.index ? g.toNonIndexed() : g;
  });
  return mergeGeometries(geos);
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg);

const GEO = {
  lamp: () => parts([
    { geo: cyl(0.12, 6), pos: [0, 3, 0], color: 0x3a3d42 },
    { geo: box(0.2, 0.2, 1.4), pos: [0, 6, 0.6], color: 0x3a3d42 },
  ]),
  lampHead: () => box(0.7, 0.2, 0.9), // светится
  bench: () => parts([
    { geo: box(1.8, 0.1, 0.5), pos: [0, 0.5, 0], color: 0x8a5a2b },
    { geo: box(1.8, 0.45, 0.08), pos: [0, 0.8, -0.25], color: 0x8a5a2b },
    { geo: box(0.1, 0.5, 0.5), pos: [-0.8, 0.25, 0], color: 0x2d2f33 },
    { geo: box(0.1, 0.5, 0.5), pos: [0.8, 0.25, 0], color: 0x2d2f33 },
  ]),
  bin: () => parts([
    { geo: cyl(0.3, 0.8, 8), pos: [0, 0.4, 0], color: 0x3f6f4a },
    { geo: cyl(0.33, 0.08, 8), pos: [0, 0.84, 0], color: 0x2c4a33 },
  ]),
  sign: () => parts([
    { geo: cyl(0.05, 2.6, 6), pos: [0, 1.3, 0], color: 0x9a9da3 },
    { geo: box(0.7, 0.7, 0.06), pos: [0, 2.5, 0.05], color: 0xd9b100 },
    { geo: box(0.4, 0.4, 0.07), pos: [0, 2.5, 0.05], color: 0x1d1d1d },
  ]),
};

// InstancedMesh-ы из GLB: геометрия каждого меша с учётом его трансформа, общий материал.
async function instanceGLB(url, scale, matrices, group) {
  const src = await loadGLB(url);
  src.updateMatrixWorld(true);
  const s4 = new THREE.Matrix4().makeScale(scale, scale, scale);
  src.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const mat = o.material.clone();
    if (mat.map) mat.map.magFilter = THREE.NearestFilter;
    const im = new THREE.InstancedMesh(geo, mat, matrices.length);
    const m = new THREE.Matrix4();
    matrices.forEach((mx, i) => im.setMatrixAt(i, m.multiplyMatrices(mx, s4)));
    im.castShadow = true;
    im.frustumCulled = false;
    group.add(im);
  });
}

// Расставляет фонари, скамейки, урны, знаки, конусы и деревья в кадках по краям кварталов.
// colliders — чтобы не ставить реквизит внутрь зданий.
export function initProps(scene, colliders = []) {
  preloadCars();
  const rand = rng(4242);
  const group = new THREE.Group();
  scene.add(group);
  const items = { lamp: [], bench: [], bin: [], sign: [], cone: [], treeS: [], treeL: [], planter: [] };
  const free = (x, z) => !colliders.some((c) => x > c.minX - 0.8 && x < c.maxX + 0.8 && z > c.minZ - 0.8 && z < c.maxZ + 0.8);
  const SIDE_Y = 0.25, INSET = 0.9;
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const put = (list, x, z, yaw, y = SIDE_Y) => {
    if (!free(x, z)) return;
    list.push(mat.clone().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new THREE.Vector3(1, 1, 1)));
  };

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x0 = roadCoord(i) + ROAD / 2, z0 = roadCoord(j) + ROAD / 2;
      // Четыре стороны: точка на стороне при параметре t, наружная нормаль, курс «лицом к дороге».
      const sides = [
        (t) => ({ x: x0 + t, z: z0 + INSET, yaw: Math.PI, nx: 0, nz: -1 }), // -Z
        (t) => ({ x: x0 + t, z: z0 + BLOCK - INSET, yaw: 0, nx: 0, nz: 1 }), // +Z
        (t) => ({ x: x0 + INSET, z: z0 + t, yaw: -Math.PI / 2, nx: -1, nz: 0 }), // -X
        (t) => ({ x: x0 + BLOCK - INSET, z: z0 + t, yaw: Math.PI / 2, nx: 1, nz: 0 }), // +X
      ];
      for (const side of sides) {
        const lampT = rand() < 0.5 ? 11 : 29;
        const p = side(lampT);
        // Лампа: рука смотрит на дорогу (+Z модели → наружу).
        put(items.lamp, p.x, p.z, Math.atan2(p.nx, p.nz));
        if (rand() < 0.3) { const b = side(20); put(items.bench, b.x - b.nx * 0.2, b.z - b.nz * 0.2, Math.atan2(b.nx, b.nz)); }
        if (rand() < 0.35) { const b = side(lampT < 20 ? 24 : 16); put(items.bin, b.x, b.z, 0); }
        if (rand() < 0.18) { const b = side(rand() < 0.5 ? 3 : 37); put(items.sign, b.x, b.z, Math.atan2(b.nx, b.nz)); }
        if (rand() < 0.4) {
          const b = side(rand() < 0.5 ? 5 : 35);
          put(items.planter, b.x, b.z, 0);
          put(rand() < 0.5 ? items.treeS : items.treeL, b.x, b.z, rand() * 6, SIDE_Y + 0.75);
        }
        if (rand() < 0.1) {
          const b = side(15 + rand() * 10);
          for (let k = 0; k < 3; k++) put(items.cone, b.x + k * 0.9 * (b.nz ? 1 : 0), b.z + k * 0.9 * (b.nx ? 1 : 0), 0);
        }
      }
    }
  }

  const stdVC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const inst = (geo, material, list) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.frustumCulled = false;
    group.add(im);
    return im;
  };
  for (const k of ['lamp', 'bench', 'bin', 'sign']) inst(GEO[k](), stdVC, items[k]);
  // Головки фонарей — светятся, не зависят от освещения.
  const headList = items.lamp.map((m) => m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 5.9, 1.25)));
  const head = inst(GEO.lampHead(), new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), headList);
  if (head) head.castShadow = false;

  // Модели Kenney: кадки, деревья, конусы (масштаб подогнан под рост человека ~1,8 м).
  const dir = '/models/props/';
  instanceGLB(dir + 'planter.glb', 4.5, items.planter, group).catch(() => {});
  instanceGLB(dir + 'tree-small.glb', 6, items.treeS, group).catch(() => {});
  instanceGLB(dir + 'tree-large.glb', 6, items.treeL, group).catch(() => {});
  instanceGLB(dir + 'cone.glb', 1.3, items.cone, group).catch(() => {});

  return { group, counts: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v.length])) };
}
