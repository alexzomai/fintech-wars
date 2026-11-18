import * as THREE from 'three';
import { BANKS, HALF, ROAD, ownerListeners } from './city.js';
import { createDaytime } from './daytime.js';

// «Неон и город»: неоновые баннеры и голограммы на штабах, медиафасады с живыми новостями,
// голобилборды с пародийной рекламой и QR, неоновая ночь с дождём (клавиша N).
// Всё декоративное: коллизии и логику районов не трогает.

const FONT = '"Press Start 2P", monospace';
const GAME_URL = 'https://sber-game.vercel.app';

// Штабы банков: d.k → вертикальные полосы баннеров [dx, dz, y0, y1, rotY, вдоль X?],
// высота крыши для голограммы, место медиафасада [dx, y, dz, ширина, rotY].
// Координаты — от центра квартала, совпадают с силуэтами из towers.js.
const HQ = {
  0: { // Евразия
    strips: [[-13.15, 1.95, 0, 125, 0.15, false], [-1.2, -8.15, 0, 125, 0.15, true]],
    roof: 125,
  },
  1: { // Меркурий: баннер ломается по ступеням
    strips: [
      [-11.3, 3, 0, 70, 0, false], [-10.8, 3, 70, 110, 0, false], [-8.8, 3, 110, 140, 0, false],
      [-3, -11.3, 0, 70, 0, true], [-3, -6.8, 70, 110, 0, true], [-3, -2.8, 110, 140, 0, true],
    ],
    roof: 140,
    facade: [0, 41, 11.3, 18, 0],
  },
  4: { // Империя
    strips: [[-13.3, 0, 0, 100, 0, false], [13.3, -2, 0, 100, 0, false]],
    roof: 116,
    facade: [6, 47, 13.3, 11.5, 0],
  },
};

const VERB = { green: 'ЗАХВАТИЛА', red: 'ЗАХВАТИЛ', yellow: 'ЗАХВАТИЛ' };
const UPPER = { green: 'СБЕРЕЖЁНКА', red: 'АЛЫЙ КАПИТАЛ', yellow: 'ЖЁЛТ' };
const SHARE = { green: 'СБЕРЕЖЁНКИ', red: 'АЛОГО', yellow: 'ЖЁЛТА' };
const PLACE_ACC = ['ЕВРАЗИЮ И ЦМТ', 'МЕРКУРИЙ И ОКО', 'ЭКСПОЦЕНТР', 'НАБЕРЕЖНУЮ', 'ИМПЕРИЮ', 'IQ-КВАРТАЛ'];
const EMBLEM = { green: 'С', red: 'А', yellow: 'Ж' };

const ADS = [
  { bank: 'red', title: 'АЛЫЙ КАПИТАЛ', text: 'Одобрим даже вашего кота', bg: ['#4a0610', '#e8423a'] },
  { bank: 'yellow', title: 'ЖЁЛТ', text: 'Мы не банк, мы ваш образ жизни', bg: ['#3a2a00', '#f5c518'] },
  { bank: 'green', title: 'СБЕРЕЖЁНКА', text: 'Копим вместе. Навсегда.', bg: ['#032a14', '#2ecc59'] },
  { bank: null, title: 'СИТИ-2049', text: 'Кресло в Совете ждёт победителя', bg: ['#1a0b3a', '#ff4fd8'] },
];

function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return { c, g: c.getContext('2d'), t };
}

// Перенос строки по ширине канваса.
function wrap(g, text, maxW) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    const s = line ? line + ' ' + w : w;
    if (g.measureText(s).width > maxW && line) { out.push(line); line = w; } else line = s;
  }
  if (line) out.push(line);
  return out;
}

