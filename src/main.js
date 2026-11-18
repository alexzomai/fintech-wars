import * as THREE from 'three';
import { buildCity, CELL, BANKS, rayBoxes, resolveCircle, districtAt, ownerListeners } from './city.js';
import { Graffiti } from './graffiti.js';
import { Stunts } from './stunts.js';
import { Car } from './car.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Enemies } from './enemies.js';
import { War } from './war.js';
import { Fx } from './fx.js';
import { Hud } from './hud.js';
import { RetroPass, RENDER_SCALE } from './retro.js';
// [v3-jury] begin
import { openTagEditor, savedTagCanvas } from './tageditor.js';
import { initCheats } from './cheats.js';
import { initStory } from './story.js';
// [v3-jury] end
import '@fontsource/press-start-2p/cyrillic-400.css';
import '@fontsource/press-start-2p/latin-400.css';

// --- Рендер, закатная атмосфера ---
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
{
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2a1d4f');
  grad.addColorStop(0.45, '#8a4a7a');
  grad.addColorStop(0.75, '#f08a5a');
  grad.addColorStop(1, '#ffc27a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog(0xc9786f, 45, 330); // город тонет в дымке, силуэты башен Сити видны
const camera = new THREE.PerspectiveCamera(65, 1, 0.3, 500);

scene.add(new THREE.HemisphereLight(0xffc9a0, 0x3a2a4a, 1.1));
const sun = new THREE.DirectionalLight(0xffa25a, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const retro = new RetroPass(renderer);
function resize() {
  // Внутреннее разрешение = половина экрана, CSS растягивает канвас с image-rendering: pixelated.
  const w = Math.round(innerWidth * RENDER_SCALE), h = Math.round(innerHeight * RENDER_SCALE);
  renderer.setSize(w, h, false);
  retro.setSize(w, h);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// --- Мир ---
const { colliders, districts, walls } = buildCity(scene);
const hud = new Hud();
const fx = new Fx(scene);
const enemies = new Enemies(scene, fx);
const graffiti = new Graffiti(scene, districts, fx);
graffiti.place(walls);
ownerListeners.push((d) => graffiti.onOwnerChange(d));
const traffic = new Traffic(scene, 14);
const player = new Player(scene);
const spawnPoint = () => {
  const d = districts.find((x) => x.owner === 'green' && x.hq) || districts.find((x) => x.owner === 'green') || districts[0];
  return d.hq ? new THREE.Vector3(d.hq.x + CELL / 2 + 3, 0, d.hq.z) : d.zone.clone();
};
const cars = [new Car(scene, spawnPoint())]; // машины, в которые можно сесть
let vehicle = cars[0];

// Маркеры точек захвата: кольцо + столб света в цвете владельца.
const zoneMarkers = districts.map((d) => {
  const mat = new THREE.MeshBasicMaterial({ color: BANKS[d.owner].color, transparent: true, opacity: 0.35, depthWrite: false });
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 60, 32, 1, true), mat);
  beam.position.y = 30;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 0.35, 8, 48), new THREE.MeshBasicMaterial({ color: BANKS[d.owner].color }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  g.add(beam, ring);
  g.position.copy(d.zone);
  scene.add(g);
  return { d, beam, ring, mat };
});

const state = { mode: 'menu', deadT: 0, timeScale: 1 };
const stunts = new Stunts(scene, state);
const war = new War({
  districts, enemies, hud, graffiti,
  onWin: (kind) => endGame(kind),
  onLose: () => endGame('lose'),
});

// --- Ввод ---
const input = { up: false, down: false, left: false, right: false, brake: false, run: false, fire: false };
const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right', Space: 'brake', ShiftLeft: 'run', ShiftRight: 'run',
};
addEventListener('keydown', (e) => {
  if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); }
  if (state.mode !== 'play' || e.repeat) return;
  if (e.code === 'KeyF') toggleCar();
  if (e.code === 'Space' && !vehicle) player.jump();
  if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !vehicle) { e.preventDefault(); player.roll(); }
  if (e.code === 'Digit1') setWeapon('pistol');
  if (e.code === 'Digit2') setWeapon('spray');
  if (e.code === 'KeyR') throwGrenade();
});
addEventListener('keyup', (e) => { if (KEYS[e.code]) input[KEYS[e.code]] = false; });
addEventListener('mousedown', (e) => { if (e.button === 0) input.fire = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });
canvas.addEventListener('click', () => { if (state.mode === 'play' && !document.pointerLockElement) canvas.requestPointerLock?.(); });

