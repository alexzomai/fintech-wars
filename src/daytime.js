// Игровое время: 1 реальная секунда = 1 игровая минута, старт 18:30 (закат).
// Уровень ночи 0..1: закат → сумерки (19:30–21:00) → неоновая ночь (21:00–04:30) → рассвет (до 06:30) → день.
export const DAY_MIN = 24 * 60;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function nightLevel(min) {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  if (m >= 12 * 60) return smooth(19.5 * 60, 21 * 60, m);
  return 1 - smooth(4.5 * 60, 6.5 * 60, m);
}

export function createDaytime(start = 13 * 60) { // день по умолчанию
  return {
    minutes: start, // игровые минуты от полуночи (растут без ограничения, по модулю — время суток)
    played: 0, // реальные секунды в игре
    update(dt) { this.minutes += dt; this.played += dt; },
    get hm() { const m = Math.floor(((this.minutes % DAY_MIN) + DAY_MIN) % DAY_MIN); return [Math.floor(m / 60), m % 60]; },
    get night() { return nightLevel(this.minutes); },
    // Перемотка вперёд к ближайшему hh:mm.
    skipTo(h, m = 0) {
      const now = ((this.minutes % DAY_MIN) + DAY_MIN) % DAY_MIN;
      this.minutes += (((h * 60 + m) - now) % DAY_MIN + DAY_MIN) % DAY_MIN;
    },
    // N: ночью — к закату следующего дня, иначе — к 21:00.
    toggleNight() { if (this.night > 0.5) this.skipTo(18, 30); else this.skipTo(21, 0); return this.night > 0.5; },
    label() { const [h, m] = this.hm; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; },
  };
}
