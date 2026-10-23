// Small shared helpers. No DOM, no randomness here.

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
/** Keep one decimal place (the rules store values with one decimal and never re-compute from rounded display). */
export const round1 = (x) => Math.round(x * 10) / 10;
export const clamp100 = (x) => round1(clamp(x, 0, 100));
export const logit = (p) => Math.log(p / (1 - p));
export const expit = (x) => 1 / (1 + Math.exp(-x));
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** Annual probability -> per-quarter probability under a constant-hazard assumption. */
export const quarterlyFromAnnual = (p) => 1 - Math.pow(1 - clamp(p, 0, 0.999999), 1 / 4);

/** Stable JSON (sorted keys) used for hashing in tests and for ids. */
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}
/** FNV-1a 32-bit hash of a string, as hex. Not cryptographic; used for equality checks in tests. */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Band words from the spec: 0-19 very low ... 80-100 very high. */
export function bandLabel(v) {
  if (v < 20) return '非常に低い';
  if (v < 40) return '低い';
  if (v < 60) return '中程度';
  if (v < 80) return '高い';
  return '非常に高い';
}

export function pushCapped(arr, item, cap) {
  arr.push(item);
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}
