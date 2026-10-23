// Headless playthrough: node tools/autoplay.mjs [firstSeed] [count] [--verbose]
import { readFile } from 'node:fs/promises';
import { loadData } from '../src/sim/data.js';
import { newLife, advance, answer, answerAuto } from '../src/sim/engine.js';
import { serialize, hydrate } from '../src/sim/save.js';

const root = new URL('../', import.meta.url);
export const D = await loadData(async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8')));

export function playOut(seed, { resumeEvery = 0, manual = false, opts } = {}) {
  let life = newLife(D, seed, opts);
  if (!manual) { life.settings.auto_small = true; life.settings.auto_major = true; }
  let steps = 0, decisions = 0;
  while (!life.dead) {
    const r = advance(life, D);
    if (r.status === 'awaiting') { decisions++; answerAuto(life, D); }
    if (++steps > 20000) throw new Error('runaway life seed ' + seed);
    if (resumeEvery && steps % resumeEvery === 0) { const h = hydrate(serialize(life, D), D); if (!h.ok) throw new Error(h.error); life = h.life; }
  }
  return { life, steps, decisions };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const first = Number(process.argv[2] ?? 1), count = Number(process.argv[3] ?? 5);
  for (let s = first; s < first + count; s++) {
    try {
      const { life, decisions } = playOut(s);
      console.log(s, life.origin.birth_year, life.origin.macro_region, life.origin.kind, 'died', life.dead.age, life.dead.cause.label, 'events', life.history.length, 'dec', decisions);
    } catch (e) { console.log(s, 'ERROR', e.stack.split('\n').slice(0, 6).join('\n')); }
  }
}
