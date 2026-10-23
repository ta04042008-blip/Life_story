// The life scene: an original, procedurally drawn landscape on a canvas. It only reads the life (era style, settlement, season,
// who lives in the household) - it holds no game state. Nothing here is copied from any reference.
const SEASONS = [
  { sky: ['#cfe3e6', '#f1ede0'], far: '#9db7b0', mid: '#7f9c8f', near: '#5f7f6d', ground: '#87a37f', haze: 0.35 },   // spring-like
  { sky: ['#9ccbe0', '#e8f0e0'], far: '#6f9a9a', mid: '#4f8478', near: '#386b5a', ground: '#5f8f58', haze: 0.2 },    // summer-like
  { sky: ['#e7c58d', '#f4e6c8'], far: '#b99a78', mid: '#9d7b58', near: '#7c5e44', ground: '#a58b52', haze: 0.3 },    // autumn-like
  { sky: ['#b9c6d3', '#e9eef2'], far: '#9aa9b6', mid: '#8393a1', near: '#667684', ground: '#c3ccd1', haze: 0.45 },   // winter-like
];
const NIGHT = { sky: ['#1b2a3f', '#3a4a60'], far: '#2b3f55', mid: '#22344a', near: '#1a2a3b', ground: '#1f3040', haze: 0.2 };

function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function ridge(ctx, w, y0, amp, seed, color, step = 14) {
  const r = mulberry(seed);
  const ph = [r() * 6, r() * 6, r() * 6];
  ctx.beginPath(); ctx.moveTo(0, ctx.canvas.height / (ctx.dpr || 1));
  for (let x = 0; x <= w + step; x += step) {
    const y = y0 - amp * (0.5 * Math.sin(x / 70 + ph[0]) + 0.3 * Math.sin(x / 31 + ph[1]) + 0.2 * Math.sin(x / 13 + ph[2]));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, ctx.canvas.height / (ctx.dpr || 1)); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

function building(ctx, x, base, w, hgt, color, style, r, night) {
  ctx.fillStyle = color; ctx.fillRect(x, base - hgt, w, hgt);
  if (style === 'premodern') { ctx.beginPath(); ctx.moveTo(x - 3, base - hgt); ctx.lineTo(x + w / 2, base - hgt - w * 0.45); ctx.lineTo(x + w + 3, base - hgt); ctx.closePath(); ctx.fill(); }
  else if (style === 'industrial' && r() < 0.4) { ctx.fillRect(x + w * 0.6, base - hgt - 14, 4, 14); }
  if (style !== 'premodern' && hgt > 22) {
    ctx.fillStyle = night ? 'rgba(255,220,140,.8)' : 'rgba(255,255,255,.35)';
    for (let wy = base - hgt + 5; wy < base - 6; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 8) if (r() < 0.55) ctx.fillRect(wx, wy, 3, 4);
  }
}

function settlementBlock(ctx, W, base, kind, style, seed, tone, night) {
  const r = mulberry(seed);
  ctx.fillStyle = tone;
  if (kind === 'mobile_or_seasonal_livelihood') {
    for (let i = 0; i < 4; i++) { const x = W * (0.12 + i * 0.2) + r() * 18, s = 22 + r() * 10; ctx.beginPath(); ctx.moveTo(x - s, base); ctx.lineTo(x, base - s * 1.1); ctx.lineTo(x + s, base); ctx.closePath(); ctx.fill(); }
    return;
  }
  const count = kind === 'urban_or_city' ? 11 : kind === 'town_or_market_center' ? 8 : 4;
  const span = kind === 'rural_or_village' ? 0.62 : 0.9;
  for (let i = 0; i < count; i++) {
    const x = W * (0.5 - span / 2) + (W * span * i) / count + r() * 6;
    const w = kind === 'urban_or_city' ? 18 + r() * 14 : 20 + r() * 12;
    const modern = style === 'midcentury' || style === 'contemporary' || style === 'beyond';
    const hgt = kind === 'urban_or_city' ? (modern ? 30 + r() * 62 : 22 + r() * 30) : kind === 'town_or_market_center' ? 18 + r() * 24 : 14 + r() * 10;
    building(ctx, x, base, w, hgt, tone, style, r, night);
  }
  if (style === 'beyond') { ctx.strokeStyle = tone; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W * 0.82, base); ctx.lineTo(W * 0.82, base - 96); ctx.stroke(); }
}

