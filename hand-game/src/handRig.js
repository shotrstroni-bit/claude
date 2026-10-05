import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { HAND_BONES } from './landmarks.js';

// Joint names used by the WebXR hand meshes (assets/hands/*.glb).
export const XR_JOINTS = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

// MediaPipe landmark for each WebXR joint. -1 marks the four finger
// metacarpal bases, which MediaPipe doesn't track; they're placed from the palm.
const MP_FOR_XR = [0, 1, 2, 3, 4, -1, 5, 6, 7, 8, -1, 9, 10, 11, 12, -1, 13, 14, 15, 16, -1, 17, 18, 19, 20];
const METACARPALS = [5, 10, 15, 20];
const WRIST = 0;
const INDEX_PROX = 6;
const MIDDLE_PROX = 11;
const PINKY_PROX = 21;
const CHAINS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
];

// Per joint: the joint its bone points at (-1 for fingertips, which reuse the
// bone before them), and which axis fixes the bone's twist: 0 = the line
// across the knuckles (fingers, wrist), 1 = the palm normal (thumb).
const NEXT = new Int8Array(25).fill(-1);
const PREV = new Int8Array(25).fill(-1);
const REF = new Uint8Array(25);
NEXT[WRIST] = MIDDLE_PROX;
CHAINS.forEach((chain, c) => {
  chain.forEach((j, k) => {
    NEXT[j] = k < chain.length - 1 ? chain[k + 1] : -1;
    PREV[j] = k > 0 ? chain[k - 1] : WRIST;
    REF[j] = c === 0 ? 1 : 0;
  });
});

const _d = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

function palmAxes(p, outLateral, outNormal) {
  outLateral.subVectors(p[PINKY_PROX], p[INDEX_PROX]).normalize();
  _u.subVectors(p[INDEX_PROX], p[WRIST]);
  _v.subVectors(p[PINKY_PROX], p[WRIST]);
  outNormal.crossVectors(_u, _v).normalize();
}

// A frame for joint j built only from joint positions. The same recipe runs on
// the mesh's bind pose and on the tracked pose; the rotation between the two
// frames is what each bone gets, so the mesh's own axis conventions never matter.
function jointFrame(p, j, lateral, normal, out) {
  if (NEXT[j] >= 0) _d.subVectors(p[NEXT[j]], p[j]);
  else _d.subVectors(p[j], p[PREV[j]]);
  _d.normalize();
  if (REF[j] === 0) {
    _y.crossVectors(_d, lateral);
    if (_y.lengthSq() < 1e-4) _y.copy(normal).addScaledVector(_d, -normal.dot(_d));
  } else {
    _y.copy(normal).addScaledVector(_d, -normal.dot(_d));
    if (_y.lengthSq() < 1e-4) _y.crossVectors(_d, lateral);
  }
  _y.normalize();
  _z.copy(_d).negate();
  _x.crossVectors(_y, _z).normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

function palmFrame(p, lateral, a, b, c) {
  a.subVectors(p[MIDDLE_PROX], p[WRIST]);
  const scale = a.length();
  a.divideScalar(scale);
  b.copy(lateral).addScaledVector(a, -lateral.dot(a)).normalize();
  c.crossVectors(a, b);
  return scale;
}

/* ---------- Materials ---------- */

export const SKIN_TONES = ['#f2cdb0', '#e2ad8c', '#c98c66', '#a46a4b', '#7b4b34', '#4e3023'];

function addRim(material, color, strength, power) {
  const rim = { value: new THREE.Color(color).multiplyScalar(strength) };
  material.userData.rim = rim;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rim;
    shader.uniforms.uRimPower = { value: power };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform float uRimPower;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), uRimPower);',
      );
  };
  return material;
}

