import * as THREE from 'three';
import { FLOOR_Y } from './arena.js';

const GRAVITY = 9.8;
const TAU = Math.PI * 2;

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const r = rng(seed);
  const bumps = Array.from({ length: 7 }, () => [new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), 0.18 + r() * 0.32]);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let k = 0.78;
    for (const [dir, amt] of bumps) k += Math.max(0, v.dot(dir)) ** 3 * amt;
    k += (Math.sin(v.x * 9 + seed) * Math.sin(v.y * 7) * Math.sin(v.z * 8)) * 0.05;
    p.setXYZ(i, v.x * k, v.y * k * 0.72, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

const wood = () =>
  canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#6b4526';
    g.fillRect(0, 0, w, h);
    const r = rng(17);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `hsl(28, 45%, ${26 + r() * 10}%)`;
      g.fillRect(0, i * 64 + 2, w, 60);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(30,15,5,${0.15 + r() * 0.2})`;
        g.beginPath();
        const y = i * 64 + 6 + r() * 52;
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 8, w * 0.7, y + (r() - 0.5) * 8, w, y);
        g.stroke();
      }
    }
    g.strokeStyle = '#2a1708';
    g.lineWidth = 14;
    g.strokeRect(7, 7, w - 14, h - 14);
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(14, 14);
    g.lineTo(w - 14, h - 14);
    g.stroke();
  });

const staves = () =>
  canvasTexture(512, 256, (g, w, h) => {
    const r = rng(23);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `hsl(26, 42%, ${24 + r() * 10}%)`;
      g.fillRect(i * 32, 0, 31, h);
    }
    g.fillStyle = '#262422';
    for (const y of [24, 112, 200]) g.fillRect(0, y, w, 18);
  });

/**
 * Everything you can lift with telekinesis. Bodies are spheres for collision
 * (cheap and stable) and tumble as they fly.
 */
export class PropSystem {
  constructor(scene, fx, sfx) {
    this.scene = scene;
    this.fx = fx;
    this.sfx = sfx;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.props = [];

    const stoneMat = new THREE.MeshStandardMaterial({ color: '#77757f', roughness: 0.92, flatShading: true });
    const crateMat = new THREE.MeshStandardMaterial({ map: wood(), roughness: 0.8 });
    const barrelMat = new THREE.MeshStandardMaterial({ map: staves(), roughness: 0.75 });
    const crystalMat = new THREE.MeshStandardMaterial({ color: '#8cf2ff', emissive: '#1fa8d8', emissiveIntensity: 1.2, roughness: 0.12, metalness: 0.1 });
    const sigilMat = new THREE.MeshStandardMaterial({ color: '#2b2140', emissive: '#a35bff', emissiveIntensity: 0.9, roughness: 0.4 });
    const barrelGeo = new THREE.LatheGeometry(
      [[0.0, -0.31], [0.21, -0.31], [0.25, -0.15], [0.265, 0], [0.25, 0.15], [0.21, 0.31], [0.0, 0.31]].map(([x, y]) => new THREE.Vector2(x, y)),
      20,
    );
    barrelGeo.userData.shared = true;
    this.kinds = {
      rock: { r: 0.25, make: (s) => new THREE.Mesh(rockGeometry(s), stoneMat), scale: () => 0.17 + Math.random() * 0.07 },
      crate: { r: 0.3, make: () => new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), crateMat), scale: () => 1 },
      barrel: { r: 0.3, make: () => new THREE.Mesh(barrelGeo, barrelMat), scale: () => 1 },
      crystal: { r: 0.2, make: () => new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), crystalMat), scale: () => 1, stretch: 1.7 },
      sigil: { r: 0.32, make: () => new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), sigilMat), scale: () => 1 },
    };
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
  }

  spawn(kind, position, { materialize = true } = {}) {
    const spec = this.kinds[kind];
    const mesh = spec.make(Math.floor(Math.random() * 1000));
    const s = spec.scale();
    mesh.scale.setScalar(s);
    if (spec.stretch) mesh.scale.y *= spec.stretch;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(position);
    mesh.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
    this.group.add(mesh);
    const prop = {
      kind,
      mesh,
      pos: mesh.position,
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      r: kind === 'rock' ? s * 1.1 : spec.r,
      heldBy: null,
      flying: 0, // seconds of straight, gravity-free flight after a launch
      thrownBy: null,
      grow: materialize ? 0 : 1,
      alive: true,
      hover: kind === 'sigil',
    };
    this.props.push(prop);
    if (materialize) this.fx.burst(position, kind === 'sigil' ? '#c27dff' : '#7fe8ff', 30, 1.2);
    return prop;
  }

  remove(prop) {
    prop.alive = false;
    this.group.remove(prop.mesh);
    if (!prop.mesh.geometry.userData.shared) prop.mesh.geometry.dispose();
    this.props.splice(this.props.indexOf(prop), 1);
  }

  /** Keep something to throw within reach: at least `count` props near the rune circle. */
  ensureSupply(count) {
    const near = this.props.filter((p) => p.kind !== 'sigil' && p.pos.z > -9.5 && p.pos.z < -2 && Math.abs(p.pos.x) < 5).length;
    if (near >= count) return;
    const kinds = ['rock', 'rock', 'crate', 'barrel', 'crystal'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const a = Math.random() * TAU;
    const rad = 0.6 + Math.random() * 2;
    this.spawn(kind, new THREE.Vector3(Math.cos(a) * rad, FLOOR_Y + 0.4, -5.4 + Math.sin(a) * rad * 0.7));
  }

  /** Nearest prop to a ray from the camera, with aim assist that grows with distance. */
  pick(dir, exclude) {
    let best = null;
    let bestScore = Infinity;
    for (const p of this.props) {
      if (p.heldBy || p === exclude) continue;
      const dist = p.pos.length();
      const angle = this._v.copy(p.pos).normalize().angleTo(dir);
      const allowed = Math.atan((p.r + 0.35) / dist) + 0.05;
      if (angle < allowed && angle - allowed < bestScore) {
        bestScore = angle - allowed;
        best = p;
      }
    }
    return best;
  }

  update(dt, enemies, onHit) {
    for (const p of [...this.props]) {
      if (p.grow < 1) {
        p.grow = Math.min(1, p.grow + dt * 3);
        const s = THREE.MathUtils.smoothstep(p.grow, 0, 1);
        p.mesh.scale.setScalar((p.baseScale ??= p.mesh.scale.x) * s);
        if (p.kind === 'crystal') p.mesh.scale.y *= 1.7;
      }
      if (!p.heldBy) {
        if (p.hover) {
          // the sigil floats in place, bobbing
          p.vel.multiplyScalar(Math.pow(0.02, dt));
          p.vel.y += (FLOOR_Y + 1.25 + Math.sin(performance.now() / 600) * 0.06 - p.pos.y) * 4 * dt;
        } else if (p.flying > 0) {
          p.flying -= dt;
        } else {
          p.vel.y -= GRAVITY * dt;
        }
      }
      p.pos.addScaledVector(p.vel, dt);

      // floor and courtyard walls
      if (p.pos.y - p.r < FLOOR_Y) {
        const impact = -p.vel.y;
        p.pos.y = FLOOR_Y + p.r;
        if (p.vel.y < 0) p.vel.y *= -0.32;
        p.vel.x *= Math.pow(0.15, dt);
        p.vel.z *= Math.pow(0.15, dt);
        if (impact > 2.5) this.sfx.impact(impact / 6);
        p.flying = 0;
        p.thrownBy = null;
      }
      if (Math.abs(p.pos.x) > 7.1) {
        p.pos.x = Math.sign(p.pos.x) * 7.1;
        p.vel.x *= -0.4;
      }
      if (p.pos.z < -26.8) {
        p.pos.z = -26.8;
        p.vel.z *= -0.4;
      }
      if (p.pos.z > -0.8) {
        p.pos.z = -0.8;
        p.vel.z = Math.min(0, p.vel.z);
      }

      // tumbling: spin follows how fast it moves
      const speed = p.vel.length();
      if (p.hover || p.heldBy) p.spin.lerp(this._v.set(0.6, 1.2, 0.3), Math.min(1, dt * 3));
      else if (p.pos.y - p.r <= FLOOR_Y + 0.01) p.spin.multiplyScalar(Math.pow(0.05, dt));
      else if (speed > 1) p.spin.lerp(this._axis.set(p.vel.z, 0, -p.vel.x).normalize().multiplyScalar(speed * 2.2), Math.min(1, dt * 4));
      const w = p.spin.length();
      if (w > 1e-3) p.mesh.quaternion.premultiply(this._q.setFromAxisAngle(this._axis.copy(p.spin).divideScalar(w), w * dt));

      // a fast prop smashes into enemies
      if (speed > 3 && enemies) {
        const hit = enemies.sphereHit(p.pos, p.r);
        if (hit) {
          onHit?.(p, hit, speed);
          p.vel.reflect(this._v.subVectors(p.pos, hit.pos).normalize()).multiplyScalar(0.45);
          p.flying = 0;
        }
      }
    }

    // props against each other
    const list = this.props;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const d = this._v.subVectors(b.pos, a.pos);
        const dist = d.length();
        const min = a.r + b.r;
        if (dist >= min || dist === 0) continue;
        d.divideScalar(dist);
        const wa = a.heldBy || a.hover ? 0 : b.heldBy || b.hover ? 1 : 0.5;
        const wb = a.heldBy || a.hover ? 1 : b.heldBy || b.hover ? 0 : 0.5;
        a.pos.addScaledVector(d, -(min - dist) * wa);
        b.pos.addScaledVector(d, (min - dist) * wb);
        const vn = b.vel.dot(d) - a.vel.dot(d);
        if (vn < 0) {
          a.vel.addScaledVector(d, vn * 0.8 * (wa ? 1 : 0));
          b.vel.addScaledVector(d, -vn * 0.8 * (wb ? 1 : 0));
          if (-vn > 3) this.sfx.impact(-vn / 8);
        }
      }
    }
  }
}