// --- QR-код: минимальный кодировщик (byte mode, уровень L, версии 1–5, маска 0) ---
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsRemainder(data, degree) {
  const div = new Array(degree).fill(0);
  div[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      div[j] = gfMul(div[j], root);
      if (j + 1 < degree) div[j] ^= div[j + 1];
    }
    root = gfMul(root, 2);
  }
  const res = new Array(degree).fill(0);
  for (const b of data) {
    const f = b ^ res.shift();
    res.push(0);
    for (let i = 0; i < degree; i++) res[i] ^= gfMul(div[i], f);
  }
  return res;
}
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  // [всего кодовых слов, ECC] для уровня L, один блок.
  const SPEC = { 1: [26, 7], 2: [44, 10], 3: [70, 15], 4: [100, 20], 5: [134, 26] };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] };
  let ver = 1;
  while (SPEC[ver][0] - SPEC[ver][1] < bytes.length + 2) ver++;
  const [total, ecLen] = SPEC[ver];
  const dataLen = total - ecLen;
  const bits = [];
  const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  push(4, 4); push(bytes.length, 8);
  bytes.forEach((b) => push(b, 8));
  push(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; data.length < dataLen; p++) data.push(p % 2 ? 0x11 : 0xec);
  const code = data.concat(rsRemainder(data, ecLen));

  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, v) => { mod[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[ver], n = al.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Формат: уровень L (01) + маска 0, BCH(15,5) и XOR 0x5412.
  const fmt = (1 << 3) | 0;
  let rem = fmt;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fb = ((fmt << 10) | rem) ^ 0x5412;
  const bit = (i) => ((fb >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);
  // Данные зигзагом снизу вверх парами столбцов.
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
        if (fn[y][x]) continue;
        if (k < code.length * 8) mod[y][x] = ((code[k >>> 3] >>> (7 - (k & 7))) & 1) === 1;
        k++;
        if ((x + y) % 2 === 0) mod[y][x] = !mod[y][x];
      }
    }
  }
  return mod;
}

// --- Голографический билборд: кадры на CanvasTexture + шейдер мерцания, сканлайнов и глитча ---
const holoVert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const holoFrag = `
  uniform sampler2D map; uniform float time, glitch, scan, boost;
  varying vec2 vUv;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vec2 uv = vUv;
    float band = step(0.6, h(floor(uv.y * 18.0) + floor(time * 24.0))) * glitch;
    uv.x = fract(uv.x + band * 0.12 * (h(floor(time * 24.0)) - 0.5));
    float sh = glitch * 0.025;
    vec3 c = vec3(texture2D(map, uv + vec2(sh, 0.0)).r, texture2D(map, uv).g, texture2D(map, uv - vec2(sh, 0.0)).b);
    float lines = 1.0 - scan * (0.5 + 0.5 * sin(vUv.y * 260.0 + time * 5.0));
    float flick = 1.0 - scan * 0.5 * step(0.93, h(floor(time * 15.0)));
    gl_FragColor = vec4(c * lines * flick * boost, 1.0);
  }`;

function holoMaterial(map, scan = 0.35) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, time: { value: 0 }, glitch: { value: 0 }, scan: { value: scan }, boost: { value: 1.25 } },
    vertexShader: holoVert, fragmentShader: holoFrag, fog: false,
  });
}

function drawAd(g, ad) {
  const W = g.canvas.width, H = g.canvas.height;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, ad.bg[0]); grad.addColorStop(1, ad.bg[1]);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#7ffcff'; g.lineWidth = 4; g.strokeRect(3, 3, W - 6, H - 6);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.font = `16px ${FONT}`;
  g.shadowColor = '#ff4fd8'; g.shadowBlur = 6;
  g.fillText(ad.title, W / 2, 30);
  g.shadowBlur = 0;
  g.font = `10px ${FONT}`; g.fillStyle = '#fff6c8';
  wrap(g, ad.text, W - 24).forEach((l, i, a) => g.fillText(l, W / 2, 76 + (i - (a.length - 1) / 2) * 16));
  g.font = `6px ${FONT}`; g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText('реклама · не является офертой', W / 2, H - 12);
}

