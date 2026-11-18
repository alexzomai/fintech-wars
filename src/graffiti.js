import * as THREE from 'three';
import { BANKS } from './city.js';
import { sfx } from './audio.js'; // [v3-audio]

// Граффити-теги банков на стенах. Баллончиком (ЛКМ, ~2 с) чужой тег перекрашивается в наш.
// Теги следуют за сменой владельца района (захват, контратака, ИИ-война).

const TAG_W = 4.2, TAG_H = 2.1, SPRAY_TIME = 1.2, SPRAY_RANGE = 6;

// --- Процедурные теги (фолбэк, если нет PNG). 4 варианта на банк, 256×128 с прозрачностью. ---
const OUT = '#111';
function canvas() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.lineJoin = g.lineCap = 'round';
  return [c, g];
}
// Баббл-леттеринг: толстая чёрная обводка, цветная заливка, блик.
function bubble(g, text, cx, cy, maxW, col, size = 46) {
  do { g.font = `900 ${size}px Impact, 'Arial Black', sans-serif`; size -= 2; } while (g.measureText(text).width > maxW && size > 12);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 11; g.strokeStyle = OUT; g.strokeText(text, cx, cy);
  g.fillStyle = col; g.fillText(text, cx, cy);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.save(); g.beginPath(); g.rect(cx - maxW, cy - size * 0.55, maxW * 2, size * 0.3); g.clip(); g.fillText(text, cx, cy); g.restore();
}
function drips(g, x0, x1, y, col, n = 6) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) / n) * (x1 - x0) + (Math.random() - 0.5) * 8, h = 8 + Math.random() * 22;
    g.fillRect(x - 1.5, y, 3, h); g.beginPath(); g.arc(x, y + h, 3, 0, 7); g.fill();
  }
}
function coin(g, x, y, r, col, label) {
  g.lineWidth = 6; g.strokeStyle = OUT; g.fillStyle = col;
  g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(x, y, r * 0.72, 0, 7); g.stroke();
  g.fillStyle = OUT; g.font = `900 ${r}px Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, y + 2);
}
function poly(g, pts, fill) {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  g.lineWidth = 6; g.strokeStyle = OUT; g.stroke(); g.fillStyle = fill; g.fill();
}

const DRAW = {
  green: [
    (g, col) => { // фолбэк «Сбережёнка!» (поверх — PNG с хрюшкой)
      g.fillStyle = col; g.strokeStyle = OUT; g.lineWidth = 6; g.beginPath(); g.ellipse(40, 64, 30, 24, 0, 0, 7); g.stroke(); g.fill();
      g.fillStyle = OUT; g.fillRect(34, 44, 12, 4); g.beginPath(); g.arc(28, 58, 3, 0, 7); g.arc(52, 58, 3, 0, 7); g.fill();
      bubble(g, 'Сбережёнка!', 160, 64, 170, col, 40); drips(g, 90, 235, 80, col);
    },
    (g, col) => { bubble(g, 'КОПИ', 112, 64, 190, col, 64); coin(g, 218, 44, 22, '#ffd23f', '$'); coin(g, 232, 90, 14, '#ffd23f', '$'); drips(g, 30, 190, 88, col, 7); },
    (g, col) => { // монета с короной
      coin(g, 128, 76, 42, col, '$');
      poly(g, [[92, 40], [98, 8], [112, 26], [128, 4], [144, 26], [158, 8], [164, 40]], '#ffd23f');
      g.fillStyle = '#ff4d6d'; for (const x of [98, 128, 158]) { g.beginPath(); g.arc(x, 12 + (x === 128 ? -4 : 0), 3, 0, 7); g.fill(); }
      drips(g, 96, 160, 116, col, 4);
    },
    (g, col) => { bubble(g, 'Вклад', 128, 40, 220, col, 50); bubble(g, 'в стену', 128, 92, 220, '#ffffff', 44); drips(g, 40, 220, 108, col, 6); },
  ],
  red: [
    (g, col) => { bubble(g, 'ОДОБРЕНО', 128, 64, 230, col, 48); drips(g, 20, 236, 82, col, 8); },
    (g, col) => { // песочные часы
      poly(g, [[34, 14], [84, 14], [62, 64], [84, 114], [34, 114], [56, 64]], col);
      g.fillStyle = '#ffd9a0'; g.beginPath(); g.moveTo(44, 100); g.lineTo(74, 100); g.lineTo(60, 76); g.fill();
      bubble(g, 'ЖДИ', 170, 64, 130, col, 50); drips(g, 120, 225, 86, col, 5);
    },
    (g, col) => { // знак процента с клыками
      bubble(g, '%', 80, 64, 90, col, 110);
      g.fillStyle = '#fff'; g.strokeStyle = OUT; g.lineWidth = 3;
      for (const x of [58, 98]) { g.beginPath(); g.moveTo(x, 84); g.lineTo(x + 7, 84); g.lineTo(x + 3, 104); g.closePath(); g.fill(); g.stroke(); }
      bubble(g, '29,9%', 190, 64, 110, col, 42); drips(g, 140, 240, 84, col, 4);
    },
    (g, col) => { bubble(g, 'ДОЛЖОК!', 128, 60, 236, col, 54); drips(g, 14, 240, 80, col, 9); },
  ],
  yellow: [
    (g, col) => { poly(g, [[48, 10], [18, 66], [40, 66], [30, 116], [66, 50], [44, 50]], col); bubble(g, 'скачай!', 160, 64, 160, col, 46); drips(g, 90, 230, 82, col); },
    (g, col) => { // смайлик-экран
      poly(g, [[12, 6], [76, 6], [76, 122], [12, 122]], '#2a2a33'); g.fillStyle = col; g.fillRect(18, 18, 52, 84);
      g.fillStyle = OUT; g.beginPath(); g.arc(34, 48, 4, 0, 7); g.arc(54, 48, 4, 0, 7); g.fill();
      g.lineWidth = 4; g.strokeStyle = OUT; g.beginPath(); g.arc(44, 62, 12, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      bubble(g, ':) ', 170, 44, 150, col, 36); bubble(g, 'тепло!', 170, 92, 150, '#fff', 40);
    },
    (g, col) => { bubble(g, 'Мы', 52, 64, 80, col, 54); bubble(g, 'не банк', 170, 64, 150, '#fff', 46); drips(g, 100, 240, 84, col, 5); },
    (g, col) => { // солнце с кэшбэком
      g.strokeStyle = OUT; g.lineWidth = 12; for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; g.beginPath(); g.moveTo(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke(); }
      g.strokeStyle = col; g.lineWidth = 6; for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; g.beginPath(); g.moveTo(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40); g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); g.stroke(); }
      coin(g, 64, 64, 34, col, '30%'); bubble(g, 'кэшбэк', 190, 64, 120, col, 36); drips(g, 140, 245, 82, col, 4);
    },
  ],
};
const VARIANTS = 4;

function drawVariant(bank, n) {
  const [c, g] = canvas();
  DRAW[bank][n](g, BANKS[bank].css);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Graffiti {
  constructor(scene, districts, fx) {
    this.scene = scene;
    this.fx = fx;
    this.tags = [];
    this.mats = {};      // mats[bank] = вариант 0 (совместимость)
    this.variants = {};  // variants[bank] = 4 материала-варианта
    this.nextId = 0;
    const loader = new THREE.TextureLoader();
    const mk = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const bank of Object.keys(BANKS)) {
      this.variants[bank] = Array.from({ length: VARIANTS }, (_, n) => mk(drawVariant(bank, n)));
      this.mats[bank] = this.variants[bank][0];
      // PNG от художника подменяют процедурные: graffiti_<bank>_<1..4>.png, а graffiti_<bank>.png — вариант 0.
      const put = (n) => (t) => { t.colorSpace = THREE.SRGBColorSpace; this.variants[bank][n].map = t; this.variants[bank][n].needsUpdate = true; };
      loader.load(`/textures/graffiti_${bank}.png`, put(0), undefined, () => {});
      for (let n = 1; n <= VARIANTS; n++) loader.load(`/textures/graffiti_${bank}_${n}.png`, put(n - 1), undefined, () => {});
    }
    this.districts = districts;
    this.geo = new THREE.PlaneGeometry(TAG_W, TAG_H);
  }

  // Ставим теги на наружные стены обычных домов района (на уровне глаз, со стороны улицы).
  place(walls) {
    const byDistrict = new Map();
    for (const w of walls) {
      if (!byDistrict.has(w.district)) byDistrict.set(w.district, []);
      byDistrict.get(w.district).push(w);
    }
    for (const [d, list] of byDistrict) {
      list.sort(() => Math.random() - 0.5);
      for (const w of list.slice(0, 5)) {
        const id = this.nextId++;
        const mesh = new THREE.Mesh(this.geo, this.pickMat(d.owner, id));
        const pos = w.pos.clone().addScaledVector(w.normal, 0.06).setY(2.6);
        mesh.position.copy(pos);
        mesh.lookAt(pos.clone().add(w.normal));
        this.scene.add(mesh);
        this.tags.push({ id, d, owner: d.owner, mesh, pos, normal: w.normal.clone(), progress: 0 });
      }
    }
  }

  // Вариант тега: стабильно по id (seed), либо случайный. Рисунок игрока (если есть) — у каждого второго зелёного.
  pickMat(owner, seed = Math.random() * 1000 | 0) {
    if (owner === 'green' && this.customMat && seed % 2 === 0) return this.customMat;
    return this.variants[owner][(seed * 2654435761 >>> 0) % VARIANTS];
  }

  // [v3-jury] Пользовательский тег: рисунок из редактора получают ~половина зелёных тегов (и половина будущих перекрасок).
  setCustomTag(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    this.customTag = t;
    this.customMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const tag of this.tags) if (tag.owner === 'green' && tag.id % 2 === 0) tag.mesh.material = this.customMat;
  }

  setTag(tag, owner) {
    tag.owner = owner;
    tag.progress = 0;
    tag.mesh.material = this.pickMat(owner, Math.random() * 1000 | 0);
  }

  // Смена владельца района: все теги района перекрашиваются.
  onOwnerChange(d) {
    for (const t of this.tags) if (t.d === d) this.setTag(t, d.owner);
  }

  inDistrict(d) { return this.tags.filter((t) => t.d === d); }
  greenCount(d) { return this.inDistrict(d).filter((t) => t.owner === 'green').length; }

  // Луч камеры против прямоугольника тега.
  aimed(o, dir, playerPos) {
    let best = null;
    const right = new THREE.Vector3();
    for (const t of this.tags) {
      if (t.owner === 'green' || t.pos.distanceTo(playerPos) > SPRAY_RANGE) continue;
      const denom = dir.dot(t.normal);
      if (denom > -1e-3) continue; // смотрим на стену спереди
      const k = t.pos.clone().sub(o).dot(t.normal) / denom;
      if (k < 0) continue;
      const hit = o.clone().addScaledVector(dir, k).sub(t.pos);
      right.set(t.normal.z, 0, -t.normal.x);
      if (Math.abs(hit.dot(right)) > TAG_W / 2 + 0.4 || Math.abs(hit.y) > TAG_H / 2 + 0.4) continue;
      if (!best || k < best.k) best = { tag: t, k, point: o.clone().addScaledVector(dir, k) };
    }
    if (best) return best;
    // Помощь прицеливанию: в третьем лице точно навестись на стену вплотную трудно,
    // поэтому берём ближайший чужой тег перед камерой (конус ±75°), повёрнутый к игроку.
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    let bestD = Infinity;
    for (const t of this.tags) {
      if (t.owner === 'green') continue;
      const to = new THREE.Vector3(t.pos.x - playerPos.x, 0, t.pos.z - playerPos.z);
      const d = to.length();
      if (d > SPRAY_RANGE || d < 1e-3) continue;
      if (to.dot(t.normal) > 0) continue; // стоим за стеной
      if (to.normalize().dot(flat) < Math.cos((75 * Math.PI) / 180)) continue;
      if (d < bestD) { bestD = d; best = { tag: t, k: d, point: t.pos.clone() }; }
    }
    return best;
  }

  // Распыление: возвращает перекрашенный тег (если закончили), иначе null.
  spray(dt, o, dir, playerPos, muzzle) {
    const a = this.aimed(o, dir, playerPos);
    const end = a ? a.point : o.clone().addScaledVector(dir, 3);
    if (Math.random() < 0.6) this.fx.spark(end.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8)), 0x2ecc59, 0.18);
    if (Math.random() < 0.3) this.fx.spark(muzzle, 0x9cf0b0, 0.08);
    if (!a) { this.current = null; return null; }
    this.current = a.tag;
    a.tag.progress += dt / SPRAY_TIME;
    if (a.tag.progress < 1) return null;
    this.setTag(a.tag, 'green');
    sfx.play('tag'); // [v3-audio]
    this.current = null;
    return a.tag;
  }
}
