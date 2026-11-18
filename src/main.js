import * as THREE from 'three';
import { buildCity, CELL, BANKS, rayBoxes, resolveCircle, districtAt, ownerListeners } from './city.js';
import { Graffiti } from './graffiti.js';
import { Stunts } from './stunts.js';
import { Car } from './car.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
// [v3-models] begin
import { initProps } from './props.js';
// [v3-models] end
import { Enemies } from './enemies.js';
import { War } from './war.js';
import { Markers } from './markers.js'; // [v3-war]
import { Squads } from './squads.js'; // [v3-war]
import { Fx } from './fx.js';
import { Hud } from './hud.js';
// [v3-weapons] begin
import { Arsenal } from './weapons.js';
import { Aircraft } from './aircraft.js'; // [v3-air]
// [v3-weapons] end
// [v3-pop] begin
import { Npcs } from './npc.js';
import { Allies } from './allies.js';
// [v3-pop] end
import { RetroPass, RENDER_SCALE } from './retro.js';
// [v3-jury] begin
import { openTagEditor, savedTagCanvas } from './tageditor.js';
import { initCheats } from './cheats.js';
import { initStory } from './story.js';
import { Fns } from './fns.js'; // [v3-fns]
// [v3-jury] end
// [v3-neon] begin
import { initNeon } from './neon.js';
import { initPauseMenu } from './pausemenu.js';
// [v3-neon] end
// [v3-audio] begin
import { initAudio } from './audio.js';
// [v3-audio] end
// [v3-absurd] begin
import { initEvents } from './events.js';
import { attachVoice } from './voice.js';
// [v3-absurd] end
// [v3-decor] begin
import { initDecor } from './decor.js';
// [v3-decor] end
// [v3-palych] begin
import { initPalych } from './missions.js';
// [v3-palych] end
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
// [v3-models] begin
window.__props = initProps(scene, colliders);
// [v3-models] end
const hud = new Hud();
const fx = new Fx(scene);
const enemies = new Enemies(scene, fx);
const graffiti = new Graffiti(scene, districts, fx);
graffiti.place(walls);
ownerListeners.push((d) => graffiti.onOwnerChange(d));
const traffic = new Traffic(scene, 14);
const player = new Player(scene);
// [v3-pop] begin
const npcs = new Npcs(scene, { colliders, districts });
const allies = new Allies(scene, { enemies, npcs, fx, hud, districts, colliders, onKill: (e) => onKill(e) });
enemies.onShot = (p) => npcs.panic(p, 18);
// [v3-pop] end
const spawnPoint = () => {
  const d = districts.find((x) => x.owner === 'green' && x.hq) || districts.find((x) => x.owner === 'green') || districts[0];
  return d.hq ? new THREE.Vector3(d.hq.x + CELL / 2 + 3, 0, d.hq.z) : d.zone.clone();
};
const cars = [new Car(scene, spawnPoint())]; // машины, в которые можно сесть
let vehicle = cars[0];

const state = { mode: 'menu', deadT: 0, timeScale: 1 };
const stunts = new Stunts(scene, state);
// [v3-air] begin
const aircraft = new Aircraft({ scene, colliders, districts, hud, state, player });
// [v3-air] end
const war = new War({
  districts, enemies, hud, graffiti,
  onWin: (kind) => endGame(kind),
  onLose: () => endGame('lose'),
});
// [v3-war] begin
war.camera = camera; // телепорт застрявших врагов — вне кадра
const markers = new Markers(scene, camera);
window.__markers = markers;
war.squads = new Squads({ scene, war, enemies, graffiti, hud, fx, colliders });
// [v3-war] end

// --- Ввод ---
const input = { up: false, down: false, left: false, right: false, brake: false, run: false, fire: false };
// [v3-neon] begin
const neon = initNeon({ scene, districts, sun, camera, hud, state });
const pause = initPauseMenu({ state, districts, war, graffiti, colliders, input, neon, canvas, actor: () => vehicle || player });
// [v3-neon] end
const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right', Space: 'brake', ShiftLeft: 'run', ShiftRight: 'run',
};
addEventListener('keydown', (e) => {
  if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyN' && !e.repeat && state.mode === 'play') neon.toggleNight(); // [v3-neon]
  if (state.mode !== 'play' || e.repeat) return;
  if (e.code === 'KeyF' && (vehicle || !aircraft.tryEnter(player))) toggleCar(); // [v3-air] сначала вертолёт
  if (e.code === 'Space' && !vehicle) player.jump();
  if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !vehicle) { e.preventDefault(); player.roll(); }
  // [v3-weapons] begin
  if (/^Digit[1-9]$/.test(e.code)) arsenal.selectSlot(+e.code.slice(5));
  if (e.code === 'KeyR') arsenal.manualReload();
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'KeyE') window.__game?.allies?.recruit?.(); // E — действие: позвать амбассадора
  // Q — радио в машине (делает sg-audio), за оружием не закреплено.
  // [v3-weapons] end
  if (e.code === 'KeyG' && !vehicle) allies.recruit(player.position, camera.getWorldDirection(new THREE.Vector3())); // [v3-pop]
  if (e.code === 'KeyZ') audio.nextStation(); // [v3-audio]
});
addEventListener('keyup', (e) => { if (KEYS[e.code]) input[KEYS[e.code]] = false; });
// [v3-weapons] begin — Tab: колесо оружия с замедлением времени
addEventListener('keydown', (e) => {
  if (e.code !== 'Tab') return;
  e.preventDefault();
  if (state.mode === 'play' && !e.repeat) arsenal.openWheel();
});
addEventListener('keyup', (e) => { if (e.code === 'Tab') { e.preventDefault(); arsenal.closeWheel(); } });
addEventListener('blur', () => arsenal.closeWheel());
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) arsenal.wheelMove(e.movementX, e.movementY); });
// [v3-weapons] end
addEventListener('mousedown', (e) => { if (e.button === 0) input.fire = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });
canvas.addEventListener('click', () => { if (state.mode === 'play' && !document.pointerLockElement) canvas.requestPointerLock?.(); });

