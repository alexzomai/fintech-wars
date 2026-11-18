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
export function makeHuman({ jacket = 0x2a2d34, accent = 0x2ecc59, skin = 0xd9a77c, pants = 0x1d1f24, cap = false, scale = 1 } = {}) {
  const root = new THREE.Group();
  const hips = joint(root, 0, 0.95, 0);
  hips.add(new THREE.Mesh(geo.pelvis, mat(pants)));
  const torso = joint(hips, 0, 0.08, 0);
  torso.add(new THREE.Mesh(geo.chest, mat(jacket)));
  for (const x of [-0.12, 0.12]) { const s = new THREE.Mesh(geo.stripe, mat(accent, true)); s.position.set(x, 0, 0.17); torso.add(s); }
  const neck = new THREE.Mesh(geo.neck, mat(skin)); neck.position.y = 0.64; torso.add(neck);
  const head = joint(torso, 0, 0.82, 0);
  head.add(new THREE.Mesh(geo.head, mat(skin)));
  if (cap) {
    const c = new THREE.Mesh(geo.cap, mat(accent)); c.position.y = 0.13; head.add(c);
    const b = new THREE.Mesh(geo.brim, mat(accent)); b.position.set(0, 0.1, 0.15); head.add(b);
  }
  const arm = (side) => {
    const shoulder = joint(torso, side * 0.3, 0.55, 0);
    shoulder.add(new THREE.Mesh(geo.upperArm, mat(jacket)));
    const elbow = joint(shoulder, 0, -0.32, 0);
    elbow.add(new THREE.Mesh(geo.foreArm, mat(jacket)));
    const hand = joint(elbow, 0, -0.3, 0);
    hand.add(new THREE.Mesh(geo.hand, mat(skin)));
    return { shoulder, elbow, hand };
  };
  const leg = (side) => {
    const hip = joint(hips, side * 0.12, -0.06, 0);
    hip.add(new THREE.Mesh(geo.thigh, mat(pants)));
    const knee = joint(hip, 0, -0.45, 0);
    knee.add(new THREE.Mesh(geo.shin, mat(pants)));
    const ankle = joint(knee, 0, -0.42, 0);
    ankle.add(new THREE.Mesh(geo.foot, mat(0x151515)));
    return { hip, knee, ankle };
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);
  // Предметы в правой руке: пистолет и баллончик (видимость переключается).
  const gun = new THREE.Mesh(geo.gun, mat(0x111111)); armR.hand.add(gun);
  const can = new THREE.Mesh(geo.can, mat(0x2ecc59)); can.visible = false; armR.hand.add(can);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(scale);
  return { root, hips, torso, head, armL, armR, legL, legR, gun, can, t: 0, phase: 0, recoil: 0, hitT: 0, landT: 0, lean: 0 };
}

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
  let hipsY = 0.95 + (moving ? Math.abs(Math.sin(ph)) * (run ? 0.08 : 0.04) : Math.sin(h.t * 2) * 0.008);
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
  if (pose.roll) h.hips.position.y = 0.55;
}
