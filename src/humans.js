import * as THREE from 'three';
import { enableSnap } from './retro.js';

// Low-poly человек на шарнирах (~500 треугольников): таз → торс → голова,
// плечо → предплечье → кисть, бедро → голень → стопа. Перед смотрит в +Z.
// Анимации процедурные (синусы и кривые), см. animateHuman.

const seg = (r1, r2, len) => new THREE.CylinderGeometry(r1, r2, len, 6).translate(0, -len / 2, 0);
const geo = {
  pelvis: new THREE.BoxGeometry(0.42, 0.22, 0.26),
  chest: new THREE.CylinderGeometry(0.25, 0.19, 0.58, 6).translate(0, 0.29, 0).scale(1.25, 1, 0.8),
  stripe: new THREE.BoxGeometry(0.06, 0.5, 0.02).translate(0, 0.3, 0),
  head: new THREE.IcosahedronGeometry(0.17, 1).scale(1, 1.15, 1),
  neck: new THREE.CylinderGeometry(0.07, 0.08, 0.12, 6),
  cap: new THREE.CylinderGeometry(0.18, 0.18, 0.1, 8),
  brim: new THREE.BoxGeometry(0.3, 0.03, 0.18),
  upperArm: seg(0.075, 0.065, 0.32),
  foreArm: seg(0.065, 0.05, 0.3),
  hand: new THREE.BoxGeometry(0.08, 0.1, 0.06).translate(0, -0.05, 0),
  thigh: seg(0.1, 0.08, 0.45),
  shin: seg(0.08, 0.06, 0.45),
  foot: new THREE.BoxGeometry(0.11, 0.07, 0.24).translate(0, -0.035, 0.05),
  gun: new THREE.BoxGeometry(0.06, 0.1, 0.3).translate(0, -0.08, 0.1),
  can: new THREE.CylinderGeometry(0.04, 0.04, 0.18, 6).rotateX(Math.PI / 2).translate(0, -0.08, 0.08),
};

const mats = new Map();
const mat = (c, emissive = false) => {
  const key = `${c}:${emissive}`;
  if (!mats.has(key)) {
    const m = emissive
      ? new THREE.MeshBasicMaterial({ color: c })
      : new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
    mats.set(key, enableSnap(m));
  }
  return mats.get(key);
};

