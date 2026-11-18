import * as THREE from 'three';
import { BANKS, setOwner, roadPointNear } from './city.js';

// Баланс захвата (SA): 2 волны, следующая — когда остался 1 враг.
const WAVES = [3, 5];
const NEED_TAGS = 2, NEED_KILLS = 2;
const HP = 30, BOSS_HP = 150;
const STUCK_T = 10;
const _frustum = new THREE.Frustum(), _m = new THREE.Matrix4();
export const MATCH_TIME = 8 * 60;

// Логика войны за районы: захват волнами, доход, контратаки, ИИ против ИИ, охрана.
export class War {
  constructor({ districts, enemies, hud, graffiti, onWin, onLose }) {
    Object.assign(this, { districts, enemies, hud, graffiti, onWin, onLose });
    this.money = 0;
    this.reach = 0; // «Охваты»
    this.time = MATCH_TIME;
    this.capture = null; // { d, wave, waitT }
    this.counter = null; // { d, bank, timeLeft }
    this.incomeT = 10;
    this.counterT = 90;
    this.aiT = 60;
    this.guardT = 0;
    this.over = false;
    this.kills = {}; // вырубленные промоутеры по району: { k: n }
  }

  count(bank) { return this.districts.filter((d) => d.owner === bank).length; }

  addMoney(v) { this.money = Math.max(0, Math.round(this.money + v)); this.hud.setMoney(this.money); }

  update(dt, actorPos, alive) {
    if (this.over) return;
    this.time -= dt;
    this.hud.setMatchTimer(this.time);
    this.hud.setScore(this.count('green'), this.count('red'), this.count('yellow'));

    this.incomeT -= dt;
    if (this.incomeT <= 0) {
      this.incomeT = 10;
      const g = this.count('green');
      if (g) { this.addMoney(50 * g); this.hud.income(50 * g); }
    }

    this.countKills();
    this.updateGuards(dt, actorPos);
    this.updateStuck(dt, actorPos);
    this.updateCapture(dt, actorPos, alive);
    this.updateCounter(dt, actorPos);
    this.updateAiWar(dt);
    this.squads?.update(dt, actorPos); // союзные бригады (squads.js)

    const g = this.count('green');
    if (g === this.districts.length) return this.finish('win');
    if (g === 0) return this.finish('lose');
    if (this.time <= 0) return this.finish('time');
    this.updateStatus(actorPos);
  }

  finish(kind) {
    this.over = true;
    if (kind === 'lose') this.onLose(); else this.onWin(kind);
  }

  // По 2 охранника на каждом чужом районе, добираем раз в 20 с, если игрок далеко.
  updateGuards(dt, actorPos) {
    this.guardT -= dt;
    if (this.guardT > 0) return;
    this.guardT = 20;
    for (const d of this.districts) {
      if (d.owner === 'green' || this.capture?.d === d || this.counter?.d === d) continue;
      if (actorPos.distanceTo(d.zone) < 60) continue;
      const tag = `guard:${d.k}`;
      const have = this.enemies.alive((e) => e.tag === tag).length;
      for (let n = have; n < 2; n++) this.spawnFighter(roadPointNear(d.zone, 4, 14), d.owner, { tag });
    }
  }

  // --- Захват («поглощение») ---
  // Правило SA: перекрашено ≥ 2 тегов и вырублено ≥ 2 промоутера района → война стартует сама.
  updateCapture(dt, actorPos, alive) {
    if (!this.capture) {
      if (!alive || this.counter) return;
      const d = this.districtAt(actorPos);
      if (d && d.owner !== 'green' && this.warReady(d)) this.startCapture(d, actorPos);
      return;
    }
    const c = this.capture;
    if (!alive || actorPos.distanceTo(c.d.zone) > 90) {
      this.hud.toast('Поглощение сорвано', '#ff6b6b');
      this.enemies.alive((e) => e.tag === c.tag).forEach((e) => { e.tag = `guard:${c.d.k}`; });
      this.kills[c.d.k] = 0;
      this.capture = null;
      return;
    }
    if (c.waitT > 0) {
      c.waitT -= dt;
      if (c.waitT <= 0) this.spawnWave(actorPos);
      return;
    }
    const left = this.enemies.alive((e) => e.tag === c.tag).length;
    // Следующая волна — сразу, как только остался один враг.
    if (c.wave < WAVES.length) {
      if (left <= 1) this.spawnWave(actorPos);
      return;
    }
    if (left > 0) return;
    // Все волны отбиты — район наш.
    const from = c.d.owner;
    setOwner(c.d, 'green');
    this.enemies.alive((e) => e.tag === `guard:${c.d.k}`).forEach((e) => this.enemies.kill(e));
    this.addMoney(300);
    this.hud.toast(`${c.d.name} — наш! −1 ${BANKS[from].name}`, BANKS.green.css);
    this.capture = null;
    this.onCaptured?.(c.d);
  }

