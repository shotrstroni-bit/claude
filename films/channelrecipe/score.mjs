// ChannelRecipe 15s spot — score + SFX, synthesized. 120 BPM, A minor.
// Hits sit on the cue beats in cues.json. Output: out/score.wav (loudness-normalised by render.mjs).
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SR, Bus, kick, clap, hat, blip, bell, saw, sine, noise, env, svf, onePoleLP, onePoleHP,
  reverb, duck, writeWav, mtof,
} from '../../lib/synth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(readFileSync(join(here, 'cues.json'), 'utf8'));
const DUR = 15.0;
const BPM = 120, B = 60 / BPM;
const b = (k) => k * B;

const drums = new Bus(DUR), music = new Bus(DUR), sfx = new Bus(DUR), send = new Bus(DUR);
const kicks = [];
const K = (t, opts, g = 0.95) => { drums.add(t, kick(opts), g); kicks.push(t); };

// ------------------------------------------------ HOOK: three slams + marker strike
C.hook.forEach((k, i) => {
  K(b(k), { f0: 190, f1: 42, dur: 0.5, punch: 1.25 }, 1.0);
  const thud = noise(0.18, 100 + i);
  svf(thud, 900, 0.9, 'bp');
  sfx.add(b(k), env(thud, (t) => Math.exp(-t * 26) * 1.6), 0.55, [0, -0.25, 0.25][i]);
  send.add(b(k), env(noise(0.1, 200 + i), (t) => Math.exp(-t * 40)), 0.5);
});
{
  const s = noise(0.22, 300);
  svf(s, (t) => 2500 + t * 18000, 2.5, 'bp');
  env(s, (t) => Math.sin(Math.min(1, t / 0.22) * Math.PI) * 1.4);
  const l = new Float32Array(s.length), r = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) { const p = i / s.length; l[i] = s[i] * (1 - p); r[i] = s[i] * p; }
  sfx.addStereo(b(C.strike), l, r, 0.6);
  for (let i = 0; i < 8; i++) drums.add(b(C.strike) + (i / 8) * B, clap(400 + i), 0.1 + i * 0.05);
}

// ------------------------------------------------ GROOVE helper
const bassNotes = [45, 45, 57, 45, 48, 45, 55, 43];
function groove(from, to, { claps = true, bass = true } = {}) {
  for (let k = from; k < to; k++) {
    K(b(k));
    if (claps && k % 2 === 1) { drums.add(b(k), clap(500 + k), 0.55, 0.05); send.add(b(k), clap(600 + k), 0.35); }
    drums.add(b(k) + B / 2, hat(700 + k, k % 4 === 3), 0.3, 0.3);
    drums.add(b(k) + B / 4, hat(800 + k), 0.1, -0.3);
    if (!bass) continue;
    for (let h = 0; h < 2; h++) {
      const note = bassNotes[(k * 2 + h) % 8];
      const v = saw(mtof(note), (B / 2) * 0.92);
      svf(v, (t) => 300 + 2200 * Math.exp(-t * 18), 1.6, 'lp');
      env(v, (t) => Math.min(1, t * 400) * Math.exp(-t * 3));
      music.add(b(k) + (h * B) / 2, v, 0.42);
      music.add(b(k) + (h * B) / 2, env(sine(mtof(note - 12), (B / 2) * 0.9), (t) => Math.min(1, t * 300)), 0.35);
    }
  }
}

// ------------------------------------------------ DEAL: four niche cards flick in, then SELECT
groove(C.deal[0], C.button);
C.deal.forEach((k, i) => {
  const w = noise(0.22, 900 + i);
  svf(w, (t) => 1500 + 6000 * (t / 0.22), 2.2, 'bp');
  sfx.add(b(k) - 0.06, env(w, (t) => Math.sin(Math.min(1, t / 0.22) * Math.PI) ** 2 * 1.3), 0.45, (i - 1.5) * 0.4);
  sfx.add(b(k) + 0.04, env(noise(0.02, 950 + i), (t) => Math.exp(-t * 200)), 0.35, (i - 1.5) * 0.4);
});
sfx.add(b(C.select), blip(mtof(76), 0.22, [1, 2, 3], 18), 0.32);
sfx.add(b(C.select) + 0.07, blip(mtof(83), 0.3, [1, 2, 3], 14), 0.28);

// ------------------------------------------------ INGREDIENTS: ascending check ticks
C.ingredients.forEach((k, i) => {
  const f = mtof(76 + [0, 3, 5, 7, 12][i]);
  sfx.add(b(k) + 0.04, blip(f, 0.18, [1, 2.0, 3.01], 22), 0.36, 0.2);
  sfx.add(b(k) + 0.04, env(noise(0.03, 1000 + k), (t) => Math.exp(-t * 120)), 0.22, -0.2);
  send.add(b(k) + 0.04, blip(f, 0.18, [1, 2.0], 22), 0.22);
});

// ------------------------------------------------ BUTTON: thump on arrival, hats-only tension, click
sfx.add(b(C.button), blip(98, 0.3, [1], 12), 0.7);
for (let k = C.button + 1; k < C.click; k++) drums.add(b(k) + B / 2, hat(1100 + k), 0.25, 0.2);
{
  const dur = b(C.click) - b(C.button + 1);
  const sw = saw((t) => mtof(57) * (1 + (t / dur) * 0.5), dur);
  svf(sw, (t) => 400 + (t / dur) * 3000, 2, 'lp');
  music.add(b(C.button + 1), env(sw, (t) => (t / dur) * 0.7), 0.14);
}
sfx.add(b(C.click), env(noise(0.012, 1200), (t) => Math.exp(-t * 600)), 0.9);
sfx.add(b(C.click) + 0.05, env(noise(0.012, 1201), (t) => Math.exp(-t * 600)), 0.6);
sfx.add(b(C.click), blip(1400, 0.05, [1], 90), 0.4);
K(b(C.click), { f0: 220, f1: 50, dur: 0.35 }, 0.7);

