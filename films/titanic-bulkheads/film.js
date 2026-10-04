// Titanic — "The walls weren't the problem". 16:9 documentary explainer.
// Render contract: window.seek(t) paints frame t. No transitions, no timers,
// no state carried between frames. Seeded noise only (mulberry32).
'use strict';

// ============================================================================ utils
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const P = (t, a, d) => clamp((t - a) / d);
const oCub = (p) => 1 - Math.pow(1 - p, 3);
const oQuint = (p) => 1 - Math.pow(1 - p, 5);
const iCub = (p) => p * p * p;
const iQuad = (p) => p * p;
const ioCub = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const ioSine = (p) => 0.5 - 0.5 * Math.cos(Math.PI * p);
const spring = (p, k = 6, w = 13) => (p >= 1 ? 1 : p <= 0 ? 0 : 1 - Math.exp(-k * p) * Math.cos(w * p));
const bounce = (p) => { const n = 7.5625, d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75; if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375; return n * (p -= 2.625 / d) * p + 0.984375; };
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (n) => mulberry32((n * 2654435761) >>> 0)();
const NS = 'http://www.w3.org/2000/svg';
function S(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function E(tag, cls, html, parent, css) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (css) e.style.cssText = css; if (parent) parent.appendChild(e); return e; }
const set = (e, a) => { for (const k in a) e.setAttribute(k, typeof a[k] === 'number' ? +a[k].toFixed(3) : a[k]); };
const show = (e, on) => { e.style.display = on ? '' : 'none'; };
const rise = (el, p, dist = 110) => { el.firstElementChild.style.transform = `translateY(${((1 - oQuint(p)) * dist).toFixed(2)}%)`; el.style.visibility = p > 0 ? 'visible' : 'hidden'; };
const W = 1920, H = 1080, FPS = 30;
const NSL = 'vector-effect:non-scaling-stroke';
const COL = { night: '#0A111B', line: '#D9D2C3', dim: '#6C7A8A', steel: '#24344A', accent: '#E9A23B', water: '#3D7FB8', waterHi: '#8FC3EC', hull: '#0D0F13', cut: '#0F1B2A' };

// ============================================================================ data + timing
let BEATS = [], C = {}, VO = {}, DUR = 100;
const Tm = (sec) => { // composed-grid seconds -> measured beat grid
  const per = 60 / (C.bpm || 96), k = sec / per, i = Math.floor(k), f = k - i, n = BEATS.length;
  if (i >= n - 1) return BEATS[n - 1] + (k - (n - 1)) * per;
  return BEATS[i] + (BEATS[i + 1] - BEATS[i]) * f;
};
let Q = {}; // resolved cue times
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const wordAt = (id, w, n = 0) => VO.lines.find((l) => l.id === id).words.filter((x) => norm(x.w) === norm(w))[n].start;
const lineOf = (id) => VO.lines.find((l) => l.id === id);

// keyframed value: keys = [[time, duration, {props}]], each blends from the running value
function keyed(t, def, keys, ease = ioCub) {
  const v = { ...def };
  for (const [kt, kd, kv] of keys) { if (t < kt) break; const p = ease(P(t, kt, kd)); for (const k in kv) v[k] = lerp(v[k], kv[k], p); }
  return v;
}

// ============================================================================ ship geometry (feet; SVG y = -height)
const BH = [46, 92, 142, 191, 245, 302, 359, 416, 473, 527, 596, 653, 701, 750, 810]; // 15 bulkheads A–P
const BL = 'ABCDEFGHJKLMNOP';
const EDGES = [0, ...BH, 882];
const TOP = BH.map((x, i) => (i < 2 || i === 14 ? 50 : 41));
const DOORS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // bulkheads with doors in boiler/engine rooms
const DOOR_E = 4;
const sheer = (x) => 64 + 7 * ((x - 440) / 440) ** 2;
const WL = 34; // load waterline
const PIV = [441, -WL];
function hullD() {
  let d = `M0 ${-sheer(0)} L3 -40 Q5 -6 16 0 L828 0 Q848 0 851 -12 L855 -27 Q868 -34 885 -44 L881 ${-sheer(881)}`;
  for (let x = 870; x >= 0; x -= 10) d += ` L${x} ${(-sheer(x)).toFixed(2)}`;
  return d + ' Z';
}
const FUN = [262, 378, 494, 610];
const SUPER = [[130, 760, 64, 73], [170, 330, 73, 82], [360, 470, 73, 82], [500, 580, 73, 82], [610, 720, 73, 82], [182, 202, 82, 90]];

// ============================================================================ build
const R = {}; // element refs
function build() {
  // ---------------------------------------------------------------- sky
  {
    const sky = $('sky'), rnd = mulberry32(17);
    S('rect', { width: 1920, height: 1080, fill: COL.night }, sky);
    const g = S('g', {}, sky);
    R.stars = [];
    for (let i = 0; i < 260; i++) {
      const c = S('circle', { cx: rnd() * 1920, cy: rnd() * 760, r: (rnd() ** 3 * 1.8 + 0.4).toFixed(2), fill: '#E8E4DA' }, g);
      R.stars.push({ c, ph: rnd() * 6.28, a: 0.25 + rnd() * 0.6 });
    }
  }
  // ---------------------------------------------------------------- world (camera = viewBox)
  const wd = $('world');
  const defs = S('defs', {}, wd);
  const hc = S('clipPath', { id: 'hullClip' }, defs); S('path', { d: hullD() }, hc);
  const ec = S('clipPath', { id: 'extClip' }, defs); R.extRect = S('rect', { x: -100, y: -400, width: 1200, height: 800 }, ec);
  const cc = S('clipPath', { id: 'cutClip' }, defs); R.cutRect = S('rect', { x: -100, y: -400, width: 0, height: 800 }, cc);
  const sf = S('clipPath', { id: 'seaFrontClip' }, defs); R.sfRect = S('rect', { x: -5000, y: -400, width: 12000, height: 6000 }, sf);
  // sea (back)
  R.seaBack = S('g', {}, wd);
  S('rect', { x: -6000, y: -WL, width: 14000, height: 6000, fill: '#0B1826' }, R.seaBack);
  R.wavesB = [0, 1, 2, 3, 4].map((i) => S('path', { fill: 'none', stroke: '#1E3550', 'stroke-width': 1.2, style: NSL }, R.seaBack));
  // ship
  R.ship = S('g', {}, wd);
  buildExterior(S('g', { 'clip-path': 'url(#extClip)' }, R.ship));
  buildCutaway(S('g', { 'clip-path': 'url(#cutClip)' }, R.ship));
  R.wipe = S('line', { y1: -230, y2: 20, stroke: COL.accent, 'stroke-width': 2, style: NSL }, R.ship);
  // sea (front) — covers the hull below the waterline in exterior shots and the sinking
  R.seaFront = S('g', { 'clip-path': 'url(#seaFrontClip)' }, wd);
  S('rect', { x: -6000, y: -WL, width: 14000, height: 6000, fill: '#0B1826' }, R.seaFront);
  R.wavesF = [0, 1, 2].map(() => S('path', { fill: 'none', stroke: '#2B4766', 'stroke-width': 1.4, style: NSL }, R.seaFront));
  R.wake = S('g', {}, wd);
  R.wakeP = [0, 1, 2, 3].map((i) => S('path', { fill: 'none', stroke: '#9FB4C8', 'stroke-width': i ? 1.2 : 2, opacity: i ? 0.35 : 0.6, 'stroke-dasharray': i ? '18 14' : 'none', style: NSL }, R.wake));
  R.surf = S('line', { x1: -6000, x2: 8000, y1: -WL, y2: -WL, stroke: '#4A6A8C', 'stroke-width': 1.6, style: NSL }, wd);

  buildOverlays();
  buildScenes();
}

function buildExterior(g) {
  const rnd = mulberry32(5);
  // masts + rigging behind
  S('path', { d: `M150 -71 L150 -210 M800 -71 L800 -200 M2 ${-sheer(0)} L150 -205 L800 -195 L880 ${-sheer(880)}`, stroke: '#4B5563', 'stroke-width': 1, fill: 'none', style: NSL }, g);
  // funnels
  FUN.forEach((x) => {
    S('path', { d: `M${x - 11} -82 L${x + 11} -82 L${x + 23} -172 L${x + 1} -172 Z`, fill: '#C99A5B' }, g);
    S('path', { d: `M${x + 9.6} -160 L${x + 23} -172 L${x + 1} -172 L${x - 0.6} -160 Z`, fill: '#141414' }, g);
  });
  // superstructure
  SUPER.forEach(([a, b, y0, y1]) => S('rect', { x: a, y: -y1, width: b - a, height: y1 - y0, fill: '#DCD6CA' }, g));
  for (let x = 210; x < 700; x += 15) if (x < 335 || x > 515) S('rect', { x, y: -86, width: 10, height: 3, rx: 1.4, fill: '#EFEAE0' }, g);
  // hull
  S('path', { d: hullD(), fill: COL.hull, stroke: '#2B313B', 'stroke-width': 1, style: NSL }, g);
  S('rect', { x: -10, y: -WL, width: 910, height: 50, fill: '#4E2621', 'clip-path': 'url(#hullClip)' }, g);
  let gl = 'M2 -' + (sheer(2) - 2.5).toFixed(2); for (let x = 10; x <= 878; x += 10) gl += ` L${x} ${(-(sheer(x) - 2.5)).toFixed(2)}`;
  S('path', { d: gl, stroke: COL.accent, 'stroke-width': 1, fill: 'none', opacity: 0.6, style: NSL }, g);
  // lit portholes + windows (warm)
  for (const [y, step, x0, x1] of [[-57, 7, 20, 860], [-49, 7, 24, 856], [-41, 9, 40, 840], [-69, 6, 140, 750], [-78, 7, 180, 710]]) {
    for (let x = x0; x <= x1; x += step) if (rnd() < 0.62) S('circle', { cx: x + rnd() * 2, cy: y, r: 0.9, fill: '#F2C46D', opacity: (0.45 + rnd() * 0.55).toFixed(2) }, g);
  }
}

