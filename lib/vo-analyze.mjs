// Analyse a voiceover: line segmentation, word timings, per-frame lip-sync.
// usage: node lib/vo-analyze.mjs <vo.wav (16-bit PCM)> <script.json> <out vo.json> [fps=30] [duration]
import { readFileSync, writeFileSync } from 'node:fs';

const [, , wavPath, scriptPath, outPath, fpsArg, durArg] = process.argv;
const FPS = +(fpsArg || 30);
const script = JSON.parse(readFileSync(scriptPath, 'utf8')).lines;

// ---- read PCM
const buf = readFileSync(wavPath);
const sr = buf.readUInt32LE(24), ch = buf.readUInt16LE(22);
let off = 12;
while (buf.toString('ascii', off, off + 4) !== 'data') off += 8 + buf.readUInt32LE(off + 4);
const n = Math.floor(buf.readUInt32LE(off + 4) / (2 * ch)), base = off + 8;
const x = new Float32Array(n);
for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += buf.readInt16LE(base + (i * ch + c) * 2); x[i] = s / ch / 32768; }
const duration = +(durArg || n / sr);

// ---- band split (one-pole) for mouth shape: lows ~ open vowels, highs ~ sibilants / "ee"
const lo = new Float32Array(n), hi = new Float32Array(n);
{
  const aL = 1 - Math.exp((-2 * Math.PI * 900) / sr), aH = 1 - Math.exp((-2 * Math.PI * 2500) / sr);
  let yL = 0, yH = 0;
  for (let i = 0; i < n; i++) { yL += aL * (x[i] - yL); yH += aH * (x[i] - yH); lo[i] = yL; hi[i] = x[i] - yH; }
}

// ---- 5ms envelope
const hop = Math.round(sr * 0.005), win = Math.round(sr * 0.02), H = Math.floor(n / hop);
const db = new Float32Array(H), hiR = new Float32Array(H);
for (let h = 0; h < H; h++) {
  let e = 0, el = 0, eh = 0;
  const a = Math.max(0, h * hop - win / 2), b = Math.min(n, h * hop + win / 2);
  for (let i = a; i < b; i++) { e += x[i] * x[i]; el += lo[i] * lo[i]; eh += hi[i] * hi[i]; }
  db[h] = 10 * Math.log10(1e-10 + e / (b - a));
  hiR[h] = eh / (el + eh + 1e-10);
}
const sorted = [...db].sort((p, q) => p - q);
const floor = sorted[Math.floor(H * 0.1)], peak = sorted[Math.floor(H * 0.97)];
const thr = floor + 0.3 * (peak - floor);
const voiced = [...db].map((v) => v > thr);

// ---- speech segments (close gaps < 120ms, drop blips < 60ms)
let segs = [];
for (let h = 0; h < H; h++) {
  if (!voiced[h]) continue;
  const s = h; while (h < H && voiced[h]) h++;
  segs.push([s * 0.005, h * 0.005]);
}
segs = segs.reduce((acc, s) => { const l = acc[acc.length - 1]; if (l && s[0] - l[1] < 0.12) l[1] = s[1]; else acc.push([...s]); return acc; }, []).filter((s) => s[1] - s[0] > 0.06);

// ---- group segments into script lines.
// DP over contiguous segment groups: each line's span should match its expected share
// (syllables + punctuation pauses), and line breaks prefer wide gaps.
const N = script.length;
const syl = (w) => Math.max(1, (w.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '').match(/[aeiouy]+/g) || []).length);
const weight = (txt) => txt.split(/\s+/).reduce((a, w) => a + syl(w), 0) + (txt.match(/[.,!?]/g) || []).length * 1.2;
let lines;
if (segs.length >= N) {
  const S = segs.length, span = segs[S - 1][1] - segs[0][0];
  const Wt = script.map((l) => weight(l.text)), WT = Wt.reduce((a, b) => a + b, 0);
  const gapsAll = segs.slice(1).map((sg, i) => sg[0] - segs[i][1]);
  const meanGap = gapsAll.reduce((a, b) => a + b, 0) / Math.max(1, gapsAll.length);
  const E = Wt.map((w) => (w / WT) * span * 0.88);
  const cost = (k, a, b) => { const d = segs[b][1] - segs[a][0]; return ((d - E[k]) / E[k]) ** 2; };
  // dp[k][j] = best cost for first k lines using segs[0..j-1]
  const dp = Array.from({ length: N + 1 }, () => new Array(S + 1).fill(Infinity)), bk = Array.from({ length: N + 1 }, () => new Array(S + 1).fill(-1));
  dp[0][0] = 0;
  for (let k = 1; k <= N; k++) for (let j = k; j <= S; j++) for (let i = k - 1; i < j; i++) {
    if (dp[k - 1][i] === Infinity) continue;
    const bonus = i > 0 ? 0.6 * Math.min(3, gapsAll[i - 1] / meanGap) : 0;
    const c = dp[k - 1][i] + cost(k - 1, i, j - 1) - bonus;
    if (c < dp[k][j]) { dp[k][j] = c; bk[k][j] = i; }
  }
  const cuts = [S];
  for (let k = N, j = S; k > 0; k--) { j = bk[k][j]; cuts.unshift(j); }
  lines = script.map((l, k) => ({ ...l, start: segs[cuts[k]][0], end: segs[cuts[k + 1] - 1][1], segs: segs.slice(cuts[k], cuts[k + 1]) }));
} else {
  // fallback: proportional to text weight across the voiced span
  const s0 = segs[0]?.[0] ?? 0, s1 = segs[segs.length - 1]?.[1] ?? duration, L = script.reduce((a, l) => a + weight(l.text), 0);
  let acc = 0;
  lines = script.map((l) => { const a = s0 + (acc / L) * (s1 - s0); acc += weight(l.text); return { ...l, start: a, end: s0 + (acc / L) * (s1 - s0), segs: [] }; });
  console.warn(`only ${segs.length} speech segments for ${N} lines; used proportional fallback`);
}

