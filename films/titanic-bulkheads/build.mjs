// Titanic: "The Walls Weren't the Problem" — audio build.
// VO (vo/vo.* if supplied, else vo/scratch.wav) -> vo.json -> cues.json (word cues snapped to the
// 96 BPM grid) -> synthesized documentary score -> beats.json (measured) -> out/audio.wav.
// Also writes film.json (duration follows the read) and an .srt for YouTube captions.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { SR, Bus, kick, clap, hat, blip, bell, saw, sine, noise, env, svf, onePoleLP, onePoleHP, reverb, writeWav, mtof } from '../../lib/synth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const FPS = 30, BPM = 96, B = 60 / BPM, E8 = B / 2, S16 = B / 4, TAIL = 3.2;
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).toString();

// ------------------------------------------------------------------ 1. VO
const supplied = readdirSync(join(here, 'vo')).find((f) => /^vo\.(wav|mp3|m4a|aac|flac|ogg|aiff?)$/i.test(f));
const voSrc = join(here, 'vo', supplied || 'scratch.wav');
const vo48 = join(out, 'vo-48k.wav');
sh('ffmpeg', ['-y', '-v', 'error', '-i', voSrc, '-ac', '1', '-ar', String(SR), '-sample_fmt', 's16', vo48]);
const voDur = +sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', vo48]).trim();
const DUR = Math.ceil((voDur + TAIL) * FPS) / FPS;
console.log('VO:', supplied ? `vo/${supplied} (supplied)` : 'vo/scratch.wav (SCRATCH placeholder)', `${voDur.toFixed(2)}s -> film ${DUR.toFixed(2)}s`);
console.log(sh('node', [join(root, 'lib/vo-analyze.mjs'), vo48, join(here, 'vo/script.json'), join(here, 'vo.json'), String(FPS), String(DUR)]).trim());
const VO = JSON.parse(readFileSync(join(here, 'vo.json'), 'utf8'));
const L = Object.fromEntries(VO.lines.map((l) => [l.id, l]));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// start time of the n-th occurrence of a word in a line
const w = (id, word, n = 0) => {
  const hits = L[id].words.filter((x) => norm(x.w) === norm(word));
  if (!hits[n]) throw new Error(`cue word "${word}" not found in line ${id}`);
  return hits[n].start;
};
const q8 = (t) => Math.round(t / E8) * E8;
const q16 = (t) => Math.round(t / S16) * S16;

// ------------------------------------------------------------------ 2. cues (seconds, on the composed grid)
const cues = {
  _: 'Derived by build.mjs from vo.json; seconds on the 96 BPM grid. The film resolves them through measured beats.json.',
  vo: supplied ? 'supplied' : 'scratch',
  bpm: BPM,
  date: q8(w('open', 'April')),
  stoker: q8(w('open', 'leading')),
  barrett: q8(w('open', 'Barrett')),
  boiler: q8(w('open', 'boiler')),
  pour: q8(w('open', 'pouring')),
  side: q8(w('open', 'side')),
  twofeet: q8(w('twofeet', 'two')),
  ran: q8(w('door', 'ran')),
  doordown: q8(w('door', 'down')),
  bridge: q8(L.bridge.start),
  murdoch: q8(w('bridge', 'Murdoch')),
  pulled: q8(w('bridge', 'pulled')),
  shut: q8(w('bridge', 'shut')),
  worked: q8(L.worked.start),
  gone0: q8(L.gone.start),
  gone: q8(w('gone', 'gone')),
  usual: q8(L.usual.start),
  high: q8(w('usual', 'high')),
  inquiry: q8(L.inquiry.start),
  architect: q8(w('inquiry', 'architect')),
  calcs: q8(w('inquiry', 'calculations')),
  oath: q8(w('inquiry', 'oath')),
  no: q8(w('no', 'no')),
  weakness: q8(L.weakness.start),
  design: q8(w('weakness', 'design')),
  century: q8(w('weakness', 'half')),
  missing: q8(w('weakness', 'missing')),
  fifteen0: q8(L.fifteen.start),
  fifteen: q8(w('fifteen', 'fifteen')),
  across: q8(w('fifteen', 'across')),
  sixteen: q8(w('fifteen', 'sixteen')),
  lever0: q8(L.lever.start),
  boilerEngine: q8(w('lever', 'boiler')),
  bridgeLever: q8(w('lever', 'bridge')),
  onelever: q8(w('lever', 'lever')),
  two0: q8(L.two.start),
  twoAny: q8(w('two', 'two')),
  flooded: q8(w('two', 'flooded')),
  four0: q8(L.four.start),
  fourFirst: q8(w('four', 'four')),
  float: q8(w('four', 'float')),
  board0: q8(L.board.start),
  committee: q8(w('board', 'committee')),
  recTwo: q8(w('board', 'two')),
  compulsory: q8(w('board', 'compulsory')),
  wilding0: q8(L.wilding.start),
  wilding: q8(w('wilding', 'Wilding')),
  margin: q8(w('wilding', 'margin')),
  twice: q8(w('wilding', 'twice')),
  end: DUR,
};
writeFileSync(join(here, 'cues.json'), JSON.stringify(cues, null, 1));
writeFileSync(join(here, 'film.json'), JSON.stringify({ duration: DUR, fps: FPS, width: 1920, height: 1080 }));