function buildCutaway(g) {
  R.cut = g;
  const hullFill = S('path', { d: hullD(), fill: COL.cut }, g);
  void hullFill;
  // superstructure + funnels in line art
  SUPER.forEach(([a, b, y0, y1]) => S('rect', { x: a, y: -y1, width: b - a, height: y1 - y0, fill: COL.cut, stroke: COL.dim, 'stroke-width': 1, style: NSL }, g));
  FUN.forEach((x) => S('path', { d: `M${x - 11} -82 L${x + 11} -82 L${x + 23} -172 L${x + 1} -172 Z`, fill: 'none', stroke: COL.dim, 'stroke-width': 1, style: NSL }, g));
  S('path', { d: 'M150 -71 L150 -210 M800 -71 L800 -200', stroke: '#3A4A5E', 'stroke-width': 1, fill: 'none', style: NSL }, g);
  // decks (clipped to hull)
  const decks = S('g', { 'clip-path': 'url(#hullClip)' }, g);
  [5, 24, 32, 41, 50, 59].forEach((h, i) => S('line', { x1: -10, x2: 900, y1: -h, y2: -h, stroke: i === 0 ? '#3E5068' : '#22324A', 'stroke-width': i === 0 ? 1.6 : 1, style: NSL }, decks));
  // uptakes boilers -> funnels
  [[218, 262], [274, 262], [330, 378], [387, 378], [444, 494], [500, 494]].forEach(([bx, fx]) => S('path', { d: `M${bx} -21 L${bx} -60 L${fx} -82`, stroke: '#2A3C54', 'stroke-width': 1, 'stroke-dasharray': '4 4', fill: 'none', style: NSL }, g));
  // boilers (double-ended in BR6–BR2, single-ended in BR1) with furnace mouths
  for (let k = 4; k <= 9; k++) {
    const a = EDGES[k] + 7, b = EDGES[k + 1] - 7, single = k === 9;
    const x0 = single ? a : a, x1 = single ? (a + b) / 2 + 4 : b;
    S('rect', { x: x0, y: -21, width: x1 - x0, height: 16, rx: 6, fill: '#16253A', stroke: COL.dim, 'stroke-width': 1, style: NSL }, g);
    [x0 + 1.5, ...(single ? [] : [x1 - 4.5])].forEach((fx) => [-9, -14].forEach((fy) => S('rect', { x: fx, y: fy, width: 3, height: 2.2, rx: 0.6, fill: COL.accent, opacity: 0.55 }, g)));
  }
  // engines
  [[540, 548], [566, 574]].forEach(([a, b]) => { S('rect', { x: a, y: -38, width: b - a, height: 33, fill: '#16253A', stroke: COL.dim, 'stroke-width': 1, style: NSL }, g); S('rect', { x: a - 1, y: -42, width: b - a + 2, height: 4, fill: '#1C2E46', stroke: COL.dim, 'stroke-width': 1, style: NSL }, g); });
  S('ellipse', { cx: 625, cy: -15, rx: 18, ry: 9, fill: '#16253A', stroke: COL.dim, 'stroke-width': 1, style: NSL }, g);
  [668, 684].forEach((x) => S('circle', { cx: x, cy: -11, r: 5, fill: '#16253A', stroke: COL.dim, 'stroke-width': 1, style: NSL }, g));
  // water per compartment (behind bulkheads, in front of machinery)
  const wg = S('g', { 'clip-path': 'url(#hullClip)' }, g);
  R.water = EDGES.slice(0, 16).map(() => S('rect', { fill: COL.water, opacity: 0.82 }, wg));
  R.waterTop = EDGES.slice(0, 16).map(() => S('path', { fill: 'none', stroke: COL.waterHi, 'stroke-width': 1.6, style: NSL }, wg));
  // jets through the breach (BR6, ~2 ft above the floor plates)
  R.jets = S('g', {}, g);
  R.jetPaths = [];
  for (let i = 0; i < 9; i++) { const x = 199 + i * 4.6; R.jetPaths.push(S('path', { d: `M${x} -7 Q${x + 2.6} -7.6 ${x + 4.4} -5`, fill: 'none', stroke: COL.waterHi, 'stroke-width': 0.42, 'stroke-linecap': 'round', 'stroke-dasharray': '0.9 0.7' }, R.jets)); }
  R.breach = S('path', { d: 'M197 -7 L203 -6.8 L208 -7.2 L214 -6.9 L220 -7.1 L227 -6.8 L233 -7.2 L240 -7', stroke: COL.line, 'stroke-width': 1.4, fill: 'none', style: NSL }, R.jets);
  // wires bridge -> doors
  R.wire = S('path', { d: `M192 -86 L192 -7 L${BH[12]} -7`, fill: 'none', stroke: COL.accent, 'stroke-width': 2, style: NSL }, g);
  R.wireLen = 79 + (BH[12] - 192);
  // bulkheads (doorways left open at the bottom where there is a door)
  R.bh = BH.map((x, i) => S('line', { x1: x, x2: x, y1: DOORS.includes(i) ? -12 : -5, y2: -TOP[i], stroke: COL.line, 'stroke-width': 2.2, style: NSL }, g));
  R.door = DOORS.map((i) => S('rect', { x: BH[i] - 1.6, y: -19, width: 3.2, height: 7, fill: COL.cut, stroke: COL.line, 'stroke-width': 1.2, style: NSL }, g));
  // hull outline on top
  S('path', { d: hullD(), fill: 'none', stroke: COL.line, 'stroke-width': 1.8, style: NSL }, g);
  // bridge: wheelhouse windows + rail
  for (let x = 184; x <= 199; x += 3) S('rect', { x, y: -88.6, width: 1.8, height: 1.7, rx: 0.3, fill: COL.accent, opacity: 0.55 }, g);
  S('path', { d: 'M164 -84.6 L182 -84.6 ' + [164, 166, 168, 170, 172, 174, 176, 178, 180].map((x) => `M${x} -82 L${x} -84.6`).join(' '), stroke: COL.dim, 'stroke-width': 1, fill: 'none', style: NSL }, g);
  // people
  R.barrett = figure(g, false);
  R.murdoch = figure(g, true);
}

function figure(parent, officer) {
  const g = S('g', {}, parent);
  const col = COL.line;
  const legs = [0, 1].map(() => S('line', { x1: 0, y1: -2.9, x2: 0, y2: 0, stroke: col, 'stroke-width': 0.46, 'stroke-linecap': 'round' }, g));
  const arms = [0, 1].map(() => S('line', { x1: 0, y1: -4.55, x2: 0, y2: -3.0, stroke: col, 'stroke-width': 0.36, 'stroke-linecap': 'round' }, g));
  S('rect', { x: -0.55, y: -4.9, width: 1.1, height: 2.1, rx: 0.4, fill: col }, g);
  S('circle', { cx: 0, cy: -5.45, r: 0.5, fill: col }, g);
  if (officer) { S('rect', { x: -0.55, y: -6.05, width: 1.1, height: 0.42, rx: 0.12, fill: col }, g); S('rect', { x: 0.1, y: -5.72, width: 0.75, height: 0.16, fill: col }, g); }
  return { g, legs, arms };
}
function poseFigure(f, x, y, run, face = 1) { // run: phase in radians or null for idle
  set(f.g, { transform: `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${face} 1)` });
  const sw = run == null ? 0 : Math.sin(run), lift = run == null ? 0 : Math.abs(Math.cos(run)) * 0.25;
  f.legs.forEach((l, i) => { const a = (i ? 1 : -1) * sw * 0.55; set(l, { x2: Math.sin(a) * 2.9, y2: -2.9 + Math.cos(a) * 2.9 - lift }); });
  f.arms.forEach((l, i) => { const a = (i ? -1 : 1) * sw * 0.7 + 0.12; set(l, { x2: Math.sin(a) * 1.6, y2: -4.55 + Math.cos(a) * 1.6 }); });
}

