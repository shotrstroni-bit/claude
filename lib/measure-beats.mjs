// Measure the beat grid of a rendered track: onset envelope -> tempo/phase fit -> beats.json
// usage: node lib/measure-beats.mjs <in.wav> <out beats.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
const buf = readFileSync(inPath);
const sr = buf.readUInt32LE(24), ch = buf.readUInt16LE(22);
let off = 12;
while (buf.toString('ascii', off, off + 4) !== 'data') off += 8 + buf.readUInt32LE(off + 4);
const n = buf.readUInt32LE(off + 4) / (2 * ch), base = off + 8;
const mono = new Float32Array(n);
for (let i = 0; i < n; i++) {
  let s = 0;
  for (let c = 0; c < ch; c++) s += buf.readInt16LE(base + (i * ch + c) * 2);
  mono[i] = s / ch / 32768;
}
const duration = n / sr;

// low-band onset envelope: lowpass ~150Hz, rectified energy, positive flux
const hop = 256, frames = Math.floor(n / hop);
const a = 1 - Math.exp((-2 * Math.PI * 150) / sr);
let y = 0;
const energy = new Float32Array(frames);
for (let f = 0; f < frames; f++) {
  let e = 0;
  for (let i = f * hop; i < (f + 1) * hop; i++) { y += a * (mono[i] - y); e += y * y; }
  energy[f] = Math.log(1e-9 + e);
}
const flux = new Float32Array(frames);
for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);
const fps = sr / hop;

// peak pick for reporting
const onsets = [];
for (let f = 2; f < frames - 2; f++) {
  if (flux[f] > 1.5 && flux[f] >= flux[f - 1] && flux[f] > flux[f + 1]) onsets.push(f / fps);
}

// grid fit: maximise flux sampled on the grid
const at = (t) => { const x = t * fps, i = Math.floor(x); return i < 0 || i >= frames - 1 ? 0 : Math.max(flux[i], flux[i + 1]); };
let best = { score: -1 };
for (let bpm = 90; bpm <= 160; bpm += 0.05) {
  const p = 60 / bpm;
  for (let ph = 0; ph < p; ph += 1 / fps) {
    let s = 0;
    for (let t = ph; t < duration; t += p) s += at(t);
    if (s > best.score) best = { score: s, bpm, period: p, phase: ph };
  }
}
// refine phase as median residual of onsets near grid points
const res = onsets
  .map((t) => { const k = Math.round((t - best.phase) / best.period); return t - (best.phase + k * best.period); })
  .filter((r) => Math.abs(r) < best.period * 0.15)
  .sort((x, z) => x - z);
let phase = best.phase + (res.length ? res[Math.floor(res.length / 2)] : 0);
// anchor to the earliest grid point (a beat a few ms before 0 is still beat 0)
phase = ((phase % best.period) + best.period) % best.period;
if (phase > best.period / 2) phase -= best.period;
const beats = [];
for (let t = phase; t < duration - 1e-6; t += best.period) beats.push(+Math.max(0, t).toFixed(4));
const out = {
  source: inPath,
  bpm: +best.bpm.toFixed(2),
  period: +best.period.toFixed(5),
  phase: +phase.toFixed(4),
  duration: +duration.toFixed(4),
  beats,
  onsets: onsets.map((t) => +t.toFixed(4)),
};
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`bpm ${out.bpm}  phase ${out.phase}s  ${beats.length} beats  ${onsets.length} onsets`);