// SRT for YouTube (verbatim lines, timed to the read)
const ts = (t) => { const ms = Math.round(t * 1000); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
writeFileSync(join(here, 'captions.srt'), VO.lines.map((l, i) => `${i + 1}\n${ts(l.start)} --> ${ts(l.end + 0.2)}\n${l.text}\n`).join('\n'));

// ------------------------------------------------------------------ 3. score
const drums = new Bus(DUR), music = new Bus(DUR), sfx = new Bus(DUR), send = new Bus(DUR);
const pulses = [];
const thump = (t, g = 0.5) => { drums.add(t, kick({ f0: 95, f1: 38, dur: 0.5, punch: 0.9, click: 0.1 }), g); pulses.push(t); };
const boom = (t, big = 1, seed = 1) => {
  drums.add(t, kick({ f0: 140, f1: 30, dur: 1.4 * big, punch: 1.3, click: 0.2 }), 0.9 * big); pulses.push(t);
  const sub = sine((x) => 42 * (1 + 0.6 * Math.exp(-x * 8)), 2.5 * big);
  sfx.add(t, env(sub, (x) => Math.exp(-x * 1.4)), 0.55 * big);
  const n = noise(1.5, 50 + seed); svf(n, (x) => 1400 * Math.exp(-x * 2) + 120, 0.7, 'lp');
  sfx.add(t, env(n, (x) => Math.exp(-x * 3)), 0.5 * big);
  send.add(t, env(noise(0.4, 60 + seed), (x) => Math.exp(-x * 8)), 0.5 * big);
};
const metal = (t, f = 160, g = 0.4, seed = 1) => { // heavy steel door / lever: thud + inharmonic ring
  drums.add(t, kick({ f0: 120, f1: 45, dur: 0.35, punch: 1.1, click: 0.5 }), g * 1.2);
  const ratios = [1, 2.31, 3.76, 5.43], n = Math.round(1.4 * SR), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / SR; let s = 0; ratios.forEach((q, k) => (s += Math.sin(2 * Math.PI * f * q * x) * Math.exp(-x * (3 + k * 3)) / (k + 1))); r[i] = s * Math.min(1, x * 2000); }
  sfx.add(t, r, g * 0.35, (hashf(seed) - 0.5) * 0.6);
  send.add(t, r, g * 0.25);
  const c = noise(0.05, 80 + seed); onePoleHP(c, 2500); sfx.add(t, env(c, (x) => Math.exp(-x * 90)), g * 0.5);
};
function hashf(n) { let a = (n * 2654435761) >>> 0; a ^= a >>> 15; a = Math.imul(a, 2246822519) >>> 0; return (a >>> 0) / 4294967296; }
const tick = (t, g = 0.18, hi = false) => { sfx.add(t, blip(hi ? 3100 : 2400, 0.03, [1, 2.7], 160), g, hi ? 0.3 : -0.3); };
const water = (a, d, g = 0.35, seed = 1) => { // rushing water swell
  const n = noise(d, 300 + seed); svf(n, (x) => 500 + 1800 * Math.sin(Math.min(1, x / d) * Math.PI), 0.6, 'bp'); onePoleLP(n, 4000);
  const n2 = noise(d, 400 + seed); svf(n2, 260, 0.8, 'lp');
  for (let i = 0; i < n.length; i++) { const x = i / SR, e = Math.sin(Math.min(1, x / d) * Math.PI) ** 0.7; n[i] = (n[i] * 0.8 + n2[i] * 1.4) * e; }
  const l = new Float32Array(n), r = new Float32Array(n.length); for (let i = 0; i < n.length; i++) r[i] = n[(i + 37) % n.length];
  sfx.addStereo(a, l, r, g);
};
const whoosh = (t, d = 0.6, g = 0.3, seed = 1) => { const n = noise(d, 500 + seed); svf(n, (x) => 300 + 5000 * Math.sin(Math.min(1, x / d) * Math.PI), 2, 'bp'); sfx.add(t - d * 0.6, env(n, (x) => Math.sin(Math.min(1, x / d) * Math.PI) ** 2), g); };
const pluck = (t, m, g = 0.12, pan = 0) => { const v = blip(mtof(m), 2.2, [1, 2.002, 3.01, 4.2], 2.2); music.add(t, v, g, pan); send.add(t, v, g * 0.6); };
function pad(a, b, notes, g = 0.05, cut = 900, seed = 0) {
  const d = b - a; if (d <= 0) return;
  notes.forEach((m, i) => {
    for (const det of [-0.003, 0.003]) {
      const v = saw(mtof(m) * (1 + det), d, (i * 0.17 + seed) % 1);
      svf(v, (x) => cut * (0.7 + 0.3 * Math.sin(x * 0.4 + i)), 0.9, 'lp');
      env(v, (x) => Math.min(1, x / 1.2) * Math.min(1, (d - x) / 0.8));
      music.add(a, v, g, det < 0 ? -0.5 : 0.5);
      send.add(a, v, g * 0.3);
    }
  });
}
const c = cues;
const beatsIn = (a, b, fn) => { for (let t = Math.ceil(a / B - 1e-6) * B; t < b - 1e-6; t += B) fn(t, Math.round(t / B)); };

