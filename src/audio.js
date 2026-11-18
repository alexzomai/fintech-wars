// Звук «Финтех-войн»: всё синтезом через Web Audio API, без файлов.
// sfx.play('name') — разовые эффекты (можно звать до старта: просто молчит).
// audio.update(dt, { inCar, speed }) — непрерывные звуки (мотор, шины, баллончик) и радио в машине.
// Радио: «Ставка FM» (синтвейв + диджей со статистикой и рекламой), «Ретро-кэш», «Радио выключено». Z — следующая станция.
import { BANKS } from './city.js';

let ctx = null;            // AudioContext, создаётся по первому жесту
let master, sfxBus, radioBus;
let noiseBuf = null;
const VOL_KEY = 'fw-volume';

const now = () => ctx.currentTime;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// --- Кирпичики синтеза: всё с огибающими, без щелчков ---
function env(g, t, vol, a, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(bus, t, f, dur, { type = 'square', vol = 0.1, a = 0.005, slide = 0, cut = 0, q = 1, detune = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  o.detune.value = detune;
  let out = o;
  if (cut) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cut; fl.Q.value = q; o.connect(fl); out = fl; }
  out.connect(g).connect(bus);
  env(g, t, vol, a, dur);
  o.start(t); o.stop(t + a + dur + 0.05);
}
function noise(bus, t, dur, { vol = 0.1, type = 'bandpass', f = 1000, q = 1, a = 0.003, sweep = 0 } = {}) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  s.loop = true;
  fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  s.connect(fl).connect(g).connect(bus);
  env(g, t, vol, a, dur);
  s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
}
function kick(bus, t, vol = 0.5) { tone(bus, t, 150, 0.22, { type: 'sine', vol, slide: 42, a: 0.002 }); }
function snare(bus, t, vol = 0.22) {
  noise(bus, t, 0.18, { vol, f: 1900, q: 0.7 });
  tone(bus, t, 190, 0.08, { type: 'triangle', vol: vol * 0.6, slide: 140 });
}
function hat(bus, t, vol = 0.06, open = false) { noise(bus, t, open ? 0.16 : 0.035, { vol, type: 'highpass', f: 7500 }); }

// Непрерывный источник с управляемым gain (мотор, шины, шипение).
function loopNoise(dest, type, f, q) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  g.gain.value = 0;
  s.connect(fl).connect(g).connect(dest);
  s.start();
  return { g, fl };
}
const glide = (param, v, tc = 0.06) => param.setTargetAtTime(v, now(), tc);

