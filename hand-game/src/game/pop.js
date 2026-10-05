import * as THREE from 'three';
import { glowTexture } from '../fx.js';
import { JOINT_RADIUS } from './colliders.js';

const ROUND_SECONDS = 60;
const ORB_LIFE = 5.5;
const COMBO_WINDOW = 1.6;
// Depth error counts for half: judging depth on a flat screen is hard.
const DEPTH_FORGIVENESS = 0.5;
const ARM_DELAY = 0.7;

const KINDS = {
  orb: { radius: 0.022, color: '#7fd6e8', emissive: '#1b6878', points: 10 },
  gold: { radius: 0.025, color: '#ffb04a', emissive: '#9a5300', points: 40 },
  action: { radius: 0.038, color: '#ece6da', emissive: '#5d5240', points: 0 },
};

const sphereGeo = new THREE.SphereGeometry(1, 40, 24);
const ringGeo = new THREE.RingGeometry(1, 1.08, 72);
const _d = new THREE.Vector3();

function textSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.font = '600 52px "IBM Plex Mono", ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(12,19,23,0.9)';
  g.strokeText(text, 256, 50);
  g.fillStyle = color;
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.renderOrder = 15;
  sprite.scale.set(0.1, 0.01875, 1);
  return sprite;
}

class Orb {
  constructor(kind, position, label) {
    const spec = KINDS[kind];
    this.kind = kind;
    this.spec = spec;
    this.r = spec.radius;
    this.home = position.clone();
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.core = new THREE.Mesh(
      sphereGeo,
      new THREE.MeshPhysicalMaterial({
        color: spec.color,
        emissive: spec.emissive,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
      }),
    );
    this.core.castShadow = true;
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: spec.color,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: '#ece6da', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.group.add(this.core, this.glow, this.ring);
    if (label) {
      this.label = textSprite(label, spec.color);
      this.label.position.y = -(this.r + 0.02);
      this.group.add(this.label);
    }
    this.age = 0;
    this.life = kind === 'action' ? Infinity : ORB_LIFE;
    this.phase = Math.random() * Math.PI * 2;
    this.drift = new THREE.Vector3((Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.008, 0);
  }

  get position() {
    return this.group.position;
  }

  get armed() {
    return this.kind !== 'action' || this.age > ARM_DELAY;
  }

  update(dt, hands) {
    this.age += dt;
    const grow = THREE.MathUtils.smoothstep(this.age / 0.25, 0, 1);
    const fade = Number.isFinite(this.life) ? THREE.MathUtils.clamp((this.life - this.age) / 0.5, 0, 1) : 1;
    const s = grow * fade;
    const bob = Math.sin(this.age * 2.2 + this.phase) * 0.004;
    this.group.position.copy(this.home).addScaledVector(this.drift, this.age);
    this.group.position.y += bob;
    const pulse = this.kind === 'action' ? 1 + Math.sin(this.age * 3) * 0.04 : 1;
    this.core.scale.setScalar(this.r * s * pulse);
    this.glow.scale.setScalar(this.r * 4.4 * s);
    if (this.label) this.label.material.opacity = s;

    // The ring hugs the orb when your nearest hand point is at the orb's depth.
    let best = Infinity;
    let dz = 0;
    for (const hand of hands) {
      for (const p of hand.joints) {
        const d = p.distanceToSquared(this.group.position);
        if (d < best) {
          best = d;
          dz = p.z - this.group.position.z;
        }
      }
    }
    const ring = this.ring.material;
    if (best === Infinity) {
      this.ring.scale.setScalar(this.r * 1.35 * s);
      ring.opacity = 0.18 * s;
      ring.color.set('#ece6da');
    } else {
      const off = Math.min(Math.abs(dz) / 0.06, 1);
      this.ring.scale.setScalar(this.r * (1.25 + off * 0.9) * s);
      const aligned = Math.abs(dz) < 0.02 && Math.sqrt(best) < 0.12;
      ring.color.set(aligned ? '#ffb04a' : '#ece6da');
      ring.opacity = (aligned ? 0.95 : 0.45) * s * (this.armed ? 1 : 0.4);
    }
    this.ring.lookAt(0, 0, 0);
  }

  touchedBy(hands) {
    if (!this.armed) return null;
    const c = this.group.position;
    for (const hand of hands) {
      if (this.kind === 'gold') {
        if (!hand.pinching) continue;
        _d.subVectors(hand.pinchPoint, c);
        _d.z *= DEPTH_FORGIVENESS;
        if (_d.length() < this.r + 0.022) return hand;
        continue;
      }
      for (let i = 0; i < 21; i++) {
        _d.subVectors(hand.joints[i], c);
        _d.z *= DEPTH_FORGIVENESS;
        const reach = this.r + JOINT_RADIUS[i] + 0.006;
        if (_d.lengthSq() < reach * reach) return hand;
      }
    }
    return null;
  }

  dispose() {
    this.core.material.dispose();
    this.glow.material.dispose();
    this.ring.material.dispose();
    if (this.label) {
      this.label.material.map.dispose();
      this.label.material.dispose();
    }
  }
}

/**
 * Orb Pop: 60 seconds to touch as many orbs as you can. Gold orbs need a pinch.
 * Quick pops in a row build a multiplier; letting an orb fade out breaks it.
 */
export class PopGame {
  constructor({ stage, fx, sfx, ui, getDepth }) {
    this.stage = stage;
    this.fx = fx;
    this.sfx = sfx;
    this.ui = ui;
    this.getDepth = getDepth;
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.orbs = [];
    this.state = 'idle';
    try {
      this.best = Number(localStorage.getItem('handspace.best')) || 0;
    } catch {
      this.best = 0;
    }
  }

