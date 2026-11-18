import * as THREE from 'three';
import { roadCoord, N } from './city.js';
import { sfx } from './audio.js'; // [v3-audio]

// Уникальные прыжки: трамплины на дорогах. Въехал на скорости — полёт с замедлением,
// кинокамерой сбоку и надписью «ВИРУСНЫЙ РОЛИК! N млн просмотров · Охваты +».

const LEN = 9, WIDTH = 6, HEIGHT = 1.8, MIN_SPEED = 14;

export class Stunts {
  constructor(scene, state) {
    this.state = state;
    this.ramps = [];
    this.done = 0;
    this.active = null;
    const mat = new THREE.MeshStandardMaterial({ color: 0xe0a020, roughness: 0.7 });
    const stripe = new THREE.MeshBasicMaterial({ color: 0x111111 });
    // Трамплины: у эстакады ТТК (запад, на север), на набережной (юг, на восток), на севере (на запад).
    const spots = [
      { x: roadCoord(0) + 3, z: roadCoord(4) + 27, dir: [0, -1] },
      { x: roadCoord(2) + 27, z: roadCoord(N) + 3, dir: [1, 0] },
      { x: roadCoord(4) + 27, z: roadCoord(0) - 3, dir: [-1, 0] },
    ];
    for (const s of spots) {
      // Клин: наклонная плита, начало на земле, кромка на высоте HEIGHT.
      const g = new THREE.Group();
      const slope = Math.atan2(HEIGHT, LEN);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, 0.3, Math.hypot(LEN, HEIGHT)), mat);
      plate.rotation.x = -slope;
      plate.position.set(0, HEIGHT / 2, 0);
      plate.castShadow = plate.receiveShadow = true;
      g.add(plate);
      for (const x of [-WIDTH / 2 + 0.4, WIDTH / 2 - 0.4]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, Math.hypot(LEN, HEIGHT)), stripe);
        st.rotation.x = -slope;
        st.position.set(x, HEIGHT / 2 + 0.02, 0);
        g.add(st);
      }
      const support = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, HEIGHT, 0.4), mat);
      support.position.set(0, HEIGHT / 2, LEN / 2 - 0.2);
      g.add(support);
      g.position.set(s.x, 0, s.z);
      g.rotation.y = Math.atan2(s.dir[0], s.dir[1]);
      scene.add(g);
      this.ramps.push({ ...s, mesh: g });
    }
    // Крупная надпись (свой элемент, чтобы не зависеть от HUD).
    const st = document.createElement('style');
    st.textContent = `#stunt{position:fixed;left:50%;top:30%;transform:translate(-50%,-50%) scale(.6);opacity:0;pointer-events:none;
      text-align:center;font:900 44px 'Russo One','Arial Black',sans-serif;color:#ffb627;text-shadow:3px 3px 0 #000,-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000;
      transition:opacity .25s,transform .25s;white-space:nowrap}
      #stunt small{display:block;font-size:20px;color:#fff;margin-top:8px}
      #stunt.show{opacity:1;transform:translate(-50%,-50%) scale(1)}`;
    document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.id = 'stunt';
    document.body.appendChild(this.el);
  }

  // Машина на трамплине: поднимаем по клину, на кромке — запуск.
  update(dt, car, onLanded) {
    if (!car) return;
    if (this.active) {
      if (car.airborne) {
        // Кинокамера: сбоку от траектории, чуть позади.
        const p = car.position, side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
        const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
        this.state.camOverride = {
          pos: p.clone().addScaledVector(side, 12).addScaledVector(fwd, -4).setY(p.y + 3),
          look: p.clone().addScaledVector(fwd, 4),
        };
        return;
      }
      this.finish(onLanded);
      return;
    }
    if (car.airborne) return;
    for (const r of this.ramps) {
      const dx = car.position.x - r.x, dz = car.position.z - r.z;
      const along = dx * r.dir[0] + dz * r.dir[1] + LEN / 2; // 0 у основания, LEN у кромки
      const lateral = Math.abs(dx * r.dir[1] - dz * r.dir[0]);
      if (lateral > WIDTH / 2 || along < 0 || along > LEN) continue;
      const vAlong = car.speed * (Math.sin(car.heading) * r.dir[0] + Math.cos(car.heading) * r.dir[1]);
      car.position.y = (along / LEN) * HEIGHT;
      if (along > LEN * 0.85 && vAlong > MIN_SPEED) {
        car.launch(car.speed * 0.32 + 3);
        sfx.play('whoosh'); // [v3-audio]
        this.active = { t: 0 };
        this.state.timeScale = 0.35;
      }
      return;
    }
    if (car.position.y > 0 && !car.airborne) car.position.y = 0;
  }

  finish(onLanded) {
    this.active = null;
    this.state.timeScale = 1;
    this.state.camOverride = null;
    this.done++;
    const views = (0.8 + Math.random() * 2.2).toFixed(1).replace('.', ',');
    this.el.innerHTML = `ВИРУСНЫЙ РОЛИК!<small>${views} млн просмотров · Охваты +15</small>`;
    this.el.classList.add('show');
    sfx.play('viral'); // [v3-audio]
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => this.el.classList.remove('show'), 2600);
    onLanded?.();
  }
}