  startCapture(d, actorPos) {
    this.capture = { d, wave: 0, waitT: 1, tag: `capture:${d.k}`, t0: this.time };
    // Охрана района вступает в бой.
    this.enemies.alive((e) => e.tag === `guard:${d.k}`).forEach((e) => { e.aggro = true; e.tag = this.capture.tag; });
    this.hud.alert(`Поглощение: ${d.name}!`, BANKS[d.owner].css);
  }

  spawnWave(actorPos) {
    const c = this.capture;
    const n = WAVES[c.wave];
    c.wave++;
    for (let i = 0; i < n; i++) {
      const boss = c.wave === WAVES.length && i === 0;
      this.spawnFighter(roadPointNear(actorPos, 20, 30), c.d.owner, { tag: c.tag, aggro: true, boss });
    }
    this.hud.toast(c.wave === WAVES.length ? `Волна ${c.wave}: Региональный директор!` : `Волна ${c.wave}/${WAVES.length}`, BANKS[c.d.owner].css);
  }

  // Спавн с балансом HP (enemies.js не трогаем: правим поля после spawn).
  spawnFighter(pos, bank, opts) {
    const e = this.enemies.spawn(pos, bank, opts);
    e.hp = e.maxHp = opts?.boss ? BOSS_HP : HP;
    return e;
  }

  // Вырубленные промоутеры: охрана района или бойцы его банка на его территории.
  countKills() {
    for (const e of this.enemies.list) {
      if (!e.dead || e.counted) continue;
      e.counted = true;
      const d = e.tag?.startsWith('guard:') ? this.districts.find((x) => `guard:${x.k}` === e.tag) : this.districtAt(e.position);
      if (d && d.owner === e.bank && d.owner !== 'green') this.kills[d.k] = (this.kills[d.k] || 0) + 1;
    }
  }

  // Враг войны, который 10 с не приблизился к игроку, телепортируется ближе: на дорогу, вне кадра.
  updateStuck(dt, actorPos) {
    const tags = [this.capture?.tag, this.counter?.tag].filter(Boolean);
    if (!tags.length) return;
    for (const e of this.enemies.alive((x) => tags.includes(x.tag))) {
      const dist = e.position.distanceTo(actorPos);
      if (e.bestD === undefined || dist < e.bestD - 1) { e.bestD = dist; e.stuckT = 0; continue; }
      if (dist < 20) { e.stuckT = 0; continue; }
      e.stuckT += dt;
      if (e.stuckT < STUCK_T) continue;
      e.stuckT = 0;
      let p = null;
      for (let i = 0; i < 12 && !p; i++) { const q = roadPointNear(actorPos, 15, 20); if (!this.inView(q)) p = q; }
      if (!p) continue;
      e.position.copy(p);
      e.home?.copy(p);
      e.bestD = p.distanceTo(actorPos);
      e.aggro = true;
    }
  }

