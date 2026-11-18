// Игровое время. Старт 13:00 — ясный день. Днём 1 реальная секунда = 0,5 игровой минуты (день длинный),
// в сумерках 1:1, глубокой ночью ×3 (ночь короткая): сутки ≈ 21 мин реального времени, из них ночь ≈ 3 мин.
// Фазы: день → закат (17:00–18:30) → сумерки → ночь (с 21:00) → рассвет (04:30–07:00) → день.
export const DAY_MIN = 24 * 60;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrapMin = (m) => ((m % DAY_MIN) + DAY_MIN) % DAY_MIN;

// Уровень ночи 0..1.
export function nightLevel(min) {
  const m = wrapMin(min);
  if (m >= 12 * 60) return smooth(19.5 * 60, 21 * 60, m);
  return 1 - smooth(4.5 * 60, 6 * 60, m);
}
// Уровень «закатности» 0..1 (тёплое низкое солнце) — вечером и на рассвете.
export function sunsetLevel(min) {
  const m = wrapMin(min);
  if (m >= 12 * 60) return smooth(17 * 60, 18.5 * 60, m);
  return 1 - smooth(6 * 60, 7.5 * 60, m);
}
// Скорость времени (игровых минут в секунду).
function rate(min) {
  const m = wrapMin(min);
  if (m >= 21 * 60 || m < 4.5 * 60) return 3;
  if (m >= 7 * 60 && m < 17 * 60) return 0.5;
  return 1;
}

export function createDaytime(start = 13 * 60) { // день по умолчанию
export function createDaytime(start = 13 * 60) {
  return {
    minutes: start, // игровые минуты от полуночи (растут без ограничения)
    played: 0, // реальные секунды в игре
    update(dt) { this.minutes += dt * rate(this.minutes); this.played += dt; },
    get hm() { const m = Math.floor(wrapMin(this.minutes)); return [Math.floor(m / 60), m % 60]; },
    get night() { return nightLevel(this.minutes); },
    get sunset() { return sunsetLevel(this.minutes); },
    // Перемотка вперёд к ближайшему hh:mm.
    skipTo(h, m = 0) {
      this.minutes += wrapMin((h * 60 + m) - wrapMin(this.minutes));
    },
    // N: днём — к ночи (22:00), ночью — к следующему дню (13:00).
    toggleNight() { if (this.night > 0.5) this.skipTo(13, 0); else this.skipTo(22, 0); return this.night > 0.5; },
    label() { const [h, m] = this.hm; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; },
  };
}