function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// jacket — куртка, accent — неоновая полоса (цвет банка), cap — кепка в цвете accent.
// Карикатура: headScale, shoulderW, armLen, legLen, neckLen, torsoScale (число или [x, y, z]),
// prop — аксессуар или список: badge, headset, tie, phone, bigbox, stamp, magnifier, folder, cart.
export function makeHuman({
  jacket = 0x2a2d34, accent = 0x2ecc59, skin = 0xd9a77c, pants = 0x1d1f24, cap = false, scale = 1,
  headScale = 1, shoulderW = 1, armLen = 1, legLen = 1, neckLen = 1, torsoScale = 1, prop = null,
} = {}) {
  const root = new THREE.Group();
  const hipH = 0.95 * legLen;
  const hips = joint(root, 0, hipH, 0);
  hips.add(new THREE.Mesh(geo.pelvis, mat(pants)));
  const torso = joint(hips, 0, 0.08, 0);
  const ts = Array.isArray(torsoScale) ? torsoScale : [torsoScale, torsoScale, torsoScale];
  const chest = new THREE.Mesh(geo.chest, mat(jacket));
  chest.scale.set(ts[0] * shoulderW, ts[1], ts[2]);
  torso.add(chest);
  for (const x of [-0.12, 0.12]) { const s = new THREE.Mesh(geo.stripe, mat(accent, true)); s.position.set(x * ts[0] * shoulderW, 0, 0.17 * ts[2]); s.scale.y = ts[1]; torso.add(s); }
  const top = 0.58 * ts[1]; // верх торса
  const neck = new THREE.Mesh(geo.neck, mat(skin)); neck.scale.y = neckLen; neck.position.y = top + 0.06 * neckLen; torso.add(neck);
  const head = joint(torso, 0, top + 0.12 * neckLen + 0.12 * headScale, 0);
  head.scale.setScalar(headScale);
  head.add(new THREE.Mesh(geo.head, mat(skin)));
  if (cap) {
    const c = new THREE.Mesh(geo.cap, mat(accent)); c.position.y = 0.13; head.add(c);
    const b = new THREE.Mesh(geo.brim, mat(accent)); b.position.set(0, 0.1, 0.15); head.add(b);
  }
  const arm = (side) => {
    const shoulder = joint(torso, side * 0.3 * ts[0] * shoulderW, 0.55 * ts[1], 0);
    const ua = new THREE.Mesh(geo.upperArm, mat(jacket)); ua.scale.y = armLen; shoulder.add(ua);
    const elbow = joint(shoulder, 0, -0.32 * armLen, 0);
    const fa = new THREE.Mesh(geo.foreArm, mat(jacket)); fa.scale.y = armLen; elbow.add(fa);
    const hand = joint(elbow, 0, -0.3 * armLen, 0);
    hand.add(new THREE.Mesh(geo.hand, mat(skin)));
    return { shoulder, elbow, hand };
  };
  const leg = (side) => {
    const hip = joint(hips, side * 0.12, -0.06 * legLen, 0);
    const th = new THREE.Mesh(geo.thigh, mat(pants)); th.scale.y = legLen; hip.add(th);
    const knee = joint(hip, 0, -0.45 * legLen, 0);
    const sh = new THREE.Mesh(geo.shin, mat(pants)); sh.scale.y = legLen; knee.add(sh);
    const ankle = joint(knee, 0, -0.42 * legLen, 0);
    ankle.add(new THREE.Mesh(geo.foot, mat(0x151515)));
    return { hip, knee, ankle };
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);
  // Предметы в правой руке: пистолет и баллончик (видимость переключается).
  const gun = new THREE.Mesh(geo.gun, mat(0x111111)); armR.hand.add(gun);
  const can = new THREE.Mesh(geo.can, mat(0x2ecc59)); can.visible = false; armR.hand.add(can);
  const h = { root, hips, torso, head, armL, armR, legL, legR, gun, can, hipH, t: 0, phase: 0, recoil: 0, hitT: 0, landT: 0, lean: 0, props: {} };
  for (const p of [].concat(prop || [])) PROPS[p]?.(h, { jacket, accent, skin, ts, top });
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(scale);
  return h;
}

// --- Аксессуары карикатур ---
const textTex = new Map();
function plateTex(text, bg = '#ffffff', fg = '#111111') {
  const key = text + bg + fg;
  if (textTex.has(key)) return textTex.get(key);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = text.split('\n');
  g.font = `bold ${lines.length > 1 ? 34 : 44}px "Press Start 2P", monospace`;
  lines.forEach((l, k) => g.fillText(l, 128, 64 + (k - (lines.length - 1) / 2) * 44));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  textTex.set(key, t);
  return t;
}
const plate = (text, w, h, bg, fg) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: plateTex(text, bg, fg) }));
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
const PROPS = {
  // Бейдж во всю грудь.
  badge(h, { ts }) { const m = plate('ПРИВЕТ,\nЯ ПИАРЩИК', 0.34, 0.17); m.position.set(0, 0.36 * ts[1], 0.215 * ts[2] + 0.01); h.torso.add(m); h.props.badge = m; },
  // Гарнитура: дужка и микрофон.
  headset(h) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 4, 10, Math.PI), mat(0x111111)); band.position.y = 0.04; h.head.add(band);
    const mic = box(0.02, 0.02, 0.16, 0x111111); mic.position.set(0.17, -0.06, 0.08); mic.rotation.y = -0.4; h.head.add(mic);
    h.props.headset = band;
  },
  // Галстук, развевается назад (animateHuman).
  tie(h, { accent, ts }) { const t = box(0.06, 0.3, 0.02, accent); t.geometry.translate(0, -0.15, 0); t.position.set(0, 0.55 * ts[1], 0.2 * ts[2]); h.torso.add(t); h.props.tie = t; },
  // Телефон приклеен к уху (левая рука поднята).
  phone(h) { const p = box(0.05, 0.12, 0.02, 0x222222); p.position.set(0, -0.08, 0.04); h.armL.hand.add(p); h.props.phone = p; },
  // Короб в 3 раза больше курьера: торчат одни ноги.
  bigbox(h, { accent }) { const b = box(1.3, 1.5, 1.1, 0x2ec4b6); b.position.set(0, 0.55, -0.15); h.torso.add(b); const l = box(1.32, 0.12, 1.12, accent); l.position.set(0, 0.85, -0.15); h.torso.add(l); h.props.bigbox = b; },
  // Голова — круглая печать «ООО».
  stamp(h) {
    h.head.children[0].visible = false;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 8), mat(0x3a2414)); handle.position.y = 0.05;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0x3a2414)); knob.position.y = 0.2;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12), mat(0x2848c8)); base.position.y = -0.1;
    h.head.add(handle, knob, base); h.props.stamp = base;
  },
  // Лупа вместо глаза.
  magnifier(h) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 4, 12), mat(0xc0a040)); r.position.set(0.07, 0.03, 0.17); h.head.add(r); h.props.magnifier = r; },
  // Папка толщиной с чемодан.
  folder(h) { const f = box(0.12, 0.42, 0.55, 0x2a5aa8); f.position.set(0, -0.22, 0.05); h.armR.hand.add(f); h.props.folder = f; },
  // Голова ПАО — офисное здание с окнами.
  office(h) {
    h.head.children[0].visible = false;
    const b = box(0.36, 0.5, 0.36, 0x7d8a96); b.position.y = 0.08; h.head.add(b);
    const w = plate('▪ ▪ ▪\n▪ ▪ ▪', 0.3, 0.4, '#2a3440', '#ffd27a'); w.position.set(0, 0.08, 0.181); h.head.add(w);
    h.props.office = b;
  },
  // Майка: руки голые.
  tanktop(h, { skin }) { for (const a of [h.armL, h.armR]) { a.shoulder.children[0].material = mat(skin); a.elbow.children[0].material = mat(skin); } },
  // Сумка-тележка бабушки.
  cart(h) { const c = box(0.32, 0.42, 0.26, 0x6a2a5a); c.position.set(0, -0.36, 0.25); h.armR.hand.add(c); h.props.cart = c; },
};

