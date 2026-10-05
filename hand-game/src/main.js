import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Stage } from './scene.js';
import { Arena } from './world/arena.js';
import { PropSystem } from './world/props.js';
import { EnemySystem } from './world/enemies.js';
import { HexGame } from './game/hexslinger.js';
import { HandAvatar, createHandMaterials, SKIN_TONES } from './handRig.js';
import { Effects } from './fx.js';
import { Sfx } from './audio.js';
import { Revolver } from './revolver/revolver.js';
import { HAND_BONES } from './landmarks.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const video = $('cam');

/* ---------- Settings ---------- */

const DEFAULTS = { look: 'spectral', tone: 2, mirror: true, joints: false, sound: true, pip: true, quality: 'auto', engine: 'auto', fov: 64 };
const settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('hexslinger.settings') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
})();
function saveSettings() {
  try {
    localStorage.setItem('hexslinger.settings', JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

/* ---------- World ---------- */

const stage = new Stage($('scene'));
const arena = new Arena(stage.scene);
const fx = new Effects(stage.scene);
const sfx = new Sfx();
sfx.enabled = settings.sound;
const props = new PropSystem(stage.scene, fx, sfx);
const enemies = new EnemySystem(stage.scene, fx, sfx);
const materials = createHandMaterials();

let assets = { left: null, right: null };
try {
  const loader = new GLTFLoader();
  const [left, right] = await Promise.all([loader.loadAsync('assets/hands/left.glb'), loader.loadAsync('assets/hands/right.glb')]);
  assets = { left: left.scene, right: right.scene };
} catch (err) {
  console.warn('Hand meshes did not load; showing the joint skeleton instead.', err);
}
const avatars = [0, 1].map(() => new HandAvatar(assets, materials));
for (const a of avatars) {
  a.group.visible = false;
  stage.scene.add(a.group);
}

/* ---------- The showcase revolver (title screen and armory) ---------- */

const showcase = new Revolver();
const holder = new THREE.Group();
showcase.root.position.set(-0.029, 0.055, 0); // turn about the gun's middle
holder.add(showcase.root);
stage.scene.add(holder);
// Short-range studio lights that reach the revolver but not the courtyard.
const keyLight = new THREE.PointLight('#fff2e2', 2.2, 1.1, 2);
const rimLight = new THREE.PointLight('#9ec8ff', 1.6, 1.1, 2);
stage.scene.add(keyLight, rimLight);
const view = { yaw: Math.PI, pitch: 0.12, dragging: false, lastX: 0, lastY: 0, auto: true };

/* ---------- HUD used by the game ---------- */

let gameHint = null;
let gameHintUntil = 0;
let bannerTimer = 0;

const ui = {
  setScore(score, mult = 1) {
    $('scoreBox').hidden = score === null;
    if (score === null) return;
    $('score').textContent = score.toLocaleString();
    $('mult').hidden = mult <= 1;
    $('mult').textContent = `×${mult} streak`;
  },
  setWave(n) {
    $('wave').hidden = !n;
    $('wave').textContent = `Wave ${n}`;
  },
  setLives(n) {
    $('lives').hidden = false;
    [...$('lives').children].forEach((el, i) => el.classList.toggle('lost', i >= n));
    $('lives').setAttribute('aria-label', `${n} lives left`);
  },
  setAmmo(rounds) {
    const el = $('ammo');
    el.hidden = !rounds;
    if (!rounds) return;
    const key = rounds.join();
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    [...el.children].forEach((r, i) => (r.className = rounds[i]));
  },
  banner(text) {
    const el = $('banner');
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth; // restart the CSS animation
    el.style.animation = '';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (el.hidden = true), 1700);
  },
  hint(text, holdMs = 0) {
    gameHint = text;
    gameHintUntil = holdMs ? performance.now() + holdMs : Infinity;
  },
  hurt() {
    const el = $('hurt');
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  },
  showResults(stats) {
    $('results').hidden = !stats;
    if (!stats) return;
    $('finalScore').textContent = stats.score.toLocaleString();
    $('newBest').hidden = !stats.newBest;
    $('stWave').textContent = stats.wave;
    $('stKills').textContent = stats.kills;
    $('stBest').textContent = stats.best.toLocaleString();
  },
};

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

const game = new HexGame({ stage, props, enemies, fx, sfx, ui });

// Showcase sounds and effects
showcase
  .on('cock', () => sfx.cock())
  .on('trigger', () => sfx.trigger())
  .on('decock', () => sfx.decock())
  .on('latch', () => sfx.latch())
  .on('swing-out', () => sfx.swingOut())
  .on('load', () => sfx.load())
  .on('swing-in', () => sfx.swingIn())
  .on('spin', () => sfx.spin())
  .on('dry', () => sfx.dry())
  .on('eject', (cases) => {
    sfx.eject();
    game.spawnCasings(showcase, cases);
  })
  .on('shot', () => {
    sfx.gunshot();
    const dir = new THREE.Vector3();
    const muzzle = showcase.muzzle(new THREE.Vector3(), dir);
    fx.flash(muzzle, '#ffc070', 6, 0.06);
    fx.puff(muzzle, dir, 0.03);
    fx.puff(muzzle, dir, 0.045);
    fx.burst(muzzle, '#ffcf7a', 14, 5, 0.15);
  });

/* ---------- Modes: title, armory, game ---------- */

let mode = 'title';
let tracker = null;

function setMode(next) {
  mode = next;
  app.dataset.mode = next;
  $('intro').hidden = next !== 'title';
  $('armory').hidden = next !== 'armory';
  const showGun = next !== 'game';
  holder.visible = showGun;
  keyLight.visible = rimLight.visible = showGun;
  view.auto = next === 'title';
  placeShowcase();
  if (next === 'armory') {
    view.yaw = Math.PI;
    view.pitch = 0.08;
  }
}

function placeShowcase() {
  const wide = stage.width > 760;
  // Beside the card on wide screens; in the open space above it on phones.
  if (wide) holder.position.set(mode === 'armory' ? 0.13 : 0.11, mode === 'armory' ? -0.01 : -0.02, mode === 'armory' ? -0.62 : -0.5);
  else holder.position.set(0, 0.21, -1.0);
  keyLight.position.copy(holder.position).add(new THREE.Vector3(0.22, 0.28, 0.32));
  rimLight.position.copy(holder.position).add(new THREE.Vector3(-0.3, 0.18, -0.3));
}

function setStatus(text, error = false) {
  const el = $('introStatus');
  el.textContent = text;
  el.classList.toggle('error', error);
}

async function start() {
  sfx.unlock();
  setMode('title');
  const buttons = document.querySelectorAll('#startBtn, #armoryStart');
  buttons.forEach((b) => (b.disabled = true));
  setStatus('Opening the camera…');
  let cameraOpen = false;
  try {
    const { openCamera, createTracker } = await import('./tracker.js');
    if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
    await openCamera(video);
    cameraOpen = true;
    setStatus('Loading the hand tracker. The first visit downloads about 8 MB…');
    tracker = await createTracker(video, settings.engine);
    tracker.setMirror(settings.mirror);
    tracker.setFov(settings.fov);
    stage.setCameraModel(video.videoWidth, video.videoHeight, settings.fov);
    setMode('game');
    app.dataset.live = 'true';
    ui.setLives(3);
    game.start();
  } catch (err) {
    console.error(err);
    const message = err?.code
      ? err.message
      : cameraOpen
        ? 'The hand tracker could not load. Check your internet connection and press Start again.'
        : `Something went wrong: ${err?.message || err}`;
    setStatus(message, true);
    buttons.forEach((b) => (b.disabled = false));
  }
}

/* ---------- Armory controls ---------- */

const gunActions = {
  cock: () => showcase.cock(),
  fire: () => showcase.pullTrigger(),
  open: () => showcase.setOpen(!showcase.open),
  spin: () => (showcase.open ? showcase.spinCylinder() : showcase.setOpen(true)),
  reload: () => showcase.reload(),
};
for (const b of document.querySelectorAll('[data-gun]')) {
  b.addEventListener('click', () => {
    sfx.unlock();
    gunActions[b.dataset.gun]();
  });
}
const KEYS = { c: 'cock', ' ': 'fire', o: 'open', s: 'spin', r: 'reload' };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('settings').hidden) setDrawer(false);
    else if (mode === 'armory') setMode('title');
    return;
  }
  if (mode !== 'armory' || e.target.closest('input')) return;
  const action = KEYS[e.key.toLowerCase()];
  if (action) {
    e.preventDefault();
    sfx.unlock();
    gunActions[action]();
  }
});

