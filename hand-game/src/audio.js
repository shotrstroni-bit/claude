// Every sound is synthesised with Web Audio: no files to download.
// Metal parts are short filtered noise ("the click") plus a few inharmonic
// sine partials that ring briefly ("the steel"). The gunshot layers a
// supersonic crack, the muzzle blast, a low concussion and a room echo.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  /** Browsers only allow audio after a user gesture; call this from a click. */
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 5;
      comp.attack.value = 0.002;
      comp.release.value = 0.25;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.75;
      this.master.connect(comp);
      this.verb = ctx.createConvolver();
      this.verb.buffer = this._impulse(2.4, 2.8);
      const wet = ctx.createGain();
      wet.gain.value = 0.42;
      this.verb.connect(wet).connect(this.master);
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._hum = null;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get _on() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
      // a few early reflections off the courtyard walls
      for (const [t, g] of [[0.031, 0.5], [0.057, 0.35], [0.092, 0.28], [0.15, 0.2]]) {
        const at = Math.floor((t + ch * 0.004) * rate);
        for (let i = 0; i < 60; i++) d[at + i] += (Math.random() * 2 - 1) * g * (1 - i / 60);
      }
    }
    return buf;
  }

  _send(node, wet) {
    node.connect(this.master);
    if (wet > 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.verb);
    }
  }

  _noise(t, dur, { type = 'bandpass', f = 1000, f2 = f, q = 1, gain = 0.5, attack = 0.001, wet = 0 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f, t);
    if (f2 !== f) filter.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(amp);
    this._send(amp, wet);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  _tone(t, { type = 'sine', f, f2 = f, dur, gain, attack = 0.004, wet = 0 }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (f2 !== f) osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    this._send(amp, wet);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Ringing steel or brass: a few inharmonic partials, fast decay. */
  _ping(t, freqs, dur, gain, wet = 0) {
    freqs.forEach((f, i) => this._tone(t, { f: f * (0.98 + Math.random() * 0.04), dur: dur / (1 + i * 0.4), gain: gain / (1 + i * 0.6), attack: 0.001, wet }));
  }

  _click(t, f, gain, q = 4) {
    this._noise(t, 0.009, { f, q, gain });
  }

  /* ---------- Revolver ---------- */

  gunshot() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    const k = 0.94 + Math.random() * 0.12;
    this._noise(t, 0.014, { type: 'highpass', f: 2600, gain: 1.5 }); // crack
    this._noise(t, 0.5, { type: 'lowpass', f: 6000 * k, f2: 240, q: 0.6, gain: 1.7, wet: 0.9 }); // blast
    this._tone(t, { f: 125 * k, f2: 36, dur: 0.42, gain: 1.5, attack: 0.002 }); // concussion
    this._tone(t, { type: 'triangle', f: 64, f2: 30, dur: 0.6, gain: 0.55, wet: 0.5 });
    this._noise(t + 0.14, 0.4, { f: 900, f2: 260, q: 0.7, gain: 0.22, wet: 1 }); // slap-back off the walls
  }

  cock() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    // the hand turning the cylinder, then the sear dropping into the full-cock notch
    this._click(t, 3000, 0.45);
    this._ping(t + 0.003, [2650, 4150], 0.05, 0.1);
    this._click(t + 0.072, 5200, 0.7, 5);
    this._ping(t + 0.075, [3650, 5900, 8100], 0.07, 0.14);
  }

  trigger() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._click(t, 2600, 0.3);
    this._click(t + 0.09, 4200, 0.25);
  }

  dry() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._click(t, 2100, 0.95, 3);
    this._ping(t, [1650, 2950, 4400], 0.09, 0.22);
    this._tone(t, { f: 320, f2: 110, dur: 0.04, gain: 0.3 });
  }

  decock() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._click(t, 3400, 0.3);
    this._click(t + 0.14, 2400, 0.35);
  }

  latch() {
    if (!this._on) return;
    this._click(this.ctx.currentTime, 4300, 0.35);
  }

  swingOut() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.18, { f: 1500, f2: 3800, q: 2, gain: 0.3 });
    this._ping(t + 0.17, [3000, 4550], 0.1, 0.13);
  }

  eject() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.05, { f: 2400, q: 2, gain: 0.35 }); // rod stroke
    for (let i = 0; i < 6; i++) {
      const at = t + 0.03 + Math.random() * 0.2;
      this._ping(at, [4800 + Math.random() * 900, 7300, 9900], 0.16, 0.06);
    }
  }

  casing(strength = 1) {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    const g = Math.min(0.14, 0.03 + strength * 0.04);
    this._ping(t, [3800 + Math.random() * 2400, 6100 + Math.random() * 1400, 9400], 0.22, g, 0.2);
    this._click(t, 6000, g * 1.5, 2);
  }

  load() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) this._click(t + 0.12 + i * 0.035, 1700 + i * 60, 0.22, 2);
  }

  swingIn() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.025, { f: 1400, q: 1.4, gain: 0.85 });
    this._ping(t, [2150, 3450, 5200], 0.1, 0.24);
  }

  spin() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    let at = t;
    for (let i = 0; i < 42; i++) {
      const gap = 0.018 + i * i * 0.00006;
      at += gap;
      this._click(at, 4600, 0.16 * (1 - i / 50), 6);
    }
  }

  summonGun() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.3, { type: 'highpass', f: 1500, f2: 7000, gain: 0.12, wet: 0.7 });
    this._ping(t + 0.05, [1320, 1980, 2640], 0.35, 0.08, 0.6);
  }

  /* ---------- Magic ---------- */

  grab() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._tone(t, { f: 280, f2: 760, dur: 0.28, gain: 0.18, wet: 0.6 });
    this._noise(t, 0.32, { type: 'highpass', f: 3500, gain: 0.07, wet: 0.8 });
  }

  /** Continuous hum while something is held; level 0..1. */
  hold(level) {
    if (!this.ctx) return;
    if (!this._hum) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      for (const [f, type] of [[98, 'sawtooth'], [147.5, 'sine'], [196.8, 'triangle']]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.connect(lp);
        o.start();
      }
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.value = 260;
      lfo.connect(depth).connect(lp.frequency);
      lfo.start();
      lp.connect(g);
      this._send(g, 0.4);
      this._hum = g;
    }
    const target = this.enabled ? level * 0.07 : 0;
    this._hum.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  launch() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.42, { f: 350, f2: 2600, q: 1.1, gain: 0.55, attack: 0.03, wet: 0.5 });
    this._tone(t, { f: 210, f2: 55, dur: 0.32, gain: 0.3 });
  }

  impact(strength = 1) {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    const g = Math.min(1, 0.25 + strength * 0.12);
    this._tone(t, { f: 95, f2: 38, dur: 0.22, gain: 0.7 * g });
    this._noise(t, 0.18, { type: 'lowpass', f: 1300, f2: 300, gain: 0.6 * g, wet: 0.4 });
  }

  ricochet() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._tone(t, { type: 'sawtooth', f: 3200, f2: 1300, dur: 0.22, gain: 0.05, wet: 0.5 });
  }

  enemyHit() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._tone(t, { type: 'square', f: 520, f2: 260, dur: 0.08, gain: 0.08 });
  }

  enemyDie() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._tone(t, { type: 'sawtooth', f: 900, f2: 110, dur: 0.38, gain: 0.16, wet: 0.6 });
    this._noise(t, 0.3, { f: 3000, f2: 800, q: 1.5, gain: 0.25, wet: 0.5 });
    this._ping(t + 0.04, [2640, 3960], 0.3, 0.05, 0.8);
  }

  hurt() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    this._tone(t, { type: 'sawtooth', f: 75, f2: 38, dur: 0.6, gain: 0.45, wet: 0.3 });
    this._noise(t, 0.5, { type: 'lowpass', f: 600, f2: 120, gain: 0.6 });
  }

  wave() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    [220, 261.6, 329.6, 392].forEach((f, i) =>
      this._tone(t + i * 0.06, { type: 'triangle', f, dur: 1.4, gain: 0.07, attack: 0.25, wet: 1 }),
    );
  }

  gameOver() {
    if (!this._on) return;
    const t = this.ctx.currentTime;
    [392, 329.6, 261.6, 196].forEach((f, i) =>
      this._tone(t + i * 0.22, { type: 'triangle', f, dur: 0.7, gain: 0.1, wet: 0.8 }),
    );
  }
}
