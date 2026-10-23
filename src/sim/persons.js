// People around the protagonist and the relationships with them.
// A person has a fixed id once created; roles ("caregiver", "peer", ...) are derived from tags and state when an event asks.
import { clamp, clamp100, pushCapped } from './util.js';
import { personAge } from './calendar.js';

const KIN_LABELS = {
  parent: { f: '母', m: '父' }, grandparent: { f: '祖母', m: '祖父' }, aunt_uncle: { f: '叔母', m: '叔父' },
  child: { f: '娘', m: '息子' }, other_kin: { f: '親族', m: '親族' },
  friend: { f: '友人', m: '友人' }, peer: { f: '同じ年頃の仲間', m: '同じ年頃の仲間' },
  mentor: { f: '師', m: '師' }, partner: { f: 'パートナー', m: 'パートナー' }, junior: { f: '後輩', m: '後輩' },
};

export function kinLabel(p, protagonistBornIdx = 0) {
  if (p.kin === 'sibling') {
    const older = p.born_idx < protagonistBornIdx;
    return older ? (p.sex === 'f' ? '姉' : '兄') : (p.sex === 'f' ? '妹' : '弟');
  }
  return (KIN_LABELS[p.kin] || KIN_LABELS.other_kin)[p.sex];
}

export function nextId(life, prefix) {
  const seq = life.event_state.seq;
  seq[prefix] = (seq[prefix] || 0) + 1;
  return prefix + seq[prefix];
}

function coinedName(rng, pool) {
  const a = pool.syllables_a, b = pool.syllables_b;
  const n = 2 + rng.int(2);
  let s = a[rng.int(a.length)];
  for (let i = 1; i < n; i++) s += b[rng.int(b.length)];
  return s;
}

export function makeName(life, D, rng, sex) {
  const poolId = life.origin.name_pool;
  const pool = D.generic.name_pools[poolId];
  if (pool && pool[sex === 'f' ? 'female' : 'male']) return rng.pick(pool[sex === 'f' ? 'female' : 'male']);
  return coinedName(rng, D.generic.name_pools.generic);
}

/**
 * Create a person and the relationship to the protagonist.
 * ageYears: the person's age now (at life.clock.index). tags: array of strings.
 */
export function addPerson(life, D, rng, { kin, ageYears, tags = [], household = null, sex = null, closenessBoost = 0 }) {
  const sx = sex || (rng.chance(0.5) ? 'f' : 'm');
  const id = nextId(life, 'p');
  const idx = life.clock.index;
  const person = {
    id, name: makeName(life, D, rng, sx), kin, sex: sx,
    born_idx: idx - ageYears * 4 - rng.int(4),
    tags: tags.slice(), alive: true, died_idx: null,
    household_id: household, met_idx: idx, away: false,
  };
  life.persons[id] = person;
  const tpl = D.tuning.relationship_templates[kin] || D.tuning.relationship_templates.other_kin;
  const v = (r) => clamp100(rng.range(r[0], r[1]));
  life.relationships[id] = {
    type: kin, closeness: clamp100(v(tpl.closeness) + closenessBoost), trust: v(tpl.trust), tension: v(tpl.tension),
    status: 'active', partnership_status: null, last_interaction_idx: idx, history: [],
  };
  if (household) { const h = life.households[household]; if (h && !h.members.includes(id)) h.members.push(id); }
  return person;
}

export function rel(life, id) { return life.relationships[id]; }

export function addRelHistory(life, id, text) {
  const r = life.relationships[id];
  if (r) pushCapped(r.history, { idx: life.clock.index, text }, 30);
}

/** Apply an effect to a relationship axis with clamping, and mark the interaction. */
export function bumpRel(life, id, axis, delta) {
  const r = life.relationships[id];
  if (!r || r.status !== 'active') return 0;
  const before = r[axis];
  r[axis] = clamp100(r[axis] + delta);
  r.last_interaction_idx = life.clock.index;
  return r[axis] - before;
}

export function livingPersons(life) { return Object.values(life.persons).filter((p) => p.alive); }

export function isActive(life, p) { return p.alive && life.relationships[p.id]?.status === 'active'; }

function ageNow(life, p) { return personAge(p, life.clock.index); }

/**
 * Persons that currently fill a role. Returned best-first (closest relationship first).
 */
export function personsWithRole(life, D, role) {
  const pa = Math.floor(life.clock.index / 4);
  const all = Object.values(life.persons).filter((p) => isActive(life, p));
  const closeness = (p) => life.relationships[p.id].closeness;
  let out;
  switch (role) {
    case 'caregiver': out = pa < 18 ? all.filter((p) => p.tags.includes('guardian')) : []; break;
    case 'household_member': out = all.filter((p) => p.household_id === life.protagonist.household_id); break;
    case 'peer': out = all.filter((p) => p.tags.includes('peer') && !p.tags.includes('friend')); break;
    case 'friend': out = all.filter((p) => p.tags.includes('friend')); break;
    case 'mentor': out = all.filter((p) => p.tags.includes('mentor')); break;
    case 'partner': out = all.filter((p) => p.tags.includes('partner') || p.tags.includes('partner_candidate')); break;
    case 'spouse': out = all.filter((p) => p.tags.includes('partner') && life.relationships[p.id].partnership_status === 'cohabiting'); break;
    case 'care_recipient':
      out = all.filter((p) => ['parent', 'grandparent', 'aunt_uncle', 'partner'].includes(p.kin) && (ageNow(life, p) >= 65 || p.tags.includes('needs_care'))); break;
    case 'learner':
      out = all.filter((p) => { const a = ageNow(life, p); return a >= 6 && a <= 35 && (pa - a >= 8) && (['child', 'junior', 'sibling', 'other_kin', 'peer', 'friend'].includes(p.kin)); }); break;
    case 'dependent':
      out = all.filter((p) => p.kin === 'child' && ageNow(life, p) < 18); break;
    default: out = [];
  }
  return out.sort((a, b) => closeness(b) - closeness(a));
}

export function personSummary(life, p, idx = life.clock.index) {
  const r = life.relationships[p.id];
  return {
    id: p.id, name: p.name, label: kinLabel(p, 0), kin: p.kin, age: personAge(p, idx), alive: p.alive,
    tags: p.tags, status: r?.status, closeness: r?.closeness, trust: r?.trust, tension: r?.tension,
    partnership_status: r?.partnership_status, away: p.away,
  };
}
