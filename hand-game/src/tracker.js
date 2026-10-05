import * as THREE from 'three';
import { PointFilter } from './oneEuro.js';
import { THUMB_TIP, INDEX_TIP, PALM } from './landmarks.js';

const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
// Lower than MediaPipe's defaults so a hand turned edge-on keeps tracking.
const THRESHOLDS = { minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.35, minTrackingConfidence: 0.35 };
const DETECT_LONG_SIDE = 640; // frames are shrunk to this before tracking; the model works at ~224 px anyway

const LOST_AFTER_MS = 500; // keep a hand (coasting on its last motion) this long after losing it
const LEAD = 0.012; // extra prediction for display latency, seconds
const MAX_PREDICT = 0.12;

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
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
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

function monotonic() {
  let last = 0;
  return () => (last = Math.max(performance.now(), last + 1));
}

/* ---------- Backends: a worker (preferred) or the main thread ---------- */

class WorkerBackend {
  static async create(delegate) {
    const worker = new Worker(new URL('./trackerWorker.js', import.meta.url));
    const backend = new WorkerBackend(worker, delegate);
    try {
      await backend._init();
    } catch (err) {
      worker.terminate();
      throw err;
    }
    return backend;
  }

  constructor(worker, delegate) {
    this.worker = worker;
    this.delegate = delegate;
    this.label = `${delegate} · worker`;
    this.pending = null;
    this.ts = monotonic();
    worker.onmessage = (e) => this._message(e.data);
  }

  _init() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this._failed?.('The hand tracker took too long to load.'), 60000);
      this._ready = () => {
        clearTimeout(timer);
        this._ready = this._failed = null;
        resolve();
      };
      this._failed = (message) => {
        clearTimeout(timer);
        this._ready = this._failed = null;
        reject(new Error(message));
      };
      this.worker.onerror = (e) => this._failed?.(e.message || 'The tracking worker failed to start.');
      this.worker.postMessage({
        type: 'init',
        bundleUrl: `${VISION}/vision_bundle.js`,
        wasmRoot: `${VISION}/wasm`,
        modelUrl: MODEL_URL,
        delegate: this.delegate,
        thresholds: THRESHOLDS,
      });
    });
  }

  _message(m) {
    if (m.type === 'ready') this._ready?.();
    else if (m.type === 'error') {
      if (this._failed) this._failed(m.message);
      else console.warn('Hand tracker:', m.message);
    } else if (m.type === 'result') {
      const resolve = this.pending;
      this.pending = null;
      resolve?.(m.hands);
    }
  }

  async detect(video) {
    const scale = Math.min(1, DETECT_LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const bitmap = await createImageBitmap(video, {
      resizeWidth: Math.round(video.videoWidth * scale),
      resizeHeight: Math.round(video.videoHeight * scale),
      resizeQuality: 'low',
    });
    return new Promise((resolve) => {
      this.pending = resolve;
      this.worker.postMessage({ type: 'frame', bitmap, ts: this.ts() }, [bitmap]);
    });
  }
}

function packResult(result) {
  const handedness = result.handedness ?? result.handednesses ?? [];
  return result.landmarks.map((lm, i) => {
    const image = new Float32Array(63);
    const world = new Float32Array(63);
    const wl = result.worldLandmarks[i];
    for (let j = 0; j < 21; j++) {
      image.set([lm[j].x, lm[j].y, lm[j].z], j * 3);
      world.set([wl[j].x, wl[j].y, wl[j].z], j * 3);
    }
    const cat = handedness[i]?.[0];
    return { image, world, right: cat ? cat.categoryName === 'Right' : true, score: cat?.score ?? 0.5 };
  });
}

class MainThreadBackend {
  static async create() {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
    for (const delegate of ['GPU', 'CPU']) {
      try {
        const landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          ...THRESHOLDS,
        });
        return new MainThreadBackend(landmarker, delegate);
      } catch (err) {
        if (delegate === 'CPU') throw err;
        console.warn('GPU delegate unavailable, falling back to CPU', err);
      }
    }
    return null;
  }

  constructor(landmarker, delegate) {
    this.landmarker = landmarker;
    this.label = delegate;
    this.ts = monotonic();
  }

  async detect(video) {
    return packResult(this.landmarker.detectForVideo(video, this.ts()));
  }
}

/**
 * Loads MediaPipe in a worker, or on the main thread as a last resort.
 * `prefer` is 'auto' (GPU, then CPU), 'gpu' or 'cpu'.
 */
