// Every sound is synthesised with Web Audio, so there are no audio files to load.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  /** Browsers only allow audio after a user gesture; call this from a click. */
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  _tone({ type = 'sine', f0, f1 = f0, dur, gain, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise({ dur, gain, freq }) {
    const t = this.ctx.currentTime;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = 1.2;
    const amp = this.ctx.createGain();
    amp.gain.value = gain;
    src.connect(band).connect(amp).connect(this.master);
    src.start(t);
  }

  pop(combo = 1) {
    if (!this._ready()) return;
    const k = 1 + Math.min(combo, 10) * 0.055;
    this._tone({ f0: 820 * k, f1: 260 * k, dur: 0.1, gain: 0.32 });
    this._noise({ dur: 0.035, gain: 0.25, freq: 2600 });
  }

  gold() {
    if (!this._ready()) return;
    [988, 1319, 1976].forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.42, gain: 0.16, delay: i * 0.055 }));
  }

  tick() {
    if (!this._ready()) return;
    this._tone({ type: 'square', f0: 1320, dur: 0.05, gain: 0.05 });
  }

  go() {
    if (!this._ready()) return;
    this._tone({ type: 'triangle', f0: 660, dur: 0.18, gain: 0.18 });
    this._tone({ type: 'triangle', f0: 990, dur: 0.3, gain: 0.18, delay: 0.09 });
  }

  end() {
    if (!this._ready()) return;
    [784, 659, 523, 392].forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.32, gain: 0.15, delay: i * 0.11 }));
  }

  grab() {
    if (!this._ready()) return;
    this._tone({ f0: 300, f1: 560, dur: 0.07, gain: 0.14 });
  }

  thud(strength) {
    if (!this._ready()) return;
    this._tone({ f0: 210, f1: 90, dur: 0.09, gain: Math.min(0.28, 0.05 + strength * 0.12) });
  }
}
