// The life scene as original pixel art, drawn on a small canvas that CSS scales up with `image-rendering: pixelated`.
// It only reads the life (era style, settlement, season, household); it holds no game state. Nothing is copied from any reference.
const SEASON = [
  { name: '春', sky: ['#a9d3e8', '#c7e4ef', '#e4f2ea'], far: '#9db8a0', mid: '#7fa57f', ground: '#8fbf6a', grass2: '#a4d07c', tree: '#4f9a4f', tree2: '#6fb35c', cloud: '#ffffff' },
  { name: '夏', sky: ['#5fa9de', '#86c4ee', '#b6def2'], far: '#6a9a8c', mid: '#4a8a66', ground: '#5fa84f', grass2: '#74bb5b', tree: '#2f7d3f', tree2: '#3f9a4b', cloud: '#ffffff' },
  { name: '秋', sky: ['#e8b97c', '#f1cf98', '#f8e3b8'], far: '#b99565', mid: '#a47a4c', ground: '#c1a352', grass2: '#d2b564', tree: '#c46a2a', tree2: '#dd9a30', cloud: '#fff4dc' },
  { name: '冬', sky: ['#a8bccd', '#c3d3e0', '#e1eaf2'], far: '#9aaab8', mid: '#8798a8', ground: '#dfe6e8', grass2: '#eef2f3', tree: '#6b7b72', tree2: '#85948b', cloud: '#ffffff' },
];
const SKIN = ['#f6d2b0', '#e8b98e', '#d49a6f', '#b97a52'];
const HAIR = ['#2d2018', '#4a3020', '#1f1a24', '#6b4a2a'];
const CLOTH = ['#5b8fcf', '#c75b4a', '#6ba35a', '#d6a63a', '#8f6bb5', '#d98aa8', '#4aa3a3'];

