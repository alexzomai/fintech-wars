// Редактор своего граффити-тега: холст 128×128, палитра, 2 кисти. Рисунок хранится в localStorage.
const KEY = 'fintech-wars-tag-v1';
const COLORS = ['#2ecc59', '#ffffff', '#111111', '#39ff14', '#ff2bd6', '#00e5ff', '#f5c518', '#e8423a'];
const SIZE = 128;

export const loadSavedTag = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const saveTag = (url) => { try { localStorage.setItem(KEY, url); } catch { /* приватный режим */ } };

function css() {
  if (document.getElementById('jury-tag-css')) return;
  const s = document.createElement('style');
  s.id = 'jury-tag-css';
  s.textContent = `
  #tagEditor{position:fixed;inset:0;z-index:2000;background:rgba(8,12,10,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:'Press Start 2P',monospace;color:#fff;text-align:center}
  #tagEditor h2{margin:0;font-size:20px;color:#2ecc59;text-shadow:3px 3px #000}
  #tagEditor p{margin:0;font-size:9px;color:#aaa}
  #tagEditor canvas{width:384px;height:384px;image-rendering:pixelated;border:4px solid #2ecc59;cursor:crosshair;touch-action:none;
    background:#3a3a3a conic-gradient(#444 25%,#333 0 50%,#444 0 75%,#333 0) 0 0/32px 32px}
  #tagEditor .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}
  #tagEditor .sw{width:30px;height:30px;border:3px solid #000;cursor:pointer;padding:0}
  #tagEditor .sw.on{outline:3px solid #fff}
  #tagEditor button.b{font-family:inherit;font-size:10px;padding:10px 12px;background:#222;color:#fff;border:3px solid #555;cursor:pointer}
  #tagEditor button.b.on{border-color:#fff}
  #tagEditor button.go{background:#2ecc59;color:#000;border-color:#000}
  `;
  document.head.appendChild(s);
}

// onClose(canvasOrNull) вызывается синхронно внутри клика — можно брать pointer lock.
export function openTagEditor(onClose) {
  css();
  const root = document.createElement('div');
  root.id = 'tagEditor';
  root.innerHTML = `<h2>Нарисуй свой тег</h2><p>Он появится на стенах Сбережёнки</p>
    <canvas id="tagCanvas" width="${SIZE}" height="${SIZE}"></canvas>
    <div class="row" id="tagColors"></div>
    <div class="row"><button class="b on" id="tagB1">Тонкая</button><button class="b" id="tagB2">Толстая</button>
    <button class="b" id="tagClear">Очистить</button></div>
    <div class="row"><button class="b go" id="tagDone">Готово</button><button class="b" id="tagSkip">Пропустить</button></div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('#tagCanvas');
  const g = cv.getContext('2d');
  const saved = loadSavedTag();
  if (saved) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0); im.src = saved; }
  let color = COLORS[0], brush = 3, drawing = false, last = null;
  const colors = root.querySelector('#tagColors');
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'sw' + (i ? '' : ' on'); b.style.background = c; b.dataset.color = c;
    b.onclick = () => { color = c; colors.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b)); };
    colors.appendChild(b);
  });
  const setBrush = (n) => { brush = n; root.querySelector('#tagB1').classList.toggle('on', n === 3); root.querySelector('#tagB2').classList.toggle('on', n === 8); };
  root.querySelector('#tagB1').onclick = () => setBrush(3);
  root.querySelector('#tagB2').onclick = () => setBrush(8);
  root.querySelector('#tagClear').onclick = () => g.clearRect(0, 0, SIZE, SIZE);
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * SIZE, (e.clientY - r.top) / r.height * SIZE]; };
  const stroke = (a, b) => {
    g.strokeStyle = g.fillStyle = color; g.lineWidth = brush; g.lineCap = g.lineJoin = 'round';
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  };
  cv.addEventListener('pointerdown', (e) => { drawing = true; last = pt(e); stroke(last, last); cv.setPointerCapture?.(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pt(e); stroke(last, p); last = p; });
  addEventListener('pointerup', () => { drawing = false; });
  const close = (out) => { root.remove(); onClose(out); };
  root.querySelector('#tagDone').onclick = () => {
    saveTag(cv.toDataURL('image/png'));
    close(cv);
  };
  root.querySelector('#tagSkip').onclick = () => close(null);
}

// Подставляет сохранённый тег без редактора (если есть).
export function savedTagCanvas() {
  return new Promise((res) => {
    const s = loadSavedTag();
    if (!s) return res(null);
    const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = SIZE; c.getContext('2d').drawImage(im, 0, 0); res(c); };
    im.onerror = () => res(null);
    im.src = s;
  });
}
