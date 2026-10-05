import * as THREE from 'three';
import { FLOOR_Y } from '../world/arena.js';
import { Revolver, GRIP_POINT } from '../revolver/revolver.js';

const HOLD_STIFFNESS = 70;
const HOLD_DAMPING = 13;
const DEPTH_GAIN = 9; // metres a held thing moves per metre your hand moves toward or away from the camera
const PUSH_SPEED = 0.55; // m/s of hand motion toward the camera that counts as a shove
const LAUNCH_SPEED = 24;
const FLICK_UP = 1.1; // m/s upward hand flick reloads the revolver
const GUN_GRACE = 0.35; // keep the gun through brief pose flickers
const LIVES = 3;
const ORIGIN = new THREE.Vector3();

const KILL_COLORS = { gun: '#ffcf7a', magic: '#8be9ff' };

function reticleTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.lineCap = 'round';
  g.shadowBlur = 6;
  if (kind === 'gun') {
    g.strokeStyle = g.shadowColor = '#ffe2a8';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.moveTo(0, 36);
      g.lineTo(0, 56);
      g.stroke();
    }
    g.fillStyle = '#ffe2a8';
    g.beginPath();
    g.arc(0, 0, 4, 0, Math.PI * 2);
    g.fill();
  } else {
    g.strokeStyle = g.shadowColor = kind === 'target' ? '#8be9ff' : '#c9a8ff';
    g.lineWidth = kind === 'target' ? 6 : 4;
    g.setLineDash(kind === 'target' ? [18, 10] : []);
    g.beginPath();
    g.arc(0, 0, kind === 'target' ? 54 : 20, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 64px "IBM Plex Mono", ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#c27dff';
  g.shadowBlur = 18;
  g.fillStyle = '#efe6ff';
  g.fillText(text, 512, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sprite(map, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, opacity }));
  s.renderOrder = 30;
  s.visible = false;
  return s;
}

/**
 * Hexslinger: hexlings pour out of the portal and you defend the tower with
 * two powers. Telekinesis: aim with an open hand, close it (fist or pinch) to
 * lift, move your hand to steer, push toward the screen to hurl. The
 * revolver: make a finger gun to draw it, raise your thumb to cock the
 * hammer, drop it to fire, flick your hand up to reload.
 */
export class HexGame {
  constructor({ stage, props, enemies, fx, sfx, ui }) {
    this.stage = stage;
    this.scene = stage.scene;
    this.props = props;
    this.enemies = enemies;
    this.fx = fx;
    this.sfx = sfx;
    this.ui = ui;
    this.state = 'idle';
    this.score = 0;
    this.lives = LIVES;
    this.wave = 0;
    this.kills = 0;
    this.combo = 0;
    this.lastKill = -Infinity;
    this.time = 0;
    this.casings = [];
    this.tips = new Set();
    try {
      this.best = Number(localStorage.getItem('hexslinger.best')) || 0;
    } catch {
      this.best = 0;
    }
    const tex = { gun: reticleTexture('gun'), aim: reticleTexture('aim'), target: reticleTexture('target') };
    this.hands = [0, 1].map((id) => {
      const h = {
        id,
        mode: 'aim',
        held: null,
        target: null,
        holdDist: 0,
        holdDepth: 0,
        holdTime: 0,
        gun: null,
        gunShown: 0,
        gunLost: 1,
        pendingFire: false,
        autoReload: 0,
        prevGrip: false,
        prevThumbUp: true,
        missing: 0,
        aimDir: new THREE.Vector3(0, 0, -1),
        hit: { point: new THREE.Vector3(), enemy: null, prop: null, t: 40 },
        reticle: sprite(tex.gun),
        aimDot: sprite(tex.aim, 0.9),
        marker: sprite(tex.target, 0.9),
        hideHand: false,
      };
      this.scene.add(h.reticle, h.aimDot, h.marker);
      return h;
    });
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._e = new THREE.Euler();
  }

  /** The camera is live: lay out the courtyard and wait for the player to grab the sigil. */
  start() {
    for (let i = 0; i < 6; i++) this.props.ensureSupply(6);
    this._menu('GRAB TO BEGIN');
  }

  _menu(label) {
    this.state = 'menu';
    if (!this.sigil?.alive) this.sigil = this.props.spawn('sigil', new THREE.Vector3(0, FLOOR_Y + 1.25, -3.6));
    this._sigilLabel(label);
    this.ui.hint('Aim with an open hand, then close it on the glowing stone to begin. Make a finger gun to draw the revolver.');
  }

