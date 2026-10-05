import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { PointFilter } from './oneEuro.js';
import { THUMB_TIP, INDEX_TIP } from './landmarks.js';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const LOST_AFTER_MS = 250;
const PINCH_ON = 0.028; // metres between thumb tip and index tip
const PINCH_OFF = 0.045;

export class CameraError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function openCamera(video) {
  if (!window.isSecureContext) {
    throw new CameraError(
      'insecure',
      'The camera only works on https:// pages or on localhost. Run the local server from the README instead of opening the file directly.',
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'This browser cannot open a camera. Use a current Chrome, Edge, Firefox or Safari.');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60, max: 60 },
      },
    });
  } catch (err) {
    const name = err?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new CameraError('denied', 'Camera access is blocked. Allow it from the camera icon in the address bar, then press Start again.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('missing', 'No camera was found. Plug in a webcam, or open this page on a phone.');
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      throw new CameraError('busy', 'Another app is using the camera. Close it (Zoom, Teams, OBS, Camera) and press Start again.');
    }
    throw new CameraError('failed', `The camera could not start (${name || 'unknown error'}).`);
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
  }
  return stream;
}

export async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return { landmarker: await HandLandmarker.createFromOptions(fileset, options('GPU')), delegate: 'GPU' };
  } catch (err) {
    console.warn('GPU delegate unavailable, falling back to CPU', err);
    return { landmarker: await HandLandmarker.createFromOptions(fileset, options('CPU')), delegate: 'CPU' };
  }
}

