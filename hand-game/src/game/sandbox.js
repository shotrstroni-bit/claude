import * as THREE from 'three';
import { HAND_BONES } from '../landmarks.js';
import { JOINT_RADIUS, BONE_RADIUS } from './colliders.js';

const BALLS = [
  { r: 0.026, color: '#ffb04a' },
  { r: 0.022, color: '#7fd6e8' },
  { r: 0.03, color: '#ece6da' },
  { r: 0.02, color: '#ff7a66' },
  { r: 0.024, color: '#9be3b5' },
  { r: 0.028, color: '#b9a7ff' },
  { r: 0.021, color: '#ffd86b' },
];
const GRAVITY = 3.2; // m/s², gentler than Earth so throws stay on screen
const SUBSTEPS = 4;
const HAND_BOUNCE = 0.5;
const WALL_BOUNCE = 0.6;
const FLOOR_BOUNCE = 0.5;
const MAX_THROW = 3.5; // m/s
const GRAB_REACH = 0.035;

const sphereGeo = new THREE.SphereGeometry(1, 36, 22);

class Collider {
  constructor() {
    this.p = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.r = 0.01;
  }
}

/**
 * Sandbox: a tray of balls with simple physics. Every joint and bone of your
 * tracked hands is a solid collider; pinch to pick a ball up, release to throw.
 */