export function createHandMaterials() {
  const skin = addRim(
    new THREE.MeshPhysicalMaterial({
      color: SKIN_TONES[2],
      roughness: 0.58,
      sheen: 0.6,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color('#ffd9c4'),
      clearcoat: 0.06,
      clearcoatRoughness: 0.6,
    }),
    '#ff8a6a',
    0.35,
    2.6,
  );
  const holo = addRim(
    new THREE.MeshStandardMaterial({
      color: '#0a2a33',
      emissive: '#0f3a44',
      roughness: 0.35,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
    '#7fd6e8',
    1.4,
    2.0,
  );
  const wire = new THREE.MeshBasicMaterial({
    color: '#7fd6e8',
    wireframe: true,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const bone = new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.4, metalness: 0.05 });
  const points = new THREE.MeshBasicMaterial({ color: '#ffb04a', depthTest: false, transparent: true });
  return {
    skin,
    holo,
    wire,
    bone,
    points,
    setTone(hex) {
      skin.color.set(hex);
      skin.sheenColor.set(hex).lerp(new THREE.Color('#ffffff'), 0.45);
    },
  };
}

/* ---------- Skinned mesh driven by tracked joints ---------- */

export class HandModel {
  constructor(gltfScene, side, wireMaterial) {
    this.side = side;
    this.root = SkeletonUtils.clone(gltfScene);
    this.root.traverse((o) => {
      if (o.isSkinnedMesh) this.mesh = o;
    });
    if (!this.mesh) throw new Error(`${side} hand mesh has no skinned mesh`);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.bones = XR_JOINTS.map((name) => this.root.getObjectByName(name));
    if (this.bones.some((b) => !b)) throw new Error(`${side} hand mesh is missing joints`);

    // The joints are flat children of the armature, so their local transforms
    // are already in hand space.
    const bind = this.bones.map((b) => b.position.clone());
    const lateral = new THREE.Vector3();
    const normal = new THREE.Vector3();
    palmAxes(bind, lateral, normal);
    this.offsets = this.bones.map((b, j) =>
      jointFrame(bind, j, lateral, normal, new THREE.Quaternion()).invert().multiply(b.quaternion),
    );
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const s = palmFrame(bind, lateral, a, b, c);
    this.metacarpalCoef = METACARPALS.map((m) => {
      const v = bind[m].clone().sub(bind[WRIST]);
      return [v.dot(a) / s, v.dot(b) / s, v.dot(c) / s];
    });

    this.wire = new THREE.SkinnedMesh(this.mesh.geometry, wireMaterial);
    this.wire.bind(this.mesh.skeleton, this.mesh.bindMatrix);
    this.wire.frustumCulled = false;
    this.wire.visible = false;
    this.mesh.parent.add(this.wire);

    this._p = Array.from({ length: 25 }, () => new THREE.Vector3());
    this._lateral = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  setMaterial(material, showWire) {
    this.mesh.material = material;
    this.wire.visible = showWire;
  }

  /** @param {THREE.Vector3[]} joints 21 MediaPipe joints in world space (metres) */
  update(joints) {
    const p = this._p;
    for (let j = 0; j < 25; j++) {
      if (MP_FOR_XR[j] >= 0) p[j].copy(joints[MP_FOR_XR[j]]);
    }
    const lateral = this._lateral;
    const normal = this._normal;
    palmAxes(p, lateral, normal);
    const s = palmFrame(p, lateral, this._a, this._b, this._c);
    METACARPALS.forEach((m, k) => {
      const [ka, kb, kc] = this.metacarpalCoef[k];
      p[m]
        .copy(p[WRIST])
        .addScaledVector(this._a, ka * s)
        .addScaledVector(this._b, kb * s)
        .addScaledVector(this._c, kc * s);
    });
    for (let j = 0; j < 25; j++) {
      const bone = this.bones[j];
      bone.position.copy(p[j]);
      bone.quaternion.copy(jointFrame(p, j, lateral, normal, this._q).multiply(this.offsets[j]));
    }
  }
}

/* ---------- Ball-and-stick skeleton (fallback look and joint overlay) ---------- */

const UP = new THREE.Vector3(0, 1, 0);
const JOINT_RADIUS = [
  0.012, 0.0105, 0.0095, 0.0088, 0.0078,
  0.0105, 0.0095, 0.0085, 0.0075,
  0.0105, 0.0095, 0.0085, 0.0075,
  0.0102, 0.0092, 0.0082, 0.0072,
  0.0098, 0.0086, 0.0076, 0.0068,
];

export class SkeletonModel {
  constructor(material, scale = 1) {
    this.scale = scale;
    this.root = new THREE.Group();
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), material, 21);
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), material, HAND_BONES.length);
    const overlay = !material.depthTest;
    for (const mesh of [this.joints, this.bones]) {
      mesh.frustumCulled = false;
      mesh.castShadow = !overlay;
      if (overlay) mesh.renderOrder = 10;
      this.root.add(mesh);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._mid = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  update(joints) {
    const { _m: m, _q: q, _s: s } = this;
    q.identity();
    for (let i = 0; i < 21; i++) {
      s.setScalar(JOINT_RADIUS[i] * this.scale);
      this.joints.setMatrixAt(i, m.compose(joints[i], q, s));
    }
    HAND_BONES.forEach(([a, b], i) => {
      this._mid.addVectors(joints[a], joints[b]).multiplyScalar(0.5);
      this._dir.subVectors(joints[b], joints[a]);
      const len = this._dir.length();
      q.setFromUnitVectors(UP, this._dir.divideScalar(len || 1));
      const r = Math.min(JOINT_RADIUS[a], JOINT_RADIUS[b]) * 0.62 * this.scale;
      s.set(r, len, r);
      this.bones.setMatrixAt(i, m.compose(this._mid, q, s));
    });
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- One on-screen hand: picks the left or right mesh and the look ---------- */

export class HandAvatar {
  constructor(assets, materials) {
    this.materials = materials;
    this.group = new THREE.Group();
    this.models = {};
    for (const side of ['left', 'right']) {
      if (!assets[side]) continue;
      try {
        this.models[side] = new HandModel(assets[side], side, materials.wire);
        this.group.add(this.models[side].root);
      } catch (err) {
        console.warn(err);
      }
    }
    this.skeleton = new SkeletonModel(materials.bone, 0.8);
    this.overlay = new SkeletonModel(materials.points, 0.3);
    this.group.add(this.skeleton.root, this.overlay.root);
    this.look = 'skin';
    this.setLook('skin');
  }

  get hasMesh() {
    return Boolean(this.models.left && this.models.right);
  }

  setLook(look) {
    this.look = this.hasMesh ? look : 'skeleton';
    for (const model of Object.values(this.models)) {
      if (this.look === 'holo') model.setMaterial(this.materials.holo, true);
      else model.setMaterial(this.materials.skin, false);
    }
  }

  update(joints, side, showJoints) {
    const useMesh = this.look !== 'skeleton';
    for (const [s, model] of Object.entries(this.models)) {
      model.root.visible = useMesh && s === side;
      if (model.root.visible) model.update(joints);
    }
    this.skeleton.root.visible = !useMesh;
    if (!useMesh) this.skeleton.update(joints);
    this.overlay.root.visible = showJoints;
    if (showJoints) this.overlay.update(joints);
  }
}
