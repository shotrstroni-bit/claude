import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Renderer, the camera (placed where the webcam is), image-based lighting for
 * metal, and an automatic resolution scaler that keeps the frame rate up.
 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.16; // metals raise this per material
    pmrem.dispose();

    // The virtual camera sits where your webcam is: origin, looking down -z.
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.02, 140);
    this.videoModel = { width: 1280, height: 720, fov: 64 };

    this.quality = 'auto';
    this.maxDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.scale = 1;
    this._frameMs = 16.7;
    this._slowFor = 0;
    this._fastFor = 0;
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    this.scale = q === 'low' ? 0.6 : 1;
    this._applyPixelRatio();
  }

  _applyPixelRatio() {
    const dpr = this.maxDpr * this.scale;
    if (Math.abs(this.renderer.getPixelRatio() - dpr) > 0.01) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(this.width, this.height, false);
    }
  }

  /** Drop resolution when frames run long, raise it again when there's headroom. */
  adapt(dtMs) {
    this._frameMs += (Math.min(dtMs, 100) - this._frameMs) * 0.05;
    if (this.quality !== 'auto') return;
    const dt = dtMs / 1000;
    if (this._frameMs > 21) {
      this._slowFor += dt;
      this._fastFor = 0;
    } else if (this._frameMs < 15.5) {
      this._fastFor += dt;
      this._slowFor = 0;
    } else {
      this._slowFor = this._fastFor = 0;
    }
    if (this._slowFor > 1 && this.scale > 0.5) {
      this.scale = Math.max(0.5, this.scale * 0.85);
      this._slowFor = 0;
      this._applyPixelRatio();
    } else if (this._fastFor > 4 && this.scale < 1) {
      this.scale = Math.min(1, this.scale * 1.1);
      this._fastFor = 0;
      this._applyPixelRatio();
    }
  }

  get fps() {
    return 1000 / this._frameMs;
  }

  /** Match the 3D camera to the webcam so your hands appear where they really are. */
  setCameraModel(width, height, fovLongDeg) {
    this.videoModel = { width, height, fov: fovLongDeg };
    const f = Math.max(width, height) / 2 / Math.tan(THREE.MathUtils.degToRad(fovLongDeg) / 2);
    const videoAspect = width / height;
    const viewAspect = this.width / this.height;
    const halfV = height / 2 / f;
    // Matches object-fit: cover — a wider screen crops the camera top and bottom.
    const t = viewAspect > videoAspect ? halfV * (videoAspect / viewAspect) : halfV;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(t));
    this.camera.aspect = viewAspect;
    this.camera.updateProjectionMatrix();
  }

  halfExtents(depth) {
    const ty = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    return { x: depth * ty * this.camera.aspect, y: depth * ty };
  }

  pointAt(ndcX, ndcY, depth, out = new THREE.Vector3()) {
    const e = this.halfExtents(depth);
    return out.set(ndcX * e.x, ndcY * e.y, -depth);
  }

  resize() {
    this.width = Math.max(1, this.canvas.clientWidth);
    this.height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(this.maxDpr * this.scale);
    this.renderer.setSize(this.width, this.height, false);
    const { width, height, fov } = this.videoModel;
    this.setCameraModel(width, height, fov);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
