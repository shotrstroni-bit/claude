import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * Colt Python, 6-inch barrel, stainless with walnut target grips.
 * Built in millimetres in the gun's own frame: +x toward the muzzle, +y up,
 * +z to the gun's right. The left side (-z) carries the cylinder latch, the
 * roll mark, and the side the cylinder swings out to.
 */
export const DIM = {
  BORE_Y: 0,
  CYL_Y: -13.5, // cylinder axis sits one chamber pitch below the bore
  PITCH: 13.5,
  CYL_R: 19.9,
  X0: -20.7, // cylinder rear face
  X1: 20.6, // cylinder front face
  CHAMBER: 4.75,
  CASE_LEN: 33, // .357 Magnum
  MUZZLE: 173,
  HAMMER_PIVOT: [-40, -10],
  TRIGGER_PIVOT: [-8, -40],
  CRANE_PIVOT: [-33, -6], // (y, z) of the crane hinge, parallel to the bore
};

const TAU = Math.PI * 2;
const v2 = (x, y) => new THREE.Vector2(x, y);

/** Closed outline with filleted corners; each point is [x, y, radius?]. */
function rounded(points, r = 1.5, PathType = THREE.Shape) {
  const path = new PathType();
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[(i - 1 + n) % n];
    const [x1, y1, r1 = r] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    const l1 = Math.hypot(x0 - x1, y0 - y1);
    const l2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r1, l1 / 2, l2 / 2);
    const ax = x1 + ((x0 - x1) / l1) * rr;
    const ay = y1 + ((y0 - y1) / l1) * rr;
    const bx = x1 + ((x2 - x1) / l2) * rr;
    const by = y1 + ((y2 - y1) / l2) * rr;
    if (i === 0) path.moveTo(ax, ay);
    else path.lineTo(ax, ay);
    if (rr > 0) path.quadraticCurveTo(x1, y1, bx, by);
  }
  path.closePath();
  return path;
}

