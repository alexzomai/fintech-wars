import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roadCoord, ROAD, BLOCK, BANKS, districtIndex, ownerListeners } from './city.js';
import { makeHuman, animateHuman } from './humans.js';

// [v3-decor] Декорации-приколы «Сити-2049»: баннеры и вывески (CanvasTexture), золотая копилка,
// банкоматы с купюрами, очередь в Сбережёнку, вечный ремонт, гора самокатов, дирижабль со ставкой,
// бегущая строка вокруг Федерации, голограмма «Вам одобрен кредит», табло курса, парковка, «Ребрендинг».
// Всё low-poly, тексты рисуются на канвасе — никаких картинок и чужих логотипов.

const FONT = "'Russo One', 'Arial Black', sans-serif";
const PAL = {
  red: { bg: '#b3221c', bg2: '#6e0f0c', fg: '#ffffff', acc: '#ffd0c8', name: 'АЛЫЙ-БАНК' },
  yellow: { bg: '#f5c518', bg2: '#b58700', fg: '#241800', acc: '#5a3d00', name: 'ТЁПЛЫЙ-БАНК' },
  green: { bg: '#1f8f43', bg2: '#0c4d22', fg: '#ffffff', acc: '#c8ffd8', name: 'СБЕРЕЖЁНКА' },
  cb: { bg: '#1d2b4a', bg2: '#0b1226', fg: '#ffd86b', acc: '#9fb8e8', name: 'ЦЕНТРОБАНК ГОРОДА' },
  city: { bg: '#3a2a55', bg2: '#1a1030', fg: '#ffffff', acc: '#d6c4ff', name: 'МЭРИЯ СИТИ' },
};

// --- Канвас-текстуры ---
const redraws = [];
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redraw = (...a) => { g.clearRect(0, 0, w, h); draw(g, w, h, ...a); tex.needsUpdate = true; };
  redraw();
  redraws.push(redraw);
  return { tex, redraw, c };
}
// Шрифт Russo One грузится с Google Fonts — когда приедет, перерисовываем всё.
document.fonts?.load(`40px ${FONT}`).then(() => redraws.forEach((r) => r())).catch(() => {});

// Перенос текста по словам: подбираем кегль, чтобы влезло в maxLines строк.
function wrap(g, text, maxW, size, maxLines, minSize = 14) {
  for (let s = size; s >= minSize; s -= 2) {
    g.font = `${s}px ${FONT}`;
    const lines = [];
    let cur = '';
    for (const word of text.split(' ')) {
      const t = cur ? `${cur} ${word}` : word;
      if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = word; } else cur = t;
    }
    lines.push(cur);
    if (lines.length <= maxLines && lines.every((l) => g.measureText(l).width <= maxW)) return { lines, size: s };
  }
  g.font = `${minSize}px ${FONT}`;
  return { lines: [text], size: minSize };
}
function drawLines(g, { lines, size }, cx, cy, lh = 1.12) {
  g.font = `${size}px ${FONT}`;
  const y0 = cy - ((lines.length - 1) * size * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, cx, y0 + i * size * lh));
}