addEventListener('wheel', () => { if (state.mode === 'play') setWeapon(weapon === 'pistol' ? 'spray' : 'pistol'); });

// Оружие: пистолет и баллончик.
let weapon = 'pistol';
function setWeapon(w) {
  weapon = w;
  hud.setWeapon(w);
}

let camYaw = 0, camPitch = 0.05;
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  camYaw -= e.movementX * 0.0025;
  camPitch = Math.max(-0.7, Math.min(0.6, camPitch - e.movementY * 0.0025));
});

// --- Машины ---
function toggleCar() {
  if (vehicle) {
    if (Math.abs(vehicle.speed) > 6) return hud.toast('Сбрось скорость');
    const left = new THREE.Vector3(Math.cos(vehicle.heading), 0, -Math.sin(vehicle.heading));
    player.position.copy(vehicle.position).addScaledVector(left, 2.4);
    player.position.y = 0;
    resolveCircle(player.position, player.radius, colliders);
    player.grounded = false; // упадёт на тротуар/асфальт
    player.vy = 0;
    player.mesh.visible = true;
    camYaw = vehicle.heading;
    camPitch = 0.05;
    vehicle = null;
    return;
  }
  let best = null, bd = 4.5;
  for (const c of cars) { const d = c.position.distanceTo(player.position); if (d < bd) { bd = d; best = c; } }
  if (!best) {
    // Угон машины из трафика.
    const npc = traffic.takeNearest(player.position, 5);
    if (npc) {
      best = new Car(scene, npc.mesh.position, { mesh: npc.mesh, heading: npc.mesh.rotation.y });
      cars.push(best);
      hud.toast('Угнал!');
    }
  }
  if (!best) return hud.toast('Подойди к машине');
  vehicle = best;
  player.mesh.visible = false;
}

// --- Стрельба ---
let fireCd = 0;
const camDir = new THREE.Vector3();
function shoot() {
  fireCd = 0.2;
  player.h.recoil = 1;
  camera.getWorldDirection(camDir);
  const o = camera.position.clone();
  const wallT = rayBoxes(o, camDir, colliders, 150);
  const hit = enemies.raycast(o, camDir, wallT);
  const end = o.clone().addScaledVector(camDir, hit ? hit.t : Math.min(wallT, 150));
  const right = new THREE.Vector3(-Math.cos(player.heading), 0, Math.sin(player.heading));
  const muzzle = player.position.clone().add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(right, 0.45)
    .add(new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading)).multiplyScalar(0.8));
  fx.tracer(muzzle, end, 0xb8ffc8);
  fx.spark(muzzle, 0xfff0a0, 0.15);
  if (hit) {
    fx.spark(end, hit.head ? 0xff4040 : 0xffd27a);
    if (enemies.damage(hit.e, hit.head ? 50 : 25)) onKill(hit.e);
  }
}

function sprayPaint(dt) {
  camera.getWorldDirection(camDir);
  const muzzle = player.position.clone().add(new THREE.Vector3(Math.sin(player.heading) * 0.8, 1.6, Math.cos(player.heading) * 0.8));
  const tag = graffiti.spray(dt, camera.position, camDir, player.position, muzzle);
  if (!tag) return;
  war.reach += 5;
  war.addMoney(25);
  const total = graffiti.inDistrict(tag.d).length, green = graffiti.greenCount(tag.d);
  const need = Math.ceil(total / 2);
  hud.toast(green >= need && green - 1 < need
    ? `Граффити ${green}/${total} · ${BANKS[tag.d.owner].name} заметил вас!`
    : `Граффити ${green}/${total} · Охваты +5`, BANKS.green.css);
}