// [v3-weapons] begin — оружие живёт в src/weapons.js
addEventListener('wheel', (e) => { if (state.mode === 'play' && !arsenal.wheel) arsenal.cycle(e.deltaY > 0 ? 1 : -1); });
function setWeapon(w) { arsenal.select(w, true); }
// [v3-weapons] end

let camYaw = 0, camPitch = 0.05;
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || arsenal.wheel) return; // [v3-weapons] колесо забирает мышь
  camYaw -= e.movementX * 0.0025;
  camPitch = Math.max(-0.7, Math.min(0.6, camPitch - e.movementY * 0.0025));
});

// --- Машины ---
const CAR_NAMES = ['Ипотека Седан', 'Микрозайм GT', 'Инкассатор', 'Кэшбэк Такси']; // [v3-weapons]
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
  hud.showVehicle(best.modelName ||= CAR_NAMES[cars.indexOf(best) % CAR_NAMES.length]); // [v3-weapons]
}

function onKill(e) {
  war.addMoney(e.boss ? 200 : 20);
  if (e.boss) hud.toast('Региональный директор уволен!', BANKS.green.css);
}

// [v3-weapons] begin
const arsenal = new Arsenal({
  scene, camera, player, enemies, fx, hud, graffiti, war, colliders, state, cars, traffic,
  getVehicle: () => vehicle, onKill: (e) => onKill(e),
  kick: (a) => { camPitch = Math.min(0.6, camPitch + a); }, // отдача подбрасывает прицел
});
arsenal.movePickupsNear(spawnPoint());
const shoot = () => arsenal.shoot();
const throwGrenade = () => arsenal.throwGrenade();
// [v3-weapons] end
// [v3-pop] begin — паника прохожих от выстрелов и взрывов (стрельба живёт в weapons.js)
{
  const shootOrig = arsenal.shoot.bind(arsenal);
  arsenal.shoot = (...a) => { npcs.panic(player.position, 25); return shootOrig(...a); };
  const blastOrig = fx.blast.bind(fx);
  fx.blast = (at, r, c) => { npcs.panic(at, 30); return blastOrig(at, r, c); };
}
// [v3-pop] end
// [v3-audio] begin
const audio = initAudio({ hud, war, districts, graffiti, input, arsenal, player });
// [v3-audio] end

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
  // [v3-palych] begin — пролог после редактора тега
  if (!palych.prologueDone) { palych.prologue(() => document.getElementById('play').click()); return; }
  // [v3-palych] end
  document.getElementById('start').classList.add('hidden');
  state.mode = 'play';
  canvas.requestPointerLock?.();
  hud.subtitle(`Перекрась <b style="color:${BANKS.red.css}">граффити конкурентов</b> и забери <b style="color:${BANKS.green.css}">их районы</b>`); // [v3-weapons]
  setWeapon('pistol');
  palych.start(); // [v3-palych]
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
  } else if (aircraft.flying) { // [v3-air] за штурвалом: вертолёт двигает aircraft.update
  } else {
    player.update(dt, input, camYaw, colliders, cars, { aiming: input.fire && arsenal.aiming, spraying: input.fire && arsenal.current === 'spray', aimPitch: camPitch });
    traffic.collide(player);
    for (const c of cars) {
      _v.subVectors(player.position, c.position).setY(0);
      const d = _v.length();
      // На крыше/капоте машины не выталкиваемся.
      if (d < 2.3 && d > 1e-3 && player.position.y < c.position.y + 1.1) player.position.addScaledVector(_v.normalize(), 2.3 - d);
    }
  }
  arsenal.update(dt, input.fire); // [v3-weapons]
  audio.update(dt, { inCar: !!vehicle, speed: vehicle ? vehicle.speed : 0 }); // [v3-audio]
  for (const c of cars) if (c !== vehicle) c.update(dt, null, colliders);

  const actor = vehicle || player;
  // Въезд в район: название и владелец.
  const here = districtAt(districts, actor.position);
  if (here && here !== state.district) {
    state.district = here;
    hud.showDistrict(here.name, BANKS[here.owner].css); // [v3-weapons] название района справа внизу
  }
  traffic.update(dt, [...cars, ...(vehicle ? [] : [player]), ...traffic.cars]);
  fns.update(dt); // [v3-fns]
  enemies.update(dt, { target: actor.position, targetAlive: true, colliders, hurt });
  // [v3-pop] begin
  npcs.update(dt, { center: actor.position, vehicle, traffic: traffic.cars, budget: 80 - enemies.alive().length - allies.count });
  allies.update(dt, { player, vehicle });
  // [v3-pop] end
  war.update(dt, actor.position, true);

  hud.setHp(player.hp, player.maxHp);
  hud.setSpeed(vehicle ? vehicle.speed : 0, !!vehicle);
  hud.setCrosshair(!vehicle);
  hud.setSpray(!vehicle && arsenal.current === 'spray' && graffiti.current ? graffiti.current.progress : null);
  hud.setArrow(actor.position, war.target, camYaw);
  const nearCar = !vehicle && (cars.some((c) => c.position.distanceTo(player.position) < 4.5) || traffic.cars.some((c) => c.mesh.position.distanceTo(player.position) < 5));
  hud.setHint(vehicle ? '~WASD~ — ехать · ~Пробел~ — ручник · ~Q~ — радио · ~F~ — выйти'
    : nearCar ? 'F — сесть / угнать'
    : arsenal.hint()); // [v3-weapons]
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

