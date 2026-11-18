import * as THREE from 'three';
import { BANKS, BLOCK, ownerListeners } from './city.js';

// [v3-palych] Рация Палыча, пролог, катсцены и задания.
// Всё живёт здесь: DOM и стили создаются из JS, свой цикл на requestAnimationFrame.
// В main.js только init, пролог перед стартом и start().

const CSS = `
#palRadio{position:fixed;left:22px;bottom:252px;z-index:40;display:flex;gap:10px;align-items:flex-start;width:min(380px,40vw);
  padding:8px 10px;background:#000c;border:2px solid #2ecc59;border-left-width:6px;color:#fff;font:15px/1.35 var(--font,'Russo One'),sans-serif;
  text-shadow:1px 1px #000;opacity:0;transform:translateX(-14px);transition:opacity .25s,transform .25s;pointer-events:none}
#palRadio.show{opacity:1;transform:none}
#palRadio canvas{width:64px;height:64px;image-rendering:pixelated;border:2px solid #fff;flex:none;background:#1b2a22}
#palRadio .who{color:#7dff8a;font-size:13px;letter-spacing:1px}
#palRadio .who i{font-style:normal;color:#fff8;font-size:11px;margin-left:6px}
#palRadio .who i::before{content:'● ';color:#e8423a;animation:palBlink 1s steps(2) infinite}
@keyframes palBlink{50%{opacity:0}}
#palRadio .txt{min-height:2.7em}
.palBars{position:fixed;inset:0;z-index:900;pointer-events:none}
.palBars::before,.palBars::after{content:'';position:absolute;left:0;right:0;height:13vh;background:#000;transition:transform .4s ease}
.palBars::before{top:0;transform:translateY(-100%)}
.palBars::after{bottom:0;transform:translateY(100%)}
.palBars.on::before,.palBars.on::after{transform:none}
.palBars .sub{position:absolute;bottom:calc(13vh + 18px);left:50%;transform:translateX(-50%);width:min(820px,80vw);text-align:center;
  color:#fff;font:22px/1.4 var(--font,'Russo One'),sans-serif;text-shadow:var(--outline3,2px 2px #000);opacity:0;transition:opacity .3s}
.palBars .sub.show{opacity:1}
.palBars .sub b{font-weight:400}
.palBars .skip{position:absolute;bottom:4vh;right:3vw;color:#fff8;font:12px var(--font,'Russo One'),sans-serif;opacity:0;transition:opacity .4s}
.palBars.on .skip{opacity:1}
body.palCut #hud,body.palCut #palRadio{visibility:hidden}
#palPrologue{position:fixed;inset:0;z-index:2000;background:#000;color:#fff;font-family:var(--font,'Russo One'),sans-serif;cursor:pointer;user-select:none}
#palPrologue::before,#palPrologue::after{content:'';position:absolute;left:0;right:0;height:12vh;background:repeating-linear-gradient(90deg,#111 0 40px,#161616 40px 80px);border:solid #2ecc59;border-width:0}
#palPrologue::before{top:0;border-bottom-width:3px}
#palPrologue::after{bottom:0;border-top-width:3px}
#palPrologue .card{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(860px,84vw);text-align:center;opacity:0;transition:opacity .6s}
#palPrologue .card.show{opacity:1}
#palPrologue .card h2{font-weight:400;font-size:clamp(26px,4vw,46px);color:#ffb21f;margin:0 0 18px;text-shadow:3px 3px #000;letter-spacing:1px}
#palPrologue .card p{font-size:clamp(17px,2.2vw,24px);line-height:1.5;margin:0;color:#ddd}
#palPrologue .card p b{font-weight:400}
#palPrologue .nav{position:absolute;bottom:calc(12vh + 18px);left:0;right:0;text-align:center;color:#fff8;font-size:13px}
#palPrologue .dots{position:absolute;top:calc(12vh + 18px);left:0;right:0;text-align:center;letter-spacing:6px;color:#2ecc59}
#palSkip{position:absolute;top:calc(12vh + 14px);right:3vw;background:none;border:2px solid #fff6;color:#fffc;font:13px var(--font,'Russo One'),sans-serif;padding:6px 12px;cursor:pointer}
#palSkip:hover{border-color:#2ecc59;color:#2ecc59}
`;