// --- Разовые эффекты ---
const SFX = {
  pistol(t) {
    noise(sfxBus, t, 0.16, { vol: 0.45, f: 2400, q: 0.6, sweep: 500 });
    tone(sfxBus, t, 220, 0.09, { type: 'square', vol: 0.18, slide: 60, cut: 1800 });
  },
  smg(t) {
    noise(sfxBus, t, 0.07, { vol: 0.3, f: 3200, q: 0.9, sweep: 1200 });
    tone(sfxBus, t, 330, 0.05, { type: 'sawtooth', vol: 0.1, slide: 110, cut: 2500 });
  },
  explosion(t) {
    noise(sfxBus, t, 1.4, { vol: 0.7, type: 'lowpass', f: 2500, q: 0.5, sweep: 120, a: 0.004 });
    tone(sfxBus, t, 90, 0.9, { type: 'sine', vol: 0.6, slide: 28 });
    noise(sfxBus, t + 0.05, 0.5, { vol: 0.2, f: 800, q: 0.4, sweep: 200 });
  },
  punch(t) {
    tone(sfxBus, t, 120, 0.12, { type: 'sine', vol: 0.4, slide: 50 });
    noise(sfxBus, t, 0.06, { vol: 0.25, f: 1200, q: 0.8 });
  },
  swing(t) { noise(sfxBus, t, 0.14, { vol: 0.08, f: 900, q: 2, sweep: 2500, a: 0.04 }); },
  reload(t) {
    noise(sfxBus, t, 0.05, { vol: 0.2, f: 3500, q: 4 });
    tone(sfxBus, t, 1400, 0.03, { type: 'square', vol: 0.05, cut: 3000 });
    noise(sfxBus, t + 0.32, 0.06, { vol: 0.25, f: 2600, q: 5 });
    tone(sfxBus, t + 0.32, 900, 0.04, { type: 'square', vol: 0.06, cut: 2500 });
  },
  pickup(t) { [880, 1320, 1760].forEach((f, i) => tone(sfxBus, t + i * 0.06, f, 0.12, { type: 'triangle', vol: 0.14 })); },
  throw(t) { noise(sfxBus, t, 0.2, { vol: 0.08, f: 600, q: 2, sweep: 1800, a: 0.05 }); },
  tag(t) { [784, 988, 1175].forEach((f, i) => tone(sfxBus, t + i * 0.07, f, 0.18, { type: 'square', vol: 0.07, cut: 3000 })); },
  hurt(t) {
    tone(sfxBus, t, 160, 0.18, { type: 'sawtooth', vol: 0.2, slide: 70, cut: 900 });
    noise(sfxBus, t, 0.1, { vol: 0.18, f: 700, q: 1 });
  },
  // Трамплин: свист падающей «бомбы» на всё время полёта (время замедлено).
  whoosh(t) {
    tone(sfxBus, t, 900, 1.6, { type: 'sine', vol: 0.12, slide: 2200, a: 0.15 });
    noise(sfxBus, t, 1.4, { vol: 0.08, f: 1500, q: 3, sweep: 4000, a: 0.2 });
  },
  // Джингл «ВИРУСНЫЙ РОЛИК»: восходящее арпеджио с «лайками».
  viral(t) {
    [659, 784, 988, 1319, 1568].forEach((f, i) => tone(sfxBus, t + i * 0.075, f, 0.22, { type: 'square', vol: 0.09, cut: 4000 }));
    [2093, 2637].forEach((f, i) => tone(sfxBus, t + 0.45 + i * 0.1, f, 0.3, { type: 'triangle', vol: 0.08 }));
    kick(sfxBus, t, 0.35);
    snare(sfxBus, t + 0.375, 0.15);
  },
  // «ЗАДАНИЕ ВЫПОЛНЕНО» — на случай, если понадобится вне hud.missionPassed (там свой джингл).
  passed(t) { [523, 659, 784, 1047].forEach((f, i) => tone(sfxBus, t + i * 0.12, f, i === 3 ? 0.6 : 0.14, { type: 'square', vol: 0.08 })); },
  // Шаг: короткий глухой стук, бег чуть звонче.
  step(t) {
    noise(sfxBus, t, 0.05, { vol: 0.05 + Math.random() * 0.02, type: 'lowpass', f: 500 + Math.random() * 300, q: 1 });
    tone(sfxBus, t, 70 + Math.random() * 20, 0.04, { type: 'sine', vol: 0.06 });
  },
  // Захват района: фанфара «Сбережёнки».
  capture(t) {
    [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3], [784, 0.45], [1047, 0.55]].forEach(([f, d], i) =>
      tone(sfxBus, t + d, f, i === 5 ? 0.7 : 0.12, { type: 'square', vol: 0.08, cut: 3500 }));
    [262, 330, 392].forEach((f) => tone(sfxBus, t + 0.55, f, 0.8, { type: 'sawtooth', vol: 0.04, cut: 1500, a: 0.03 }));
    kick(sfxBus, t + 0.55, 0.3);
  },
  // Потеря района: нисходящий «вомп».
  lost(t) { [392, 330, 262, 196].forEach((f, i) => tone(sfxBus, t + i * 0.16, f, 0.25, { type: 'sawtooth', vol: 0.07, cut: 1200 })); },
  // Переключение станции: хрип эфира.
  static(t) { noise(sfxBus, t, 0.25, { vol: 0.12, f: 2500, q: 0.4, a: 0.01 }); },
};

export const sfx = {
  last: null,
  count: 0,
  played: {}, // счётчики по именам (для тестов)
  play(name, opts = {}) {
    if (!ctx || ctx.state !== 'running' || !SFX[name]) return;
    this.last = name;
    this.count++;
    this.played[name] = (this.played[name] || 0) + 1;
    try { SFX[name](now() + (opts.delay || 0)); } catch (e) { console.warn('sfx', name, e); }
  },
};

