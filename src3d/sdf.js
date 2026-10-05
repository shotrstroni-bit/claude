// Signed-distance primitives (after Inigo Quilez) and a surface-nets mesher.

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function ellipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

export function roundCone(px, py, pz, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// Naive surface nets with a coarse pre-pass so only cells near the surface pay for a full SDF evaluation.
// Returns { position, normal, index, extra } typed arrays ready for BufferGeometry.
export function meshSDF(sdf, bmin, bmax, cell, extraFn) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / cell) + 1;
  const ny = Math.ceil((bmax[1] - bmin[1]) / cell) + 1;
  const nz = Math.ceil((bmax[2] - bmin[2]) / cell) + 1;
  const C = 4;
  const cnx = Math.ceil((nx - 1) / C) + 1, cny = Math.ceil((ny - 1) / C) + 1, cnz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cnx * cny * cnz);
  for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) {
    coarse[i + cnx * (j + cny * k)] = sdf(bmin[0] + i * C * cell, bmin[1] + j * C * cell, bmin[2] + k * C * cell);
  }
  const band = cell * C * 2.5;
  const field = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    const ck = Math.min(cnz - 1, Math.round(k / C));
    for (let j = 0; j < ny; j++) {
      const cj = Math.min(cny - 1, Math.round(j / C));
      for (let i = 0; i < nx; i++) {
        const cv = coarse[Math.min(cnx - 1, Math.round(i / C)) + cnx * (cj + cny * ck)];
        field[i + nx * (j + ny * k)] = Math.abs(cv) > band ? cv : sdf(bmin[0] + i * cell, bmin[1] + j * cell, bmin[2] + k * cell);
      }
    }
  }

  const F = (i, j, k) => field[i + nx * (j + ny * k)];
  const cx = nx - 1, cy = ny - 1;
  const cellVert = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      v[c] = F(i + corners[c][0], j + corners[c][1], k + corners[c][2]);
      if (v[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corners[a][0] + t * (corners[b][0] - corners[a][0]);
      sy += corners[a][1] + t * (corners[b][1] - corners[a][1]);
      sz += corners[a][2] + t * (corners[b][2] - corners[a][2]);
      n++;
    }
    cellVert[i + cx * (j + cy * k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / n) * cell, bmin[1] + (j + sy / n) * cell, bmin[2] + (k + sz / n) * cell);
  }

  const idx = [];
  const CV = (i, j, k) => cellVert[i + cx * (j + cy * k)];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const inside = F(i, j, k) < 0;
    if (inside !== (F(i + 1, j, k) < 0))
      quad(CV(i, j - 1, k - 1), CV(i, j, k - 1), CV(i, j, k), CV(i, j - 1, k), !inside);
    if (inside !== (F(i, j + 1, k) < 0))
      quad(CV(i - 1, j, k - 1), CV(i - 1, j, k), CV(i, j, k), CV(i, j, k - 1), !inside);
    if (inside !== (F(i, j, k + 1) < 0))
      quad(CV(i - 1, j - 1, k), CV(i, j - 1, k), CV(i, j, k), CV(i - 1, j, k), !inside);
  }

  const count = pos.length / 3;
  const position = new Float32Array(pos);
  const normal = new Float32Array(count * 3);
  const extra = extraFn ? new Float32Array(count) : null;
  const e = cell * 0.5;
  for (let q = 0; q < count; q++) {
    let x = position[q * 3], y = position[q * 3 + 1], z = position[q * 3 + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z);
    let gy = sdf(x, y + e, z) - sdf(x, y - e, z);
    let gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    let gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    const d = sdf(x, y, z);
    x -= gx * d; y -= gy * d; z -= gz * d;
    position[q * 3] = x; position[q * 3 + 1] = y; position[q * 3 + 2] = z;
    normal[q * 3] = gx; normal[q * 3 + 1] = gy; normal[q * 3 + 2] = gz;
    if (extra) extra[q] = extraFn(x, y, z);
  }
  return { position, normal, index: count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), extra };
}