function det3(a, b, c, d, e, f, g, h, i) {
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/**
 * Places MediaPipe's metric hand in camera space.
 *
 * World landmarks are in metres with camera-aligned axes (x right, y down,
 * z away from the lens) and their origin at the hand's centre. Image landmarks
 * are normalised pixel positions. We look for the translation T that makes
 * every world[i] + T project onto image[i] through a pinhole camera:
 *
 *   Tx - a*Tz = a*Z - X,   Ty - b*Tz = b*Z - Y,   a = (u-cx)/f, b = (v-cy)/f
 *
 * 42 linear equations, 3 unknowns, solved through the normal equations.
 * Hand size comes from the model, so the camera's focal length sets the depth.
 */
export function solveTranslation(world, image, K) {
  const n = world.length;
  let sa = 0, sb = 0, sq = 0, r0 = 0, r1 = 0, r2 = 0;
  for (let i = 0; i < n; i++) {
    const a = (image[i].x * K.width - K.cx) / K.f;
    const b = (image[i].y * K.height - K.cy) / K.f;
    const w = world[i];
    const e0 = a * w.z - w.x;
    const e1 = b * w.z - w.y;
    sa += a;
    sb += b;
    sq += a * a + b * b;
    r0 += e0;
    r1 += e1;
    r2 -= a * e0 + b * e1;
  }
  // [n 0 -sa; 0 n -sb; -sa -sb sq] * T = r
  const D = det3(n, 0, -sa, 0, n, -sb, -sa, -sb, sq);
  if (Math.abs(D) < 1e-9) return null;
  const tx = det3(r0, 0, -sa, r1, n, -sb, r2, -sb, sq) / D;
  const ty = det3(n, r0, -sa, 0, r1, -sb, -sa, r2, sq) / D;
  const tz = det3(n, 0, r0, 0, n, r1, -sa, -sb, r2) / D;
  if (!(tz > 0.06 && tz < 4)) return null;
  return [tx, ty, tz];
}

class HandSlot {
  constructor(id) {
    this.id = id;
    this.active = false;
    this.lastSeen = -Infinity;
    this.vote = 0;
    this.isRight = true; // anatomical hand, from MediaPipe's handedness
    this.side = 'right'; // chirality of the hand as drawn (flips when mirrored)
    // Joint offsets from the hand centre, and the centre itself. Depth is the
    // noisiest axis, so it gets its own, stronger smoothing.
    this.shapeFilter = new PointFilter(21, { minCutoff: 1.6, beta: 6 });
    this.centerXY = new PointFilter(1, { minCutoff: 1.4, beta: 6 });
    this.centerZ = new PointFilter(1, { minCutoff: 0.7, beta: 3 });
    this.center = new THREE.Vector3(); // camera space
    this.joints = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.prevJoints = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.velocity = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.image = null;
    this.handLength = 0;
    this.depth = 0;
    this.pinching = false;
    this.justPinched = false;
    this.pinchPoint = new THREE.Vector3();
    this.pinchVelocity = new THREE.Vector3();
    this._packed = new Float32Array(63);
    this._xy = new Float32Array(3);
    this._z = new Float32Array(3);
  }

  resetCenter() {
    this.centerXY.reset();
    this.centerZ.reset();
  }

  ingest(det, now, mirror, K) {
    const fresh = now - this.lastSeen > LOST_AFTER_MS;
    const dt = fresh ? 1 / 30 : THREE.MathUtils.clamp((now - this.lastSeen) / 1000, 1 / 240, 0.1);
    if (fresh) {
      this.shapeFilter.reset();
      this.resetCenter();
      this.isRight = det.right;
      this.vote = det.right ? 1 : -1;
      this.pinching = false;
      this.handLength = 0;
    }

    // Handedness votes with hysteresis so one mislabelled frame can't flip the mesh.
    this.vote = this.vote * 0.85 + (det.right ? 1 : -1) * det.score * 0.15;
    if (this.isRight && this.vote < -0.25) this.isRight = false;
    else if (!this.isRight && this.vote > 0.25) this.isRight = true;

    // Put each joint on the camera ray through its 2D landmark, at the depth
    // the metric 3D model gives it. The model's own x/y are a few percent off
    // the image, so this is what makes the 3D hand land exactly on the real one.
    const packed = this._packed;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < 21; i++) {
      const Z = det.world[i].z + det.T[2];
      const X = ((det.image[i].x * K.width - K.cx) / K.f) * Z;
      const Y = ((det.image[i].y * K.height - K.cy) / K.f) * Z;
      packed[i * 3] = X;
      packed[i * 3 + 1] = Y;
      packed[i * 3 + 2] = Z;
      cx += X;
      cy += Y;
      cz += Z;
    }
    cx /= 21;
    cy /= 21;
    cz /= 21;
    for (let i = 0; i < 21; i++) {
      packed[i * 3] -= cx;
      packed[i * 3 + 1] -= cy;
      packed[i * 3 + 2] -= cz;
    }
    const shape = this.shapeFilter.filter(packed, dt);
    this._xy[0] = cx;
    this._xy[1] = cy;
    this._z[2] = cz;
    const cxy = this.centerXY.filter(this._xy, dt);
    const T = [cxy[0], cxy[1], this.centerZ.filter(this._z, dt)[2]];
    this.center.set(T[0], T[1], T[2]);

    // Camera space (x right, y down, z forward) -> three.js (x right, y up, z back).
    // The selfie view mirrors x, which also swaps which mesh (left/right) fits.
    const mx = mirror ? -1 : 1;
    for (let i = 0; i < 21; i++) {
      const o = i * 3;
      const j = this.joints[i];
      this.prevJoints[i].copy(j);
      j.set(mx * (shape[o] + T[0]), -(shape[o + 1] + T[1]), -(shape[o + 2] + T[2]));
      if (fresh) {
        this.prevJoints[i].copy(j);
        this.velocity[i].set(0, 0, 0);
      } else {
        const v = this.velocity[i];
        v.x += ((j.x - this.prevJoints[i].x) / dt - v.x) * 0.5;
        v.y += ((j.y - this.prevJoints[i].y) / dt - v.y) * 0.5;
        v.z += ((j.z - this.prevJoints[i].z) / dt - v.z) * 0.5;
      }
    }
    this.side = this.isRight !== mirror ? 'right' : 'left';

    // Size and pinch come from the metric model directly, so they hold even
    // before the camera's field of view is calibrated.
    const w = det.world;
    const seg = (a, b) => Math.hypot(w[a].x - w[b].x, w[a].y - w[b].y, w[a].z - w[b].z);
    const length = seg(0, 9) + seg(9, 10) + seg(10, 11) + seg(11, 12);
    this.handLength = this.handLength ? this.handLength + (length - this.handLength) * 0.15 : length;
    this.depth = T[2];

    const gap = seg(THUMB_TIP, INDEX_TIP);
    const wasPinching = this.pinching;
    if (!this.pinching && gap < PINCH_ON) this.pinching = true;
    else if (this.pinching && gap > PINCH_OFF) this.pinching = false;
    this.justPinched = this.pinching && !wasPinching;
    this.pinchPoint.copy(this.joints[THUMB_TIP]).add(this.joints[INDEX_TIP]).multiplyScalar(0.5);
    this.pinchVelocity.copy(this.velocity[THUMB_TIP]).add(this.velocity[INDEX_TIP]).multiplyScalar(0.5);

    this.image = det.image;
    this.lastSeen = now;
  }
}

