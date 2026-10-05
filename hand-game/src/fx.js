import * as THREE from 'three';

const CAPACITY = 600;

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let glow = null;
export function glowTexture() {
  return (glow ??= dotTexture());
}

/** Spark bursts and floating score labels. */
export class Effects {
  constructor(scene) {
    this.positions = new Float32Array(CAPACITY * 3);
    this.colors = new Float32Array(CAPACITY * 3);
    this.vel = new Float32Array(CAPACITY * 3);
    this.base = new Float32Array(CAPACITY * 3);
    this.life = new Float32Array(CAPACITY);
    this.maxLife = new Float32Array(CAPACITY).fill(1);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.006,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.labels = Array.from({ length: 8 }, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 }),
      );
      sprite.scale.set(0.07, 0.035, 1);
      sprite.renderOrder = 20;
      sprite.visible = false;
      scene.add(sprite);
      return { sprite, canvas, tex, life: 0 };
    });
    this.labelCursor = 0;
    this._c = new THREE.Color();
  }

  burst(position, color, count = 28, speed = 0.4) {
    this._c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % CAPACITY;
      const o = i * 3;
      this.positions[o] = position.x;
      this.positions[o + 1] = position.y;
      this.positions[o + 2] = position.z;
      // random direction on a sphere
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.35 + Math.random() * 0.65);
      this.vel[o] = r * Math.cos(a) * s;
      this.vel[o + 1] = u * s;
      this.vel[o + 2] = r * Math.sin(a) * s;
      const tint = 0.75 + Math.random() * 0.5;
      this.base[o] = this._c.r * tint;
      this.base[o + 1] = this._c.g * tint;
      this.base[o + 2] = this._c.b * tint;
      this.maxLife[i] = this.life[i] = 0.45 + Math.random() * 0.35;
    }
  }

  label(position, text, color) {
    const L = this.labels[this.labelCursor];
    this.labelCursor = (this.labelCursor + 1) % this.labels.length;
    const g = L.canvas.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.font = '800 92px "Big Shoulders Display", "Arial Narrow", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(12,19,23,0.85)';
    g.strokeText(text, 128, 66);
    g.fillStyle = color;
    g.fillText(text, 128, 66);
    L.tex.needsUpdate = true;
    L.sprite.position.copy(position);
    L.sprite.visible = true;
    L.life = 0.9;
  }

  update(dt) {
    const drag = Math.pow(0.04, dt);
    for (let i = 0; i < CAPACITY; i++) {
      const o = i * 3;
      if (this.life[i] <= 0) {
        this.colors[o] = this.colors[o + 1] = this.colors[o + 2] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[o] *= drag;
      this.vel[o + 1] = this.vel[o + 1] * drag - 0.5 * dt;
      this.vel[o + 2] *= drag;
      this.positions[o] += this.vel[o] * dt;
      this.positions[o + 1] += this.vel[o + 1] * dt;
      this.positions[o + 2] += this.vel[o + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const f = k * k;
      this.colors[o] = this.base[o] * f;
      this.colors[o + 1] = this.base[o + 1] * f;
      this.colors[o + 2] = this.base[o + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    for (const L of this.labels) {
      if (!L.sprite.visible) continue;
      L.life -= dt;
      if (L.life <= 0) {
        L.sprite.visible = false;
        continue;
      }
      L.sprite.position.y += dt * 0.05;
      L.sprite.material.opacity = Math.min(1, L.life / 0.35);
    }
  }
}
