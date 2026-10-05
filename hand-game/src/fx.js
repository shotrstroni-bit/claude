import * as THREE from 'three';

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

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 40 + Math.random() * 48;
    const y = 40 + Math.random() * 48;
    const grad = g.createRadialGradient(x, y, 0, x, y, 40);
    grad.addColorStop(0, 'rgba(230,230,235,0.32)');
    grad.addColorStop(1, 'rgba(230,230,235,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let glow = null;
export function glowTexture() {
  return (glow ??= dotTexture());
}

/** Additive point sparks: one pool for things near your hands, one for the arena. */
class Sparks {
  constructor(scene, capacity, size) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.base = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(px, py, pz, vx, vy, vz, color, life, gravity = 0.5, drag = 0.04) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const o = i * 3;
    this.positions[o] = px;
    this.positions[o + 1] = py;
    this.positions[o + 2] = pz;
    this.vel[o] = vx;
    this.vel[o + 1] = vy;
    this.vel[o + 2] = vz;
    const tint = 0.75 + Math.random() * 0.5;
    this.base[o] = color.r * tint;
    this.base[o + 1] = color.g * tint;
    this.base[o + 2] = color.b * tint;
    this.maxLife[i] = this.life[i] = life;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.capacity; i++) {
      const o = i * 3;
      if (this.life[i] <= 0) {
        if (this.colors[o] || this.colors[o + 1] || this.colors[o + 2]) {
          this.colors[o] = this.colors[o + 1] = this.colors[o + 2] = 0;
          any = true;
        }
        continue;
      }
      any = true;
      this.life[i] -= dt;
      const drag = Math.pow(this.drag[i], dt);
      this.vel[o] *= drag;
      this.vel[o + 1] = this.vel[o + 1] * drag - this.gravity[i] * dt;
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
    if (any) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  }
}

