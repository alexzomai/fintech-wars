// Озвучка реплик синтезатором речи браузера (Web Speech API, ru-RU).
// Нет русского голоса или нет speechSynthesis (headless) — молчим, но реплики всё равно пишем в log.
// Очередь: одновременно звучит одна реплика, не чаще раза в MIN_GAP мс, в очереди не больше QUEUE_MAX.

const MIN_GAP = 1200, QUEUE_MAX = 3, LS_KEY = 'fintech-wars-voice-v1';

// «Персонажи»: высота (0..2) и скорость (0.1..10) голоса.
export const VOICES = {
  'диктор': { pitch: 0.85, rate: 1.05 },
  'палыч': { pitch: 0.2, rate: 0.85 },        // басом
  'менеджер': { pitch: 2, rate: 1.35 },       // писклявый
  'юрлицо': { pitch: 0.6, rate: 0.55 },       // замедленный
  'бабушка': { pitch: 1.6, rate: 0.8 },
  'пиарщик': { pitch: 1.2, rate: 1.15 },
};
// Неизвестное имя — стабильный «случайный» голос по хешу имени.
export function profileFor(name = '') {
  const key = name.trim().toLowerCase();
  for (const k in VOICES) if (key.startsWith(k)) return VOICES[k];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { pitch: 0.6 + (h % 100) / 100, rate: 0.85 + ((h >> 8) % 40) / 100 };
}

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

class Voice {
  constructor() {
    this.queue = [];
    this.log = []; // [{ text, pitch, rate, spoken }] — для тестов и отладки
    this.busyUntil = 0;
    this.lastStart = -Infinity;
    this.ruVoice = null;
    try { this.enabled = localStorage.getItem(LS_KEY) !== 'off'; } catch { this.enabled = true; }
    if (synth) {
      const pick = () => {
        try {
          const vs = synth.getVoices() || [];
          this.ruVoice = vs.find((v) => /^ru(-|_|$)/i.test(v.lang)) || null;
        } catch { this.ruVoice = null; }
      };
      pick();
      try { synth.addEventListener?.('voiceschanged', pick); } catch { /* старые браузеры */ }
    }
  }

  get available() { return !!(synth && this.ruVoice); }

  toggle(on = !this.enabled) {
    this.enabled = on;
    try { localStorage.setItem(LS_KEY, on ? 'on' : 'off'); } catch { /* приватный режим */ }
    if (!on) { this.queue.length = 0; try { synth?.cancel(); } catch { /* ignore */ } this.busyUntil = 0; }
    return on;
  }

  // text — что сказать; pitch/rate — голос персонажа.
  say(text, { pitch = 1, rate = 1 } = {}) {
    text = String(text || '').trim();
    if (!text || !this.enabled) return false;
    this.queue.push({ text, pitch, rate });
    while (this.queue.length > QUEUE_MAX) this.queue.shift(); // старые реплики теряют актуальность
    this.pump();
    return true;
  }

  pump() {
    const now = performance.now();
    if (!this.queue.length) return;
    if (now < this.busyUntil || now - this.lastStart < MIN_GAP) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.pump(), Math.max(this.busyUntil - now, MIN_GAP - (now - this.lastStart), 50));
      return;
    }
    const item = this.queue.shift();
    this.lastStart = now;
    // Запасной таймер: onend в Chrome иногда не приходит.
    const est = 600 + (item.text.length * 75) / item.rate;
    this.busyUntil = now + est;
    let spoken = false;
    if (this.available) {
      try {
        const u = new SpeechSynthesisUtterance(item.text);
        u.voice = this.ruVoice;
        u.lang = this.ruVoice.lang || 'ru-RU';
        u.pitch = Math.max(0, Math.min(2, item.pitch));
        u.rate = Math.max(0.1, Math.min(10, item.rate));
        u.onend = u.onerror = () => { this.busyUntil = performance.now(); this.pump(); };
        synth.speak(u);
        spoken = true;
      } catch { spoken = false; }
    }
    this.log.push({ ...item, spoken });
    if (this.log.length > 50) this.log.shift();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.pump(), est);
  }
}

export const voice = new Voice();

// Реплика в субтитрах вида «Имя: текст» → озвучиваем голосом персонажа «Имя».
const SPEECH = /^\s*([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z.\- ]{0,24}):\s+(.+)$/s;
export function parseSpeech(html) {
  const plain = String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '').trim();
  const m = plain.match(SPEECH);
  return m ? { name: m[1].trim(), text: m[2].trim() } : null;
}

// Обёртка над hud.subtitle и клавиша V (вкл/выкл озвучки).
export function attachVoice(hud) {
  const orig = hud.subtitle.bind(hud);
  hud.subtitle = (html, ms) => {
    orig(html, ms);
    const s = parseSpeech(html);
    if (s) voice.say(s.text, profileFor(s.name));
  };
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyV' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const on = voice.toggle();
    orig(`Озвучка <b>${on ? 'включена' : 'выключена'}</b> (V)`, 1800);
  });
  return voice;
}