// --- cold open: clock ticks, D minor drone
beatsIn(0, c.stoker, (t, k) => tick(t, 0.16, k % 2 === 1));
pad(0, c.worked, [38, 45, 53, 60], 0.045, 700);
beatsIn(c.stoker, c.gone, (t, k) => thump(t, 0.32 + 0.1 * (t > c.pour)));
whoosh(c.stoker, 0.8, 0.25, 1);
water(c.pour - 0.2, c.ran - c.pour + 1.0, 0.32, 1);
boom(c.pour, 0.6, 2);
tick(c.twofeet, 0.2, true); tick(c.twofeet + E8, 0.2, true);
metal(c.doordown, 140, 0.9, 3); boom(c.doordown, 0.5, 4);
// bridge + lever + cascade of doors closing (16ths)
whoosh(c.bridge, 0.7, 0.25, 5);
metal(c.pulled, 220, 0.6, 6);
for (let i = 0; i < 10; i++) metal(c.shut + S16 * (i + 1), 120 + i * 6, 0.32, 10 + i);
// "worked": brief false-comfort F major
pad(c.worked, c.gone0, [41, 48, 53, 57, 60], 0.04, 1200, 0.3);
// "gone": accelerating ticks into a sub boom, then silence
for (let t = c.gone0; t < c.gone - 0.05;) { tick(t, 0.2, false); const p = (t - c.gone0) / (c.gone - c.gone0); t += Math.max(S16 / 2, E8 * (1 - 0.8 * p)); }
pad(c.gone0, c.gone, [38, 44, 50, 56], 0.05, 900, 0.6);
water(c.gone0, c.gone - c.gone0 + 0.3, 0.3, 2);
boom(c.gone, 1.4, 7);
pluck(c.gone + B * 3, 50, 0.16);
// usual / inquiry: sparse piano motif over Bb -> Gm, no pulse
pad(c.usual, c.no, [46, 53, 57, 62], 0.035, 800, 0.1);
const motif = [62, 65, 69, 64, 62, 60, 62, 57];
let mi = 0; beatsIn(c.usual, c.no - B, (t, k) => { if (k % 2 === 0) pluck(t, motif[mi++ % motif.length], 0.11, (mi % 2 ? -0.3 : 0.3)); });
whoosh(c.inquiry, 0.5, 0.2, 8);
[0, 1, 2].forEach((i) => { const n = noise(0.12, 600 + i); onePoleHP(n, 1200); sfx.add(c.inquiry + E8 * (i + 1), env(n, (x) => Math.exp(-x * 30)), 0.25); }); // calendar flips
metal(c.oath, 90, 0.5, 20);
// "He said no."
boom(c.no, 1.0, 9);
pad(c.no, c.fifteen0, [38, 45, 50, 51], 0.04, 600, 0.2);
// weakness: scan sweep + mystery
{ const d = Math.max(0.5, c.century - c.design), v = sine((x) => 600 + 900 * (x / d), d); sfx.add(c.design, env(v, (x) => Math.sin(Math.PI * x / d) * 0.6), 0.08); }
whoosh(c.century, 0.9, 0.3, 11);
boom(c.century, 0.45, 12);
// engineering section: pulse returns, arps
beatsIn(c.fifteen0, c.board0, (t, k) => { thump(t, 0.3); drums.add(t + E8, hat(900 + k), 0.06, 0.3); });
const arp = [50, 53, 57, 60, 57, 53];
let ai = 0; beatsIn(c.fifteen0, c.board0, (t) => { pluck(t, arp[ai % 6] + 12, 0.05, -0.4); pluck(t + E8, arp[(ai + 2) % 6] + 12, 0.04, 0.4); ai++; });
pad(c.fifteen0, c.board0, [38, 45, 50, 53, 57], 0.035, 1100, 0.4);
for (let i = 0; i < 15; i++) metal(c.fifteen + i * S16, 300 + i * 12, 0.16, 30 + i);
for (let i = 0; i < 16; i++) tick(c.sixteen + i * S16, 0.12, i % 2 === 0);
metal(c.onelever, 220, 0.55, 50);
for (let i = 0; i < 10; i++) metal(c.onelever + S16 * (i + 2), 120 + i * 6, 0.25, 60 + i);
for (let k = 0; k < 4; k++) water(c.twoAny + k * B * 0.75, 0.6, 0.14, 10 + k);
water(c.fourFirst - 0.1, 1.6, 0.22, 20);
sfx.add(c.float, bell(1568, 1.6), 0.12); send.add(c.float, bell(1568, 1.6), 0.18);
// Board of Trade: paper + stamp
whoosh(c.board0, 0.6, 0.2, 70);
metal(c.compulsory, 80, 0.7, 71); boom(c.compulsory, 0.5, 72);
pad(c.board0, c.wilding0, [43, 50, 55, 58], 0.035, 800, 0.5);
// Wilding: rising build to "twice", resolve and hold
beatsIn(c.wilding0, c.twice, (t) => thump(t, 0.28));
{ const d = c.twice - c.wilding0, v = saw((x) => mtof(50) * (1 + 0.5 * (x / d)), d); svf(v, (x) => 300 + 3000 * (x / d), 1.4, 'lp'); music.add(c.wilding0, env(v, (x) => (x / d) ** 2), 0.06); }
boom(c.twice, 0.9, 80);
pad(c.twice, DUR, [38, 45, 50, 53, 57, 64], 0.05, 1000, 0.7);
pluck(c.twice + B, 62, 0.12); pluck(c.twice + B * 2, 65, 0.1); pluck(c.twice + B * 3, 69, 0.1);