// ---- words: syllable-weighted split of each line, boundaries snapped to energy dips
const dbAt = (t) => db[Math.max(0, Math.min(H - 1, Math.round(t / 0.005)))];
for (const l of lines) {
  const words = l.text.split(/\s+/);
  const w = words.map(syl), W = w.reduce((a, b) => a + b, 0);
  // speech time inside the line, excluding internal pauses
  const parts = l.segs.length ? l.segs : [[l.start, l.end]];
  const speech = parts.reduce((a, s) => a + s[1] - s[0], 0);
  const timeAt = (frac) => { let r = frac * speech; for (const s of parts) { if (r <= s[1] - s[0]) return s[0] + r; r -= s[1] - s[0]; } return l.end; };
  let acc = 0;
  const starts = w.map((k) => { const f = acc / W; acc += k; return timeAt(f); });
  for (let i = 1; i < starts.length; i++) {
    let best = starts[i], bv = dbAt(best);
    for (let t = starts[i] - 0.08; t <= starts[i] + 0.08; t += 0.005) if (t > starts[i - 1] + 0.06 && dbAt(t) < bv) { bv = dbAt(t); best = t; }
    starts[i] = best;
  }
  l.words = words.map((word, i) => ({ w: word, start: +starts[i].toFixed(3), end: +(i + 1 < words.length ? starts[i + 1] : l.end).toFixed(3) }));
  l.start = +l.start.toFixed(3); l.end = +l.end.toFixed(3);
  delete l.segs;
}

// ---- per-frame mouth: open (0..1) and wide (0..1), attack/release smoothed offline
const frames = Math.ceil(duration * FPS);
const open = [], wide = [], env = [];
let o = 0, wd = 0.5;
for (let f = 0; f < frames; f++) {
  const t = f / FPS;
  let v = -200, hr = 0, c = 0;
  for (let tt = t - 0.015; tt <= t + 0.015; tt += 0.005) { const h = Math.round(tt / 0.005); if (h >= 0 && h < H) { v = Math.max(v, db[h]); hr += hiR[h]; c++; } }
  // level x syllabic modulation: the jaw closes between syllables instead of hanging open
  let mn = Infinity, mx = -Infinity;
  for (let tt = t - 0.09; tt <= t + 0.09; tt += 0.005) { const h = Math.round(tt / 0.005); if (h >= 0 && h < H) { mn = Math.min(mn, db[h]); mx = Math.max(mx, db[h]); } }
  const level = Math.max(0, Math.min(1, (v - thr) / (peak - thr)));
  const syllabic = mx - mn > 1 ? Math.max(0, Math.min(1, (v - mn) / (mx - mn))) : 1;
  const target = Math.pow(level, 0.8) * (0.3 + 0.7 * syllabic);
  o += (target - o) * (target > o ? 0.75 : 0.45);
  wd += ((c ? hr / c : 0.5) * 2.2 - wd) * 0.5;
  open.push(+o.toFixed(3)); wide.push(+Math.max(0, Math.min(1, wd)).toFixed(3));
  env.push(+Math.max(0, Math.min(1, (v - floor) / (peak - floor))).toFixed(3));
}

writeFileSync(outPath, JSON.stringify({ source: wavPath, duration, fps: FPS, lines, open, wide, env }, null, 0));
for (const l of lines) console.log(`${l.start.toFixed(2)}–${l.end.toFixed(2)}  ${l.text}`);