const canvas = $('scene');
canvas.addEventListener('pointerdown', (e) => {
  if (mode === 'game') return;
  view.dragging = true;
  view.auto = false;
  view.lastX = e.clientX;
  view.lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!view.dragging) return;
  view.yaw += (e.clientX - view.lastX) * 0.01;
  view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - view.lastY) * 0.01, -1.2, 1.2);
  view.lastX = e.clientX;
  view.lastY = e.clientY;
});
canvas.addEventListener('pointerup', () => (view.dragging = false));
canvas.addEventListener('pointercancel', () => (view.dragging = false));

$('startBtn').addEventListener('click', start);
$('armoryStart').addEventListener('click', start);
$('armoryBtn').addEventListener('click', () => {
  sfx.unlock();
  setMode('armory');
});
$('armoryBack').addEventListener('click', () => setMode('title'));

/* ---------- Settings drawer ---------- */

function setDrawer(open) {
  $('settings').hidden = !open;
  $('settingsBtn').setAttribute('aria-expanded', String(open));
  if (open) $('settingsClose').focus();
  else $('settingsBtn').focus();
}
$('settingsBtn').addEventListener('click', () => setDrawer($('settings').hidden));
$('settingsClose').addEventListener('click', () => setDrawer(false));

function buildSwatches() {
  const wrap = $('swatches');
  const add = (label, look, tone, color) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.look = look;
    if (tone !== undefined) b.dataset.tone = String(tone);
    if (color) {
      b.className = 'swatch';
      b.style.background = color;
      b.setAttribute('aria-label', label);
    } else {
      b.className = 'swatch text';
      b.textContent = label;
    }
    wrap.append(b);
  };
  add('Spectral', 'spectral');
  SKIN_TONES.forEach((hex, i) => add(`Skin tone ${i + 1}`, 'skin', i, hex));
  add('Joints only', 'skeleton');
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-look]');
    if (!b) return;
    settings.look = b.dataset.look;
    if (b.dataset.tone) settings.tone = Number(b.dataset.tone);
    saveSettings();
    applyLook();
  });
}