function drawQrBoard(g) {
  const W = g.canvas.width, H = g.canvas.height;
  g.fillStyle = '#12082a'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ff4fd8'; g.lineWidth = 4; g.strokeRect(3, 3, W - 6, H - 6);
  const m = qrMatrix(GAME_URL), n = m.length, s = 4, q = 3;
  const side = (n + q * 2) * s, ox = 10, oy = (H - side) / 2;
  g.fillStyle = '#fff'; g.fillRect(ox, oy, side, side);
  g.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) g.fillRect(ox + (x + q) * s, oy + (y + q) * s, s, s);
  const tx = ox + side + (W - ox - side) / 2;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#7ffcff'; g.font = `14px ${FONT}`;
  g.fillText('СЫГРАЙ', tx, 44); g.fillText('САМ', tx, 64);
  g.fillStyle = '#fff6c8'; g.font = `6px ${FONT}`;
  g.fillText('sber-game', tx, 90); g.fillText('.vercel.app', tx, 100);
}

export function initNeon({ scene, districts, sun, camera, hud, state }) {
  const daytime = createDaytime();
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const redraws = []; // перерисовать канвасы, когда загрузится пиксельный шрифт
  const tickers = [];

  // --- 1. Баннеры и голограммы на штабах ---
  const emblems = {};
  for (const bank of Object.keys(BANKS)) {
    const e = canvasTex(128, 128);
    const draw = () => {
      const g = e.g;
      g.clearRect(0, 0, 128, 128);
      g.strokeStyle = BANKS[bank].css; g.lineWidth = 8;
      g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffffff'; g.font = `48px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = BANKS[bank].css; g.shadowBlur = 10;
      g.fillText(EMBLEM[bank], 66, 68);
      g.shadowBlur = 0;
      e.t.needsUpdate = true;
    };
    draw(); redraws.push(draw);
    emblems[bank] = e.t;
  }

  const hqs = [];
  for (const d of districts) {
    const spec = HQ[d.k];
    if (!spec || !d.hq) continue;
    const bannerMat = new THREE.MeshBasicMaterial({ color: BANKS[d.owner].color, fog: false });
    for (const [dx, dz, y0, y1, rot, alongX] of spec.strips) {
      const m = new THREE.Mesh(box, bannerMat);
      m.scale.set(alongX ? 2.4 : 0.5, y1 - y0 - 1, alongX ? 0.5 : 2.4);
      m.position.set(d.hq.x + dx, (y0 + y1) / 2 + 0.75, d.hq.z + dz);
      m.rotation.y = rot;
      scene.add(m);
    }
    // Голограмма-логотип: диск-эмблема и кольцо, полупрозрачные, медленно вращаются.
    const holoMat = new THREE.MeshBasicMaterial({
      map: emblems[d.owner], transparent: true, opacity: 0.7, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const ringMat = new THREE.MeshBasicMaterial({ color: BANKS[d.owner].color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const holo = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), holoMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.35, 6, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3, 9, 8, 1, true), ringMat);
    beam.position.y = -6.5;
    holo.add(disc, ring, beam);
    holo.position.set(d.hq.x, spec.roof + 11, d.hq.z);
    scene.add(holo);
    hqs.push({ d, spec, bannerMat, holoMat, ringMat, holo, disc, ring, phase: d.k * 1.7 });
  }

  // --- 2. Медиафасады с живыми новостями ---
  const news = ['СИТИ-2049: БАНКИ ДЕЛЯТ КРЕСЛО В СОВЕТЕ ДИРЕКТОРОВ', 'СБЕРЕЖЁНКА ВЫХОДИТ НА УЛИЦЫ'];
  const head = canvasTex(256, 224);
  const tick = canvasTex(1024, 32);
  tick.t.wrapS = THREE.RepeatWrapping;
  let liveBlink = 0, flash = 0;
  function drawHead() {
    const g = head.g, W = 256, H = 224;
    g.fillStyle = '#0a0620'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff2a6d'; g.fillRect(0, 0, W, 28);
    g.fillStyle = '#fff'; g.font = `10px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('НОВОСТИ СИТИ', 8, 15);
    g.fillStyle = liveBlink % 2 ? '#ffffff' : '#ffe0f0';
    g.fillText('● LIVE', 182, 15);
    g.strokeStyle = '#05d9e8'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);
    g.textAlign = 'center';
    g.font = `16px ${FONT}`;
    g.fillStyle = flash > 0 && liveBlink % 2 ? '#ffe600' : '#ffffff';
    g.shadowColor = '#05d9e8'; g.shadowBlur = 4;
    const lines = wrap(g, news[0], W - 16).slice(0, 6);
    lines.forEach((l, i) => g.fillText(l, W / 2, 110 + (i - (lines.length - 1) / 2) * 26));
    g.shadowBlur = 0;
    g.fillStyle = '#05d9e8'; g.font = `7px ${FONT}`;
    g.fillText('СРОЧНО · ' + new Date().toTimeString().slice(0, 5) + ' · 2049', W / 2, H - 14);
    head.t.needsUpdate = true;
  }
  function drawTicker() {
    const g = tick.g;
    g.font = `16px ${FONT}`;
    const text = news.slice(0, 6).join('   ★   ') + '   ★   ';
    const w = Math.max(512, Math.ceil(g.measureText(text).width));
    if (tick.c.width !== w) { tick.c.width = w; tick.t.dispose(); }
    g.fillStyle = '#ffe600'; g.fillRect(0, 0, w, 32);
    g.fillStyle = '#0a0620'; g.font = `16px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(text, 0, 17);
    tick.t.repeat.x = 512 / w;
    tick.t.needsUpdate = true;
  }
  redraws.push(drawHead, drawTicker);
  drawHead(); drawTicker();
  const headMat = new THREE.MeshBasicMaterial({ map: head.t, fog: false });
  const tickMat = new THREE.MeshBasicMaterial({ map: tick.t, fog: false });
  for (const h of hqs) {
    if (!h.spec.facade) continue;
    const [dx, y, dz, w, rot] = h.spec.facade;
    const g = new THREE.Group();
    const hh = w * 224 / 256, th = w / 8;
    const a = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), headMat);
    a.position.y = th / 2;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, th), tickMat);
    b.position.y = -hh / 2;
    const frame = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x111122 }));
    frame.scale.set(w + 1, hh + th + 1, 0.3);
    frame.position.set(0, th / 2 - th / 2, -0.2);
    g.add(frame, a, b);
    g.position.set(h.d.hq.x + dx, y, h.d.hq.z + dz);
    g.rotation.y = rot;
    scene.add(g);
  }
  function pushNews(text) {
    news.unshift(String(text).toUpperCase());
    if (news.length > 12) news.length = 12;
    flash = 4;
    drawHead(); drawTicker();
  }

  // Смена владельца района → новость.
  const prev = new Map(districts.map((d) => [d, d.owner]));
  ownerListeners.push((d) => {
    const was = prev.get(d);
    prev.set(d, d.owner);
    for (const h of hqs) {
      if (h.d !== d) continue;
      h.bannerMat.color.set(BANKS[d.owner].color);
      h.ringMat.color.set(BANKS[d.owner].color);
      h.holoMat.map = emblems[d.owner];
      h.holoMat.needsUpdate = true;
    }
    if (was === d.owner) return;
    pushNews(`${UPPER[d.owner]} ${VERB[d.owner]} ${PLACE_ACC[d.k] || d.name}`);
    if (was) news.splice(1, 0, `ДОЛЯ ${SHARE[was]} ПАДАЕТ`), drawTicker();
  });

  // --- 4–5. Голобилборды у ТТК и набережной ---
  const adTex = ADS.map((ad) => {
    const e = canvasTex(256, 128);
    const draw = () => { drawAd(e.g, ad); e.t.needsUpdate = true; };
    draw(); redraws.push(draw);
    return e.t;
  });
  const qr = canvasTex(256, 128);
  const drawQr = () => { drawQrBoard(qr.g); qr.t.needsUpdate = true; };
  drawQr(); redraws.push(drawQr);

  const edge = HALF + ROAD / 2;
  const postMat = new THREE.MeshStandardMaterial({ color: 0x22202a, metalness: 0.6, roughness: 0.4 });
  const boards = [];
  function addBoard(x, z, rotY, mat, start) {
    const g = new THREE.Group();
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), mat);
    screen.position.y = 18;
    const back = new THREE.Mesh(box, postMat);
    back.scale.set(21, 11, 0.6); back.position.set(0, 18, -0.4);
    const pole = new THREE.Mesh(box, postMat);
    pole.scale.set(1, 13, 1); pole.position.set(0, 6.5, -0.4);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xff4fd8, fog: false });
    for (const sy of [-5.6, 5.6]) {
      const l = new THREE.Mesh(box, edgeMat);
      l.scale.set(21, 0.25, 0.25); l.position.set(0, 18 + sy, 0);
      g.add(l);
    }
    g.add(screen, back, pole);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
    boards.push({ mat, frame: start, t: start * 1.3, glitchT: 0 });
  }
  addBoard(-edge - 8, -70, Math.PI / 2, holoMaterial(adTex[0]), 0);   // ТТК, север
  addBoard(-edge - 8, 60, Math.PI / 2, holoMaterial(adTex[1]), 1);    // ТТК, юг
  addBoard(60, edge + 14, Math.PI, holoMaterial(adTex[2]), 2);        // набережная, восток
  const qrMat = holoMaterial(qr.t, 0.08);                             // набережная, QR: почти без сканлайнов
  qrMat.uniforms.boost.value = 1;
  addBoard(-50, edge + 14, Math.PI, qrMat, -1);
  const qrBoard = { x: -50, y: 18, z: edge + 14 };

  // --- 3. Неоновая ночь ---
  const day = {
    bg: scene.background, fog: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far,
    sun: sun.intensity, sunColor: sun.color.clone(),
    hemi: hemi?.intensity, sky: hemi?.color.clone(), ground: hemi?.groundColor.clone(),
  };
  const nightBg = (() => {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#05051a'); grad.addColorStop(0.45, '#1c0f45');
    grad.addColorStop(0.75, '#5a1a6a'); grad.addColorStop(0.9, '#ff4fa8'); grad.addColorStop(1, '#2a1640');
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const night = {
    fog: new THREE.Color(0x2a1648), near: 25, far: 280, sun: 0.35, sunColor: new THREE.Color(0x7a6aff),
    hemi: 0.45, sky: new THREE.Color(0x6a50c0), ground: new THREE.Color(0x101028),
  };
  const glass = [];
  scene.traverse((o) => {
    const m = o.material;
    if (o.isMesh && m?.userData?.glass && !glass.some((x) => x.m === m)) glass.push({ m, base: m.emissiveIntensity });
  });
  let nk = 0;

  // Неоновый дождь: короткие отрезки в коробке вокруг камеры.
  const DROPS = 900, R = 32, TOP = 26;
  const rainPos = new Float32Array(DROPS * 6), rainCol = new Float32Array(DROPS * 6);
  const speed = new Float32Array(DROPS);
  const pal = [new THREE.Color(0x7ffcff), new THREE.Color(0xff6ad5), new THREE.Color(0xb8b0ff)];
  for (let i = 0; i < DROPS; i++) {
    const x = (Math.random() * 2 - 1) * R, y = Math.random() * TOP - 4, z = (Math.random() * 2 - 1) * R;
    rainPos.set([x, y, z, x + 0.15, y - 1.3, z], i * 6);
    const c = pal[i % 3];
    rainCol.set([c.r * 0.3, c.g * 0.3, c.b * 0.3, c.r, c.g, c.b], i * 6);
    speed[i] = 38 + Math.random() * 18;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  rainGeo.setAttribute('color', new THREE.BufferAttribute(rainCol, 3));
  const rainMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);

  function applyNight(k) {
    scene.background = k > 0.5 ? nightBg : day.bg;
    scene.fog.color.copy(day.fog).lerp(night.fog, k);
    scene.fog.near = day.near + (night.near - day.near) * k;
    scene.fog.far = day.far + (night.far - day.far) * k;
    sun.intensity = day.sun + (night.sun - day.sun) * k;
    sun.color.copy(day.sunColor).lerp(night.sunColor, k);
    if (hemi) {
      hemi.intensity = day.hemi + (night.hemi - day.hemi) * k;
      hemi.color.copy(day.sky).lerp(night.sky, k);
      hemi.groundColor.copy(day.ground).lerp(night.ground, k);
    }
    for (const g of glass) g.m.emissiveIntensity = g.base + (2.6 - g.base) * k;
    rain.visible = k > 0.02;
    rainMat.opacity = 0.75 * k;
  }

  // Шрифт Press Start 2P грузится лениво — перерисуем канвасы, когда он будет готов.
  document.fonts?.load(`16px ${FONT}`, 'АБВ abc').then(() => redraws.forEach((f) => f())).catch(() => {});

  let time = 0, blinkT = 0;
  return {
    hqs, boards, qrBoard, daytime,
    get night() { return daytime.night > 0.5; },
    get nightLevel() { return nk; },
    // Ночь включается перемоткой игрового времени: 21:00 или назад к закату 18:30.
    setNight(on) { if (on !== this.night) daytime.toggleNight(); },
    toggleNight() { return daytime.toggleNight(); },
    news(text) { pushNews(text); },
    get headlines() { return news; },
    update(dt) {
      time += dt;
      if (!state || state.mode === 'play') daytime.update(dt);
      const [hh, mm] = daytime.hm;
      hud?.setClock?.(hh, mm);
      // Голограммы: вращение, мерцание.
      for (const h of hqs) {
        h.holo.rotation.y += dt * 0.6;
        h.disc.position.y = Math.sin(time * 1.3 + h.phase) * 0.6;
        const f = Math.random() < 0.04 ? 0.2 : 1;
        h.holoMat.opacity = (0.55 + 0.2 * Math.sin(time * 9 + h.phase)) * f;
        h.ringMat.opacity = 0.45 + 0.15 * Math.sin(time * 3 + h.phase);
      }
      // Медиафасад: бегущая строка и мигающий LIVE.
      tick.t.offset.x = (tick.t.offset.x + dt * 0.12) % 1;
      blinkT -= dt;
      if (blinkT <= 0) {
        blinkT = 0.5; liveBlink++;
        flash = Math.max(0, flash - 0.5);
        drawHead();
      }
      // Билборды: смена кадров каждые 4 с с глитч-переходом.
      for (const b of boards) {
        const u = b.mat.uniforms;
        u.time.value = time;
        if (b.frame < 0) continue;
        b.t += dt;
        if (b.t > 4) {
          b.t = 0; b.glitchT = 0.45;
          b.frame = (b.frame + 1) % adTex.length;
        }
        if (b.glitchT > 0) {
          b.glitchT -= dt;
          if (b.glitchT < 0.25) u.map.value = adTex[b.frame];
          u.glitch.value = Math.max(0, b.glitchT) / 0.45 * 2;
        } else u.glitch.value = Math.random() < 0.01 ? 0.6 : 0;
      }
      // Ночь: плавный переход и дождь.
      // Уровень ночи следует за игровым временем; перемотка (N) догоняется плавно, ~1,5 с.
      const target = daytime.night;
      if (Math.abs(nk - target) > 1e-4) {
        nk = Math.abs(target - nk) < dt * 0.7 ? target : nk + Math.sign(target - nk) * dt * 0.7;
        applyNight(nk);
      }
      if (rain.visible) {
        rain.position.set(camera.position.x, camera.position.y, camera.position.z);
        for (let i = 0; i < DROPS; i++) {
          const o = i * 6, dy = speed[i] * dt;
          let y = rainPos[o + 1] - dy;
          if (y < -4) y += TOP;
          rainPos[o + 1] = y; rainPos[o + 4] = y - 1.3;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