export class Tracker {
  constructor(video, landmarker, delegate) {
    this.video = video;
    this.landmarker = landmarker;
    this.delegate = delegate;
    this.fovDeg = 64; // across the long side of the frame
    this.mirror = true;
    this.slots = [new HandSlot(0), new HandSlot(1)];
    this.typicalDepth = 0.45;
    this.fps = 0;
    this._lastVideoTime = -1;
    this._lastTs = 0;
    this._frames = 0;
    this._fpsWindowStart = performance.now();
  }

  intrinsics() {
    const width = this.video.videoWidth || 1280;
    const height = this.video.videoHeight || 720;
    const f = Math.max(width, height) / 2 / Math.tan(THREE.MathUtils.degToRad(this.fovDeg) / 2);
    return { width, height, f, cx: width / 2, cy: height / 2 };
  }

  get hands() {
    return this.slots.filter((s) => s.active);
  }

  /** Runs detection when the camera has a new frame. Returns true if it did. */
  update(now) {
    for (const s of this.slots) s.justPinched = false;
    const v = this.video;
    let fresh = false;
    if (v.readyState >= 2 && v.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = v.currentTime;
      const ts = Math.max(now, this._lastTs + 1);
      this._lastTs = ts;
      const result = this.landmarker.detectForVideo(v, ts);
      this._ingest(result, now);
      this._frames++;
      fresh = true;
    }
    const elapsed = now - this._fpsWindowStart;
    if (elapsed > 1000) {
      this.fps = (this._frames * 1000) / elapsed;
      this._frames = 0;
      this._fpsWindowStart = now;
    }
    for (const s of this.slots) s.active = now - s.lastSeen < LOST_AFTER_MS;
    if (fresh) {
      const live = this.hands;
      if (live.length) {
        const d = live.reduce((sum, h) => sum + h.depth, 0) / live.length;
        this.typicalDepth += (THREE.MathUtils.clamp(d, 0.2, 1.2) - this.typicalDepth) * 0.03;
      }
    }
    return fresh;
  }

  /**
   * True-scale calibration: with a hand held at a measured distance, solve for
   * the focal length that puts it there. Returns the new field of view.
   */
  calibrate(distanceM) {
    const hand = this.hands[0];
    if (!hand || !(hand.depth > 0)) return null;
    const K = this.intrinsics();
    const f = (K.f * distanceM) / hand.depth;
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(K.width, K.height) / 2 / f));
    this.setFov(THREE.MathUtils.clamp(fov, 30, 120));
    return this.fovDeg;
  }

  setMirror(on) {
    if (on === this.mirror) return;
    this.mirror = on;
    // Joints jump to the other side of the screen; start each hand afresh.
    for (const s of this.slots) s.lastSeen = -Infinity;
  }

  setFov(deg) {
    if (deg === this.fovDeg) return;
    const before = Math.tan(THREE.MathUtils.degToRad(this.fovDeg) / 2);
    const after = Math.tan(THREE.MathUtils.degToRad(deg) / 2);
    this.typicalDepth *= before / after;
    this.fovDeg = deg;
    for (const s of this.slots) s.resetCenter();
  }

  _ingest(result, now) {
    const K = this.intrinsics();
    const handedness = result.handedness ?? result.handednesses ?? [];
    const dets = [];
    for (let i = 0; i < result.landmarks.length; i++) {
      const T = solveTranslation(result.worldLandmarks[i], result.landmarks[i], K);
      if (!T) continue;
      const cat = handedness[i]?.[0];
      dets.push({
        image: result.landmarks[i],
        world: result.worldLandmarks[i],
        T,
        right: cat ? cat.categoryName === 'Right' : true,
        score: cat?.score ?? 0.5,
      });
    }
    if (!dets.length) return;

    // Keep each physical hand in the same slot (and filter state) frame to frame.
    const [s0, s1] = this.slots;
    const cost = (slot, det) => {
      const labelPenalty = slot.isRight === det.right ? 0 : 0.05;
      if (now - slot.lastSeen > LOST_AFTER_MS) return 0.5 + labelPenalty;
      return Math.hypot(slot.center.x - det.T[0], slot.center.y - det.T[1], slot.center.z - det.T[2]) + labelPenalty;
    };
    if (dets.length === 1) {
      (cost(s0, dets[0]) <= cost(s1, dets[0]) ? s0 : s1).ingest(dets[0], now, this.mirror, K);
    } else {
      const straight = cost(s0, dets[0]) + cost(s1, dets[1]);
      const crossed = cost(s0, dets[1]) + cost(s1, dets[0]);
      const [a, b] = straight <= crossed ? [dets[0], dets[1]] : [dets[1], dets[0]];
      s0.ingest(a, now, this.mirror, K);
      s1.ingest(b, now, this.mirror, K);
    }
  }
}
