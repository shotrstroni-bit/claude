import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Stage } from './scene.js';
import { HandAvatar, createHandMaterials, SKIN_TONES } from './handRig.js';
import { DemoHand } from './demoHand.js';
import { Effects } from './fx.js';
import { Sfx } from './audio.js';
import { PopGame } from './game/pop.js';
import { SandboxGame } from './game/sandbox.js';
import { HAND_BONES } from './landmarks.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const video = $('cam');

/* ---------- Settings ---------- */

const DEFAULTS = { mode: 'pop', backdrop: 'studio', look: 'skin', tone: 2, mirror: true, joints: false, sound: true, fov: 64 };
const settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('handspace.settings') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
})();
function saveSettings() {
  try {
    localStorage.setItem('handspace.settings', JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

/* ---------- Scene ---------- */

const stage = new Stage($('scene'));
const fx = new Effects(stage.scene);
const sfx = new Sfx();
sfx.enabled = settings.sound;
const materials = createHandMaterials();

let assets = { left: null, right: null };
try {
  const loader = new GLTFLoader();
  const [left, right] = await Promise.all([
    loader.loadAsync('assets/hands/left.glb'),
    loader.loadAsync('assets/hands/right.glb'),
  ]);
  assets = { left: left.scene, right: right.scene };
} catch (err) {
  console.warn('Hand meshes did not load; showing the joint skeleton instead.', err);
}

const avatars = [0, 1].map(() => new HandAvatar(assets, materials));
const demoAvatar = new HandAvatar(assets, materials);
for (const a of [...avatars, demoAvatar]) {
  a.group.visible = false;
  stage.scene.add(a.group);
}
const demo = new DemoHand();

// Beside the intro card on wide screens, above it on phones.
function placeDemo() {
  const wide = stage.width > 720;
  const depth = wide ? 0.42 : 0.95;
  stage.pointAt(wide ? 0.36 : 0, wide ? -0.34 : 0.36, depth, demo.anchor);
  if (!tracker) stage.setRoomDepth(depth);
}
/* ---------- UI used by the game modes ---------- */

let gameHint = null;
let gameHintUntil = 0;
let centerTimer = 0;

const ui = {
  setScore(score, mult = 1) {
    $('scoreBox').hidden = score === null;
    if (score === null) return;
    $('score').textContent = score.toLocaleString();
    $('mult').hidden = mult <= 1;
    $('mult').textContent = `×${mult} streak`;
  },
  setTimer(seconds) {
    const el = $('timer');
    el.hidden = seconds === null;
    if (seconds === null) return;
    const s = Math.ceil(seconds);
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('low', s <= 10);
  },
  center(text, holdMs = 900) {
    const el = $('centerMsg');
    clearTimeout(centerTimer);
    if (!text) {
      el.hidden = true;
      return;
    }
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth; // restart the CSS animation
    el.style.animation = '';
    centerTimer = setTimeout(() => (el.hidden = true), holdMs);
  },
  hint(text, holdMs = 0) {
    gameHint = text;
    gameHintUntil = holdMs ? performance.now() + holdMs : Infinity;
  },
  showResults(stats) {
    $('results').hidden = !stats;
    if (!stats) return;
    $('finalScore').textContent = stats.score.toLocaleString();
    $('newBest').hidden = !stats.newBest;
    $('stPops').textContent = stats.pops;
    $('stGold').textContent = stats.golds;
    $('stCombo').textContent = stats.bestCombo;
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

/* ---------- Game modes ---------- */

let tracker = null;
const context = { stage, fx, sfx, ui, getDepth: () => tracker?.typicalDepth ?? 0.45 };
const games = { pop: new PopGame(context), sandbox: new SandboxGame(context) };
let game = null;
placeDemo();

function syncPressed(attr, value) {
  for (const b of document.querySelectorAll(`[${attr}]`)) {
    b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value));
  }
}

function setMode(mode) {
  settings.mode = mode;
  saveSettings();
  app.dataset.mode = mode;
  syncPressed('data-set-mode', mode);
  if (!tracker || game === games[mode]) return;
  game?.exit();
  game = games[mode];
  game.enter();
}

function setBackdrop(backdrop) {
  settings.backdrop = backdrop;
  saveSettings();
  app.dataset.backdrop = backdrop;
  syncPressed('data-set-backdrop', backdrop);
  stage.setBackdrop(tracker ? backdrop : 'studio');
}

/* ---------- Hand look ---------- */

function buildSwatches() {
  const wrap = $('swatches');
  SKIN_TONES.forEach((hex, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = hex;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `Skin tone ${i + 1}`);
    b.dataset.look = 'skin';
    b.dataset.tone = String(i);
    wrap.append(b);
  });
  for (const [look, label] of [
    ['holo', 'Hologram'],
    ['skeleton', 'Joints only'],
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch text';
    b.textContent = label;
    b.setAttribute('role', 'radio');
    b.dataset.look = look;
    wrap.append(b);
  }
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
  for (const a of [...avatars, demoAvatar]) a.setLook(settings.look);
  for (const b of $('swatches').children) {
    const on = b.dataset.look === settings.look && (settings.look !== 'skin' || Number(b.dataset.tone) === settings.tone);
    b.setAttribute('aria-checked', String(on));
  }
}

/* ---------- Starting the camera ---------- */

function setStatus(text, error = false) {
  const el = $('introStatus');
  el.textContent = text;
  el.classList.toggle('error', error);
}

async function start(mode) {
  sfx.unlock();
  const buttons = document.querySelectorAll('[data-start]');
  buttons.forEach((b) => (b.disabled = true));
  setStatus('Opening the camera…');
  let stage1Done = false;
  try {
    const { openCamera, createLandmarker, Tracker } = await import('./tracker.js');
    if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
    await openCamera(video);
    stage1Done = true;
    setStatus('Loading the hand tracker. The first visit downloads about 8 MB…');
    const { landmarker, delegate } = await createLandmarker();
    tracker = new Tracker(video, landmarker, delegate);
    tracker.setMirror(settings.mirror);
    tracker.setFov(settings.fov);
    video.classList.toggle('mirrored', settings.mirror);
    stage.setCameraModel(video.videoWidth, video.videoHeight, settings.fov);
    $('intro').hidden = true;
    app.dataset.live = 'true';
    demoAvatar.group.visible = false;
    setBackdrop(settings.backdrop);
    setMode(mode);
  } catch (err) {
    console.error(err);
    const message = err?.code
      ? err.message
      : stage1Done
        ? 'The hand tracker could not load. Check your internet connection and press Start again.'
        : `Something went wrong: ${err?.message || err}`;
    setStatus(message, true);
    buttons.forEach((b) => (b.disabled = false));
  }
}

/* ---------- Wiring ---------- */

buildSwatches();
applyLook();
setBackdrop(settings.backdrop);
syncPressed('data-set-mode', settings.mode);
$('optMirror').checked = settings.mirror;
$('optJoints').checked = settings.joints;
$('optSound').checked = settings.sound;
$('optFov').value = String(settings.fov);
$('fovOut').textContent = `${settings.fov}°`;

for (const b of document.querySelectorAll('[data-start]')) {
  b.addEventListener('click', () => start(b.dataset.start));
}
document.addEventListener('click', (e) => {
  const modeBtn = e.target.closest('[data-set-mode]');
  if (modeBtn) {
    sfx.unlock();
    setMode(modeBtn.dataset.setMode);
  }
  const backdropBtn = e.target.closest('[data-set-backdrop]');
  if (backdropBtn) setBackdrop(backdropBtn.dataset.setBackdrop);
});
$('againBtn').addEventListener('click', () => {
  sfx.unlock();
  games.pop.restart();
});

function setDrawer(open) {
  $('settings').hidden = !open;
  $('settingsBtn').setAttribute('aria-expanded', String(open));
  if (open) $('settingsClose').focus();
  else $('settingsBtn').focus();
}
$('settingsBtn').addEventListener('click', () => setDrawer($('settings').hidden));
$('settingsClose').addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('settings').hidden) setDrawer(false);
});

