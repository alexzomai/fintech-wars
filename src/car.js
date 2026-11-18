import * as THREE from 'three';
import { resolveCircle } from './city.js';
import { enableSnap } from './retro.js';

// Меш машинки из боксов. Перед машины смотрит в +Z.
export function makeCarMesh(color = 0xff4d4d) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 4.4), new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 }));
  body.position.y = 0.8;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 2.2), new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.6, roughness: 0.2 }));
  cabin.position.set(0, 1.5, -0.3);
  g.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const [x, z] of [[-1.1, 1.4], [1.1, 1.4], [-1.1, -1.4], [1.1, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.45, z);
    g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const x of [-0.7, 0.7]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.05), lightMat);
    l.position.set(x, 0.9, 2.21);
    g.add(l);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; enableSnap(o.material); } });
  return g;
}

// Аркадная физика: скорость вдоль курса, руль зависит от скорости.
export class Car {
  constructor(scene, pos, { mesh = null, heading = 0, color = 0x2ecc59 } = {}) {
    this.mesh = mesh || makeCarMesh(color);
    this.mesh.position.copy(pos);
    if (!mesh) scene.add(this.mesh);
    this.heading = heading;
    this.speed = 0;
    this.radius = 1.9;
    this.vy = 0;
    this.airborne = false;
    this.mesh.rotation.order = 'YXZ'; // курс, затем тангаж в локальных осях
  }

  // Прыжок с трамплина: вертикальная скорость, горизонтальная сохраняется.
  launch(vy) {
    this.vy = vy;
    this.airborne = true;
  }

  get position() { return this.mesh.position; }

  update(dt, input, colliders) {
    const MAX = 38, REV = -12;
    if (input) {
      if (input.up) this.speed += (this.speed < 0 ? 40 : 22) * dt;
      else if (input.down) this.speed -= (this.speed > 0 ? 40 : 14) * dt;
      if (input.brake) this.speed *= Math.max(0, 1 - 3 * dt);
    }
    // Сопротивление качению и воздуха.
    this.speed -= this.speed * 0.5 * dt;
    if (!input || (!input.up && !input.down)) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 4 * dt);
    this.speed = Math.max(REV, Math.min(MAX, this.speed));

    if (this.airborne) {
      // Полёт: без управления, гравитация, нос плавно опускается.
      this.vy -= 22 * dt;
      this.mesh.position.y += this.vy * dt;
      this.mesh.rotation.x = Math.max(-0.5, Math.min(0.35, -this.vy * 0.03));
      if (this.mesh.position.y <= 0) {
        this.mesh.position.y = 0;
        this.vy = 0;
        this.airborne = false;
        this.mesh.rotation.x = 0;
        this.speed *= 0.85;
      }
      input = null;
    }
    if (input) {
      const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      const grip = Math.min(1, Math.abs(this.speed) / 8) * Math.sign(this.speed);
      this.heading += steer * 2.2 * grip * dt * (input.brake ? 1.6 : 1);
    }

    const p = this.mesh.position;
    p.x += Math.sin(this.heading) * this.speed * dt;
    p.z += Math.cos(this.heading) * this.speed * dt;
    if (resolveCircle(p, this.radius, colliders, p.y)) {
      this.speed *= -0.3;
    }
    this.mesh.rotation.y = this.heading;
  }
}