function figure(ctx, x, base, h, color, halo, bob) {
  const head = h * 0.17;
  ctx.fillStyle = color;
  if (halo) { ctx.beginPath(); ctx.fillStyle = halo; ctx.arc(x, base - h * 0.55, h * 0.72, 0, 7); ctx.fill(); ctx.fillStyle = color; }
  ctx.beginPath(); ctx.arc(x, base - h + head + bob, head, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - h * 0.2, base); ctx.lineTo(x - h * 0.13, base - h * 0.7 + bob); ctx.lineTo(x + h * 0.13, base - h * 0.7 + bob); ctx.lineTo(x + h * 0.2, base); ctx.closePath(); ctx.fill();
}

export function drawScene(canvas, view, t = 0) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth || 360, ch = canvas.clientHeight || 200;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
  const ctx = canvas.getContext('2d'); ctx.dpr = dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = cw, H = ch;
  const pal = view.night ? NIGHT : SEASONS[view.season];
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.7); g.addColorStop(0, pal.sky[0]); g.addColorStop(1, pal.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // sun / moon: position follows the age of the person across their life
  const sx = W * (0.15 + 0.7 * Math.min(1, view.age / 90)), sy = H * 0.2;
  ctx.fillStyle = view.night ? 'rgba(240,240,255,.85)' : 'rgba(255,248,225,.9)'; ctx.beginPath(); ctx.arc(sx, sy, 13, 0, 7); ctx.fill();
  // clouds (drift only while playing and when motion is allowed)
  ctx.fillStyle = view.night ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.55)';
  const r0 = mulberry(view.seed + 11);
  for (let i = 0; i < 4; i++) { const cx = ((r0() * W + t * (6 + i * 3)) % (W + 120)) - 60, cy = 18 + r0() * H * 0.28; ctx.beginPath(); ctx.ellipse(cx, cy, 34, 8, 0, 0, 7); ctx.ellipse(cx + 20, cy - 4, 22, 8, 0, 0, 7); ctx.fill(); }
  const horizon = H * 0.62;
  ridge(ctx, W, horizon - 22, 26, view.seed + 1, pal.far);
  ridge(ctx, W, horizon - 4, 20, view.seed + 2, pal.mid);
  ctx.fillStyle = `rgba(255,255,255,${pal.haze * 0.25})`; ctx.fillRect(0, horizon - 30, W, 26);
  ridge(ctx, W, horizon + 12, 12, view.seed + 3, pal.near);
  ctx.fillStyle = pal.ground; ctx.fillRect(0, horizon + 14, W, H);
  // furrows or paving lines in the ground
  ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) { const y = horizon + 24 + i * ((H - horizon) / 5); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + (i % 2 ? 3 : -3)); ctx.stroke(); }
  settlementBlock(ctx, W, horizon + 14, view.settlement, view.style, view.seed + 5, view.night ? '#0f1a26' : 'rgba(38,52,60,.78)', view.night);
  // people: the household stands in front, the protagonist first and ringed
  const base = H - 10, people = view.people.slice(0, 6);
  const n = people.length + 1, gap = Math.min(46, (W - 60) / Math.max(1, n));
  const x0 = W / 2 - (gap * (n - 1)) / 2;
  const ink = view.night ? '#0b131c' : '#1e2a33';
  const order = [{ me: true, age: view.age }, ...people];
  order.forEach((p, i) => {
    const hgt = 20 + Math.min(1, p.age / 18) * 26;
    const bob = view.playing && !view.reduced ? Math.sin(t * 2 + i) * 0.8 : 0;
    figure(ctx, x0 + gap * i, base, hgt, p.me ? ink : (p.alive === false ? 'rgba(30,42,51,.35)' : 'rgba(30,42,51,.82)'), p.me ? 'rgba(255,255,255,.35)' : null, bob);
  });
}
