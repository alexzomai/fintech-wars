import * as THREE from 'three';
import { BANKS, N, roadCoord, setOwner, resolveCircle, roadPointNear } from './city.js';
import { makeHuman, animateHuman } from './humans.js';
import { makeCarMesh } from './car.js';

// Союзные отряды «Сбережёнки»: бригады пиарщиков сами штурмуют соседние районы.
// Цикл: штаб → микроавтобус → высадка → баллончики + перестрелка с промоутерами → район наш или отступление.
const VAN_SPEED = 16;
const ALLY_HP = 75;
const COOLDOWN = 60;          // после отступления/победы — новый отряд через минуту
const SPRAY_T = 14;           // сек на тег без игрока (с игроком вдвое быстрее)
const FIRE_CD = 1.4, FIRE_RANGE = 26, ALLY_DMG = 10;
const HELP_R = 60;            // игрок «рядом», если ближе к центру района
const _v = new THREE.Vector3();

const near = (a, b) => a.minX <= b.maxX + 2 && b.minX <= a.maxX + 2 && a.minZ <= b.maxZ + 2 && b.minZ <= a.maxZ + 2;
// Ближайший перекрёсток дорог.
const snap = (p) => {
  const i = Math.max(0, Math.min(N, Math.round((p.x - roadCoord(0)) / (roadCoord(1) - roadCoord(0)))));
  const j = Math.max(0, Math.min(N, Math.round((p.z - roadCoord(0)) / (roadCoord(1) - roadCoord(0)))));
  return new THREE.Vector3(roadCoord(i), 0, roadCoord(j));
};

export class Squads {
  constructor({ scene, war, enemies, graffiti, hud, fx, colliders }) {
    Object.assign(this, { scene, war, enemies, graffiti, hud, fx, colliders });
    this.list = [];
    this.launchT = 20; // первый отряд — через 20 с после старта
    this.timeMul = 1;  // для тестов
  }

  get max() { return Math.min(3, Math.floor(this.war.count('green') / 2)); }

  hq() {
    const d = this.war.districts.find((x) => x.owner === 'green' && x.hq) || this.war.districts.find((x) => x.owner === 'green');
    return d ? d.zone : null;
  }

  targets() { return new Set(this.list.map((s) => s.d)); }

  // Слабейший соседний чужой район (меньше всего чужих тегов и охраны).
  pickTarget() {
    const busy = this.targets();
    const mine = this.war.districts.filter((d) => d.owner === 'green');
    const cand = this.war.districts.filter((d) => d.owner !== 'green' && !busy.has(d) && this.war.capture?.d !== d
      && mine.some((m) => near(m, d)));
    if (!cand.length) return null;
    const weight = (d) => this.graffiti.inDistrict(d).filter((t) => t.owner !== 'green').length
      + this.enemies.alive((e) => e.tag === `guard:${d.k}`).length;
    return cand.sort((a, b) => weight(a) - weight(b))[0];
  }

  update(dt, actorPos) {
    dt *= this.timeMul;
    const w = this.war;
    // Защита наших районов при контратаке, пока игрок далеко.
    const k = w.counter;
    if (k && actorPos.distanceTo(k.d.zone) > 40 && !this.list.some((s) => s.mode === 'defend') && this.list.length < Math.max(1, this.max)) {
      this.launch(k.d, 'defend');
    }
    this.launchT -= dt;
    if (this.launchT <= 0) {
      this.launchT = 5;
      if (this.list.filter((s) => s.mode === 'attack').length < this.max) {
        const d = this.pickTarget();
        if (d) { this.launch(d, 'attack'); this.launchT = COOLDOWN; }
      }
    }
    for (const s of [...this.list]) this.updateSquad(s, dt, actorPos);
  }

  launch(d, mode) {
    const home = this.hq();
    if (!home) return;
    const van = makeCarMesh(BANKS.green.color);
    van.scale.set(1.15, 1.35, 1.25); // «Сбережёнка-мобиль»: повыше и подлиннее легковушки
    const a = snap(home), b = snap(d.zone);
    const path = [a, new THREE.Vector3(b.x, 0, a.z), b];
    van.position.copy(a);
    this.scene.add(van);
    const s = { d, mode, van, path, seg: 1, state: 'drive', men: [], t: 0, tag: `squad:${d.k}` };
    this.list.push(s);
    this.hud.alert(mode === 'defend' ? `Бригада Сбережёнки едет защищать: ${d.name}` : `Бригада Сбережёнки штурмует: ${d.name}`, BANKS.green.css);
  }

