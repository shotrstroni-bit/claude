import * as THREE from 'three';
import { FLOOR_Y, PORTAL_Z, glowTexture } from './arena.js';

const KINDS = {
  hexling: { r: 0.32, hp: 1, speed: 1.05, body: '#1d1033', emissive: '#3a0f66', eye: '#ff4a7a', ring: '#c45bff', glow: 'rgba(170,70,255,0.9)', score: 100 },
  brute: { r: 0.52, hp: 3, speed: 0.72, body: '#2a0f16', emissive: '#5a1408', eye: '#ffae3a', ring: '#ff6a3a', glow: 'rgba(255,90,50,0.9)', score: 300 },
};
const REACH_Z = -2.1; // an enemy this close hits you

/** Hexlings: floating shades that drift out of the portal toward you. */
export class EnemySystem {
  constructor(scene, fx, sfx) {
    this.scene = scene;
    this.fx = fx;
    this.sfx = sfx;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.list = [];
    this.geo = {
      body: new THREE.SphereGeometry(1, 24, 16),
      eye: new THREE.SphereGeometry(1, 10, 8),
      horn: new THREE.ConeGeometry(1, 3, 10),
      ring: new THREE.TorusGeometry(1.35, 0.04, 6, 40),
      tail: new THREE.ConeGeometry(0.7, 2.2, 12),
    };
    this.mats = {};
    for (const [name, k] of Object.entries(KINDS)) {
      this.mats[name] = {
        eye: new THREE.MeshBasicMaterial({ color: k.eye }),
        horn: new THREE.MeshStandardMaterial({ color: '#141018', roughness: 0.5, metalness: 0.3 }),
        ring: new THREE.MeshBasicMaterial({ color: k.ring, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
        tail: new THREE.MeshBasicMaterial({ color: k.ring, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
        glow: new THREE.SpriteMaterial({ map: glowTexture(k.glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }),
      };
    }
    this._v = new THREE.Vector3();
  }

  get alive() {
    return this.list.length;
  }

  spawn(kind, wave) {
    const k = KINDS[kind];
    const m = this.mats[kind];
    const g = new THREE.Group();
    const r = k.r;
    const bodyMat = new THREE.MeshStandardMaterial({ color: k.body, emissive: k.emissive, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.2 });
    const body = new THREE.Mesh(this.geo.body, bodyMat);
    body.scale.setScalar(r);
    body.castShadow = true;
    g.add(body);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(this.geo.eye, m.eye);
      eye.scale.set(r * 0.16, r * 0.1, r * 0.08);
      eye.position.set(side * r * 0.36, r * 0.14, r * 0.9);
      eye.rotation.z = side * 0.35;
      const horn = new THREE.Mesh(this.geo.horn, m.horn);
      horn.scale.setScalar(r * 0.16);
      horn.position.set(side * r * 0.55, r * 0.85, 0);
      horn.rotation.z = -side * 0.55;
      g.add(eye, horn);
    }
    const ring = new THREE.Mesh(this.geo.ring, m.ring);
    ring.scale.setScalar(r);
    ring.rotation.x = Math.PI / 2.4;
    const tail = new THREE.Mesh(this.geo.tail, m.tail);
    tail.scale.setScalar(r);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -r * 1.3;
    const glow = new THREE.Sprite(m.glow);
    glow.scale.setScalar(r * 5);
    g.add(ring, tail, glow);
    const lane = (Math.random() - 0.5) * 7;
    g.position.set(lane * 0.3, FLOOR_Y + 3, PORTAL_Z + 0.4);
    this.group.add(g);
    const e = {
      kind,
      spec: k,
      group: g,
      body,
      ring,
      pos: g.position,
      r,
      hp: k.hp,
      speed: k.speed * (1 + 0.08 * (wave - 1)) * (0.9 + Math.random() * 0.2),
      lane,
      height: FLOOR_Y + 1.0 + Math.random() * 1.1,
      phase: Math.random() * 10,
      t: 0,
      flash: 0,
    };
    this.list.push(e);
    this.fx.burst(g.position, k.ring, 22, 1.6);
    return e;
  }

  _remove(e) {
    this.group.remove(e.group);
    e.body.material.dispose();
    this.list.splice(this.list.indexOf(e), 1);
  }

  clear() {
    for (const e of [...this.list]) this._remove(e);
  }

  update(dt, onReach) {
    for (const e of [...this.list]) {
      e.t += dt;
      const weave = Math.sin(e.t * 1.25 + e.phase) * 0.9;
      e.pos.z += e.speed * dt;
      e.pos.x += (e.lane + weave - e.pos.x) * Math.min(1, dt * 1.4);
      e.pos.y += (e.height + Math.sin(e.t * 2.3 + e.phase) * 0.12 - e.pos.y) * Math.min(1, dt * 1.3);
      e.group.lookAt(0, e.pos.y, 0);
      e.ring.rotation.z += dt * 2.4;
      const squash = 1 + Math.sin(e.t * 6 + e.phase) * 0.04;
      e.body.scale.set(e.r * squash, e.r / squash, e.r * squash);
      if (e.flash > 0) {
        e.flash -= dt;
        e.body.material.emissive.set('#ffffff');
        e.body.material.emissiveIntensity = 2 * Math.max(0, e.flash) / 0.12;
      } else {
        e.body.material.emissive.set(e.spec.emissive);
        e.body.material.emissiveIntensity = 0.8;
      }
      if (e.pos.z > REACH_Z) {
        this.fx.burst(e.pos, e.spec.ring, 40, 2.2);
        this._remove(e);
        onReach?.(e);
      }
    }
  }

  /** First enemy overlapping a sphere. */
  sphereHit(pos, r) {
    for (const e of this.list) if (e.pos.distanceTo(pos) < r + e.r) return e;
    return null;
  }

  /** Nearest enemy along a ray, with a little aim assist (radians). */
  rayHit(origin, dir, assist = 0.02) {
    let best = null;
    let bestT = Infinity;
    for (const e of this.list) {
      const t = this._v.subVectors(e.pos, origin).dot(dir);
      if (t <= 0) continue;
      const perp = this._v.subVectors(e.pos, origin).addScaledVector(dir, -t).length();
      if (perp < e.r * 1.1 + t * assist && t < bestT) {
        bestT = t;
        best = e;
      }
    }
    return best ? { enemy: best, t: bestT, point: origin.clone().addScaledVector(dir, bestT) } : null;
  }

  /** Returns true if the hit killed it. */
  damage(e, amount, dir) {
    if (!this.list.includes(e)) return false;
    e.hp -= amount;
    e.flash = 0.12;
    if (dir) e.pos.addScaledVector(dir, 0.3);
    if (e.hp > 0) {
      this.sfx.enemyHit();
      this.fx.burst(e.pos, e.spec.ring, 10, 1);
      return false;
    }
    this.fx.burst(e.pos, e.spec.ring, 60, 2.6);
    this.fx.burst(e.pos, e.spec.eye, 20, 1.8);
    this.sfx.enemyDie();
    this._remove(e);
    return true;
  }
}
