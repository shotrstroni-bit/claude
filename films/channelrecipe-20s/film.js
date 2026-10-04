// ChannelRecipe 20s — 3D cut with a lip-synced avatar.
// Render contract: window.seek(t) paints frame t. No transitions, no timers,
// no state carried between frames. Seeded noise only (mulberry32).
'use strict';

// ============================================================================ utils
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const P = (t, a, d) => clamp((t - a) / d);
const oCub = (p) => 1 - Math.pow(1 - p, 3);
const oQuart = (p) => 1 - Math.pow(1 - p, 4);
const oQuint = (p) => 1 - Math.pow(1 - p, 5);
const iCub = (p) => p * p * p;
const iQuad = (p) => p * p;
const ioCub = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const spring = (p, k = 6, w = 13) => (p >= 1 ? 1 : p <= 0 ? 0 : 1 - Math.exp(-k * p) * Math.cos(w * p));
const bounce = (p) => { // ease-out bounce
  const n = 7.5625, d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
};
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (n) => mulberry32((n * 2654435761) >>> 0)();
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, p) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], p))).join(',')})`; };
const show = (e, on) => { e.style.display = on ? '' : 'none'; };
const FPS = 30, W = 1080, H = 1920, DUR = 20;

// ============================================================================ 3D helpers
function el(tag, cls, html, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
// place an .o element: position its anchor (ax, ay) at (x, y, z) then rotate/scale around it
function place(e, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, ax = 0.5, ay = 0.5 } = {}) {
  e.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg) rotateX(${rx.toFixed(3)}deg) rotateZ(${rz.toFixed(3)}deg) scale(${s.toFixed(4)}) translate(${-ax * 100}%,${-ay * 100}%)`;
}
// solid extrusion: N stacked layers behind the front face
function extrude(parent, frontHTML, { layers = 14, step = 4, side = ['#000000', '#444444'], mode = 'text', radius = 0, cls = '', style = '' } = {}) {
  const o = el('div', 'o', null, parent);
  const x = el('div', 'x3 ' + cls, null, o);
  if (style) x.style.cssText += style;
  const lays = [];
  for (let i = layers; i >= 1; i--) {
    const c = mixHex(side[0], side[1], 1 - (i - 1) / layers);
    const l = el('div', 'lay', mode === 'text' ? frontHTML : '', x);
    if (mode === 'text') { l.style.color = c; l.querySelectorAll('*').forEach((n) => { n.style.color = c; n.style.background = 'transparent'; n.style.boxShadow = 'none'; }); }
    else { l.style.background = c; l.style.borderRadius = radius + 'px'; }
    l.style.transform = `translateZ(${-i * step}px)`;
    lays.push(l);
  }
  const f = el('div', '', frontHTML, x);
  f.style.position = 'relative';
  return { o, front: f, lays, x };
}
function setText(ex, html) { ex.front.innerHTML = html; ex.lays.forEach((l) => { const c = l.style.color; l.innerHTML = html; l.querySelectorAll('*').forEach((n) => { n.style.color = c; n.style.background = 'transparent'; }); }); }
function cam(rig, { tx = 0, ty = 0, tz = 0, yaw = 0, pitch = 0, roll = 0, dolly = 0 } = {}) {
  rig.style.transform = `translate3d(540px,730px,0) translateZ(${(-dolly).toFixed(2)}px) rotateZ(${roll.toFixed(3)}deg) rotateX(${pitch.toFixed(3)}deg) rotateY(${yaw.toFixed(3)}deg) translate3d(${(-tx).toFixed(2)}px,${(-ty).toFixed(2)}px,${(-tz).toFixed(2)}px)`;
}
function scene(id, bg) {
  const sc = el('div', 'sc', null, $('scenes'));
  sc.id = id; sc.style.background = bg;
  const rig = el('div', 'rig', null, sc);
  return { sc, rig };
}
function floor(rig, y, color) {
  const f = el('div', 'floor', null, rig);
  if (color) f.style.backgroundImage = `linear-gradient(${color} 3px, transparent 3px), linear-gradient(90deg, ${color} 3px, transparent 3px)`;
  place(f, { y, z: -1200, rx: 90 });
  return f;
}

// ============================================================================ art (niche thumbnails)
const eye = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="#fff"/></svg>';
function art(kind) {
  const R = mulberry32(kind.length * 977);
  if (kind === 'stick') return `<div style="position:absolute;inset:0;background:#fff"></div>
    <svg viewBox="0 0 914 514" width="914" height="514" style="position:absolute;inset:0"><g fill="none" stroke="#141414" stroke-width="7" stroke-linecap="round">
      <circle cx="300" cy="150" r="46"/><path d="M300 196 L300 330 M300 236 L240 290 M300 236 L370 200 M300 330 L255 440 M300 330 L345 440"/>
      <circle cx="610" cy="170" r="40"/><path d="M610 210 L610 330 M610 250 L560 300 M610 250 L660 300 M610 330 L575 440 M610 330 L645 440"/>
      <path d="M400 120 q40 -40 90 -10" stroke="#6F5AE0"/><path d="M482 98 l12 14 l-18 6" stroke="#6F5AE0"/></g></svg>
    <div class="cap" style="top:420px;color:#141414;text-shadow:none">he never <span style="color:#6F5AE0">saw it coming</span></div>`;
  if (kind === 'doc') return `<div style="position:absolute;inset:0;background:radial-gradient(60% 80% at 45% 40%,#F6E4C6 0%,#E9B98F 45%,#B86A55 80%,#7A3B36 100%)"></div>
    <div style="position:absolute;left:120px;top:60px;width:160px;height:380px;background:rgba(255,255,255,.35);filter:blur(18px)"></div>
    <div style="position:absolute;left:560px;top:40px;width:220px;height:420px;background:rgba(122,59,54,.45);filter:blur(22px)"></div>
    <div class="cap" style="top:410px">fluorescent lights, empty racks</div>`;
  if (kind === 'space') {
    let stars = ''; for (let i = 0; i < 90; i++) stars += `<circle cx="${(R() * 914) | 0}" cy="${(R() * 514) | 0}" r="${(R() * 2.4 + 0.6).toFixed(1)}" fill="#fff" opacity="${(R() * 0.7 + 0.3).toFixed(2)}"/>`;
    return `<div style="position:absolute;inset:0;background:#070B1A"></div><svg viewBox="0 0 914 514" width="914" height="514" style="position:absolute;inset:0">${stars}
      <path d="M180 250 L300 170 L420 190 L470 280 L380 360 L240 350 Z" fill="#3A3F52" stroke="#6E7591" stroke-width="3"/>
      <path d="M300 170 L330 260 L470 280 M330 260 L240 350" stroke="#22263A" stroke-width="4" fill="none"/></svg>
      <div style="position:absolute;right:0;top:0;width:330px;height:514px;background:linear-gradient(#D9D6D0,#BEB9B0)"></div>
      <svg viewBox="0 0 330 514" width="330" height="514" style="position:absolute;right:0;top:0"><circle cx="165" cy="200" r="70" fill="#2B2A2E"/><path d="M40 514 Q60 330 165 310 Q270 330 290 514 Z" fill="#2E3440"/></svg>
      <div class="cap" style="top:410px;width:584px">SUN <span style="color:#B7A8FF">EXISTED</span></div>`;
  }
  let ridges = '';
  [[300, '#8C8C88'], [350, '#5E5E5B'], [410, '#353533'], [470, '#1C1C1B']].forEach(([y, c], j) => {
    let d = `M0 514 L0 ${y}`; for (let x = 0; x <= 914; x += 38) d += ` L${x} ${(y - 60 * R() - 20 * Math.sin(x / 90 + j)).toFixed(0)}`;
    ridges += `<path d="${d} L914 514 Z" fill="${c}"/>`;
  });
  return `<div style="position:absolute;inset:0;background:linear-gradient(#D8D6D0,#A9A7A0)"></div><svg viewBox="0 0 914 514" width="914" height="514" style="position:absolute;inset:0">${ridges}<circle cx="640" cy="170" r="54" fill="#F1EFEA" opacity=".9"/></svg>
    <div style="position:absolute;left:0;right:0;top:0;height:44px;background:#000"></div><div style="position:absolute;left:0;right:0;bottom:0;height:44px;background:#000"></div>
    <div style="position:absolute;left:60px;top:120px;font:800 40px BG;color:#fff;background:#E5533D;padding:4px 16px;border-radius:8px">✕ Not a bloodline</div>
    <div style="position:absolute;left:60px;top:186px;font:800 40px BG;color:#141414;background:#F1EFEA;padding:4px 16px;border-radius:8px">✓ A nation</div>`;
}
const artBox = (kind, w) => `<div style="position:relative;width:${w}px;height:${(w * 514) / 914}px;overflow:hidden"><div style="position:absolute;left:0;top:0;width:914px;height:514px;transform:scale(${w / 914});transform-origin:0 0">${art(kind)}</div></div>`;
const NICHES = [
  { name: 'Animated Explainer', desc: 'Stick-figure docs that go viral.', views: '2.1B+', rpm: '$4–$12', art: 'stick' },
  { name: 'B-Roll Documentary', desc: 'Narration over stock footage.', views: '1.4B+', rpm: null, art: 'doc' },
  { name: 'Avatar + Illustrations', desc: 'AI presenter + illustrated B-roll.', views: '650M+', rpm: null, art: 'space' },
  { name: 'Cinematic B-Roll', desc: 'AI-directed, edited like a pro.', views: '890M+', rpm: '$6–$15', art: 'cine' },
];
const SLAB_SIDE = ['#A8A090', '#E2DCCD'];

