import { resolveCircle } from './city.js';
import { makeHuman, animateHuman } from './humans.js';

// Игрок пешком: движение относительно камеры (WASD), Shift — бег.
export class Player {
  constructor(scene) {
    this.h = makeHuman({ accent: 0x2ecc59, suit: 0x1f5e35 });
    this.mesh = this.h.root;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.heading = 0;
    this.speed = 0;
    this.radius = 0.5;
    this.maxHp = 100;
    this.hp = 100;
  }

  get position() { return this.mesh.position; }

  update(dt, input, camYaw, colliders, aiming) {
    const f = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const sp = input.run ? 10 : 6;
    // Вперёд = направление камеры; вправо = (-cos, sin).
    let mx = Math.sin(camYaw) * f - Math.cos(camYaw) * r;
    let mz = Math.cos(camYaw) * f + Math.sin(camYaw) * r;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const p = this.mesh.position;
    p.x += mx * sp * dt;
    p.z += mz * sp * dt;
    resolveCircle(p, this.radius, colliders);
    this.speed = len > 0 ? sp : 0;
    // В прицеливании смотрим туда же, куда камера; иначе — по ходу движения.
    if (aiming || len === 0) this.heading = camYaw;
    else this.heading = Math.atan2(mx, mz);
    this.mesh.rotation.y = this.heading;
    animateHuman(this.h, dt, this.speed, aiming);
  }
}
