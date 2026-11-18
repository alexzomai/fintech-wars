import * as THREE from 'three';
import { BANKS } from './city.js';

// Граффити-теги банков на стенах. Баллончиком (ЛКМ, ~2 с) чужой тег перекрашивается в наш.
// Теги следуют за сменой владельца района (захват, контратака, ИИ-война).

const TAG_W = 4.2, TAG_H = 2.1, SPRAY_TIME = 2, SPRAY_RANGE = 5;

// Процедурный тег (фолбэк, пока нет PNG от художника).
function drawTag(bank) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const col = BANKS[bank].css;
  const text = { green: 'Сбережёнка!', red: 'ОДОБРЕНО', yellow: 'скачай!' }[bank];
  g.lineJoin = 'round';
  // Иконка слева.
  g.fillStyle = col; g.strokeStyle = '#111'; g.lineWidth = 6;
  g.beginPath();
  if (bank === 'green') { g.ellipse(40, 64, 30, 24, 0, 0, Math.PI * 2); }
  else if (bank === 'red') { g.moveTo(14, 26); g.lineTo(66, 26); g.lineTo(40, 64); g.lineTo(66, 102); g.lineTo(14, 102); g.lineTo(40, 64); g.closePath(); }
  else { g.moveTo(48, 14); g.lineTo(18, 70); g.lineTo(40, 70); g.lineTo(30, 114); g.lineTo(66, 52); g.lineTo(44, 52); g.closePath(); }
  g.stroke(); g.fill();
  if (bank === 'green') { g.fillStyle = '#111'; g.fillRect(34, 44, 12, 4); g.beginPath(); g.arc(28, 58, 3, 0, 7); g.arc(52, 58, 3, 0, 7); g.fill(); }
  // Надпись с толстой обводкой и подтёками.
  // Подбираем кегль, чтобы надпись влезла в 170 px справа от иконки.
  let size = 44;
  do { g.font = `900 ${size}px Impact, 'Arial Black', sans-serif`; size -= 2; } while (g.measureText(text).width > 168 && size > 14);
  g.textBaseline = 'middle';
  g.lineWidth = 9; g.strokeStyle = '#111';
  g.strokeText(text, 78, 66);
  g.fillStyle = col;
  g.fillText(text, 78, 66);
  for (let i = 0; i < 6; i++) {
    const x = 84 + Math.random() * 150;
    g.fillRect(x, 78, 3, 10 + Math.random() * 22);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Graffiti {
  constructor(scene, districts, fx) {
    this.scene = scene;
    this.fx = fx;
    this.tags = [];
    this.mats = {};
    const loader = new THREE.TextureLoader();
    for (const bank of Object.keys(BANKS)) {
      this.mats[bank] = new THREE.MeshBasicMaterial({ map: drawTag(bank), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      // Если художник положил PNG — подменяем процедурный тег.
      loader.load(`/textures/graffiti_${bank}.png`, (t) => { t.colorSpace = THREE.SRGBColorSpace; this.mats[bank].map = t; this.mats[bank].needsUpdate = true; }, undefined, () => {});
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
        const mesh = new THREE.Mesh(this.geo, this.mats[d.owner]);
        const pos = w.pos.clone().addScaledVector(w.normal, 0.06).setY(2.6);
        mesh.position.copy(pos);
        mesh.lookAt(pos.clone().add(w.normal));
        this.scene.add(mesh);
        this.tags.push({ d, owner: d.owner, mesh, pos, normal: w.normal.clone(), progress: 0 });
      }
    }
  }

  // [v3-jury] Пользовательский тег: рисунок из редактора становится текстурой всех зелёных тегов.
  setCustomTag(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    this.mats.green.map = t;
    this.mats.green.needsUpdate = true;
    this.customTag = t;
  }

  setTag(tag, owner) {
    tag.owner = owner;
    tag.progress = 0;
    tag.mesh.material = this.mats[owner];
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
    this.current = null;
    return a.tag;
  }
}
