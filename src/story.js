import * as THREE from 'three';

// «Сторис» (P): фото-режим 9:16 + пасхалка «Выход из Афимолла».
export function initStory({ renderer, scene, camera, retro, player, hud }) {
  const st = document.createElement('style');
  st.textContent = `
  body.jury-story #hud, body.jury-story #damage, body.jury-story #cheatBanner{display:none!important}
  #storyUi{position:fixed;inset:0;z-index:800;pointer-events:none;display:none;font-family:'Press Start 2P',monospace;color:#fff}
  body.jury-story #storyUi{display:block}
  #storyFrame{position:absolute;top:0;bottom:0;left:50%;aspect-ratio:9/16;height:100%;transform:translateX(-50%);box-shadow:0 0 0 100vmax rgba(0,0,0,.72);border:3px solid #fff}
  #storyTag{position:absolute;top:5%;left:6%;font-size:min(2.4vh,16px);text-shadow:2px 2px #000}
  #storyTag b{display:block;margin-top:8px;color:#2ecc59}
  #storyHash{position:absolute;bottom:14%;left:6%;font-size:min(3.2vh,22px);color:#ffd23f;text-shadow:3px 3px #000}
  #storyLikes{position:absolute;bottom:7%;left:6%;font-size:min(2.2vh,15px);text-shadow:2px 2px #000}
  #storyBtn{position:absolute;bottom:2%;left:50%;transform:translateX(-50%);font-size:11px;background:#2ecc59;color:#000;border:3px solid #000;padding:8px 12px;font-family:inherit;pointer-events:auto;cursor:pointer}
  #storyHint{position:absolute;bottom:2%;right:3%;font-size:9px;color:#ccc}
  #mallSign{position:fixed;inset:0;z-index:1500;background:#0b0b10;overflow:hidden;font-family:'Press Start 2P',monospace;color:#fff;display:none}
  #mallSign.show{display:block}
  #mallSign .floor{position:absolute;left:0;right:0;bottom:0;height:38%;background:repeating-linear-gradient(90deg,#c9c2b0 0 120px,#aaa38f 120px 124px)}
  #mallSign .ceil{position:absolute;left:0;right:0;top:0;height:22%;background:repeating-linear-gradient(90deg,#222 0 120px,#fff7c2 120px 160px)}
  #mallSign .sign{position:absolute;top:36%;font-size:20px;background:#1d8f3e;border:4px solid #fff;padding:12px 16px;white-space:nowrap}
  #mallMsg{position:absolute;top:8%;width:100%;text-align:center;font-size:14px;color:#ffd23f;text-shadow:3px 3px #000}
  #mallMsg.win{font-size:20px;color:#7dff8a}
  #mallEsc{position:absolute;bottom:3%;width:100%;text-align:center;font-size:9px;color:#999}`;
  document.head.appendChild(st);

  const ui = document.createElement('div');
  ui.id = 'storyUi';
  ui.innerHTML = `<div id="storyFrame"><div id="storyTag">@pr_sberezhenka<b>● в сети</b></div><div id="storyHash">#SBERTEAM</div>
    <div id="storyLikes">♥ 0</div></div><button id="storyBtn">СОХРАНИТЬ PNG [Enter]</button><div id="storyHint">P / Esc — выход</div>`;
  document.body.appendChild(ui);

  let pT = 0;
  let on = false, likeRaf = 0, wantShot = false, lastShot = null;
  const origRender = retro.render.bind(retro);
  retro.render = (s, c) => {
    origRender(s, c);
    if (wantShot) { wantShot = false; lastShot = renderer.domElement.toDataURL('image/png'); finishShot(); }
  };

  const likes = () => {
    const el = document.getElementById('storyLikes'), target = 1000 + Math.floor(Math.random() * 9000), t0 = performance.now();
    cancelAnimationFrame(likeRaf);
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 1000);
      el.textContent = `♥ ${Math.round(target * (1 - (1 - k) ** 3))}`;
      if (k < 1) likeRaf = requestAnimationFrame(tick);
    };
    tick();
  };
  const toggle = (v = !on) => {
    on = v;
    document.body.classList.toggle('jury-story', on);
    if (on) { document.exitPointerLock?.(); likes(); }
    else cancelAnimationFrame(likeRaf);
  };
  const shoot = () => { wantShot = true; };
  function finishShot() {
    const img = new Image();
    img.onload = () => {
      const h = img.height, w = Math.round(h * 9 / 16), x = Math.round((img.width - w) / 2);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.drawImage(img, x, 0, w, h, 0, 0, w, h);
      const u = h / 100;
      g.fillStyle = '#fff'; g.textBaseline = 'top'; g.shadowColor = '#000'; g.shadowOffsetX = g.shadowOffsetY = u * .3;
      g.font = `${u * 3}px 'Press Start 2P', monospace`; g.fillText('@pr_sberezhenka', w * .06, h * .05);
      g.fillStyle = '#ffd23f'; g.font = `${u * 4.2}px 'Press Start 2P', monospace`; g.fillText('#SBERTEAM', w * .06, h * .82);
      g.fillStyle = '#fff'; g.font = `${u * 2.8}px 'Press Start 2P', monospace`; g.fillText(document.getElementById('storyLikes').textContent, w * .06, h * .9);
      const a = document.createElement('a');
      a.download = `sberteam-story-${Date.now()}.png`; a.href = c.toDataURL('image/png');
      document.body.appendChild(a); a.click(); a.remove();
      hud.toast('Сторис сохранена', '#7dff8a');
    };
    img.src = lastShot;
  }
  document.getElementById('storyBtn').onclick = shoot;
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    // «P» входит в чит IPO: ждём 350 мс — если дальше набирают другие буквы, это чит, а не сторис.
    if (/^Key[A-Z]$/.test(e.code) && e.code !== 'KeyP') clearTimeout(pT);
    if (e.code === 'KeyP') { clearTimeout(pT); pT = setTimeout(() => toggle(), on ? 0 : 350); }
    else if (on && e.code === 'Escape') toggle(false);
    else if (on && e.code === 'Enter') shoot();
  });

  // --- Пасхалка «Выход из Афимолла» ---
  const SIGN = new THREE.Vector3(-27, 3.4, -5.4); // у южной стороны квартала (2,2)
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = '#1d8f3e'; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
  g.fillStyle = '#fff'; g.font = "bold 40px Impact, 'Arial Black', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ВЫХОД →', 128, 50);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.copy(SIGN);
  scene.add(sign);

  const mall = document.createElement('div');
  mall.id = 'mallSign';
  mall.innerHTML = '<div class="ceil"></div><div class="floor"></div><div id="mallMsg"></div><div id="mallEsc">Esc — выйти</div>';
  document.body.appendChild(mall);
  let mallOn = false, signs = [], laps = 0, mallRaf = 0, won = false;
  const msg = document.getElementById('mallMsg');
  function mallStop() { mallOn = false; mall.classList.remove('show'); cancelAnimationFrame(mallRaf); signs.forEach((s) => s.remove()); signs = []; }
  function mallStart() {
    mallOn = true; laps = 0; won = false; mall.classList.add('show'); document.exitPointerLock?.();
    msg.className = ''; msg.textContent = 'Круг 0 · Вы почти у выхода';
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('div'); s.className = 'sign'; s.textContent = 'ВЫХОД →'; s.dataset.x = String(i * 380 - 100);
      mall.appendChild(s); signs.push(s);
    }
    let prev = performance.now();
    const tick = (t) => {
      const dt = (t - prev) / 1000; prev = t;
      for (const s of signs) {
        let x = Number(s.dataset.x) - 260 * dt;
        if (x < -300) { x += 1900; if (s === signs[0]) lapDone(); }
        s.dataset.x = String(x); s.style.transform = `translateX(${x}px) scale(${0.6 + 0.4 * Math.min(1, Math.max(0, x / innerWidth))})`; s.style.left = '0';
      }
      if (mallOn) mallRaf = requestAnimationFrame(tick);
    };
    mallRaf = requestAnimationFrame(tick);
  }
  function lapDone() {
    laps++;
    if (laps >= 2 && !won) { won = true; msg.className = 'win'; msg.textContent = '★ Достижение: Вы нашли выход из Афимолла… нет'; }
    else if (!won) msg.textContent = `Круг ${laps} · Табличка снова ведёт сюда`;
  }
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (mallOn && e.code === 'Escape') mallStop();
    else if (!mallOn && e.code === 'KeyF' && player.mesh.visible && player.position.distanceTo(new THREE.Vector3(SIGN.x, 0, SIGN.z)) < 8) mallStart();
  });
  return { toggle, shoot, mallStart, mallStop, sign, get isOn() { return on; } };
}