// ============================================================================ data
let BEATS = [], C = {}, VO = {};
const Tm = (sec) => { // composed-grid seconds -> measured beat grid
  const k = sec / 0.5, i = Math.floor(k), f = k - i;
  const a = BEATS[Math.min(i, BEATS.length - 1)], b = BEATS[Math.min(i + 1, BEATS.length - 1)] ?? a + 0.5;
  return i >= BEATS.length - 1 ? a + (k - (BEATS.length - 1)) * 0.5 : a + (b - a) * f;
};
const voAt = (arr, t) => { const f = t * FPS, i = Math.floor(f); if (i < 0) return 0; const a = arr[i] ?? 0, b = arr[i + 1] ?? a; return a + (b - a) * (f - i); };

// ============================================================================ build
const S = {};
function build() {
  // ---------------------------------------------------------------- S1 HOOK (ink)
  {
    const { sc, rig } = scene('s1', '#141414');
    const words = ['CAMERA.', 'EDITING.', 'FACE.'].map((w) => {
      const g = el('div', 'o', null, rig);
      const no = extrude(g, 'NO', { layers: 18, step: 4, side: ['#1E1640', '#4B38B8'], cls: 'd8', style: 'font-size:230px;color:#6F5AE0' });
      const wd = extrude(g, w, { layers: 18, step: 4, side: ['#1A1A1A', '#6E6A62'], cls: 'd8', style: 'font-size:250px;color:#F3EFE6' });
      return { g, no, wd };
    });
    S.s1 = { sc, rig, words };
  }
  // ---------------------------------------------------------------- S2 PICK (paper, carousel)
  {
    const { sc, rig } = scene('s2', '#F3EFE6');
    floor(rig, 430);
    const cards = NICHES.map((n) => {
      const front = `<div class="card"><div class="thumb">${artBox(n.art, 600)}<div class="views">${eye}${n.views}</div></div>
        <div class="title d7">${n.name}</div><div class="desc">${n.desc}</div>
        <div class="meta mono">● 1 credit   ~15 min${n.rpm ? `   RPM <b>${n.rpm}</b>` : ''}</div></div>`;
      return extrude(rig, front, { mode: 'slab', layers: 10, step: 3.5, side: SLAB_SIDE, radius: 30 });
    });
    const sel = cards[3];
    const ring = el('div', 'ring', null, sel.front.firstElementChild);
    const pill = el('div', 'o', '<div class="pill">✓ RECIPE PICKED</div>', rig);
    S.s2 = { sc, rig, cards, ring, pill };
  }
  // ---------------------------------------------------------------- S3 COOK (paper, three stations)
  {
    const { sc, rig } = scene('s3', '#F3EFE6');
    floor(rig, 430);
    const mk = (title, inner) => extrude(rig, `<div class="panel"><div class="hd"><i></i><i></i><i></i><span style="margin-left:10px">${title}</span></div>${inner}</div>`, { mode: 'slab', layers: 12, step: 4, side: SLAB_SIDE, radius: 34 });
    const a = mk('script.txt', '<div class="typed" id="typed"></div>');
    const b = mk('voiceover.wav', '<div class="mono" style="position:absolute;left:40px;bottom:40px;font-size:30px;font-weight:700;color:var(--muted)">AI VOICE · ENGLISH (US)</div>');
    const c = mk('edit.timeline', `<div style="position:absolute;left:40px;top:120px;border-radius:14px;overflow:hidden">${artBox('cine', 300)}</div>
      <div class="mono" style="position:absolute;left:370px;top:130px;font-size:30px;font-weight:800;line-height:1.5">B-ROLL ✓<br>CAPTIONS ✓<br><span style="color:var(--accent)">MUSIC ✓</span></div>
      <div class="track" style="top:310px" id="tr0"></div><div class="track" style="top:404px" id="tr1"></div><div class="track" style="top:498px;height:60px" id="tr2"></div><div class="ph" id="ph"></div>`);
    // waveform bars as real 3D columns standing off the panel face
    const bars = el('div', 'o', null, rig);
    const cols = [];
    for (let k = 0; k < 22; k++) cols.push(extrude(bars, '<div style="width:20px;height:100px;border-radius:10px;background:#6F5AE0"></div>', { mode: 'slab', layers: 6, step: 4, side: ['#2E2280', '#5A47C9'], radius: 10 }));
    // timeline clips
    const clipDefs = [[0, 0, 170, '#353533'], [0, 180, 120, '#B86A55'], [0, 310, 210, '#3A3F52'], [0, 530, 140, '#8C8C88'],
      [1, 0, 260, '#6F5AE0'], [1, 270, 400, '#9C8CF0'], [2, 0, 680, '#12B47A']];
    const clips = clipDefs.map(([tr, x, w, c]) => { const d = el('div', 'clip', null, $('tr' + tr)); Object.assign(d.style, { left: x + 'px', width: w + 'px', background: c }); return { d, x, tr }; });
    S.s3 = { sc, rig, st: [a, b, c], bars, cols, clips };
  }
  // ---------------------------------------------------------------- S4 DONE (purple, phone)
  {
    const { sc, rig } = scene('s4', '#6F5AE0');
    const scr = `<div class="phone"><div class="scr">
      <div style="position:absolute;left:0;top:0">${artBox('cine', 404)}</div>
      <div style="position:absolute;left:0;top:219px;width:404px;height:8px;background:rgba(0,0,0,.15)"><div id="prog" style="height:8px;background:#6F5AE0;width:0"></div></div>
      <div class="d7" style="position:absolute;left:22px;top:248px;right:22px;font-size:34px;line-height:1.12">The City That Vanished in a Single Night</div>
      <div style="position:absolute;left:22px;top:350px;display:flex;align-items:center;gap:14px"><div style="width:52px;height:52px;border-radius:50%;background:#6F5AE0"></div><div class="mono" style="font-size:20px;color:var(--muted);font-weight:700">Your Channel<br>just now</div></div>
      <div id="chip" class="mono" style="position:absolute;left:22px;top:430px;height:56px;padding:0 20px;border-radius:28px;background:#141414;color:#fff;font-size:22px;font-weight:800;display:flex;align-items:center;letter-spacing:.04em">✓ UPLOAD COMPLETE</div>
      <div style="position:absolute;left:22px;right:22px;top:520px;height:130px;border-radius:16px;background:#ECE7DB"></div>
      <div style="position:absolute;left:22px;right:22px;top:668px;height:130px;border-radius:16px;background:#ECE7DB"></div>
    </div></div>`;
    const phone = extrude(rig, scr, { mode: 'slab', layers: 16, step: 3.5, side: ['#050505', '#2C2C2C'], radius: 64 });
    const timer = extrude(rig, '00:00', { layers: 16, step: 4, side: ['#21175E', '#3B2C99'], cls: 'd8 mono', style: 'font-size:150px;color:#F3EFE6;font-family:JB;letter-spacing:-0.06em' });
    const tlabel = el('div', 'o', '<div class="mono" style="font-size:38px;font-weight:800;color:#fff;letter-spacing:.2em">COOK TIME</div>', rig);
    const orbit = el('div', 'o', '<div style="width:1150px;height:1150px;border-radius:50%;border:12px dashed rgba(255,255,255,.55)"></div>', rig);
    const orbit2 = el('div', 'o', '<div style="width:1300px;height:1300px;border-radius:50%;border:4px solid rgba(255,255,255,.25)"></div>', rig);
    S.s4 = { sc, rig, phone, timer, tlabel, orbit, orbit2 };
  }
  // ---------------------------------------------------------------- S5 EARN (paper, spinning $)
  {
    const { sc, rig } = scene('s5', '#F3EFE6');
    floor(rig, 470);
    const dollar = extrude(rig, '$', { layers: 26, step: 5, side: ['#04442D', '#0C9461'], cls: 'd8', style: 'font-size:560px;color:#12B47A;line-height:1' });
    const card = extrude(rig, `<div style="width:840px;height:270px;border-radius:30px;background:#fff;position:relative">
      <div style="position:absolute;left:24px;top:24px;border-radius:18px;overflow:hidden">${artBox('cine', 392)}</div>
      <div class="d8" style="position:absolute;left:446px;top:34px;font-size:66px">Upload #1</div>
      <div class="mono" style="position:absolute;left:448px;top:112px;font-size:26px;color:var(--muted);font-weight:700">today · 1 credit</div>
      <div id="mon" class="mono" style="position:absolute;left:446px;top:172px;height:64px;padding:0 22px;border-radius:32px;background:#12B47A;color:#fff;font-size:26px;font-weight:800;display:flex;align-items:center;letter-spacing:.03em">$ AD REVENUE ON</div>
    </div>`, { mode: 'slab', layers: 10, step: 4, side: SLAB_SIDE, radius: 30 });
    S.s5 = { sc, rig, dollar, card };
  }
  // ---------------------------------------------------------------- S6 SUBS (ink, topple)
  {
    const { sc, rig } = scene('s6', '#141414');
    floor(rig, 400, 'rgba(111,90,224,.35)');
    const grp = el('div', 'o', null, rig);
    const label = el('div', 'o', '<div class="mono" style="font-size:44px;font-weight:800;color:#A8A296;letter-spacing:.14em;white-space:nowrap">SUBS NEEDED</div>', grp);
    const num = extrude(grp, '1,000', { layers: 26, step: 5, side: ['#1F1F1F', '#8F8A80'], cls: 'd8', style: 'font-size:360px;color:#F3EFE6' });
    const bar = extrude(rig, '<div style="width:1250px;height:96px;border-radius:48px;background:#6F5AE0"></div>', { mode: 'slab', layers: 10, step: 5, side: ['#2E2280', '#5A47C9'], radius: 48 });
    S.s6 = { sc, rig, grp, label, num, bar };
  }
  // ---------------------------------------------------------------- S7 CTA (paper)
  {
    const { sc, rig } = scene('s7', '#F3EFE6');
    const thumbs = NICHES.map((n) => extrude(rig, `<div style="border-radius:22px;overflow:hidden">${artBox(n.art, 420)}</div>`, { mode: 'slab', layers: 6, step: 4, side: ['#5F5A50', '#9A9486'], radius: 22 }));
    const word = extrude(rig, 'Channel<span style="color:#6F5AE0">Recipe</span>', { layers: 12, step: 3, side: ['#55524C', '#B5AFA3'], cls: 'd8', style: 'font-size:190px;color:#141414' });
    // the "Recipe" half gets purple sides
    word.lays.forEach((l, i) => { const s = l.querySelector('span'); if (s) s.style.color = mixHex('#3B2C99', '#A99BF2', i / word.lays.length); });
    const tag = el('div', 'o', '<div class="d8" style="font-size:70px;letter-spacing:-0.035em">Pick a recipe. Click generate. <span style="color:#6F5AE0">Post.</span></div>', rig);
    const btn = extrude(rig, '<div style="width:880px;height:176px;border-radius:40px;background:#6F5AE0;color:#fff;display:flex;align-items:center;justify-content:center;font:700 80px BG;letter-spacing:-0.03em">Start free trial →</div>', { mode: 'slab', layers: 12, step: 4, side: ['#2E2280', '#5A47C9'], radius: 40 });
    const url = el('div', 'o', '<div class="mono" id="url" style="font-size:46px;font-weight:800;white-space:pre"></div>', rig);
    S.s7 = { sc, rig, thumbs, word, tag, btn, url };
  }
  buildCaptions();
  buildAvatar();
}