export class SandboxGame {
  constructor({ stage, fx, sfx, ui, getDepth }) {
    this.stage = stage;
    this.fx = fx;
    this.sfx = sfx;
    this.ui = ui;
    this.getDepth = getDepth;
    this.group = new THREE.Group();
    this.group.visible = false;
    stage.scene.add(this.group);

    this.tray = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#1a272d', roughness: 0.85, transparent: true, opacity: 0.82 }),
    );
    this.tray.receiveShadow = true;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.tray.geometry),
      new THREE.LineBasicMaterial({ color: '#7fd6e8', transparent: true, opacity: 0.35 }),
    );
    this.tray.add(edges);
    this.group.add(this.tray);

    this.allBalls = BALLS.map(({ r, color }) => {
      const mesh = new THREE.Mesh(
        sphereGeo,
        new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
      );
      mesh.scale.setScalar(r);
      mesh.castShadow = true;
      this.group.add(mesh);
      return { r, color, mass: r * r * r, mesh, pos: mesh.position, vel: new THREE.Vector3(), heldBy: null };
    });
    this.balls = this.allBalls;

    this.colliders = [0, 1].map(() => Array.from({ length: 21 + HAND_BONES.length }, () => new Collider()));
    this.depth = getDepth();
    this.bounds = { xMin: -0.2, xMax: 0.2, yMin: -0.15, yMax: 0.3, zMin: -0.6, zMax: -0.3 };
    this._d = new THREE.Vector3();
    this._impact = 0;
    this._soundCooldown = 0;
  }

  enter() {
    this.group.visible = true;
    this.depth = this.getDepth();
    this._updateBounds(1);
    const b = this.bounds;
    // A narrow (portrait) view gets fewer balls so they don't pile up.
    const count = THREE.MathUtils.clamp(Math.floor((b.xMax - b.xMin) / 0.065), 3, this.allBalls.length);
    this.balls = this.allBalls.slice(0, count);
    this.allBalls.forEach((ball, i) => (ball.mesh.visible = i < count));
    this.balls.forEach((ball, i) => {
      const t = (i + 0.5) / this.balls.length;
      ball.pos.set(
        THREE.MathUtils.lerp(b.xMin + 0.04, b.xMax - 0.04, t),
        b.yMin + 0.06 + (i % 3) * 0.05,
        THREE.MathUtils.lerp(b.zMin, b.zMax, 0.5) + ((i % 2) - 0.5) * 0.05,
      );
      ball.vel.set(0, 0, 0);
      ball.heldBy = null;
    });
    this.ui.hint('Pinch a ball to pick it up. Open your fingers mid-swing to throw it.', 7000);
  }

  exit() {
    this.group.visible = false;
    for (const ball of this.allBalls) ball.heldBy = null;
    this.ui.hint(null);
  }

  _updateBounds(k) {
    this.depth += (this.getDepth() - this.depth) * k;
    const D = this.depth;
    const front = Math.max(0.2, D - 0.14);
    const back = D + 0.16;
    const near = this.stage.halfExtents(front);
    const mid = this.stage.halfExtents(D);
    const b = this.bounds;
    b.xMin = -near.x * 0.88;
    b.xMax = near.x * 0.88;
    b.yMin = -mid.y * 0.8;
    b.yMax = mid.y * 1.4;
    b.zMin = -back;
    b.zMax = -front;
    this.tray.scale.set(b.xMax - b.xMin, 0.008, back - front);
    this.tray.position.set(0, b.yMin - 0.004, -(front + back) / 2);
  }

  _fillColliders(hand, slotIndex, t) {
    const out = this.colliders[slotIndex];
    for (let i = 0; i < 21; i++) {
      const c = out[i];
      c.p.lerpVectors(hand.prevJoints[i], hand.joints[i], t);
      c.v.copy(hand.velocity[i]);
      c.r = JOINT_RADIUS[i];
    }
    HAND_BONES.forEach(([a, b], k) => {
      const c = out[21 + k];
      c.p.addVectors(out[a].p, out[b].p).multiplyScalar(0.5);
      c.v.addVectors(out[a].v, out[b].v).multiplyScalar(0.5);
      c.r = BONE_RADIUS[k];
    });
    return out;
  }

  _grab(hands) {
    for (const hand of hands) {
      if (!hand.justPinched) continue;
      let pick = null;
      let bestD = Infinity;
      for (const ball of this.balls) {
        if (ball.heldBy) continue;
        const d = ball.pos.distanceTo(hand.pinchPoint) - ball.r;
        if (d < GRAB_REACH && d < bestD) {
          bestD = d;
          pick = ball;
        }
      }
      if (pick) {
        pick.heldBy = hand;
        this.sfx.grab();
      }
    }
    for (const ball of this.balls) {
      const hand = ball.heldBy;
      if (!hand) continue;
      if (!hand.active || !hand.pinching) {
        ball.heldBy = null;
        ball.vel.copy(hand.pinchVelocity).clampLength(0, MAX_THROW);
      }
    }
  }

  _step(h, handSets) {
    const b = this.bounds;
    for (const ball of this.balls) {
      if (ball.heldBy) continue;
      ball.vel.y -= GRAVITY * h;
      ball.pos.addScaledVector(ball.vel, h);
      const r = ball.r;
      if (ball.pos.y - r < b.yMin) {
        ball.pos.y = b.yMin + r;
        if (ball.vel.y < 0) {
          this._impact = Math.max(this._impact, -ball.vel.y);
          ball.vel.y *= -FLOOR_BOUNCE;
          if (Math.abs(ball.vel.y) < 0.05) ball.vel.y = 0;
        }
        ball.vel.x *= 0.992;
        ball.vel.z *= 0.992;
      }
      if (ball.pos.y + r > b.yMax && ball.vel.y > 0) ball.vel.y *= -WALL_BOUNCE;
      if (ball.pos.x - r < b.xMin) {
        ball.pos.x = b.xMin + r;
        if (ball.vel.x < 0) ball.vel.x *= -WALL_BOUNCE;
      } else if (ball.pos.x + r > b.xMax) {
        ball.pos.x = b.xMax - r;
        if (ball.vel.x > 0) ball.vel.x *= -WALL_BOUNCE;
      }
      if (ball.pos.z - r < b.zMin) {
        ball.pos.z = b.zMin + r;
        if (ball.vel.z < 0) ball.vel.z *= -WALL_BOUNCE;
      } else if (ball.pos.z + r > b.zMax) {
        ball.pos.z = b.zMax - r;
        if (ball.vel.z > 0) ball.vel.z *= -WALL_BOUNCE;
      }
    }

    // Ball against ball
    const d = this._d;
    for (let i = 0; i < this.balls.length; i++) {
      const A = this.balls[i];
      for (let j = i + 1; j < this.balls.length; j++) {
        const B = this.balls[j];
        if (A.heldBy && B.heldBy) continue;
        d.subVectors(B.pos, A.pos);
        const dist = d.length();
        const min = A.r + B.r;
        if (dist >= min || dist === 0) continue;
        d.divideScalar(dist);
        const wa = A.heldBy ? 0 : B.heldBy ? 1 : B.mass / (A.mass + B.mass);
        const wb = 1 - wa;
        const overlap = min - dist;
        A.pos.addScaledVector(d, -overlap * wa);
        B.pos.addScaledVector(d, overlap * wb);
        const vn = B.vel.dot(d) - A.vel.dot(d);
        if (vn < 0) {
          const impulse = -1.8 * vn;
          A.vel.addScaledVector(d, -impulse * wa);
          B.vel.addScaledVector(d, impulse * wb);
          this._impact = Math.max(this._impact, -vn);
        }
      }
    }

    // Ball against hands
    for (const { colliders } of handSets) {
      for (const ball of this.balls) {
        if (ball.heldBy) continue;
        for (const c of colliders) {
          d.subVectors(ball.pos, c.p);
          const min = ball.r + c.r;
          const distSq = d.lengthSq();
          if (distSq >= min * min) continue;
          const dist = Math.sqrt(distSq) || 1e-6;
          d.divideScalar(dist);
          ball.pos.copy(c.p).addScaledVector(d, min);
          const vn = ball.vel.dot(d) - c.v.dot(d);
          if (vn < 0) {
            ball.vel.addScaledVector(d, -(1 + HAND_BOUNCE) * vn);
            this._impact = Math.max(this._impact, -vn);
          }
        }
      }
    }
  }

  update(dt, now, hands, fresh) {
    this._updateBounds(Math.min(1, dt * 0.8));
    this._grab(hands);

    for (const ball of this.balls) {
      if (!ball.heldBy) continue;
      ball.pos.lerp(ball.heldBy.pinchPoint, 1 - Math.pow(0.0005, dt));
      ball.vel.copy(ball.heldBy.pinchVelocity);
    }

    const sets = hands.map((hand) => ({ hand, colliders: this.colliders[hand.id] }));
    const h = Math.min(dt, 1 / 30) / SUBSTEPS;
    this._impact = 0;
    for (let s = 0; s < SUBSTEPS; s++) {
      const t = fresh ? (s + 1) / SUBSTEPS : 1;
      for (const set of sets) this._fillColliders(set.hand, set.hand.id, t);
      this._step(h, sets);
    }

    this._soundCooldown -= dt;
    if (this._impact > 0.35 && this._soundCooldown <= 0) {
      this.sfx.thud(this._impact);
      this._soundCooldown = 0.07;
    }

    // Glow on the ball your pinch would pick up.
    for (const ball of this.balls) {
      let glow = ball.heldBy ? 0.35 : 0;
      if (!glow) {
        for (const hand of hands) {
          if (hand.pinching) continue;
          if (ball.pos.distanceTo(hand.pinchPoint) - ball.r < GRAB_REACH) glow = 0.18;
        }
      }
      ball.mesh.material.emissive.set(ball.color).multiplyScalar(glow);
    }
  }
}