function onKill(e) {
  war.addMoney(e.boss ? 200 : 20);
  if (e.boss) hud.toast('Региональный директор уволен!', BANKS.green.css);
}

// --- Граната «Ключевая ставка»: замедляет всех в радиусе ---
const grenades = [];
function throwGrenade() {
  if (vehicle) return;
  if (war.money < 150) return hud.toast('Нужно $150 на «Ключевую ставку»', '#ff6b6b');
  war.addMoney(-150);
  camera.getWorldDirection(camDir);
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0x7ad7ff }));
  mesh.position.copy(player.position).setY(1.8);
  scene.add(mesh);
  grenades.push({ mesh, vel: new THREE.Vector3(camDir.x * 18, 7 + camDir.y * 12, camDir.z * 18), t: 0 });
}
function updateGrenades(dt) {
  for (const g of [...grenades]) {
    g.t += dt;
    g.vel.y -= 20 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y > 0.3 && g.t < 2.5) continue;
    const at = g.mesh.position.clone().setY(0.5);
    fx.blast(at, 11);
    let n = 0;
    for (const e of enemies.alive()) {
      if (e.position.distanceTo(at) > 11) continue;
      n++;
      e.slowT = 5;
      if (enemies.damage(e, 35)) onKill(e);
    }
    hud.toast(`КЛЮЧЕВАЯ СТАВКА 21%! Замедлено: ${n}`, '#7ad7ff');
    scene.remove(g.mesh);
    grenades.splice(grenades.indexOf(g), 1);
  }
}

// --- Урон, смерть, финал ---
function hurt(dmg) {
  if (state.mode !== 'play' || (state.god && dmg < 900)) return;
  if (player.rolling && dmg < 900) return; // кувырок — неуязвимость
  player.h.hitT = 1;
  player.hp -= vehicle ? dmg * 0.5 : dmg;
  hud.flashDamage();
  if (player.hp <= 0) die();
}

function die() {
  state.mode = 'dead';
  state.deadT = 3;
  input.fire = false;
  war.addMoney(-war.money * 0.1);
  document.getElementById('dead').classList.remove('hidden');
}

function respawn() {
  document.getElementById('dead').classList.add('hidden');
  player.hp = player.maxHp;
  const p = spawnPoint();
  let car = cars.find((c) => c.position.distanceTo(p) < 15);
  if (!car) { car = new Car(scene, p); cars.push(car); }
  car.speed = 0;
  vehicle = car;
  player.mesh.visible = false;
  state.mode = 'play';
}

function endGame(kind) {
  state.mode = 'end';
  document.exitPointerLock?.();
  const g = war.count('green');
  const title = { win: 'РЫНОК ВАШ!', time: g >= 3 ? 'ЛИДЕР РЫНКА' : 'ВРЕМЯ ВЫШЛО', lose: 'ОТЗЫВ ЛИЦЕНЗИИ' }[kind];
  document.getElementById('endTitle').textContent = title;
  document.getElementById('endText').textContent =
    `Районы: 🟢 ${g} · 🔴 ${war.count('red')} · 🟡 ${war.count('yellow')} · Капитал: $${war.money}`;
  document.getElementById('end').classList.remove('hidden');
}