// Баннер 1024×256: полоса с именем банка, крупный слоган, мелкая сноска.
function bannerTex({ bank, title, sub }) {
  const p = PAL[bank];
  return canvasTex(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, p.bg); gr.addColorStop(1, p.bg2);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = p.fg; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = p.fg; g.fillRect(10, 10, w - 20, 44);
    g.fillStyle = p.bg2; g.font = `30px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(p.name, 30, 33);
    g.textAlign = 'center';
    g.fillStyle = p.fg;
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowOffsetX = 3; g.shadowOffsetY = 3;
    drawLines(g, wrap(g, title, w - 80, 62, 2), w / 2, sub ? 128 : 145);
    g.shadowColor = 'transparent';
    if (sub) { g.fillStyle = p.acc; drawLines(g, wrap(g, sub, w - 120, 28, 1, 12), w / 2, 214); }
  });
}
// Неоновая вывеска 512×128: тёмный фон, светящаяся рамка.
function neonTex(title, sub, color) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#120c1c'; g.fillRect(0, 0, w, h);
    g.shadowColor = color; g.shadowBlur = 14;
    g.strokeStyle = color; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    drawLines(g, wrap(g, title, w - 40, 44, 1), w / 2, sub ? 50 : 64);
    g.shadowBlur = 0;
    if (sub) { g.fillStyle = color; drawLines(g, wrap(g, sub, w - 40, 22, 1, 10), w / 2, 98); }
  });
}
// Надпись маркером прямо по стене (прозрачный фон).
function scrawlTex(text, color) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 6;
    const r = wrap(g, text, w - 30, 48, 2);
    g.font = `${r.size}px ${FONT}`;
    g.save(); g.translate(w / 2, h / 2); g.rotate(-0.04);
    r.lines.forEach((l, i) => { const y = (i - (r.lines.length - 1) / 2) * r.size * 1.1; g.strokeText(l, 0, y); g.fillText(l, 0, y); });
    g.restore();
  });
}

const plane = new THREE.PlaneGeometry(1, 1);
const box = new THREE.BoxGeometry(1, 1, 1);
const basic = (tex, extra = {}) => new THREE.MeshBasicMaterial({ map: tex, ...extra });
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
const blockC = (i) => roadCoord(i) + ROAD / 2 + BLOCK / 2; // центр квартала по индексу
const SIDE = 0.25; // высота тротуара

function mesh(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

// Пул частиц: монеты и купюры (переиспользуемые меши).
class Burst {
  constructor(scene) {
    const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8);
    const billGeo = new THREE.PlaneGeometry(0.42, 0.2);
    const coinMat = std(0xffcc33, { metalness: 0.8, roughness: 0.3, emissive: 0x553300 });
    const billMat = new THREE.MeshBasicMaterial({ color: 0x7fd36a, side: THREE.DoubleSide });
    this.items = [];
    for (let n = 0; n < 120; n++) {
      const m = new THREE.Mesh(n % 2 ? billGeo : coinGeo, n % 2 ? billMat : coinMat);
      m.visible = false;
      scene.add(m);
      this.items.push({ m, kind: n % 2 ? 'bill' : 'coin', t: 0, v: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
  }
  spawn(at, kind, n, power = 5) {
    for (const it of this.items) {
      if (n <= 0) break;
      if (it.m.visible || it.kind !== kind) continue;
      n--;
      it.m.visible = true;
      it.t = kind === 'bill' ? 3.5 : 2.5;
      it.m.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      it.v.set(Math.cos(a) * power * (0.3 + Math.random()), power * (0.8 + Math.random() * 0.8), Math.sin(a) * power * (0.3 + Math.random()));
      it.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    }
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.t -= dt;
      if (it.t <= 0) { it.m.visible = false; continue; }
      const bill = it.kind === 'bill';
      it.v.y -= (bill ? 4 : 18) * dt;
      if (bill) { it.v.x *= 1 - dt; it.v.z *= 1 - dt; it.v.y = Math.max(it.v.y, -1.6); }
      it.m.position.addScaledVector(it.v, dt);
      if (it.m.position.y < SIDE + 0.05) { it.m.position.y = SIDE + 0.05; it.v.set(it.v.x * 0.4, Math.abs(it.v.y) * 0.3, it.v.z * 0.4); it.spin.multiplyScalar(0.5); }
      it.m.rotation.x += it.spin.x * dt; it.m.rotation.y += it.spin.y * dt; it.m.rotation.z += it.spin.z * dt;
    }
  }
}

// Расстояние от точки до отрезка (для попаданий трассером).
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
function segDist(a, b, p) {
  _ab.subVectors(b, a); _ap.subVectors(p, a);
  const t = Math.max(0, Math.min(1, _ap.dot(_ab) / Math.max(1e-6, _ab.lengthSq())));
  return _ap.addScaledVector(_ab, -t).length();
}

export function initDecor({ scene, colliders, walls = [], districts = [], fx, hud, war, state, camera, input, player, getVehicle, getWeapon }) {
  const root = new THREE.Group();
  root.name = 'decor';
  scene.add(root);
  const burst = new Burst(scene);
  const hittables = []; // {pos, r, hit(kind)}
  const updaters = [];
  const triggers = []; // реплики при приближении
  const big = {}; // крупные объекты для тестов/скриншотов
  const addCol = (x, z, hw, hd, maxY) => colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, maxY });
  const money = (v) => war?.addMoney?.(v);
  const actor = () => getVehicle() || player;

  // ---------- 1. Баннеры-арки над дорогами (по два слогана: спереди и сзади) ----------
  const BAN = {
    red: [
      { title: 'Кредит за 5 минут. Отдавать — всю жизнь' },
      { title: 'ОДОБРЕНО!', sub: 'мелким шрифтом: мы даже не смотрели' },
      { title: 'Одобрим даже вашего кота*', sub: '*кот выступает поручителем' },
      { title: 'Мы знаем, где вы живёте. Мы выдали вам ипотеку' },
      { title: 'Не хватает до зарплаты? Не хватит и после' },
      { title: 'Звоним 40 раз в день. Потому что заботимся' },
    ],
    yellow: [
      { title: 'Мы не банк. Мы экосистема. Мы уже у вас в телефоне' },
      { title: 'Тёплые продажи. Очень тёплые.', sub: 'Горячо? Это страховка' },
      { title: 'Скачай приложение, чтобы закрыть это окно' },
      { title: 'Кэшбэк 30%**', sub: '**баллами, которые сгорают в полночь' },
      { title: 'Курьер уже едет. Мы не знаем зачем' },
      { title: 'Подписка на подписку — всего 199 ₽/мес' },
    ],
    green: [
      { title: 'Копим вместе. Навсегда' },
      { title: 'Как у бабушки, только с нейросетью' },
      { title: 'Вклад «Заоблачный» — 0,01% годовых', sub: 'зато надёжно' },
      { title: 'Мы были здесь до киберпанка. Будем и после' },
      { title: 'Очередь — это тоже комьюнити' },
    ],
    cb: [
      { title: 'Проверка ЦБ. Улыбайтесь, вас аудируют' },
      { title: 'Ключевая ставка сегодня: смотрите на небо' },
    ],
    city: [{ title: 'Совет директоров города: выборы отменены за ненадобностью' }],
  };
  const pick = (bank, k) => ({ bank, ...BAN[bank][k] });
  const postMat = std(0x2b2b30, { metalness: 0.5, roughness: 0.6 });
  function arch(x, z, horizontal, front, back) {
    const g = new THREE.Group();
    const w = 13, h = 3.25, y = 8.6;
    [front, back].forEach((spec, k) => {
      const m = mesh(plane, basic(bannerTex(spec).tex, { fog: true }), 0, y, k ? -0.12 : 0.12, w, h, 1, g);
      m.rotation.y = k ? Math.PI : 0;
    });
    mesh(box, postMat, 0, y, 0, w + 0.3, h + 0.3, 0.18, g); // рамка-задник
    for (const s of [-1, 1]) {
      const p = mesh(box, postMat, s * 6.8, y / 2 + 1, 0, 0.45, y + 2, 0.45, g);
      p.castShadow = true;
      const wp = new THREE.Vector3(s * 6.8, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, horizontal ? Math.PI / 2 : 0);
      addCol(x + wp.x, z + wp.z, 0.3, 0.3, y + 2);
    }
    g.position.set(x, 0, z);
    if (horizontal) g.rotation.y = Math.PI / 2;
    root.add(g);
    return g;
  }
  const R = roadCoord;
  // Позиции подобраны так, чтобы не совпадать с арками районов (x = R(1), R(3), R(5)) и перекрёстками.
  big.archStart = arch(R(2), -12, false, pick('red', 0), pick('green', 0));
  arch(R(3), -40, false, pick('yellow', 0), pick('cb', 0));
  arch(-81, R(3), true, pick('red', 1), pick('yellow', 2));
  arch(-27, R(2), true, pick('green', 1), pick('red', 3));
  arch(27, R(3), true, pick('yellow', 3), pick('red', 4));
  arch(R(4), -20 - 54, false, pick('green', 2), pick('yellow', 5));
  arch(R(1), 20, false, pick('red', 2), pick('city', 0));
  arch(-27, R(4), true, pick('green', 3), pick('yellow', 1));
  arch(R(2), 60, false, pick('red', 5), pick('yellow', 4));
  arch(-81, R(1), true, pick('cb', 1), pick('green', 4));

  // ---------- Вывески магазинов и надписи на стенах (ближайшие к старту улицы) ----------
  const SHOPS = [
    ['Микрозаймы', '«До зарплаты и обратно»', '#ff4d6d'],
    ['Ломбард «Последний шанс»', 'принимаем всё, даже надежду', '#ffb347'],
    ['Шаурма «У регулятора»', 'острота 16% годовых', '#ff7a1a'],
    ['Обмен валют', '«Лучше не смотри»', '#7ad7ff'],
    ['Барбершоп', '«Чёлка эффективности»', '#c77dff'],
    ['Кешбэк-кофе', 'капучино в рассрочку', '#ffd23f'],
    ['Коворкинг «Выгорание»', 'первые 3 дедлайна бесплатно', '#5ef38c'],
    ['Фитнес-Сити', '«Вклад в себя»', '#4dd2ff'],
    ['Оружейный маркетплейс', 'рассрочка 0-0-24 на дробовик', '#ff5e5e'],
  ];
  const SCRAWLS = ['Процент — не приговор', 'Здесь был Вклад', 'ЦБ видит всё', 'Саня, верни 500 ₽', 'Ипотека — это любовь на 30 лет'];
  const spawnRef = new THREE.Vector3(R(2) + 3, 0, -27);
  const chosen = [];
  for (const wl of [...walls].sort((a, b) => a.pos.distanceTo(spawnRef) - b.pos.distanceTo(spawnRef))) {
    if (chosen.length >= SHOPS.length + SCRAWLS.length) break;
    if (chosen.some((c) => c.pos.distanceTo(wl.pos) < 14)) continue;
    chosen.push(wl);
  }
  chosen.forEach((wl, k) => {
    const shop = k < SHOPS.length;
    const tex = shop ? neonTex(...SHOPS[k]).tex : scrawlTex(SCRAWLS[k - SHOPS.length], ['#ffffff', '#ffe066', '#9dffb0', '#ff9ad5', '#9fd8ff'][k % 5]).tex;
    const pos = wl.pos.clone().addScaledVector(wl.normal, 0.09).setY(shop ? 5.4 : 4.6);
    const m = mesh(plane, basic(tex, { transparent: !shop }), pos.x, pos.y, pos.z, shop ? 6 : 5, shop ? 1.5 : 1.25, 1, root);
    m.lookAt(pos.clone().add(wl.normal));
  });

  // ---------- 2. Золотая хрюшка-копилка (северная площадь у Евразии) ----------
  {
    const cx = blockC(1), cz = blockC(2) - 15;
    const g = new THREE.Group();
    const gold = std(0xffcf40, { metalness: 0.35, roughness: 0.35, emissive: 0x7a4c00 });
    const granite = std(0x6d6460, { roughness: 0.9 });
    mesh(box, granite, 0, SIDE + 0.6, 0, 4.4, 1.2, 3.2, g).castShadow = true;
    const plaque = mesh(plane, basic(neonTex('ЗОЛОТАЯ КОПИЛКА', 'Копим вместе. Бей — посыплются монеты', '#ffd23f').tex), 0, SIDE + 0.6, 1.62, 3.6, 0.9, 1, g);
    void plaque;
    const pig = new THREE.Group();
    pig.position.y = SIDE + 1.2;
    const body = mesh(new THREE.IcosahedronGeometry(1, 1), gold, 0, 1.25, 0, 1.75, 1.2, 1.25, pig);
    body.castShadow = true;
    const snout = mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 8), gold, 1.8, 1.25, 0, 1, 1, 1, pig);
    snout.rotation.z = Math.PI / 2;
    const nose = std(0xb07a10, { metalness: 0.6 });
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.08, 6, 4), nose, 2.01, 1.27, s * 0.17, 1, 1, 1, pig);
      const ear = mesh(new THREE.ConeGeometry(0.3, 0.55, 4), gold, 1.15, 2.3, s * 0.55, 1, 1, 1, pig);
      ear.rotation.x = s * 0.35;
      for (const fx2 of [-0.9, 0.9]) mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 6), gold, fx2, 0.35, s * 0.6, 1, 1, 1, pig);
      mesh(new THREE.SphereGeometry(0.12, 6, 4), std(0x111111), 1.55, 1.75, s * 0.42, 1, 1, 1, pig);
    }
    mesh(box, std(0x111111), 0, 2.42, 0, 0.9, 0.06, 0.15, pig); // прорезь для монет
    const tail = mesh(new THREE.TorusGeometry(0.2, 0.06, 4, 8), gold, -1.85, 1.6, 0, 1, 1, 1, pig);
    tail.rotation.y = Math.PI / 2;
    g.add(pig);
    g.position.set(cx, 0, cz);
    root.add(g);
    addCol(cx, cz, 2.2, 1.6, 3.2);
    const center = new THREE.Vector3(cx, 2.5, cz);
    let wobble = 0, cd = 0;
    const hitPig = (kind) => {
      if (cd > 0) return;
      cd = kind === 'ram' ? 2 : 0.35;
      wobble = 1;
      burst.spawn(center.clone().setY(3.6), 'coin', kind === 'ram' ? 22 : kind === 'blast' ? 16 : 6, kind === 'ram' ? 7 : 4.5);
      money(kind === 'ram' ? 120 : kind === 'blast' ? 80 : 15);
      if (Math.random() < 0.2) hud.subtitle('Копилка: «Ой! Это же <b>долгосрочные</b> сбережения!»', 2500);
    };
    hittables.push({ pos: center, r: 2.4, ramR: 4.2, hit: hitPig });
    updaters.push((dt, t) => {
      cd -= dt;
      wobble = Math.max(0, wobble - dt * 2);
      pig.rotation.y = t * 0.25;
      pig.rotation.z = Math.sin(t * 25) * 0.15 * wobble;
      pig.position.y = SIDE + 1.2 + Math.sin(t * 1.5) * 0.05 + wobble * 0.3;
    });
    triggers.push({ pos: center, r: 9, fn: () => hud.help('Золотая копилка: ~ЛКМ~ стреляй или бей — посыплются монеты. Конкуренты уже приценились.', 4500) });
    big.piggy = g;
  }

  // ---------- Банкоматы в цветах банков ----------
  const atms = [];
  function atm(bank, x, z, faceX) {
    const g = new THREE.Group();
    const c = BANKS[bank].color;
    mesh(box, std(c, { roughness: 0.5 }), 0, 0.95, 0, 0.9, 1.9, 0.7, g).castShadow = true;
    mesh(box, std(0x22252a), 0, 1.25, 0.33, 0.7, 0.8, 0.1, g);
    const screen = canvasTex(256, 256, (gg, w, h) => {
      gg.fillStyle = '#0d1a2a'; gg.fillRect(0, 0, w, h);
      gg.fillStyle = BANKS[bank].css; gg.fillRect(0, 0, w, 60);
      gg.fillStyle = bank === 'yellow' ? '#241800' : '#fff'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
      drawLines(gg, wrap(gg, PAL[bank].name, w - 20, 30, 1), w / 2, 32);
      gg.fillStyle = '#9fe8ff';
      drawLines(gg, wrap(gg, bank === 'red' ? 'ВЫДАЧА КРЕДИТОВ БЕЗ ВОПРОСОВ' : bank === 'yellow' ? 'СНАЧАЛА СКАЧАЙТЕ ПРИЛОЖЕНИЕ' : 'КОМИССИЯ 0 ₽ (ПОЧТИ)', w - 30, 30, 4), w / 2, 160);
    });
    mesh(plane, basic(screen.tex), 0, 1.3, 0.39, 0.62, 0.62, 1, g);
    mesh(box, std(0x111111), 0, 0.75, 0.36, 0.4, 0.05, 0.05, g); // купюроприёмник
    g.position.set(x, SIDE, z);
    g.rotation.y = faceX > 0 ? Math.PI / 2 : faceX < 0 ? -Math.PI / 2 : 0;
    root.add(g);
    addCol(x, z, 0.5, 0.5, 2.1);
    const a = { g, bank, pos: new THREE.Vector3(x, 1.2, z), cd: 0, down: 0 };
    a.hit = (kind) => {
      if (a.cd > 0) return;
      a.cd = kind === 'ram' ? 15 : 1.2;
      burst.spawn(a.pos.clone().setY(2), 'bill', kind === 'shot' ? 8 : 24, kind === 'shot' ? 3.5 : 6);
      money(kind === 'shot' ? 20 : 100);
      if (kind !== 'shot') { a.down = 15; hud.subtitle(`Банкомат «${BANKS[bank].name}»: <b>фонтан купюр!</b>`, 2500); }
    };
    hittables.push({ pos: a.pos, r: 1.1, ramR: 3, hit: a.hit });
    atms.push(a);
    return a;
  }
  const xE1 = blockC(1) + 17.5, xW2 = blockC(2) - 18.5;
  atm('green', xE1, blockC(2) - 9, 1);
  atm('red', xW2, blockC(1) + 6, -1);
  atm('yellow', xW2 + 0.5, blockC(2) + 12, -1);
  atm('red', xW2, blockC(3) + 3, -1);
  atm('yellow', blockC(3) - 18, blockC(2) - 13, -1);
  atm('green', xE1, blockC(3) + 3, 1);
  updaters.push((dt) => {
    for (const a of atms) {
      a.cd -= dt;
      if (a.down > 0) { a.down -= dt; a.g.rotation.z = Math.min(1.3, a.g.rotation.z + dt * 6); } else a.g.rotation.z = Math.max(0, a.g.rotation.z - dt * 2);
    }
  });

  // ---------- Очередь в Сбережёнку (восточная сторона Евразии) ----------
  {
    const x = blockC(1) + 16, z0 = blockC(2) - 4;
    const kiosk = new THREE.Group();
    mesh(box, std(0x1f8f43), 0, 1.6, 0, 2.4, 3.2, 2.4, kiosk).castShadow = true;
    mesh(box, std(0x10331c), 0, 1.1, 1.21, 1.1, 2.1, 0.05, kiosk); // дверь
    const sign = neonTex('СБЕРЕЖЁНКА', 'отделение №1 · с 1841 года', '#2ecc59').tex;
    mesh(plane, basic(sign), 1.22, 2.6, 0, 2.3, 0.6, 1, kiosk).rotation.y = Math.PI / 2;
    const board = canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = '#060a06'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff3b2f'; g.textAlign = 'center'; g.textBaseline = 'middle';
      drawLines(g, wrap(g, 'СЕЙЧАС ОБСЛУЖИВАЕТСЯ', w - 16, 20, 1), w / 2, 26);
      g.font = `44px ${FONT}`; g.fillText('А003', w / 2, 66);
    });
    mesh(plane, basic(board.tex), 0, 2.85, 1.22, 1.6, 0.6, 1, kiosk);
    kiosk.position.set(x - 0.5, SIDE, z0 - 4);
    root.add(kiosk);
    addCol(x - 0.5, z0 - 4, 1.2, 1.2, 3.4);
    const jackets = [0x5a4a3a, 0x2f3e5c, 0x6b2f3a, 0x3d5a40, 0x55505a, 0x806040];
    const queue = jackets.map((jacket, k) => {
      const h = makeHuman({ jacket, accent: 0x2ecc59, skin: [0xd9a77c, 0xc58c5c, 0xe8c09a][k % 3], cap: k === 4 });
      h.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      h.gun.visible = false;
      h.root.position.set(x + (k % 2 ? 0.15 : -0.1), SIDE, z0 + k * 1.7);
      h.root.rotation.y = Math.PI;
      h.t = k * 0.7;
      root.add(h.root);
      return h;
    });
    addCol(x, z0 + 4.2, 0.45, 5, 1.8);
    // Талон «А147» в руке у третьего.
    const talon = canvasTex(128, 64, (g, w, h) => {
      g.fillStyle = '#fffbe8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `38px ${FONT}`; g.fillText('А147', w / 2, h / 2 + 2);
    });
    const tal = mesh(plane, basic(talon.tex, { side: THREE.DoubleSide }), 0, -0.12, 0.08, 0.3, 0.15, 1, queue[2].armR.hand);
    tal.rotation.y = Math.PI;
    updaters.push((dt) => {
      for (const h of queue) animateHuman(h, dt, { speed: 0 });
      queue[2].armR.shoulder.rotation.x = -1.1; queue[2].armR.elbow.rotation.x = -0.9;
      queue[5].head.rotation.y = Math.sin(performance.now() / 900) * 0.6; // последний вертит головой
    });
    triggers.push({ pos: new THREE.Vector3(x, 0, z0 + 3), r: 7, fn: () => hud.subtitle('Очередь — это тоже комьюнити. Сейчас <b>А003</b>, у вас <b>А147</b>.', 4000) });
    big.queue = kiosk;
  }

  // ---------- Вечный ремонт плитки (у перекрёстка, северная сторона «Города Столиц») ----------
  {
    const cx = blockC(2) - 9, cz = blockC(3) - 15.5;
    const g = new THREE.Group();
    mesh(box, std(0x4a3426), 0, 0.02, 0, 7, 0.3, 4, g); // вскрытый тротуар
    const tile = std(0xb9b2a4);
    for (let k = 0; k < 4; k++) mesh(box, tile, -2.2 + (k % 2) * 0.5, 0.3 + Math.floor(k / 2) * 0.22 + 0.15, 1.2, 1.1, 0.2, 1.1, g);
    for (let k = 0; k < 5; k++) mesh(box, tile, 1.4 + (k % 3) * 0.3, 0.3 + k * 0.21, -1, 1.0, 0.2, 1.0, g).rotation.y = k * 0.2;
    // Ограждение: полосатые секции.
    const stripe = canvasTex(128, 32, (gg, w, h) => {
      for (let s = 0; s < 8; s++) { gg.fillStyle = s % 2 ? '#ffffff' : '#e8422a'; gg.beginPath(); gg.moveTo(s * 16 - 8, h); gg.lineTo(s * 16 + 8, 0); gg.lineTo(s * 16 + 24, 0); gg.lineTo(s * 16 + 8, h); gg.fill(); }
    });
    const fenceMat = basic(stripe.tex, { side: THREE.DoubleSide });
    for (const [x, z, w, ry] of [[0, 2.4, 8, 0], [0, -2.4, 8, 0], [4, 0, 4.8, Math.PI / 2], [-4, 0, 4.8, Math.PI / 2]]) {
      const f = mesh(plane, fenceMat, x, 0.9, z, w, 0.35, 1, g);
      f.rotation.y = ry;
    }
    const coneGeo = new THREE.ConeGeometry(0.28, 0.75, 6);
    const coneMat = std(0xff6a1a);
    for (const [x, z] of [[-4.6, 2.9], [-2, 3], [1, 3], [3.8, 2.9], [4.6, -1], [-4.6, -2.8]]) mesh(coneGeo, coneMat, x, 0.38, z, 1, 1, 1, g);
    for (const [x, z] of [[-4, 2.4], [4, 2.4], [-4, -2.4], [4, -2.4]]) mesh(box, postMat, x, 0.6, z, 0.1, 1.2, 0.1, g);
    const sign = neonTex('Перекладываем плитку.', 'Опять. Срок: до конца квартала (какого — не скажем)', '#ff9a1a').tex;
    const sg = mesh(plane, basic(sign, { side: THREE.DoubleSide }), -2, 1.9, -2.5, 2.8, 0.7, 1, g);
    void sg;
    mesh(box, postMat, -2, 1, -2.5, 0.08, 2, 0.08, g);
    const vest = { jacket: 0xff7a1a, accent: 0xfff04d, pants: 0x2a3550, cap: true };
    const workers = [0, 1, 2].map(() => makeHuman(vest));
    workers.forEach((h, k) => {
      h.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      h.gun.visible = false;
      h.root.position.set([0, 2.1, 2.6][k], 0.15, [0, 0.5, -0.9][k]);
      h.root.rotation.y = k === 0 ? 0.3 : Math.atan2(-h.root.position.x, -h.root.position.z);
      g.add(h.root);
    });
    g.position.set(cx, SIDE, cz);
    root.add(g);
    addCol(cx, cz, 4, 2.5, 1.1);
    updaters.push((dt, t) => {
      workers.forEach((h, k) => animateHuman(h, dt, { speed: 0, crouch: k === 0 ? 0.9 : 0 }));
      workers[0].armR.shoulder.rotation.x = -0.6 - Math.max(0, Math.sin(t * 6)) * 1.2; // стучит по плитке
      workers[1].armL.shoulder.rotation.x = -0.4; // руки в боки и смотрят
      workers[2].head.rotation.y = Math.sin(t * 0.7) * 0.3;
    });
    triggers.push({ pos: new THREE.Vector3(cx, 0, cz), r: 10, fn: () => hud.subtitle('«Перекладываем плитку. Опять.» Двое смотрят на третьего — классика.', 4000) });
    big.repair = g;
  }

  // ---------- Гора самокатов у метро (южная сторона Евразии) ----------
  {
    const cx = blockC(1) - 8, cz = blockC(2) + 16;
    const parts = [new THREE.BoxGeometry(0.25, 0.08, 1.1), new THREE.BoxGeometry(0.06, 1.0, 0.06).translate(0, 0.5, 0.5), new THREE.BoxGeometry(0.5, 0.05, 0.05).translate(0, 1.0, 0.5),
      new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6).rotateZ(Math.PI / 2).translate(0, -0.04, 0.5), new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6).rotateZ(Math.PI / 2).translate(0, -0.04, -0.5)];
    const scootGeo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    const scootMat = std(0xf5c518, { roughness: 0.6 });
    const scooters = [];
    for (let k = 0; k < 14; k++) {
      const m = new THREE.Mesh(scootGeo, scootMat);
      const home = { p: new THREE.Vector3(cx + (Math.random() - 0.5) * 4, SIDE + 0.15 + Math.floor(k / 5) * 0.35, cz + (Math.random() - 0.5) * 2.5), r: new THREE.Euler((Math.random() - 0.5) * 2, Math.random() * 6, (Math.random() - 0.5) * 2.5) };
      m.position.copy(home.p); m.rotation.copy(home.r);
      root.add(m);
      scooters.push({ m, home, v: new THREE.Vector3(), spin: 0, flying: false });
    }
    const sign = neonTex('ТЁПЛЫЙ-САМОКАТ', 'бери, пока тёплый · 1-я минута 0 ₽, 2-я — 990', '#f5c518').tex;
    const sp = new THREE.Group();
    mesh(box, postMat, 0, 1.4, 0, 0.1, 2.8, 0.1, sp);
    mesh(plane, basic(sign, { side: THREE.DoubleSide }), 0, 2.6, 0, 2.6, 0.65, 1, sp);
    sp.position.set(cx - 3.2, SIDE, cz + 1.5);
    root.add(sp);
    // Вход в метро и человек с плакатом.
    const metro = new THREE.Group();
    mesh(box, std(0x8a8a90), 0, 1.4, 0, 3.4, 2.8, 2.2, metro);
    mesh(box, std(0x111118), 0, 1.0, 1.11, 2, 2, 0.05, metro);
    mesh(plane, basic(neonTex('МЕТРО', '«Деловой кредит»', '#ff3344').tex), 0, 3.2, 1.12, 2.6, 0.65, 1, metro);
    metro.position.set(cx + 8, SIDE, cz + 1.9);
    metro.rotation.y = 0;
    root.add(metro);
    addCol(cx + 8, cz + 1.9, 1.7, 1.1, 3);
    const prophet = makeHuman({ jacket: 0x6e6a5e, accent: 0x999999, pants: 0x3a352c });
    prophet.gun.visible = false;
    prophet.root.position.set(cx + 4.3, SIDE, cz + 2.5);
    root.add(prophet.root);
    const poster = mesh(plane, basic(neonTex('КОНЕЦ КВАРТАЛА', 'БЛИЗОК. Покайся в KPI', '#ffffff').tex, { side: THREE.DoubleSide }), 0, 2.45, 0.25, 1.6, 0.42, 1, prophet.root);
    void poster;
    updaters.push((dt, t) => {
      animateHuman(prophet, dt, { speed: 0 });
      prophet.armL.shoulder.rotation.x = prophet.armR.shoulder.rotation.x = -2.6 + Math.sin(t * 3) * 0.12;
      prophet.root.rotation.y = Math.sin(t * 0.5) * 0.5;
      let any = false;
      for (const s of scooters) {
        if (!s.flying) continue;
        any = true;
        s.v.y -= 20 * dt;
        s.m.position.addScaledVector(s.v, dt);
        s.m.rotation.x += s.spin * dt; s.m.rotation.z += s.spin * 0.6 * dt;
        if (s.m.position.y < 0.18 && s.v.y < 0) { s.m.position.y = 0.18; s.v.multiplyScalar(0.35); s.v.y = Math.abs(s.v.y) < 1 ? 0 : -s.v.y; s.spin *= 0.4; if (s.v.lengthSq() < 0.5) s.flying = false; }
      }
      void any;
    });
    let scatteredT = 0;
    const center = new THREE.Vector3(cx, 0.8, cz);
    updaters.push((dt) => {
      if (scatteredT > 0 && (scatteredT -= dt) <= 0) scooters.forEach((s) => { s.flying = false; s.m.position.copy(s.home.p); s.m.rotation.copy(s.home.r); });
    });
    const scatter = (from, speed) => {
      if (scatteredT > 0) return;
      scatteredT = 40;
      for (const s of scooters) {
        const d = s.m.position.clone().sub(from).setY(0).normalize();
        s.v.copy(d.multiplyScalar(speed * (0.5 + Math.random() * 0.6))).setY(4 + Math.random() * 6);
        s.spin = (Math.random() - 0.5) * 16;
        s.flying = true;
      }
      hud.subtitle('<b style="color:#f5c518">СТРАЙК!</b> Тёплый-Банк выставит счёт за каждую минуту аренды.', 3000);
    };
    hittables.push({ pos: center, r: 2.8, ramR: 3.8, hit: (kind, from) => { if (kind !== 'shot') scatter(from || actor().position, kind === 'ram' ? Math.abs(getVehicle()?.speed || 10) : 9); } });
    triggers.push({ pos: center, r: 11, fn: () => hud.subtitle('Гора самокатов Тёплого-Банка. Разгонись — будут кегли.', 3500) });
    triggers.push({ pos: prophet.root.position, r: 5, fn: () => hud.subtitle('Пророк: «Конец квартала близок, пиарщик! Покайся в KPI!»', 3500) });
    big.scooters = center;
  }

  // ---------- 3. «Ребрендинг за 24 секунды» — полоса на дороге сбрасывает розыск и перекрашивает машину ----------
  {
    const x = R(2), z = -92;
    arch(x, z, false, { bank: 'city', title: 'Автосервис «Ребрендинг за 24 секунды»', sub: 'проезжай по полосе — новый логотип, новая жизнь' },
      { bank: 'city', title: 'Новый логотип — новая жизнь', sub: 'звёзды ЦБ снимаем бесплатно' });
    const pad = canvasTex(512, 128, (g, w, h) => {
      for (let s = 0; s < 16; s++) { g.fillStyle = s % 2 ? '#ff3dd1' : '#7a1cff'; g.fillRect(s * 32, 0, 32, h); }
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `60px ${FONT}`;
      g.fillText('РЕБРЕНДИНГ', w / 2, h / 2 + 4);
    });
    const padMat = basic(pad.tex, { transparent: true, opacity: 0.85 });
    const p = mesh(plane, padMat, x, 0.04, z, 13, 3.25, 1, root);
    p.rotation.x = -Math.PI / 2;
    let cd = 0;
    const COLORS = [0xff3dd1, 0x22d3ee, 0xffffff, 0x111111, 0xff8a00, 0x7a1cff, 0x2ecc59, 0x1e5bff];
    updaters.push((dt, t) => {
      cd -= dt;
      padMat.opacity = 0.65 + Math.sin(t * 6) * 0.2;
      const v = getVehicle();
      if (!v || cd > 0 || Math.abs(v.position.x - x) > 6.5 || Math.abs(v.position.z - z) > 1.8) return;
      cd = 6;
      const col = COLORS[Math.floor(Math.random() * COLORS.length)];
      v.mesh.traverse((o) => { if (o.isMesh && o.material?.metalness === 0.3) o.material.color.set(col); });
      state.wanted = 0;
      hud.setWanted?.(0);
      fx.blast(v.position.clone().setY(1), 4, col);
      hud.subtitle('<b style="color:#ff3dd1">РЕБРЕНДИНГ ЗА 24 СЕКУНДЫ!</b> Новый логотип — новая жизнь. Звёзды ЦБ сняты.', 3500);
    });
    triggers.push({ pos: new THREE.Vector3(x, 0, z - 14), r: 10, fn: () => hud.help('Автосервис «Ребрендинг»: проезжай на машине по розовой полосе — новый цвет, звёзды ЦБ сняты', 4500) });
  }

  // ---------- Дирижабль с ключевой ставкой ----------
  {
    const g = new THREE.Group();
    const env = mesh(new THREE.SphereGeometry(1, 14, 8), std(0xd8dde6, { roughness: 0.7 }), 0, 0, 0, 20, 6.5, 6.5, g);
    env.castShadow = true;
    const finMat = std(0x1d2b4a);
    for (const [y, z, sy, sz] of [[4.5, 0, 4, 0.3], [-4.5, 0, 4, 0.3], [0, 4.5, 0.3, 4], [0, -4.5, 0.3, 4]]) mesh(box, finMat, -17, y, z, 4, sy, sz, g);
    mesh(box, std(0x2b2b30), 2, -7, 0, 6, 1.6, 2, g); // гондола
    let rate = 21;
    const side = canvasTex(1024, 256, (gg, w, h) => {
      gg.fillStyle = '#1d2b4a'; gg.fillRect(0, 0, w, h);
      gg.strokeStyle = '#ffd86b'; gg.lineWidth = 10; gg.strokeRect(8, 8, w - 16, h - 16);
      gg.fillStyle = '#9fb8e8'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.font = `30px ${FONT}`;
      gg.fillText(rate < 21 ? 'КЛЮЧЕВАЯ СТАВКА СНИЖЕНА! ВСЁ В РАССРОЧКУ' : 'КЛЮЧЕВАЯ СТАВКА СЕГОДНЯ · СМОТРИТЕ НА НЕБО', w / 2, 50);
      gg.fillStyle = rate < 21 ? '#5ef38c' : '#ffd86b'; gg.font = `120px ${FONT}`;
      gg.fillText(`СТАВКА ${rate}%`, w / 2, 158);
    });
    const sideMat = basic(side.tex, { side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const b = mesh(plane, sideMat, 0, 0.5, s * 6.55, 22, 5.5, 1, g);
      b.rotation.y = s > 0 ? 0 : Math.PI;
    }
    root.add(g);
    const center = new THREE.Vector3();
    let hp = 10, downT = 0, ang = 0, flash = 0;
    const R0 = 95, Y0 = 82;
    const shotDown = () => {
      downT = 60; rate = 16; side.redraw();
      money(250);
      fx.blast(center.clone(), 16, 0xffd86b);
      hud.subtitle('<b style="color:#5ef38c">Дирижабль сбит — ключевая ставка «упала» до 16%!</b> Минуту всё в рассрочку.', 5000);
    };
    hittables.push({
      pos: center, r: 9, seg: true, hit: (kind) => {
        if (downT > 0) return;
        flash = 0.15;
        hp -= kind === 'blast' ? 5 : 1;
        if (hp <= 0) shotDown();
      },
    });
    updaters.push((dt, t) => {
      ang += dt * 0.035;
      flash -= dt;
      if (downT > 0 && (downT -= dt) <= 0) { rate = 21; hp = 10; side.redraw(); hud.subtitle('ЦБ вернул ставку 21%. Праздник окончен.', 3000); }
      const y = downT > 0 ? Y0 - 22 + Math.sin(t * 2) * 1.5 : Y0 + Math.sin(t * 0.4) * 2;
      g.position.set(Math.cos(ang) * R0, THREE.MathUtils.lerp(g.position.y || y, y, Math.min(1, dt)), -20 + Math.sin(ang) * R0);
      g.rotation.y = -ang - Math.PI / 2 + Math.PI; // нос по касательной
      g.rotation.z = downT > 0 ? -0.18 : Math.sin(t * 0.6) * 0.04;
      env.material.emissive.setHex(flash > 0 ? 0x803020 : 0x000000);
      center.copy(g.position);
    });
    big.blimp = g;
  }

  // ---------- Бегущая строка котировок вокруг Федерации ----------
  {
    const cx = blockC(3) + 0.5, cz = blockC(2) + 1;
    const trend = { green: 1, red: -1, yellow: 1 };
    const count = (b) => (war?.count ? war.count(b) : 0);
    const tick = canvasTex(2048, 64, (g, w, h) => {
      g.fillStyle = '#050608'; g.fillRect(0, 0, w, h);
      g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `40px ${FONT}`;
      const items = [
        ['СБРЖ', 'green'], ['АЛЫЙ', 'red'], ['ТЁПЛ', 'yellow'], ['КЛЮЧ 21%', null], ['РУБЛЬ ◆ не спрашивай', null], ['ХРЮШ ▲ 999', null],
      ];
      let x = 20;
      for (const [label, b] of items) {
        const up = b ? trend[b] > 0 : true;
        const s = b ? `${label} ${up ? '▲' : '▼'} ${count(b)} р-на` : label;
        g.fillStyle = b ? (up ? '#5ef38c' : '#ff5a4a') : '#ffd86b';
        g.fillText(s, x, h / 2 + 2);
        x += g.measureText(s).width + 70;
        g.fillStyle = '#555'; g.fillText('•', x - 45, h / 2 + 2);
      }
    });
    tick.tex.wrapS = THREE.RepeatWrapping;
    tick.tex.repeat.x = 2;
    const ring = mesh(new THREE.CylinderGeometry(17, 17, 2.6, 40, 1, true), basic(tick.tex), cx, 34, cz, 1, 1, 1, root);
    const frameMat = std(0x222228, { metalness: 0.6 });
    mesh(new THREE.CylinderGeometry(17.1, 17.1, 0.3, 40, 1, true), frameMat, cx, 35.45, cz, 1, 1, 1, root);
    mesh(new THREE.CylinderGeometry(17.1, 17.1, 0.3, 40, 1, true), frameMat, cx, 32.55, cz, 1, 1, 1, root);
    for (const d of districts) d._decorPrev = d.owner;
    ownerListeners.push((d) => {
      if (d._decorPrev && d._decorPrev !== d.owner) { trend[d.owner] = 1; trend[d._decorPrev] = -1; tick.redraw(); }
      d._decorPrev = d.owner;
    });
    updaters.push((dt) => { tick.tex.offset.x -= dt * 0.025; });
    setTimeout(() => tick.redraw(), 500); // после первых setOwner
    big.ticker = ring;
  }

  // ---------- 4. Голограмма «Вам одобрен кредит» (у Башни на набережной) ----------
  {
    const x = blockC(1), z = blockC(3) + 15.5;
    let near = false;
    const holo = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = 'rgba(255,60,60,0.18)'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ff6a5a'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffe0dc'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ff3b2f'; g.shadowBlur = 18;
      if (near) {
        drawLines(g, wrap(g, 'ПИАРЩИК,', w - 40, 56, 1), w / 2, 60);
        drawLines(g, wrap(g, 'ВАМ ОДОБРЕН КРЕДИТ!', w - 40, 52, 1), w / 2, 130);
        g.font = `22px ${FONT}`; g.fillText('Алый-банк. Мы вас нашли.', w / 2, 205);
      } else {
        drawLines(g, wrap(g, 'КРЕДИТ НАЛИЧНЫМИ', w - 40, 54, 1), w / 2, 90);
        g.font = `26px ${FONT}`; g.fillText('подойдите ближе — мы вас узнаем', w / 2, 170);
      }
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
    });
    const mat = basic(holo.tex, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.Group();
    const base = mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.4, 10), std(0x222228, { emissive: 0x401010 }), 0, 0.2, 0, 1, 1, 1, g);
    void base;
    const beam = mesh(new THREE.CylinderGeometry(0.2, 1.2, 2.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 1.5, 0, 1, 1, 1, g);
    void beam;
    const screen = mesh(plane, mat, 0, 4.2, 0, 6, 3, 1, g);
    g.position.set(x, SIDE, z);
    root.add(g);
    addCol(x, z, 1.3, 1.3, 0.6);
    updaters.push((dt, t) => {
      const p = actor().position;
      const d = Math.hypot(p.x - x, p.z - z);
      const nowNear = d < 22;
      if (nowNear !== near) {
        near = nowNear; holo.redraw();
        if (near && state.mode === 'play') hud.subtitle('Голограмма: «<b style="color:#ff6a5a">Пиарщик, вам одобрен кредит!</b>» Она смотрит прямо на тебя.', 3500);
      }
      // Поворачивается за игроком.
      const want = Math.atan2(p.x - x, p.z - z);
      screen.rotation.y += Math.atan2(Math.sin(want - screen.rotation.y), Math.cos(want - screen.rotation.y)) * Math.min(1, dt * 3);
      mat.opacity = 0.7 + Math.sin(t * 13) * 0.08 + (Math.random() < 0.03 ? -0.4 : 0);
      screen.position.y = 4.2 + Math.sin(t * 1.3) * 0.12;
    });
    big.holo = g;
  }

  // ---------- Табло курса валют у Афимолла (слот-машина + обратный отсчёт квартала) ----------
  {
    const x = blockC(2) + 9, z = blockC(2) + 17.5;
    const reels = [9, 8, 7];
    let spinT = 0, jackpot = false, left = 2 * 3600 + 14 * 60 + 37;
    const board = canvasTex(512, 320, (g, w, h) => {
      g.fillStyle = '#0a0f14'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffd86b'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffd86b'; g.font = `30px ${FONT}`; g.fillText('КУРС ДОЛЛАРА: НЕ СПРАШИВАЙ', w / 2, 40);
      for (let k = 0; k < 3; k++) {
        g.fillStyle = '#1b2430'; g.fillRect(70 + k * 130, 70, 110, 130);
        g.fillStyle = jackpot ? '#5ef38c' : '#ff4d4d'; g.font = `110px ${FONT}`;
        g.fillText(String(reels[k]), 125 + k * 130, 140);
      }
      g.fillStyle = jackpot ? '#5ef38c' : '#9fb8e8'; g.font = `24px ${FONT}`;
      g.fillText(jackpot ? 'ДЖЕКПОТ! КУРС 7,77 ₽ (ШУТКА)' : '₽ за $ · обновляется, когда смотришь', w / 2, 228);
      const hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = Math.floor(left % 60);
      g.fillStyle = '#ff9a1a'; g.font = `32px ${FONT}`;
      g.fillText(`ДО КОНЦА КВАРТАЛА: ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, w / 2, 282);
    });
    const gr = new THREE.Group();
    mesh(plane, basic(board.tex), 0, 4.6, 0.11, 4.8, 3, 1, gr);
    mesh(box, postMat, 0, 4.6, 0, 5, 3.2, 0.2, gr);
    mesh(box, postMat, 0, 1.6, -0.05, 0.3, 3.2, 0.3, gr);
    gr.position.set(x, SIDE, z);
    root.add(gr);
    addCol(x, z, 0.3, 0.3, 3.5);
    let acc = 0, next = 2;
    updaters.push((dt) => {
      left = Math.max(0, left - dt);
      acc += dt; next -= dt;
      if (next <= 0) { spinT = 1.4; next = 4 + Math.random() * 3; jackpot = false; }
      if (acc < 0.1) return;
      acc = 0;
      if (spinT > 0) {
        spinT -= 0.1;
        for (let k = 0; k < 3; k++) reels[k] = Math.floor(Math.random() * 10);
        if (spinT <= 0 && Math.random() < 0.2) { reels.fill(7); jackpot = true; }
      }
      board.redraw();
    });
    big.board = gr;
  }

  // ---------- Парковка «500 ₽/час»: цена растёт, пока на неё смотришь ----------
  {
    const x = blockC(1) + 18.6, z = blockC(1) + 8;
    let price = 500;
    const sign = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#1e5bff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `120px ${FONT}`; g.fillText('P', w / 2, 90);
      g.font = `${price > 9999 ? 30 : 40}px ${FONT}`; g.fillText(`${price.toLocaleString('ru-RU')} ₽/час`, w / 2, 190);
      g.font = `18px ${FONT}`; g.fillText('цена растёт, пока смотрите', w / 2, 232);
    });
    const gr = new THREE.Group();
    mesh(plane, basic(sign.tex), 0.12, 3.2, 0, 1.8, 1.8, 1, gr).rotation.y = Math.PI / 2;
    mesh(box, postMat, 0, 1.6, 0, 0.15, 3.4, 0.15, gr);
    gr.position.set(x, SIDE, z);
    root.add(gr);
    addCol(x, z, 0.2, 0.2, 3.4);
    const pos = new THREE.Vector3(x, 3.4, z), dir = new THREE.Vector3(), to = new THREE.Vector3();
    let acc = 0;
    updaters.push((dt) => {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      camera.getWorldDirection(dir);
      to.subVectors(pos, camera.position);
      const d = to.length();
      if (d < 45 && to.normalize().dot(dir) > 0.985) { price = Math.round(price * 1.12 + 10); sign.redraw(); }
      else if (price > 500 && d > 60) { price = 500; sign.redraw(); }
    });
    big.parking = gr;
  }

  // ---------- Попадания: трассеры, взрывы, кулаки, таран ----------
  if (fx && !fx._decorWrapped) {
    fx._decorWrapped = true;
    const tracer = fx.tracer.bind(fx), blast = fx.blast.bind(fx);
    fx.tracer = (from, to, color) => {
      tracer(from, to, color);
      for (const h of hittables) {
        const d = h.seg ? segDist(from, to, h.pos) : to.distanceTo(h.pos);
        if (d < h.r) h.hit('shot', from);
      }
    };
    fx.blast = (at, radius, color) => {
      blast(at, radius, color);
      for (const h of hittables) if (at.distanceTo(h.pos) < radius + h.r) h.hit('blast', at);
    };
  }
  let lastSpeed = 0, punchCd = 0;
  const _p = new THREE.Vector3();
  function interact(dt) {
    const v = getVehicle();
    punchCd -= dt;
    for (const h of hittables) {
      if (!h.ramR) continue;
      if (v) {
        _p.copy(v.position).setY(h.pos.y);
        if (_p.distanceTo(h.pos) < h.ramR && Math.abs(lastSpeed) > 6) h.hit('ram', v.position);
      } else if (input?.fire && getWeapon?.() === 'fists' && punchCd <= 0) {
        _p.copy(player.position).setY(h.pos.y);
        if (_p.distanceTo(h.pos) < h.r + 1.4) { h.hit('punch', player.position); punchCd = 0.45; }
      }
    }
    lastSpeed = v ? v.speed : 0;
    const p = actor().position;
    for (const tr of triggers) {
      tr.cd = (tr.cd || 0) - dt;
      const inside = Math.hypot(p.x - tr.pos.x, p.z - tr.pos.z) < tr.r;
      if (inside && !tr.inside && tr.cd <= 0) { tr.fn(); tr.cd = 45; }
      tr.inside = inside;
    }
  }

  // Реплика на старте: «Ну вот. Опять конец квартала».
  let introDone = false, introT = 6;
  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    for (const u of updaters) u(dt, elapsed);
    burst.update(dt);
    if (state.mode !== 'play') return;
    interact(dt);
    if (!introDone && (introT -= dt) <= 0) { introDone = true; hud.subtitle('Пиарщик: «Ну вот. Опять конец квартала».', 4000); }
  }

  const api = { update, big, hittables, atms, burst, root, district: districtIndex };
  window.__decor = api;
  return api;
}
