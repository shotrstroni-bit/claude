import * as THREE from 'three';
import { buildRevolver, createGunMaterials, DIM } from './model.js';

const STEP = Math.PI / 3; // one chamber
const HAMMER_COCKED = THREE.MathUtils.degToRad(42);
const TRIGGER_PULLED = THREE.MathUtils.degToRad(-15);
const SWING_OPEN = THREE.MathUtils.degToRad(-84);
const EJECT_TRAVEL = 17; // mm the ejector star lifts the cases
const LATCH_TRAVEL = 3;
const LOAD_TRAVEL = 46; // fresh rounds slide in from this far behind

const ease = {
  out: (k) => 1 - (1 - k) ** 3,
  inOut: (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  lin: (k) => k,
};

/** Where the web of the hand sits on the grip, in metres in the gun's frame. */
export const GRIP_POINT = new THREE.Vector3(-0.066, -0.052, 0);

let materials = null;

/**
 * A working Colt Python. Single action: cock() then pullTrigger().
 * Double action: pullTrigger() alone cocks, turns the cylinder and fires.
 * reload() runs the full sequence: latch, swing out, eject, load, close.
 * Listen with on(): cock, cocked, trigger, shot, dry, decock, latch,
 * swing-out, eject, load, swing-in, spin.
 */
export class Revolver {
  constructor() {
    materials ??= createGunMaterials();
    const built = buildRevolver(materials);
    this.model = built.root;
    this.p = built.parts;
    this.caseGeometry = built.geometries;
    this.materials = materials;

    // Muzzle rise pivots about the shooter's grip.
    this.recoilPivot = new THREE.Group();
    this.recoilPivot.position.copy(GRIP_POINT);
    this.model.position.copy(GRIP_POINT).negate();
    this.recoilPivot.add(this.model);
    this.root = new THREE.Group();
    this.root.add(this.recoilPivot);

    this.rounds = new Array(6).fill('live');
    this.index = 0; // completed 60° turns of the cylinder
    this.s = { hammer: 0, trigger: 0, spin: 0, swing: 0, eject: 0, latch: 0, tilt: 0, load: 1 };
    this.cocked = false;
    this.busy = false;
    this.freeSpin = 0;
    this.freeSpinVel = 0;
    this.recoil = 0;
    this.recoilVel = 0;
    this.flashTime = 0;
    this.queue = [];
    this.handlers = {};
    this._v = new THREE.Vector3();
    this._applyRounds();
    this._pose();
  }

  on(event, fn) {
    this.handlers[event] = fn;
    return this;
  }

  emit(event, data) {
    this.handlers[event]?.(data, this);
  }

  get open() {
    return this.s.swing > 0.01;
  }

  get loaded() {
    return this.rounds.filter((r) => r === 'live').length;
  }

  /** The chamber lined up with the barrel. Colt cylinders turn clockwise seen from behind. */
  get topChamber() {
    return (6 - (this.index % 6)) % 6;
  }

  _step(dur, run, { start, end, curve = ease.inOut } = {}) {
    this.queue.push({ dur, run, start, end, curve, t: 0, started: false });
  }

  _tween(dur, to, opts = {}) {
    let from = null;
    this._step(
      dur,
      (k) => {
        for (const key in to) this.s[key] = from[key] + (to[key] - from[key]) * k;
      },
      {
        ...opts,
        start: () => {
          from = { ...this.s };
          opts.start?.();
        },
      },
    );
  }

  _then(fn) {
    this._step(0, () => {}, { end: fn });
  }

  cock() {
    if (this.busy || this.cocked || this.open) return false;
    this.busy = true;
    this._tween(0.15, { hammer: 1, trigger: 0.28, spin: (this.index + 1) * STEP }, {
      curve: ease.out,
      start: () => this.emit('cock'),
      end: () => {
        this.index++;
        this.cocked = true;
        this.emit('cocked');
      },
    });
    this._then(() => (this.busy = false));
    return true;
  }

  pullTrigger() {
    if (this.busy || this.open) return false;
    this.busy = true;
    if (!this.cocked) {
      // Double action: the trigger lifts the hammer and turns the cylinder itself.
      this._tween(0.16, { trigger: 0.9, hammer: 0.96, spin: (this.index + 1) * STEP }, {
        start: () => this.emit('trigger'),
        end: () => this.index++,
      });
    }
    this._tween(0.03, { hammer: 0, trigger: 1 }, { curve: ease.lin, end: () => this._strike() });
    this._tween(0.16, { trigger: 0 }, { curve: ease.out });
    this._then(() => (this.busy = false));
    return true;
  }

  _strike() {
    this.cocked = false;
    const k = this.topChamber;
    if (this.rounds[k] === 'live') {
      this.rounds[k] = 'spent';
      this._applyRounds();
      this.recoilVel += 24;
      this.flashTime = 0.055;
      this.emit('shot', k);
    } else {
      this.emit('dry', k);
    }
  }

  _settleSpin() {
    // A free-spun cylinder stops on whichever chamber is nearest the barrel.
    const steps = Math.round(this.freeSpin / STEP);
    this.index += steps;
    this.freeSpin = 0;
    this.freeSpinVel = 0;
    this.s.spin = this.index * STEP;
  }

  reload() {
    if (this.busy || (this.loaded === 6 && !this.open)) return false;
    this.busy = true;
    if (this.cocked) {
      this._tween(0.16, { hammer: 0, trigger: 0 }, {
        start: () => this.emit('decock'),
        end: () => (this.cocked = false),
      });
    }
    if (!this.open) {
      this._tween(0.07, { latch: 1 }, { start: () => this.emit('latch') });
      this._tween(0.22, { swing: 1, tilt: 0.55 }, { curve: ease.out, start: () => this.emit('swing-out') });
    }
    this._tween(0.16, { tilt: 1 });
    this._tween(0.11, { eject: 1 }, { curve: ease.out, end: () => this._eject() });
    this._tween(0.1, { eject: 0 });
    this._tween(0.12, { tilt: 0.5 });
    this._tween(0.36, { load: 1 }, {
      curve: ease.out,
      start: () => {
        this.rounds.fill('live');
        this.s.load = 0;
        this._applyRounds();
        this.emit('load');
      },
    });
    this._tween(0.18, { swing: 0, tilt: 0 }, { start: () => this._settleSpin(), end: () => this.emit('swing-in') });
    this._tween(0.06, { latch: 0 });
    this._then(() => (this.busy = false));
    return true;
  }

  setOpen(open) {
    if (this.busy || open === this.open) return false;
    this.busy = true;
    if (open) {
      if (this.cocked) {
        this._tween(0.16, { hammer: 0, trigger: 0 }, {
          start: () => this.emit('decock'),
          end: () => (this.cocked = false),
        });
      }
      this._tween(0.07, { latch: 1 }, { start: () => this.emit('latch') });
      this._tween(0.26, { swing: 1 }, { curve: ease.out, start: () => this.emit('swing-out') });
    } else {
      this._tween(0.2, { swing: 0 }, { start: () => this._settleSpin(), end: () => this.emit('swing-in') });
      this._tween(0.06, { latch: 0 });
    }
    this._then(() => (this.busy = false));
    return true;
  }

  /** Flick the open cylinder so it spins on the crane. */
  spinCylinder() {
    if (!this.open || this.busy) return false;
    this.freeSpinVel = 20 + Math.random() * 6;
    this.emit('spin');
    return true;
  }

  _eject() {
    const out = [];
    this.p.cartridges.forEach((c, k) => {
      if (this.rounds[k] === 'empty') return;
      c.group.updateWorldMatrix(true, false);
      out.push({ matrix: c.group.matrixWorld.clone(), spent: this.rounds[k] === 'spent' });
    });
    this.rounds.fill('empty');
    this._applyRounds();
    this.emit('eject', out);
  }

  _applyRounds() {
    this.p.cartridges.forEach((c, k) => {
      const r = this.rounds[k];
      c.group.visible = r !== 'empty';
      c.bullet.visible = r === 'live';
      c.dimple.visible = r === 'spent';
    });
  }

  /** World-space muzzle position and barrel direction. */
  muzzle(outPos, outDir) {
    this.model.updateWorldMatrix(true, false);
    outPos.set(DIM.MUZZLE + 2, 0, 0).applyMatrix4(this.model.matrixWorld);
    if (outDir) outDir.set(1, 0, 0).transformDirection(this.model.matrixWorld);
    return outPos;
  }

  update(dt) {
    for (let guard = 0; guard < 10 && this.queue.length; guard++) {
      const step = this.queue[0];
      if (!step.started) {
        step.started = true;
        step.start?.();
      }
      step.t += guard === 0 ? dt : 0;
      const k = step.dur > 0 ? Math.min(step.t / step.dur, 1) : 1;
      step.run(step.curve(k));
      if (k < 1) break;
      this.queue.shift();
      step.end?.();
    }

    if (this.freeSpinVel > 0) {
      this.freeSpin += this.freeSpinVel * dt;
      this.freeSpinVel = Math.max(0, this.freeSpinVel - 10 * dt);
    }

    // Recoil: a stiff, damped spring around the grip.
    this.recoilVel += (-260 * this.recoil - 24 * this.recoilVel) * dt;
    this.recoil += this.recoilVel * dt;

    this.flashTime -= dt;
    this._pose();
  }

  _pose() {
    const s = this.s;
    const p = this.p;
    p.hammer.rotation.z = s.hammer * HAMMER_COCKED;
    p.trigger.rotation.z = s.trigger * TRIGGER_PULLED;
    p.latch.position.x = -s.latch * LATCH_TRAVEL;
    p.crane.rotation.x = s.swing * SWING_OPEN;
    p.spin.rotation.x = s.spin + this.freeSpin;
    p.ejector.position.x = -s.eject * EJECT_TRAVEL;
    for (const c of p.cartridges) c.group.position.x = c.home.x - (1 - s.load) * LOAD_TRAVEL;
    this.recoilPivot.rotation.z = this.recoil;
    this.recoilPivot.position.x = GRIP_POINT.x - Math.max(0, this.recoil) * 0.03;

    const flashing = this.flashTime > 0;
    p.flash.visible = flashing;
    for (const g of p.gapFlashes) g.visible = flashing;
    if (flashing) {
      this.materials.flash.rotation = Math.random() * Math.PI * 2;
      p.flash.scale.setScalar(100 + Math.random() * 50);
    }
  }
}