// [v3-fns] begin
const fns = new Fns({ scene, traffic, war, hud, input, camera, player, colliders, state, getActor: () => vehicle || player, getVehicle: () => vehicle, getWeapon: () => arsenal.current });
// [v3-fns] end
// [v3-jury] begin
jury.cheats = initCheats({ war, player, traffic, hud, arsenal }); // [v3-weapons] arsenal для ARSENAL
jury.story = initStory({ renderer, scene, camera, retro, player, hud });
// [v3-jury] end
// [v3-absurd] begin — события рынка и озвучка: src/events.js, src/voice.js
const voice = attachVoice(hud);
const marketEvents = initEvents({ scene, player, enemies, traffic, war, hud, state, getActor: () => vehicle || player });
window.__absurd = { events: marketEvents, voice };
// [v3-absurd] end
// [v3-decor] begin
const decor = initDecor({ scene, colliders, walls, districts, fx, hud, war, state, camera, input, player, getVehicle: () => vehicle, getWeapon: () => arsenal.current });
// [v3-decor] end
// [v3-palych] begin
const palych = initPalych({ state, hud, war, graffiti, districts, player, getVehicle: () => vehicle, input });
// [v3-palych] end
const clock = new THREE.Clock();
let mapTimer = 0, elapsed = 0;
updateCamera(0, true);
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05) * (state.timeScale ?? 1); // [v3-weapons] замедление колеса
  elapsed += dt;
  if (state.mode === 'play') step(dt);
  else if (state.mode === 'dead') {
    state.deadT -= dt;
    if (state.deadT <= 0) respawn();
  }
  aircraft.update(dt, input); // [v3-air]
  fx.update(dt);
  decor.update(dt); // [v3-decor]
  updateZones(elapsed);
  updateCamera(dt);
  // [v3-war] begin
  markers.update(state.mode === 'play' ? enemies.alive((e) => e.tag && (e.tag === war.capture?.tag || e.tag === war.counter?.tag)) : [], elapsed, state.mode === 'play' ? war.squads.allies() : []);
  // [v3-war] end
  mapTimer -= dt;
  if (mapTimer <= 0) {
    mapTimer = 0.05;
    hud.drawMap((vehicle || player).position, camYaw, colliders, districts, enemies.list, war.target, graffiti.tags);
    war.squads.drawRadar(hud.map, (vehicle || player).position, camYaw); // [v3-war]
  }
  neon.update(dt); pause.update(dt); // [v3-neon]
  retro.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Хук для автотестов и отладки.
window.__game = {
  colliders, districts, enemies, traffic, war, player, cars, input, state, hurt, fx, graffiti, stunts,
  get weapon() { return arsenal.current; },
  arsenal, hud, // [v3-weapons]
  aircraft, // [v3-air]
  get vehicle() { return vehicle; },
  get camYaw() { return camYaw; },
  aim(yaw, pitch = 0) { camYaw = yaw; camPitch = pitch; },
  fns, // [v3-fns]
  toggleCar, shoot, throwGrenade, cam: camera, renderer, jury,
  neon, pause, // [v3-neon]
  npcs, allies, // [v3-pop]
  audio, // [v3-audio]
  palych, // [v3-palych]
};