// --- Радио ---
// Процедурная петля: 16-е шаги, аккорды по тактам.
const STATIONS = [
  {
    id: 'stavka', name: 'Ставка FM', tag: 'синтвейв и новости рынка', color: '#ff5ea8', bpm: 98,
    // A минор: Am – F – C – G (бас в 2-й октаве)
    chords: [[45, [0, 3, 7]], [41, [0, 4, 7]], [48, [0, 4, 7]], [43, [0, 4, 7]]],
    step(bus, t, i, bar, s) {
      const [root, tri] = this.chords[bar % 4];
      const sx = s * 2; // длина 8-й
      if (i % 4 === 0) kick(bus, t, 0.42);
      if (i === 4 || i === 12) { snare(bus, t, 0.2); noise(bus, t, 0.5, { vol: 0.05, f: 1500, q: 0.3 }); } // «гейт-реверб»
      if (i % 2 === 1) hat(bus, t, 0.035, i === 15);
      // Бас: пульсирующие восьмые, октава через одну.
      if (i % 2 === 0) tone(bus, t, midi(root + (i % 4 === 2 ? 12 : 0)), sx * 0.9, { type: 'sawtooth', vol: 0.11, cut: 520, q: 4 });
      // Арпеджио 16-ми: вверх-вниз по трезвучию.
      const ap = [0, 1, 2, 3, 2, 1, 0, 1][i % 8];
      const n = root + 24 + (ap === 3 ? 12 : tri[ap]);
      tone(bus, t, midi(n), s * 0.8, { type: 'square', vol: 0.035, cut: 2200 + 1200 * Math.sin(bar * 0.7 + i * 0.2), q: 3 });
      // Пэд: аккорд на весь такт, детюн.
      if (i === 0) for (const k of tri) for (const dt of [-9, 9]) tone(bus, t, midi(root + 12 + k), s * 15, { type: 'sawtooth', vol: 0.018, a: 0.35, cut: 1100, detune: dt });
    },
  },
  {
    id: 'retro', name: 'Ретро-кэш', tag: 'хиты эпохи сберкнижек', color: '#7ad7ff', bpm: 132,
    // E дорийский: Em7 – A – Em7 – D, чиптюн
    chords: [[40, [0, 3, 7, 10]], [45, [0, 4, 7, 9]], [40, [0, 3, 7, 10]], [38, [0, 4, 7, 11]]],
    scale: [0, 2, 3, 5, 7, 9, 10],
    step(bus, t, i, bar, s) {
      const [root, ch] = this.chords[bar % 4];
      // Ломаный бит.
      if (i === 0 || i === 6 || i === 10) tone(bus, t, 110, 0.12, { type: 'square', vol: 0.18, slide: 40, cut: 600 });
      if (i === 4 || i === 12) noise(bus, t, 0.12, { vol: 0.16, f: 3000, q: 0.5 });
      if (i % 2 === 0) hat(bus, t, 0.03);
      // Бас «бум-чик» треугольником.
      if (i % 4 === 0) tone(bus, t, midi(root), s * 1.6, { type: 'triangle', vol: 0.22 });
      if (i % 4 === 2) tone(bus, t, midi(root + 7), s * 0.8, { type: 'triangle', vol: 0.15 });
      // Аккорд-«стэб» пульсом на слабые доли.
      if (i % 4 === 2) for (const k of ch.slice(1)) tone(bus, t, midi(root + 24 + k), s * 0.5, { type: 'square', vol: 0.02, cut: 3000 });
      // Мелодия: псевдослучайная, но повторяется каждые 8 тактов.
      const h = Math.sin((bar % 8) * 12.9898 + i * 78.233) * 43758.5453;
      const r = h - Math.floor(h);
      if (i % 2 === 0 && r < 0.55) {
        const deg = Math.floor(r * 13) % 7, oct = r < 0.12 ? 12 : 0;
        tone(bus, t, midi(40 + 24 + this.scale[deg] + oct), s * (r < 0.25 ? 1.8 : 0.9), { type: 'square', vol: 0.05, cut: 3500, detune: 6 });
      }
    },
  },
  { id: 'off', name: 'Радио выключено', color: '#bbbbbb' },
];