const G = BANKS.green.css, R = BANKS.red.css, Y = BANKS.yellow.css;
const b = (c, t) => `<b style="color:${c}">${t}</b>`;

// Реплики на события (NARRATIVE.md).
const LINES = {
  start: ['Добро пожаловать в команду, пиарщик. Город должен говорить только о нас.', 'Подойди к зелёному маркеру у Евразии. Есть задача.'],
  firstTag: ['Вот это охваты! Бренд-бук одобрил.'],
  tag: ['Бренд-бук одобрил.', 'Вот это охваты!', 'Красиво. Почти как в презентации.', 'Узнаваемость растёт, пиарщик.'],
  war: ['Это не война, пиарщик. Это слияния и поглощения.'],
  firstCapture: ['Отличная конверсия, пиарщик! Бумажку потом оформим.'],
  counter: ['Конкуренты лезут на нашу территорию. Отбей район!'],
  lost: ['Отток клиентов, пиарщик. Верни их.'],
  death: ['Ладно, восстановим. Не впервой.'],
  final: ['Отчётность сдаём через две минуты! Дожимай!'],
};

const PROLOGUE = [
  ['Москва-Сити, 2049', `Банков в городе осталось три. Клиентов — всё меньше. Кредиты одобряют прямо в лифте.`],
  ['Конкуренты', `${b(R, 'Алый-банк')} одобряет всё, даже ипотеку голубям. ${b(Y, 'Тёплый-Банк')} уверяет, что он не банк, а экосистема.`],
  ['Сбережёнка', `${b(G, 'Сбережёнку')} никто не замечает. Совет директоров в панике. Маркетинговый бюджет — один баллончик краски.`],
  ['Ты — новый пиарщик', `Палыч, директор по маркетингу: «Нас не замечают, пиарщик. Исправь это. Бумажку потом оформим».`],
];

// Задания. district — индекс района из city.js.
const MISSIONS = [
  {
    id: 'rebrand', title: 'Ребрендинг', need: 3, district: 1,
    cut: [
      ['Палыч', 'Видишь Меркурий и Око? Там всё в граффити Алого-банка.'],
      ['Палыч', 'Это не вандализм, пиарщик. Это ребрендинг.'],
      ['Палыч', 'Перекрась три их тега. Баллончик — клавиша 5.'],
    ],
  },
  {
    id: 'adwar', title: 'Рекламная война',
    cut: [
      ['Палыч', 'Акционеры хотят рост. Рост — это районы.'],
      ['Палыч', 'Забери любой район у конкурентов. Перекрась теги, встань в круг, отбейся.'],
      ['Палыч', 'Это не война. Это слияния и поглощения.'],
    ],
  },
];

// Пиксельный портрет Палыча 24×24: лысина, седина, усы, очки, зелёный галстук.
function drawAvatar(c) {
  c.width = 24; c.height = 24;
  const g = c.getContext('2d');
  const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  px(0, 0, 24, 24, '#1b2a22');
  for (let y = 0; y < 24; y += 3) px(0, y, 24, 1, '#22352b');
  px(3, 19, 18, 5, '#3a3f4a'); // пиджак
  px(9, 19, 6, 5, '#f0f0f0'); // рубашка
  px(11, 19, 2, 5, '#2ecc59'); // галстук
  px(10, 17, 4, 3, '#d9a07a'); // шея
  px(6, 5, 12, 13, '#e6b48c'); // лицо
  px(7, 4, 10, 2, '#e6b48c'); // лысина
  px(8, 3, 8, 1, '#f2c8a4');
  px(5, 6, 2, 6, '#b8b8b8'); px(17, 6, 2, 6, '#b8b8b8'); // седые виски
  px(6, 5, 1, 2, '#cfcfcf'); px(17, 5, 1, 2, '#cfcfcf');
  px(4, 9, 2, 3, '#d9a07a'); px(18, 9, 2, 3, '#d9a07a'); // уши
  px(7, 9, 4, 3, '#222'); px(13, 9, 4, 3, '#222'); px(11, 10, 2, 1, '#222'); // очки
  px(8, 10, 2, 1, '#8fd3ff'); px(14, 10, 2, 1, '#8fd3ff');
  px(7, 8, 4, 1, '#888'); px(13, 8, 4, 1, '#888'); // брови
  px(11, 12, 2, 2, '#c98f68'); // нос
  px(8, 14, 8, 2, '#9a9a9a'); px(8, 16, 1, 1, '#9a9a9a'); px(15, 16, 1, 1, '#9a9a9a'); // усы
  px(10, 16, 4, 1, '#8a4a3a'); // рот
  px(16, 15, 2, 1, '#f2c8a4');
  px(19, 18, 3, 6, '#222'); px(20, 15, 1, 3, '#555'); px(20, 14, 1, 1, '#e8423a'); // рация
}

