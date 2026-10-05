import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildAndroid18, sharedUniforms } from './character.js';
import { buildWorld } from './world.js';

const host = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.position.set(1.0, 1.2, 3.3);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.92, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 0.55;
controls.maxDistance = 7;
controls.maxPolarAngle = 1.5;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.9;

const shared = sharedUniforms();
const { world, clouds } = buildWorld(shared);
scene.add(world);

const VIEWS = {
  full: { pos: [1.0, 1.2, 3.3], target: [0, 0.92, 0] },
  face: { pos: [0.18, 1.56, 0.62], target: [0, 1.53, 0] },
  back: { pos: [-0.9, 1.15, -3.1], target: [0, 0.9, 0] }
};
let camTween = null;
function goView(name, instant) {
  const v = VIEWS[name];
  controls.autoRotate = false;
  syncSpinButton();
  camTween = {
    t: 0,
    fromPos: camera.position.clone(), toPos: new THREE.Vector3(...v.pos),
    fromTarget: controls.target.clone(), toTarget: new THREE.Vector3(...v.target)
  };
  if (instant) camTween.t = 0.999;
}

const ui = {
  loader: document.getElementById('loader'),
  stats: document.getElementById('stats'),
  spin: document.getElementById('btn-spin'),
  outline: document.getElementById('btn-outline')
};
function syncSpinButton() { ui.spin.textContent = controls.autoRotate ? 'Pause spin' : 'Spin'; }
ui.spin.onclick = () => { controls.autoRotate = !controls.autoRotate; syncSpinButton(); };
document.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => goView(b.dataset.view); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); ui.spin.click(); }
  if (e.code === 'Digit1') goView('full');
  if (e.code === 'Digit2') goView('face');
  if (e.code === 'Digit3') goView('back');
});

let character = null;
window.__test3d = { ready: false };

requestAnimationFrame(() => setTimeout(async () => {
  character = await buildAndroid18(shared);
  scene.add(character.group);
  ui.outline.onclick = () => {
    character.outlines.visible = !character.outlines.visible;
    ui.outline.textContent = character.outlines.visible ? 'Outline: on' : 'Outline: off';
  };
  ui.loader.classList.add('done');
  ui.stats.textContent = `${(character.tris / 1000).toFixed(0)}k triangles · sculpted in ${character.buildMs} ms`;
  window.__test3d = { ready: true, buildMs: character.buildMs, tris: character.tris, goView, controls };
}, 30));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / 0.9);
    const k = 1 - Math.pow(1 - camTween.t, 3);
    camera.position.lerpVectors(camTween.fromPos, camTween.toPos, k);
    controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, k);
    if (camTween.t >= 1) camTween = null;
  }
  if (character) {
    character.group.scale.y = 1 + 0.0035 * Math.sin(t * 2.1);
    character.group.rotation.z = 0.005 * Math.sin(t * 1.1);
  }
  clouds.rotation.y += dt * 0.004;
  controls.update();
  renderer.render(scene, camera);
});
