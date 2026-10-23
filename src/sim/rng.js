// Seeded, replayable random numbers (sfc32 seeded through splitmix32).
// The whole generator state is four 32-bit integers, so it can be saved inside the life and
// resumed without rerolling anything.

function splitmix32(a) {
  return function () {
    a |= 0; a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16); t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15); t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0);
  };
}

export class Rng {
  /** @param {{kind?:string, seed:number, state:number[], draws:number}} saved */
  constructor(saved) {
    this.kind = 'sfc32';
    this.seed = saved.seed >>> 0;
    this.s = saved.state.slice();
    this.draws = saved.draws || 0;
  }
  static fromSeed(seed) {
    const sm = splitmix32(seed >>> 0);
    const r = new Rng({ seed, state: [sm(), sm(), sm(), sm()], draws: 0 });
    for (let i = 0; i < 12; i++) r.u32(); // warm up
    r.draws = 0;
    return r;
  }
  toJSON() { return { kind: this.kind, seed: this.seed, state: this.s.slice(), draws: this.draws }; }
  u32() {
    let [a, b, c, d] = this.s;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.s = [a, b, c, d];
    this.draws++;
    return t >>> 0;
  }
  /** float in [0,1) */
  next() { return this.u32() / 4294967296; }
  /** integer in [0,n) */
  int(n) { return Math.floor(this.next() * n); }
  /** uniform float in [lo,hi] */
  range(lo, hi) { return lo + (hi - lo) * this.next(); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(arr.length)]; }
  /** Pick from [{...,w}] or use weightFn. Returns the item. Always consumes exactly one draw. */
  weighted(items, weightFn = (x) => x.w) {
    const ws = items.map((x) => Math.max(0, weightFn(x)));
    const total = ws.reduce((s, x) => s + x, 0);
    const r = this.next();
    if (total <= 0) return items[Math.min(items.length - 1, Math.floor(r * items.length))];
    let acc = 0;
    const target = r * total;
    for (let i = 0; i < items.length; i++) { acc += ws[i]; if (target < acc) return items[i]; }
    return items[items.length - 1];
  }
  /** Normal(mean, sd) via Box-Muller, consumes exactly two draws. */
  normal(mean = 0, sd = 1) {
    const u1 = Math.max(this.next(), 1e-12), u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