/** Extrude a side profile to a total width, centred on z = 0, edges rounded. */
function extrude(shape, width, bevel = 1.2, curveSegments = 10) {
  const depth = Math.max(0.1, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Merge parts that share a material (mixing indexed and non-indexed input). */
function merge(list) {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** Cylinder geometry lying along +x. */
function rod(radius, x0, x1, segments = 32, radius2 = radius, open = false) {
  const g = new THREE.CylinderGeometry(radius2, radius, x1 - x0, segments, 1, open);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, 0);
  return g;
}

/** Chamber k in the cylinder's own frame (y, z), with chamber 0 on top. */
export function chamberYZ(k) {
  const a = (k * TAU) / 6;
  return [DIM.PITCH * Math.cos(a), DIM.PITCH * Math.sin(a)];
}

/* ---------- Canvas textures ---------- */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Grip bounds in mm; the extrude UVs are raw mm, so textures map through these.
const GRIP_BOX = { x0: -116, x1: -34, y0: -134, y1: -1 };

function gripShape() {
  const s = new THREE.Shape();
  s.moveTo(-36, -40);
  s.splineThru([
    v2(-38, -56), v2(-42, -74), v2(-47, -94), v2(-55, -112), v2(-64, -125), v2(-76, -131.5),
    v2(-92, -133), v2(-106, -131), v2(-115, -124.5), v2(-114, -110), v2(-104, -86),
    v2(-90, -62), v2(-76, -42), v2(-64, -25), v2(-56, -12), v2(-49, -4), v2(-44, -9),
    v2(-40.5, -24), v2(-36, -40),
  ]);
  return s;
}

const MEDALLION = [-61, -50];

function walnutTextures(outline) {
  const W = 512;
  const H = Math.round((W * (GRIP_BOX.y1 - GRIP_BOX.y0)) / (GRIP_BOX.x1 - GRIP_BOX.x0));
  const pxPerMm = W / (GRIP_BOX.x1 - GRIP_BOX.x0);
  const toPx = (x, y) => [(x - GRIP_BOX.x0) * pxPerMm, (GRIP_BOX.y1 - y) * pxPerMm];
  const [c, g] = canvas(W, H);
  const [b, gb] = canvas(W, H);

  // Walnut: warm brown with dark figure running down the grip.
  const base = g.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#5a3220');
  base.addColorStop(0.5, '#4a2818');
  base.addColorStop(1, '#3a1e12');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, W, H);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rand() * W * 1.4 - W * 0.2;
    g.strokeStyle = `rgba(${20 + rand() * 30},${8 + rand() * 12},${4},${0.25 + rand() * 0.35})`;
    g.lineWidth = 1 + rand() * 4;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= H; y += 24) g.lineTo(x + Math.sin(y * 0.02 + i) * 14 + y * 0.18, y);
    g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(150,90,50,${0.06 + rand() * 0.06})`;
    g.beginPath();
    g.ellipse(rand() * W, rand() * H, 10 + rand() * 30, 40 + rand() * 80, 0.3, 0, TAU);
    g.fill();
  }

  // Checkering panel: the grip outline pulled 18% toward its centre, minus a
  // border around the medallion.
  const pts = outline.getSpacedPoints(160);
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const panel = (ctx) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = toPx(cx + (p.x - cx) * 0.8, cy + (p.y - cy) * 0.84 - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  const [mx, my] = toPx(MEDALLION[0], MEDALLION[1]);
  for (const ctx of [g, gb]) {
    ctx.save();
    panel(ctx);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(mx, my, 9 * pxPerMm, 0, TAU, true);
    ctx.clip('evenodd');
    const step = 1.25 * pxPerMm;
    ctx.lineWidth = Math.max(1, step * 0.32);
    ctx.strokeStyle = ctx === g ? 'rgba(18,8,3,0.62)' : '#2a2a2a';
    for (const dir of [1, -1]) {
      ctx.beginPath();
      for (let k = -H; k < W + H; k += step) {
        ctx.moveTo(k, 0);
        ctx.lineTo(k + dir * H * 0.55, H);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    panel(ctx);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ctx === g ? 'rgba(20,9,4,0.6)' : '#404040';
    ctx.stroke();
    ctx.restore();
  }
  const map = texture(c);
  const bump = texture(b, false);
  for (const t of [map, bump]) {
    t.repeat.set(1 / (GRIP_BOX.x1 - GRIP_BOX.x0), 1 / (GRIP_BOX.y1 - GRIP_BOX.y0));
    t.offset.set(-GRIP_BOX.x0 / (GRIP_BOX.x1 - GRIP_BOX.x0), -GRIP_BOX.y0 / (GRIP_BOX.y1 - GRIP_BOX.y0));
  }
  return { map, bump };
}

function medallionTexture() {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(54, 50, 6, 64, 64, 64);
  grad.addColorStop(0, '#f4f5f6');
  grad.addColorStop(1, '#9ea2a6');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#6f7378';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 58, 0, TAU);
  g.stroke();
  // Rampant colt, rearing and facing left.
  const horse = [
    [0.30, 0.10], [0.24, 0.17], [0.15, 0.29], [0.19, 0.34], [0.29, 0.31], [0.35, 0.41], [0.27, 0.45],
    [0.17, 0.5], [0.19, 0.57], [0.29, 0.53], [0.4, 0.52], [0.45, 0.57], [0.55, 0.67], [0.56, 0.83],
    [0.5, 0.94], [0.59, 0.94], [0.65, 0.8], [0.69, 0.91], [0.76, 0.91], [0.72, 0.73], [0.71, 0.6],
    [0.8, 0.63], [0.87, 0.76], [0.85, 0.56], [0.73, 0.47], [0.57, 0.39], [0.47, 0.27], [0.39, 0.13],
  ];
  g.fillStyle = '#3d4044';
  g.beginPath();
  horse.forEach(([x, y], i) => (i ? g.lineTo(18 + x * 92, 14 + y * 98) : g.moveTo(18 + x * 92, 14 + y * 98)));
  g.closePath();
  g.fill();
  return texture(c);
}

function rollmarkTexture() {
  const [c, g] = canvas(1024, 96);
  g.clearRect(0, 0, 1024, 96);
  g.font = '600 58px "IBM Plex Mono", "Courier New", monospace';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(40,42,46,0.85)';
  g.fillText('PYTHON  .357', 40, 50);
  g.font = '500 30px "IBM Plex Mono", "Courier New", monospace';
  g.fillText('MAGNUM CTG.', 640, 52);
  return texture(c);
}

function flashTexture() {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,235,1)');
  grad.addColorStop(0.18, 'rgba(255,214,120,0.95)');
  grad.addColorStop(0.45, 'rgba(255,120,30,0.45)');
  grad.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = grad;
  g.translate(128, 128);
  for (let i = 0; i < 7; i++) {
    g.rotate(TAU / 7 + (i % 2) * 0.2);
    g.beginPath();
    g.moveTo(-10, 0);
    g.lineTo(0, -120 + (i % 3) * 22);
    g.lineTo(10, 0);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, 60, 0, TAU);
  g.fill();
  return texture(c);
}

export function createGunMaterials() {
  // The scene's environment is kept dim for the night courtyard; polished
  // steel needs much more of it to read as metal.
  const std = (o) => new THREE.MeshStandardMaterial({ envMapIntensity: o.metalness >= 0.9 ? 5.5 : 1.5, ...o });
  const wood = walnutTextures(gripShape());
  return {
    steel: std({ color: '#d5d8db', metalness: 1, roughness: 0.2 }),
    matte: std({ color: '#c3c6c9', metalness: 1, roughness: 0.46 }),
    polished: std({ color: '#e4e6e8', metalness: 1, roughness: 0.1 }),
    dark: std({ color: '#151617', metalness: 0.5, roughness: 0.55 }),
    bore: std({ color: '#060606', metalness: 0.2, roughness: 0.9, side: THREE.BackSide }),
    brass: std({ color: '#cfa64e', metalness: 1, roughness: 0.26 }),
    copper: std({ color: '#b8703f', metalness: 1, roughness: 0.3 }),
    primer: std({ color: '#c4c8cc', metalness: 1, roughness: 0.3 }),
    wood: std({ map: wood.map, bumpMap: wood.bump, bumpScale: 1.6, roughness: 0.52, metalness: 0 }),
    medallion: std({ map: medallionTexture(), metalness: 1, roughness: 0.28 }),
    red: std({ color: '#ff3b26', emissive: '#a3140a', emissiveIntensity: 0.6, roughness: 0.4 }),
    rollmark: std({
      map: rollmarkTexture(),
      transparent: true,
      metalness: 0.6,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    flash: new THREE.SpriteMaterial({
      map: flashTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  };
}

/* ---------- Parts ---------- */

function frameGeometry() {
  const outline = rounded([
    [40, 12, 1], [-24, 12, 1], [-31, 10.5, 3], [-37, 7, 4], [-41, 1, 4], [-44.5, -8, 4], [-47, -20, 5],
    [-44, -33, 4], [-36, -41, 3], [-31, -44, 1.5], [16, -44, 2], [25, -42, 4], [33, -36, 5], [38, -27, 4],
    [40, -16, 2],
  ]);
  outline.holes.push(
    rounded([[-22.6, 7.5, 2.5], [21.4, 7.5, 2.5], [21.4, -36, 3], [-22.6, -36, 3]], 2.5, THREE.Path),
  );
  return extrude(outline, 18, 1.4, 16);
}

function underlugGeometry() {
  return extrude(
    rounded([[38, -2, 0], [171.5, -2, 0], [173, -4, 1.5], [173, -14, 3], [170, -21.5, 6], [163, -24, 4], [44, -24, 3], [38, -22, 2]]),
    15,
    3.6,
    16,
  );
}

function ribGeometry() {
  const rib = rounded([[42, 5, 0], [171.5, 5, 0], [171.5, 15, 0.8], [42, 15, 3]]);
  for (const s of [54, 80, 106, 132]) {
    rib.holes.push(rounded([[s, 9.2], [s + 20, 9.2], [s + 20, 13.3], [s, 13.3]], 1.5, THREE.Path));
  }
  return extrude(rib, 7.6, 0.8);
}

function frontSightGeometry() {
  return extrude(rounded([[154, 14.5, 0], [171.5, 14.5, 0], [171.5, 23.5, 1], [168.5, 24, 1], [154, 15.6, 3]]), 3.3, 0.5);
}

function rearSightBlade() {
  // Blade drawn face-on (z across, y up) with a square notch, then turned to face the shooter.
  const s = new THREE.Shape([
    v2(-4.6, 14.5), v2(4.6, 14.5), v2(4.6, 19.2), v2(1.15, 19.2), v2(1.15, 16.4),
    v2(-1.15, 16.4), v2(-1.15, 19.2), v2(-4.6, 19.2),
  ]);
  const g = new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // shape x -> gun z, extrusion -> -x
  g.translate(-19.4, 0, 0);
  return g;
}

function triggerGuardGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-33, -42);
  s.splineThru([v2(-36.5, -52), v2(-35, -63), v2(-27, -73), v2(-13, -78.5), v2(2, -77), v2(12.5, -69), v2(16.5, -57)]);
  s.lineTo(16.5, -42);
  s.lineTo(12.4, -42);
  s.lineTo(12.4, -56.5);
  s.splineThru([v2(9, -66.5), v2(0.5, -73.3), v2(-12.5, -74.5), v2(-24, -70), v2(-30.5, -62.5), v2(-32, -53), v2(-29, -42)]);
  s.lineTo(-33, -42);
  return extrude(s, 7.4, 1.4, 24);
}

function hammerGeometry() {
  // Relative to the hammer pivot; the face meets the firing-pin hole at rest.
  const body = extrude(
    rounded([
      [-7, -9, 2], [5, -10, 3], [10, -4, 3], [12.5, 3, 2], [12.8, 7, 0.6], [12.8, 13, 0.6], [10, 17, 2],
      [3, 20.5, 3], [-6, 23.5, 2], [-9, 13, 3], [-8.5, 4, 2], [-9, -4, 2],
    ]),
    7.4,
    1,
  );
  const spur = extrude(
    rounded([[-5, 24, 1.5], [-15, 26.8, 3], [-21, 26.2, 2.5], [-23.2, 23.4, 2], [-20, 20.6, 2], [-13, 18.4, 3], [-7, 18.6, 2]]),
    11.5,
    1.6,
  );
  const pin = rod(0.95, 12.6, 15.2, 12);
  pin.translate(0, 10, 0);
  return merge([body, spur, pin]);
}

function triggerGeometry() {
  return extrude(
    rounded([
      [-3, 3, 1], [4, 3, 1], [4, -4, 2], [2.6, -12, 4], [-0.5, -20, 4], [-4.5, -27, 2.5], [-7.6, -26.4, 2.5],
      [-5, -19, 4], [-3.2, -11, 3], [-3.6, -3, 2],
    ]),
    7,
    1.3,
  );
}

function latchGeometry() {
  const g = extrude(rounded([[-35, -3.5], [-27, -3.5], [-26.5, 4], [-35.5, 4]], 1.6), 3.2, 0.9);
  g.translate(0, 0, -10.2);
  return g;
}

/* ---------- Cylinder ---------- */

function flutedCylinderGeometry() {
  const { CYL_R: R, X0, X1 } = DIM;
  const SEG = 144;
  const flutes = [0, 1, 2, 3, 4, 5].map((k) => ((k + 0.5) * TAU) / 6);
  const halfWidth = THREE.MathUtils.degToRad(12.8);
  const fx0 = -14.8;
  const fx1 = 12.6;
  const xs = [];
  for (let x = X0; x <= X1 + 1e-6; x += 0.5) xs.push(Math.min(x, X1));
  if (xs[xs.length - 1] < X1) xs.push(X1);
  const pos = [];
  const radius = (phi, x) => {
    let r = R;
    const edge = Math.min(x - X0, X1 - x);
    if (edge < 1.3) r -= (1.3 - edge) * 0.95; // chamfered ends
    const along =
      THREE.MathUtils.smoothstep(x, fx0, fx0 + 4.5) * (1 - THREE.MathUtils.smoothstep(x, fx1 - 4.5, fx1));
    if (along > 0) {
      for (const f of flutes) {
        let d = Math.abs(phi - f);
        d = Math.min(d, TAU - d);
        if (d < halfWidth) r -= 3.4 * (1 - (d / halfWidth) ** 2) * along;
      }
    }
    return r;
  };
  for (const x of xs) {
    for (let i = 0; i < SEG; i++) {
      const phi = (i / SEG) * TAU;
      const r = radius(phi, x);
      pos.push(x, r * Math.cos(phi), r * Math.sin(phi));
    }
  }
  const idx = [];
  for (let j = 0; j < xs.length - 1; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * SEG + i;
      const b = j * SEG + ((i + 1) % SEG);
      const c = (j + 1) * SEG + i;
      const d = (j + 1) * SEG + ((i + 1) % SEG);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function cylinderFace(front) {
  const { CYL_R: R, CHAMBER, X0, X1 } = DIM;
  const s = new THREE.Shape();
  s.absarc(0, 0, R - 1.25, 0, TAU, false);
  for (let k = 0; k < 6; k++) {
    const [y, z] = chamberYZ(k);
    const h = new THREE.Path();
    // front face: shape x -> -z ; rear face: shape x -> +z
    h.absarc(front ? -z : z, y, front ? CHAMBER : CHAMBER + 0.05, 0, TAU, true);
    s.holes.push(h);
  }
  if (front) {
    const center = new THREE.Path();
    center.absarc(0, 0, 3, 0, TAU, true);
    s.holes.push(center);
  }
  const g = new THREE.ShapeGeometry(s, 48);
  g.rotateY(front ? Math.PI / 2 : -Math.PI / 2);
  g.translate(front ? X1 : X0, 0, 0);
  return g;
}

function ejectorStarGeometry() {
  const rimR = 5.8;
  const pts = [];
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU;
    let lo = 0;
    let hi = 11.4;
    for (let it = 0; it < 18; it++) {
      const r = (lo + hi) / 2;
      const sx = r * Math.cos(a);
      const sy = r * Math.sin(a);
      let ok = true;
      for (let k = 0; k < 6; k++) {
        const [y, z] = chamberYZ(k);
        if (Math.hypot(sx - z, sy - y) < rimR) ok = false;
      }
      if (ok) lo = r;
      else hi = r;
    }
    pts.push(v2(lo * Math.cos(a), lo * Math.sin(a)));
  }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 1.8, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // shape x -> +z, extrusion -> -x
  g.translate(DIM.X0 + 1.5, 0, 0);
  return g;
}

function bulletGeometry() {
  // .357 jacketed hollow point, profile from the case mouth forward.
  const profile = [
    [0.01, -3], [4.55, -3], [4.55, 2.4], [4.25, 4.5], [3.4, 6.3], [2.55, 7.2], [2.05, 7.05], [1.3, 6.3], [0.01, 6.1],
  ].map(([r, y]) => v2(r, y));
  const g = new THREE.LatheGeometry(profile, 28);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Shared geometry for one .357 Magnum cartridge, base at x = 0, pointing +x. */
export function cartridgeGeometries() {
  const rim = rod(5.6, -1.25, 0, 32);
  const body = rod(4.78, 0, DIM.CASE_LEN, 28, 4.72);
  const mouth = new THREE.RingGeometry(4.3, 4.72, 28);
  mouth.rotateY(Math.PI / 2);
  mouth.translate(DIM.CASE_LEN, 0, 0);
  const primer = rod(2.25, -1.45, -1.2, 24);
  const dimple = new THREE.CircleGeometry(0.85, 16);
  dimple.rotateY(-Math.PI / 2);
  dimple.translate(-1.47, 0, 0);
  const bullet = bulletGeometry();
  bullet.translate(DIM.CASE_LEN, 0, 0);
  return { brass: merge([rim, body, mouth]), primer, dimple, bullet };
}

/**
 * Builds the revolver. Moving parts hang from pivots so the mechanism can
 * animate them: hammer, trigger, latch, crane (swings the cylinder out),
 * cylinder spin, and ejector (pushes the cases out).
 */
export function buildRevolver(mat) {
  const root = new THREE.Group();
  root.scale.setScalar(0.001);

  /* Static frame, merged per material to keep draw calls down. */
  const steel = [];
  const matte = [];
  const dark = [];
  steel.push(frameGeometry());
  const shield = rod(19.4, -27, -22.2, 64);
  shield.translate(0, DIM.CYL_Y, 0);
  steel.push(shield);
  steel.push(rod(9.7, 37.5, 44.5, 40)); // barrel shoulder at the frame
  steel.push(rod(8.6, 40, DIM.MUZZLE, 48, 8.6, true)); // open at the muzzle so the bore shows
  steel.push(underlugGeometry());
  steel.push(triggerGuardGeometry());
  matte.push(ribGeometry());
  matte.push(frontSightGeometry());
  const sightBase = extrude(rounded([[-31, 12], [-17, 12], [-17.5, 14.6], [-30.5, 14.6]], 1), 10, 0.6);
  matte.push(sightBase);
  dark.push(rearSightBlade());

  // Muzzle crown and bore
  const crown = new THREE.RingGeometry(4.5, 8.2, 40);
  crown.rotateY(Math.PI / 2);
  crown.translate(DIM.MUZZLE + 0.01, 0, 0);
  steel.push(crown);
  const bore = rod(4.5, DIM.MUZZLE - 60, DIM.MUZZLE, 24, 4.5, true);
  // Firing-pin hole in the recoil shield
  const pinHole = new THREE.CircleGeometry(1.6, 16);
  pinHole.rotateY(-Math.PI / 2);
  pinHole.translate(-27.05, 0, 0);
  dark.push(pinHole);

  // Screws: two on the left side plate, one on the right
  for (const [x, y, side] of [[-31, -28, -1], [-2, -39, -1], [-16, -30, 1]]) {
    const head = new THREE.CylinderGeometry(2.3, 2.3, 0.7, 20);
    head.rotateX(Math.PI / 2);
    head.translate(x, y, side * 9.35);
    steel.push(head);
    const slot = new THREE.BoxGeometry(3.8, 0.55, 0.3);
    slot.translate(x, y, side * 9.75);
    dark.push(slot);
  }

  const mesh = (geom, m, cast = true) => {
    const o = new THREE.Mesh(geom, m);
    o.castShadow = cast;
    return o;
  };
  root.add(mesh(merge(steel), mat.steel));
  root.add(mesh(merge(matte), mat.matte));
  root.add(mesh(merge(dark), mat.dark, false));
  root.add(mesh(bore, mat.bore, false));

  // Red front sight insert, laid on the ramp's slope
  const insert = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.9, 3.45), mat.red);
  insert.position.set(162, 19.6, 0);
  insert.rotation.z = Math.atan2(24 - 15.6, 168.5 - 154);
  root.add(insert);

  // Walnut target grips with the Colt medallion on both sides
  const grip = new THREE.Mesh(extrude(gripShape(), 33, 5.5, 48), mat.wood);
  grip.castShadow = true;
  root.add(grip);
  for (const side of [-1, 1]) {
    const med = new THREE.CylinderGeometry(5.4, 5.4, 1.2, 32);
    med.rotateX(side * Math.PI / 2);
    med.translate(MEDALLION[0], MEDALLION[1], side * 16.6);
    root.add(new THREE.Mesh(med, mat.medallion));
  }

  // Roll mark on the left of the barrel
  const roll = new THREE.Mesh(new THREE.PlaneGeometry(58, 5.4), mat.rollmark);
  roll.rotation.y = Math.PI;
  roll.position.set(86, -0.6, -8.66);
  root.add(roll);

  /* Hammer */
  const hammerPivot = new THREE.Group();
  hammerPivot.position.set(DIM.HAMMER_PIVOT[0], DIM.HAMMER_PIVOT[1], 0);
  hammerPivot.add(mesh(hammerGeometry(), mat.polished));
  root.add(hammerPivot);

  /* Trigger */
  const triggerPivot = new THREE.Group();
  triggerPivot.position.set(DIM.TRIGGER_PIVOT[0], DIM.TRIGGER_PIVOT[1], 0);
  triggerPivot.add(mesh(triggerGeometry(), mat.polished));
  root.add(triggerPivot);

  /* Cylinder latch (left side), slides back to release the crane */
  const latch = new THREE.Group();
  latch.add(mesh(latchGeometry(), mat.polished));
  for (let i = 0; i < 4; i++) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.2, 0.4), mat.dark);
    groove.position.set(-33.4 + i * 1.9, 0.25, -11.85);
    latch.add(groove);
  }
  root.add(latch);

  /* Crane: hinges on an axis parallel to the bore, low on the left */
  const [py, pz] = DIM.CRANE_PIVOT;
  const crane = new THREE.Group();
  crane.position.set(0, py, pz);
  root.add(crane);
  const craneBody = new THREE.Group();
  craneBody.position.set(0, -py, -pz);
  crane.add(craneBody);
  const dy = DIM.CYL_Y - py;
  const dz = -pz;
  const armMesh = mesh(new THREE.BoxGeometry(15, Math.hypot(dy, dz), 8), mat.steel);
  armMesh.position.set(29.5, (DIM.CYL_Y + py) / 2, pz / 2);
  armMesh.rotation.x = Math.atan2(dz, dy);
  craneBody.add(armMesh);
  const tube = rod(5.6, 21.2, 37.5, 32);
  tube.translate(0, DIM.CYL_Y, 0);
  const hinge = rod(4.4, 21.2, 37.5, 24);
  hinge.translate(0, py, pz);
  craneBody.add(mesh(merge([tube, hinge]), mat.steel));

  /* Cylinder, spinning on its own axis */
  const cylAxis = new THREE.Group();
  cylAxis.position.set(0, DIM.CYL_Y, 0);
  craneBody.add(cylAxis);
  const spin = new THREE.Group();
  cylAxis.add(spin);
  spin.add(mesh(flutedCylinderGeometry(), mat.steel));
  spin.add(mesh(merge([cylinderFace(true), cylinderFace(false)]), mat.steel, false));
  const chambers = [];
  const notches = [];
  for (let k = 0; k < 6; k++) {
    const [y, z] = chamberYZ(k);
    const c = rod(DIM.CHAMBER, DIM.X0, DIM.X1, 24, DIM.CHAMBER, true);
    c.translate(0, y, z);
    chambers.push(c);
    // Cylinder-stop notch on the outside, in line with each chamber
    const a = (k * TAU) / 6;
    const n = new THREE.BoxGeometry(3.4, 1.6, 2.6);
    n.rotateX(a);
    n.translate(-11.5, (DIM.CYL_R - 0.5) * Math.cos(a), (DIM.CYL_R - 0.5) * Math.sin(a));
    notches.push(n);
  }
  spin.add(mesh(merge(chambers), mat.bore, false));
  spin.add(mesh(merge(notches), mat.dark, false));

  /* Ejector: star, rod and knob; pushing it lifts the cases out */
  const ejector = new THREE.Group();
  spin.add(ejector);
  ejector.add(mesh(ejectorStarGeometry(), mat.polished, false));
  const ejRod = rod(2.3, DIM.X1 - 1, DIM.X1 + 50, 20);
  const knob = rod(3.7, DIM.X1 + 47, DIM.X1 + 56, 28);
  ejector.add(mesh(merge([ejRod, knob]), mat.steel, false));

  const cg = cartridgeGeometries();
  const cartridges = [];
  for (let k = 0; k < 6; k++) {
    const [y, z] = chamberYZ(k);
    const round = new THREE.Group();
    round.position.set(DIM.X0, y, z);
    const brass = new THREE.Mesh(cg.brass, mat.brass);
    const primer = new THREE.Mesh(cg.primer, mat.primer);
    const dimple = new THREE.Mesh(cg.dimple, mat.dark);
    const bullet = new THREE.Mesh(cg.bullet, mat.copper);
    dimple.visible = false;
    round.add(brass, primer, dimple, bullet);
    ejector.add(round);
    cartridges.push({ group: round, bullet, dimple, home: round.position.clone() });
  }

  /* Muzzle flash and cylinder-gap flash */
  const flash = new THREE.Sprite(mat.flash);
  flash.position.set(DIM.MUZZLE + 34, 0, 0);
  flash.scale.setScalar(120);
  flash.visible = false;
  root.add(flash);
  const gapFlashes = [-1, 1].map((side) => {
    const s = new THREE.Sprite(mat.flash);
    s.position.set(DIM.X1 + 0.5, 6, side * 14);
    s.scale.setScalar(34);
    s.visible = false;
    root.add(s);
    return s;
  });

  return {
    root,
    parts: { hammer: hammerPivot, trigger: triggerPivot, latch, crane, spin, ejector, cartridges, flash, gapFlashes },
    geometries: cg,
  };
}