$('optMirror').addEventListener('change', (e) => {
  settings.mirror = e.target.checked;
  saveSettings();
  video.classList.toggle('mirrored', settings.mirror);
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
  placeDemo();
});

/* ---------- Camera thumbnail ---------- */

const pip = $('pip');
const pipCtx = pip.getContext('2d');

function drawPip() {
  if (!tracker || settings.backdrop === 'camera') return;
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
  pipCtx.fillStyle = 'rgba(12, 19, 23, 0.3)';
  pipCtx.fillRect(0, 0, w, h);
  for (const hand of tracker.hands) {
    const lm = hand.image;
    if (!lm) continue;
    pipCtx.strokeStyle = '#7fd6e8';
    pipCtx.lineWidth = 1.5;
    pipCtx.beginPath();
    for (const [a, b] of HAND_BONES) {
      pipCtx.moveTo(lm[a].x * w, lm[a].y * h);
      pipCtx.lineTo(lm[b].x * w, lm[b].y * h);
    }
    pipCtx.stroke();
    pipCtx.fillStyle = '#ffb04a';
    for (const p of lm) {
      pipCtx.beginPath();
      pipCtx.arc(p.x * w, p.y * h, 2, 0, Math.PI * 2);
      pipCtx.fill();
    }
  }
  pipCtx.restore();
}

/* ---------- Main loop ---------- */

let last = performance.now();
let lastReadout = 0;
let lastHandsAt = performance.now();

function updateHint(now, hands) {
  let text = null;
  if (tracker) {
    if (hands.length) lastHandsAt = now;
    if (now - lastHandsAt > 1200) text = 'Show your hands to the camera, about an arm’s length away.';
    else if (gameHint && now < gameHintUntil) text = gameHint;
  }
  const el = $('hint');
  if (el.textContent !== (text ?? '')) el.textContent = text ?? '';
  el.hidden = !text;
}

function updateReadouts() {
  const hand = tracker.hands[0];
  $('roLen').textContent = hand ? `${(hand.handLength * 100).toFixed(1)} cm` : '–';
  $('roDist').textContent = hand ? `${(hand.depth * 100).toFixed(0)} cm` : '–';
  $('roFps').textContent = `${tracker.fps.toFixed(0)} fps · ${tracker.delegate}`;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  let hands = [];
  if (tracker) {
    const fresh = tracker.update(now);
    hands = tracker.hands;
    tracker.slots.forEach((slot, i) => {
      avatars[i].group.visible = slot.active;
      if (slot.active) avatars[i].update(slot.joints, slot.side, settings.joints);
    });
    game?.update(dt, now, hands, fresh);
    stage.setRoomDepth(tracker.typicalDepth);
    if (now - lastReadout > 200) {
      lastReadout = now;
      updateReadouts();
    }
    drawPip();
  } else {
    demoAvatar.group.visible = true;
    demoAvatar.update(demo.pose(now / 1000), 'right', false);
  }

  fx.update(dt);
  updateHint(now, hands);
  stage.render();
}
requestAnimationFrame(frame);