async function createBackend(prefer = 'auto') {
  const order = prefer === 'cpu' ? ['CPU', 'GPU'] : ['GPU', 'CPU'];
  if (typeof Worker !== 'undefined' && typeof createImageBitmap === 'function') {
    for (const delegate of order) {
      try {
        return await WorkerBackend.create(delegate);
      } catch (err) {
        console.warn(`Tracking worker (${delegate}) unavailable:`, err.message);
      }
    }
  }
  return MainThreadBackend.create();
}

export async function createTracker(video, prefer) {
  return new Tracker(video, await createBackend(prefer));
}

/* ---------- Geometry ---------- */

function det3(a, b, c, d, e, f, g, h, i) {
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/**
 * Places MediaPipe's metric hand in camera space. World landmarks are in
 * metres with camera-aligned axes (x right, y down, z away from the lens) and
 * the origin at the hand's centre; image landmarks are normalised pixels.
 * Finds T so every world[i] + T projects onto image[i] through a pinhole
 * camera (42 linear equations, 3 unknowns, least squares).
 */
export function solveTranslation(world, image, K) {
  const n = 21;
  let sa = 0, sb = 0, sq = 0, r0 = 0, r1 = 0, r2 = 0;
  for (let i = 0; i < n; i++) {
    const a = (image[i * 3] * K.width - K.cx) / K.f;
    const b = (image[i * 3 + 1] * K.height - K.cy) / K.f;
    const e0 = a * world[i * 3 + 2] - world[i * 3];
    const e1 = b * world[i * 3 + 2] - world[i * 3 + 1];
    sa += a;
    sb += b;
    sq += a * a + b * b;
    r0 += e0;
    r1 += e1;
    r2 -= a * e0 + b * e1;
  }
  const D = det3(n, 0, -sa, 0, n, -sb, -sa, -sb, sq);
  if (Math.abs(D) < 1e-9) return null;
  const tx = det3(r0, 0, -sa, r1, n, -sb, r2, -sb, sq) / D;
  const ty = det3(n, r0, -sa, 0, r1, -sb, -sa, r2, sq) / D;
  const tz = det3(n, 0, r0, 0, n, r1, -sa, -sb, r2) / D;
  if (!(tz > 0.06 && tz < 4)) return null;
  return [tx, ty, tz];
}

const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

class HandSlot {
  constructor(id) {
    this.id = id;
    this.active = false;
    this.lastSeen = -Infinity;
    this.confidence = 0;
    this.vote = 0;
    this.isRight = true; // anatomical hand, from MediaPipe's handedness
    this.side = 'right'; // chirality as drawn (flips when the view is mirrored)
    this.shapeFilter = new PointFilter(21, { minCutoff: 2.2, beta: 9 });
    this.centerXY = new PointFilter(1, { minCutoff: 2.0, beta: 10 });
    this.centerZ = new PointFilter(1, { minCutoff: 1.1, beta: 5 });
    this.center = new THREE.Vector3(); // camera space
    this.centerVel = new THREE.Vector3(); // camera space, m/s (z < 0 is toward the camera)
    this.measured = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.velocity = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.joints = Array.from({ length: 21 }, () => new THREE.Vector3()); // predicted, world space
    this.palm = new THREE.Vector3();
    this.image = new Float32Array(63);
    this.handLength = 0;
    this.depth = 0.45;
    // gestures
    this.ext = [1, 1, 1, 1];
    this.thumb = 1;
    this.pinchRatio = 1;
    this.pinching = false;
    this.thumbUp = true;
    this.pose = 'open';
    this.grip = false;
    this._candidate = 'open';
    this._candidateCount = 0;
    this._packed = new Float32Array(63);
    this._xy = new Float32Array(3);
    this._z = new Float32Array(3);
    this._prev = new THREE.Vector3();
  }

  resetCenter() {
    this.centerXY.reset();
    this.centerZ.reset();
  }

  ingest(det, at, mirror, K) {
    const fresh = at - this.lastSeen > LOST_AFTER_MS;
    const dt = fresh ? 1 / 30 : THREE.MathUtils.clamp((at - this.lastSeen) / 1000, 1 / 120, 0.1);
    if (fresh) {
      this.shapeFilter.reset();
      this.resetCenter();
      this.isRight = det.right;
      this.vote = det.right ? 1 : -1;
      this.pinching = false;
      this.handLength = 0;
      this.ext = [1, 1, 1, 1];
      this.thumb = 1;
      this.pinchRatio = 1;
    }

    this.vote = this.vote * 0.85 + (det.right ? 1 : -1) * det.score * 0.15;
    if (this.isRight && this.vote < -0.25) this.isRight = false;
    else if (!this.isRight && this.vote > 0.25) this.isRight = true;

    // Each joint goes on the camera ray through its pixel, at the depth the
    // metric 3D model gives it, so the 3D hand lands exactly on the real one.
    const { world, image } = det;
    const packed = this._packed;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < 21; i++) {
      const Z = world[i * 3 + 2] + det.T[2];
      const X = ((image[i * 3] * K.width - K.cx) / K.f) * Z;
      const Y = ((image[i * 3 + 1] * K.height - K.cy) / K.f) * Z;
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
    this._prev.copy(this.center);
    this.center.set(T[0], T[1], T[2]);
    if (fresh) this.centerVel.set(0, 0, 0);
    else this.centerVel.lerp(this._prev.subVectors(this.center, this._prev).divideScalar(dt), 0.4);

    // Camera space (x right, y down, z forward) -> world (x right, y up, z back).
    // The selfie view mirrors x, which also swaps which mesh (left/right) fits.
    const mx = mirror ? -1 : 1;
    for (let i = 0; i < 21; i++) {
      const o = i * 3;
      const m = this.measured[i];
      const v = this.velocity[i];
      const nx = mx * (shape[o] + T[0]);
      const ny = -(shape[o + 1] + T[1]);
      const nz = -(shape[o + 2] + T[2]);
      if (fresh) v.set(0, 0, 0);
      else {
        v.x += ((nx - m.x) / dt - v.x) * 0.45;
        v.y += ((ny - m.y) / dt - v.y) * 0.45;
        v.z += ((nz - m.z) / dt - v.z) * 0.45;
        v.clampLength(0, 4);
      }
      m.set(nx, ny, nz);
    }
    this.side = this.isRight !== mirror ? 'right' : 'left';
    this.depth = T[2];
    this._gestures(world, fresh);
    this.image.set(image);
    this.lastSeen = at;
  }

  _gestures(w, fresh) {
    const d = (a, b) =>
      Math.hypot(w[a * 3] - w[b * 3], w[a * 3 + 1] - w[b * 3 + 1], w[a * 3 + 2] - w[b * 3 + 2]);
    const palm = d(0, 9) || 0.08;
    const length = palm + d(9, 10) + d(10, 11) + d(11, 12);
    this.handLength = this.handLength ? this.handLength + (length - this.handLength) * 0.15 : length;

    // Straightness of each finger: tip-to-knuckle over the bone lengths.
    // Measured on the 3D model, so it holds however the hand is turned.
    FINGERS.forEach(([m, p, dd, t], f) => {
      const e = d(t, m) / (d(p, m) + d(dd, p) + d(t, dd));
      this.ext[f] += (e - this.ext[f]) * 0.6;
    });
    // Thumb and pinch are measured against palm size, so hand size doesn't matter.
    this.thumb += (d(THUMB_TIP, 10) / palm - this.thumb) * 0.6;
    this.pinchRatio += (d(THUMB_TIP, INDEX_TIP) / palm - this.pinchRatio) * 0.6;

    // Thresholds measured on MediaPipe's video mode: straight fingers read
    // about 0.97, curled ones 0.5-0.7; the thumb reads ~0.9 raised, ~0.5 down.
    const [index, middle, ring, pinky] = this.ext;
    const gun = index > 0.82 && middle < 0.72 && (ring < 0.76 || pinky < 0.76);
    const fist = index < 0.72 && middle < 0.72 && (ring < 0.76 || pinky < 0.76);
    const extended = this.ext.filter((e) => e > 0.82).length;
    const candidate = gun ? 'gun' : fist ? 'fist' : extended >= 3 ? 'open' : 'other';
    if (candidate === this._candidate) this._candidateCount++;
    else {
      this._candidate = candidate;
      this._candidateCount = 1;
    }
    if (fresh || this._candidateCount >= 2) this.pose = candidate;

    this.pinching = this.pose !== 'gun' && this.pinchRatio < (this.pinching ? 0.45 : 0.3);
    this.grip = this.pose === 'fist' || this.pinching;
    // The hammer: thumb raised off the middle finger, or dropped onto it.
    this.thumbUp = this.thumb > (this.thumbUp ? 0.62 : 0.78);
  }

  /** Extrapolate to the moment this frame reaches the screen. */
  predict(now) {
    const age = (now - this.lastSeen) / 1000;
    this.active = age * 1000 < LOST_AFTER_MS;
    this.confidence = age < 0.15 ? 1 : Math.max(0, 1 - (age - 0.15) / 0.35);
    if (!this.active) return;
    const lead = Math.min(age + LEAD, MAX_PREDICT);
    this.palm.set(0, 0, 0);
    for (let i = 0; i < 21; i++) this.joints[i].copy(this.measured[i]).addScaledVector(this.velocity[i], lead);
    for (const i of PALM) this.palm.add(this.joints[i]);
    this.palm.multiplyScalar(1 / PALM.length);
  }
}

export class Tracker {
  constructor(video, backend) {
    this.video = video;
    this.backend = backend;
    this.delegate = backend.label;
    this.fovDeg = 64; // across the long side of the frame
    this.mirror = true;
    this.slots = [new HandSlot(0), new HandSlot(1)];
    this.typicalDepth = 0.45;
    this.fps = 0;
    this.results = 0; // increments with every tracking result
    this._frame = 0;
    this._sent = -1;
    this._captureAt = 0;
    this._busy = false;
    this._count = 0;
    this._windowStart = performance.now();
    this._lastVideoTime = -1;
    this._rvfcAt = -Infinity;
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFrame = (now, meta) => {
        this._rvfcAt = performance.now();
        this._lastVideoTime = video.currentTime;
        this._frame++;
        const capture = meta?.captureTime;
        const t = performance.now();
        this._captureAt = capture > t - 400 && capture <= t ? capture : now;
        this._pump();
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    }
  }

  /** Swap the tracking engine (GPU or CPU) without stopping the game. */
  async useEngine(prefer) {
    const next = await createBackend(prefer);
    const old = this.backend;
    this.backend = next;
    this.delegate = next.label;
    old.worker?.terminate();
    old.pending?.([]);
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

  /** Call once per rendered frame: feeds the tracker and predicts every hand to `now`. */
  update(now) {
    // Frame callbacks are the fast path; poll the clock if they stop arriving.
    if (now - this._rvfcAt > 250 && this.video.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = this.video.currentTime;
      this._frame++;
      this._captureAt = now;
    }
    this._pump();
    for (const s of this.slots) s.predict(now);
    if (now - this._windowStart > 1000) {
      this.fps = (this._count * 1000) / (now - this._windowStart);
      this._count = 0;
      this._windowStart = now;
    }
  }

  async _pump() {
    if (this._busy || this._sent === this._frame || this.video.readyState < 2) return;
    this._busy = true;
    this._sent = this._frame;
    const at = this._captureAt || performance.now();
    try {
      const hands = await this.backend.detect(this.video);
      this._ingest(hands, at);
      this._count++;
      this.results++;
    } catch (err) {
      console.warn('Hand tracking frame failed', err);
    } finally {
      this._busy = false;
    }
    if (this._sent !== this._frame) this._pump();
  }

  _ingest(hands, at) {
    const K = this.intrinsics();
    const dets = [];
    for (const h of hands) {
      const T = solveTranslation(h.world, h.image, K);
      if (T) dets.push({ ...h, T });
    }
    if (!dets.length) return;

    // Keep each physical hand in the same slot (and filter state) frame to frame.
    const [s0, s1] = this.slots;
    const cost = (slot, det) => {
      const labelPenalty = slot.isRight === det.right ? 0 : 0.05;
      if (at - slot.lastSeen > LOST_AFTER_MS) return 0.5 + labelPenalty;
      return Math.hypot(slot.center.x - det.T[0], slot.center.y - det.T[1], slot.center.z - det.T[2]) + labelPenalty;
    };
    if (dets.length === 1) {
      (cost(s0, dets[0]) <= cost(s1, dets[0]) ? s0 : s1).ingest(dets[0], at, this.mirror, K);
    } else {
      const straight = cost(s0, dets[0]) + cost(s1, dets[1]);
      const crossed = cost(s0, dets[1]) + cost(s1, dets[0]);
      const [a, b] = straight <= crossed ? [dets[0], dets[1]] : [dets[1], dets[0]];
      s0.ingest(a, at, this.mirror, K);
      s1.ingest(b, at, this.mirror, K);
    }
    let sum = 0;
    let n = 0;
    for (const s of this.slots) {
      if (s.lastSeen === at) {
        sum += s.depth;
        n++;
      }
    }
    if (n) this.typicalDepth += (THREE.MathUtils.clamp(sum / n, 0.2, 1.2) - this.typicalDepth) * 0.03;
  }

  setMirror(on) {
    if (on === this.mirror) return;
    this.mirror = on;
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

  /** With a hand held at a measured distance, solve for the focal length that puts it there. */
  calibrate(distanceM) {
    const hand = this.hands[0];
    if (!hand || !(hand.depth > 0)) return null;
    const K = this.intrinsics();
    const f = (K.f * distanceM) / hand.depth;
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(K.width, K.height) / 2 / f));
    this.setFov(THREE.MathUtils.clamp(fov, 30, 120));
    return this.fovDeg;
  }
}