// Реклама-пародия: тексты из DECOR.md / NARRATIVE.md.
const ADS = {
  red: [
    'Кредит за 5 минут. Отдавать — всю жизнь.',
    'Одобрим даже вашего кота! Кот выступает поручителем.',
    'Мы знаем, где вы живёте. Мы выдали вам ипотеку.',
    'Не хватает до зарплаты? Не хватит и после.',
    'Звоним 40 раз в день. Потому что заботимся.',
  ],
  yellow: [
    'Мы не банк, мы ваш образ жизни. И ваших детей тоже.',
    'Мы не банк. Мы экосистема. Мы уже у вас в телефоне.',
    'Кэшбэк 30% баллами, которые сгорают в полночь.',
    'Курьер уже едет. Мы не знаем зачем.',
    'Подписка на подписку — всего 199 ₽ в месяц.',
  ],
  green: [
    'Копим вместе. Навсегда.',
    'Как у бабушки, только с нейросетью.',
    'Вклад «Заоблачный» — 0,01% годовых, зато надёжно.',
    'Очередь — это тоже комьюнити.',
  ],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};
const B = (bank, text = BANKS[bank].name) => `<b style="color:${BANKS[bank].css}">${text}</b>`;

class Audio {
  constructor(c) {
    this.c = c;                 // { hud, war, districts, graffiti, input, arsenal, player }
    this.volume = 0.8;
    try { const v = parseFloat(localStorage.getItem(VOL_KEY)); if (v >= 0 && v <= 1) this.volume = v; } catch {}
    this.station = 0;
    this.inCar = false;
    this.djT = 6;               // секунд до следующей реплики диджея (в машине на «Ставке FM»)
    this.djN = 0;
    this.lastDj = '';
    this.step = 0;
    this.nextT = 0;
    this.lastHp = null;
    this.ready = false;
  }

  get ctx() { return ctx; }
  get sfx() { return sfx; }
  get stationName() { return STATIONS[this.station].name; }
  get radioOn() { return this.inCar && STATIONS[this.station].id !== 'off'; }