// [v3-jury] begin
let juryEditorDone = location.search.includes('test');
savedTagCanvas().then((c) => { if (c) graffiti.setCustomTag(c); });
const jury = { cheats: null, story: null };
// [v3-jury] end
document.getElementById('play').addEventListener('click', () => {
  // [v3-jury] begin
  if (!juryEditorDone) {
    openTagEditor((c) => { juryEditorDone = true; if (c) graffiti.setCustomTag(c); document.getElementById('play').click(); });
    return;
  }
  // [v3-jury] end
  document.getElementById('start').classList.add('hidden');
  state.mode = 'play';
  canvas.requestPointerLock?.();
  hud.alert('Перекрась граффити конкурентов!', BANKS.green.css);
  setWeapon('pistol');
});
document.getElementById('again').addEventListener('click', () => location.reload());

// --- Камера ---
const camPos = new THREE.Vector3();
function updateCamera(dt, snap = false) {
  // Переопределение камеры: катсцены, пролёт на заставке, скриншоты.
  if (state.camOverride) {
    camera.position.copy(state.camOverride.pos);
    camera.lookAt(state.camOverride.look);
    return;
  }
  const actor = vehicle || player;
  const p = actor.position;
  if (vehicle) {
    const diff = Math.atan2(Math.sin(vehicle.heading - camYaw), Math.cos(vehicle.heading - camYaw));
    camYaw += snap ? diff : diff * Math.min(1, dt * 4);
    const dist = 11 + Math.abs(vehicle.speed) * 0.08;
    const want = new THREE.Vector3(p.x - Math.sin(camYaw) * dist, 4.5, p.z - Math.cos(camYaw) * dist);
    if (snap) camPos.copy(want); else camPos.lerp(want, Math.min(1, dt * 6));
    camera.position.copy(camPos);
    camera.lookAt(p.x, 1.5, p.z);
  } else {
    // Через плечо: камера на мыши, не залезает в стены.
    const f = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch));
    const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const pivot = p.clone().add(new THREE.Vector3(0, 2.1, 0)).addScaledVector(right, 1.2);
    const back = f.clone().negate();
    const dist = Math.max(0.6, Math.min(5.5, rayBoxes(pivot, back, colliders, 5.5) - 0.3));
    camPos.copy(pivot).addScaledVector(back, dist);
    camPos.y = Math.max(0.4, camPos.y);
    camera.position.copy(camPos);
    camera.lookAt(pivot.clone().addScaledVector(f, 20));
  }
  sun.position.set(p.x - 110, 70, p.z + 50);
  sun.target.position.set(p.x, 0, p.z);
}

