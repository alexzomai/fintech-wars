import { BANKS } from './city.js';
import { drawWeaponIcon } from './weapons.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Разметка подсказок: ~клавиша~ → выделенная клавиша.
const keys = (s) => esc(s).replace(/~([^~]+)~/g, '<kbd>$1</kbd>');

// Показ элемента на время: класс show + таймер.
function flash(el, ms, timers, key) {
  el.classList.add('show');
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => el.classList.remove('show'), ms);
}

// Канал сообщений одного типа: на экране не больше одного, новые встают в очередь.
// Одинаковые по смыслу (цифры не в счёт) не дублируются: обновляется текст.
const MIN_SHOW = 1600, MAX_QUEUE = 3, GAP = 280;
class Channel {
  constructor(el, render) { this.el = el; this.render = render; this.queue = []; this.log = []; this.cur = null; this.timer = 0; }
  push(content, ms, key = String(content).replace(/\d+/g, '#')) {
    this.log.push(String(Array.isArray(content) ? content[0] : content).replace(/<[^>]*>/g, ''));
    if (this.log.length > 30) this.log.shift();
    const m = { content, ms, key };
    if (this.cur && this.cur.key === key) { this.render(this.el, content); this.cur.content = content; this.schedule(Math.max(this.left(), ms * 0.6)); return; }
    if (!this.cur) return this.show(m);
    const i = this.queue.findIndex((q) => q.key === key);
    if (i >= 0) this.queue[i] = m; else this.queue.push(m);
    if (this.queue.length > MAX_QUEUE) this.queue.shift();
    // Есть очередь — текущее досиживает только минимальное время.
    this.schedule(Math.min(this.left(), Math.max(0, this.cur.start + MIN_SHOW - performance.now())));
  }
  show(m) {
    this.cur = { ...m, start: performance.now() };
    this.render(this.el, m.content);
    this.el.classList.add('show');
    this.schedule(this.queue.length ? MIN_SHOW : m.ms);
  }
  left() { return this.cur ? Math.max(0, this.cur.end - performance.now()) : 0; }
  schedule(ms) {
    clearTimeout(this.timer);
    this.cur.end = performance.now() + ms;
    this.timer = setTimeout(() => this.next(), ms);
  }
  next() {
    this.el.classList.remove('show');
    this.cur = null;
    const m = this.queue.shift();
    if (m) this.timer = setTimeout(() => { if (!this.cur) this.show(m); }, GAP);
  }
  get text() { return this.cur ? this.el.textContent : ''; }
}

