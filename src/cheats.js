// Чит-коды: набираешь слово во время игры (буфер последних букв копится параллельно с управлением).
export function initCheats({ war, player, traffic, hud }) {
  const s = document.createElement('style');
  s.textContent = `#cheatBanner{position:fixed;left:50%;top:40%;transform:translate(-50%,-50%) scale(.6);z-index:900;pointer-events:none;opacity:0;text-align:center;font-family:'Press Start 2P',monospace;transition:opacity .25s,transform .25s}
  #cheatBanner.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
  #cheatBanner b{display:block;font-size:34px;color:#ffd23f;text-shadow:4px 4px #000,0 0 18px #ff9d00}
  #cheatBanner i{display:block;margin-top:16px;font-size:13px;font-style:normal;color:#fff;text-shadow:2px 2px #000}`;
  document.head.appendChild(s);
  const ban = document.createElement('div');
  ban.id = 'cheatBanner';
  ban.innerHTML = '<b>ЧИТ АКТИВИРОВАН</b><i>Палыч: Я этого не видел</i>';
  document.body.appendChild(ban);
  let bt = 0;
  const flash = () => { ban.classList.add('show'); clearTimeout(bt); bt = setTimeout(() => ban.classList.remove('show'), 2200); };

  let sanctionsUntil = 0;
  const origUpdate = traffic.update.bind(traffic);
  traffic.update = (dt, obs) => { if (performance.now() < sanctionsUntil) return; origUpdate(dt, obs); };

  const CHEATS = {
    CASHBACK: () => { war.addMoney(5000); player.hp = player.maxHp; hud.toast('CASHBACK: +$5000 и здоровье', '#7dff8a'); },
    KEYRATE: () => hud.toast('Ключевая ставка снижена. Розыск сброшен', '#7ad7ff'),
    SANCTIONS: () => { sanctionsUntil = performance.now() + 10000; hud.toast('САНКЦИИ: трафик встал на 10 с', '#ff6b6b'); },
    IPO: () => { war.addMoney(1000); hud.toast('IPO состоялось: +$1000', '#ffd23f'); },
  };
  let buf = '';
  addEventListener('keydown', (e) => {
    if (e.repeat || !/^Key[A-Z]$/.test(e.code)) return;
    buf = (buf + e.code[3]).slice(-12);
    for (const [name, fn] of Object.entries(CHEATS)) {
      if (buf.endsWith(name)) { buf = ''; fn(); flash(); break; }
    }
  });
  return { type: (word) => { for (const ch of word) dispatchEvent(new KeyboardEvent('keydown', { code: 'Key' + ch })); } };
}