  _sigilLabel(text) {
    if (!this.sigilText) {
      this.sigilText = sprite(null);
      this.scene.add(this.sigilText);
    }
    const s = this.sigilText;
    s.visible = Boolean(text);
    if (!text) return;
    s.material.map?.dispose();
    s.material.map = textTexture(text);
    s.material.needsUpdate = true;
    s.scale.set(1.6, 0.2, 1);
  }

  _tip(key, text, ms = 6000) {
    if (this.tips.has(key)) return;
    this.tips.add(key);
    this.ui.hint(text, ms);
  }

  _begin() {
    this.score = 0;
    this.lives = LIVES;
    this.wave = 0;
    this.kills = 0;
    this.combo = 0;
    this.ui.showResults(null);
    this.ui.setScore(0, 1);
    this.ui.setLives(this.lives);
    this.ui.hint(null);
    this._nextWave();
  }

  _nextWave() {
    this.wave++;
    this.toSpawn = 3 + this.wave * 2;
    this.spawnTimer = 1.6;
    this.state = 'fighting';
    this.ui.setWave(this.wave);
    this.ui.banner(`Wave ${this.wave}`);
    this.sfx.wave();
  }

  _gameOver() {
    this.state = 'over';
    this.enemies.clear();
    this.sfx.gameOver();
    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      try {
        localStorage.setItem('hexslinger.best', String(this.best));
      } catch {
        /* storage unavailable */
      }
    }
    this.ui.showResults({ score: this.score, wave: this.wave, kills: this.kills, best: this.best, newBest });
    this._menu('GRAB TO PLAY AGAIN');
  }

  _hurt() {
    if (this.state !== 'fighting') return;
    this.lives--;
    this.combo = 0;
    this.ui.setLives(this.lives);
    this.ui.hurt();
    this.sfx.hurt();
    if (this.lives <= 0) this._gameOver();
  }

  _kill(enemy, how, pos) {
    this.kills++;
    this.combo = this.time - this.lastKill < 2.5 ? this.combo + 1 : 1;
    this.lastKill = this.time;
    const mult = Math.min(1 + Math.floor((this.combo - 1) / 2), 5);
    const points = Math.round(enemy.spec.score * (how === 'magic' ? 1.5 : 1) * mult);
    if (this.state === 'fighting') {
      this.score += points;
      this.ui.setScore(this.score, mult);
    }
    this.fx.label(pos, `+${points}`, KILL_COLORS[how]);
  }

  /* ---------- Aiming ---------- */

  /** What a ray from the camera through your hand hits first. */
  _aim(dir, out) {
    out.enemy = null;
    out.prop = null;
    out.t = 40;
    const e = this.enemies.rayHit(ORIGIN, dir, 0.035);
    if (e) {
      out.enemy = e.enemy;
      out.t = e.t;
    }
    for (const p of this.props.props) {
      if (p.heldBy) continue;
      const t = p.pos.dot(dir);
      if (t <= 0 || t >= out.t) continue;
      const perp = this._w.copy(p.pos).addScaledVector(dir, -t).length();
      if (perp < p.r) {
        out.prop = p;
        out.enemy = null;
        out.t = t;
      }
    }
    if (dir.y < -1e-3) {
      const tf = FLOOR_Y / dir.y;
      if (tf < out.t) {
        out.t = tf;
        out.enemy = null;
        out.prop = null;
      }
    }
    out.point.copy(dir).multiplyScalar(out.t);
    return out;
  }

  _placeReticle(s, point, scale) {
    s.visible = true;
    s.position.copy(point);
    s.scale.setScalar(point.length() * scale);
  }

  /* ---------- Revolver ---------- */

  _ensureGun(h) {
    if (h.gun) return h.gun;
    const g = new Revolver();
    g.root.visible = false;
    this.scene.add(g.root);
    const s = this.sfx;
    g.on('cock', () => s.cock())
      .on('trigger', () => s.trigger())
      .on('decock', () => s.decock())
      .on('latch', () => s.latch())
      .on('swing-out', () => s.swingOut())
      .on('load', () => s.load())
      .on('swing-in', () => s.swingIn())
      .on('spin', () => s.spin())
      .on('shot', () => this._shot(h))
      .on('dry', () => {
        s.dry();
        if (g.loaded === 0) h.autoReload = 0.3;
      })
      .on('eject', (cases) => {
        s.eject();
        this.spawnCasings(g, cases);
      });
    h.gun = g;
    return g;
  }

  _shot(h) {
    const g = h.gun;
    this.sfx.gunshot();
    const muzzle = g.muzzle(new THREE.Vector3(), this._v);
    this.fx.flash(muzzle, '#ffc070', 10, 0.06);
    this.fx.puff(muzzle, this._v, 0.035);
    this.fx.puff(muzzle, this._v, 0.05);
    this.fx.burst(muzzle, '#ffcf7a', 16, 6, 0.18);
    const hit = this._aim(h.aimDir, h.hit);
    this.fx.tracer(muzzle, hit.point);
    if (hit.enemy) {
      const e = hit.enemy;
      if (this.enemies.damage(e, 1, h.aimDir)) this._kill(e, 'gun', hit.point);
      this.fx.ring(hit.point, '#ffcf7a', 0.9);
    } else if (hit.prop) {
      hit.prop.vel.addScaledVector(h.aimDir, 7).y += 2;
      hit.prop.flying = 0;
      this.fx.burst(hit.point, '#ffd28a', 18, 3);
      this.sfx.ricochet();
    } else {
      this.fx.burst(hit.point, '#c9c3b8', 20, 2.4, 0.5);
    }
  }

  _gunPose(h, s, dt, snap) {
    const g = h.gun;
    const side = s.side === 'right' ? 1 : -1;
    // Held low and to the outside of your hand, turned in toward the target
    // and canted a little, like a first-person view model, so its side shows.
    const anchor = this._w.copy(s.palm).add(this._v.set(side * 0.075, -0.07, 0.03));
    const forward = this._v.subVectors(h.hit.point, anchor).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    up.crossVectors(right, forward);
    this._m.makeBasis(forward, up, right);
    this._q.setFromRotationMatrix(this._m);
    this._q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * 0.24));
    this._q.multiply(new THREE.Quaternion().setFromEuler(this._e.set(side * 0.12, 0, 0)));
    // Reload: tip the muzzle up so the cases fall clear and the open cylinder faces you.
    if (g.s.tilt > 0) this._q.multiply(new THREE.Quaternion().setFromEuler(this._e.set(0, 0, g.s.tilt * 1.05)));
    const scale = 0.55 + 0.45 * THREE.MathUtils.smoothstep(h.gunShown, 0, 1);
    const k = snap ? 1 : 1 - Math.exp(-dt * 30);
    g.root.quaternion.slerp(this._q, k);
    g.root.scale.setScalar(scale);
    const pos = this._v.copy(GRIP_POINT).multiplyScalar(scale).applyQuaternion(g.root.quaternion);
    g.root.position.lerp(pos.subVectors(anchor, pos), snap ? 1 : 1 - Math.exp(-dt * 35));
  }

  _updateGun(h, s, dt) {
    const g = this._ensureGun(h);
    const first = h.gunShown === 0;
    if (first) {
      this.sfx.summonGun();
      this.fx.burst(s.palm, '#c9a8ff', 30, 4, 0.4);
      this._tip('gun', 'Revolver: raise your thumb to cock the hammer, drop it to fire. Flick your hand up to reload.', 7000);
    }
    h.gunShown = Math.min(1, h.gunShown + dt * 6);
    g.root.visible = true;
    h.hideHand = true;
    this._aim(h.aimDir, h.hit);
    this._gunPose(h, s, dt, first);

    // Your thumb is the hammer.
    if (s.thumbUp && !h.prevThumbUp) g.cock();
    if (!s.thumbUp && h.prevThumbUp) {
      if (g.cocked && !g.busy) g.pullTrigger();
      else if (g.busy) h.pendingFire = true;
    }
    if (h.pendingFire && !g.busy) {
      if (g.cocked) g.pullTrigger();
      h.pendingFire = false;
    }
    if (h.autoReload > 0 && (h.autoReload -= dt) <= 0) g.reload();
    if (-s.centerVel.y > FLICK_UP && !g.busy && g.loaded < 6) g.reload();
    g.update(dt);

    this._placeReticle(h.reticle, h.hit.point, 0.05);
    h.aimDot.visible = false;
    h.marker.visible = false;
  }

  _hideGun(h, dt) {
    h.hideHand = false;
    h.reticle.visible = false;
    if (!h.gun) return;
    h.gun.update(dt);
    if (h.gunShown > 0) {
      h.gunShown = Math.max(0, h.gunShown - dt * 8);
      if (h.gunShown === 0) {
        h.gun.root.visible = false;
        this.fx.burst(h.gun.root.position, '#c9a8ff', 16, 3, 0.3);
      } else h.gun.root.scale.setScalar(0.55 + 0.45 * h.gunShown);
    }
  }

  spawnCasings(g, cases) {
    const geo = g.caseGeometry;
    for (const { matrix, spent } of cases) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(geo.brass, g.materials.brass), new THREE.Mesh(geo.primer, g.materials.primer));
      if (spent) group.add(new THREE.Mesh(geo.dimple, g.materials.dark));
      else group.add(new THREE.Mesh(geo.bullet, g.materials.copper));
      matrix.decompose(group.position, group.quaternion, group.scale);
      const back = this._v.set(-1, 0, 0).applyQuaternion(g.root.quaternion);
      const vel = back.multiplyScalar(0.6 + Math.random() * 0.4).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.2, (Math.random() - 0.5) * 0.4));
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30);
      this.scene.add(group);
      this.casings.push({ group, vel, spin, life: 7, bounces: 0 });
      if (this.casings.length > 30) {
        const old = this.casings.shift();
        this.scene.remove(old.group);
      }
    }
  }

  updateCasings(dt) {
    for (const c of [...this.casings]) {
      c.life -= dt;
      c.vel.y -= 9.8 * dt;
      c.group.position.addScaledVector(c.vel, dt);
      const w = c.spin.length();
      if (w > 0.01) c.group.quaternion.premultiply(this._q.setFromAxisAngle(this._v.copy(c.spin).divideScalar(w), w * dt));
      if (c.group.position.y < FLOOR_Y + 0.006 && c.vel.y < 0) {
        c.group.position.y = FLOOR_Y + 0.006;
        if (-c.vel.y > 0.4 && c.bounces < 4) this.sfx.casing(-c.vel.y / 3);
        c.bounces++;
        c.vel.y *= -0.35;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
        c.spin.multiplyScalar(0.5);
      }
      if (c.life <= 0) {
        this.scene.remove(c.group);
        this.casings.splice(this.casings.indexOf(c), 1);
      }
    }
  }

  /* ---------- Telekinesis ---------- */

  _grab(h, s, p) {
    h.mode = 'hold';
    h.held = p;
    p.heldBy = h;
    p.flying = 0;
    h.holdDist = p.pos.length();
    h.holdDepth = s.depth;
    h.holdTime = 0;
    p.vel.y += 1.5;
    this.sfx.grab();
    this.fx.burst(p.pos, '#8be9ff', 24, 2);
    if (p === this.sigil) {
      this._release(h, false);
      this.props.remove(p);
      this.fx.burst(p.pos, '#c27dff', 80, 4);
      this.fx.ring(p.pos, '#c27dff', 3);
      this.sigil = null;
      this._sigilLabel(null);
      this._begin();
      return;
    }
    this._tip('grab', 'Move your hand to steer it. Push your hand toward the screen to hurl it, or open your hand to let go.');
  }

  _release(h, fling) {
    const p = h.held;
    h.held = null;
    h.mode = 'aim';
    if (!p) return;
    p.heldBy = null;
    if (fling) p.vel.multiplyScalar(1.25).clampLength(0, 18);
    else p.vel.multiplyScalar(0.3);
  }

  _launch(h) {
    const p = h.held;
    this._release(h, false);
    const e = this.enemies.rayHit(ORIGIN, h.aimDir, 0.07);
    const target = e ? e.enemy.pos.clone().add(new THREE.Vector3(0, 0, e.enemy.speed * 0.35)) : h.aimDir.clone().multiplyScalar(30);
    p.vel.subVectors(target, p.pos).normalize().multiplyScalar(LAUNCH_SPEED);
    p.flying = 0.5;
    p.thrownBy = h;
    this.sfx.launch();
    this.fx.burst(p.pos, '#8be9ff', 30, 4);
    this.fx.ring(p.pos, '#8be9ff', 1.4);
  }

  _updateTelekinesis(h, s, dt) {
    h.reticle.visible = false;
    if (h.mode === 'hold' && h.held?.alive) {
      const p = h.held;
      if (!s.grip) {
        this._release(h, true);
      } else {
        h.holdTime += dt;
        const D = THREE.MathUtils.clamp(h.holdDist + (h.holdDepth - s.depth) * DEPTH_GAIN, 1.2, 16);
        const target = this._v.copy(h.aimDir).multiplyScalar(D);
        target.y = Math.max(target.y, FLOOR_Y + p.r + 0.05);
        const acc = this._w.subVectors(target, p.pos).multiplyScalar(HOLD_STIFFNESS).addScaledVector(p.vel, -HOLD_DAMPING);
        p.vel.addScaledVector(acc, dt).clampLength(0, 30);
        this.fx.tether(s.palm, p.pos, '#8be9ff', 3);
        h.marker.visible = true;
        h.marker.position.copy(p.pos);
        h.marker.scale.setScalar(p.r * 3.2);
        h.aimDot.visible = false;
        if (-s.centerVel.z > PUSH_SPEED && h.holdTime > 0.25) this._launch(h);
        return;
      }
    }
    h.mode = 'aim';
    h.held = null;
    h.target = this.props.pick(h.aimDir);
    if (h.target) {
      h.marker.visible = true;
      h.marker.position.copy(h.target.pos);
      h.marker.scale.setScalar(h.target.r * 3.6);
      if (s.grip && !h.prevGrip) this._grab(h, s, h.target);
    } else {
      h.marker.visible = false;
    }
    this._aim(h.aimDir, h.hit);
    this._placeReticle(h.aimDot, h.hit.point, 0.03);
  }

  /* ---------- Frame ---------- */

  update(dt, slots) {
    this.time += dt;
    let holding = 0;
    for (const h of this.hands) {
      const s = slots[h.id];
      if (!s?.active) {
        // Tracking dropped this hand. Hold on to the gun briefly in case it's
        // only turned edge-on; let go of anything lifted.
        h.missing += dt;
        if (h.held) this._release(h, false);
        h.mode = 'aim';
        h.marker.visible = h.aimDot.visible = false;
        if (h.gunShown > 0 && h.missing < 0.6) h.gun.update(dt);
        else {
          h.reticle.visible = false;
          this._hideGun(h, dt);
        }
        h.prevGrip = false;
        continue;
      }
      h.missing = 0;
      h.aimDir.copy(s.palm).normalize();
      h.gunLost = s.pose === 'gun' ? 0 : h.gunLost + dt;
      if (h.gunLost < GUN_GRACE && (s.pose === 'gun' || h.gunShown > 0)) {
        if (h.held) this._release(h, false);
        h.marker.visible = false;
        this._updateGun(h, s, dt);
      } else {
        h.pendingFire = false;
        this._hideGun(h, dt);
        this._updateTelekinesis(h, s, dt);
      }
      if (h.held) holding = 1;
      h.prevGrip = s.grip;
      h.prevThumbUp = s.thumbUp;
    }
    this.sfx.hold(holding);

    // Props: physics and smashing into hexlings
    this.props.update(dt, this.enemies, (p, e, speed) => {
      const dmg = p.kind === 'crystal' ? 3 : 2;
      this.sfx.impact(speed / 8);
      const pos = e.pos.clone();
      if (this.enemies.damage(e, dmg, p.vel.clone().normalize())) this._kill(e, 'magic', pos);
    });
    if (this.state !== 'idle') this.props.ensureSupply(6);

    // Waves
    if (this.state === 'fighting') {
      this.spawnTimer -= dt;
      if (this.toSpawn > 0 && this.spawnTimer <= 0) {
        const bruteChance = this.wave >= 3 ? 0.1 + 0.06 * (this.wave - 3) : 0;
        this.enemies.spawn(Math.random() < bruteChance ? 'brute' : 'hexling', this.wave);
        this.toSpawn--;
        this.spawnTimer = Math.max(0.7, 2.4 - this.wave * 0.15) * (0.7 + Math.random() * 0.6);
      }
      if (this.toSpawn === 0 && this.enemies.alive === 0) {
        this.state = 'between';
        this.breather = 2.5;
        this.ui.banner('Wave cleared');
      }
    } else if (this.state === 'between') {
      this.breather -= dt;
      if (this.breather <= 0) this._nextWave();
    }
    this.enemies.update(dt, () => this._hurt());
    this.updateCasings(dt);
    if (this.sigil?.alive && this.sigilText?.visible) this.sigilText.position.copy(this.sigil.pos).y += 0.62;

    const gunHand = this.hands.find((h) => h.gun && h.gunShown > 0.5);
    this.ui.setAmmo(gunHand ? gunHand.gun.rounds : null);
  }

  hideHand(id) {
    return this.hands[id].hideHand && this.hands[id].gunShown > 0.4;
  }
}