// ducking of music under the pulses (cheap: track the latest pulse)
pulses.sort((a, b) => a - b);
{ let j = 0; for (let i = 0; i < music.n; i++) { const t = i / SR; while (j + 1 < pulses.length && pulses[j + 1] <= t) j++; const d = pulses[j] !== undefined && t >= pulses[j] ? t - pulses[j] : 9; const g = 1 - 0.35 * Math.exp(-d / 0.12); music.L[i] *= g; music.R[i] *= g; } }
reverb(send, { size: 0.88, damp: 0.25 });
const score = new Bus(DUR);
drums.mixInto(score, 0.9); music.mixInto(score, 1); sfx.mixInto(score, 1); send.mixInto(score, 0.6);
for (let i = 0; i < score.n; i++) { score.L[i] = Math.tanh(score.L[i] * 1.1); score.R[i] = Math.tanh(score.R[i] * 1.1); }
// silence after "gone": the bed drops out for two beats
{ const a = Math.round((c.gone + 0.9) * SR), b = Math.round((c.gone + B * 3) * SR); for (let i = a; i < Math.min(score.n, b + SR * 0.3); i++) { const g = i < b ? 0.25 : 0.25 + 0.75 * ((i - b) / (SR * 0.3)); score.L[i] *= g; score.R[i] *= g; } }
writeWav(join(out, 'score.wav'), score);

