import * as THREE from 'three';
import { N, roadCoord, CELL, resolveCircle } from './city.js';
import { makeCarMesh } from './car.js';
import { makeHuman, animateHuman } from './humans.js';

// ФНС: налоговые «копы». Патрульные седаны ездят по сетке, тормозят NPC-трафик «на проверку»,
// гоняются за игроком с > $1000 и удерживают 13% НДФЛ. Не убивают.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STEP = CELL;
const TAX_RATE = 0.13;
const RICH = 1000;
const CHECK_TIME = 10;
const LINES_CHECK = ['Предъявите декларацию', 'А чек у вас есть?', 'Выездная проверка!', 'Откуда доходы, гражданин?'];
const LINES_CHASE = ['Стоять! Налоговая!', 'Гражданин, вы задолжали!', 'Остановитесь для уплаты НДФЛ!'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (s) => `<b style="color:#8fb8ff">ФНС:</b> ${s}`;

function sideTexture(flip) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1b3f8f'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 6); g.fillRect(0, 58, 256, 6);
  g.font = '700 36px "Russo One", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('НАЛОГИ', 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePatrolMesh() {
  const g = makeCarMesh(0x8a8f96);
  const tex = sideTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.62), mat);
    p.position.set(s * 1.11, 0.85, 0);
    p.rotation.y = s * Math.PI / 2;
    g.add(p);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  bar.position.set(0, 1.9, -0.3);
  g.add(bar);
  const sirens = [-0.4, 0.4].map((x) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0x1a3aff }));
    m.position.set(x, 2.05, -0.3);
    g.add(m);
    return m;
  });
  return { mesh: g, sirens };
}

function makeInspector() {
  const h = makeHuman({ jacket: 0x777c85, pants: 0x4a4e56, accent: 0x4d8dff, skin: 0xe0b48c });
  h.gun.visible = false;
  const folder = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.3), new THREE.MeshBasicMaterial({ color: 0xd9c27a }));
  folder.position.set(0, -0.12, 0.12);
  h.armR.hand.add(folder);
  h.armR.shoulder.rotation.x = -0.9;
  const o = { h, mode: 'in', target: null, speed: 3 };
  h.root.visible = false;
  return o;
}

export class Fns {
  // ctx: { scene, traffic, war, hud, input, getActor, colliders, state, count }
  constructor(ctx) {
    this.ctx = ctx;
    this.cars = [];
    this.taxCd = 0;
    this.wantedT = 0;
    this.lineCd = 0;
    this.time = 0;
    const count = ctx.count ?? 4;
    for (let n = 0; n < count; n++) {
      const { mesh, sirens } = makePatrolMesh();
      ctx.scene.add(mesh);
      const car = {
        mesh, sirens, radius: 1.9, speed: 0, state: 'patrol',
        i: 1 + Math.floor(Math.random() * (N - 1)), j: 1 + Math.floor(Math.random() * (N - 1)), t: Math.random(),
        dir: DIRS[Math.floor(Math.random() * 4)], cd: 3 + n * 3, inspectors: [makeInspector(), makeInspector()],
        npc: null, timer: 0, lost: 0, spoke: 0,
      };
      for (const ins of car.inspectors) ctx.scene.add(ins.h.root);
      this.pickNext(car);
      this.place(car, 0);
      this.cars.push(car);
    }
  }

  pickNext(car) {
    const opts = DIRS.filter(([dx, dz]) => {
      if (dx === -car.dir[0] && dz === -car.dir[1]) return false;
      const ni = car.i + dx, nj = car.j + dz;
      return ni >= 0 && ni <= N && nj >= 0 && nj <= N;
    });
    car.dir = opts.length ? pick(opts) : [-car.dir[0], -car.dir[1]];
  }

  place(car, dt) {
    const [fx, fz] = car.dir;
    const x = roadCoord(car.i) + fx * car.t * STEP, z = roadCoord(car.j) + fz * car.t * STEP;
    car.mesh.position.set(x - fz * 3, 0, z + fx * 3);
    const target = Math.atan2(fx, fz);
    this.turnTo(car, target, dt);
  }

  turnTo(car, target, dt) {
    let d = target - car.mesh.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    car.mesh.rotation.y += dt ? d * Math.min(1, dt * 8) : d;
  }

  say(html, near, ms = 3200) {
    if (this.lineCd > 0 || near > 45) return;
    this.lineCd = 2.5;
    this.ctx.hud.subtitle(html, ms);
  }

  setSiren(car, fast) {
    const ph = Math.floor(this.time * (fast ? 8 : 4)) % 2;
    car.sirens.forEach((m, k) => m.material.color.setHex(k === ph ? 0x6a9bff : 0x0a1470));
  }

