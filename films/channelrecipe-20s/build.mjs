// ChannelRecipe 20s — audio build.
// VO (vo/vo.* if supplied, else vo/scratch.wav) -> vo.json (lines, words, lip-sync)
// -> cues.json (scene cuts snapped to the beat grid) -> synthesized score -> beats.json (measured)
// -> out/audio.wav (score ducked under VO). render.mjs masters it to -14 LUFS.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  SR, Bus, kick, clap, hat, blip, bell, saw, sine, noise, env, svf, onePoleLP, onePoleHP, reverb, duck, writeWav, mtof,
} from '../../lib/synth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const DUR = 20, FPS = 30, B = 0.5;
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

// ------------------------------------------------------------------ 1. VO
const supplied = readdirSync(join(here, 'vo')).find((f) => /^vo\.(wav|mp3|m4a|aac|flac|ogg|aiff?)$/i.test(f));
const voSrc = join(here, 'vo', supplied || 'scratch.wav');
const vo48 = join(out, 'vo-48k.wav');
sh('ffmpeg', ['-y', '-v', 'error', '-i', voSrc, '-ac', '1', '-ar', String(SR), '-sample_fmt', 's16',
  '-af', `apad,atrim=0:${DUR}`, vo48]);
console.log('VO:', supplied ? `vo/${supplied} (supplied)` : 'vo/scratch.wav (SCRATCH placeholder)');
console.log(sh('node', [join(root, 'lib/vo-analyze.mjs'), vo48, join(here, 'vo/script.json'), join(here, 'vo.json'), String(FPS), String(DUR)]).trim());
const VO = JSON.parse(readFileSync(join(here, 'vo.json'), 'utf8'));
const L = Object.fromEntries(VO.lines.map((l) => [l.id, l]));
const word = (id, i) => L[id].words[i];

// ------------------------------------------------------------------ 2. cues on the grid
const q8 = (t) => Math.round(t / 0.25) * 0.25;
const cutAt = (t) => { const r = Math.round(t / B) * B; return r <= t + 0.15 ? r : Math.floor(t / B) * B; };
const cues = {
  _: 'Derived by build.mjs from vo.json. Seconds on the composed 120 BPM grid; the film snaps them to measured beats.json.',
  vo: supplied ? 'supplied' : 'scratch',
  hook: [1, 3, 5].map((i) => q8(word('hook', i).start)),   // camera / editing / face
  pick: cutAt(L.pick.start),
  picked: q8(word('pick', 4).start),                        // "recipe"
  cook: cutAt(L.cook.start),
  verbs: [3, 4, 7].map((i) => q8(word('cook', i).start)),   // script / voices / edits
  done: cutAt(L.done.start),
  ding: q8(word('done', 4).start),                          // "minutes"
  earn: cutAt(L.earn.start),
  first: q8(word('earn', 6).start),                         // "first"
  subs: cutAt(L.subs.start),
  smash: q8(word('subs', 0).start + 0.05),                  // "No"
  topple: q8(word('subs', 4).start),                        // "thousand"
  cta: cutAt(L.cta.start),
  trial: q8(word('cta', 1).start),                          // "Start"
  today: q8(word('cta', 5).start),
  end: DUR,
};
writeFileSync(join(here, 'cues.json'), JSON.stringify(cues, null, 1));

// ------------------------------------------------------------------ 3. score (D minor, 120 BPM)
const drums = new Bus(DUR), music = new Bus(DUR), sfx = new Bus(DUR), send = new Bus(DUR);
const kicks = [];
const K = (t, o, g = 0.9) => { drums.add(t, kick(o), g); kicks.push(t); };
const whoosh = (t, dur = 0.45, seed = 1, g = 0.5) => {
  const w = noise(dur, seed);
  svf(w, (x) => 500 + 7000 * Math.sin(Math.min(1, x / dur) * Math.PI), 2.5, 'bp');
  const l = new Float32Array(w.length), r = new Float32Array(w.length);
  env(w, (x) => Math.sin(Math.min(1, x / dur) * Math.PI) ** 2 * 1.4);
  for (let i = 0; i < w.length; i++) { const p = i / w.length; l[i] = w[i] * (1 - p); r[i] = w[i] * p; }
  sfx.addStereo(t - dur * 0.6, l, r, g);
};
const impact = (t, big = 1, seed = 1) => {
  K(t, { f0: 200, f1: 36, dur: 0.6 + big * 0.4, punch: 1.2 + big * 0.2 }, 1.0);
  const n = noise(0.5, 70 + seed); svf(n, 1800, 0.8, 'bp');
  sfx.add(t, env(n, (x) => Math.exp(-x * 12) * 1.5), 0.35 * big);
  const sub = sine((x) => 55 * (1 + Math.exp(-x * 20)), 0.9);
  sfx.add(t, env(sub, (x) => Math.exp(-x * 4)), 0.5 * big);
  send.add(t, env(noise(0.2, 90 + seed), (x) => Math.exp(-x * 25)), 0.6 * big);
};