  enter() {
    this._clear();
    this.state = 'ready';
    this.ui.setScore(null);
    this.ui.setTimer(null);
    this.ui.showResults(null);
    this.ui.hint('Reach out and touch the orb with any finger to start.');
    this._spawnAction('TOUCH TO START', 0, -0.05);
  }

  exit() {
    this._clear();
    this.state = 'idle';
    this.ui.setScore(null);
    this.ui.setTimer(null);
    this.ui.showResults(null);
    this.ui.center(null);
    this.ui.hint(null);
  }

  restart() {
    this._clear();
    this.ui.showResults(null);
    this._startCountdown();
  }

  _clear() {
    for (const orb of this.orbs) {
      this.group.remove(orb.group);
      orb.dispose();
    }
    this.orbs = [];
  }

  _remove(orb) {
    this.group.remove(orb.group);
    orb.dispose();
    this.orbs.splice(this.orbs.indexOf(orb), 1);
  }

  _spawnAction(label, ndcX, ndcY) {
    const p = this.stage.pointAt(ndcX, ndcY, this.getDepth());
    const orb = new Orb('action', p, label);
    orb.ndc = [ndcX, ndcY];
    this.orbs.push(orb);
    this.group.add(orb.group);
  }

  _startCountdown() {
    this.ui.hint(null);
    this.state = 'countdown';
    this.countdown = 3;
    this._lastCount = 4;
    this.score = 0;
    this.pops = 0;
    this.golds = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lastPopAt = -Infinity;
    this.elapsed = 0;
    this.spawnCooldown = 0;
    this.ui.setScore(0, 1);
    this.ui.setTimer(ROUND_SECONDS);
  }

  _multiplier() {
    return Math.min(1 + Math.floor(Math.max(this.combo - 1, 0) / 3), 5);
  }

  _spawn(hands) {
    const depth = this.getDepth();
    for (let tries = 0; tries < 14; tries++) {
      const p = this.stage.pointAt(
        THREE.MathUtils.randFloat(-0.72, 0.72),
        THREE.MathUtils.randFloat(-0.62, 0.45),
        depth + THREE.MathUtils.randFloat(-0.06, 0.06),
      );
      if (this.orbs.some((o) => o.position.distanceTo(p) < 0.08)) continue;
      if (hands.some((h) => h.joints.some((j) => j.distanceTo(p) < 0.07))) continue;
      const gold = this.elapsed > 5 && Math.random() < 0.18;
      const orb = new Orb(gold ? 'gold' : 'orb', p, gold ? 'PINCH' : null);
      this.orbs.push(orb);
      this.group.add(orb.group);
      return;
    }
  }

  _finish() {
    for (const orb of [...this.orbs]) {
      this.fx.burst(orb.position, orb.spec.color, 10, 0.2);
      this._remove(orb);
    }
    this.state = 'results';
    this.sfx.end();
    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      try {
        localStorage.setItem('handspace.best', String(this.best));
      } catch {
        /* storage unavailable */
      }
    }
    this.ui.setTimer(null);
    this.ui.showResults({
      score: this.score,
      pops: this.pops,
      golds: this.golds,
      bestCombo: this.bestCombo,
      best: this.best,
      newBest,
    });
    this._spawnAction('TOUCH TO PLAY AGAIN', 0, -0.3);
  }

  update(dt, now, hands) {
    for (const orb of this.orbs) {
      // Action orbs follow the depth you usually hold your hands at.
      if (orb.ndc) this.stage.pointAt(orb.ndc[0], orb.ndc[1], this.getDepth(), orb.home);
      orb.update(dt, hands);
    }

    if (this.state === 'ready' || this.state === 'results') {
      const action = this.orbs.find((o) => o.kind === 'action');
      if (action && action.touchedBy(hands)) {
        this.fx.burst(action.position, '#ece6da', 40, 0.5);
        this.sfx.pop(1);
        this._remove(action);
        this.ui.showResults(null);
        this._startCountdown();
      }
      return;
    }

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this._lastCount && n > 0) {
        this._lastCount = n;
        this.ui.center(String(n));
        this.sfx.tick();
      }
      if (this.countdown <= 0) {
        this.state = 'playing';
        this.ui.center('GO', 500);
        this.sfx.go();
      }
      return;
    }

    if (this.state !== 'playing') return;

    this.elapsed += dt;
    const left = ROUND_SECONDS - this.elapsed;
    this.ui.setTimer(Math.max(0, left));
    if (left <= 0) {
      this._finish();
      return;
    }

    const target = Math.min(2 + Math.floor(this.elapsed / 12), 5);
    this.spawnCooldown -= dt;
    if (this.orbs.length < target && this.spawnCooldown <= 0) {
      this._spawn(hands);
      this.spawnCooldown = 0.35;
    }

    for (const orb of [...this.orbs]) {
      if (orb.touchedBy(hands)) {
        const t = now / 1000;
        this.combo = t - this.lastPopAt < COMBO_WINDOW ? this.combo + 1 : 1;
        this.lastPopAt = t;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const mult = this._multiplier();
        const points = orb.spec.points * mult;
        this.score += points;
        this.pops++;
        if (orb.kind === 'gold') {
          this.golds++;
          this.sfx.gold();
        } else {
          this.sfx.pop(this.combo);
        }
        this.fx.burst(orb.position, orb.spec.color, orb.kind === 'gold' ? 46 : 28, orb.kind === 'gold' ? 0.55 : 0.4);
        this.fx.label(orb.position, `+${points}`, orb.spec.color);
        this._remove(orb);
        this.ui.setScore(this.score, mult);
      } else if (orb.age >= orb.life) {
        this._remove(orb);
        if (this.combo > 0) {
          this.combo = 0;
          this.ui.setScore(this.score, 1);
        }
      }
    }
  }
}
