import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The webcam is your eyes, about 1.25 m above the courtyard floor.
export const FLOOR_Y = -1.25;
export const PORTAL_Z = -24;

const TAU = Math.PI * 2;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Flagstones: one tile of the texture is 2 m with irregular 50 cm stones. */
function flagstoneTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(11);
  g.fillStyle = '#17161c';
  g.fillRect(0, 0, 512, 512);
  const cell = 128;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const shift = y % 2 ? cell / 2 : 0;
      const l = 30 + r() * 16;
      g.fillStyle = `hsl(${235 + r() * 25}, ${6 + r() * 6}%, ${l}%)`;
      const px = x * cell + shift + 4 + r() * 3;
      const py = y * cell + 4 + r() * 3;
      for (const dx of [0, -512]) {
        g.beginPath();
        g.roundRect(px + dx, py, cell - 9 - r() * 3, cell - 9 - r() * 3, 6);
        g.fill();
      }
    }
  }
  // grain, cracks and wear
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.07})`;
    g.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3);
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    let x = r() * 512;
    let y = r() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) g.lineTo((x += (r() - 0.5) * 40), (y += (r() - 0.5) * 40));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function blockTexture() {
  const [c, g] = canvas(256, 512);
  const r = rng(5);
  g.fillStyle = '#1c1b22';
  g.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 8; y++) {
    const shift = y % 2 ? 64 : 0;
    for (let x = -1; x < 3; x++) {
      g.fillStyle = `hsl(${240 + r() * 20}, 7%, ${26 + r() * 12}%)`;
      g.fillRect(x * 128 + shift + 3, y * 64 + 3, 122, 58);
    }
  }
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
    g.fillRect(r() * 256, r() * 512, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function runeTexture(color, rings = true) {
  const [c, g] = canvas(512, 512);
  g.translate(256, 256);
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.shadowColor = color;
  g.shadowBlur = 12;
  if (rings) {
    for (const [rad, w] of [[240, 5], [206, 2], [120, 3]]) {
      g.lineWidth = w;
      g.beginPath();
      g.arc(0, 0, rad, 0, TAU);
      g.stroke();
    }
  }
  const r = rng(3);
  g.lineWidth = 4;
  for (let i = 0; i < 18; i++) {
    g.save();
    g.rotate((i / 18) * TAU);
    g.translate(0, -223);
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      g.moveTo((r() - 0.5) * 18, (r() - 0.5) * 18);
      g.lineTo((r() - 0.5) * 18, (r() - 0.5) * 18);
    }
    g.stroke();
    g.restore();
  }
  // star inside the inner ring
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = (i * 2 * TAU) / 5 - Math.PI / 2;
    const p = [Math.cos(a) * 118, Math.sin(a) * 118];
    if (i === 0) g.moveTo(...p);
    else g.lineTo(...p);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bandTexture() {
  const [c, g] = canvas(512, 64);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 64);
  g.strokeStyle = '#7fe8ff';
  g.lineWidth = 3;
  g.shadowColor = '#7fe8ff';
  g.shadowBlur = 8;
  const r = rng(9);
  for (let i = 0; i < 16; i++) {
    const x = 16 + i * 32;
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      g.moveTo(x + (r() - 0.5) * 16, 32 + (r() - 0.5) * 34);
      g.lineTo(x + (r() - 0.5) * 16, 32 + (r() - 0.5) * 34);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.3, inner.replace(/[\d.]+\)$/, '0.45)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flameTexture() {
  const [c, g] = canvas(64, 128);
  const grad = g.createRadialGradient(32, 96, 2, 32, 80, 60);
  grad.addColorStop(0, 'rgba(255,250,210,1)');
  grad.addColorStop(0.25, 'rgba(255,180,70,0.9)');
  grad.addColorStop(0.6, 'rgba(255,90,20,0.35)');
  grad.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 2);
  g.quadraticCurveTo(60, 70, 50, 110);
  g.quadraticCurveTo(32, 128, 14, 110);
  g.quadraticCurveTo(4, 70, 32, 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A moonlit courtyard on a tower top: flagstones, rune pillars, braziers and the portal enemies come through. */
export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.fog = new THREE.FogExp2('#0c0a1c', 0.032);
    scene.background = new THREE.Color('#05060d');

    /* Sky, stars and moon */
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(110, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color('#03040b') }, horizon: { value: new THREE.Color('#2a1748') } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main(){ float h = clamp(vDir.y * 2.2 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, h), 1.0); }',
      }),
    );
    this.group.add(sky);
    const starPos = [];
    const starCol = [];
    const r = rng(42);
    for (let i = 0; i < 1400; i++) {
      const a = r() * TAU;
      const y = 0.08 + r() * 0.92;
      const rad = Math.sqrt(1 - y * y);
      starPos.push(Math.cos(a) * rad * 95, y * 95, Math.sin(a) * rad * 95);
      const b = 0.4 + r() * 0.6;
      starCol.push(b, b, b * (0.9 + r() * 0.2));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starCol, 3));
    this.group.add(
      new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, fog: false })),
    );
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(235,240,255,1)'), fog: false, depthWrite: false }));
    moon.position.set(-34, 42, -78);
    moon.scale.setScalar(26);
    this.group.add(moon);

    /* Floor */
    const floorTex = flagstoneTexture();
    floorTex.repeat.set(30, 30);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ map: floorTex, color: '#8d89a6', roughness: 0.9, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, FLOOR_Y, -20);
    floor.receiveShadow = true;
    this.group.add(floor);

    /* Rune circle where the throwable things gather */
    this.circle = new THREE.Mesh(
      new THREE.CircleGeometry(2.9, 64),
      new THREE.MeshBasicMaterial({ map: runeTexture('#7fe8ff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3 }),
    );
    this.circle.rotation.x = -Math.PI / 2;
    this.circle.position.set(0, FLOOR_Y + 0.01, -5.4);
    this.group.add(this.circle);

    /* Walls: battlements down both sides and behind the portal */
    const stone = new THREE.MeshStandardMaterial({ map: blockTexture(), roughness: 0.9 });
    const wallParts = [];
    for (const side of [-1, 1]) {
      const wall = new THREE.BoxGeometry(0.7, 1.3, 26);
      wall.translate(side * 7.6, FLOOR_Y + 0.65, -14);
      wallParts.push(wall);
      for (let z = -2; z > -27; z -= 1.4) {
        const merlon = new THREE.BoxGeometry(0.7, 0.55, 0.7);
        merlon.translate(side * 7.6, FLOOR_Y + 1.57, z);
        wallParts.push(merlon);
      }
    }
    const back = new THREE.BoxGeometry(16, 6, 0.8);
    back.translate(0, FLOOR_Y + 3, -27.5);
    wallParts.push(back);
    const walls = new THREE.Mesh(mergeGeometries(wallParts.map((g) => g.toNonIndexed())), stone);
    walls.receiveShadow = true;
    this.group.add(walls);

    /* Pillars with glowing rune bands */
    const pillarParts = [];
    const bandMat = new THREE.MeshBasicMaterial({ map: bandTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    bandMat.map.repeat.set(2, 1);
    this.bandMat = bandMat;
    const bandGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.34, 32, 1, true);
    for (const z of [-6, -12, -18]) {
      for (const side of [-1, 1]) {
        const x = side * 5.2;
        const shaft = new THREE.CylinderGeometry(0.42, 0.48, 5.2, 18);
        shaft.translate(x, FLOOR_Y + 2.6, z);
        const base = new THREE.BoxGeometry(1.2, 0.35, 1.2);
        base.translate(x, FLOOR_Y + 0.17, z);
        const cap = new THREE.BoxGeometry(1.15, 0.3, 1.15);
        cap.translate(x, FLOOR_Y + 5.3, z);
        pillarParts.push(shaft, base, cap);
        const band = new THREE.Mesh(bandGeo, bandMat);
        band.position.set(x, FLOOR_Y + 2.1, z);
        this.group.add(band);
      }
    }
    const pillars = new THREE.Mesh(mergeGeometries(pillarParts.map((g) => g.toNonIndexed())), stone);
    pillars.castShadow = true;
    pillars.receiveShadow = true;
    this.group.add(pillars);

    /* Braziers */
    const iron = new THREE.MeshStandardMaterial({ color: '#2b2622', metalness: 0.8, roughness: 0.5 });
    const bowlGeo = new THREE.LatheGeometry(
      [[0.05, 0], [0.32, 0.05], [0.42, 0.22], [0.45, 0.3], [0.4, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)),
      20,
    );
    const flameMat = new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flames = [];
    this.fireLights = [];
    for (const side of [-1, 1]) {
      const x = side * 3.4;
      const z = -8.6;
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.1, 10), iron);
      stand.position.set(x, FLOOR_Y + 0.55, z);
      const bowl = new THREE.Mesh(bowlGeo, iron);
      bowl.position.set(x, FLOOR_Y + 1.08, z);
      bowl.castShadow = true;
      this.group.add(stand, bowl);
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Sprite(flameMat);
        f.position.set(x + (i - 1) * 0.12, FLOOR_Y + 1.62, z);
        f.userData.phase = r() * 10;
        this.flames.push(f);
        this.group.add(f);
      }
      const light = new THREE.PointLight('#ff9a48', 28, 0, 2);
      light.position.set(x, FLOOR_Y + 1.9, z);
      this.fireLights.push(light);
      this.group.add(light);
    }

    /* The portal hexlings pour out of */
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.36, 12, 48), stone);
    ring.position.set(0, FLOOR_Y + 3, PORTAL_Z);
    ring.castShadow = true;
    this.group.add(ring);
    this.portal = new THREE.Mesh(
      new THREE.CircleGeometry(2.45, 48),
      new THREE.MeshBasicMaterial({ map: runeTexture('#c45bff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }),
    );
    this.portal.position.set(0, FLOOR_Y + 3, PORTAL_Z + 0.05);
    this.group.add(this.portal);
    const portalGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(170,70,255,0.9)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    portalGlow.position.copy(this.portal.position);
    portalGlow.scale.setScalar(9);
    this.group.add(portalGlow);

    /* Lights */
    scene.add(new THREE.HemisphereLight('#4a5ca8', '#140d20', 0.42));
    const moonLight = new THREE.DirectionalLight('#b8c6ff', 1.25);
    moonLight.position.set(-6, 10, 2);
    moonLight.target.position.set(0, FLOOR_Y, -9);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    Object.assign(moonLight.shadow.camera, { left: -11, right: 11, top: 15, bottom: -6, near: 1, far: 40 });
    moonLight.shadow.bias = -0.0008;
    moonLight.shadow.normalBias = 0.04;
    scene.add(moonLight, moonLight.target);
    this.moonLight = moonLight;
  }

  setShadows(on) {
    this.moonLight.castShadow = on;
  }

  update(t) {
    for (const f of this.flames) {
      const k = f.userData.phase;
      f.scale.set(0.42 + Math.sin(t * 9 + k) * 0.05, 0.75 + Math.sin(t * 13 + k * 2) * 0.12, 1);
      f.material.rotation = Math.sin(t * 5 + k) * 0.08;
    }
    this.fireLights.forEach((l, i) => (l.intensity = 26 + Math.sin(t * 11 + i * 3) * 4 + Math.sin(t * 23 + i) * 3));
    this.portal.rotation.z = t * 0.35;
    this.circle.material.opacity = 0.26 + Math.sin(t * 1.6) * 0.08;
    this.bandMat.map.offset.x = t * 0.04;
  }
}