// hook: three impacts on the nouns, tape-stop style drop before "pick"
cues.hook.forEach((t, i) => { impact(t, 0.8 + i * 0.1, i); whoosh(t, 0.3, 10 + i, 0.35); });
for (let i = 0; i < 6; i++) drums.add(cues.pick - 0.25 + i * 0.04, clap(400 + i), 0.08 + i * 0.05);

// groove: pick -> cta
const bass = [38, 38, 50, 38, 41, 38, 48, 36];
const arp = [62, 65, 69, 72, 69, 65, 74, 72];
function groove(a, b, { arpOn = true, bassOn = true, half = false } = {}) {
  for (let t = a; t < b - 1e-6; t += B) {
    const k = Math.round(t / B);
    if (!half || k % 2 === 0) K(t);
    if (k % 2 === 1) { drums.add(t, clap(500 + k), 0.5, 0.05); send.add(t, clap(600 + k), 0.3); }
    drums.add(t + B / 2, hat(700 + k, k % 4 === 3), 0.26, 0.3);
    drums.add(t + B / 4, hat(800 + k), 0.09, -0.3);
    drums.add(t + (3 * B) / 4, hat(900 + k), 0.07, -0.2);
    if (bassOn) for (let h = 0; h < 2; h++) {
      const nn = bass[(k * 2 + h) % 8];
      const v = saw(mtof(nn), (B / 2) * 0.9);
      svf(v, (x) => 280 + 2400 * Math.exp(-x * 16), 1.7, 'lp');
      env(v, (x) => Math.min(1, x * 400) * Math.exp(-x * 3));
      music.add(t + (h * B) / 2, v, 0.4);
      music.add(t + (h * B) / 2, env(sine(mtof(nn - 12), (B / 2) * 0.9), (x) => Math.min(1, x * 300)), 0.32);
    }
    if (arpOn) for (let s = 0; s < 4; s++) {
      const nn = arp[(k * 4 + s) % 8] + (k % 8 >= 4 ? -2 : 0);
      const v = saw(mtof(nn), 0.11); svf(v, (x) => 900 + 5000 * Math.exp(-x * 30), 2.2, 'lp');
      env(v, (x) => Math.min(1, x * 800) * Math.exp(-x * 22));
      music.add(t + s * B / 4, v, 0.075, s % 2 ? 0.45 : -0.45);
      send.add(t + s * B / 4, v, 0.03);
    }
  }
}
groove(cues.pick, cues.cta - B);