function rng(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const px = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

function hills(c, W, y, amp, seed, col) {
  const r = rng(seed), a = [r() * 6, r() * 6, r() * 6];
  for (let x = 0; x < W; x += 2) {
    const h = Math.round(amp * (0.5 + 0.3 * Math.sin(x / 23 + a[0]) + 0.2 * Math.sin(x / 9 + a[1]) + 0.1 * Math.sin(x / 41 + a[2])));
    px(c, x, y - h, 2, h + 2, col);
  }
}

function tree(c, x, base, s, pal) { px(c, x + 1, base - 3, 2, 3, '#6b4a2a'); px(c, x - 1, base - 3 - s, 6, s, pal.tree); px(c, x, base - 4 - s, 4, 2, pal.tree2); px(c, x, base - 2 - s, 2, 2, pal.tree2); }

function house(c, x, base, kind, style, r, night) {
  const wall = kind === 'thatch' ? '#d9bf8e' : style === 'industrial' ? '#b3563f' : '#e6dccb';
  const roof = kind === 'thatch' ? '#9a7040' : style === 'industrial' ? '#5b4a44' : '#7d8a99';
  if (kind === 'thatch') {
    const w = 18, h = 8;
    px(c, x, base - h, w, h, wall);
    px(c, x - 2, base - h - 2, w + 4, 3, roof); px(c, x, base - h - 5, w, 3, roof); px(c, x + 3, base - h - 8, w - 6, 3, roof);
    px(c, x + 7, base - 5, 4, 5, '#4a3320'); px(c, x + 2, base - 6, 3, 3, '#f6e7a8'); px(c, x + 13, base - 6, 3, 3, '#f6e7a8');
  } else {
    const w = 14 + Math.floor(r() * 6), h = 14 + Math.floor(r() * (style === 'beyond' || style === 'contemporary' ? 26 : style === 'midcentury' ? 14 : 8));
    px(c, x, base - h, w, h, wall); px(c, x - 1, base - h - 2, w + 2, 2, roof);
    if (style === 'industrial' && r() < .6) px(c, x + w - 5, base - h - 8, 3, 7, '#4a3f3a');
    for (let wy = base - h + 3; wy < base - 5; wy += 6) for (let wx = x + 2; wx < x + w - 3; wx += 5) px(c, wx, wy, 3, 3, night ? '#ffe28a' : '#8fb7d4');
    px(c, x + Math.floor(w / 2) - 1, base - 4, 3, 4, '#4a3320');
  }
}

function tent(c, x, base) { px(c, x, base - 2, 14, 2, '#c9a56a'); px(c, x + 2, base - 5, 10, 3, '#d9bf8e'); px(c, x + 4, base - 8, 6, 3, '#e6d3a0'); px(c, x + 6, base - 10, 2, 2, '#c75b4a'); }

function person(c, x, base, age, i, marker, alive = true) {
  const r = rng(i * 977 + 13);
  const skin = SKIN[Math.floor(r() * SKIN.length)], hair = HAIR[Math.floor(r() * HAIR.length)], cloth = CLOTH[Math.floor(r() * CLOTH.length)];
  const g = alive ? 1 : 0;
  if (age < 2) { px(c, x - 3, base - 4, 7, 4, g ? cloth : '#9a9a9a'); px(c, x - 2, base - 8, 5, 4, g ? skin : '#c8c0b8'); px(c, x - 2, base - 9, 5, 2, hair); }
  else {
    const h = 9 + Math.round(Math.min(1, age / 18) * 8), body = Math.round(h * 0.5), head = 5;
    px(c, x - 2, base - 2, 2, 2, '#3a2a1c'); px(c, x + 1, base - 2, 2, 2, '#3a2a1c');
    px(c, x - 3, base - 2 - body, 7, body, g ? cloth : '#9a9a9a');
    px(c, x - 3, base - 2 - body, 7, 1, 'rgba(255,255,255,.25)');
    px(c, x - 2, base - 2 - body - head, 5, head, g ? skin : '#c8c0b8'); px(c, x - 3, base - 3 - body - head, 7, 3, hair);
    px(c, x - 1, base - 2 - body - 3, 1, 1, '#2a1a10'); px(c, x + 1, base - 2 - body - 3, 1, 1, '#2a1a10');
  }
  px(c, x - 4, base, 9, 1, 'rgba(0,0,0,.18)');
  if (marker) { const top = base - (age < 2 ? 12 : 9 + Math.round(Math.min(1, age / 18) * 8) + 8); px(c, x - 2, top, 5, 1, '#ee7b2e'); px(c, x - 1, top + 1, 3, 1, '#ee7b2e'); px(c, x, top + 2, 1, 1, '#ee7b2e'); }
}

/** Draw the scene. The canvas keeps the logical size its owner gave it (e.g. 240x80); CSS scales it. */
export function drawScene(canvas, view, t = 0) {
  const W = canvas.width, H = canvas.height, c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  const S = SEASON[view.season];
  const sky = view.night ? ['#1b2a3f', '#2a3c55', '#3a4a60'] : S.sky;
  const hz = Math.round(H * 0.62);
  px(c, 0, 0, W, hz, sky[0]); px(c, 0, Math.round(hz * 0.4), W, Math.round(hz * 0.3), sky[1]); px(c, 0, Math.round(hz * 0.7), W, hz, sky[2]);
  // sun: position follows the age of the person across a life
  const sx = Math.round(W * (0.12 + 0.76 * Math.min(1, view.age / 90))), sy = Math.round(H * 0.16);
  px(c, sx - 3, sy - 4, 6, 8, view.night ? '#f1f1ff' : '#fff3b0'); px(c, sx - 4, sy - 3, 8, 6, view.night ? '#f1f1ff' : '#fff3b0');
  // clouds (drift only while playing and when motion is allowed)
  const r0 = rng(view.seed + 11), drift = view.playing && !view.reduced ? Math.floor(t * 3) : 0;
  for (let i = 0; i < 3; i++) { const cx = (Math.floor(r0() * W) + drift * (1 + i)) % (W + 40) - 20, cy = 6 + Math.floor(r0() * H * 0.25); px(c, cx, cy, 16, 3, S.cloud); px(c, cx + 3, cy - 2, 9, 2, S.cloud); px(c, cx + 2, cy + 3, 12, 1, 'rgba(255,255,255,.5)'); }
  hills(c, W, hz, Math.round(H * 0.2), view.seed + 1, S.far);
  hills(c, W, hz + 4, Math.round(H * 0.12), view.seed + 2, S.mid);
  px(c, 0, hz + 2, W, H - hz, S.ground);
  const rg = rng(view.seed + 3);
  for (let i = 0; i < Math.floor(W / 3); i++) px(c, Math.floor(rg() * W), hz + 4 + Math.floor(rg() * (H - hz - 8)), 2, 1, S.grass2);
  // path
  const pathY = Math.round(H * 0.84);
  px(c, 0, pathY, W, Math.round(H * 0.12), '#d9bf8e'); px(c, 0, pathY, W, 1, '#c9a870'); px(c, 0, pathY + Math.round(H * 0.12) - 1, W, 1, '#c9a870');
  const base = hz + Math.round(H * 0.14);
  // settlement
  const r = rng(view.seed + 5), modern = ['midcentury', 'contemporary', 'beyond'].includes(view.style);
  const set = view.settlement;
  if (set === 'mobile_or_seasonal_livelihood') { for (let i = 0; i < 4; i++) tent(c, Math.floor(W * (0.1 + i * 0.22)) + Math.floor(r() * 6), base + 2); }
  else {
    const n = set === 'urban_or_city' ? 9 : set === 'town_or_market_center' ? 6 : 3, span = set === 'rural_or_village' ? 0.7 : 0.94;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(W * (0.5 - span / 2) + (W * span * i) / n + r() * 4);
      const kind = (view.style === 'premodern' || (set === 'rural_or_village' && view.style !== 'beyond' && view.style !== 'contemporary')) ? 'thatch' : 'box';
      if (set !== 'rural_or_village' && i % 3 === 1 && !modern) tree(c, x + 10, base + 2, 5, S);
      house(c, x, base + 2, kind, view.style, r, view.night);
    }
  }
  const rt = rng(view.seed + 9);
  for (let i = 0; i < 4; i++) tree(c, Math.floor(rt() * W), base + 6 + Math.floor(rt() * 10), 4 + Math.floor(rt() * 4), S);
  // people: the household stands on the path, the protagonist first with a marker
  const list = [{ me: true, age: view.age, alive: true }, ...view.people.slice(0, 5)];
  const gap = Math.min(24, Math.floor((W - 40) / list.length)), x0 = Math.round(W / 2 - (gap * (list.length - 1)) / 2);
  list.forEach((p, i) => {
    const bob = view.playing && !view.reduced && Math.floor(t * 2 + i) % 2 ? 1 : 0;
    person(c, x0 + gap * i, pathY + Math.round(H * 0.1) - bob, p.age, i + 1, !!p.me, p.alive !== false);
  });
  if (view.bubble) bubble(c, view.bubble, W, Math.round(H * 0.3), x0);
}

function bubble(c, text, W, y, x) {
  c.font = '8px PixelMplus10, sans-serif'; c.textBaseline = 'middle';
  const w = Math.min(W - 10, Math.ceil(c.measureText(text).width) + 8), bx = Math.max(3, Math.min(W - w - 3, x - Math.floor(w / 2)));
  px(c, bx - 1, y - 1, w + 2, 12, '#3b2a14'); px(c, bx, y, w, 10, '#fff');
  px(c, x - 1, y + 10, 3, 2, '#fff'); c.fillStyle = '#3b2a14'; c.fillText(text, bx + 4, y + 5);
}
