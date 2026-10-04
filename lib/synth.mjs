// Tiny offline synth: everything is a pure function writing into Float32 buffers.
// Seeded noise only (mulberry32) so every render of the score is bit-identical.
import { writeFileSync } from 'node:fs';

export const SR = 48000;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Bus {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  // add a mono voice at time t with gain and pan (-1..1)
  add(t, buf, gain = 1, pan = 0) {
    const s0 = Math.round(t * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < buf.length; i++) {
      const j = s0 + i;
      if (j < 0 || j >= this.n) continue;
      this.L[j] += buf[i] * gl;
      this.R[j] += buf[i] * gr;
    }
  }
  addStereo(t, l, r, gain = 1) {
    const s0 = Math.round(t * SR);
    for (let i = 0; i < l.length; i++) {
      const j = s0 + i;
      if (j < 0 || j >= this.n) continue;
      this.L[j] += l[i] * gain;
      this.R[j] += r[i] * gain;
    }
  }
  mixInto(dst, gain = 1) {
    for (let i = 0; i < this.n; i++) {
      dst.L[i] += this.L[i] * gain;
      dst.R[i] += this.R[i] * gain;
    }
  }
}

const len = (s) => Math.max(1, Math.round(s * SR));

// ---- filters -------------------------------------------------------------
export function onePoleLP(buf, cutoffFn) {
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    const fc = typeof cutoffFn === 'function' ? cutoffFn(i / SR) : cutoffFn;
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    y += a * (buf[i] - y);
    buf[i] = y;
  }
  return buf;
}
export function onePoleHP(buf, cutoffFn) {
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    const fc = typeof cutoffFn === 'function' ? cutoffFn(i / SR) : cutoffFn;
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    y += a * (buf[i] - y);
    buf[i] = buf[i] - y;
  }
  return buf;
}
// state-variable bandpass / lowpass with resonance
export function svf(buf, cutoffFn, q = 0.7, mode = 'lp') {
  let low = 0, band = 0;
  for (let i = 0; i < buf.length; i++) {
    const fc = typeof cutoffFn === 'function' ? cutoffFn(i / SR) : cutoffFn;
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 6)) / SR);
    const high = buf[i] - low - band / q;
    band += f * high;
    low += f * band;
    buf[i] = mode === 'lp' ? low : mode === 'bp' ? band : high;
  }
  return buf;
}

// ---- voices --------------------------------------------------------------
export function kick({ dur = 0.45, f0 = 160, f1 = 44, punch = 1, click = 0.6 } = {}) {
  const n = len(dur), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t * 28);
    ph += (2 * Math.PI * f) / SR;
    const amp = Math.exp(-t * (6 / dur)) * punch;
    out[i] = Math.tanh(Math.sin(ph) * amp * 1.6);
    if (t < 0.004) out[i] += click * (1 - t / 0.004) * (i % 2 ? 1 : -1) * 0.5;
  }
  return out;
}

export function noise(dur, seed) {
  const r = mulberry32(seed), n = len(dur), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

export function env(buf, fn) {
  for (let i = 0; i < buf.length; i++) buf[i] *= fn(i / SR);
  return buf;
}

export function clap(seed) {
  const b = noise(0.28, seed);
  svf(b, 1400, 1.2, 'bp');
  return env(b, (t) => {
    const taps = [0, 0.011, 0.022];
    let e = 0;
    for (const s of taps) if (t >= s) e = Math.max(e, Math.exp(-(t - s) * 180));
    return (e * 0.9 + Math.exp(-t * 14) * 0.45) * 2.4;
  });
}

export function hat(seed, open = false) {
  const b = noise(open ? 0.25 : 0.06, seed);
  onePoleHP(b, 7000);
  return env(b, (t) => Math.exp(-t * (open ? 14 : 70)));
}

export function blip(freq, dur = 0.09, partials = [1, 2.01], decay = 40) {
  const n = len(dur), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    partials.forEach((p, k) => (s += Math.sin(2 * Math.PI * freq * p * t) / (k + 1)));
    out[i] = s * Math.exp(-t * decay) * Math.min(1, t * 2000);
  }
  return out;
}