// ============================================================================ captions
const CAP_LINES = ['pick', 'cook', 'done', 'earn', 'subs'];
const caps = {};
function buildCaptions() {
  for (const l of VO.lines) {
    if (!CAP_LINES.includes(l.id)) continue;
    const box = el('div', '', null, $('caps'));
    Object.assign(box.style, { display: 'none', width: '100%', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 18px', alignContent: 'flex-start' });
    caps[l.id] = { box, line: l, spans: l.words.map((w) => el('span', 'w', w.w.replace(/[.,]$/, ''), box)) };
  }
}
function drawCaptions(t, dark) {
  const order = VO.lines;
  let active = null;
  for (let i = 0; i < order.length; i++) {
    const l = order[i], next = order[i + 1];
    const until = Math.min(next ? next.start - 0.06 : 99, l.end + 0.35); // clear before the next cut
    if (t >= l.start - 0.05 && t < until) active = l.id;
  }
  for (const id in caps) {
    const c = caps[id];
    const on = id === active;
    c.box.style.display = on ? 'flex' : 'none';
    if (!on) continue;
    c.line.words.forEach((w, i) => {
      const s = c.spans[i];
      const p = P(t, w.start - 0.04, 0.22);
      s.style.visibility = t >= w.start - 0.04 ? 'visible' : 'hidden';
      const cur = t >= w.start - 0.04 && (t < w.end || i === c.line.words.length - 1 && t < w.end + 0.25);
      s.style.transform = `translateY(${(1 - oQuint(p)) * 40}px) scale(${lerp(0.55, 1, spring(p, 6, 12))}) rotate(${cur ? -2 : 0}deg)`;
      s.style.background = cur ? (dark === 'purple' ? '#F3EFE6' : '#6F5AE0') : 'transparent';
      s.style.color = cur ? (dark === 'purple' ? '#6F5AE0' : '#fff') : (dark ? '#F3EFE6' : '#141414');
    });
  }
}

// ============================================================================ avatar (original chef mascot)
const AV = {};
function buildAvatar() {
  const av = $('av');
  for (let i = 10; i >= 1; i--) {
    const d = el('div', 'disc', null, av);
    d.style.background = mixHex('#2E2280', '#5A47C9', 1 - i / 10);
    d.style.transform = `translateZ(${-i * 5}px)`;
  }
  // designed back face so the mid-spin frames read as a coin, not a blob
  const back = el('div', 'disc', `<svg viewBox="0 0 380 380" width="380" height="380"><path d="M108 210 Q96 120 160 124 Q172 76 222 88 Q282 80 286 140 Q330 150 296 214 Z" fill="#fff"/><rect x="104" y="204" width="196" height="54" rx="14" fill="#fff"/><rect x="104" y="222" width="196" height="14" fill="#6F5AE0"/></svg>`, av);
  back.style.background = '#5641C9'; back.style.transform = 'translateZ(-56px) rotateY(180deg)';
  av.insertAdjacentHTML('beforeend', `
  <svg viewBox="0 -60 400 460">
    <defs>
      <clipPath id="discClip"><circle cx="200" cy="200" r="190"/></clipPath>
      <radialGradient id="skin" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#FFDDBF"/><stop offset=".6" stop-color="#F2BD95"/><stop offset="1" stop-color="#D6966C"/></radialGradient>
      <radialGradient id="hatG" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".7" stop-color="#EEEAF7"/><stop offset="1" stop-color="#CFC7EA"/></radialGradient>
      <radialGradient id="discG" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#8B78F0"/><stop offset="1" stop-color="#5B47CF"/></radialGradient>
      <clipPath id="mouthClip"><path id="mouthClipPath" d="M0 0"/></clipPath>
    </defs>
    <circle cx="200" cy="200" r="190" fill="url(#discG)"/>
    <g clip-path="url(#discClip)">
      <rect x="168" y="250" width="64" height="70" fill="#E7AA80"/>
      <path d="M40 420 Q52 312 200 296 Q348 312 360 420 Z" fill="#FFFFFF"/>
      <path d="M200 296 L168 300 L200 352 L232 300 Z" fill="#6F5AE0"/>
      <path d="M200 352 L186 384 L214 384 Z" fill="#5641C9"/>
      <circle cx="160" cy="350" r="7" fill="#C9C1E8"/><circle cx="160" cy="385" r="7" fill="#C9C1E8"/>
      <circle cx="240" cy="350" r="7" fill="#C9C1E8"/><circle cx="240" cy="385" r="7" fill="#C9C1E8"/>
      <path d="M120 310 Q140 330 150 400" stroke="#E4DFF2" stroke-width="5" fill="none"/>
    </g>
    <g id="head">
      <g id="ears"><ellipse id="earL" cx="110" cy="200" rx="15" ry="24" fill="#E8A97F"/><ellipse id="earR" cx="290" cy="200" rx="15" ry="24" fill="#E8A97F"/></g>
      <ellipse cx="200" cy="192" rx="94" ry="104" fill="url(#skin)"/>
      <path d="M108 150 Q104 186 114 214 L122 214 Q118 180 126 150 Z" fill="#4A2E22"/>
      <path d="M292 150 Q296 186 286 214 L278 214 Q282 180 274 150 Z" fill="#4A2E22"/>
      <g id="face">
        <ellipse cx="146" cy="232" rx="20" ry="11" fill="#F08A8A" opacity=".35"/>
        <ellipse cx="254" cy="232" rx="20" ry="11" fill="#F08A8A" opacity=".35"/>
        <g id="eyeL"><ellipse cx="164" cy="186" rx="19" ry="23" fill="#fff"/><circle id="pupL" cx="164" cy="188" r="11" fill="#22140F"/><circle id="hlL" cx="168" cy="183" r="3.6" fill="#fff"/></g>
        <g id="eyeR"><ellipse cx="236" cy="186" rx="19" ry="23" fill="#fff"/><circle id="pupR" cx="236" cy="188" r="11" fill="#22140F"/><circle id="hlR" cx="240" cy="183" r="3.6" fill="#fff"/></g>
        <path id="lidL" d="M140 170 Q164 150 188 170" stroke="#22140F" stroke-width="6" fill="none" stroke-linecap="round" opacity="0"/>
        <path id="lidR" d="M212 170 Q236 150 260 170" stroke="#22140F" stroke-width="6" fill="none" stroke-linecap="round" opacity="0"/>
        <path id="browL" d="M142 150 Q164 136 186 146" stroke="#4A2E22" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path id="browR" d="M214 146 Q236 136 258 150" stroke="#4A2E22" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="M201 200 Q190 226 206 230" stroke="#C47E58" stroke-width="5" fill="none" stroke-linecap="round"/>
        <g id="mouthG"><path id="mouthIn" fill="#3B1515"/><g clip-path="url(#mouthClip)"><rect id="teeth" fill="#fff"/><ellipse id="tongue" fill="#E0707A"/></g></g>
        <path id="smile" stroke="#3B1515" stroke-width="7" fill="none" stroke-linecap="round"/>
      </g>
      <g id="hat">
        <path d="M118 110 Q112 40 160 44 Q170 6 214 14 Q262 0 276 46 Q318 52 284 112 Z" fill="url(#hatG)"/>
        <path d="M160 44 Q176 70 172 100 M214 14 Q218 60 206 104 M276 46 Q256 74 246 104" stroke="#DCD5F0" stroke-width="5" fill="none"/>
        <rect x="112" y="96" width="176" height="46" rx="12" fill="#FFFFFF"/>
        <rect x="112" y="112" width="176" height="12" fill="#6F5AE0"/>
      </g>
    </g>
  </svg>`);
  ['head', 'face', 'ears', 'earL', 'earR', 'hat', 'eyeL', 'eyeR', 'pupL', 'pupR', 'hlL', 'hlR', 'lidL', 'lidR', 'browL', 'browR', 'mouthIn', 'mouthClipPath', 'teeth', 'tongue', 'smile', 'mouthG'].forEach((id) => (AV[id] = $(id)));
  // deterministic blink schedule
  const R = mulberry32(4242); AV.blinks = []; for (let t = 0.8; t < DUR; t += 2.2 + R() * 1.8) AV.blinks.push(t);
}
function drawAvatar(t, st) {
  // st: { x, y, s, ry, rx, rz, yaw, gx, gy, wink, laugh, visible }
  const wrap = $('av');
  wrap.style.display = st.visible ? '' : 'none';
  if (!st.visible) return;
  wrap.style.transform = `translate3d(${(st.x - 200).toFixed(1)}px,${(st.y - 200).toFixed(1)}px,0) rotateY(${st.ry.toFixed(2)}deg) rotateX(${st.rx.toFixed(2)}deg) rotateZ(${st.rz.toFixed(2)}deg) scale(${st.s.toFixed(4)})`;
  const env = voAt(VO.env, t), open = Math.pow(voAt(VO.open, t), 1.35), wide = voAt(VO.wide, t);
  const yaw = st.yaw, fx = yaw * 24, fy = st.pitch || 0;
  // head bob + idle tilt
  const bob = -env * 7 + Math.sin(t * 1.9) * 2.5, tilt = Math.sin(t * 1.15) * 3 + yaw * 4 + env * Math.sin(t * 7) * 2;
  AV.head.setAttribute('transform', `rotate(${tilt.toFixed(2)} 200 260) translate(0 ${bob.toFixed(2)})`);
  AV.face.setAttribute('transform', `translate(${fx.toFixed(2)} ${fy.toFixed(2)}) scale(${(1 - Math.abs(yaw) * 0.08).toFixed(3)} 1)`);
  AV.face.style.transformOrigin = '200px 200px';
  AV.earL.setAttribute('cx', (110 + fx * 0.35 + Math.max(0, yaw) * 10).toFixed(1));
  AV.earR.setAttribute('cx', (290 + fx * 0.35 + Math.min(0, yaw) * 10).toFixed(1));
  AV.hat.setAttribute('transform', `translate(${(fx * 0.35).toFixed(2)} 0)`);
  // eyes: blink / wink / laugh
  let bl = 0;
  for (const b of AV.blinks) { const p = P(t, b, 0.15); if (p > 0 && p < 1) bl = Math.max(bl, Math.sin(Math.PI * p)); }
  const lL = Math.max(bl, st.wink || 0, st.laugh || 0), lR = Math.max(bl, st.laugh || 0);
  [['eyeL', lL, 164, 'lidL'], ['eyeR', lR, 236, 'lidR']].forEach(([id, c, cx, lid]) => {
    AV[id].setAttribute('transform', `translate(0 ${186 * c * 0.92}) scale(1 ${(1 - c * 0.92).toFixed(3)})`);
    AV[lid].setAttribute('opacity', c > 0.6 ? 1 : 0);
    AV[lid].setAttribute('transform', `translate(0 ${16 + (st.laugh ? -2 : 0)})`);
  });
  const gx = st.gx || 0, gy = st.gy || 0;
  AV.pupL.setAttribute('cx', 164 + gx); AV.pupL.setAttribute('cy', 188 + gy);
  AV.pupR.setAttribute('cx', 236 + gx); AV.pupR.setAttribute('cy', 188 + gy);
  AV.hlL.setAttribute('cx', 168 + gx); AV.hlL.setAttribute('cy', 183 + gy);
  AV.hlR.setAttribute('cx', 240 + gx); AV.hlR.setAttribute('cy', 183 + gy);
  // brows lift on emphasis + with loudness
  const lift = (st.brow || 0) * 12 + env * 4;
  AV.browL.setAttribute('transform', `translate(0 ${-lift.toFixed(2)}) rotate(${(-(st.brow || 0) * 4).toFixed(2)} 164 146)`);
  AV.browR.setAttribute('transform', `translate(0 ${-lift.toFixed(2)}) rotate(${((st.brow || 0) * 4).toFixed(2)} 236 146)`);
  // mouth
  const cx = 200, cy = 252;
  const hw = 26 + 16 * wide - 8 * open * (1 - wide) + (st.laugh || 0) * 10, h = 2 + 44 * open + (st.laugh || 0) * 16;
  const up = 4 + h * 0.12;
  const d = `M${cx - hw} ${cy} C${cx - hw * 0.5} ${cy - up} ${cx + hw * 0.5} ${cy - up} ${cx + hw} ${cy} C${cx + hw * 0.75} ${cy + h * 1.3} ${cx - hw * 0.75} ${cy + h * 1.3} ${cx - hw} ${cy} Z`;
  const talking = open > 0.06 || st.laugh > 0.1;
  AV.mouthG.style.display = talking ? '' : 'none';
  AV.smile.style.display = talking ? 'none' : '';
  AV.mouthIn.setAttribute('d', d); AV.mouthClipPath.setAttribute('d', d);
  Object.entries({ x: cx - hw, y: cy - up - 4, width: hw * 2, height: 12 + h * 0.1, rx: 4 }).forEach(([k, v]) => AV.teeth.setAttribute(k, v.toFixed ? v.toFixed(2) : v));
  Object.entries({ cx, cy: cy + h * 1.05, rx: hw * 0.62, ry: h * 0.42 + 2 }).forEach(([k, v]) => AV.tongue.setAttribute(k, v.toFixed(2)));
  AV.smile.setAttribute('d', `M${cx - 28} ${cy - 4} Q${cx} ${cy + 18} ${cx + 28} ${cy - 4}`);
}

// ============================================================================ SEEK
window.seek = function seek(t) {
  const frame = Math.round(t * FPS);
  $('grain').style.transform = `translate(${(hash(frame) * 60 - 30).toFixed(1)}px,${(hash(frame + 7777) * 60 - 30).toFixed(1)}px)`;
  const c = C;
  const cut = { pick: Tm(c.pick), cook: Tm(c.cook), done: Tm(c.done), earn: Tm(c.earn), subs: Tm(c.subs), cta: Tm(c.cta) };
  const hooks = c.hook.map(Tm);
  // camera shake from impacts (pure function of t)
  const hits = [...hooks, cut.pick, cut.cook, cut.done, cut.earn, cut.subs, Tm(c.smash), Tm(c.topple) + 0.3, cut.cta];
  let shx = 0, shy = 0, shr = 0;
  for (const h of hits) { const d = t - h; if (d < 0 || d > 0.4) continue; const a = Math.exp(-d * 12); shx += Math.sin(d * 90 + h * 7) * 18 * a; shy += Math.cos(d * 77 + h * 3) * 14 * a; shr += Math.sin(d * 60 + h) * 0.8 * a; }
  const sceneOf = (a, b, pre = 0, post = 0) => t >= a - pre && t < b + post;

  // ---------------------------------------------------------------- S1
  {
    const s = S.s1, on = sceneOf(0, cut.pick);
    show(s.sc, on);
    if (on) {
      s.words.forEach((w, i) => {
        const h = hooks[i], t0 = h - 0.28;
        show(w.g, t >= (i === 0 ? -1 : t0));
        const pin = P(t, t0, 0.28), land = P(t, h, 0.5);
        let z = lerp(1250, 0, iQuad(pin)) - (t >= h ? Math.sin(land * Math.PI * 2) * Math.exp(-land * 5) * 60 : 0);
        let rx = lerp(-55, 0, oCub(pin)), ry = 0, y = 0, rz = lerp(i % 2 ? 8 : -8, 0, oCub(pin));
        for (let j = i + 1; j < 3; j++) { const q = oCub(P(t, hooks[j] - 0.14, 0.4)); z -= 1500 * q; y -= 1100 * q; ry += (i % 2 ? -34 : 34) * q; rx += 40 * q; }
        place(w.g, { x: 0, y: y - 60, z, rx, ry, rz });
        place(w.no.o, { x: -w.wd.front.offsetWidth / 2 + w.no.front.offsetWidth / 2, y: -150, z: 0 });
        place(w.wd.o, { y: 90 });
      });
      const fly = iCub(P(t, cut.pick - 0.3, 0.3));
      cam(s.rig, { tx: shx, ty: shy, roll: Math.sin(t * 1.3) * 2 + shr, yaw: Math.sin(t * 0.9) * 6, pitch: -4, dolly: lerp(250, 0, oCub(P(t, 0, 2))) - fly * 2600 });
    }
  }
  // ---------------------------------------------------------------- S2 carousel
  {
    const s = S.s2, a = cut.pick, b = cut.cook, on = sceneOf(a, b, 0, 0.2);
    show(s.sc, on);
    if (on) {
      const tp = Tm(c.picked);
      const spinP = oQuart(P(t, a, tp - a + 0.1));
      const A = -270 - (1 - spinP) * 630; // card 3 lands facing camera
      const R = 640, cz = -700;
      const pk = spring(P(t, tp, 0.55), 6, 11);
      s.cards.forEach((cd, i) => {
        const ang = A + i * 90, rad = (ang * Math.PI) / 180;
        let x = Math.sin(rad) * R, z = cz + Math.cos(rad) * R, y = -80, ry = ang, rx = 0, sc = 1;
        if (i === 3) { z += 560 * pk; y -= 10 * pk; sc = lerp(1, 1.06, pk); }
        else { const q = oCub(P(t, tp, 0.4)); y += 260 * q; rx -= 30 * q; z -= 200 * q; }
        place(cd.o, { x, y, z, ry, rx, s: sc });
      });
      s.ring.style.clipPath = `inset(0 ${(1 - oCub(P(t, tp, 0.3))) * 100}% 0 0 round 38px)`;
      show(s.ring, t >= tp);
      show(s.pill, t >= tp + 0.05);
      place(s.pill, { y: -80 - 360 * 1.06, z: cz + R + 560 + 30, s: spring(P(t, tp + 0.05, 0.45), 6, 12) });
      // whip out to S3
      const wo = iCub(P(t, b - 0.18, 0.18));
      const incoming = oQuint(P(t, a, 0.6));
      cam(s.rig, { tx: shx, ty: shy - 40, roll: shr + wo * 10, yaw: lerp(14, -4, oCub(P(t, a, b - a))) + wo * 75, pitch: lerp(-24, -8, oCub(P(t, a, 1.6))), dolly: lerp(2600, 40, incoming) });
      s.sc.style.filter = wo > 0.05 ? `blur(${(wo * 22).toFixed(1)}px)` : 'none';
    }
  }
  // ---------------------------------------------------------------- S3 stations
  {
    const s = S.s3, a = cut.cook, b = cut.done, on = sceneOf(a, b, 0, 0.28);
    show(s.sc, on);
    if (on) {
      const vb = Tm(c.verbs[1]), vc = Tm(c.verbs[2]);
      const txAt = (u) => 1100 * ioCub(P(u, vb - 0.4, 0.55)) + 1100 * ioCub(P(u, vc - 0.4, 0.55));
      const tx = txAt(t), vel = (txAt(t + 0.02) - txAt(t - 0.02)) / 0.04;
      const reveal = [a + 0.02, vb - 0.3, vc - 0.3];
      s.st.forEach((st, i) => {
        const p = spring(P(t, reveal[i], 0.6), 5.5, 11);
        show(st.o, t >= reveal[i]);
        const ry = clamp(((i * 1100 - tx) / 1100) * -32, -45, 45);
        place(st.o, { x: i * 1100, y: 330, z: 120, ry, rx: lerp(88, 0, p), ax: 0.5, ay: 1, s: 1.12 });
      });
      // script types between reveal and the "voices" move
      const TXT = '<span class="k">[HOOK 0:00]</span>\nIn 1347, a ship drifted\ninto a Sicilian port.\nNo one aboard\nwas alive.';
      const plain = TXT.replace(/<[^>]+>/g, '');
      const n = Math.floor(clamp((t - a - 0.2) / ((vb - a - 0.4) / plain.length), 0, plain.length));
      // rebuild visible prefix preserving the accent span
      const k = '[HOOK 0:00]';
      const vis = n <= k.length ? `<span class="k">${k.slice(0, n)}</span>` : `<span class="k">${k}</span>${plain.slice(k.length, n)}`;
      document.getElementById('typed').innerHTML = vis + (n < plain.length ? '▌' : '');
      // waveform columns (driven by the actual VO envelope)
      const pb = spring(P(t, reveal[1], 0.6), 5.5, 11);
      show(s.bars, t >= reveal[1] + 0.1);
      place(s.bars, { x: 1100, y: 330, z: 120 + 66, ry: clamp(((1100 - tx) / 1100) * -32, -45, 45), rx: lerp(88, 0, pb), ax: 0, ay: 0 });
      s.cols.forEach((col, k2) => {
        const e = voAt(VO.env, t - k2 * 0.018);
        const hgt = 30 + 300 * e * (0.55 + 0.45 * Math.sin(k2 * 1.7 + 1)) * oCub(P(t, vb, 0.3));
        col.front.firstElementChild.style.height = hgt.toFixed(1) + 'px';
        col.lays.forEach((l) => (l.style.height = hgt.toFixed(1) + 'px'));
        place(col.o, { x: -336 + k2 * 32.5, y: -190, z: 0, ax: 0.5, ay: 1, s: 1.12 });
      });
      // timeline: clips slam into tracks, playhead sweeps
      s.clips.forEach((cl, i) => {
        const p = oQuint(P(t, vc - 0.2 + i * 0.07, 0.35));
        cl.d.style.transform = `translateX(${((1 - p) * 760).toFixed(1)}px)`;
      });
      document.getElementById('ph').style.left = (40 + 680 * ioCub(P(t, vc + 0.2, b - vc))) + 'px';
      // cube roll out to S4 (handled on the scene container)
      const co = P(t, b - 0.14, 0.28);
      s.sc.style.transform = co > 0 ? `translateZ(-960px) rotateX(${(oCub(co) * 90).toFixed(2)}deg) translateZ(960px)` : 'none';
      cam(s.rig, { tx: tx + shx, ty: shy - 40, yaw: clamp(-vel / 160, -18, 18) + lerp(-60, 0, oQuint(P(t, a, 0.4))), roll: clamp(vel / 500, -6, 6) + shr, pitch: -8, dolly: 60 });
      s.sc.style.filter = t < a + 0.25 ? `blur(${((1 - P(t, a, 0.25)) * 20).toFixed(1)}px)` : 'none';
    }
  }
  // ---------------------------------------------------------------- S4 phone
  {
    const s = S.s4, a = cut.done, b = cut.earn, on = sceneOf(a, b, 0.14, 0);
    show(s.sc, on);
    if (on) {
      const ci = P(t, a - 0.14, 0.28);
      s.sc.style.transform = ci < 1 ? `translateZ(-960px) rotateX(${((1 - oCub(ci)) * -90).toFixed(2)}deg) translateZ(960px)` : 'none';
      const td = Tm(c.ding);
      const sp = oQuint(P(t, a, 1.35));
      const pop = t >= td ? 1 + 0.05 * Math.sin(Math.PI * P(t, td, 0.3)) : 1;
      place(s.phone.o, { x: 0, y: 40 + Math.sin(t * 1.6) * 12, z: lerp(-1800, 0, sp), ry: lerp(620, -14, sp), rx: lerp(-20, 4, sp), rz: lerp(-12, 0, sp), s: pop });
      // timer counts to 15:00 at the ding
      const pr = ioCub(P(t, a + 0.25, td - a - 0.25));
      const secs = Math.round(pr * 900);
      setText(s.timer, `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`);
      const tp = spring(P(t, a + 0.2, 0.6), 6, 12);
      place(s.timer.o, { x: 150, y: -560, z: 260, ry: -18 + Math.sin(t * 1.2) * 4, rx: lerp(-90, 0, tp), s: (t >= td ? 1 + 0.12 * Math.sin(Math.PI * P(t, td, 0.3)) : 1) });
      place(s.tlabel, { x: 150, y: -440, z: 260, ry: -18 + Math.sin(t * 1.2) * 4, rx: lerp(-90, 0, tp) });
      place(s.orbit, { x: 0, y: 40, z: 0, rx: 74, rz: t * 55, s: lerp(0.2, 1, oCub(P(t, a + 0.1, 0.6))) });
      place(s.orbit2, { x: 0, y: 40, z: 0, rx: 66, ry: 12, rz: -t * 30, s: lerp(0.2, 1, oCub(P(t, a + 0.2, 0.6))) });
      document.getElementById('prog').style.width = (404 * pr).toFixed(1) + 'px';
      const chip = document.getElementById('chip');
      chip.style.visibility = t >= td ? 'visible' : 'hidden';
      chip.style.transform = `scale(${spring(P(t, td, 0.4), 6, 12)})`; chip.style.transformOrigin = '0 50%';
      chip.style.background = t >= td ? '#6F5AE0' : '#141414';
      // zoom into the screen for the hand-off to S5
      const zi = iCub(P(t, b - 0.3, 0.3));
      cam(s.rig, { tx: shx, ty: shy + lerp(0, 30, zi), yaw: lerp(-22, 16, ioCub(P(t, a, b - a))) * (1 - zi), pitch: -6 * (1 - zi), roll: shr, dolly: lerp(lerp(500, 150, oCub(P(t, a, b - a))), -1350, zi) });
    }
  }
  // ---------------------------------------------------------------- S5 earn
  {
    const s = S.s5, a = cut.earn, b = cut.subs, on = sceneOf(a, b, 0, 0.2);
    show(s.sc, on);
    if (on) {
      const zi = oQuint(P(t, a, 0.45));
      s.sc.style.clipPath = zi < 1 ? `inset(${lerp(560, 0, zi).toFixed(1)}px ${lerp(330, 0, zi).toFixed(1)}px ${lerp(800, 0, zi).toFixed(1)}px ${lerp(330, 0, zi).toFixed(1)}px round ${lerp(48, 0, zi).toFixed(1)}px)` : 'none';
      const tf = Tm(c.first);
      const burst = oCub(P(t, tf, 0.7)) * 360;
      place(s.dollar.o, { x: 0, y: -300 + Math.sin(t * 2) * 14, z: -250, ry: (t - a) * 140 + burst - 40, s: lerp(0.4, 1, spring(P(t, a + 0.05, 0.6), 6, 12)) });
      const cp = spring(P(t, a + 0.15, 0.6), 6, 11);
      const pulse = t >= tf ? 1 + 0.05 * Math.sin(Math.PI * P(t, tf, 0.3)) : 1;
      place(s.card.o, { x: 0, y: lerp(900, 230, cp), z: 120, rx: lerp(50, -6, cp), ry: Math.sin(t * 1.4) * 5, s: pulse });
      const mon = document.getElementById('mon');
      mon.style.visibility = t >= tf - 0.05 ? 'visible' : 'hidden';
      mon.style.transform = `scale(${spring(P(t, tf - 0.05, 0.45), 6, 12)})`; mon.style.transformOrigin = '0 50%';
      const wo = iCub(P(t, b - 0.18, 0.18));
      cam(s.rig, { tx: shx, ty: shy, yaw: Math.sin(t * 0.8) * 10 - wo * 75, pitch: lerp(14, -4, oCub(P(t, a, b - a))), roll: shr - wo * 10, dolly: lerp(380, -60, oCub(P(t, a, b - a))) });
      s.sc.style.filter = wo > 0.05 ? `blur(${(wo * 22).toFixed(1)}px)` : 'none';
    }
  }
  // ---------------------------------------------------------------- S6 subs
  {
    const s = S.s6, a = cut.subs, b = cut.cta, on = sceneOf(a, b, 0, 0.2);
    show(s.sc, on);
    if (on) {
      const sm = Tm(c.smash), tp = Tm(c.topple) + 0.3;
      const rise = spring(P(t, a, 0.6), 6, 11);
      const fall = bounce(P(t, tp - 0.35, 0.75));
      place(s.grp, { x: 0, y: 380, z: -150, rx: lerp(70, 0, rise) - 90 * fall, ax: 0.5, ay: 1 });
      place(s.num.o, { y: 0, ax: 0.5, ay: 1 });
      place(s.label, { y: -s.num.front.offsetHeight - 20, ax: 0.5, ay: 1 });
      const bi = iQuad(P(t, sm - 0.14, 0.14));
      const bfall = iCub(P(t, tp, 0.5));
      show(s.bar.o, t >= sm - 0.14);
      place(s.bar.o, { x: 0, y: lerp(-80, 120, bi) + bfall * 700, z: lerp(1300, 140, bi), rz: -14 + bfall * 30, rx: bfall * 40 });
      const wi = 1 - oQuint(P(t, a, 0.35));
      const fo = iCub(P(t, b - 0.2, 0.2));
      s.sc.style.transform = fo > 0 ? `rotateY(${(fo * 90).toFixed(2)}deg)` : 'none';
      cam(s.rig, { tx: shx, ty: shy - 60, yaw: wi * 70 + Math.sin(t * 0.7) * 6, pitch: lerp(10, 4, oCub(P(t, a, b - a))), roll: shr + wi * 10, dolly: lerp(600, 120, oCub(P(t, a, b - a))) });
      s.sc.style.filter = wi > 0.05 ? `blur(${(wi * 22).toFixed(1)}px)` : 'none';
    }
  }
  // ---------------------------------------------------------------- S7 CTA
  {
    const s = S.s7, a = cut.cta, on = t >= a;
    show(s.sc, on);
    if (on) {
      const fi = spring(P(t, a, 0.6), 5, 10);
      s.sc.style.transform = fi < 1 ? `rotateY(${((1 - fi) * -90).toFixed(2)}deg)` : 'none';
      s.thumbs.forEach((th, i) => {
        const ang = (t - a) * 34 + i * 90, rad = (ang * Math.PI) / 180;
        place(th.o, { x: Math.sin(rad) * 820, y: -700 + Math.sin(t * 1.3 + i) * 24, z: -1100 + Math.cos(rad) * 520, ry: ang, s: lerp(0, 1, oCub(P(t, a + 0.1 + i * 0.05, 0.5))) });
      });
      const wp = spring(P(t, a + 0.05, 0.7), 5.5, 11);
      place(s.word.o, { y: -250, z: lerp(-900, 0, wp), rx: lerp(-80, 0, wp), ry: Math.sin((t - a) * 1.1) * 9 });
      const tg = oQuint(P(t, a + 0.35, 0.45));
      place(s.tag, { y: -60 + (1 - tg) * 60, z: 0, rx: lerp(-90, 0, tg) });
      const tr = Tm(c.trial), td = Tm(c.today);
      const bp = spring(P(t, tr - 0.1, 0.6), 6, 11);
      let press = 0; for (const h of [td, td + 1, td + 2]) if (t >= h) press = Math.max(press, Math.exp(-(t - h) * 8) * Math.sin(Math.min(1, (t - h) / 0.08) * Math.PI / 2));
      show(s.btn.o, t >= tr - 0.1);
      place(s.btn.o, { y: 180, z: lerp(900, 0, bp) - press * 40, rx: lerp(70, 6, bp) + Math.sin(t * 1.5) * 3, ry: Math.sin(t * 1.1) * 5, s: 1 - press * 0.03 });
      const URL_T = 'channelrecipe.com · from $27/mo';
      const n = Math.floor(clamp((t - tr - 0.3) / 0.018, 0, URL_T.length));
      document.getElementById('url').innerHTML = URL_T.slice(0, n).replace('·', '<span style="color:#6F5AE0">·</span>') + (n > 0 && n < URL_T.length ? '▌' : '');
      place(s.url, { y: 360, z: 0 });
      cam(s.rig, { tx: shx, ty: shy, yaw: Math.sin((t - a) * 0.7) * 7, pitch: -5, roll: shr, dolly: lerp(500, 60, oCub(P(t, a, DUR - a))) });
    }
  }

  // ---------------------------------------------------------------- captions
  const dark = t < cut.pick ? 'ink' : t >= cut.done && t < cut.earn ? 'purple' : t >= cut.subs && t < cut.cta ? 'ink' : null;
  $('caps').style.display = t >= cut.pick && t < cut.cta ? 'flex' : 'none';
  drawCaptions(t, dark);

  // ---------------------------------------------------------------- avatar choreography
  const faceHit = hooks[2] + 0.05;
  const big = { x: 540, y: 1430, s: 1.55 }, dock = { x: 225, y: 1660, s: 0.86 }, end = { x: 540, y: 1500, s: 1.3 };
  let pos, ry = 0, rx = 0, rz = 0;
  const intro = spring(P(t, faceHit, 0.6), 5.5, 10);
  if (t < cut.pick) { pos = { x: big.x, y: lerp(2300, big.y, intro), s: big.s }; ry = lerp(-200, 0, oQuint(P(t, faceHit, 0.55))); }
  else if (t < cut.cta) {
    const m = ioCub(P(t, cut.pick, 0.5));
    pos = { x: lerp(big.x, dock.x, m), y: lerp(big.y, dock.y, m) - Math.sin(m * Math.PI) * 220, s: lerp(big.s, dock.s, m) };
    ry = m < 1 ? 360 * m : 0;
  } else {
    const m = ioCub(P(t, cut.cta, 0.6));
    pos = { x: lerp(dock.x, end.x, m), y: lerp(dock.y, end.y, m) - Math.sin(m * Math.PI) * 180, s: lerp(dock.s, end.s, m) };
    ry = -360 * m;
  }
  // react to every cut with a squash-wobble; lean with whips
  for (const h of [cut.cook, cut.done, cut.earn, cut.subs]) { const d = t - h; if (d >= 0 && d < 0.6) { rz += Math.sin(d * 22) * Math.exp(-d * 6) * 9; rx += Math.sin(d * 18) * Math.exp(-d * 6) * 14; } }
  ry += Math.sin(t * 0.9) * 10;
  const emph = ['proven', 'fifteen', 'first', 'thousand', 'free'];
  let brow = 0;
  for (const l of VO.lines) for (const w of l.words) if (emph.includes(w.w.toLowerCase().replace(/[^a-z]/g, ''))) { const d = t - w.start; if (d > -0.05 && d < 0.6) brow = Math.max(brow, Math.exp(-Math.max(0, d) * 4)); }
  const tp = Tm(c.topple) + 0.3;
  drawAvatar(t, {
    visible: t >= faceHit, x: pos.x, y: pos.y, s: pos.s, ry, rx, rz,
    yaw: t < cut.pick ? 0 : t < cut.cta ? 0.28 + Math.sin(t * 0.8) * 0.15 : -0.1 + Math.sin(t * 0.7) * 0.12,
    gx: t < cut.pick ? 0 : t < cut.cta ? 5 : -2, gy: t < cut.pick ? 0 : t < cut.cta ? -6 : -4,
    wink: t >= faceHit + 0.25 && t < cut.pick ? Math.sin(Math.PI * P(t, faceHit + 0.25, 0.35)) : 0,
    laugh: Math.sin(Math.PI * P(t, tp - 0.1, 0.7)) * 0.9,
    brow,
  });
};

// ============================================================================ boot
window.ready = (async () => {
  const [beats, cues, vo] = await Promise.all(['beats.json', 'cues.json', 'vo.json'].map((f) => fetch(f).then((r) => r.json())));
  BEATS = beats.beats; C = cues; VO = vo;
  for (const f of ['800 100px BG', '700 100px BG', '500 100px BG', '700 40px JB', '800 40px JB', '400 40px JB']) await document.fonts.load(f);
  await document.fonts.ready;
  build();
  // fit the hook nouns and wordmark (layout widths are transform-independent)
  const fitX = (ex, maxW) => { const w = ex.front.offsetWidth; if (w > maxW) ex.x.style.fontSize = (parseFloat(getComputedStyle(ex.x).fontSize) * maxW / w).toFixed(1) + 'px'; };
  S.s1.words.forEach((w) => fitX(w.wd, 940));
  fitX(S.s7.word, 960);
  fitX(S.s6.num, 900);
  window.seek(0);
  return true;
})();

if (!new URLSearchParams(location.search).has('render')) {
  const fitStage = () => { const s = Math.min(innerWidth / W, innerHeight / H); $('stage').style.transform = `scale(${s})`; };
  addEventListener('resize', fitStage); fitStage();
  window.ready.then(() => {
    const a = new Audio('out/audio.wav');
    document.body.addEventListener('click', () => { a.currentTime = 0; a.play(); });
    const loop = () => { window.seek(a.paused ? 0 : a.currentTime); requestAnimationFrame(loop); };
    loop();
  });
}