  // Ставим инспекторов «у борта» и задаём цели.
  exitInspectors(car, targets) {
    const [fx, fz] = car.dir || [0, 1];
    const yaw = car.mesh.rotation.y;
    const lx = Math.cos(yaw), lz = -Math.sin(yaw); // вправо от курса
    car.inspectors.forEach((ins, k) => {
      const p = car.mesh.position;
      ins.h.root.position.set(p.x + lx * 2 + Math.sin(yaw) * (k ? -1 : 1), 0, p.z + lz * 2 + Math.cos(yaw) * (k ? -1 : 1));
      ins.h.root.visible = true;
      ins.mode = 'out';
      ins.target = targets[k] || targets[0];
    });
  }

  boardInspectors(car) {
    for (const ins of car.inspectors) { ins.mode = 'in'; ins.h.root.visible = false; ins.target = null; }
  }

  walk(ins, dt, speed = 3, target = ins.target, snapColliders = null) {
    const r = ins.h.root.position;
    const dx = target.x - r.x, dz = target.z - r.z, d = Math.hypot(dx, dz);
    let moved = 0;
    if (d > 0.4) {
      const s = Math.min(speed * dt, d);
      r.x += (dx / d) * s; r.z += (dz / d) * s;
      moved = speed;
      const yaw = Math.atan2(dx, dz);
      let a = yaw - ins.h.root.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
      ins.h.root.rotation.y += a * Math.min(1, dt * 10);
    }
    if (snapColliders) resolveCircle(r, 0.4, snapColliders);
    animateHuman(ins.h, dt, { speed: moved, run: speed > 4 });
    ins.h.armR.shoulder.rotation.x = -0.9; // папка в руке
    return d;
  }

  update(dt) {
    const { traffic, war, hud, getActor, colliders } = this.ctx;
    this.time += dt;
    this.lineCd -= dt; this.taxCd -= dt;
    if (this.wantedT > 0) { this.wantedT -= dt; if (this.wantedT <= 0) hud.setWanted(0); }
    const actor = getActor();
    const ap = actor.position;
    const onFoot = !this.ctx.getVehicle?.();
    const rich = war.money > RICH && this.taxCd <= 0;
    const wanted = this.wantedT > 0 && this.taxCd <= 0;

    this.checkAttack(actor, onFoot);

    for (const car of this.cars) {
      const p = car.mesh.position;
      const dActor = Math.hypot(ap.x - p.x, ap.z - p.z);
      car.cd -= dt;
      this.setSiren(car, car.state === 'chase');

      if (car.state === 'patrol' || car.state === 'pullover') this.drive(car, dt, actor, dActor);
      if (car.state === 'patrol' && car.cd <= 0) {
        // Охота на богатого игрока.
        if ((rich || wanted) && dActor < 45) {
          car.state = 'chase'; car.lost = 0; car.chaseT = 0;
          this.say(esc(pick(LINES_CHASE)), dActor);
        } else {
          const npc = this.findNpc(car);
          if (npc) { car.state = 'pullover'; car.npc = npc; }
        }
      }
      if (car.state === 'pullover') {
        const npc = car.npc;
        if (!traffic.cars.includes(npc) || (!npc.frozen && (npc.dir[0] !== car.dir[0] || npc.dir[1] !== car.dir[1]))) { car.state = 'patrol'; car.cd = 6; }
        else {
          const dd = (npc.mesh.position.x - car.mesh.position.x) * car.dir[0] + (npc.mesh.position.z - car.mesh.position.z) * car.dir[1];
          if (dd < 11 && !npc.frozen) npc.frozen = { i: npc.i, j: npc.j, t: npc.t, pos: npc.mesh.position.clone(), rot: npc.mesh.rotation.y, dir: npc.dir };
        }
        if (npc.frozen && car.speed < 0.3 && car.state === 'pullover') {
          // Машина ФНС встала позади: инспекторы выходят, NPC замирает.
          car.state = 'check'; car.timer = CHECK_TIME;
          const q = npc.mesh.position, yaw = car.mesh.rotation.y;
          const lx = Math.cos(yaw), lz = -Math.sin(yaw);
          this.exitInspectors(car, [new THREE.Vector3(q.x + lx * 1.8 + Math.sin(yaw) * 1, 0, q.z + lz * 1.8 + Math.cos(yaw) * 1),
            new THREE.Vector3(q.x + lx * 1.8 - Math.sin(yaw) * 1.2, 0, q.z + lz * 1.8 - Math.cos(yaw) * 1.2)]);
          this.say(esc(LINES_CHECK[0]), dActor);
          car.spoke = 1;
        }
      }
      if (car.state === 'check') this.updateCheck(car, dt, dActor);
      if (car.state === 'chase') this.updateChase(car, dt, actor, dActor, onFoot, rich || wanted);
      if (car.state === 'tax') this.updateTax(car, dt);
      if (car.state === 'return') this.updateReturn(car, dt);

      // Машины не проходят сквозь игрока (кроме момента ареста).
      if (car.state !== 'tax') this.push(actor, car, dActor);
    }
    // NPC на проверке стоят на месте (после traffic.update в том же кадре).
    for (const npc of traffic.cars) {
      const f = npc.frozen;
      if (!f) continue;
      npc.i = f.i; npc.j = f.j; npc.t = f.t; npc.dir = f.dir; npc.speed = 0;
      npc.mesh.position.copy(f.pos); npc.mesh.rotation.y = f.rot;
    }
  }