function applyLook() {
  materials.setTone(SKIN_TONES[settings.tone] ?? SKIN_TONES[2]);
  for (const a of avatars) a.setLook(settings.look);
  for (const b of $('swatches').children) {
    const on = b.dataset.look === settings.look && (settings.look !== 'skin' || Number(b.dataset.tone) === settings.tone);
    b.setAttribute('aria-checked', String(on));
  }
}

function applyQuality(q) {
  settings.quality = q;
  stage.setQuality(q);
  arena.setShadows(q !== 'low');
  for (const b of document.querySelectorAll('[data-quality]')) b.setAttribute('aria-pressed', String(b.dataset.quality === q));
}

buildSwatches();
applyLook();
applyQuality(settings.quality);
$('optMirror').checked = settings.mirror;
$('optJoints').checked = settings.joints;
$('optSound').checked = settings.sound;
$('optPip').checked = settings.pip;
$('optFov').value = String(Math.round(settings.fov));
$('fovOut').textContent = `${Math.round(settings.fov)}°`;
app.dataset.pip = String(settings.pip);

function syncEngine() {
  for (const b of document.querySelectorAll('[data-engine]')) b.setAttribute('aria-pressed', String(b.dataset.engine === settings.engine));
}
syncEngine();

document.addEventListener('click', async (e) => {
  const q = e.target.closest('[data-quality]');
  if (q) {
    applyQuality(q.dataset.quality);
    saveSettings();
  }
  const engine = e.target.closest('[data-engine]');
  if (engine && engine.dataset.engine !== settings.engine) {
    settings.engine = engine.dataset.engine;
    saveSettings();
    syncEngine();
    if (tracker) {
      toast('Switching the hand tracker…');
      try {
        await tracker.useEngine(settings.engine);
        toast(`Hand tracker: ${tracker.delegate}`);
      } catch (err) {
        toast('That tracker could not start on this device.');
        console.error(err);
      }
    }
  }
});
$('optMirror').addEventListener('change', (e) => {
  settings.mirror = e.target.checked;
  saveSettings();
  tracker?.setMirror(settings.mirror);
});
$('optJoints').addEventListener('change', (e) => {
  settings.joints = e.target.checked;
  saveSettings();
});
$('optSound').addEventListener('change', (e) => {
  settings.sound = e.target.checked;
  sfx.enabled = settings.sound;
  if (settings.sound) sfx.unlock();
  else sfx.hold(0);
  saveSettings();
});
$('optPip').addEventListener('change', (e) => {
  settings.pip = e.target.checked;
  app.dataset.pip = String(settings.pip);
  saveSettings();
});