// Интерфейс в духе классических GTA: блок справа сверху, радар, хелпбокс, субтитры, район/машина.
export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['hudClock', 'money', 'armor', 'armorFill', 'hpFill', 'weapon', 'weaponIcon', 'weaponAmmo', 'wanted',
      'help', 'subtitle', 'zoneName', 'carName', 'passed', 'speed', 'crosshair', 'sprayBar', 'reloadBar', 'arrow']) this.el[id] = $(id);
    this.map = $('minimap').getContext('2d');
    this.timers = {};
    this.money = 0;
    this.moneyShown = 0;
    this.statusKey = '';
    const html = (el, h) => { el.innerHTML = h; };
    this.ch = {
      help: new Channel(this.el.help, (el, t) => { el.innerHTML = keys(t); }),
      subtitle: new Channel(this.el.subtitle, html),
      district: new Channel(this.el.zoneName, (el, [name, color]) => { el.textContent = name; el.style.color = color; }),
    };
    this.setClock(18, 30);
    this.setWanted(0);
    this.setArmor(0);
  }

  // --- Правый верхний блок ---
  setClock(h, m) { this.el.hudClock.textContent = `${String(h).padStart(2, '0')}:${String(Math.floor(m)).padStart(2, '0')}`; }
  // Деньги «докручиваются» к новому значению.
  setMoney(v) {
    this.money = v;
    if (this.moneyRaf) return;
    const tick = () => {
      const d = this.money - this.moneyShown;
      if (Math.abs(d) < 1) { this.moneyShown = this.money; this.moneyRaf = 0; }
      else { this.moneyShown += Math.sign(d) * Math.max(1, Math.abs(d) * 0.12); this.moneyRaf = requestAnimationFrame(tick); }
      this.el.money.textContent = `$${String(Math.round(this.moneyShown)).padStart(8, '0')}`;
    };
    tick();
  }
  setHp(hp, max) { this.el.hpFill.style.width = `${Math.max(0, Math.min(1, hp / max)) * 100}%`; }
  setArmor(v, max = 100) {
    this.el.armor.style.display = v > 0 ? 'block' : 'none';
    this.el.armorFill.style.width = `${Math.max(0, Math.min(1, v / max)) * 100}%`;
  }
  // Звёзды «Проверки ЦБ»: до 6, пустые не показываем.
  setWanted(n) {
    n = Math.max(0, Math.min(6, Math.round(n)));
    if (this.wanted === n) return;
    this.wanted = n;
    this.el.wanted.textContent = '★'.repeat(n);
  }

  // --- Оружие ---
  setWeapon(def, ammo = '', reloading = false) {
    if (typeof def === 'string') def = { id: def, name: def };
    if (this.weaponId !== def.id) {
      this.weaponId = def.id;
      drawWeaponIcon(this.el.weaponIcon, def.id);
      this.el.weapon.title = def.name;
      this.el.weapon.classList.remove('swap'); void this.el.weapon.offsetWidth; this.el.weapon.classList.add('swap');
    }
    this.el.weaponAmmo.textContent = reloading ? '...' : ammo;
  }
  setReload(k) {
    const el = this.el.reloadBar;
    el.style.display = k == null ? 'none' : 'block';
    if (k != null) el.firstChild.style.width = `${Math.min(1, Math.max(0, k)) * 100}%`;
  }
  showWheel(items, sel, onHover) {
    const ring = $('wheelItems');
    ring.textContent = '';
    items.forEach((w, i) => {
      const a = (i / items.length) * Math.PI * 2;
      const it = document.createElement('div');
      it.className = 'wheelItem' + (w.empty ? ' empty' : '') + (w.id ? '' : ' none');
      it.dataset.id = w.id;
      it.style.left = `${50 + Math.sin(a) * 39}%`;
      it.style.top = `${50 - Math.cos(a) * 39}%`;
      const c = document.createElement('canvas');
      c.width = 64; c.height = 40;
      drawWeaponIcon(c, w.id);
      const k = document.createElement('b'); k.textContent = w.slot;
      const n = document.createElement('span'); n.textContent = w.short;
      const am = document.createElement('i'); am.textContent = w.ammo;
      it.append(k, c, n, am);
      it.addEventListener('mouseenter', () => onHover(w.id));
      ring.appendChild(it);
    });
    $('wheel').classList.add('show');
    this.wheelSelect(sel, items.find((w) => w.id === sel)?.name || '');
  }
  wheelSelect(id, name) {
    for (const it of $('wheelItems').children) it.classList.toggle('sel', it.dataset.id === id);
    $('wheelName').textContent = name;
  }
  hideWheel() { $('wheel').classList.remove('show'); }

  // --- Тексты как в SA ---
  // Хелпбокс слева сверху, 5 с. Клавиши в тильдах: «Нажмите ~F~».
  help(text, ms = 5000, key) { this.ch.help.push(text, ms, key); }
  // Субтитры цели внизу по центру. html: ключевые слова можно обернуть в <b style="color:…">.
  subtitle(html, ms = 4500) { this.ch.subtitle.push(html, ms, html.replace(/<[^>]*>/g, '').replace(/\d+/g, '#')); }
  showDistrict(name, color = '#fff') { this.ch.district.push([name, color], 3500, name); }
  showVehicle(name) {
    this.el.carName.textContent = name;
    flash(this.el.carName, 3000, this.timers, 'car');
  }
  missionPassed(reward = 500) {
    $('passedReward').textContent = reward ? `$${reward}` : '';
    flash(this.el.passed, 4000, this.timers, 'passed');
    jingle();
  }

  // --- Совместимость со старым API ---
  toast(text, color = '#fff') { this.subtitle(color === '#fff' ? esc(text) : `<b style="color:${color}">${esc(text)}</b>`, 2600); }
  alert(text, color = '#ffd23f') { this.subtitle(`<b style="color:${color}">${esc(text)}</b>`, 4500); }
  // Статус войны → хелпбокс, только когда смысл сменился (цифры обновляем молча).
  setStatus(t) {
    t = t.replace(/^\p{Extended_Pictographic}️?\s*/u, '').replace('Баллончик [2]', 'Баллончик ~9~').replace(/ЛКМ/g, '~ЛКМ~');
    const key = t.replace(/\d+/g, '#');
    if (key !== this.statusKey) { this.statusKey = key; if (t) this.help(t, 6000, 'status:' + key); }
    else if (this.ch.help.cur?.key === 'status:' + key && this.ch.help.cur.content !== t) { this.ch.help.cur.content = t; this.el.help.innerHTML = keys(t); }
  }
  setScore() {}
  setMatchTimer() {}
  income() {}
  setHint(t) { if (this.el.hintText !== t) { this.el.hintText = t; $('hint').innerHTML = keys(t); } }
  setSpeed(v, inCar) { this.el.speed.textContent = inCar ? `${Math.round(Math.abs(v) * 3.6)} км/ч` : ''; }
  setSpray(k) {
    this.el.sprayBar.style.display = k == null ? 'none' : 'block';
    if (k != null) this.el.sprayBar.firstChild.style.width = `${Math.min(1, k) * 100}%`;
  }
  setCrosshair(on) { this.el.crosshair.style.display = on ? 'block' : 'none'; }
  setArrow() {} // цель теперь показывается иконкой на краю радара

  flashDamage() {
    document.body.classList.remove('hurt');
    void document.body.offsetWidth;
    document.body.classList.add('hurt');
  }

  // Радар: вращается с камерой, территории цветом владельца, N на краю, цели по краю.
  drawMap(center, yaw, colliders, districts, enemies, target, tags = []) {
    const ctx = this.map;
    const W = ctx.canvas.width, H = ctx.canvas.height, s = 0.75, R = W / 2;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const a = -s * c, b = -s * sn, cc = s * sn, d = -s * c;
    const toScreen = (x, z) => [W / 2 + a * (x - center.x) + cc * (z - center.z), H / 2 + b * (x - center.x) + d * (z - center.z)];
    const clampEdge = (x, y, m) => {
      const rx = x - W / 2, ry = y - H / 2, len = Math.hypot(rx, ry), maxR = R - m;
      return len > maxR ? [W / 2 + (rx * maxR) / len, H / 2 + (ry * maxR) / len, true] : [x, y, false];
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2);
    ctx.clip();
    // Подложка = дороги (светлые), кварталы — тёмно-зелёные.
    ctx.fillStyle = '#d9d9d2';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(a, b, cc, d, W / 2 - (a * center.x + cc * center.z), H / 2 - (b * center.x + d * center.z));
    ctx.fillStyle = '#3b5a46';
    for (const r of colliders) {
      if (r.maxX - r.minX < 2) continue;
      if (Math.abs(r.minX - center.x) > 220 || Math.abs(r.minZ - center.z) > 220) continue;
      ctx.fillRect(r.minX, r.minZ, r.maxX - r.minX, r.maxZ - r.minZ);
    }
    // Территории банков поверх, как территории банд.
    for (const dist of districts) {
      ctx.fillStyle = BANKS[dist.owner].css + '5c';
      ctx.fillRect(dist.minX, dist.minZ, dist.maxX - dist.minX, dist.maxZ - dist.minZ);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Граффити: маленькие ромбики в цвете владельца.
    for (const t of tags) {
      const [x, y] = toScreen(t.pos.x, t.pos.z);
      ctx.fillStyle = BANKS[t.owner].css;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    // Враги — красные точки (треугольник, если сильно выше/ниже).
    for (const e of enemies) {
      if (e.dead) continue;
      const [x, y, edge] = clampEdge(...toScreen(e.position.x, e.position.z), 4);
      if (edge) continue;
      ctx.fillStyle = '#e8312a';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      const dy = e.position.y - center.y;
      ctx.beginPath();
      if (Math.abs(dy) > 3) { const k = dy > 0 ? -1 : 1; ctx.moveTo(x, y + 5 * k); ctx.lineTo(x - 5, y - 4 * k); ctx.lineTo(x + 5, y - 4 * k); ctx.closePath(); }
      else ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // Цель: иконка-мишень, прижимается к краю.
    if (target) {
      const [x, y] = clampEdge(...toScreen(target.x, target.z), 11);
      ctx.fillStyle = '#000';
      ctx.fillRect(x - 8, y - 8, 16, 16);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px "Russo One", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', x, y + 1);
    }
    // Игрок — белая стрелка в центре.
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2 - 9);
    ctx.lineTo(W / 2 - 7, H / 2 + 7);
    ctx.lineTo(W / 2, H / 2 + 3);
    ctx.lineTo(W / 2 + 7, H / 2 + 7);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // Метка севера (−Z) в чёрном кружке на краю.
    const [nx, ny] = clampEdge(...toScreen(center.x, center.z - 1e4), 12);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(nx, ny, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '13px "Russo One", "Arial Black", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 1);
  }
}

// Короткий джингл «задание выполнено».
let actx = null;
function jingle() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + (i === 3 ? 0.6 : 0.14));
      o.connect(g).connect(actx.destination);
      o.start(t0 + i * 0.12); o.stop(t0 + i * 0.12 + 0.7);
    });
  } catch { /* без звука */ }
}