  findNpc(car) {
    for (const npc of this.ctx.traffic.cars) {
      if (npc.frozen) continue;
      if (npc.dir[0] !== car.dir[0] || npc.dir[1] !== car.dir[1]) continue;
      const dx = npc.mesh.position.x - car.mesh.position.x, dz = npc.mesh.position.z - car.mesh.position.z;
      const ahead = dx * car.dir[0] + dz * car.dir[1];
      const side = Math.abs(dx * -car.dir[1] + dz * car.dir[0]);
      if (ahead > 4 && ahead < 60 && side < 2.2) return npc;
    }
    return null;
  }

  // Езда по сетке; тормозим перед препятствием или за целью проверки.
  drive(car, dt, actor, dActor) {
    const p = car.mesh.position;
    const [fx, fz] = car.dir;
    let stop = false, follow = false;
    const check = (op, gap, lane) => {
      const dx = op.x - p.x, dz = op.z - p.z;
      const ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
      return ahead > 0 && ahead < gap && side < lane;
    };
    if (check(actor.position, 9, 2.6)) stop = true;
    for (const o of this.ctx.traffic.cars) {
      if (o === car.npc) { if (check(o.mesh.position, 7, 2.2)) stop = true; continue; }
      if (check(o.mesh.position, 8, 2.4)) stop = true;
    }
    if (car.state === 'pullover') follow = true;
    const target = stop ? 0 : follow ? 22 : 15;
    car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), (stop ? 40 : 22) * dt);
    car.t += (car.speed * dt) / STEP;
    if (car.t >= 1) {
      car.i += car.dir[0]; car.j += car.dir[1]; car.t -= 1;
      this.pickNext(car);
    }
    this.place(car, dt);
  }

  updateCheck(car, dt, dActor) {
    car.timer -= dt;
    const npc = car.npc;
    let arrived = true;
    for (const ins of car.inspectors) {
      if (ins.mode !== 'out') continue;
      const d = this.walk(ins, dt, 3, ins.target, this.ctx.colliders);
      if (d > 0.5) arrived = false;
      else if (npc?.mesh) { // смотрим на машину
        let a = Math.atan2(npc.mesh.position.x - ins.h.root.position.x, npc.mesh.position.z - ins.h.root.position.z) - ins.h.root.rotation.y;
        ins.h.root.rotation.y += Math.atan2(Math.sin(a), Math.cos(a)) * Math.min(1, dt * 6);
      }
    }
    if (car.spoke === 1 && car.timer < CHECK_TIME * 0.6) { car.spoke = 2; this.say(esc(LINES_CHECK[1]), dActor); }
    if (car.spoke === 2 && car.timer < CHECK_TIME * 0.25) { car.spoke = 3; this.say(esc(LINES_CHECK[2]), dActor); }
    if (car.timer <= 0) {
      if (npc) { npc.frozen = null; }
      car.npc = null;
      car.state = 'return';
    }
  }

  // Возвращение к машине после проверки (отдельное состояние, общее с «уезжают»).
  updateReturn(car, dt) {
    let done = true;
    for (const ins of car.inspectors) {
      if (ins.mode !== 'out') continue;
      const d = this.walk(ins, dt, 4, car.mesh.position);
      if (d > 1.6) done = false; else { ins.mode = 'in'; ins.h.root.visible = false; }
    }
    if (done) { this.boardInspectors(car); car.state = 'patrol'; car.cd = 18 + Math.random() * 10; car.speed = 0; this.snapToGrid(car); }
  }

  snapToGrid(car) {
    // Ближайший перекрёсток и случайное направление от него.
    const p = car.mesh.position;
    car.i = Math.max(0, Math.min(N, Math.round((p.x - roadCoord(0)) / STEP)));
    car.j = Math.max(0, Math.min(N, Math.round((p.z - roadCoord(0)) / STEP)));
    car.t = 0;
    this.pickNext(car);
  }

  updateChase(car, dt, actor, dActor, onFoot, still) {
    const p = car.mesh.position, ap = actor.position;
    car.chaseT = (car.chaseT || 0) + dt;
    const dx = ap.x - p.x, dz = ap.z - p.z;
    const d = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    const near = onFoot && d < 12;
    const target = near ? 0 : (d > 6 ? 19 : 8);
    car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), 30 * dt);
    this.turnTo(car, heading, dt * 1.2);
    const yaw = car.mesh.rotation.y;
    p.x += Math.sin(yaw) * car.speed * dt; p.z += Math.cos(yaw) * car.speed * dt;
    resolveCircle(p, car.radius, this.ctx.colliders);
    this.say(esc(pick(LINES_CHASE)), d, 2500);
    // Пешему игроку: инспекторы выходят и бегут.
    if (near && car.inspectors[0].mode === 'in') this.exitInspectors(car, [ap, ap]);
    for (const ins of car.inspectors) {
      if (ins.mode !== 'out') continue;
      ins.target = ap;
      this.walk(ins, dt, 6.2, ap, this.ctx.colliders);
      if (Math.hypot(ap.x - ins.h.root.position.x, ap.z - ins.h.root.position.z) < 1.6) return this.catchActor(car);
    }
    if (!onFoot && d < 4.6) return this.catchActor(car);
    // Если игрок сел в машину — инспекторы возвращаются в седан.
    if (!onFoot && car.inspectors[0].mode === 'out') this.boardInspectors(car);
    car.lost = d > 80 || (!still && car.chaseT > 4) ? car.lost + dt : 0;
    if (car.lost > 4) { this.boardInspectors(car); car.state = 'patrol'; car.cd = 20; car.speed = 0; this.snapToGrid(car); }
  }

  catchActor(car) {
    const { war, hud } = this.ctx;
    const fee = Math.round(war.money * TAX_RATE);
    if (fee > 0) war.addMoney(-fee);
    hud.subtitle(`<b style="color:#8fb8ff">НДФЛ удержан</b> · −$${fee}`, 4500);
    this.taxCd = 40;
    this.wantedT = 0; hud.setWanted(0);
    car.state = 'tax'; car.timer = 2.2;
    car.taxed = true;
  }

  updateTax(car, dt) {
    car.timer -= dt;
    for (const ins of car.inspectors) if (ins.mode === 'out') this.walk(ins, dt, 4.5, car.mesh.position);
    if (car.timer <= 0) { car.state = 'return'; }
    // 'return' обрабатывается ниже
  }

  push(actor, car, d) {
    if (d > car.radius + (actor.radius || 0.5) + 0.2) return;
    const a = actor.position, p = car.mesh.position;
    const dx = a.x - p.x, dz = a.z - p.z, dd = Math.hypot(dx, dz);
    if (dd < 1e-3) return;
    const r = car.radius + (actor.radius || 0.5);
    if (dd < r) { a.x = p.x + (dx / dd) * r; a.z = p.z + (dz / dd) * r; if (typeof actor.speed === 'number') actor.speed *= 0.6; }
  }

  // Нападение: удар кулаком, выстрел в сторону инспектора или таран.
  checkAttack(actor, onFoot) {
    const { camera, input, player, getWeapon } = this.ctx;
    const ap = actor.position;
    let hit = false;
    const fireGun = input.fire && ['pistol', 'smg', 'shotgun', 'rifle'].includes(getWeapon?.());
    const punch = onFoot && (player.h?.punchT || 0) > 0.8;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    for (const car of this.cars) {
      for (const ins of car.inspectors) {
        if (ins.mode !== 'out') continue;
        const r = ins.h.root.position;
        const dx = r.x - ap.x, dz = r.z - ap.z, d = Math.hypot(dx, dz);
        if (punch && d < 2.4) hit = true;
        if (!onFoot && d < 2.8 && Math.abs(actor.speed || 0) > 6) hit = true;
        if (fireGun && d < 40 && (dx * dir.x + dz * dir.z) / (d * Math.hypot(dir.x, dir.z) + 1e-6) > 0.985) hit = true;
      }
    }
    if (hit && this.wantedT <= 0) {
      this.ctx.hud.setWanted(3);
      this.ctx.hud.subtitle(esc('Нападение на инспектора! Это статья 198 УК!'), 4000);
    }
    if (hit) { this.wantedT = 25; this.taxCd = Math.min(this.taxCd, 0); }
  }

  // Тест/отладка: форсируем погоню ближайшего патруля.
  forceChase(i = 0) {
    const car = this.cars[i];
    car.state = 'chase'; car.chaseT = 0; car.lost = 0;
  }
}