function applyFov(deg) {
  settings.fov = deg;
  $('optFov').value = String(Math.round(deg));
  $('fovOut').textContent = `${Math.round(deg)}°`;
  tracker?.setFov(deg);
  if (tracker) stage.setCameraModel(video.videoWidth, video.videoHeight, deg);
}
$('optFov').addEventListener('input', (e) => applyFov(Number(e.target.value)));
$('optFov').addEventListener('change', saveSettings);
$('calBtn').addEventListener('click', () => {
  if (!tracker) {
    toast('Start the camera first, then calibrate.');
    return;
  }
  const cm = Number($('calDist').value);
  if (!(cm >= 15 && cm <= 150)) {
    toast('Enter a distance between 15 and 150 cm.');
    return;
  }
  const fov = tracker.calibrate(cm / 100);
  if (fov === null) {
    toast('Hold one open hand up to the camera, then press Calibrate.');
    return;
  }
  applyFov(Math.round(fov * 10) / 10);
  saveSettings();
  toast(`Calibrated: your camera sees ${fov.toFixed(0)}° across.`);
});

window.addEventListener('resize', () => {
  stage.resize();
  if (tracker) stage.setCameraModel(video.videoWidth, video.videoHeight, settings.fov);
  placeShowcase();
});

/* ---------- Camera thumbnail ---------- */

const pip = $('pip');
const pipCtx = pip.getContext('2d');
let pipDrawn = -1;

function drawPip() {
  if (!tracker || !settings.pip || tracker.results === pipDrawn) return;
  pipDrawn = tracker.results;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw) return;
  const w = pip.width;
  const h = Math.round((w * vh) / vw);
  if (pip.height !== h) pip.height = h;
  pipCtx.save();
  if (settings.mirror) {
    pipCtx.translate(w, 0);
    pipCtx.scale(-1, 1);
  }
  pipCtx.drawImage(video, 0, 0, w, h);
  pipCtx.fillStyle = 'rgba(11, 10, 23, 0.3)';
  pipCtx.fillRect(0, 0, w, h);
  for (const hand of tracker.hands) {
    const lm = hand.image;
    pipCtx.strokeStyle = hand.pose === 'gun' ? '#e2b45c' : hand.grip ? '#8be9ff' : '#b48cff';
    pipCtx.lineWidth = 1.5;
    pipCtx.beginPath();
    for (const [a, b] of HAND_BONES) {
      pipCtx.moveTo(lm[a * 3] * w, lm[a * 3 + 1] * h);
      pipCtx.lineTo(lm[b * 3] * w, lm[b * 3 + 1] * h);
    }
    pipCtx.stroke();
  }
  pipCtx.restore();
}

/* ---------- Main loop ---------- */

let last = performance.now();
let lastReadout = 0;
let lastHandsAt = performance.now();

function updateHint(now) {
  let text = null;
  if (mode === 'game') {
    if (tracker.hands.length) lastHandsAt = now;
    if (now - lastHandsAt > 1500) text = 'Show your hands to the camera, 30–60 cm away, lit from the front.';
    else if (gameHint && now < gameHintUntil) text = gameHint;
  }
  const el = $('hint');
  if (el.textContent !== (text ?? '')) el.textContent = text ?? '';
  el.hidden = !text;
}

function updateReadouts() {
  $('roTrack').textContent = `${tracker.fps.toFixed(0)} fps · ${tracker.delegate}`;
  $('roRender').textContent = `${stage.fps.toFixed(0)} fps · ${Math.round(stage.scale * 100)}%`;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = now - last;
  const dt = Math.min(dtMs / 1000, 0.05);
  last = now;
  stage.adapt(dtMs);
  arena.update(now / 1000);

  if (mode === 'game') {
    tracker.update(now);
    game.update(dt, tracker.slots);
    tracker.slots.forEach((slot, i) => {
      const show = slot.active && !game.hideHand(i);
      avatars[i].group.visible = show;
      if (show) avatars[i].update(slot.joints, slot.side, settings.joints);
    });
    drawPip();
    if (now - lastReadout > 300) {
      lastReadout = now;
      updateReadouts();
    }
  } else {
    if (view.auto) view.yaw += dt * 0.35;
    holder.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
    showcase.update(dt);
    props.update(dt, null);
    game.updateCasings(dt);
    $('armoryAmmo').textContent = String(showcase.loaded);
  }

  fx.update(dt);
  updateHint(now);
  stage.render();
}

// ?debug exposes the game objects in the console.
if (new URLSearchParams(location.search).has('debug')) {
  window.hexDebug = { game, stage, showcase, props, enemies, get tracker() { return tracker; } };
}

setMode('title');
requestAnimationFrame(frame);