// ------------------------------------------------------------------ 4. measured beat grid
console.log(sh('node', [join(root, 'lib/measure-beats.mjs'), join(out, 'score.wav'), join(here, 'beats.json')]).trim());

// ------------------------------------------------------------------ 5. mix (music ducked under narration)
const vb = readFileSync(vo48); let off = 12;
while (vb.toString('ascii', off, off + 4) !== 'data') off += 8 + vb.readUInt32LE(off + 4);
const vn = Math.min(score.n, vb.readUInt32LE(off + 4) / 2);
let sp = 0, vp = 0;
for (let i = 0; i < score.n; i++) sp = Math.max(sp, Math.abs(score.L[i]), Math.abs(score.R[i]));
for (let i = 0; i < vn; i++) vp = Math.max(vp, Math.abs(vb.readInt16LE(off + 8 + i * 2) / 32768));
const envAt = (t) => { const f = t * FPS, i = Math.floor(f); const a = VO.env[i] ?? 0, b2 = VO.env[i + 1] ?? a; return a + (b2 - a) * (f - i); };
const mix = new Bus(DUR);
let g = 1;
for (let i = 0; i < score.n; i++) {
  const t = i / SR, target = 1 - 0.5 * Math.min(1, envAt(t) * 1.6);
  g += (target - g) * (target < g ? 0.003 : 0.0004);
  const v = i < vn ? (vb.readInt16LE(off + 8 + i * 2) / 32768 / (vp || 1)) * 0.95 : 0;
  mix.L[i] = Math.tanh((score.L[i] / sp) * 0.4 * g + v);
  mix.R[i] = Math.tanh((score.R[i] / sp) * 0.4 * g + v);
}
for (let i = 0; i < mix.n; i++) { const f = Math.min(1, (DUR - i / SR) / 1.2); mix.L[i] *= f; mix.R[i] *= f; }
writeWav(join(out, 'audio.wav'), mix);
console.log('wrote out/audio.wav, cues.json, film.json, captions.srt');