// --- Пресеты карикатур (передавать в makeHuman вместе с цветами) ---
export const PR_PRESET = { headScale: 1.5, prop: ['badge', 'headset', 'tie'] };
export const COLLECTOR_PRESET = { shoulderW: 2.2, torsoScale: [1, 1.15, 1.3], headScale: 0.5, armLen: 1.15, prop: ['phone'] };
export const SELLER_PRESET = { armLen: 2.1, headScale: 1.2, prop: ['folder'] };
export const COURIER_PRESET = { prop: ['bigbox'] };
export const CORP_PRESET = { prop: ['stamp'], torsoScale: [1.1, 1, 1.1] };
export const JOCK_PRESET = { shoulderW: 2.1, torsoScale: [1.1, 1.1, 1.4], headScale: 0.55, legLen: 0.75, armLen: 1.1, prop: ['tanktop'] };
export const PAO_PRESET = { prop: ['office'], torsoScale: [1.15, 1, 1.15] };
export const FNS_PRESET = { neckLen: 7, headScale: 1.05, prop: ['magnifier', 'folder'] };
export const GRANNY_PRESET = { headScale: 1.15, legLen: 0.8, prop: ['cart'], scale: 0.85 };

const damp = (cur, target, k, dt) => cur + (target - cur) * Math.min(1, k * dt);

