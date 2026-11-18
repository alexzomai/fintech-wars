import { N, roadCoord } from './city.js';
import { makeCarMesh } from './car.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const COLORS = [0x4d8dff, 0xffc94d, 0x5ad17a, 0xffffff, 0x9b6bff, 0x333333, 0xff8a3d];

// NPC-машины едут от перекрёстка к перекрёстку по правой полосе.
export class Traffic {
  constructor(scene, count = 18) {
    this.cars = [];
    for (let n = 0; n < count; n++) {
      const mesh = makeCarMesh(COLORS[n % COLORS.length]);
      scene.add(mesh);
      const car = { mesh, i: 1 + Math.floor(Math.random() * (N - 1)), j: 1 + Math.floor(Math.random() * (N - 1)), t: Math.random(), speed: 10 + Math.random() * 6, radius: 1.9 };
      car.dir = DIRS[Math.floor(Math.random() * 4)];
      this.pickNext(car);
      this.cars.push(car);
    }
  }

  pickNext(car) {
    const options = DIRS.filter(([dx, dz]) => {
      if (dx === -car.dir[0] && dz === -car.dir[1]) return false; // без разворотов
      const ni = car.i + dx, nj = car.j + dz;
      return ni >= 0 && ni <= N && nj >= 0 && nj <= N;
    });
    car.dir = options.length ? options[Math.floor(Math.random() * options.length)] : [-car.dir[0], -car.dir[1]];
  }

  update(dt, obstacles) {
    for (const car of this.cars) {
      // Тормозим, если впереди препятствие (игрок, другая машина).
      const p = car.mesh.position;
      const fwdX = car.dir[0], fwdZ = car.dir[1];
      let blocked = false;
      for (const o of obstacles) {
        if (o === car) continue;
        const op = o.position || o.mesh.position;
        const dx = op.x - p.x, dz = op.z - p.z;
        const ahead = dx * fwdX + dz * fwdZ;
        const side = Math.abs(dx * -fwdZ + dz * fwdX);
        if (ahead > 0 && ahead < 8 && side < 2.5) { blocked = true; break; }
      }
      const target = blocked ? 0 : 14;
      car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), 25 * dt);

      car.t += (car.speed * dt) / (roadCoord(1) - roadCoord(0));
      if (car.t >= 1) {
        car.i += car.dir[0];
        car.j += car.dir[1];
        car.t -= 1;
        this.pickNext(car);
      }
      const x = roadCoord(car.i) + car.dir[0] * car.t * (roadCoord(1) - roadCoord(0));
      const z = roadCoord(car.j) + car.dir[1] * car.t * (roadCoord(1) - roadCoord(0));
      // Правая полоса: смещение перпендикулярно направлению.
      p.set(x - fwdZ * 3, 0, z + fwdX * 3);
      const targetYaw = Math.atan2(fwdX, fwdZ);
      let diff = targetYaw - car.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      car.mesh.rotation.y += diff * Math.min(1, dt * 8);
    }
  }

  // Угон: забираем ближайшую NPC-машину в радиусе r (меш остаётся в сцене).
  takeNearest(pos, r) {
    let best = null, bd = r;
    for (const car of this.cars) {
      const d = car.mesh.position.distanceTo(pos);
      if (d < bd) { bd = d; best = car; }
    }
    if (best) this.cars.splice(this.cars.indexOf(best), 1);
    return best;
  }

  // Столкновение игрока (круг) с трафиком.
  collide(body) {
    let hit = false;
    for (const car of this.cars) {
      const p = car.mesh.position, b = body.position;
      const dx = b.x - p.x, dz = b.z - p.z;
      const d = Math.hypot(dx, dz);
      const r = car.radius + body.radius;
      if (d < r && d > 1e-4) {
        b.x = p.x + (dx / d) * r;
        b.z = p.z + (dz / d) * r;
        hit = true;
      }
    }
    return hit;
  }
}

