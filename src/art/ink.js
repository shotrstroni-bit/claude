window.BB = window.BB || {};

// Turns SVG path data into filled "brush" shapes so lines taper and swell like hand inking.
BB.Ink = (function () {
  const SHADOW_DIR = [0.55, 0.835];

  function tokenize(d) {
    return d.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  }

  function sample(d, step) {
    const tk = tokenize(d);
    const subs = [];
    let i = 0, cmd = null, cur = null, x = 0, y = 0, sx = 0, sy = 0;
    const num = () => parseFloat(tk[i++]);
    const push = (px, py) => cur.pts.push([px, py]);
    while (i < tk.length) {
      if (/[A-Za-z]/.test(tk[i])) cmd = tk[i++].toUpperCase();
      else if (cmd === 'M') cmd = 'L';
      if (cmd === 'M') {
        x = sx = num(); y = sy = num();
        cur = { pts: [[x, y]], closed: false };
        subs.push(cur);
      } else if (cmd === 'L') {
        const nx = num(), ny = num();
        const n = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / step));
        for (let k = 1; k <= n; k++) push(x + (nx - x) * k / n, y + (ny - y) * k / n);
        x = nx; y = ny;
      } else if (cmd === 'C' || cmd === 'Q') {
        const c = cmd === 'C' ? [num(), num(), num(), num(), num(), num()] : [num(), num(), num(), num()];
        const ex = c[c.length - 2], ey = c[c.length - 1];
        let len = 0, px = x, py = y;
        for (let k = 0; k < c.length; k += 2) { len += Math.hypot(c[k] - px, c[k + 1] - py); px = c[k]; py = c[k + 1]; }
        const n = Math.max(3, Math.ceil(len / step));
        for (let k = 1; k <= n; k++) {
          const t = k / n, u = 1 - t;
          if (cmd === 'C') push(
            u * u * u * x + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * ex,
            u * u * u * y + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * ey);
          else push(u * u * x + 2 * u * t * c[0] + t * t * ex, u * u * y + 2 * u * t * c[1] + t * t * ey);
        }
        x = ex; y = ey;
      } else if (cmd === 'Z') {
        if (Math.hypot(x - sx, y - sy) > 0.01) {
          const n = Math.max(1, Math.ceil(Math.hypot(sx - x, sy - y) / step));
          for (let k = 1; k <= n; k++) push(x + (sx - x) * k / n, y + (sy - y) * k / n);
        }
        cur.pts.pop();
        cur.closed = true;
        x = sx; y = sy;
      } else {
        i++;
      }
    }
    return subs;
  }

  function normals(pts, closed) {
    const n = pts.length;
    return pts.map((p, i) => {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      return [-ty / l, tx / l];
    });
  }

  const f = (v) => Math.round(v * 100) / 100;
  const ease = (u) => { u = Math.min(1, Math.max(0, u)); return u * (2 - u); };

  function ribbon(pts, closed, widthAt) {
    const nm = normals(pts, closed);
    const L = [], R = [];
    pts.forEach((p, i) => {
      const w = widthAt(i, nm[i]) / 2;
      L.push(f(p[0] + nm[i][0] * w) + ' ' + f(p[1] + nm[i][1] * w));
      R.push(f(p[0] - nm[i][0] * w) + ' ' + f(p[1] - nm[i][1] * w));
    });
    if (closed) return 'M' + L.join(' L') + ' Z M' + R.join(' L') + ' Z';
    return 'M' + L.join(' L') + ' L' + R.reverse().join(' L') + ' Z';
  }

  function attrs(o) {
    return `fill="${o.color || '#2a1a24'}"` + (o.opacity != null ? ` opacity="${o.opacity}"` : '') + (o.filter ? ` filter="url(#${o.filter})"` : '');
  }

  function strokeClosed(pts, o) {
    const w = o.w || 2, lo = o.lo != null ? o.lo : 0.5, seed = o.seed || 1;
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const nm = normals(pts, true);
    let sgn = 0;
    pts.forEach((p, i) => { sgn += nm[i][0] * (p[0] - cx) + nm[i][1] * (p[1] - cy); });
    sgn = sgn >= 0 ? 1 : -1;
    const path = ribbon(pts, true, (i, n) => {
      const dot = sgn * (n[0] * SHADOW_DIR[0] + n[1] * SHADOW_DIR[1]);
      const k = lo + (1 - lo) * Math.min(1, Math.max(0, (dot + 0.35) / 1.1));
      return w * k * (1 + 0.1 * Math.sin(i * 0.23 + seed));
    });
    return `<path d="${path}" fill-rule="evenodd" ${attrs(o)}/>`;
  }

  function strokeOpen(pts, o) {
    const w = o.w || 1.4, tIn = o.tIn != null ? o.tIn : 0.3, tOut = o.tOut != null ? o.tOut : 0.35;
    if (pts.length < 2) return '';
    const n = pts.length - 1;
    const path = ribbon(pts, false, (i) => {
      const t = i / n;
      const a = tIn > 0 ? ease(t / tIn) : 1;
      const b = tOut > 0 ? ease((1 - t) / tOut) : 1;
      return Math.max(0.12, w * Math.min(a, b));
    });
    return `<path d="${path}" ${attrs(o)}/>`;
  }

  // Closed silhouettes: heavier on the shadow (lower-right) side, lighter where light hits.
  function outline(d, o) {
    return sample(d, o.step || 1.6).map((s) => (s.closed && s.pts.length > 2 ? strokeClosed(s.pts, o) : strokeOpen(s.pts, o))).join('');
  }

  // Open strokes that taper in and out like a brush.
  function line(d, o) {
    return sample(d, o.step || 1.2).map((s) => strokeOpen(s.closed ? s.pts.concat([s.pts[0]]) : s.pts, o)).join('');
  }

  // Mirror absolute path data across a vertical axis.
  function mirror(d, axis) {
    const tk = tokenize(d);
    const out = [];
    let cmd = null, idx = 0;
    for (const t of tk) {
      if (/[A-Za-z]/.test(t)) { cmd = t.toUpperCase(); idx = 0; out.push(t); continue; }
      const v = parseFloat(t);
      out.push(cmd !== 'Z' && idx % 2 === 0 ? f(2 * axis - v) : t);
      idx++;
    }
    return out.join(' ');
  }

  return { outline, line, mirror, sample };
})();
