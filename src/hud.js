import { BANKS } from './city.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['money', 'speed', 'status', 'matchTimer', 'arrow', 'hint', 'toast', 'alert', 'hpFill', 'hpText', 'scoreG', 'scoreR', 'scoreY', 'crosshair', 'grenades']) this.el[id] = $(id);
    this.map = $('minimap').getContext('2d');
    this.toastTimer = 0;
    this.alertTimer = 0;
  }

  setMoney(v) { this.el.money.textContent = `$${v}`; }
  setSpeed(v, inCar) { this.el.speed.textContent = inCar ? `${Math.round(Math.abs(v) * 3.6)} км/ч` : ''; }
  setStatus(t) { if (this.el.status.textContent !== t) this.el.status.textContent = t; }
  setHint(t) { if (this.el.hint.textContent !== t) this.el.hint.textContent = t; }
  setCrosshair(on) { this.el.crosshair.style.display = on ? 'block' : 'none'; }
  setScore(g, r, y) { this.el.scoreG.textContent = g; this.el.scoreR.textContent = r; this.el.scoreY.textContent = y; }

  setHp(hp, max) {
    const k = Math.max(0, hp / max);
    this.el.hpFill.style.width = `${k * 100}%`;
    this.el.hpFill.style.background = k > 0.5 ? '#2ecc59' : k > 0.25 ? '#f5c518' : '#e8423a';
    this.el.hpText.textContent = Math.ceil(Math.max(0, hp));
  }

  setMatchTimer(t) {
    const s = Math.max(0, Math.ceil(t));
    this.el.matchTimer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.el.matchTimer.classList.toggle('low', s <= 30);
  }

  toast(text, color = '#ffd23f') {
    const el = this.el.toast;
    el.textContent = text;
    el.style.color = color;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // Крупный баннер-тревога сверху.
  alert(text, color) {
    const el = this.el.alert;
    el.textContent = text;
    el.style.background = color;
    el.classList.add('show');
    clearTimeout(this.alertTimer);
    this.alertTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  income(v) {
    const el = document.createElement('div');
    el.className = 'income';
    el.textContent = `+$${v}`;
    this.el.money.parentElement.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  flashDamage() {
    document.body.classList.remove('hurt');
    void document.body.offsetWidth;
    document.body.classList.add('hurt');
  }

  setArrow(from, to, camYaw) {
    if (!to) { this.el.arrow.style.display = 'none'; return; }
    this.el.arrow.style.display = 'block';
    const ang = Math.atan2(to.x - from.x, to.z - from.z) - camYaw;
    this.el.arrow.style.transform = `rotate(${-ang}rad)`;
  }

  // Мини-карта: районы в цвете владельца, повёрнута по взгляду камеры.
  drawMap(center, yaw, colliders, districts, enemies, target) {
    const ctx = this.map;
    const W = ctx.canvas.width, H = ctx.canvas.height, s = 0.75;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const a = -s * c, b = -s * sn, cc = s * sn, d = -s * c;
    const toScreen = (x, z) => [W / 2 + a * (x - center.x) + cc * (z - center.z), H / 2 + b * (x - center.x) + d * (z - center.z)];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2b2b33';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(a, b, cc, d, W / 2 - (a * center.x + cc * center.z), H / 2 - (b * center.x + d * center.z));
    for (const dist of districts) {
      ctx.fillStyle = BANKS[dist.owner].css + '66';
      ctx.fillRect(dist.minX, dist.minZ, dist.maxX - dist.minX, dist.maxZ - dist.minZ);
    }
    ctx.fillStyle = '#d8d2c4aa';
    for (const r of colliders) {
      if (r.maxY > 150 || r.maxX - r.minX < 2) continue;
      if (Math.abs(r.minX - center.x) > 200 || Math.abs(r.minZ - center.z) > 200) continue;
      ctx.fillRect(r.minX, r.minZ, r.maxX - r.minX, r.maxZ - r.minZ);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Точки захвата.
    for (const dist of districts) {
      const [x, y] = toScreen(dist.zone.x, dist.zone.z);
      ctx.strokeStyle = BANKS[dist.owner].css;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const e of enemies) {
      if (e.dead) continue;
      const [x, y] = toScreen(e.position.x, e.position.z);
      ctx.fillStyle = BANKS[e.bank].css;
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
    if (target) {
      let [x, y] = toScreen(target.x, target.z);
      const rx = x - W / 2, ry = y - H / 2, len = Math.hypot(rx, ry), maxR = W / 2 - 9;
      if (len > maxR) { x = W / 2 + (rx * maxR) / len; y = H / 2 + (ry * maxR) / len; }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2 - 8);
    ctx.lineTo(W / 2 - 6, H / 2 + 6);
    ctx.lineTo(W / 2 + 6, H / 2 + 6);
    ctx.fill();
    ctx.restore();
  }
}