  inView(p) {
    const cam = this.camera;
    if (!cam) return false;
    _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m);
    return _frustum.containsPoint(new THREE.Vector3(p.x, 1.2, p.z));
  }

  districtAt(p) {
    return this.districts.find((d) => p.x >= d.minX && p.x < d.maxX && p.z >= d.minZ && p.z < d.maxZ) || null;
  }

  warInfo(d) {
    return { tags: this.graffiti.greenCount(d), kills: this.kills[d.k] || 0 };
  }

  warReady(d) { const w = this.warInfo(d); return w.tags >= NEED_TAGS && w.kills >= NEED_KILLS; }

  // --- Контратаки на зелёные районы ---
  updateCounter(dt, actorPos) {
    if (!this.counter) {
      this.counterT -= dt;
      if (this.counterT > 0) return;
      this.counterT = 75;
      const mine = this.districts.filter((d) => d.owner === 'green');
      const attackers = ['red', 'yellow'].filter((b) => this.count(b) > 0);
      if (!mine.length || !attackers.length) return;
      const d = mine[Math.floor(Math.random() * mine.length)];
      const bank = attackers[Math.floor(Math.random() * attackers.length)];
      const tag = `counter:${d.k}`;
      for (let i = 0; i < 4; i++) this.spawnFighter(roadPointNear(d.zone, 3, 14), bank, { tag });
      this.counter = { d, bank, tag, timeLeft: 45 };
      this.hud.alert(`${BANKS[bank].name} атакует ваш район!`, BANKS[bank].css);
      return;
    }
    const c = this.counter;
    const left = this.enemies.alive((e) => e.tag === c.tag).length;
    if (left === 0) {
      this.hud.toast('Район отбит! +$200', BANKS.green.css);
      this.addMoney(200);
      this.counter = null;
      return;
    }
    // Пока игрок рядом и дерётся — таймер стоит.
    if (actorPos.distanceTo(c.d.zone) > 40) c.timeLeft -= dt;
    if (c.timeLeft <= 0) {
      setOwner(c.d, c.bank);
      this.enemies.alive((e) => e.tag === c.tag).forEach((e) => { e.tag = `guard:${c.d.k}`; });
      this.hud.alert(`Район потерян: теперь он у ${BANKS[c.bank].name}`, BANKS[c.bank].css);
      this.counter = null;
    }
  }

  // --- Красные и жёлтые воюют между собой: карта живёт сама ---
  updateAiWar(dt) {
    this.aiT -= dt;
    if (this.aiT > 0) return;
    this.aiT = 60;
    const busy = new Set(this.squads?.list.map((s) => s.d) || []);
    const targets = this.districts.filter((d) => d.owner !== 'green' && this.capture?.d !== d && !busy.has(d));
    if (!targets.length) return;
    const d = targets[Math.floor(Math.random() * targets.length)];
    const bank = d.owner === 'red' ? 'yellow' : 'red';
    if (this.count(bank) === 0) return;
    const prev = d.owner;
    this.enemies.alive((e) => e.tag === `guard:${d.k}`).forEach((e) => this.enemies.kill(e));
    setOwner(d, bank);
    this.hud.toast(`${BANKS[bank].name} поглотил район у ${BANKS[prev].name}`, BANKS[bank].css);
  }

  updateStatus(actorPos) {
    const c = this.capture, k = this.counter;
    let s = '';
    if (c) {
      const left = this.enemies.alive((e) => e.tag === c.tag).length;
      s = c.waitT > 0 ? `⚔️ Поглощение: готовься к волне 1/${WAVES.length}` : `⚔️ Поглощение: волна ${c.wave}/${WAVES.length} · врагов ${left}`;
    } else if (k) {
      s = `🚨 Защити район! ${Math.ceil(k.timeLeft)} с · врагов ${this.enemies.alive((e) => e.tag === k.tag).length}`;
    } else {
      // Подсказка зависит от района, в котором стоим.
      const here = this.districtAt(actorPos);
      if (here && here.owner !== 'green') {
        const w = this.warInfo(here);
        s = `${here.name}: перекрашено ${Math.min(w.tags, NEED_TAGS)}/${NEED_TAGS} · вырублено ${Math.min(w.kills, NEED_KILLS)}/${NEED_KILLS}. Баллончик [2], держи ЛКМ на теге`;
      } else {
        s = '🎯 Едь в чужой район: перекрась 2 тега и выруби 2 промоутеров — начнётся война';
      }
    }
    this.hud.setStatus(s);
    // Куда указывает стрелка: защита > текущий захват > ближайший чужой район.
    let target = k?.d.zone || c?.d.zone;
    if (!target) {
      let best = Infinity;
      for (const d of this.districts) {
        if (d.owner === 'green') continue;
        const dd = actorPos.distanceTo(d.zone);
        if (dd < best) { best = dd; target = d.zone; }
      }
    }
    this.target = target || null;
  }
}
