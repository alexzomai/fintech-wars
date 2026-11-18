// Чит-коды: набираешь слово во время игры (буфер последних букв копится параллельно с управлением).
export function initCheats({ war, player, traffic, hud }) {
  // «ЧИТ АКТИВИРОВАН» — субтитром внизу, как и остальные события.
  // Один субтитр на чит: «ЧИТ АКТИВИРОВАН · что случилось».
  const say = (text, color) => hud.subtitle(`<b style="color:#ffd23f">ЧИТ АКТИВИРОВАН</b> · <b style="color:${color}">${text}</b>`, 3500);

  let sanctionsUntil = 0;
  const origUpdate = traffic.update.bind(traffic);
  traffic.update = (dt, obs) => { if (performance.now() < sanctionsUntil) return; origUpdate(dt, obs); };

  const CHEATS = {
    CASHBACK: () => { war.addMoney(5000); player.hp = player.maxHp; say('CASHBACK: +$5000 и здоровье', '#7dff8a'); },
    KEYRATE: () => say('Ключевая ставка снижена. Розыск сброшен', '#7ad7ff'),
    SANCTIONS: () => { sanctionsUntil = performance.now() + 10000; say('САНКЦИИ: трафик встал на 10 с', '#ff6b6b'); },
    IPO: () => { war.addMoney(1000); say('IPO состоялось: +$1000', '#ffd23f'); },
  };
  let buf = '';
  addEventListener('keydown', (e) => {
    if (e.repeat || !/^Key[A-Z]$/.test(e.code)) return;
    buf = (buf + e.code[3]).slice(-12);
    for (const [name, fn] of Object.entries(CHEATS)) {
      if (buf.endsWith(name)) { buf = ''; fn(); break; }
    }
  });
  return { type: (word) => { for (const ch of word) dispatchEvent(new KeyboardEvent('keydown', { code: 'Key' + ch })); } };
}