  deploy(s) {
    s.state = 'fight';
    const n = 4 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const spray = s.mode === 'attack' && i < 2;
      const h = makeHuman({ accent: BANKS.green.color, jacket: spray ? 0x2ecc59 : 0x1f6b3a, cap: true });
      h.root.position.copy(s.van.position).add(new THREE.Vector3((i - 2) * 1.2, 0, 2.5));
      this.scene.add(h.root);
      s.men.push({ h, position: h.root.position, hp: ALLY_HP, spray, cd: Math.random(), goal: null, tag: null, speed: 0, dead: false, deadT: 0 });
    }
    if (s.mode === 'attack') {
      // Район поднимает промоутеров: 3–5 на месте + подкрепление.
      const def = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < def; i++) this.war.spawnFighter(roadPointNear(s.d.zone, 4, 22), s.d.owner, { tag: s.tag });
      s.reinfT = 25;
    }
  }

  foes(s) {
    if (s.mode === 'defend') return this.enemies.alive((e) => e.tag === `counter:${s.d.k}`);
    return this.enemies.alive((e) => e.tag === s.tag || e.tag === `guard:${s.d.k}` || e.tag === this.war.capture?.tag && this.war.capture?.d === s.d);
  }

  updateSquad(s, dt, actorPos) {
    if (s.state === 'drive') {
      const to = s.path[s.seg];
      _v.subVectors(to, s.van.position);
      const len = _v.length(), step = VAN_SPEED * dt;
      if (len > 0.01) s.van.rotation.y = Math.atan2(_v.x, _v.z);
      if (len <= step) { s.van.position.copy(to); if (++s.seg >= s.path.length) this.deploy(s); }
      else s.van.position.addScaledVector(_v, step / len);
      return;
    }
    if (s.state === 'leave') {
      s.t += dt;
      s.van.position.y = 0;
      if (s.t > 8) this.remove(s);
      this.animateMen(s, dt);
      return;
    }
    // Бой. Игрок рядом — бригада работает вдвое быстрее.
    const boost = actorPos.distanceTo(s.d.zone) < HELP_R ? 2 : 1;
    const foes = this.foes(s);
    if (s.mode === 'attack' && s.d.owner === 'green') return this.finish(s, true); // район взял игрок
    if (s.mode === 'defend' && (!this.war.counter || this.war.counter.d !== s.d) && !foes.length) return this.finish(s, true);

    if (s.mode === 'attack') {
      s.reinfT -= dt;
      if (s.reinfT <= 0) {
        s.reinfT = 25;
        if (foes.length < 6) this.war.spawnFighter(roadPointNear(s.d.zone, 25, 45), s.d.owner, { tag: s.tag, aggro: true });
      }
    }
    const left = this.graffiti.inDistrict(s.d).filter((t) => t.owner !== 'green');
    for (const m of s.men) {
      if (m.dead) continue;
      m.goal = null;
      // Ближайший враг.
      let foe = null, fd = Infinity;
      for (const e of foes) { const d = e.position.distanceTo(m.position); if (d < fd) { fd = d; foe = e; } }
      if (m.spray && left.length) {
        if (!m.tag || m.tag.owner === 'green') m.tag = left.find((t) => !s.men.some((o) => o !== m && o.tag === t)) || left[0];
        m.goal = m.tag.pos.clone().addScaledVector(m.tag.normal, 2.2).setY(0);
        if (m.position.distanceTo(m.goal) < 1.5) {
          m.goal = null;
          m.sprayT = (m.sprayT || 0) + dt * boost;
          if (Math.random() < dt * 6) this.fx.spark(m.tag.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5), 0)), BANKS.green.color, 0.25);
          m.h.root.rotation.y = Math.atan2(-m.tag.normal.x, -m.tag.normal.z);
          if (m.sprayT >= SPRAY_T) { m.sprayT = 0; this.graffiti.setTag(m.tag, 'green'); m.tag = null; }
        }
      } else if (foe) {
        if (fd > 16) m.goal = foe.position.clone();
        m.h.root.rotation.y = Math.atan2(foe.position.x - m.position.x, foe.position.z - m.position.z);
        m.cd -= dt * boost;
        if (m.cd <= 0 && fd < FIRE_RANGE) {
          m.cd = FIRE_CD + Math.random() * 0.6;
          const from = m.position.clone().setY(1.6), hit = Math.random() < 0.45;
          const to = foe.position.clone().setY(1.3);
          if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() - 0.3, (Math.random() - 0.5) * 3));
          this.fx.tracer(from, to, 0x7dffa0);
          m.h.recoil = 1;
          if (hit && this.enemies.damage(foe, ALLY_DMG)) this.war.addMoney?.(5);
        }
      } else if (m.spray === false && s.mode === 'attack') {
        m.goal = s.d.zone.clone(); // зачистка: идём к центру района
      }
      this.move(m, dt);
    }
    // Враги отвечают: каждый промоутер рядом постреливает по бригаде.
    for (const e of foes) {
      e.allyCd = (e.allyCd ?? Math.random() * 1.5) - dt;
      if (e.allyCd > 0) continue;
      e.allyCd = 1.5 + Math.random();
      let tgt = null, td = 30;
      for (const m of s.men) { if (m.dead) continue; const d = m.position.distanceTo(e.position); if (d < td) { td = d; tgt = m; } }
      if (!tgt) continue;
      // Если игрок ближе — враг занят игроком.
      if (actorPos.distanceTo(e.position) < td && e.aggro) continue;
      const hit = Math.random() < 0.35;
      const to = tgt.position.clone().setY(1.3);
      if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() - 0.3, (Math.random() - 0.5) * 3));
      this.fx.tracer(e.position.clone().setY(1.6), to, BANKS[e.bank].color);
      e.h.root.rotation.y = Math.atan2(tgt.position.x - e.position.x, tgt.position.z - e.position.z);
      if (hit) { tgt.hp -= (e.boss ? 14 : 8) / boost; tgt.h.hitT = 1; if (tgt.hp <= 0) tgt.dead = true; }
    }
    this.animateMen(s, dt);

    const alive = s.men.filter((m) => !m.dead);
    if (!alive.length) return this.finish(s, false);
    if (s.mode === 'attack' && !left.length && !foes.length) {
      setOwner(s.d, 'green');
      this.enemies.alive((e) => e.tag === `guard:${s.d.k}`).forEach((e) => this.enemies.kill(e));
      this.war.onCaptured?.(s.d);
      this.finish(s, true);
    }
    // Без тегов спрейеры берут оружие.
    if (!left.length) alive.forEach((m) => { m.spray = false; });
  }

  move(m, dt) {
    m.speed = 0;
    if (!m.goal) return;
    _v.subVectors(m.goal, m.position).setY(0);
    const len = _v.length();
    if (len < 0.5) return;
    const sp = 4;
    m.position.addScaledVector(_v, Math.min(len, sp * dt) / len);
    m.h.root.rotation.y = Math.atan2(_v.x, _v.z);
    m.speed = sp;
    resolveCircle(m.position, 0.5, this.colliders);
  }

  animateMen(s, dt) {
    for (const m of s.men) {
      if (m.dead) {
        m.deadT += dt;
        m.h.root.rotation.x = Math.max(-Math.PI / 2, -m.deadT * m.deadT * 14);
        animateHuman(m.h, dt, { speed: 0, crouch: Math.min(1, m.deadT * 2) });
        if (m.deadT > 4) m.h.root.visible = false;
        continue;
      }
      animateHuman(m.h, dt, { speed: m.speed, aiming: true });
    }
  }

  finish(s, win) {
    if (s.state === 'leave') return;
    s.state = 'leave';
    s.t = 0;
    s.win = win;
    // Оставшиеся промоутеры штурма становятся охраной района.
    this.enemies.alive((e) => e.tag === s.tag).forEach((e) => { e.tag = `guard:${s.d.k}`; });
    if (s.mode === 'defend') this.hud.toast(win ? `Бригада отбила ${s.d.name}` : 'Бригада отступила — нужна помощь!', win ? BANKS.green.css : '#ff6b6b');
    else if (win) this.hud.alert(`Бригада взяла ${s.d.name}! Район наш`, BANKS.green.css);
    else this.hud.alert('Бригада отступила — нужна помощь!', '#ff6b6b');
    if (!win && s.mode === 'attack') this.launchT = Math.max(this.launchT, COOLDOWN);
  }

  remove(s) {
    this.scene.remove(s.van);
    for (const m of s.men) this.scene.remove(m.h.root);
    this.list.splice(this.list.indexOf(s), 1);
  }

  // Живые союзники (для маркеров).
  allies() { return this.list.flatMap((s) => s.men.filter((m) => !m.dead)); }

  // Зелёные квадратики на радаре: та же проекция, что в hud.drawMap (масштаб 0.75, поворот по камере).
  drawRadar(ctx, center, yaw) {
    const W = ctx.canvas.width, H = ctx.canvas.height, sc = 0.75, R = W / 2 - 5;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const pts = [...this.allies().map((m) => [m.position, 3]), ...this.list.filter((s) => s.state !== 'leave').map((s) => [s.van.position, 4.5])];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [p, r] of pts) {
      const dx = p.x - center.x, dz = p.z - center.z;
      const x = W / 2 - sc * c * dx + sc * sn * dz, y = H / 2 - sc * sn * dx - sc * c * dz;
      if (Math.hypot(x - W / 2, y - H / 2) > R) continue;
      ctx.fillStyle = BANKS.green.css;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.strokeRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}
