import * as THREE from 'three';
import { enableSnap } from './retro.js';

// Сегментный низкополигональный человечек: ноги, торс, руки, голова отдельно.
// Перед смотрит в +Z. Пистолет в правой руке.
const geo = {
  leg: new THREE.BoxGeometry(0.28, 0.9, 0.3).translate(0, -0.45, 0),
  arm: new THREE.BoxGeometry(0.22, 0.75, 0.22).translate(0, -0.35, 0),
  torso: new THREE.BoxGeometry(0.75, 0.8, 0.42),
  head: new THREE.BoxGeometry(0.4, 0.42, 0.4),
  tie: new THREE.BoxGeometry(0.14, 0.55, 0.02),
  gun: new THREE.BoxGeometry(0.12, 0.16, 0.5),
};
const mats = new Map();
const mat = (c) => {
  if (!mats.has(c)) mats.set(c, enableSnap(new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true })));
  return mats.get(c);
};

export function makeHuman({ suit = 0x2a2d34, accent = 0x2ecc59, skin = 0xd9a77c, pants = 0x1d1f24, scale = 1 } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // всё, что качается при ходьбе
  root.add(body);
  const legL = new THREE.Mesh(geo.leg, mat(pants)); legL.position.set(-0.17, 0.9, 0);
  const legR = new THREE.Mesh(geo.leg, mat(pants)); legR.position.set(0.17, 0.9, 0);
  const torso = new THREE.Mesh(geo.torso, mat(suit)); torso.position.y = 1.3;
  const tie = new THREE.Mesh(geo.tie, mat(accent)); tie.position.set(0, 1.35, 0.22);
  const armL = new THREE.Mesh(geo.arm, mat(suit)); armL.position.set(-0.5, 1.65, 0);
  const armR = new THREE.Mesh(geo.arm, mat(suit)); armR.position.set(0.5, 1.65, 0);
  const head = new THREE.Mesh(geo.head, mat(skin)); head.position.y = 1.95;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), mat(accent)); band.position.y = 2.1;
  const gun = new THREE.Mesh(geo.gun, mat(0x111111)); gun.position.set(0, -0.7, 0.2);
  armR.add(gun);
  body.add(legL, legR, torso, tie, armL, armR, head, band);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(scale);
  return { root, legL, legR, armL, armR, torso, head, gun, walkT: 0 };
}

// Анимация: шаг ногами/руками; aiming — правая рука вытянута вперёд.
export function animateHuman(h, dt, speed, aiming) {
  h.walkT += dt * Math.min(Math.abs(speed), 9) * 1.6;
  const s = Math.abs(speed) > 0.3 ? Math.sin(h.walkT) * 0.7 : 0;
  h.legL.rotation.x = s;
  h.legR.rotation.x = -s;
  h.armL.rotation.x = -s * 0.8;
  h.armR.rotation.x = aiming ? -Math.PI / 2 : s * 0.8;
}