// --- Игровой цикл ---
const _v = new THREE.Vector3();
function step(dt) {
  if (vehicle) {
    vehicle.update(dt, input, colliders);
    if (traffic.collide(vehicle)) vehicle.speed *= 0.5;
    for (const c of cars) {
      if (c === vehicle) continue;
      _v.subVectors(vehicle.position, c.position).setY(0);
      const d = _v.length();
      if (d < 3.8 && d > 1e-3) { vehicle.position.addScaledVector(_v.normalize(), 3.8 - d); vehicle.speed *= 0.5; }
    }
    // Таран: на скорости сбиваем бойцов.
    for (const e of enemies.alive()) {
      _v.subVectors(e.position, vehicle.position).setY(0);
      const d = _v.length();
      if (d > vehicle.radius + e.radius) continue;
      if (Math.abs(vehicle.speed) > 7) {
        const fling = new THREE.Vector3(Math.sin(vehicle.heading), 0, Math.cos(vehicle.heading)).multiplyScalar(Math.abs(vehicle.speed) * 0.6);
        enemies.damage(e, e.boss ? 60 : 999);
        if (e.dead) { e.fling = fling; onKill(e); }
        vehicle.speed *= 0.8;
      } else if (d > 1e-3) {
        e.position.addScaledVector(_v.normalize(), vehicle.radius + e.radius - d);
      }
    }
    stunts.update(dt, vehicle, () => { war.reach += 15; war.addMoney(200); });
  } else {
    player.update(dt, input, camYaw, colliders, cars, { aiming: input.fire && weapon === 'pistol', spraying: input.fire && weapon === 'spray', aimPitch: camPitch });
    traffic.collide(player);
    for (const c of cars) {
      _v.subVectors(player.position, c.position).setY(0);
      const d = _v.length();
      // На крыше/капоте машины не выталкиваемся.
      if (d < 2.3 && d > 1e-3 && player.position.y < c.position.y + 1.1) player.position.addScaledVector(_v.normalize(), 2.3 - d);
    }
    fireCd -= dt;
    if (input.fire && weapon === 'pistol' && fireCd <= 0) shoot();
    if (input.fire && weapon === 'spray') sprayPaint(dt);
    else graffiti.current = null;
  }
  for (const c of cars) if (c !== vehicle) c.update(dt, null, colliders);

  const actor = vehicle || player;
  // Въезд в район: название и владелец.
  const here = districtAt(districts, actor.position);
  if (here && here !== state.district) {
    state.district = here;
    hud.toast(`${here.name} · ${BANKS[here.owner].name}`, BANKS[here.owner].css);
  }
  traffic.update(dt, [...cars, ...(vehicle ? [] : [player]), ...traffic.cars]);
  enemies.update(dt, { target: actor.position, targetAlive: true, colliders, hurt });
  updateGrenades(dt);
  war.update(dt, actor.position, true);

  hud.setHp(player.hp, player.maxHp);
  hud.setSpeed(vehicle ? vehicle.speed : 0, !!vehicle);
  hud.setCrosshair(!vehicle);
  hud.setSpray(!vehicle && weapon === 'spray' && graffiti.current ? graffiti.current.progress : null);
  hud.setArrow(actor.position, war.target, camYaw);
  const nearCar = !vehicle && (cars.some((c) => c.position.distanceTo(player.position) < 4.5) || traffic.cars.some((c) => c.mesh.position.distanceTo(player.position) < 5));
  hud.setHint(vehicle ? 'WASD — ехать · Пробел — ручник · F — выйти'
    : nearCar ? 'F — сесть / угнать'
    : weapon === 'spray' ? 'ЛКМ на чужом граффити — перекрасить · 1 — пистолет'
    : 'ЛКМ — огонь · 2 — баллончик · R — «Ключевая ставка» ($150)');
}

function updateZones(t) {
  for (const z of zoneMarkers) {
    const col = BANKS[z.d.owner].color;
    z.mat.color.set(col);
    z.ring.material.color.set(col);
    const active = war.capture?.d === z.d || war.counter?.d === z.d;
    z.beam.visible = z.d.owner !== 'green' || active;
    z.mat.opacity = active ? 0.25 + 0.15 * Math.sin(t * 8) : 0.3;
  }
}

// [v3-jury] begin
jury.cheats = initCheats({ war, player, traffic, hud });
jury.story = initStory({ renderer, scene, camera, retro, player, hud });
// [v3-jury] end
const clock = new THREE.Clock();
let mapTimer = 0, elapsed = 0;
updateCamera(0, true);
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05) * (state.timeScale ?? 1);
  elapsed += dt;
  if (state.mode === 'play') step(dt);
  else if (state.mode === 'dead') {
    state.deadT -= dt;
    if (state.deadT <= 0) respawn();
  }
  fx.update(dt);
  updateZones(elapsed);
  updateCamera(dt);
  mapTimer -= dt;
  if (mapTimer <= 0) {
    mapTimer = 0.05;
    hud.drawMap((vehicle || player).position, camYaw, colliders, districts, enemies.list, war.target, graffiti.tags);
  }
  retro.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Хук для автотестов и отладки.
window.__game = {
  colliders, districts, enemies, traffic, war, player, cars, input, state, hurt, fx, graffiti, stunts,
  get weapon() { return weapon; },
  get vehicle() { return vehicle; },
  get camYaw() { return camYaw; },
  aim(yaw, pitch = 0) { camYaw = yaw; camPitch = pitch; },
  toggleCar, shoot, throwGrenade, cam: camera, renderer, jury,
};