// pose: { speed, run, aiming, aimPitch, spraying, air, roll (0..1), dead }
export function animateHuman(h, dt, pose) {
  h.t += dt;
  const sp = Math.abs(pose.speed || 0);
  const moving = sp > 0.3 && !pose.air;
  h.phase += dt * (pose.run ? 11 : 8) * Math.min(1, sp / 4);
  const ph = h.phase;
  const run = pose.run && moving;
  const amp = moving ? (run ? 0.95 : 0.55) : 0;
  h.recoil = Math.max(0, h.recoil - dt * 8);
  h.hitT = Math.max(0, h.hitT - dt * 4);
  h.landT = Math.max(0, h.landT - dt * 4);

  // Ноги: мах бедром, сгиб колена на заднем ходе шага.
  let hipL = Math.sin(ph) * amp, hipR = -Math.sin(ph) * amp;
  let kneeL = Math.max(0, -Math.sin(ph + 0.6)) * amp * 1.6, kneeR = Math.max(0, Math.sin(ph + 0.6)) * amp * 1.6;
  const hipH = h.hipH ?? 0.95;
  let hipsY = hipH + (moving ? Math.abs(Math.sin(ph)) * (run ? 0.08 : 0.04) : Math.sin(h.t * 2) * 0.008);
  if (pose.air) {
    // В воздухе: поджатые ноги.
    hipL = -0.9; hipR = -0.6; kneeL = 1.5; kneeR = 1.2;
  }
  // Присед при толчке/приземлении.
  const crouch = Math.max(h.landT, pose.crouch || 0);
  hipsY -= crouch * 0.25;
  hipL -= crouch * 0.6; hipR -= crouch * 0.6; kneeL += crouch * 1.2; kneeR += crouch * 1.2;

  h.legL.hip.rotation.x = damp(h.legL.hip.rotation.x, -hipL, 18, dt);
  h.legR.hip.rotation.x = damp(h.legR.hip.rotation.x, -hipR, 18, dt);
  h.legL.knee.rotation.x = damp(h.legL.knee.rotation.x, kneeL, 18, dt);
  h.legR.knee.rotation.x = damp(h.legR.knee.rotation.x, kneeR, 18, dt);
  h.legL.ankle.rotation.x = -h.legL.knee.rotation.x * 0.4;
  h.legR.ankle.rotation.x = -h.legR.knee.rotation.x * 0.4;
  h.hips.position.y = damp(h.hips.position.y, hipsY, 20, dt);

  // Корпус: наклон вперёд на бегу, дыхание в покое, откидывание при попадании.
  const breath = moving ? 0 : Math.sin(h.t * 2) * 0.03;
  const leanT = (run ? 0.3 : moving ? 0.08 : 0) + crouch * 0.3 + (pose.air ? 0.15 : 0) - h.hitT * 0.5;
  h.lean = damp(h.lean, leanT, 10, dt);
  h.torso.rotation.x = h.lean + breath;
  h.torso.rotation.y = moving ? Math.sin(ph) * 0.12 : 0;
  h.head.rotation.x = -h.lean * 0.6;

  // Руки: противофаза ногам; в воздухе — разведены.
  let shL = -Math.sin(ph) * amp * 0.9, shR = Math.sin(ph) * amp * 0.9;
  let elL = moving ? -(run ? 1.4 : 0.4) : -0.15, elR = elL;
  let sideL = 0.08, sideR = -0.08;
  if (pose.air) { shL = -2.4; shR = -2.4; sideL = 0.5; sideR = -0.5; elL = elR = -0.3; }
  if (pose.aiming || pose.spraying) {
    // Правая рука к цели (с учётом наклона камеры), отдача — рывок вверх.
    shR = -Math.PI / 2 - (pose.aimPitch || 0) - h.recoil * 0.35 - h.lean;
    elR = 0;
    sideR = 0;
    if (pose.spraying) shR += Math.sin(h.t * 22) * 0.06;
    if (pose.aiming && !pose.spraying) { shL = -1.2; elL = -0.6; sideL = -0.4; } // поддерживает пистолет
  }
  h.armL.shoulder.rotation.x = damp(h.armL.shoulder.rotation.x, shL, 16, dt);
  h.armR.shoulder.rotation.x = damp(h.armR.shoulder.rotation.x, shR, pose.aiming ? 30 : 16, dt);
  h.armL.shoulder.rotation.z = damp(h.armL.shoulder.rotation.z, -sideL, 12, dt);
  h.armR.shoulder.rotation.z = damp(h.armR.shoulder.rotation.z, -sideR, 12, dt);
  h.armL.elbow.rotation.x = damp(h.armL.elbow.rotation.x, elL, 16, dt);
  h.armR.elbow.rotation.x = damp(h.armR.elbow.rotation.x, elR, 16, dt);
  h.gun.visible = !pose.spraying;
  h.can.visible = !!pose.spraying;

  // Перекат: полный оборот корпуса вперёд.
  h.hips.rotation.x = pose.roll ? pose.roll * Math.PI * 2 : 0;
  if (pose.roll) h.hips.position.y = hipH * 0.58;
  if (h.props?.tie) h.props.tie.rotation.x = -(moving ? (run ? 1.1 : 0.5) : 0.1) - Math.sin(h.t * 14) * 0.15 * (moving ? 1 : 0.2);
  if (h.props?.phone && !pose.aiming) { h.armL.shoulder.rotation.x = -2.5; h.armL.shoulder.rotation.z = 0.6; h.armL.elbow.rotation.x = -2.3; }
}