// scene cuts: whoosh into each, impact on the cut
[cues.pick, cues.cook, cues.done, cues.earn, cues.subs].forEach((t, i) => { whoosh(t, 0.5, 30 + i, 0.45); impact(t, 0.55, 20 + i); });
// carousel lands on "recipe"
sfx.add(cues.picked, blip(mtof(81), 0.25, [1, 2, 3], 16), 0.3);
sfx.add(cues.picked + 0.07, blip(mtof(88), 0.35, [1, 2, 3], 12), 0.26);
// cook verbs: ascending ticks
cues.verbs.forEach((t, i) => { sfx.add(t, blip(mtof(84 + [0, 3, 7][i]), 0.2, [1, 2, 3.01], 20), 0.32, 0.2); send.add(t, blip(mtof(84 + [0, 3, 7][i]), 0.2, [1, 2], 20), 0.25); });
// phone spin riser into the ding
{
  const a = cues.done, d = Math.max(0.5, cues.ding - a), r = noise(d, 1500);
  svf(r, (x) => 400 * Math.pow(20, x / d), 3.5, 'bp');
  sfx.add(a, env(r, (x) => (x / d) ** 2 * 1.4), 0.35);
  sfx.add(cues.ding, bell(2349, 1.6), 0.3, 0.1);
  sfx.add(cues.ding + 0.12, bell(2794, 1.4), 0.16, -0.1);
  send.add(cues.ding, bell(2349, 1.6), 0.35);
}
// earn: "first" — cash register-ish double blip
sfx.add(cues.first, blip(mtof(91), 0.25, [1, 2, 3], 16), 0.28, 0.3);
sfx.add(cues.first + 0.09, blip(mtof(98), 0.4, [1, 2, 3], 10), 0.26, -0.3);
// subs: smash + topple
impact(cues.smash, 1.0, 40);
{ const s = noise(0.25, 41); svf(s, (x) => 2000 + x * 16000, 2.5, 'bp'); sfx.add(cues.smash, env(s, (x) => Math.sin(Math.min(1, x / 0.25) * Math.PI) * 1.4), 0.4); }
whoosh(cues.topple + 0.3, 0.5, 42, 0.4);
impact(cues.topple + 0.3, 0.8, 43);
// reverse swell into the CTA
{
  const a = cues.cta - B, r = noise(B, 1700); onePoleHP(r, 1500);
  sfx.add(a, env(r, (x) => (x / B) ** 3 * 1.3), 0.5);
  const s = saw((x) => mtof(50) * (1 + x / B), B); svf(s, (x) => 400 + 6000 * (x / B), 1.5, 'lp');
  music.add(a, env(s, (x) => (x / B) ** 2), 0.16);
}
// CTA: hit + Dm9 pad + light pulse to the end
impact(cues.cta, 1.1, 50);
{
  const d = DUR - cues.cta;
  [38, 50, 53, 57, 60, 64].forEach((m, i) => {
    for (const det of [-0.004, 0.004]) {
      const v = saw(mtof(m) * (1 + det), d, i * 0.13);
      svf(v, (x) => 600 + 3000 * Math.exp(-x * 1.5), 1.0, 'lp');
      env(v, (x) => Math.min(1, x * 200) * (0.55 + 0.45 * Math.exp(-x * 0.6)) * Math.min(1, (d - x) / 0.5));
      music.add(cues.cta, v, i === 0 ? 0.14 : 0.06, det < 0 ? -0.5 : 0.5);
      send.add(cues.cta, v, 0.035);
    }
  });
  for (let t = cues.cta; t < DUR - B; t += B) {
    const k = Math.round(t / B);
    drums.add(t + B / 2, hat(1900 + k), 0.16, 0.2);
    if (k % 2 === 0 && t < DUR - 2) K(t, { f0: 120, f1: 40, dur: 0.4, punch: 0.7 }, 0.6);
  }
  sfx.add(cues.trial, blip(mtof(86), 0.3, [1, 2, 3], 12), 0.2, 0.2);
  sfx.add(cues.today, blip(mtof(93), 0.6, [1, 2, 3], 7), 0.2, -0.2);
}

duck(music, kicks, 0.4, 0.12);
reverb(send, { size: 0.84, damp: 0.3 });
const score = new Bus(DUR);
drums.mixInto(score, 0.9); music.mixInto(score, 1); sfx.mixInto(score, 1); send.mixInto(score, 0.5);
for (let i = 0; i < score.n; i++) { score.L[i] = Math.tanh(score.L[i] * 1.1); score.R[i] = Math.tanh(score.R[i] * 1.1); }
writeWav(join(out, 'score.wav'), score);

// ------------------------------------------------------------------ 4. measured beat grid
console.log(sh('node', [join(root, 'lib/measure-beats.mjs'), join(out, 'score.wav'), join(here, 'beats.json')]).trim());

// ------------------------------------------------------------------ 5. mix: duck music under the voice
const vb = readFileSync(vo48); let off = 12;
while (vb.toString('ascii', off, off + 4) !== 'data') off += 8 + vb.readUInt32LE(off + 4);
const vn = Math.min(score.n, vb.readUInt32LE(off + 4) / 2);
const mix = new Bus(DUR);
// peak-normalise score and VO separately, then balance: VO sits ~9 dB over the bed
let sp = 0, vp = 0;
for (let i = 0; i < score.n; i++) sp = Math.max(sp, Math.abs(score.L[i]), Math.abs(score.R[i]));
for (let i = 0; i < vn; i++) vp = Math.max(vp, Math.abs(vb.readInt16LE(off + 8 + i * 2) / 32768));
const envAt = (t) => { const f = t * FPS, i = Math.floor(f); const a = VO.env[i] ?? 0, b = VO.env[i + 1] ?? a; return a + (b - a) * (f - i); };
let g = 1;
for (let i = 0; i < score.n; i++) {
  const t = i / SR;
  const target = 1 - 0.55 * Math.min(1, envAt(t) * 1.6);
  g += (target - g) * (target < g ? 0.004 : 0.0006); // fast duck, slow release
  const v = i < vn ? (vb.readInt16LE(off + 8 + i * 2) / 32768 / (vp || 1)) * 0.95 : 0;
  mix.L[i] = (score.L[i] / sp) * 0.42 * g + v;
  mix.R[i] = (score.R[i] / sp) * 0.42 * g + v;
}
for (let i = 0; i < mix.n; i++) { const f = Math.min(1, (DUR - i / SR) / 0.08); mix.L[i] = Math.tanh(mix.L[i]) * f; mix.R[i] = Math.tanh(mix.R[i]) * f; }
writeWav(join(out, 'audio.wav'), mix);
console.log('wrote out/audio.wav  cues:', JSON.stringify(cues));
