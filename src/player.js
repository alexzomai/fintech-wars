import { resolveCircle, groundAt } from './city.js';
import { makeHuman, animateHuman } from './humans.js';

const GRAVITY = 24, JUMP_V = 8.2, ROLL_TIME = 0.6, ROLL_SPEED = 10;

// Пиарщик-киберпанк: зелёная куртка с неоновой полосой и кепка.
// Движение относительно камеры (WASD), Shift — бег, Пробел — прыжок, Ctrl — перекат.
export class Player {
  constructor(scene) {
    this.h = makeHuman({ jacket: 0x1f6e3c, accent: 0x5dffa0, pants: 0x22252c, cap: true });
    this.mesh = this.h.root;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.heading = 0;
    this.speed = 0;
    this.radius = 0.5;
    this.maxHp = 100;
    this.hp = 100;
    this.vy = 0;
    this.grounded = true;
    this.rollT = 0;
    this.rollDir = [0, 1];
  }

  get position() { return this.mesh.position; }
  get rolling() { return this.rollT > 0; }

  jump() {
    if (!this.grounded || this.rolling) return false;
    this.vy = JUMP_V;
    this.grounded = false;
    return true;
  }

  roll() {
    if (!this.grounded || this.rolling) return false;
    this.rollT = ROLL_TIME;
    this.rollDir = [Math.sin(this.heading), Math.cos(this.heading)];
    return true;
  }

  // cars — машины, на крышу которых можно запрыгнуть. pose — флаги оружия для анимации.
  update(dt, input, camYaw, colliders, cars, pose = {}) {
    const p = this.mesh.position;
    let mx = 0, mz = 0, sp = 0;
    if (this.rolling) {
      this.rollT -= dt;
      [mx, mz] = this.rollDir;
      sp = ROLL_SPEED;
    } else {
      const f = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      sp = input.run ? 10 : 6;
      // Вперёд = направление камеры; вправо = (-cos, sin).
      mx = Math.sin(camYaw) * f - Math.cos(camYaw) * r;
      mz = Math.cos(camYaw) * f + Math.sin(camYaw) * r;
      const len = Math.hypot(mx, mz);
      if (len > 0) { mx /= len; mz /= len; } else sp = 0;
    }
    p.x += mx * sp * dt;
    p.z += mz * sp * dt;
    resolveCircle(p, this.radius, colliders, p.y);

    // Вертикаль: гравитация, ступеньки до 0.35 м заходим без прыжка.
    const ground = groundAt(p.x, p.z, cars);
    if (this.grounded) {
      if (ground > p.y && ground - p.y <= 0.35) p.y = ground;
      else if (ground < p.y - 0.05) this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      p.y += this.vy * dt;
      if (p.y <= ground) {
        if (this.vy < -4) this.h.landT = Math.min(1, -this.vy / 10); // присед при приземлении
        p.y = ground;
        this.vy = 0;
        this.grounded = true;
      }
    }

    this.speed = sp;
    const aiming = pose.aiming || pose.spraying;
    if (!this.rolling) {
      if (aiming || sp === 0) this.heading = camYaw;
      else this.heading = Math.atan2(mx, mz);
    }
    this.mesh.rotation.y = this.heading;
    animateHuman(this.h, dt, {
      ...pose, speed: sp, run: input.run && !this.rolling, air: !this.grounded,
      roll: this.rolling ? 1 - this.rollT / ROLL_TIME : 0,
    });
  }
}
