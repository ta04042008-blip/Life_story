// Applying numeric effects. Positive gains in learning, charm and skills taper at high values: gain * (1 - value/120).
import { clamp100, round1 } from './util.js';
import { bumpRel } from './persons.js';

const TAPER = new Set(['learning', 'charm']);
const taper = (gain, cur) => (gain > 0 ? gain * (1 - cur / 120) : gain);

export function householdOf(life) { return life.households[life.protagonist.household_id]; }

export function bandFor(display) { return display < 27.5 ? 'shortage' : display < 45 ? 'precarious' : display < 65 ? 'stable' : 'comfortable'; }
export const BAND_LABELS = { shortage: '不足', precarious: '不安定', stable: '安定', comfortable: '余裕' };

export function setResources(life, value) {
  const h = householdOf(life);
  h.resources.display = clamp100(value);
  h.resources.band = bandFor(h.resources.display);
}

/**
 * Apply a template/choice effect dict. Returns the real deltas (after clamping/taper) for the journal.
 * targetId receives relationship.* effects.
 */
export function applyEffects(life, effects, targetId = null) {
  const p = life.protagonist, deltas = {};
  for (const [k, raw] of Object.entries(effects || {})) {
    if (k.startsWith('relationship.')) {
      if (!targetId) continue;
      const axis = k.split('.')[1];
      const d = bumpRel(life, targetId, axis, raw);
      if (d) deltas[k] = round1((deltas[k] || 0) + d);
    } else if (k === 'resources') {
      const h = householdOf(life), before = h.resources.display;
      setResources(life, before + raw);
      const d = round1(h.resources.display - before);
      if (d) deltas.resources = round1((deltas.resources || 0) + d);
    } else if (k in p && typeof p[k] === 'number') {
      const before = p[k], gain = TAPER.has(k) ? taper(raw, before) : raw;
      p[k] = clamp100(before + gain);
      const d = round1(p[k] - before);
      if (d) deltas[k] = round1((deltas[k] || 0) + d);
    }
  }
  return deltas;
}

export function addSkill(life, skill, amount) {
  const s = life.protagonist.skills;
  const before = s[skill] ?? 0;
  s[skill] = clamp100(before + taper(amount, before));
  return round1(s[skill] - before);
}