// ============================================================================ overlays (screen space)
function buildOverlays() {
  const ov = $('ov'), lab = $('labels');
  const mkLabel = (id, k, n, s) => {
    const d = E('div', 'lbl', `${k ? `<div class="mask"><span class="k">${k}</span></div>` : ''}${n ? `<div class="mask"><span class="n">${n}</span></div>` : ''}${s ? `<div class="mask"><span class="s">${s}</span></div>` : ''}`, lab);
    const line = S('path', { fill: 'none', stroke: COL.accent, 'stroke-width': 1.6 }, ov);
    const dot = S('circle', { r: 5, fill: COL.accent }, ov);
    R[id] = { d, line, dot };
  };
  mkLabel('lBarrett', 'LEADING STOKER', 'Frederick Barrett');
  mkLabel('lBR6', 'BOILER ROOM No. 6', null, 'FORWARD-MOST BOILER ROOM');
  mkLabel('lSide', "SHIP'S SIDE", null, 'HULL PLATING');
  mkLabel('lTwo', 'WATER CAME IN', '≈ 2 ft up', 'ABOVE THE FLOOR PLATES');
  mkLabel('lBR5', 'BOILER ROOM No. 5');
  mkLabel('lDoor', 'WATERTIGHT DOOR', null, 'DROPS INTO PLACE');
  mkLabel('lMurdoch', 'FIRST OFFICER', 'William Murdoch');
  mkLabel('lBridge', 'THE BRIDGE');
  mkLabel('lBoilers', 'BOILER ROOMS');
  mkLabel('lEngines', 'ENGINE ROOMS');
  mkLabel('lFlood', 'FLOODED', null, 'STILL AFLOAT ✓');
  // dimension line for "two feet"
  R.dim = S('g', {}, ov);
  R.dimLine = S('path', { fill: 'none', stroke: COL.accent, 'stroke-width': 4, 'stroke-linecap': 'round' }, R.dim);
  // door check badges
  R.checks = DOORS.map(() => { const g = S('g', {}, ov); S('circle', { r: 15, fill: COL.accent }, g); S('path', { d: 'M-6 0 L-1.5 4.5 L6.5 -4.5', fill: 'none', stroke: COL.night, 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g); return g; });
  // compartment numbers (shipyard calculation)
  R.compNums = EDGES.slice(0, 16).map((x, k) => { const tx = S('text', { 'text-anchor': 'middle', fill: COL.line, 'font-family': 'JB', 'font-weight': 800, 'font-size': 22 }, ov); tx.textContent = k + 1; return tx; });
  // flood brackets
  R.bracket = S('path', { fill: 'none', stroke: COL.accent, 'stroke-width': 2.5 }, ov);
  // scan band + reticles (weakness)
  R.scan = S('g', {}, ov);
  R.scanRect = S('rect', { y: 0, height: 1080, width: 140, fill: COL.accent, opacity: 0.08 }, R.scan);
  R.scanEdge = S('line', { y1: 0, y2: 1080, stroke: COL.accent, 'stroke-width': 1.5 }, R.scan);
  R.ret = S('g', {}, ov);
  R.retPath = S('path', { fill: 'none', stroke: COL.accent, 'stroke-width': 3 }, R.ret);
  R.retQ = S('text', { fill: COL.accent, 'font-family': 'FR', 'font-weight': 900, 'font-size': 64 }, R.ret); R.retQ.textContent = '?';
  // headline block
  R.head = E('div', 'L', '<div class="mask"><span class="kick" id="hk"></span></div><div class="mask" style="margin-top:14px"><span class="hd" id="hh"></span></div>', lab, 'left:120px;top:96px');
}

// ============================================================================ set-piece scenes (HTML)
function buildScenes() {
  const sc = $('scenes');
  // ---- clock + date (cold open, time-lapse)
  R.clock = E('div', 'L', '', sc, 'width:300px;height:300px');
  const cs = S('svg', { viewBox: '-150 -150 300 300', width: 300, height: 300 }, R.clock);
  S('circle', { r: 140, fill: 'rgba(10,17,27,.75)', stroke: COL.line, 'stroke-width': 3 }, cs);
  for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, r1 = i % 5 ? 126 : 112; S('line', { x1: Math.sin(a) * r1, y1: -Math.cos(a) * r1, x2: Math.sin(a) * 132, y2: -Math.cos(a) * 132, stroke: i % 5 ? COL.dim : COL.line, 'stroke-width': i % 5 ? 2 : 4 }, cs); }
  R.hHand = S('line', { x1: 0, y1: 14, x2: 0, y2: -70, stroke: COL.line, 'stroke-width': 9, 'stroke-linecap': 'round' }, cs);
  R.mHand = S('line', { x1: 0, y1: 18, x2: 0, y2: -104, stroke: COL.line, 'stroke-width': 6, 'stroke-linecap': 'round' }, cs);
  R.sHand = S('line', { x1: 0, y1: 24, x2: 0, y2: -118, stroke: COL.accent, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, cs);
  S('circle', { r: 8, fill: COL.accent }, cs);
  R.clockTxt = E('div', 'mono', '', R.clock, 'position:absolute;left:0;width:300px;top:316px;text-align:center;font-size:40px;font-weight:800;letter-spacing:.06em;color:#D9D2C3');
  R.clockSub = E('div', 'mono', '', R.clock, 'position:absolute;left:0;width:300px;top:370px;text-align:center;font-size:24px;font-weight:800;letter-spacing:.16em;color:#E9A23B');
  R.date = E('div', 'L', `<div class="mask"><span class="kick">NORTH ATLANTIC · SHIP'S TIME</span></div>
    <div class="mask" style="margin-top:18px"><span style="font:900 132px/1 FR;letter-spacing:-0.03em;white-space:nowrap">14 April 1912</span></div>
    <div class="mask" style="margin-top:16px"><span class="mono" style="font-size:40px;font-weight:800;letter-spacing:.08em">11:40 PM</span></div>`, sc, 'left:520px;top:150px');

  // ---- lever panel (CSS 3D)
  R.lever = E('div', 'L', `<div id="lvBody" style="position:absolute;inset:0;border-radius:18px;background:linear-gradient(160deg,#2A3646,#141C27);border:2px solid #3B4A5E;transform-style:preserve-3d">
      <div class="kick" style="position:absolute;left:34px;top:34px;font-size:22px">WATERTIGHT DOORS</div>
      <div class="mono" style="position:absolute;left:34px;top:70px;font-size:20px;font-weight:700;letter-spacing:.12em;color:#8A97A8">BRIDGE CONTROL</div>
      <div class="mono" style="position:absolute;left:34px;top:150px;font-size:24px;font-weight:800;letter-spacing:.14em;color:#8A97A8">OPEN</div>
      <div class="mono" style="position:absolute;left:34px;bottom:46px;font-size:24px;font-weight:800;letter-spacing:.14em;color:#E9A23B">CLOSE</div>
      <div style="position:absolute;left:228px;top:110px;width:26px;height:300px;border-radius:13px;background:#0A0F16;border:2px solid #3B4A5E"></div>
      <div id="lvArm" style="position:absolute;left:204px;top:254px;width:74px;height:74px;transform-origin:37px 37px;transform-style:preserve-3d">
        <div style="position:absolute;left:28px;top:-150px;width:18px;height:190px;border-radius:9px;background:linear-gradient(90deg,#8A6420,#E9B55A 45%,#9A7026)"></div>
        <div style="position:absolute;left:4px;top:-196px;width:66px;height:66px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#F6D08A,#B07A22 60%,#6A4612)"></div>
        <div style="position:absolute;left:0;top:0;width:74px;height:74px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#5E6E84,#1E2834)"></div>
      </div></div>`, sc, 'left:1380px;top:250px;width:420px;height:560px;transform-origin:50% 50%');

  // ---- "usual explanation" tray
  R.tray = E('div', 'full', '', sc);
  R.traySvg = S('svg', { viewBox: '0 0 1920 1080', width: 1920, height: 1080 }, R.tray);
  R.trayWater = [0, 1, 2, 3, 4, 5].map(() => S('path', { fill: COL.water, opacity: 0.85 }, R.traySvg));
  R.traySpill = [0, 1, 2, 3, 4].map(() => S('path', { fill: 'none', stroke: COL.waterHi, 'stroke-width': 10, 'stroke-linecap': 'round' }, R.traySvg));
  R.trayBox = S('path', { fill: 'none', stroke: COL.line, 'stroke-width': 5, 'stroke-linejoin': 'round' }, R.traySvg);
  R.trayTops = S('g', {}, R.traySvg);
  R.trayTopMarks = [1, 2, 3, 4, 5].map(() => S('circle', { r: 11, fill: COL.accent }, R.trayTops));
  R.traySea = S('path', { fill: 'none', stroke: '#4A6A8C', 'stroke-width': 3, 'stroke-dasharray': '14 10' }, R.traySvg);
  R.trayQ = E('div', 'L', '<span style="font:900 150px/1 FR;color:#E9A23B">?</span>', R.tray);

  // ---- inquiry: calendar, witness, papers, stamp
  R.inq = E('div', 'full', '', sc);
  R.inqHead = E('div', 'L', `<div class="mask"><span class="kick">LESS THAN TWO MONTHS LATER</span></div>
     <div class="mask" style="margin-top:16px"><span class="hd" style="font-size:72px">British Wreck Commissioner’s Inquiry</span></div>
     <div class="mask" style="margin-top:12px"><span class="mono" style="font-size:26px;font-weight:800;letter-spacing:.14em;color:#8A97A8">LONDON · 1912</span></div>`, R.inq, 'left:120px;top:96px');
  R.cal = E('div', 'L', '', R.inq, 'left:150px;top:380px;width:360px;height:420px;perspective:1400px');
  R.calPages = ['APRIL', 'MAY', 'JUNE'].map((m, i) => E('div', 'paper', `<div style="height:96px;background:#B8432F;border-radius:6px 6px 0 0;color:#F6EFE2;font:800 30px/96px JB;letter-spacing:.2em;text-align:center">1912</div>
      <div style="font:900 96px/1 FR;text-align:center;margin-top:70px;letter-spacing:-0.02em">${m}</div>`, R.cal, `position:absolute;inset:0;transform-origin:50% 0;z-index:${3 - i};backface-visibility:hidden`));
  R.wit = E('div', 'L', `<svg width="360" height="360" viewBox="0 0 360 360"><circle cx="180" cy="180" r="176" fill="#141E2B" stroke="#3B4A5E" stroke-width="4"/>
      <clipPath id="witc"><circle cx="180" cy="180" r="172"/></clipPath><g clip-path="url(#witc)" fill="#D9D2C3">
      <circle cx="180" cy="140" r="62"/><path d="M60 360 Q66 236 180 222 Q294 236 300 360 Z"/><path d="M180 222 L160 300 L180 330 L200 300 Z" fill="#141E2B"/></g></svg>
      <div style="margin-top:26px"><div class="mask"><span class="kick">HARLAND &amp; WOLFF</span></div><div class="mask" style="margin-top:10px"><span style="font:700 48px/1.05 FR">Naval architect</span></div>
      <div class="mask" style="margin-top:10px"><span class="mono" style="font-size:22px;font-weight:700;letter-spacing:.1em;color:#8A97A8">PRESENTED THE FLOODING CALCULATIONS</span></div></div>`, R.inq, 'left:150px;top:330px');
  R.papers = [0, 1, 2].map((i) => {
    const p = E('div', 'paper', `<div class="mono" style="position:absolute;left:30px;top:24px;font-size:20px;font-weight:800;letter-spacing:.14em;color:#6B5A3E">FLOODING CALCULATIONS · SHEET ${i + 1}</div>
      <svg style="position:absolute;left:30px;top:70px" width="500" height="300" viewBox="0 0 500 300">${grid()}<path d="${curve(i)}" fill="none" stroke="#B8432F" stroke-width="4"/><path d="M0 ${200 - i * 30} L500 ${200 - i * 30}" stroke="#3B5E85" stroke-width="3" stroke-dasharray="10 8"/></svg>`, R.inq, 'position:absolute;width:560px;height:400px;transform-origin:50% 100%');
    return p;
  });
  R.oath = E('div', 'L', `<div style="padding:18px 34px;border:8px solid #E9A23B;border-radius:12px;color:#E9A23B;font:900 96px/1 FR;letter-spacing:.02em;white-space:nowrap;">UNDER OATH</div>`, R.inq, 'left:1000px;top:560px;transform-origin:50% 50%');

  // ---- "No."
  R.no = E('div', 'full', '<div id="noTxt" style="position:absolute;left:150px;top:200px;font:900 520px/1 FR;letter-spacing:-0.04em;color:#E9A23B;transform-origin:0 80%">No.</div>', sc, 'background:#05080C');

  // ---- mystery ship
  R.myst = E('div', 'full', '', sc, 'background:#070C13');
  R.mystSvg = S('svg', { viewBox: '0 0 1920 1080', width: 1920, height: 1080 }, R.myst);
  const md = S('defs', {}, R.mystSvg);
  const lg = S('linearGradient', { id: 'beam', x1: 0, y1: 0, x2: 1, y2: 0 }, md);
  S('stop', { offset: 0, 'stop-color': '#F2E3C0', 'stop-opacity': 0.0 }, lg); S('stop', { offset: 0.5, 'stop-color': '#F2E3C0', 'stop-opacity': 0.22 }, lg); S('stop', { offset: 1, 'stop-color': '#F2E3C0', 'stop-opacity': 0 }, lg);
  R.mystSea = S('rect', { x: 0, y: 700, width: 1920, height: 380, fill: '#0A1420' }, R.mystSvg);
  R.mystShip = S('g', {}, R.mystSvg);
  S('path', { d: 'M360 700 L420 650 L1500 650 L1560 668 L1580 700 Z', fill: '#1A2533' }, R.mystShip);
  [[600, 380], [820, 360], [1040, 380], [1260, 400]].forEach(([x, top]) => S('line', { x1: x, y1: 650, x2: x, y2: top, stroke: '#1A2533', 'stroke-width': 9 }, R.mystShip));
  [[700, 520], [930, 530]].forEach(([x, top]) => S('rect', { x: x - 18, y: top, width: 36, height: 650 - top, fill: '#1A2533' }, R.mystShip));
  R.mystEdge = S('path', { d: 'M360 700 L420 650 L1500 650 L1560 668 L1580 700', fill: 'none', stroke: '#F2E3C0', 'stroke-width': 3, opacity: 0 }, R.mystShip);
  R.fog = [0, 1, 2, 3].map((i) => S('rect', { x: -400, y: 520 + i * 70, width: 2800, height: 90, fill: '#0E1824', opacity: 0.55 }, R.mystSvg));
  R.beam = S('path', { fill: 'url(#beam)' }, R.mystSvg);
  R.mystQ = E('div', 'L', '<span style="font:900 300px/1 FR;color:transparent;-webkit-text-stroke:5px #E9A23B">?</span>', R.myst, 'left:1580px;top:250px');
  R.mystHead = E('div', 'L', '<div class="mask"><span class="kick">HALF A CENTURY EARLIER</span></div><div class="mask" style="margin-top:16px"><span class="hd">A ship had already shown it</span></div>', R.myst, 'left:120px;top:96px');

  // ---- plan view
  R.plan = E('div', 'full', '', sc, 'transform-origin:50% 60%');
  const ps = S('svg', { viewBox: '-30 -150 940 300', width: 1920, height: 613 }, R.plan);
  ps.style.cssText = 'position:absolute;left:0;top:360px;overflow:visible';
  R.planHull = S('path', { d: planD(), fill: '#0F1B2A', stroke: COL.line, 'stroke-width': 2.2, style: NSL }, ps);
  R.planHullLen = 2 * 900;
  S('line', { x1: 8, x2: 870, y1: 0, y2: 0, stroke: '#2A3C54', 'stroke-width': 1, 'stroke-dasharray': '6 6', style: NSL }, ps);
  R.planBH = BH.map((x) => S('line', { x1: x, x2: x, y1: -hb(x), y2: hb(x), stroke: COL.line, 'stroke-width': 2.4, style: NSL }, ps));
  R.planNums = EDGES.slice(0, 16).map((x, k) => { const t = S('text', { x: (x + EDGES[k + 1]) / 2, y: 5, 'text-anchor': 'middle', fill: COL.accent, 'font-family': 'JB', 'font-weight': 800, 'font-size': 14 }, ps); t.textContent = k + 1; return t; });
  R.planArrow = S('g', {}, ps);
  S('path', { d: `M${BH[7] + 10} ${-hb(BH[7]) + 4} L${BH[7] + 10} ${hb(BH[7]) - 4} M${BH[7] + 6} ${-hb(BH[7]) + 10} L${BH[7] + 10} ${-hb(BH[7]) + 3} L${BH[7] + 14} ${-hb(BH[7]) + 10} M${BH[7] + 6} ${hb(BH[7]) - 10} L${BH[7] + 10} ${hb(BH[7]) - 3} L${BH[7] + 14} ${hb(BH[7]) - 10}`, fill: 'none', stroke: COL.accent, 'stroke-width': 2.5, style: NSL }, R.planArrow);
  R.planLbl = E('div', 'L', '<span class="tag">SIDE TO SIDE</span>', R.plan);
  R.planCount = E('div', 'L', `<div class="mask"><span class="kick" id="pcK">STEEL BULKHEADS</span></div><div class="mask" style="margin-top:8px"><span id="pcN" style="font:900 150px/1 FR;letter-spacing:-0.03em">0</span></div>`, R.plan, 'left:120px;top:96px');
  R.planCount2 = E('div', 'L', `<div class="mask"><span class="kick">WATERTIGHT COMPARTMENTS</span></div><div class="mask" style="margin-top:8px"><span id="pcN2" style="font:900 150px/1 FR;letter-spacing:-0.03em;color:#E9A23B">16</span></div>`, R.plan, 'left:760px;top:96px');
  R.planBow = E('div', 'L', '<span class="mono" style="font-size:22px;font-weight:800;letter-spacing:.16em;color:#8A97A8">BOW</span>', R.plan, 'left:60px;top:880px');
  R.planStern = E('div', 'L', '<span class="mono" style="font-size:22px;font-weight:800;letter-spacing:.16em;color:#8A97A8">STERN</span>', R.plan, 'left:1760px;top:880px');

  // ---- Board of Trade document
  R.doc = E('div', 'full', '', sc, 'perspective:1600px');
  R.docCard = E('div', 'paper', `<div style="position:absolute;left:60px;top:54px;font:900 64px/1 FR;letter-spacing:-0.01em">Board of Trade</div>
    <div class="mono" style="position:absolute;left:62px;top:136px;font-size:26px;font-weight:800;letter-spacing:.16em;color:#6B5A3E">BULKHEAD COMMITTEE · 1891</div>
    <div style="position:absolute;left:60px;right:60px;top:190px;height:3px;background:#17140F"></div><div id="docUl" style="position:absolute;left:60px;top:172px;height:7px;width:470px;background:#E9A23B;transform-origin:0 50%;transform:scaleX(0)"></div>
    <div class="mono" style="position:absolute;left:62px;top:236px;font-size:28px;font-weight:700;letter-spacing:.06em">RECOMMENDED: STAY AFLOAT WITH</div>
    <div id="docTwo" style="position:absolute;left:52px;top:280px;font:900 230px/1 FR;color:#17140F">2</div>
    <div class="mono" style="position:absolute;left:250px;top:360px;font-size:34px;font-weight:800;letter-spacing:.06em;line-height:1.3">ADJACENT<br>COMPARTMENTS<br>FLOODED</div>
    <svg id="docRing" style="position:absolute;left:20px;top:268px;overflow:visible" width="220" height="250"><ellipse cx="105" cy="128" rx="98" ry="118" fill="none" stroke="#E9A23B" stroke-width="7" stroke-dasharray="700" stroke-dashoffset="700" transform="rotate(-8 105 128)"/></svg>`, R.doc, 'position:absolute;left:300px;top:150px;width:920px;height:640px;transform-origin:50% 100%');
  R.stamp = E('div', 'L', '<div style="padding:16px 30px;border:9px solid #E9A23B;border-radius:12px;color:#E9A23B;font:900 104px/1 FR;white-space:nowrap;background:rgba(10,17,27,.0)">NOT COMPULSORY</div>', R.doc, 'left:780px;top:560px;transform-origin:50% 50%');

  // ---- Wilding + margin bars
  R.wil = E('div', 'full', '', sc);
  R.wilHead = E('div', 'L', `<div class="mask"><span class="kick">BRITISH INQUIRY · 1912</span></div>`, R.wil, 'left:120px;top:96px');
  R.wilCard = E('div', 'L', `<svg width="250" height="250" viewBox="0 0 360 360" style="flex:none;margin-right:44px"><circle cx="180" cy="180" r="176" fill="#141E2B" stroke="#3B4A5E" stroke-width="4"/>
      <clipPath id="witc2"><circle cx="180" cy="180" r="172"/></clipPath><g clip-path="url(#witc2)" fill="#D9D2C3"><circle cx="180" cy="140" r="62"/><path d="M60 360 Q66 236 180 222 Q294 236 300 360 Z"/><path d="M180 222 L160 300 L180 330 L200 300 Z" fill="#141E2B"/></g></svg>
      <div style="padding-top:40px;flex:none"><div class="mask"><span class="kick">HARLAND &amp; WOLFF · NAVAL ARCHITECT</span></div><div class="mask" style="margin-top:12px"><span style="font:700 92px/1 FR;letter-spacing:-0.02em;white-space:nowrap">Edward Wilding</span></div>
      <div class="mask" style="margin-top:14px"><span class="mono" style="font-size:26px;font-weight:700;letter-spacing:.1em;color:#8A97A8">TESTIFIED AT THE BRITISH INQUIRY</span></div></div>`, R.wil, 'left:120px;top:170px;width:1700px;display:flex;align-items:flex-start');
  R.bars = E('div', 'L', `<div class="mask"><span class="kick" style="color:#D9D2C3;font-size:30px">SAFETY MARGIN ABOVE THE WATER</span></div>
      <div style="position:relative;margin-top:44px;height:90px"><div class="mono" style="position:absolute;left:0;top:26px;width:360px;font-size:28px;font-weight:800;letter-spacing:.1em;color:#8A97A8">1891 COMMITTEE</div><div style="position:absolute;left:380px;top:10px;height:70px;width:960px;border:2px solid #24344A;border-radius:4px"></div><div id="bar1" style="position:absolute;left:380px;top:10px;height:70px;width:0;background:#6C7A8A;border-radius:4px"></div><div id="bar1t" class="mono" style="position:absolute;top:22px;font-size:40px;font-weight:800">1×</div></div>
      <div style="position:relative;margin-top:34px;height:90px"><div class="mono" style="position:absolute;left:0;top:26px;width:360px;font-size:28px;font-weight:800;letter-spacing:.1em;color:#E9A23B">TITANIC</div><div style="position:absolute;left:380px;top:10px;height:70px;width:960px;border:2px solid #24344A;border-radius:4px"></div><div id="bar2" style="position:absolute;left:380px;top:10px;height:70px;width:0;background:#E9A23B;border-radius:4px"></div><div id="bar2t" style="position:absolute;top:-6px;font:900 110px/1 FR;color:#E9A23B;white-space:nowrap">≈ 2×</div></div>`, R.wil, 'left:120px;top:560px;width:1700px');
}
const hb = (x) => { // half-beam of the plan view (ft)
  if (x < 190) return 46 * Math.sin((Math.PI / 2) * Math.min(1, x / 190)) ** 0.8;
  if (x > 740) return 46 * Math.cos((Math.PI / 2) * Math.min(1, (x - 740) / 145)) ** 0.6 + (x > 860 ? 0 : 0);
  return 46;
};
function planD() { let a = 'M0 0', b = ''; for (let x = 0; x <= 884; x += 4) { a += ` L${x} ${(-hb(x)).toFixed(2)}`; b = ` L${x} ${hb(x).toFixed(2)}` + b; } return a + b + ' Z'; }
function grid() { let s = ''; for (let x = 0; x <= 500; x += 25) s += `<line x1="${x}" y1="0" x2="${x}" y2="300" stroke="#CBBFA5" stroke-width="${x % 100 ? 1 : 2}"/>`; for (let y = 0; y <= 300; y += 25) s += `<line x1="0" y1="${y}" x2="500" y2="${y}" stroke="#CBBFA5" stroke-width="${y % 100 ? 1 : 2}"/>`; return s; }
function curve(i) { let d = 'M0 280'; for (let x = 0; x <= 500; x += 20) d += ` L${x} ${(280 - 240 * (1 - Math.exp(-x / (140 + i * 60))) - 10 * Math.sin(x / 40 + i)).toFixed(1)}`; return d; }

// ============================================================================ per-frame helpers
let VIEW = { x: 0, y: 0, w: 1000, h: 562.5 }, SHIP = { sink: 0, trim: 0 };
function setCamera(cx, cy, w) { VIEW = { x: cx - w / 2, y: cy - (w * 9) / 32, w, h: (w * 9) / 16 }; set($('world'), { viewBox: `${VIEW.x.toFixed(3)} ${VIEW.y.toFixed(3)} ${VIEW.w.toFixed(3)} ${VIEW.h.toFixed(3)}` }); }
function toScreen(x, y, inShip = true) { // ship coords (ft, SVG y) -> screen px
  let X = x, Y = y;
  if (inShip) {
    const a = (SHIP.trim * Math.PI) / 180, dx = x - PIV[0], dy = y - PIV[1];
    X = PIV[0] + dx * Math.cos(a) - dy * Math.sin(a); Y = PIV[1] + dx * Math.sin(a) + dy * Math.cos(a) + SHIP.sink;
  }
  return [((X - VIEW.x) / VIEW.w) * W, ((Y - VIEW.y) / VIEW.h) * H];
}
// anchored label: pin at ship point, card offset in px, reveal p (0..1)
function label(L, on, p, ax, ay, dx, dy, inShip = true) {
  const vis = on && p > 0;
  show(L.d, vis); L.line.style.display = vis ? '' : 'none'; L.dot.style.display = vis ? '' : 'none';
  if (!vis) return;
  const [sx, sy] = toScreen(ax, ay, inShip);
  const lx = sx + dx, ly = sy + dy;
  L.d.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
  [...L.d.children].forEach((m, i) => rise(m, P(p, 0.12 * i, 0.6)));
  const q = oCub(clamp(p * 1.6));
  const ex = lx - 14, ey = ly + 20, mx = lerp(sx, ex, q), my = lerp(sy, ey, q);
  set(L.line, { d: `M${sx.toFixed(1)} ${sy.toFixed(1)} L${mx.toFixed(1)} ${my.toFixed(1)}` });
  set(L.dot, { cx: sx, cy: sy, r: 5 * spring(clamp(p * 2)) });
}
function headline(on, k, h, p) {
  show(R.head, on);
  if (!on) return;
  if ($('hk').textContent !== k) $('hk').textContent = k;
  if ($('hh').textContent !== h) $('hh').textContent = h;
  rise(R.head.children[0], P(p, 0, 0.5)); rise(R.head.children[1], P(p, 0.12, 0.6));
}
function waves(paths, t, amp, colA) {
  const x0 = VIEW.x - 40, x1 = VIEW.x + VIEW.w + 40, st = VIEW.w / 90;
  paths.forEach((pth, i) => {
    const y0 = -WL + (i + 0.4) * (VIEW.h * 0.06);
    let d = '';
    for (let x = x0; x <= x1; x += st) { const y = y0 + Math.sin(x / (VIEW.w * 0.05) + t * (0.7 + i * 0.2) + i) * amp * VIEW.w * 0.0015; d += (d ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(2); }
    set(pth, { d });
  });
}

// ============================================================================ SEEK
window.seek = function seek(t) {
  const q = Q, frame = Math.round(t * FPS);
  $('grain').style.transform = `translate(${(hash(frame) * 60 - 30).toFixed(1)}px,${(hash(frame + 9) * 60 - 30).toFixed(1)}px)`;
  R.stars.forEach((s, i) => set(s.c, { opacity: s.a * (0.7 + 0.3 * Math.sin(t * 1.3 + s.ph)) }));
  // impact shake (pure function of t)
  let shx = 0, shy = 0;
  for (const h of [q.pour, q.doordown, q.pulled, q.gone, q.no, q.oath, q.compulsory, q.twice]) { const d = t - h; if (d >= 0 && d < 0.45) { const a = Math.exp(-d * 10); shx += Math.sin(d * 85 + h) * 10 * a; shy += Math.cos(d * 70 + h * 2) * 8 * a; } }
  $('shake').style.transform = `translate(${shx.toFixed(2)}px, ${shy.toFixed(2)}px)`;

  // which world segment are we in?
  const segA = t < q.usual, segB = t >= q.weakness && t < q.century, segC = t >= q.lever0 - 0.02 && t < q.board0;
  const shipOn = segA || segB || segC;
  show($('world'), shipOn);
  // hide every overlay by default; scenes switch on below
  ['lBarrett', 'lBR6', 'lSide', 'lTwo', 'lBR5', 'lDoor', 'lMurdoch', 'lBridge', 'lBoilers', 'lEngines', 'lFlood'].forEach((k) => label(R[k], false));
  R.dim.style.display = 'none'; R.checks.forEach((c) => (c.style.display = 'none')); R.bracket.style.display = 'none';
  R.scan.style.display = 'none'; R.ret.style.display = 'none'; R.compNums.forEach((n) => (n.style.display = 'none'));
  let head = null;

  const later = [];
  // ---------------------------------------------------------------- WORLD state
  let cam = { cx: 445, cy: -85, w: 1000 }, wipe = 950, seaFrontX = 99999, seaFrontOp = 0, sink = 0, trim = 0;
  const water = new Array(16).fill(0), doors = new Array(DOORS.length).fill(0);
  let jets = 0, wireP = 0, bx = 232, bRun = null, bFace = 1, showB = false, showM = false;
  if (segA) {
    cam = keyed(t, { cx: 520, cy: -150, w: 1150 }, [
      [0, q.stoker, { cx: 470, cy: -128, w: 900 }],
      [q.stoker, 2.4, { cx: 222, cy: -24, w: 120 }],
      [q.stoker + 2.4, q.twofeet - q.stoker - 2.8, { cx: 220, cy: -20, w: 100 }],
      [q.twofeet - 0.4, 0.8, { cx: 220, cy: -10, w: 50 }],
      [q.ran - 0.1, 1.2, { cx: 250, cy: -22, w: 118 }],
      [q.bridge, 1.1, { cx: 190, cy: -86, w: 86 }],
      [q.shut - 0.15, 1.0, { cx: 445, cy: -88, w: 1000 }],
      [q.gone0, 1.6, { cx: 445, cy: -70, w: 1120 }],
    ]);
    wipe = lerp(-60, 960, ioSine(P(t, q.stoker, 1.8)));
    seaFrontX = wipe; seaFrontOp = 1;
    showB = t >= q.stoker; showM = t >= q.bridge - 0.5;
    // Barrett runs aft, turns as the door drops
    const run = P(t, q.ran, 1.5);
    bx = lerp(232, 262, ioSine(run)); bRun = run > 0 && run < 1 ? (t - q.ran) * 11 : null;
    bFace = t >= q.doordown - 0.35 && t < q.doordown + 1.6 ? -1 : 1;
    // breach + rising water in BR6
    jets = t >= q.pour && t < q.gone ? 1 : 0;
    water[4] = t < q.pour ? 0 : 0.005 + 0.025 * P(t, q.pour, q.twofeet + 1 - q.pour) + 0.2 * iQuad(P(t, q.twofeet + 1, q.gone0 - q.twofeet - 1));
    // door E comes down; the rest close on the bridge cascade
    doors[DOORS.indexOf(DOOR_E)] = bounce(P(t, q.doordown - 0.05, 0.4));
    DOORS.forEach((b, i) => { if (b !== DOOR_E) doors[i] = Math.max(doors[i], bounce(P(t, q.shut + 0.156 * (i + 1) - 0.05, 0.35))); });
    wireP = P(t, q.pulled + 0.2, q.shut - q.pulled + 0.6);
    // time-lapse: forward compartments flood, bow goes down, ship slides under
    if (t >= q.gone0) {
      const p = P(t, q.gone0, q.gone - q.gone0);
      [0, 1, 2, 3, 4, 5].forEach((k) => (water[k] = Math.max(water[k], clamp(ioSine(P(p, k * 0.06, 0.55)) * (k === 5 ? 0.8 : 1)))));
      trim = -4 * ioSine(P(p, 0, 0.6)) - 12 * iCub(P(p, 0.55, 0.45));
      sink = 230 * iCub(P(p, 0.5, 0.5));
      seaFrontX = -6000; seaFrontOp = P(p, 0.5, 0.25);
    }
    // labels
    later.push(() => label(R.lBarrett, t >= q.barrett - 0.1 && t < q.bridge, P(t, q.barrett - 0.1, 0.7), bx, -11, 140, -250));
    later.push(() => label(R.lBR6, t >= q.boiler && t < q.ran, P(t, q.boiler, 0.7), 218, -40, -320, -170));
    later.push(() => label(R.lSide, t >= q.side - 0.15 && t < q.twofeet - 0.3, P(t, q.side - 0.15, 0.6), 212, -7.2, 210, 120));
    later.push(() => label(R.lBR5, t >= q.ran + 1.3 && t < q.bridge, P(t, q.ran + 1.3, 0.7), 275, -40, 60, -190));
    later.push(() => label(R.lDoor, t >= q.doordown && t < q.bridge, P(t, q.doordown, 0.6), 245, -12, -460, -230));
    later.push(() => label(R.lMurdoch, t >= q.murdoch - 0.1 && t < q.shut, P(t, q.murdoch - 0.1, 0.7), 176, -88, -520, -200));
    // "two feet" dimension
    if (t >= q.twofeet - 0.15 && t < q.ran) later.push(() => {
      label(R.lTwo, true, P(t, q.twofeet, 0.6), 221, -6, -560, -330);
      R.dim.style.display = '';
      const [x1, y1] = toScreen(221, -5), [, y2] = toScreen(221, -7), p = oCub(P(t, q.twofeet - 0.15, 0.4));
      const ym = lerp(y1, y2, p);
      set(R.dimLine, { d: `M${x1 - 26} ${y1} L${x1 + 26} ${y1} M${x1} ${y1} L${x1} ${ym} M${x1 - 26} ${ym} L${x1 + 26} ${ym}` });
    });
    if (t >= q.worked && t < q.gone0) later.push(() => DOORS.forEach((b, i) => { const c = R.checks[i], p = spring(P(t, q.worked + 0.08 * i, 0.4)); c.style.display = ''; const [sx, sy] = toScreen(BH[b], -24); set(c, { transform: `translate(${sx.toFixed(1)} ${sy.toFixed(1)}) scale(${p.toFixed(3)})` }); }));
    if (t >= q.worked && t < q.gone0) head = ['WATERTIGHT DOORS', 'All closed.', t - q.worked];
  }
  if (segB) {
    cam = keyed(t, { cx: 445, cy: -88, w: 1040 }, [[q.weakness, q.century - q.weakness, { cx: 430, cy: -80, w: 900 }]], ioSine);
    wipe = 960; seaFrontX = 99999;
    head = ['THE WEAKNESS', 'Somewhere else in the design', t - q.weakness];
    // scan band sweeps bow -> stern, then reticles jump
    const sp = ioSine(P(t, q.weakness + 0.2, q.design - q.weakness));
    if (t < q.design + 0.2) later.push(() => { R.scan.style.display = ''; const [sx] = toScreen(lerp(-20, 900, sp), 0); set(R.scanRect, { x: sx - 140 }); set(R.scanEdge, { x1: sx, x2: sx }); });
    if (t >= q.design) later.push(() => {
      const spots = [[120, -20, 120, 50], [440, -46, 160, 40], [300, -4, 260, 18], [700, -30, 140, 46]];
      const k = Math.min(spots.length - 1, Math.floor((t - q.design) / 0.47));
      const [x, y, w, h] = spots[k], [sx, sy] = toScreen(x, y), [ex, ey] = toScreen(x + w, y - h);
      const pp = spring(P(t, q.design + k * 0.47, 0.35));
      const cx = (sx + ex) / 2, cy = (sy + ey) / 2, hw = ((ex - sx) / 2) * lerp(1.6, 1, pp), hh = ((sy - ey) / 2) * lerp(1.6, 1, pp), L = 26;
      R.ret.style.display = '';
      let d = '';
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const px = cx + dx * hw, py = cy + dy * hh; d += `M${px - dx * L * -0 + 0} ${py} L${px - dx * L} ${py} M${px} ${py} L${px} ${py - dy * L} `; }
      set(R.retPath, { d }); set(R.retQ, { x: cx + hw + 12, y: cy - hh + 50 });
    });
  }
  if (segC) {
    cam = keyed(t, { cx: 445, cy: -86, w: 1000 }, [[q.four0, 1.4, { cx: 330, cy: -62, w: 760 }], [q.float + 0.3, q.board0 - q.float, { cx: 320, cy: -60, w: 700 }]]);
    wipe = 960; seaFrontX = 99999;
    wireP = P(t, q.bridgeLever, q.onelever - q.bridgeLever + 0.2);
    DOORS.forEach((b, i) => (doors[i] = bounce(P(t, q.onelever + 0.156 * (i + 2) - 0.05, 0.35))));
    showM = true;
    if (t >= q.boilerEngine && t < q.two0) {
      later.push(() => label(R.lBoilers, true, P(t, q.boilerEngine, 0.6), 360, -21, -60, -330));
      later.push(() => label(R.lEngines, true, P(t, q.boilerEngine + 0.3, 0.6), 600, -38, 40, -290));
    }
    if (t >= q.bridgeLever - 0.1 && t < q.two0) later.push(() => label(R.lBridge, true, P(t, q.bridgeLever - 0.1, 0.6), 192, -90, -260, -160));
    if (t >= q.lever0 && t < q.two0) head = ['BOILER & ENGINE ROOMS', 'Doors closed from the bridge', t - q.lever0];
    // flooding scenarios
    let flooded = null;
    if (t >= q.twoAny && t < q.four0) {
      const pairs = [[4, 5], [8, 9], [11, 12], [1, 2]], slot = 0.47;
      const k = Math.min(pairs.length - 1, Math.floor((t - q.twoAny) / slot)), pr = pairs[k];
      const f = oCub(P(t, q.twoAny + k * slot, 0.3));
      pr.forEach((c) => (water[c] = f * 0.92));
      const cxp = (EDGES[pr[0]] + EDGES[pr[1] + 1]) / 2;
      trim = ((cxp - 441) / 441) * 0.9 * f; sink = 2.5 * f; flooded = pr;
    }
    if (t >= q.two0) head = ['SHIPYARD CALCULATION', 'Any two flooded: afloat', t - q.two0];
    if (t >= q.two0 + 0.3) later.push(() => R.compNums.forEach((n, k) => { const ti = q.two0 + 0.3 + k * 0.08; if (t < ti) return; n.style.display = ''; const [x, y] = toScreen((EDGES[k] + EDGES[k + 1]) / 2, -46); set(n, { x, y: y + 8, opacity: clamp((t - ti) / 0.12), fill: water[k] > 0.05 ? COL.accent : COL.line }); }));
    if (t >= q.four0) {
      const f = oCub(P(t, q.fourFirst - 0.1, 1.0));
      [0, 1, 2, 3].forEach((c, i) => (water[c] = oCub(P(t, q.fourFirst - 0.1 + i * 0.12, 0.8)) * 0.95));
      trim = -2.6 * f; sink = 5 * f; flooded = f > 0 ? [0, 3] : null;
      head = ['AT THE BOW', 'First four flooded: afloat', t - q.four0];
    }
    if (flooded) later.push(() => {
      const [sa] = toScreen(EDGES[flooded[0]] + 2, -54), [sb, sby] = toScreen(EDGES[flooded[1] + 1] - 2, -54);
      R.bracket.style.display = '';
      set(R.bracket, { d: `M${sa} ${sby + 18} L${sa} ${sby} L${sb} ${sby} L${sb} ${sby + 18}` });
      const lp = t >= q.four0 ? P(t, q.float - 0.2, 0.7) : P(t, q.flooded - 0.2, 0.7);
      label(R.lFlood, lp > 0, lp, (EDGES[flooded[0]] + EDGES[flooded[1] + 1]) / 2, -54, -20, -150);
    });
  }
  // apply world
  if (shipOn) {
    setCamera(cam.cx + Math.sin(t * 0.37) * cam.w * 0.004, cam.cy + Math.cos(t * 0.29) * cam.w * 0.003, cam.w);
    SHIP = { sink, trim };
    set(R.ship, { transform: `translate(0 ${sink.toFixed(3)}) rotate(${trim.toFixed(3)} ${PIV[0]} ${PIV[1]})` });
    set(R.extRect, { x: wipe, width: 2000 }); set(R.cutRect, { x: -100, width: Math.max(0, wipe + 100) });
    set(R.wipe, { x1: wipe, x2: wipe }); R.wipe.style.display = wipe > -50 && wipe < 950 ? '' : 'none';
    set(R.sfRect, { x: seaFrontX }); R.seaFront.style.opacity = seaFrontOp;
    waves(R.wavesB, t, 2, '#1E3550'); waves(R.wavesF, t, 2, '#2B4766');
    const wk = segA && t < q.gone0;
    R.wake.style.display = wk ? '' : 'none';
    if (wk) R.wakeP.forEach((p, i) => {
      if (i === 0) { set(p, { d: `M8 ${-WL} Q-6 ${-WL - 1.2} -26 ${-WL + 0.6}` }); return; }
      const spread = i * 3.2; set(p, { d: `M886 ${-WL} Q1000 ${-WL + spread * 0.3} 1260 ${-WL + spread}`, 'stroke-dashoffset': (t * 40 * (1 + i * 0.2)).toFixed(1) });
    });
    // water
    R.water.forEach((r, k) => {
      const f = water[k];
      if (f <= 0.001) { r.style.display = 'none'; R.waterTop[k].style.display = 'none'; return; }
      r.style.display = ''; R.waterTop[k].style.display = '';
      const a = EDGES[k] + (k === 0 ? -5 : 0), b = EDGES[k + 1], top = k < 15 ? Math.min(TOP[Math.max(0, k - 1)] || 50, TOP[Math.min(14, k)]) : 50;
      const lvl = 5 + f * (Math.max(top, 41) - 5);
      set(r, { x: a, y: -lvl, width: b - a, height: lvl + 2 });
      let d = '';
      for (let x = a; x <= b + 0.1; x += (b - a) / 12) d += (d ? ' L' : 'M') + x.toFixed(1) + ' ' + (-lvl + Math.sin(x * 0.5 + t * 5) * 0.25).toFixed(2);
      set(R.waterTop[k], { d });
    });
    R.jets.style.display = jets ? '' : 'none';
    if (jets) R.jetPaths.forEach((p, i) => set(p, { 'stroke-dashoffset': (-(t * 6) - i * 0.37).toFixed(2), 'stroke-width': (0.36 + 0.08 * Math.sin(t * 13 + i)).toFixed(3) }));
    R.wire.style.display = wireP > 0 ? '' : 'none';
    set(R.wire, { 'stroke-dasharray': `${(wireP * R.wireLen).toFixed(2)} 9999` });
    R.door.forEach((d, i) => { const c = doors[i]; set(d, { y: -19 + 7 * c, fill: c > 0.5 ? COL.accent : COL.cut, stroke: c > 0.5 ? COL.accent : COL.line }); });
    R.barrett.g.style.display = showB && segA ? '' : 'none';
    if (showB && segA) poseFigure(R.barrett, bx, -5, bRun, bFace);
    R.murdoch.g.style.display = showM ? '' : 'none';
    if (showM) poseFigure(R.murdoch, 176, -82, null, -1);
    later.forEach((f) => f());
  }

  // ---------------------------------------------------------------- clock + date
  const clockOn = t < q.stoker + 0.4 || (t >= q.gone0 && t < q.usual);
  show(R.clock, clockOn); show(R.date, t < q.stoker + 0.4);
  if (clockOn) {
    let mins, txt, sub = '', x = 150, y = 150, s = 1;
    if (t < q.gone0) { mins = 23 * 60 + 40 + t / 60; txt = '23:40'; }
    else {
      const p = ioSine(P(t, q.gone0 + 0.2, q.gone - q.gone0 - 0.4));
      mins = 23 * 60 + 40 + 160 * p; const hh = Math.floor(mins / 60) % 24, mm = Math.floor(mins % 60);
      txt = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const el = Math.round(160 * p); sub = `+${Math.floor(el / 60)} H ${String(el % 60).padStart(2, '0')} MIN`;
      x = 1480; y = 110; s = spring(P(t, q.gone0, 0.5));
    }
    const exit = t < q.gone0 ? oQuint(P(t, q.stoker, 0.4)) : 0;
    R.clock.style.transform = `translate(${x}px, ${(y - exit * 700).toFixed(1)}px) scale(${(t < q.gone0 ? spring(P(t, 0.1, 0.6)) : s).toFixed(4)})`;
    const hA = ((mins / 60) % 12) * 30, mA = (mins % 60) * 6, sA = t < q.gone0 ? Math.floor(t / (60 / (C.bpm || 96))) * 6 : (mins * 360) % 360;
    set(R.hHand, { transform: `rotate(${hA.toFixed(2)})` }); set(R.mHand, { transform: `rotate(${mA.toFixed(2)})` }); set(R.sHand, { transform: `rotate(${sA.toFixed(2)})` });
    R.clockTxt.textContent = txt; R.clockSub.textContent = sub;
  }
  if (t < q.stoker + 0.4) {
    const ex = oQuint(P(t, q.stoker, 0.4));
    R.date.style.transform = `translateY(${(-ex * 700).toFixed(1)}px)`;
    [...R.date.children].forEach((m, i) => rise(m, P(t, 0.15 + i * 0.22, 0.6)));
  }

  // ---------------------------------------------------------------- lever panel
  const lvOn = (t >= q.pulled - 0.6 && t < q.shut + 0.9) || (t >= q.bridgeLever - 0.2 && t < q.onelever + 1.2);
  show(R.lever, lvOn);
  if (lvOn) {
    const tIn = t < q.shut + 1 ? q.pulled - 0.6 : q.bridgeLever - 0.2, tPull = t < q.shut + 1 ? q.pulled : q.onelever, tOut = t < q.shut + 1 ? q.shut + 0.6 : q.onelever + 0.9;
    const pin = spring(P(t, tIn, 0.6), 6, 11), pout = iCub(P(t, tOut, 0.3));
    const late = t >= q.shut + 1; R.lever.style.transform = `perspective(1400px) translate(${((1 - pin) * 700 + pout * 700 + (late ? 60 : 0)).toFixed(1)}px, ${late ? -150 : 0}px) rotateY(${(-22 + (1 - pin) * -40).toFixed(2)}deg) scale(${late ? 0.72 : 1})`;
    const pull = P(t, tPull - 0.12, 0.22), a = lerp(-38, 38, oCub(pull)) + (pull >= 1 ? Math.sin((t - tPull - 0.1) * 30) * Math.exp(-(t - tPull) * 8) * 4 : 0);
    $('lvArm').style.transform = `rotate(${(180 + a).toFixed(2)}deg)`;
  }

  // ---------------------------------------------------------------- usual explanation tray
  const trayOn = t >= q.usual && t < q.inquiry;
  show(R.tray, trayOn);
  if (trayOn) {
    head = ['THE USUAL EXPLANATION', 'Bulkheads too low?', t - q.usual];
    drawTray(t, q);
  }

  // ---------------------------------------------------------------- inquiry
  const inqOn = t >= q.inquiry && t < q.no;
  show(R.inq, inqOn);
  if (inqOn) {
    [...R.inqHead.children].forEach((m, i) => rise(m, P(t, q.inquiry + 0.1 + i * 0.15, 0.6)));
    R.inq.style.transform = `scale(${(1 + 0.035 * ioSine(P(t, q.inquiry, q.no - q.inquiry))).toFixed(4)})`; R.inq.style.transformOrigin = '60% 60%';
    // calendar flips April -> May -> June, then slides away for the witness
    const calOut = oQuint(P(t, q.architect - 0.2, 0.5));
    R.cal.style.transform = `translateX(${(-calOut * 900).toFixed(1)}px) rotate(${(-4 + calOut * -10).toFixed(2)}deg)`;
    R.calPages.forEach((pg, i) => { const f = i < 2 ? oCub(P(t, q.inquiry + 0.8 + i * 0.75, 0.45)) : 0; pg.style.transform = `rotateX(${(f * 180).toFixed(2)}deg)`; pg.style.visibility = f < 0.5 ? 'visible' : 'hidden'; });
    const wp = spring(P(t, q.architect, 0.7), 6, 11);
    R.wit.style.visibility = t >= q.architect ? 'visible' : 'hidden';
    R.wit.style.transform = `translateY(${((1 - wp) * 500).toFixed(1)}px)`;
    [...R.wit.children[1].children].forEach((m, i) => rise(m, P(t, q.architect + 0.2 + i * 0.15, 0.6)));
    R.papers.forEach((pp, i) => {
      const p = spring(P(t, q.calcs + i * 0.18, 0.7), 6, 11);
      pp.style.display = t >= q.calcs + i * 0.18 ? '' : 'none';
      pp.style.transform = `translate(${(780 + i * 120).toFixed(1)}px, ${(330 + i * 70 + (1 - p) * 700).toFixed(1)}px) rotate(${(-8 + i * 7 + (1 - p) * 20).toFixed(2)}deg)`;
    });
    const sp = P(t, q.oath - 0.08, 0.16);
    R.oath.style.display = t >= q.oath - 0.08 ? '' : 'none';
    R.oath.style.transform = `rotate(-9deg) scale(${lerp(2.4, 1, iQuad(sp)).toFixed(3)})`;
  }

  // ---------------------------------------------------------------- "No."
  const noOn = t >= q.no && t < q.weakness;
  show(R.no, noOn);
  if (noOn) $('noTxt').style.transform = `scale(${lerp(1.5, 1, oQuint(P(t, q.no, 0.25))).toFixed(4)})`;

  // ---------------------------------------------------------------- mystery ship
  const mOn = t >= q.century && t < q.fifteen0;
  show(R.myst, mOn);
  if (mOn) {
    const lt = t - q.century;
    set(R.mystShip, { transform: `translate(${(-lt * 14).toFixed(1)} 0) scale(${(1 + lt * 0.012).toFixed(4)})` });
    R.fog.forEach((f, i) => set(f, { x: -400 + Math.sin(t * 0.3 + i) * 120 - lt * (10 + i * 6), opacity: 0.45 + 0.15 * Math.sin(t * 0.5 + i * 2) }));
    const bp = P(t, q.missing - 0.4, 1.6), ang = lerp(-60, 60, ioSine(bp));
    const bx0 = 960, by0 = -200, len = 2200, a1 = ((ang - 7) * Math.PI) / 180, a2 = ((ang + 7) * Math.PI) / 180;
    set(R.beam, { d: `M${bx0} ${by0} L${bx0 + Math.sin(a1) * len} ${by0 + Math.cos(a1) * len} L${bx0 + Math.sin(a2) * len} ${by0 + Math.cos(a2) * len} Z`, opacity: bp > 0 && bp < 1 ? 1 : 0 });
    set(R.mystEdge, { opacity: (Math.max(0, 1 - Math.abs(ang) / 25) * (bp > 0 && bp < 1 ? 0.8 : 0)).toFixed(3) });
    R.mystQ.style.transform = `translateY(${((1 - spring(P(t, q.century + 0.3, 0.7))) * 600).toFixed(1)}px) rotate(${(Math.sin(t * 1.2) * 4).toFixed(2)}deg)`;
    [...R.mystHead.children].forEach((m, i) => rise(m, P(t, q.century + 0.1 + i * 0.15, 0.6)));
  }

  // ---------------------------------------------------------------- plan view (+ 3D flip into the profile)
  const planOn = t >= q.fifteen0 && t < q.lever0 + 0.02;
  show(R.plan, planOn);
  if (planOn) {
    const fo = iCub(P(t, q.lever0 - 0.35, 0.35));
    R.plan.style.transform = `perspective(1600px) rotateX(${(fo * 88).toFixed(2)}deg)`;
    set(R.planHull, { 'stroke-dasharray': `${(R.planHullLen * oCub(P(t, q.fifteen0, 1.6))).toFixed(1)} 9999` });
    let n = 0;
    R.planBH.forEach((l, i) => { const ti = q.fifteen + i * 0.156, p = spring(P(t, ti, 0.4), 6, 12); if (t >= ti) n++; l.style.display = t >= ti ? '' : 'none'; set(l, { transform: `translate(0 ${((1 - p) * -120).toFixed(2)})`, stroke: t >= q.across && i === 7 ? COL.accent : COL.line }); });
    $('pcN').textContent = n;
    R.planCount.style.visibility = t >= q.fifteen - 0.2 ? 'visible' : 'hidden';
    [...R.planCount.children].forEach((m, i) => rise(m, P(t, q.fifteen - 0.2 + i * 0.1, 0.5)));
    R.planNums.forEach((tx, k) => { const ti = q.sixteen + k * 0.156; tx.style.display = t >= ti ? '' : 'none'; set(tx, { 'font-size': (14 * spring(P(t, ti, 0.35))).toFixed(2) }); });
    R.planCount2.style.visibility = t >= q.sixteen ? 'visible' : 'hidden';
    [...R.planCount2.children].forEach((m, i) => rise(m, P(t, q.sixteen + i * 0.1, 0.5)));
    const ap = t >= q.across && t < q.sixteen + 0.5;
    R.planArrow.style.display = ap ? '' : 'none'; R.planLbl.style.display = ap ? '' : 'none';
    R.planLbl.style.transform = `translate(${(((BH[7] + 30) / 940) * 1920 + 61).toFixed(1)}px, ${(360 + 306 - 22).toFixed(1)}px) scale(${spring(P(t, q.across, 0.4)).toFixed(3)})`;
    R.planBow.style.visibility = R.planStern.style.visibility = t >= q.fifteen0 + 0.6 ? 'visible' : 'hidden';
  }
  if (planOn && t < q.fifteen - 0.25) head = ['HARLAND & WOLFF', 'Dividing the hull', t - q.fifteen0];
  if (segC && t < q.lever0 + 0.45) { const fi = P(t, q.lever0, 0.45); $('world').style.transform = `perspective(1600px) rotateX(${((1 - oCub(fi)) * -80).toFixed(2)}deg)`; $('world').style.transformOrigin = '50% 60%'; }
  else $('world').style.transform = 'none';

  // ---------------------------------------------------------------- Board of Trade
  const docOn = t >= q.board0 && t < q.wilding0;
  show(R.doc, docOn);
  if (docOn) {
    const p = spring(P(t, q.board0, 0.8), 5.5, 10);
    R.docCard.style.transform = `translateY(${((1 - p) * 300).toFixed(1)}px) rotateX(${((1 - p) * 60).toFixed(2)}deg) rotate(${(-2.5 + Math.sin(t * 0.6) * 0.6).toFixed(2)}deg) scale(${(1 + 0.05 * ioSine(P(t, q.board0, q.wilding0 - q.board0))).toFixed(4)})`;
    $('docUl').style.transform = `scaleX(${oCub(P(t, q.committee, 0.45)).toFixed(3)})`;
    $('docRing').firstElementChild.setAttribute('stroke-dashoffset', (700 * (1 - oCub(P(t, q.recTwo, 0.5)))).toFixed(1));
    const sp = P(t, q.compulsory - 0.08, 0.16);
    R.stamp.style.display = t >= q.compulsory - 0.08 ? '' : 'none';
    R.stamp.style.transform = `rotate(-11deg) scale(${lerp(2.6, 1, iQuad(sp)).toFixed(3)})`;
  }

  // ---------------------------------------------------------------- Wilding + 2x
  const wOn = t >= q.wilding0;
  show(R.wil, wOn);
  if (wOn) {
    rise(R.wilHead.children[0], P(t, q.wilding0 + 0.1, 0.6));
    const cp = spring(P(t, q.wilding0 + 0.15, 0.7), 6, 11);
    R.wilCard.style.visibility = t >= q.wilding0 + 0.15 ? 'visible' : 'hidden';
    R.wilCard.style.transform = `translateX(${((1 - cp) * -500).toFixed(1)}px)`;
    const wk = R.wilCard.children[1].children;
    rise(wk[0], P(t, q.wilding0 + 0.35, 0.6)); rise(wk[1], P(t, q.wilding - 0.05, 0.6)); rise(wk[2], P(t, q.wilding + 0.2, 0.6));
    const bIn = Math.min(q.wilding + 0.6, q.margin - 0.2);
    R.bars.style.visibility = t >= bIn ? 'visible' : 'hidden';
    R.bars.style.transform = `translateY(${((1 - spring(P(t, bIn, 0.7), 6, 11)) * 500).toFixed(1)}px)`;
    rise(R.bars.children[0], P(t, bIn + 0.1, 0.6));
    const b1 = 480 * oCub(P(t, q.margin, 0.8)), b2 = 960 * oCub(P(t, q.margin + 0.5, q.twice - q.margin - 0.4));
    $('bar1').style.width = b1.toFixed(1) + 'px'; $('bar1t').style.left = (380 + b1 + 24).toFixed(1) + 'px'; $('bar1t').style.visibility = b1 > 430 ? 'visible' : 'hidden';
    $('bar2').style.width = b2.toFixed(1) + 'px';
    $('bar2t').style.left = (380 + b2 + 30).toFixed(1) + 'px';
    $('bar2t').style.top = '-14px';
    $('bar2t').style.visibility = t >= q.twice ? 'visible' : 'hidden';
    $('bar2t').style.transform = `scale(${spring(P(t, q.twice, 0.45), 6, 12).toFixed(3)})`;
    // slow push for the hold
    R.wil.style.transform = `scale(${(1 + 0.03 * ioSine(P(t, q.twice, DUR - q.twice))).toFixed(4)})`; R.wil.style.transformOrigin = '30% 60%';
  }

  headline(!!head, head ? head[0] : '', head ? head[1] : '', head ? head[2] : 0);
};

// ---------------------------------------------------------------- the "ice-cube tray" (usual explanation)
function drawTray(t, q) {
  const n = 6, bw = 230, x0 = 270, floorY = 820, wallH = 230, endH = 380, ang = (-7 * Math.PI) / 180, pv = [960, 760];
  const rot = ([x, y]) => [pv[0] + (x - pv[0]) * Math.cos(ang) - (y - pv[1]) * Math.sin(ang), pv[1] + (x - pv[0]) * Math.sin(ang) + (y - pv[1]) * Math.cos(ang)];
  // outline (bow wall tall on the left, stern wall tall on the right)
  let d = '';
  const pts = [];
  for (let i = 0; i <= n; i++) { const x = x0 + i * bw, h = i === 0 || i === n ? endH : wallH; pts.push([rot([x, floorY]), rot([x, floorY - h])]); }
  d += `M${pts[0][1][0]} ${pts[0][1][1]} L${pts[0][0][0]} ${pts[0][0][1]} L${pts[n][0][0]} ${pts[n][0][1]} L${pts[n][1][0]} ${pts[n][1][1]}`;
  for (let i = 1; i < n; i++) d += ` M${pts[i][0][0]} ${pts[i][0][1]} L${pts[i][1][0]} ${pts[i][1][1]}`;
  set(R.trayBox, { d });
  // fill box by box; each spills over its aft wall into the next
  const t0 = q.usual + 0.6, per = Math.max(0.5, (q.high + 0.8 - t0) / n);
  const clipBelow = (poly, L) => { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = a[1] >= L, ib = b[1] >= L; if (ia) out.push(a); if (ia !== ib) { const u = (L - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * u, L]); } } return out; };
  for (let i = 0; i < n; i++) {
    const f = oCub(P(t, t0 + i * per, per));
    const quad = [pts[i][0], pts[i + 1][0], rot([x0 + (i + 1) * bw, floorY - (i + 1 === n ? endH : wallH)]), rot([x0 + i * bw, floorY - (i === 0 ? endH : wallH)])];
    const low = Math.max(pts[i][0][1], pts[i + 1][0][1]), spill = Math.max(pts[i][1][1], pts[i + 1][1][1]);
    const L = lerp(low, spill, f);
    const poly = f > 0 ? clipBelow(quad, L) : [];
    set(R.trayWater[i], { d: poly.length ? 'M' + poly.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' Z' : '' });
    if (i < n - 1) {
      const nf = P(t, t0 + (i + 1) * per, per), on = f >= 1 && nf < 1;
      const top = pts[i + 1][1], nlow = Math.max(pts[i + 1][0][1], pts[i + 2][0][1]);
      set(R.traySpill[i], { d: on ? `M${top[0] - 6} ${top[1] - 4} Q${top[0] + 40} ${top[1] - 10} ${top[0] + 60} ${lerp(nlow, top[1], oCub(nf)).toFixed(1)}` : '' });
    }
  }
  // the sea line outside, and wall tops flagged on "high"
  const sea = rot([x0 - 80, floorY - wallH - 40]);
  set(R.traySea, { d: `M120 ${sea[1].toFixed(1)} L1800 ${sea[1].toFixed(1)}` });
  R.trayTopMarks.forEach((c, i) => { const p = spring(P(t, q.high + i * 0.08, 0.35)); const [x, y] = pts[i + 1][1]; set(c, { cx: x, cy: y, r: 11 * p }); });
  const qp = spring(P(t, q.high + 0.4, 0.5));
  R.trayQ.style.transform = `translate(1640px, 170px) scale(${qp.toFixed(3)})`;
}

// ============================================================================ boot
window.ready = (async () => {
  const [beats, cues, vo, film] = await Promise.all(['beats.json', 'cues.json', 'vo.json', 'film.json'].map((f) => fetch(f).then((r) => r.json())));
  BEATS = beats.beats; C = cues; VO = vo; DUR = film.duration;
  for (const k in C) if (typeof C[k] === 'number' && k !== 'bpm') Q[k] = Tm(C[k]);
  for (const f of ['600 100px FR', '700 100px FR', '900 100px FR', '700 40px JB', '800 40px JB']) await document.fonts.load(f);
  await document.fonts.ready;
  build();
  window.seek(0);
  return true;
})();

if (!new URLSearchParams(location.search).has('render')) {
  const fit = () => { const s = Math.min(innerWidth / W, innerHeight / H); $('stage').style.transform = `scale(${s})`; };
  addEventListener('resize', fit); fit();
  window.ready.then(() => {
    const a = new Audio('out/audio.wav');
    document.body.addEventListener('click', () => { a.currentTime = 0; a.play(); });
    const loop = () => { window.seek(a.paused ? 0 : a.currentTime); requestAnimationFrame(loop); };
    loop();
  });
}