// ------------------------------------------------ OVEN: half-time, clock ticks, riser into the ding
for (let k = C.oven; k < C.ding; k++) {
  if ((k - C.oven) % 2 === 0) K(b(k), { f0: 140, f1: 40, dur: 0.7 }, 1.0);
  else { drums.add(b(k), clap(1300 + k), 0.5); send.add(b(k), clap(1400 + k), 0.5); }
  for (let h = 0; h < 2; h++) sfx.add(b(k) + (h * B) / 2, blip(h ? 2200 : 1700, 0.04, [1, 2.7], 120), 0.28, h ? 0.35 : -0.35);
}
{
  const dur = b(C.ding) - b(C.oven), r = noise(dur, 1500);
  svf(r, (t) => 300 * Math.pow(30, t / dur), 4, 'bp');
  sfx.add(b(C.oven), env(r, (t) => (t / dur) ** 2 * 1.5), 0.45);
  const up = saw((t) => mtof(45) * Math.pow(4, t / dur), dur);
  svf(up, (t) => 300 + 4000 * (t / dur), 1.2, 'lp');
  music.add(b(C.oven), env(up, (t) => (t / dur) ** 1.5), 0.16);
  [57, 60, 64, 67].forEach((m, i) => {
    const p = saw(mtof(m) * (1 + (i - 1.5) * 0.002), dur);
    onePoleLP(p, 1600);
    music.add(b(C.oven), env(p, (t) => Math.min(1, t * 3) * 0.6), 0.06, (i - 1.5) * 0.4);
  });
}

// ------------------------------------------------ DING + MONEY
sfx.add(b(C.ding), bell(2093, 1.8), 0.32, 0.1);
sfx.add(b(C.ding) + 0.12, bell(2637, 1.6), 0.18, -0.1);
send.add(b(C.ding), bell(2093, 1.8), 0.4);
K(b(C.ding), { f0: 200, f1: 40, dur: 0.6, punch: 1.3 }, 1.1);
groove(C.ding + 1, C.swell);
C.money.forEach((k, i) => {
  sfx.add(b(k) + 0.02, blip(mtof(88 + i * 2), 0.25, [1, 2, 3], 16), 0.26, 0.3);
  sfx.add(b(k) + 0.1, blip(mtof(93 + i * 2), 0.35, [1, 2, 3], 12), 0.24, -0.3);
});

// ------------------------------------------------ SWELL → END HIT
{
  const dur = B, r = noise(dur, 1700);
  onePoleHP(r, 1500);
  sfx.add(b(C.swell), env(r, (t) => (t / dur) ** 3 * 1.3), 0.5);
  const s = saw((t) => mtof(57) * (1 + t / dur), dur);
  svf(s, (t) => 400 + 6000 * (t / dur), 1.5, 'lp');
  music.add(b(C.swell), env(s, (t) => (t / dur) ** 2), 0.18);
}
K(b(C.end), { f0: 210, f1: 38, dur: 1.2, punch: 1.4 }, 1.2);
drums.add(b(C.end), clap(1800), 0.7);
send.add(b(C.end), clap(1801), 0.9);
{
  const dur = DUR - b(C.end);
  [45, 57, 60, 64, 67, 71].forEach((m, i) => {
    for (const det of [-0.004, 0.004]) {
      const v = saw(mtof(m) * (1 + det), dur, i * 0.13);
      svf(v, (t) => 600 + 3500 * Math.exp(-t * 2.5), 1.0, 'lp');
      env(v, (t) => Math.min(1, t * 200) * Math.exp(-t * 0.9) * Math.min(1, (dur - t) / 0.12));
      music.add(b(C.end), v, i === 0 ? 0.16 : 0.07, det < 0 ? -0.5 : 0.5);
      send.add(b(C.end), v, 0.04);
    }
  });
  // light pulse under the end card so it doesn't go dead
  for (let k = C.end + 1; k < 30; k++) drums.add(b(k) + B / 2, hat(1900 + k), 0.18, 0.2);
  sfx.add(b(C.cta), blip(mtof(84), 0.4, [1, 2, 3], 9), 0.22, 0.15);
  sfx.add(b(C.cta) + 0.08, blip(mtof(91), 0.5, [1, 2, 3], 8), 0.18, -0.15);
}

// ------------------------------------------------ MIX
duck(music, kicks, 0.45, 0.12);
reverb(send, { size: 0.84, damp: 0.3 });
const mix = new Bus(DUR);
drums.mixInto(mix, 0.9);
music.mixInto(mix, 1.0);
sfx.mixInto(mix, 1.0);
send.mixInto(mix, 0.55);
for (let i = 0; i < mix.n; i++) {
  const f = Math.min(1, (DUR - i / SR) / 0.06);
  mix.L[i] = Math.tanh(mix.L[i] * 1.1) * f;
  mix.R[i] = Math.tanh(mix.R[i] * 1.1) * f;
}
mkdirSync(join(here, 'out'), { recursive: true });
writeWav(join(here, 'out/score.wav'), mix);
console.log('wrote out/score.wav');