/** Sparks, smoke, bullet tracers, shockwave rings, score labels and the muzzle-flash light. */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.near = new Sparks(scene, 700, 0.007);
    this.far = new Sparks(scene, 900, 0.06);
    this._c = new THREE.Color();

    this.labels = Array.from({ length: 8 }, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 }));
      sprite.renderOrder = 20;
      sprite.visible = false;
      scene.add(sprite);
      return { sprite, canvas, tex, life: 0, size: 1 };
    });
    this.labelCursor = 0;

    const smokeTex = smokeTexture();
    this.smoke = Array.from({ length: 14 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      scene.add(s);
      return { s, life: 0, max: 1, vel: new THREE.Vector3(), size: 0.05 };
    });
    this.smokeCursor = 0;

    const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    tracerGeo.translate(0, 0.5, 0);
    this.tracers = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(
        tracerGeo,
        new THREE.MeshBasicMaterial({ color: '#ffe2a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }),
      );
      m.visible = false;
      scene.add(m);
      return { m, life: 0 };
    });
    this.tracerCursor = 0;

    this.rings = Array.from({ length: 8 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      s.visible = false;
      scene.add(s);
      return { s, life: 0, size: 1 };
    });
    this.ringCursor = 0;

    this.light = new THREE.PointLight('#ffc070', 0, 0, 2);
    scene.add(this.light);
    this.lightLife = 0;
    this._v = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  _pool(p) {
    return p.length < 1.6 ? this.near : this.far;
  }

  /** Sparks flying out of a point; speed in m/s (scaled down near the camera). */
  burst(pos, color, count = 28, speed = 1.5, life = 0.6) {
    this._c.set(color);
    const pool = this._pool(pos);
    const s = pool === this.near ? speed * 0.2 : speed;
    for (let n = 0; n < count; n++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = s * (0.35 + Math.random() * 0.65);
      pool.emit(pos.x, pos.y, pos.z, r * Math.cos(a) * v, u * v, r * Math.sin(a) * v, this._c, life * (0.6 + Math.random() * 0.6), pool === this.near ? 0.2 : 1.5);
    }
  }

  /** Magic stream between your hand and what it holds. */
  tether(from, to, color, count = 3) {
    this._c.set(color);
    for (let n = 0; n < count; n++) {
      const t = Math.random();
      const p = this._v.lerpVectors(from, to, t);
      p.y += Math.sin(t * Math.PI) * 0.08 * from.distanceTo(to);
      const pool = this._pool(p);
      const j = pool === this.near ? 0.01 : 0.12;
      pool.emit(p.x, p.y, p.z, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j, this._c, 0.35, 0, 0.2);
    }
  }

  puff(pos, dir, size = 0.05) {
    const p = this.smoke[this.smokeCursor];
    this.smokeCursor = (this.smokeCursor + 1) % this.smoke.length;
    p.s.position.copy(pos);
    p.vel.copy(dir).multiplyScalar(0.25).add(this._v.set((Math.random() - 0.5) * 0.04, 0.06, (Math.random() - 0.5) * 0.04));
    p.max = p.life = 1 + Math.random() * 0.5;
    p.size = size;
    p.s.visible = true;
    p.s.material.rotation = Math.random() * Math.PI * 2;
  }

  tracer(from, to) {
    const t = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    const d = this._v.subVectors(to, from);
    const len = d.length();
    t.m.position.copy(from);
    t.m.quaternion.setFromUnitVectors(this._up, d.divideScalar(len));
    t.m.scale.set(0.004, len, 0.004);
    t.life = 0.07;
    t.m.visible = true;
  }

  ring(pos, color, size = 1) {
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    r.s.position.copy(pos);
    r.s.material.color.set(color);
    r.size = size;
    r.life = 0.35;
    r.s.visible = true;
  }

  flash(pos, color = '#ffc070', intensity = 6, life = 0.06) {
    this.light.position.copy(pos);
    this.light.color.set(color);
    this.light.intensity = intensity;
    this.lightLife = life;
  }

  label(pos, text, color) {
    const L = this.labels[this.labelCursor];
    this.labelCursor = (this.labelCursor + 1) % this.labels.length;
    const g = L.canvas.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.font = '800 92px "Big Shoulders Display", "Arial Narrow", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(8,6,16,0.85)';
    g.strokeText(text, 128, 66);
    g.fillStyle = color;
    g.fillText(text, 128, 66);
    L.tex.needsUpdate = true;
    L.sprite.position.copy(pos);
    L.size = Math.max(0.5, pos.length()) * 0.13;
    L.sprite.scale.set(L.size, L.size / 2, 1);
    L.sprite.visible = true;
    L.life = 0.9;
  }

  update(dt) {
    this.near.update(dt);
    this.far.update(dt);
    for (const L of this.labels) {
      if (!L.sprite.visible) continue;
      L.life -= dt;
      if (L.life <= 0) {
        L.sprite.visible = false;
        continue;
      }
      L.sprite.position.y += dt * L.size * 0.5;
      L.sprite.material.opacity = Math.min(1, L.life / 0.35);
    }
    for (const p of this.smoke) {
      if (!p.s.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      const k = 1 - p.life / p.max;
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.pow(0.4, dt));
      p.s.scale.setScalar(p.size * (1 + k * 5));
      p.s.material.opacity = 0.55 * (1 - k) * Math.min(1, k * 8);
    }
    for (const t of this.tracers) {
      if (!t.m.visible) continue;
      t.life -= dt;
      t.m.visible = t.life > 0;
      t.m.material.opacity = Math.max(0, t.life / 0.07);
    }
    for (const r of this.rings) {
      if (!r.s.visible) continue;
      r.life -= dt;
      r.s.visible = r.life > 0;
      const k = 1 - r.life / 0.35;
      r.s.scale.setScalar(r.size * (0.3 + k * 1.6));
      r.s.material.opacity = (1 - k) * 0.9;
    }
    if (this.lightLife > 0) {
      this.lightLife -= dt;
      if (this.lightLife <= 0) this.light.intensity = 0;
    }
  }
}
