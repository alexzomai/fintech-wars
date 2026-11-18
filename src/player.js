import { resolveCircle, groundAt } from './city.js';
import { makeHuman, animateHuman } from './humans.js';

const GRAVITY = 24, JUMP_V = 8.2, ROLL_TIME = 0.6, ROLL_SPEED = 10;
// Инерция: разгон/торможение (м/с²), скорость разворота (рад/с), выносливость спринта (доля в секунду).
const ACCEL = 26, DECEL = 30, AIR_ACCEL = 5, TURN = 9, SPRINT_TURN = 5.5;
const JOG = 6, SPRINT = 10, TIRED_RUN = 7.5, DRAIN = 0.2, REGEN = 0.16;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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
    this.vx = 0; this.vz = 0; // скорость с инерцией
    this.kx = 0; this.kz = 0; // отбрасывание (взрыв), гаснет само
    this.stamina = 1;
    this.tired = false;
  }

  // Внешний толчок: горизонтальный вектор и подброс вверх.
  knock(v, up = 0) {
    this.kx += v.x; this.kz += v.z;
    if (up > 0) { this.vy = Math.max(this.vy, up); this.grounded = false; }
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
    let sp = 0, sprint = false;
    if (this.rolling) {
      this.rollT -= dt;
      this.vx = this.rollDir[0] * ROLL_SPEED;
      this.vz = this.rollDir[1] * ROLL_SPEED;
    } else {
      const f = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      // Вперёд = направление камеры; вправо = (-cos, sin).
      let mx = Math.sin(camYaw) * f - Math.cos(camYaw) * r;
      let mz = Math.cos(camYaw) * f + Math.sin(camYaw) * r;
      const len = Math.hypot(mx, mz);
      if (len > 0) { mx /= len; mz /= len; }
      sprint = input.run && len > 0 && !this.tired;
      sp = len === 0 ? 0 : sprint ? SPRINT : input.run ? TIRED_RUN : JOG;
      const cur = Math.hypot(this.vx, this.vz);
      const acc = this.grounded ? (sp >= cur ? ACCEL : DECEL) : AIR_ACCEL;
      const next = cur + Math.sign(sp - cur) * Math.min(Math.abs(sp - cur), acc * dt);
      let ang;
      if (len === 0) ang = Math.atan2(this.vx, this.vz);
      else if (cur < 1.5) ang = Math.atan2(mx, mz); // с места — сразу в нужную сторону
      else {
        // Разворот по дуге: направление скорости поворачивается с ограниченной скоростью.
        const a0 = Math.atan2(this.vx, this.vz), d = wrap(Math.atan2(mx, mz) - a0);
        const turn = (this.grounded ? (sprint ? SPRINT_TURN : TURN) : 2) * dt;
        ang = a0 + Math.max(-turn, Math.min(turn, d));
      }
      this.vx = Math.sin(ang) * next;
      this.vz = Math.cos(ang) * next;
    }
    // Выносливость: спринт тратит, отдых восстанавливает; выдохся — бежит медленнее, пока не отдышится.
    if (sprint) this.stamina = Math.max(0, this.stamina - DRAIN * dt);
    else this.stamina = Math.min(1, this.stamina + REGEN * (sp === 0 ? 1.6 : 1) * dt);
    if (this.stamina <= 0) this.tired = true;
    else if (this.tired && this.stamina > 0.35) this.tired = false;

    const ox = p.x, oz = p.z;
    p.x += (this.vx + this.kx) * dt;
    p.z += (this.vz + this.kz) * dt;
    const kd = this.grounded ? Math.max(0, 1 - 5 * dt) : Math.max(0, 1 - 0.5 * dt);
    this.kx *= kd; this.kz *= kd;
    if (resolveCircle(p, this.radius, colliders, p.y) && dt > 0) {
      // Упёрлись в стену: оставляем только реально пройденную скорость (скольжение вдоль стены).
      const ax = (p.x - ox) / dt - this.kx, az = (p.z - oz) / dt - this.kz;
      if (Math.hypot(ax, az) < Math.hypot(this.vx, this.vz)) { this.vx = ax; this.vz = az; }
    }
    const moveSpeed = Math.hypot(this.vx, this.vz);

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

    this.speed = moveSpeed;
    const aiming = pose.aiming || pose.spraying;
    if (!this.rolling) {
      // Корпус догоняет нужный курс плавно: при прицеливании — камеру, иначе — направление движения.
      let want = null;
      if (aiming) want = camYaw;
      else if (moveSpeed > 0.4) want = Math.atan2(this.vx, this.vz);
      if (want !== null) {
        const d = wrap(want - this.heading), rate = (aiming ? 18 : 12) * dt;
        this.heading += Math.max(-rate, Math.min(rate, d));
      }
    }
    this.mesh.rotation.y = this.heading;
    animateHuman(this.h, dt, {
      ...pose, speed: moveSpeed, run: moveSpeed > 7.2 && !this.rolling, air: !this.grounded,
      roll: this.rolling ? 1 - this.rollT / ROLL_TIME : 0,
    });
  }
}