  // Создаём/будим AudioContext по жесту пользователя.
  start() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.build();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { console.warn('audio', e); }
  }

  build() {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    // Радио: «из динамика машины» — срез низа и верха + эхо.
    radioBus = ctx.createGain(); radioBus.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    radioBus.connect(hp).connect(lp).connect(master);
    this.echo = ctx.createDelay(1); this.echo.delayTime.value = 0.3;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.echo.connect(fb).connect(this.echo);
    this.echo.connect(wet).connect(radioBus);
    this.duck = ctx.createGain(); this.duck.gain.value = 1;
    this.duck.connect(radioBus);
    this.newSong();
    // Непрерывные: мотор (две пилы через НЧ-фильтр), шины, баллончик.
    this.engine = { g: ctx.createGain(), o1: ctx.createOscillator(), o2: ctx.createOscillator(), fl: ctx.createBiquadFilter() };
    const E = this.engine;
    E.o1.type = 'sawtooth'; E.o2.type = 'square'; E.o2.detune.value = -1200 + 7;
    E.fl.type = 'lowpass'; E.fl.frequency.value = 300; E.fl.Q.value = 2;
    E.g.gain.value = 0;
    E.o1.connect(E.fl); E.o2.connect(E.fl); E.fl.connect(E.g).connect(sfxBus);
    E.o1.start(); E.o2.start();
    this.tires = loopNoise(sfxBus, 'bandpass', 2400, 9);
    this.tireTone = ctx.createOscillator(); this.tireTone.type = 'triangle'; this.tireTone.frequency.value = 1100;
    this.tireToneG = ctx.createGain(); this.tireToneG.gain.value = 0;
    this.tireTone.connect(this.tireToneG).connect(sfxBus); this.tireTone.start();
    this.hiss = loopNoise(sfxBus, 'highpass', 3500, 0.5);
    // Сирена «Проверки ЦБ»: вой двумя тонами с медленным ЛФО.
    this.siren = { o: ctx.createOscillator(), lfo: ctx.createOscillator(), depth: ctx.createGain(), g: ctx.createGain() };
    const S = this.siren;
    S.o.type = 'square'; S.o.frequency.value = 760;
    S.lfo.type = 'triangle'; S.lfo.frequency.value = 0.45; S.depth.gain.value = 260;
    S.lfo.connect(S.depth).connect(S.o.frequency);
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1800;
    S.g.gain.value = 0;
    S.o.connect(sf).connect(S.g).connect(sfxBus);
    S.o.start(); S.lfo.start();
    // Планировщик музыки: своя «часовая» петля, не зависит от FPS и паузы игры.
    this.timer = setInterval(() => this.schedule(), 40);
    this.ready = true;
  }

  // Новая «песня»: свой узел, старые запланированные ноты глушатся вместе с ним.
  newSong() {
    if (this.song) {
      const old = this.song;
      old.gain.setTargetAtTime(0, now(), 0.03);
      setTimeout(() => old.disconnect(), 400);
    }
    this.song = ctx.createGain();
    this.song.gain.value = 1;
    this.song.connect(this.duck);
    this.song.connect(this.echo);
    const st = STATIONS[this.station];
    if (st.bpm) this.echo.delayTime.setValueAtTime((60 / st.bpm) * 0.75, now());
    this.step = 0;
    this.nextT = now() + 0.08;
  }

  schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const st = STATIONS[this.station];
    if (!st.step || !this.inCar) { this.nextT = now() + 0.08; this.step = 0; return; }
    const s = 60 / st.bpm / 4;
    if (this.nextT < now() - 0.2) this.nextT = now() + 0.05; // вкладка спала — не догоняем
    while (this.nextT < now() + 0.25) {
      try { st.step(this.song, this.nextT, this.step % 16, Math.floor(this.step / 16), s); } catch (e) { console.warn(e); }
      this.step++;
      this.nextT += s;
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(VOL_KEY, String(this.volume)); } catch {}
    if (master) glide(master.gain, this.volume, 0.03);
    this.c.hud.subtitle(`Громкость: <b>${Math.round(this.volume * 100)}%</b>`, 1500);
  }

  nextStation() {
    if (!this.inCar) return;
    this.station = (this.station + 1) % STATIONS.length;
    sfx.play('static');
    if (ctx) this.newSong();
    this.announce();
    this.djT = 5;
  }

  announce() {
    const st = STATIONS[this.station];
    this.c.hud.subtitle(st.tag ? `📻 <b style="color:${st.color}">${st.name}</b> · ${st.tag}` : `📻 <b style="color:${st.color}">${st.name}</b>`, 2500);
  }

  // Реплика диджея «Ставки FM»: статистика игрока и реклама по очереди.
  dj() {
    const { war, districts, graffiti } = this.c;
    const mine = districts.filter((d) => d.owner === 'green');
    const walls = graffiti.tags.filter((t) => t.owner === 'green').length;
    const reach = Math.round(war.reach);
    const lines = [
      () => `пиарщик ${B('green', 'Сбережёнки')} уже перекрасил ${walls} ${plural(walls, 'стену', 'стены', 'стен')}. ${B('red', 'Алый')} в бешенстве!`,
      () => `охваты ${B('green', 'Сбережёнки')} — <b>${reach}</b>. Стартапов нервно обновляет дашборд.`,
      () => mine.length
        ? `у ${B('green', 'Сбережёнки')} ${mine.length} ${plural(mine.length, 'район', 'района', 'районов')} из ${districts.length}: ${mine.map((d) => d.name).join(', ')}. Акции конкурентов падают.`
        : `у ${B('green', 'Сбережёнки')} пока 0 районов из ${districts.length}. ${B('red', 'Алый')} уже празднует. Рано!`,
      () => `${B('red', 'Алый-банк')} держит ${war.count('red')}, ${B('yellow', 'Тёплый-Банк')} — ${war.count('yellow')}. Ценовая война в разгаре!`,
    ];
    let html;
    if (this.djN % 2 === 1) {
      const bank = this.djN % 6 === 5 ? 'green' : this.djN % 4 === 1 ? 'red' : 'yellow';
      html = `<b style="color:#ff5ea8">Ставка FM · реклама:</b> ${B(bank)}. ${pick(ADS[bank])}`;
    } else {
      html = `<b style="color:#ff5ea8">Ставка FM:</b> ${lines[(this.djN / 2) % lines.length]()}`;
    }
    this.djN++;
    this.lastDj = html;
    this.c.hud.subtitle(html, 6500);
    // Голос диджея: приглушаем музыку и «бормочем» короткими формантами.
    if (ctx && ctx.state === 'running') {
      const t = now();
      this.duck.gain.setTargetAtTime(0.35, t, 0.1);
      this.duck.gain.setTargetAtTime(1, t + 5.5, 0.4);
      for (let k = 0; k < 10; k++) {
        const f = 140 + Math.random() * 70;
        tone(radioBus, t + 0.1 + k * 0.17 + Math.random() * 0.05, f, 0.12, { type: 'sawtooth', vol: 0.05, cut: 900 + Math.random() * 600, q: 6, slide: f * 0.85 });
      }
    }
    return html;
  }

  update(dt, { inCar = false, speed = 0 } = {}) {
    const { input, arsenal, player } = this.c;
    // Посадка / выход.
    if (inCar !== this.inCar) {
      this.inCar = inCar;
      if (inCar) { this.announce(); this.djT = Math.min(this.djT, 6); if (ctx) this.newSong(); }
    }
    // Урон игроку.
    if (this.lastHp != null && player.hp < this.lastHp - 0.5) sfx.play('hurt');
    this.lastHp = player.hp;
    // Захват / потеря района.
    const green = this.c.war.count('green');
    if (this.lastGreen != null && green > this.lastGreen) sfx.play('capture');
    if (this.lastGreen != null && green < this.lastGreen) sfx.play('lost');
    this.lastGreen = green;
    // Шаги: по пройденному пути.
    const p = player.position;
    if (!inCar && this.lastPos && player.grounded !== false && dt > 0) {
      const d = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
      if (d < 2) {
        this.stepDist = (this.stepDist || 0) + d;
        const stride = d / dt > 6 ? 1.6 : 1.1;
        if (this.stepDist > stride) { this.stepDist = 0; sfx.play('step'); }
      }
    }
    this.lastPos = { x: p.x, z: p.z };
    // Диджей.
    if (this.radioOn && STATIONS[this.station].id === 'stavka') {
      this.djT -= dt;
      if (this.djT <= 0) { this.djT = 20; this.dj(); }
    }
    if (!this.ready || ctx.state !== 'running') return;
    // Радио слышно только в машине.
    glide(radioBus.gain, this.radioOn ? 0.55 : 0, this.radioOn ? 0.15 : 0.04);
    // Мотор: тон по скорости, чуть громче на газу.
    const v = Math.abs(speed), E = this.engine;
    const gas = inCar && (input.up || input.down) ? 1 : 0;
    const rpm = 38 + v * 3.2 + gas * 8 - Math.floor(v / 14) * 14; // «передачи»
    glide(E.o1.frequency, rpm, 0.08); glide(E.o2.frequency, rpm * 2, 0.08);
    glide(E.fl.frequency, 260 + v * 22 + gas * 250, 0.1);
    glide(E.g.gain, inCar ? 0.07 + gas * 0.05 + Math.min(v, 30) * 0.002 : 0, 0.08);
    // Визг шин: ручник на скорости.
    const skid = inCar && input.brake && v > 8 ? Math.min(1, (v - 8) / 15) : 0;
    glide(this.tires.g.gain, skid * 0.12, 0.05);
    glide(this.tireToneG.gain, skid * 0.03, 0.05);
    glide(this.tireTone.frequency, 950 + Math.random() * 250, 0.05);
    // Баллончик: шипит, пока держишь ЛКМ.
    const spraying = !inCar && input.fire && arsenal.current === 'spray';
    glide(this.hiss.g.gain, spraying ? 0.09 : 0, 0.03);
    // Сирена: контратака конкурента на наш район или звёзды розыска.
    const alarm = !!this.c.war.counter || (this.c.hud.wanted || 0) > 0;
    glide(this.siren.g.gain, alarm ? 0.035 : 0, 0.3);
  }
}

export let audio = null;
export function initAudio(c) {
  audio = new Audio(c);
  // Первый жест (кнопка «Играть», клик, клавиша) запускает звук.
  const wake = () => audio.start();
  for (const ev of ['pointerdown', 'click', 'keydown']) addEventListener(ev, wake, { capture: true });
  // Громкость: «-» / «=» (M занята картой).
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') audio.setVolume(audio.volume - 0.1);
    if (e.code === 'Equal' || e.code === 'NumpadAdd') audio.setVolume(audio.volume + 0.1);
  });
  return audio;
}
