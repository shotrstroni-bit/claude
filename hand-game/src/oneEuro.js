// One Euro filter (Casiez, Roussel, Vogel 2012) applied to groups of 3D points.
// Heavy smoothing while a point is still, light smoothing while it moves fast,
// so the hand stops jittering without feeling laggy.

const TAU = Math.PI * 2;

function alpha(cutoffHz, dt) {
  const tau = 1 / (TAU * cutoffHz);
  return 1 / (1 + tau / dt);
}

export class PointFilter {
  /**
   * @param {number} count number of 3D points
   * @param {{minCutoff:number, beta:number, dCutoff?:number}} opts
   *   minCutoff in Hz, beta in Hz per (unit/s) of speed.
   */
  constructor(count, { minCutoff, beta, dCutoff = 1 }) {
    this.count = count;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.value = new Float32Array(count * 3);
    this.speed = new Float32Array(count);
    this.ready = false;
  }

  reset() {
    this.ready = false;
  }

  /**
   * @param {ArrayLike<number>} src packed xyz values, length count*3
   * @param {number} dt seconds since the previous sample
   * @returns {Float32Array} filtered values (owned by the filter)
   */
  filter(src, dt) {
    const v = this.value;
    if (!this.ready) {
      for (let i = 0; i < v.length; i++) v[i] = src[i];
      this.speed.fill(0);
      this.ready = true;
      return v;
    }
    const ad = alpha(this.dCutoff, dt);
    for (let p = 0; p < this.count; p++) {
      const o = p * 3;
      const dx = src[o] - v[o];
      const dy = src[o + 1] - v[o + 1];
      const dz = src[o + 2] - v[o + 2];
      const rawSpeed = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
      const s = (this.speed[p] += ad * (rawSpeed - this.speed[p]));
      const a = alpha(this.minCutoff + this.beta * s, dt);
      v[o] += a * dx;
      v[o + 1] += a * dy;
      v[o + 2] += a * dz;
    }
    return v;
  }
}
