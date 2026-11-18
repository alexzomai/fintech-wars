import * as THREE from 'three';
import { BANKS } from './city.js';

// Стартовое меню в духе SA и карта паузы (Esc / M) со вкладкой «Статистика».
// DOM и стили создаются здесь: index.html и style.css не трогаем.
// Кнопка #play переезжает в меню пунктом «Начать игру» и работает как раньше.

const CSS = `
#saMenu, #saPause { position: fixed; inset: 0; z-index: 50; font-family: 'Press Start 2P', monospace; color: #fff; }
#saMenu { background: linear-gradient(90deg, rgba(5,3,18,.92) 0%, rgba(10,6,30,.75) 45%, rgba(20,8,40,.15) 100%); display: flex; align-items: center; }
#saMenu.off, #saPause.off { display: none; }
#saMenu .wrap { margin-left: 8vw; }
#saMenu h1 { font-size: clamp(22px, 4vw, 52px); margin: 0 0 6px; color: #ff4fd8; letter-spacing: 2px;
  text-shadow: 3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 0 18px #ff4fd8; font-style: italic; }
#saMenu .sub { font-size: 11px; color: #7ffcff; margin: 0 0 48px; text-shadow: 2px 2px 0 #000; }
#saMenu .item, #saMenu #play { display: block; background: none; border: 0; padding: 10px 0; margin: 0; cursor: pointer; text-align: left;
  font: inherit; font-size: clamp(16px, 2.4vw, 30px); color: #8f86a8; text-transform: uppercase;
  text-shadow: 3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000; transition: color .1s, transform .1s; }
#saMenu .sel { color: #fff1a8 !important; transform: translateX(14px); text-shadow: 3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 0 14px #ffb84f !important; }
#saMenu .dim { opacity: .45; }
#saMenu .note { font-size: 9px; color: #c9b8ff; margin-top: 34px; min-height: 12px; text-shadow: 2px 2px 0 #000; max-width: 520px; line-height: 1.6; }
#saMenu .keys { position: absolute; left: 8vw; bottom: 28px; font-size: 8px; color: #8f86a8; line-height: 1.8; max-width: 80vw; }
#saPause { background: rgba(4,2,14,.88); display: flex; flex-direction: column; align-items: center; padding: 18px; box-sizing: border-box; }
#saPause .tabs { display: flex; gap: 28px; margin-bottom: 12px; font-size: 14px; }
#saPause .tabs span { cursor: pointer; color: #8f86a8; text-shadow: 2px 2px 0 #000; }
#saPause .tabs span.on { color: #fff1a8; text-shadow: 2px 2px 0 #000, 0 0 10px #ffb84f; }
#saPause canvas { flex: 1; min-height: 0; max-width: 100%; aspect-ratio: 1; image-rendering: pixelated; border: 2px solid #ff4fd8; box-shadow: 0 0 20px #ff4fd855; }
#saPause .stats { flex: 1; font-size: 13px; line-height: 2.4; min-width: 420px; padding-top: 24px; text-shadow: 2px 2px 0 #000; }
#saPause .stats b { color: #fff1a8; float: right; margin-left: 40px; }
#saPause .foot { font-size: 9px; color: #8f86a8; margin-top: 10px; }
`;

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function initPauseMenu({ state, districts, war, graffiti, colliders, input, neon, canvas, actor }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // --- Стартовое меню ---
  const start = document.getElementById('start');
  const play = document.getElementById('play');
  const menu = document.createElement('div');
  menu.id = 'saMenu';
  menu.innerHTML = `<div class="wrap"><h1>ФИНТЕХ-ВОЙНЫ</h1><p class="sub">СИТИ-2049 · ВОЙНА ЗА ВНИМАНИЕ</p>
    <div class="list"></div><div class="note"></div></div>
    <div class="keys">↑↓ — выбор · Enter — подтвердить · WASD — ход · ЛКМ — огонь · R — перезарядка · G — граната · 1–9/Tab — оружие · E — действие · F — машина · Q — радио · N — ночь · P — сторис · Esc/M — карта</div>`;
  document.body.appendChild(menu);
  const list = menu.querySelector('.list'), note = menu.querySelector('.note');
  if (start) start.style.display = 'none';
  play.textContent = 'Начать игру';
  play.className = 'item';
  const mk = (label, fn, dim = false) => {
    const b = document.createElement('button');
    b.className = 'item' + (dim ? ' dim' : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  };
  let settings = false;
  const items = [
    play,
    mk('Продолжить', () => { note.textContent = 'Сохранений нет: Сити-2049 живёт одним днём. Начни новую игру.'; }, true),
    mk('Настройки', () => {
      settings = true;
      neon.toggleNight();
      note.textContent = `Время суток: ${neon.night ? 'неоновая ночь' : 'закат'} (переключено). В игре: N.`;
    }),
    mk('Выход', () => { note.textContent = 'Из Сити-2049 не уходят. Пока рынок не наш.'; }),
  ];
  items.forEach((b) => list.appendChild(b));
  let sel = 0;
  const select = (i) => { sel = (i + items.length) % items.length; items.forEach((b, k) => b.classList.toggle('sel', k === sel)); };
  items.forEach((b, i) => b.addEventListener('mouseenter', () => select(i)));
  select(0);

  // Живой город за меню: медленный облёт вокруг Сити.
  let orbit = 0;
  const orbitCam = { pos: new THREE.Vector3(), look: new THREE.Vector3(-20, 55, -30) };
  state.camOverride = orbitCam;
  play.addEventListener('click', () => {
    menu.classList.add('off');
    if (state.camOverride === orbitCam) state.camOverride = null;
  });

  // --- Карта паузы ---
  const pause = document.createElement('div');
  pause.id = 'saPause';
  pause.className = 'off';
  pause.innerHTML = `<div class="tabs"><span data-t="map" class="on">КАРТА</span><span data-t="stats">СТАТИСТИКА</span><span data-t="go">ПРОДОЛЖИТЬ</span></div>
    <canvas width="560" height="560"></canvas><div class="stats" style="display:none"></div>
    <div class="foot">Esc / M — вернуться · ←→ — вкладки</div>`;
  document.body.appendChild(pause);
  const map = pause.querySelector('canvas'), stats = pause.querySelector('.stats');
  let tab = 'map';
  const setTab = (t) => {
    if (t === 'go') return close();
    tab = t;
    pause.querySelectorAll('.tabs span').forEach((s) => s.classList.toggle('on', s.dataset.t === t));
    map.style.display = t === 'map' ? '' : 'none';
    stats.style.display = t === 'stats' ? '' : 'none';
    draw();
  };
  pause.querySelectorAll('.tabs span').forEach((s) => s.addEventListener('click', () => setTab(s.dataset.t)));

  // Квадратная карта: снизу запас под легенду (над рекой), по X — по центру.
  const x0 = Math.min(...districts.map((d) => d.minX)), x1 = Math.max(...districts.map((d) => d.maxX));
  const minZ = Math.min(...districts.map((d) => d.minZ)) - 20, maxZ = Math.max(...districts.map((d) => d.maxZ)) + 90;
  const span = maxZ - minZ, minX = (x0 + x1) / 2 - span / 2, maxX = minX + span;
  function draw() {
    if (tab === 'stats') {
      const n = (b) => districts.filter((d) => d.owner === b).length;
      const tags = graffiti?.tags || [];
      stats.innerHTML = [
        ['Районы 🟢 Сбережёнка', n('green')], ['Районы 🔴 Алый Капитал', n('red')], ['Районы 🟡 ЖЁЛТ', n('yellow')],
        ['Охваты', Math.round(war.reach || 0)], ['Граффити', `${tags.filter((t) => t.owner === 'green').length}/${tags.length}`],
        ['Деньги', `$${war.money}`], ['Время суток', neon.daytime.label()], ['Время в игре', fmtTime(neon.daytime.played)],
      ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
      return;
    }
    const W = map.width, g = map.getContext('2d');
    const sx = (x) => ((x - minX) / (maxX - minX)) * W, sz = (z) => ((z - minZ) / (maxZ - minZ)) * W;
    g.fillStyle = '#120a26'; g.fillRect(0, 0, W, W);
    // Река (юг и восток) и ТТК (запад).
    g.fillStyle = '#1d4a6a';
    g.fillRect(0, sz(Math.max(...districts.map((d) => d.maxZ)) + 12), W, W); g.fillRect(sx(x1 + 12), 0, W, W);
    g.fillStyle = '#5a5560'; g.fillRect(sx(x0 - 36), 0, Math.max(3, sx(x0 - 18) - sx(x0 - 36)), W);
    for (const d of districts) {
      g.fillStyle = BANKS[d.owner].css + '66';
      g.fillRect(sx(d.minX), sz(d.minZ), sx(d.maxX) - sx(d.minX), sz(d.maxZ) - sz(d.minZ));
    }
    g.fillStyle = '#2a2440';
    for (const c of colliders) {
      if (c.maxX - c.minX > 100 || c.maxZ - c.minZ > 100 || c.maxX - c.minX < 2) continue;
      g.fillRect(sx(c.minX), sz(c.minZ), sx(c.maxX) - sx(c.minX), sz(c.maxZ) - sz(c.minZ));
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const d of districts) {
      g.strokeStyle = BANKS[d.owner].css; g.lineWidth = 3;
      g.strokeRect(sx(d.minX) + 2, sz(d.minZ) + 2, sx(d.maxX) - sx(d.minX) - 4, sz(d.maxZ) - sz(d.minZ) - 4);
      const cx = (sx(d.minX) + sx(d.maxX)) / 2, cy = (sz(d.minZ) + sz(d.maxZ)) / 2;
      g.font = "9px 'Press Start 2P', monospace";
      g.fillStyle = '#000'; g.fillText(d.name, cx + 1, sz(d.minZ) + 17);
      g.fillStyle = '#fff'; g.fillText(d.name, cx, sz(d.minZ) + 16);
      if (d.hq) {
        const hx = sx(d.hq.x), hy = sz(d.hq.z);
        g.fillStyle = BANKS[d.owner].css; g.fillRect(hx - 11, hy - 11, 22, 22);
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(hx - 11, hy - 11, 22, 22);
        g.fillStyle = '#000'; g.font = "10px 'Press Start 2P', monospace"; g.fillText('$', hx + 1, hy + 1);
      }
      void cy;
    }
    // Теги граффити: точка цвета владельца.
    for (const t of graffiti?.tags || []) {
      g.fillStyle = '#000'; g.fillRect(sx(t.pos.x) - 4, sz(t.pos.z) - 4, 8, 8);
      g.fillStyle = BANKS[t.owner]?.css || '#fff'; g.fillRect(sx(t.pos.x) - 3, sz(t.pos.z) - 3, 6, 6);
    }
    // Игрок — стрелка по направлению взгляда (heading: 0 → +Z, вниз на карте).
    const a = actor?.();
    if (a) {
      const px = sx(a.position.x), pz = sz(a.position.z), h = a.heading || 0;
      g.save(); g.translate(px, pz); g.rotate(-h);
      g.beginPath(); g.moveTo(0, 12); g.lineTo(8, -8); g.lineTo(0, -3); g.lineTo(-8, -8); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#ff4fd8'; g.lineWidth = 2; g.stroke();
      g.restore();
    }
    // Легенда.
    g.font = "9px 'Press Start 2P', monospace"; g.textAlign = 'left';
    const leg = [['#2ecc59', 'Сбережёнка (мы)'], ['#e8423a', 'Алый Капитал'], ['#f5c518', 'ЖЁЛТ'], ['#fff', '▼ Вы'], [null, '$ — штаб · ■ — граффити']];
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(8, W - 46, W - 16, 38);
    leg.forEach(([c, t], i) => {
      const x = 18 + (i % 3) * 180, y = W - 36 + Math.floor(i / 3) * 18;
      if (c) { g.fillStyle = c; g.fillRect(x, y - 5, 10, 10); }
      g.fillStyle = '#fff'; g.fillText(t, c ? x + 16 : x, y);
    });
    g.textAlign = 'right'; g.fillStyle = '#7ffcff';
    g.fillText(`${neon.daytime.label()} · СИТИ-2049`, W - 10, 14);
  }

  function open() {
    if (state.mode !== 'play') return;
    state.mode = 'pause';
    for (const k in input) input[k] = false;
    document.exitPointerLock?.();
    pause.classList.remove('off');
    setTab(tab);
  }
  function close() {
    if (state.mode !== 'pause') return;
    state.mode = 'play';
    pause.classList.add('off');
    canvas.requestPointerLock?.();
  }

  addEventListener('keydown', (e) => {
    if (!menu.classList.contains('off')) {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') select(sel + 1);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') select(sel - 1);
      else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); items[sel].click(); }
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyM') { if (state.mode === 'pause') close(); else open(); }
    else if (state.mode === 'pause' && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) setTab(tab === 'map' ? 'stats' : 'map');
  });
  // Esc в pointer lock браузер «съедает»: потеря захвата мыши во время игры — тоже пауза.
  let hadLock = false;
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && hadLock && state.mode === 'play') open();
    hadLock = locked;
  });

  return {
    open, close, get open_() { return state.mode === 'pause'; }, menu, pause,
    update(dt) {
      if (state.camOverride === orbitCam) {
        orbit += dt * 0.05;
        orbitCam.pos.set(-20 + Math.sin(orbit) * 230, 70, -30 + Math.cos(orbit) * 230);
      }
      if (state.mode === 'pause' && tab === 'stats') { draw.t = (draw.t || 0) + dt; if (draw.t > 0.5) { draw.t = 0; draw(); } }
    },
  };
}
