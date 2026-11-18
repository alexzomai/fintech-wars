import * as THREE from 'three';

// Маркеры врагов войны и контратаки: красный треугольник над головой,
// а если враг за кадром — стрелка на краю экрана (DOM).
const _v = new THREE.Vector3();
const MAX_ARROWS = 12;

function triangleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath();
  g.moveTo(8, 10); g.lineTo(56, 10); g.lineTo(32, 54); g.closePath();
  g.fillStyle = '#ff2a2a'; g.fill();
  g.lineWidth = 5; g.strokeStyle = '#000'; g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export class Markers {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.mat = new THREE.SpriteMaterial({ map: triangleTexture(), depthTest: false, transparent: true });
    this.sprites = new Map(); // враг → спрайт
    this.root = document.createElement('div');
    this.root.id = 'enemyArrows';
    this.root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden';
    document.body.appendChild(this.root);
    this.arrows = [];
    for (let i = 0; i < MAX_ARROWS; i++) {
      const a = document.createElement('div');
      a.style.cssText = 'position:absolute;width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;'
        + 'border-bottom:22px solid #ff2a2a;filter:drop-shadow(0 0 2px #000) drop-shadow(0 0 1px #000);display:none;transform-origin:50% 50%';
      this.root.appendChild(a);
      this.arrows.push(a);
    }
  }

  // list — живые враги текущей войны/контратаки.
  update(list, t = 0) {
    const set = new Set(list);
    for (const [e, s] of this.sprites) if (!set.has(e)) { this.scene.remove(s); this.sprites.delete(e); }
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2, pad = 28;
    let n = 0;
    for (const e of list) {
      let s = this.sprites.get(e);
      if (!s) { s = new THREE.Sprite(this.mat); s.renderOrder = 999; this.scene.add(s); this.sprites.set(e, s); }
      const top = (e.boss ? 3.2 : 2.6) + 0.15 * Math.sin(t * 6);
      s.position.set(e.position.x, top, e.position.z);
      const sc = e.boss ? 1.1 : 0.8;
      s.scale.set(sc, sc, 1);

      // За кадром? Проецируем и смотрим, попали ли в экран.
      _v.set(e.position.x, 1.5, e.position.z).project(this.camera);
      const behind = _v.z > 1;
      let x = _v.x, y = _v.y;
      if (!behind && Math.abs(x) <= 1 && Math.abs(y) <= 1) continue;
      if (n >= MAX_ARROWS) continue;
      if (behind) { x = -x; y = -y; }
      // Направление от центра экрана, прижимаем к краю.
      let dx = x * cx, dy = -y * cy;
      if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
      const k = Math.min((cx - pad) / Math.abs(dx || 1e-6), (cy - pad) / Math.abs(dy || 1e-6));
      const a = this.arrows[n++];
      a.style.display = 'block';
      a.style.left = `${cx + dx * k - 11}px`;
      a.style.top = `${cy + dy * k - 11}px`;
      a.style.transform = `rotate(${Math.atan2(dx, -dy)}rad)`;
    }
    for (; n < MAX_ARROWS; n++) this.arrows[n].style.display = 'none';
  }
}