// inharmonic bell (oven-timer ding)
export function bell(freq, dur = 1.6) {
  const ratios = [1, 2.76, 5.4, 8.93], amps = [1, 0.5, 0.25, 0.12], decs = [2.2, 3.5, 6, 9];
  const n = len(dur), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (let k = 0; k < ratios.length; k++) s += amps[k] * Math.sin(2 * Math.PI * freq * ratios[k] * t) * Math.exp(-t * decs[k]);
    out[i] = s * Math.min(1, t * 3000);
  }
  return out;
}

// band-limited-ish saw via polyBLEP
export function saw(freqFn, dur, seedPhase = 0) {
  const n = len(dur), out = new Float32Array(n);
  let ph = seedPhase;
  for (let i = 0; i < n; i++) {
    const f = typeof freqFn === 'function' ? freqFn(i / SR) : freqFn;
    const dt = f / SR;
    ph += dt;
    if (ph >= 1) ph -= 1;
    let v = 2 * ph - 1;
    if (ph < dt) { const x = ph / dt; v -= x + x - x * x - 1; }
    else if (ph > 1 - dt) { const x = (ph - 1) / dt; v -= x * x + x + x + 1; }
    out[i] = v;
  }
  return out;
}

export function sine(freqFn, dur) {
  const n = len(dur), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const f = typeof freqFn === 'function' ? freqFn(i / SR) : freqFn;
    ph += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(ph);
  }
  return out;
}

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- fx --------------------------------------------------------------------
// Schroeder/Freeverb-style stereo reverb, deterministic.
export function reverb(bus, { size = 0.82, damp = 0.35, wet = 1 } = {}) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => Math.round((d * SR) / 44100));
  const aps = [556, 441, 341, 225].map((d) => Math.round((d * SR) / 44100));
  const run = (inp, spread) => {
    const out = new Float32Array(inp.length);
    for (const d0 of combs) {
      const d = d0 + spread, buf = new Float32Array(d);
      let idx = 0, store = 0;
      for (let i = 0; i < inp.length; i++) {
        const o = buf[idx];
        store = o * (1 - damp) + store * damp;
        buf[idx] = inp[i] * 0.015 + store * size;
        idx = (idx + 1) % d;
        out[i] += o;
      }
    }
    for (const d0 of aps) {
      const d = d0 + spread, buf = new Float32Array(d);
      let idx = 0;
      for (let i = 0; i < out.length; i++) {
        const b = buf[idx];
        const o = -out[i] + b;
        buf[idx] = out[i] + b * 0.5;
        idx = (idx + 1) % d;
        out[i] = o;
      }
    }
    return out;
  };
  const l = run(bus.L, 0), r = run(bus.R, 23);
  for (let i = 0; i < bus.n; i++) { bus.L[i] = l[i] * wet; bus.R[i] = r[i] * wet; }
  return bus;
}

// sidechain-style ducking driven by a list of trigger times
export function duck(bus, times, depth = 0.5, release = 0.18) {
  for (let i = 0; i < bus.n; i++) {
    const t = i / SR;
    let g = 1;
    for (const k of times) {
      const d = t - k;
      if (d >= 0 && d < release * 4) g = Math.min(g, 1 - depth * Math.exp(-d / release));
    }
    bus.L[i] *= g; bus.R[i] *= g;
  }
}

export function writeWav(path, bus) {
  const n = bus.n, data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(bus.L[i]), Math.abs(bus.R[i]));
  const g = peak > 0.98 ? 0.98 / peak : 1;
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.L[i] * g)) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.R[i] * g)) * 32767), 46 + i * 4);
  }
  writeFileSync(path, data);
}
