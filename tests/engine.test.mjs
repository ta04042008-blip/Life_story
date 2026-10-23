import test from 'node:test';
import assert from 'node:assert/strict';
import { D, playOut } from '../tools/autoplay.mjs';
import { newLife, advance, answer } from '../src/sim/engine.js';
import { serialize, hydrate, SaveStore } from '../src/sim/save.js';
import { stableStringify as ss } from '../src/sim/util.js';
const stableStringify = (x) => ss(JSON.parse(JSON.stringify(x))); // compare what a save would hold

const SEEDS = [1, 4, 6, 7, 10, 21, 33, 58, 77, 101];

test('lives run to death without errors', () => {
  for (const s of SEEDS) { const { life } = playOut(s); assert.ok(life.dead, 'seed ' + s); }
});

test('same seed gives identical life', () => {
  for (const s of SEEDS.slice(0, 5)) {
    assert.equal(stableStringify(playOut(s).life), stableStringify(playOut(s).life));
  }
});

test('save and resume at every step gives the identical life', () => {
  for (const s of [2, 8, 21, 58]) {
    const a = playOut(s).life, b = playOut(s, { resumeEvery: 1 }).life;
    assert.equal(stableStringify(a), stableStringify(b), 'seed ' + s);
  }
});

test('a pending decision survives save and cannot be answered twice', () => {
  for (const s of [8, 21, 58, 3, 5, 9]) {
    const life = newLife(D, s); life.settings.auto_small = false; life.settings.auto_major = false;
    let r, n = 0;
    do { r = advance(life, D); if (r.status === 'awaiting') break; } while (r.status !== 'dead' && ++n < 400);
    if (r.status !== 'awaiting') continue;
    const h = hydrate(serialize(life, D), D).life;
    assert.deepEqual(h.pending_decision, life.pending_decision);
    const d = h.pending_decision, c = d.choices[0].id;
    const before = h.history.length;
    answer(h, D, d.id, c);
    const after = stableStringify(h);
    const dup = answer(h, D, d.id, c);
    assert.equal(dup.ok, false);
    assert.equal(stableStringify(h), after);
    assert.ok(h.history.length >= before);
    return;
  }
  assert.fail('no pending decision found');
});

test('manual play: first choice every time still finishes', () => {
  const life = newLife(D, 13); life.settings.auto_small = false; life.settings.auto_major = false;
  let guard = 0;
  while (!life.dead && guard++ < 30000) {
    const r = advance(life, D);
    if (r.status === 'awaiting') answer(life, D, life.pending_decision.id, life.pending_decision.choices[0].id);
  }
  assert.ok(life.dead);
});

test('save store keeps auto, previous auto, and rejects bad files', () => {
  const m = new Map(); const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const store = new SaveStore(st, D); const life = newLife(D, 5);
  store.write('auto', life); advance(life, D); store.write('auto', life);
  assert.ok(store.info('auto') && store.info('auto_prev'));
  assert.equal(hydrate('{"x":1}', D).ok, false);
  assert.equal(hydrate('not json', D).ok, false);
});