export function initPalych({ state, hud, war, graffiti, districts, player, getVehicle, input }) {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const params = new URLSearchParams(location.search);
  const isTest = params.has('test');
  // В smoke-тесте задания выключены (маркер у старта мешал бы езде); ?test&palych — включены.
  const missionsOn = !isTest || params.has('palych');

  // --- Рация ---
  const radio = document.createElement('div');
  radio.id = 'palRadio';
  const av = document.createElement('canvas');
  drawAvatar(av);
  const body = document.createElement('div');
  body.innerHTML = '<div class="who">ГЕННАДИЙ ПАЛЫЧ<i>рация</i></div><div class="txt"></div>';
  radio.append(av, body);
  document.body.appendChild(radio);
  const txt = body.querySelector('.txt');
  const queue = [];
  let cur = null; // { text, shown, holdT }
  const log = [];
  function say(text) {
    if (Array.isArray(text)) text = text[Math.floor(Math.random() * text.length)];
    if (queue.length > 4) queue.shift();
    queue.push(text);
    log.push(text);
  }
  function updateRadio(dt) {
    if (!cur && queue.length) {
      cur = { text: queue.shift(), shown: 0, holdT: 4 };
      txt.textContent = '';
      radio.classList.add('show');
      blip();
    }
    if (!cur) return;
    if (cur.shown < cur.text.length) {
      cur.shown = Math.min(cur.text.length, cur.shown + dt * 38);
      txt.textContent = cur.text.slice(0, Math.floor(cur.shown));
    } else {
      cur.holdT -= dt;
      if (cur.holdT <= 0) { cur = null; if (!queue.length) radio.classList.remove('show'); }
    }
  }

  // --- Катсцена: полосы, субтитры, облёт камеры ---
  const bars = document.createElement('div');
  bars.className = 'palBars';
  bars.innerHTML = '<div class="sub"></div><div class="skip">Пробел — дальше</div>';
  document.body.appendChild(bars);
  const sub = bars.querySelector('.sub');
  let cut = null; // { lines, i, t, lineT, done, center, prevMode }
  const actor = () => getVehicle() || player;
  function cutscene(lines, done) {
    state.camOverride = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    cut = { lines, i: -1, t: 0, lineT: 0, done, center: actor().position.clone(), prevMode: state.mode, yaw0: Math.random() * Math.PI * 2 };
    state.mode = 'cutscene';
    for (const k in input) if (typeof input[k] === 'boolean') input[k] = false;
    document.exitPointerLock?.();
    document.body.classList.add('palCut');
    bars.classList.add('on');
    nextLine();
  }
  function nextLine() {
    cut.i++;
    cut.lineT = 0;
    if (cut.i >= cut.lines.length) return endCut();
    const [who, line] = cut.lines[cut.i];
    sub.innerHTML = `${b(G, who + ':')} ${line.replace(/[<>&]/g, '')}`;
    sub.classList.add('show');
  }
  function endCut() {
    const c = cut;
    cut = null;
    sub.classList.remove('show');
    bars.classList.remove('on');
    document.body.classList.remove('palCut');
    setTimeout(() => {
      state.camOverride = null;
      if (state.mode === 'cutscene') state.mode = c.prevMode === 'cutscene' ? 'play' : c.prevMode;
      c.done?.();
    }, 400);
  }
  function updateCut(dt) {
    if (!cut || cut.i >= cut.lines.length) return;
    cut.t += dt;
    cut.lineT += dt;
    // Облёт вокруг персонажа: полукруг, камера медленно опускается.
    const a = cut.yaw0 + cut.t * 0.35, r = 9 - Math.min(3, cut.t * 0.3), h = 5.5 - Math.min(2.5, cut.t * 0.25);
    const p = cut.center;
    state.camOverride.pos.set(p.x + Math.sin(a) * r, h, p.z + Math.cos(a) * r);
    state.camOverride.look.set(p.x, 1.6, p.z);
    if (cut.lineT > 3.2) nextLine();
  }
  addEventListener('keydown', (e) => {
    if (cut && (e.code === 'Space' || e.code === 'Enter') && !e.repeat && cut.lineT > 0.3) { e.preventDefault(); nextLine(); }
  });

  // --- Маркер задания: светящийся цилиндр у входа в Евразию ---
  const hq = districts[0].hq || districts[0].zone;
  const spots = [new THREE.Vector3(hq.x + BLOCK / 2 + 2, 0, hq.z + 6), new THREE.Vector3(hq.x + BLOCK / 2 + 2, 0, hq.z - 8)];
  const mat = new THREE.MeshBasicMaterial({ color: BANKS.green.color, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const marker = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 24, 1, true), mat);
  cyl.position.y = 1.3;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.8, 24, 1, true), mat);
  core.position.y = 0.9;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: BANKS.green.color, transparent: true, opacity: 0.55, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  marker.add(cyl, core, disc);
  marker.visible = false;

  const ms = { idx: 0, active: null, progress: 0, done: [], markerOn: false };
  function showMarker() {
    if (!missionsOn || ms.idx >= MISSIONS.length) { marker.visible = false; ms.markerOn = false; return; }
    marker.position.copy(spots[ms.idx % spots.length]);
    marker.visible = true;
    ms.markerOn = true;
  }
  function startMission(m) {
    ms.markerOn = false;
    marker.visible = false;
    cutscene(m.cut, () => {
      ms.active = m;
      ms.progress = 0;
      if (m.id === 'rebrand') {
        hud.help(`Задание «${m.title}»: перекрась 3 тега Алого-банка в районе «${districts[m.district].name}». Баллончик ~5~, держи ~ЛКМ~. Теги: 0/3`, 8000);
        hud.subtitle(`Перекрась ${b(R, 'теги Алого-банка')} в районе ${b('#fff', districts[m.district].name)}`);
      } else {
        hud.help(`Задание «${m.title}»: захвати любой чужой район.`, 8000);
        hud.subtitle(`Захвати ${b(R, 'любой чужой район')}`);
      }
    });
  }
  function completeMission() {
    const m = ms.active;
    ms.active = null;
    ms.done.push(m.id);
    ms.idx++;
    hud.missionPassed(500);
    war.addMoney(500);
    war.reach = (war.reach || 0) + 10;
    say(m.id === 'rebrand' ? 'Ребрендинг засчитан. Премию выпишу. Когда-нибудь.' : 'Рынок дрогнул! Бумажку потом оформим.');
    if (ms.idx < MISSIONS.length) setTimeout(() => { showMarker(); say('Новая задача, пиарщик. Жду у маркера у Евразии.'); }, 4500);
    else setTimeout(() => say('Задач пока нет. Захватывай районы, пиарщик — город должен говорить только о нас.'), 4500);
  }

  // Статус войны в хелпбоксе: строка активного задания идёт первой, чтобы её не перетирало.
  const missionLine = () => {
    const m = ms.active;
    if (!m) return '';
    return m.id === 'rebrand' ? `Задание «${m.title}»: теги Алого-банка ${Math.min(ms.progress, m.need)}/${m.need}` : `Задание «${m.title}»: захвати чужой район`;
  };
  const origStatus = hud.setStatus.bind(hud);
  hud.setStatus = (t) => { const l = missionLine(); origStatus(l && t ? `${l}. ${t}` : l || t); };

  // --- События игры ---
  const ev = { firstTag: false, war: false, firstCapture: false, counter: false, final: false };
  const origSetTag = graffiti.setTag.bind(graffiti);
  graffiti.setTag = (tag, owner) => {
    const prev = tag.owner;
    origSetTag(tag, owner);
    // Перекраска баллончиком: район ещё чужой (при захвате района владелец меняется раньше тегов).
    if (owner !== 'green' || prev === 'green' || tag.d.owner === 'green') return;
    if (!ev.firstTag) { ev.firstTag = true; say(LINES.firstTag); }
    else if (Math.random() < 0.3) say(LINES.tag);
    const m = ms.active;
    if (m?.id === 'rebrand' && tag.d === districts[m.district] && prev === 'red') {
      ms.progress++;
      hud.help(missionLine(), 5000);
      if (ms.progress >= m.need) completeMission();
    }
  };
  const owners = new Map(districts.map((d) => [d, d.owner]));
  ownerListeners.push((d) => {
    const prev = owners.get(d);
    owners.set(d, d.owner);
    if (state.mode === 'menu') return;
    if (d.owner === 'green' && prev !== 'green') {
      if (!ev.firstCapture) { ev.firstCapture = true; say(LINES.firstCapture); }
      if (ms.active?.id === 'adwar') completeMission();
      else if (ms.active?.id === 'rebrand' && d === districts[ms.active.district]) completeMission();
    } else if (prev === 'green' && d.owner !== 'green') say(LINES.lost);
  });

  let started = false, lastMode = state.mode;
  function update(dt) {
    updateRadio(dt);
    updateCut(dt);
    if (!started) return;
    if (state.mode === 'dead' && lastMode !== 'dead') say(LINES.death);
    lastMode = state.mode;
    if (war.capture && !ev.war) { ev.war = true; say(LINES.war); }
    if (war.counter && !ev.counter) { ev.counter = true; say(LINES.counter); }
    if (!war.counter) ev.counter = false;
    if (!ev.final && war.time < 120 && !war.over) { ev.final = true; say(LINES.final); }
    // Маркер: пульс и вход.
    if (ms.markerOn) {
      const t = performance.now() / 1000;
      mat.opacity = 0.3 + 0.15 * Math.sin(t * 4);
      disc.rotation.z = t;
      const p = actor().position;
      if (state.mode === 'play' && Math.hypot(p.x - marker.position.x, p.z - marker.position.z) < 1.8 && !cut) startMission(MISSIONS[ms.idx]);
    }
  }
  let last = performance.now();
  (function loop() {
    const now = performance.now();
    update(Math.min(0.25, (now - last) / 1000));
    last = now;
    requestAnimationFrame(loop);
  })();

  // --- Пролог ---
  let prologueDone = isTest;
  function prologue(done) {
    const el = document.createElement('div');
    el.id = 'palPrologue';
    el.innerHTML = `<div class="dots"></div><div class="card"><h2></h2><p></p></div><button id="palSkip">Пропустить ▸▸</button><div class="nav">Клик или Пробел — дальше</div>`;
    document.body.appendChild(el);
    const card = el.querySelector('.card'), dots = el.querySelector('.dots');
    let i = -1, busy = false;
    const finish = () => {
      removeEventListener('keydown', onKey, true);
      el.remove();
      prologueDone = true;
      done();
    };
    const next = () => {
      if (busy) return;
      i++;
      if (i >= PROLOGUE.length) return finish();
      busy = true;
      card.classList.remove('show');
      setTimeout(() => {
        card.querySelector('h2').textContent = PROLOGUE[i][0];
        card.querySelector('p').innerHTML = PROLOGUE[i][1];
        dots.textContent = PROLOGUE.map((_, k) => (k === i ? '■' : '□')).join('');
        card.classList.add('show');
        busy = false;
      }, i ? 350 : 50);
    };
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); next(); }
      if (e.code === 'Escape') finish();
    };
    el.addEventListener('click', (e) => { if (e.target.id === 'palSkip') finish(); else next(); });
    addEventListener('keydown', onKey, true);
    next();
  }

  // Вызывается после старта игры.
  function start() {
    if (started) return;
    started = true;
    marker.parent || graffiti.scene.add(marker);
    say(LINES.start[0]);
    if (missionsOn) { showMarker(); say(LINES.start[1]); }
  }

  return {
    say, cutscene, prologue, start, log, missions: ms, marker, MISSIONS,
    get prologueDone() { return prologueDone; },
    get inCutscene() { return !!cut; },
    get radioText() { return cur ? cur.text : ''; },
  };
}

// Короткий щелчок рации.
let actx = null;
function blip() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(1400, t0);
    o.frequency.exponentialRampToValueAtTime(700, t0 + 0.08);
    g.gain.setValueAtTime(0.03, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(g).connect(actx.destination);
    o.start(t0); o.stop(t0 + 0.13);
  } catch { /* без звука */ }
}
