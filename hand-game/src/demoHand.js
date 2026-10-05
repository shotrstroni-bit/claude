import * as THREE from 'three';

// Rest pose of the right WebXR hand mesh in MediaPipe landmark order (metres).
const REST = [
  [0.0391, 0.0558, 0.0092],
  [0.02, 0.0198, -0.0189], [0.0048, -0.0034, -0.0358], [-0.0046, -0.0273, -0.0578], [-0.0098, -0.0359, -0.0687],
  [0.0318, -0.0328, -0.0144], [0.0286, -0.078, -0.0129], [0.0264, -0.1021, -0.0115], [0.027, -0.1136, -0.0103],
  [0.0366, -0.0359, 0.0074], [0.0321, -0.0823, 0.0118], [0.0293, -0.1096, 0.0148], [0.0304, -0.1216, 0.0165],
  [0.0326, -0.0289, 0.0266], [0.0282, -0.0705, 0.0359], [0.025, -0.0961, 0.0423], [0.0242, -0.1078, 0.0447],
  [0.0254, -0.0181, 0.0442], [0.021, -0.0516, 0.0515], [0.0182, -0.0706, 0.0581], [0.0174, -0.0821, 0.0611],
];

const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
const THUMB = [1, 2, 3, 4];
const FINGER_MAX = [1.45, 1.75, 1.2]; // knuckle, middle and end joint flexion, radians
const THUMB_MAX = [0.45, 0.6, 0.95];

// Curl per digit: thumb, index, middle, ring, pinky (0 = straight, 1 = closed)
const GESTURES = [
  [0, 0, 0, 0, 0],
  [0.85, 1, 1, 1, 1],
  [0.8, 0, 1, 1, 1],
  [0.8, 0, 0, 1, 1],
  [0.62, 0.52, 0.12, 0.08, 0.04],
  [0.3, 0, 1, 1, 0],
];
const HOLD = 1.1;
const BLEND = 0.7;

const X = new THREE.Vector3(1, 0, 0);

/**
 * An animated right hand for the title screen, produced as 21 landmarks so it
 * runs through exactly the same rig as a tracked hand.
 */
export class DemoHand {
  constructor() {
    const p = REST.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const wrist = p[0].clone();
    p.forEach((v) => v.sub(wrist));
    // Turn the rest pose so the fingers point up and the palm faces the viewer.
    const up = p[9].clone().normalize();
    const palm = new THREE.Vector3().crossVectors(p[5], p[17]);
    palm.addScaledVector(up, -palm.dot(up)).normalize();
    const side = new THREE.Vector3().crossVectors(up, palm);
    const from = new THREE.Matrix4().makeBasis(up, palm, side);
    const to = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), X);
    const R = to.multiply(from.transpose());
    this.base = p.map((v) => v.applyMatrix4(R));

    const thumbDir = this.base[4].clone().sub(this.base[1]).normalize();
    const across = new THREE.Vector3(-1, 0.15, 1.1).normalize();
    this.thumbAxis = new THREE.Vector3().crossVectors(thumbDir, across).normalize();

    this.anchor = new THREE.Vector3(0.05, -0.095, -0.42);
    this.out = Array.from({ length: 21 }, () => new THREE.Vector3());
    this._curl = new Array(5).fill(0);
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._t = new THREE.Vector3();
  }

  _bend(chain, axis, maxAngles, curl) {
    const out = this.out;
    for (let k = 0; k < chain.length - 1; k++) {
      const pivot = out[chain[k]];
      this._q.setFromAxisAngle(axis, maxAngles[k] * curl);
      for (let m = k + 1; m < chain.length; m++) {
        out[chain[m]].sub(pivot).applyQuaternion(this._q).add(pivot);
      }
    }
  }

  /** @param {number} t seconds */
  pose(t) {
    const period = HOLD + BLEND;
    const i = Math.floor(t / period) % GESTURES.length;
    const local = (t % period) - HOLD;
    const k = local <= 0 ? 0 : THREE.MathUtils.smoothstep(local / BLEND, 0, 1);
    const from = GESTURES[i];
    const to = GESTURES[(i + 1) % GESTURES.length];
    for (let d = 0; d < 5; d++) this._curl[d] = from[d] + (to[d] - from[d]) * k;

    this.base.forEach((v, j) => this.out[j].copy(v));
    this._bend(THUMB, this.thumbAxis, THUMB_MAX, this._curl[0]);
    FINGERS.forEach((chain, f) => this._bend(chain, X, FINGER_MAX, this._curl[f + 1]));

    this._e.set(Math.sin(t * 0.8) * 0.12 - 0.08, Math.sin(t * 0.55) * 0.35, Math.sin(t * 1.1) * 0.16);
    this._q.setFromEuler(this._e);
    this._t.set(Math.sin(t * 0.5) * 0.025, Math.sin(t * 0.9) * 0.012, Math.sin(t * 0.37) * 0.02).add(this.anchor);
    for (const v of this.out) v.applyQuaternion(this._q).add(this._t);
    return this.out;
  }
}
