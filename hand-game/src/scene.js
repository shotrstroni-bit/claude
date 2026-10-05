import * as THREE from 'three';

// The room sits behind wherever you hold your hands (see setRoomDepth).
const WALL_GAP = 0.5;

// A ruled surface at true scale: 1 cm hairlines, 5 cm lines, 10 cm lines. One tile is 50 cm.
function rulerTexture(renderer) {
  const px = 1024;
  const cm = px / 50;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  g.fillStyle = '#141f25';
  g.fillRect(0, 0, px, px);
  for (let i = 0; i < 50; i++) {
    const p = Math.round(i * cm) + 0.5;
    const major = i % 10 === 0;
    const mid = i % 5 === 0;
    g.strokeStyle = major ? 'rgba(236,230,218,0.30)' : mid ? 'rgba(236,230,218,0.14)' : 'rgba(236,230,218,0.06)';
    g.lineWidth = major ? 2 : 1;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, px);
    g.moveTo(0, p);
    g.lineTo(px, p);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor('#0c1317', 1);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    // The virtual camera sits where your webcam is: origin, looking down -z.
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.02, 20);
    this.videoModel = { width: 1280, height: 720, fov: 64 };

    const hemi = new THREE.HemisphereLight('#d4e6ff', '#2b2119', 0.85);
    const key = new THREE.DirectionalLight('#fff0dd', 2.4);
    key.position.set(0.5, 0.85, 0.3);
    key.target.position.set(0, -0.05, -0.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -0.8, right: 0.8, top: 0.8, bottom: -0.8, near: 0.1, far: 3 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.01;
    const fill = new THREE.DirectionalLight('#9cc2ff', 0.55);
    fill.position.set(-0.9, 0.15, 0.4);
    const rim = new THREE.DirectionalLight('#a6ecff', 1.3);
    rim.position.set(0.1, 0.5, -1.6);
    rim.target.position.set(0, 0, -0.45);
    this.scene.add(hemi, key, key.target, fill, rim, rim.target);

    this.room = new THREE.Group();
    const tex = rulerTexture(renderer);
    const wallTex = tex.clone();
    wallTex.repeat.set(8, 4.8);
    wallTex.offset.set(0.5, 0.5);
    wallTex.needsUpdate = true;
    const floorTex = tex.clone();
    floorTex.repeat.set(8, 4);
    floorTex.needsUpdate = true;
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 2.4),
      new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }),
    );
    wall.position.set(0, 1.2, 0);
    wall.receiveShadow = true;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 2),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, color: '#c9d2d4' }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 1);
    floor.receiveShadow = true;
    this.room.add(wall, floor);
    this.scene.add(this.room);
    this.key = key;
    this.rim = rim;
    this.fog = new THREE.Fog('#0c1317', 1.1, 2.6);
    this.scene.fog = this.fog;

    this.backdrop = 'studio';
    this.resize();
    this.setRoomDepth(0.45);
  }

  /** Keep the back wall and floor behind the hands, and the key light aimed at them. */
  setRoomDepth(depth) {
    const wallZ = -(depth + WALL_GAP);
    const floorY = -Math.max(0.3, this.halfExtents(depth).y * 1.1);
    this.room.position.set(0, floorY, wallZ);
    this.key.position.set(0.5, 0.85, 0.3 - depth + 0.45);
    this.key.target.position.set(0, -0.05, -depth);
    this.rim.target.position.set(0, 0, -depth);
    this.fog.near = depth + WALL_GAP + 0.2;
    this.fog.far = depth + WALL_GAP + 1.8;
  }

  setBackdrop(mode) {
    this.backdrop = mode;
    const studio = mode === 'studio';
    this.room.visible = studio;
    this.renderer.setClearColor('#0c1317', studio ? 1 : 0);
  }

  /** Match the 3D camera to the webcam so the 3D hands line up with the real ones. */
  setCameraModel(width, height, fovLongDeg) {
    this.videoModel = { width, height, fov: fovLongDeg };
    const f = Math.max(width, height) / 2 / Math.tan(THREE.MathUtils.degToRad(fovLongDeg) / 2);
    const videoAspect = width / height;
    const viewAspect = this.width / this.height;
    // The video is drawn with object-fit: cover, so a wider screen crops it top and bottom.
    const halfV = height / 2 / f;
    const t = viewAspect > videoAspect ? halfV * (videoAspect / viewAspect) : halfV;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(t));
    this.camera.aspect = viewAspect;
    this.camera.updateProjectionMatrix();
  }

  /** Half-width and half-height of the visible area at a distance in front of the camera. */
  halfExtents(depth) {
    const ty = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    return { x: depth * ty * this.camera.aspect, y: depth * ty };
  }

  /** World point at normalised screen position (-1..1) and a distance from the camera. */
  pointAt(ndcX, ndcY, depth, out = new THREE.Vector3()) {
    const e = this.halfExtents(depth);
    return out.set(ndcX * e.x, ndcY * e.y, -depth);
  }

  resize() {
    this.width = Math.max(1, this.canvas.clientWidth);
    this.height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    const { width, height, fov } = this.videoModel;
    this.setCameraModel(width, height, fov);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
