// Social dynamics each quarter: meeting people, relationships drifting, births in the household, deaths of others.
// Meetings only create people when a situation exists for them (spec: people are generated at meeting events, ids stay fixed).
import { quarterlyFromAnnual, clamp, clamp100 } from './util.js';
import { personAge } from './calendar.js';
import { addPerson, personsWithRole, isActive, bumpRel, kinLabel, addRelHistory } from './persons.js';
import { log } from './history.js';
import { annualQ, quarterlyQ, mortalitySource } from './mortality.js';
import { applyEffects, householdOf } from './effects.js';

const SOCIAL_TAGS = ['peer', 'friend', 'mentor', 'partner_candidate', 'junior'];

function socialCount(life) {
  return Object.values(life.persons).filter((p) => isActive(life, p) && p.tags.some((t) => SOCIAL_TAGS.includes(t))).length;
}

export function meetPeople(life, D, rng, ctx) {
  const T = D.tuning.social, age = Math.floor(life.clock.index / 4), pro = life.protagonist;
  const out = [];
  const crowded = socialCount(life) >= T.social_cap;
  // peers: companions of a similar age, mostly through shared learning/community life
  const peers = personsWithRole(life, D, 'peer').length + personsWithRole(life, D, 'friend').length;
  const hasPlace = !!pro.learning_access || pro.education.status === 'enrolled' || age >= 8;
  if (!crowded && age >= 5 && age <= 24 && hasPlace && peers < T.peer_target && rng.chance(T.peer_meet)) {
    const p = addPerson(life, D, rng, { kin: 'peer', ageYears: Math.max(4, age + Math.round(rng.range(-3, 3))), tags: ['peer'] });
    log(life, { type: 'person', icon: '👥', text: `${p.name}（${kinLabel(p)}）と顔なじみになった。`, tags: ['meeting'], refs: { person: p.id } });
    out.push(p.id);
  }
  // peers who grew close become friends
  for (const p of personsWithRole(life, D, 'peer')) {
    if (age >= 12 && life.relationships[p.id].closeness >= T.friend_promote_closeness) {
      p.tags.push('friend');
      log(life, { type: 'person', icon: '🤝', text: `${p.name}とは、友人と呼べる間柄になった。`, tags: ['relationship'], refs: { person: p.id } });
    }
  }
  const friends = personsWithRole(life, D, 'friend').length;
  if (!crowded && age >= 13 && friends < T.friend_target && rng.chance(T.friend_meet)) {
    const p = addPerson(life, D, rng, { kin: 'friend', ageYears: Math.max(10, age + Math.round(rng.range(-6, 6))), tags: ['friend'] });
    log(life, { type: 'person', icon: '🤝', text: `${p.name}と知り合い、親しくなった。`, tags: ['meeting'], refs: { person: p.id } });
    out.push(p.id);
  }
  // someone who may become a partner
  const partnered = Object.values(life.persons).some((p) => isActive(life, p) && (p.tags.includes('partner') || p.tags.includes('partner_candidate')));
  if (!crowded && !partnered && age >= 18 && age <= 48 && rng.chance(T.candidate_meet)) {
    const p = addPerson(life, D, rng, { kin: 'friend', ageYears: Math.max(18, age + Math.round(rng.range(-7, 7))), tags: ['partner_candidate'] });
    log(life, { type: 'person', icon: '✨', text: `${p.name}と出会った。話すうちに、もっと知りたいと思うようになった。`, tags: ['meeting'], refs: { person: p.id } });
    out.push(p.id);
  }
  // a younger person who looks up to you
  if (!crowded && age >= 35 && personsWithRole(life, D, 'learner').length === 0 && rng.chance(T.junior_meet)) {
    const p = addPerson(life, D, rng, { kin: 'junior', ageYears: Math.max(12, age - Math.round(rng.range(14, 26))), tags: ['junior'] });
    log(life, { type: 'person', icon: '🌱', text: `${p.name}が、あなたの仕事ぶりを学びたいと訪ねてきた。`, tags: ['meeting'], refs: { person: p.id } });
    out.push(p.id);
  }
  return out;
}

/** Passive relationship change over a quarter. */
export function driftRelationships(life, D, rng) {
  const T = D.tuning.social, idx = life.clock.index;
  for (const p of Object.values(life.persons)) {
    const r = life.relationships[p.id];
    if (!p.alive || r.status !== 'active') continue;
    const together = p.household_id === life.protagonist.household_id && !p.away;
    if (together) {
      if (r.closeness < T.cohabit_closeness_cap) r.closeness = clamp100(r.closeness + T.cohabit_growth);
      r.tension = clamp100(r.tension + (10 - r.tension) * 0.05);
      r.last_interaction_idx = idx;
    } else if (p.tags.includes('partner_candidate')) {
      r.closeness = clamp100(r.closeness + T.candidate_growth);
      r.trust = clamp100(r.trust + T.candidate_growth * 0.7);
      r.last_interaction_idx = idx;
      if (r.closeness < 45 && rng.chance(T.candidate_leave)) {
        r.status = 'ended_away'; p.away = true;
        log(life, { type: 'person', icon: '🍃', text: `${p.name}とは、いつしか疎遠になった。`, tags: ['relationship'], refs: { person: p.id } });
      }
    } else if (idx - r.last_interaction_idx >= 4 && (idx - r.last_interaction_idx) % 4 === 0) {
      // a year without contact: closeness fades by one point (trust does not fade automatically)
      r.closeness = clamp100(r.closeness - T.yearly_fade);
    }
  }
}

/** Household growth: younger siblings of a child, and children of the protagonist. */
export function householdGrowth(life, D, rng) {
  const T = D.tuning.social, age = Math.floor(life.clock.index / 4);
  const h = householdOf(life);
  const out = [];
  // younger sibling: only while a guardian of child-bearing age lives in the household
  if (age < 16) {
    const g = personsWithRole(life, D, 'caregiver').filter((p) => p.kin === 'parent' && personAge(p, life.clock.index) >= 18 && personAge(p, life.clock.index) <= 42);
    const sibs = Object.values(life.persons).filter((p) => p.kin === 'sibling' && p.alive).length;
    if (g.length >= 1 && sibs < T.sibling_cap && rng.chance(T.sibling_birth)) {
      const baby = addPerson(life, D, rng, { kin: 'sibling', ageYears: 0, household: h.id });
      baby.born_idx = life.clock.index;
      log(life, { type: 'person', icon: '👶', text: `家族に新しい子（${kinLabel(baby)}）が生まれた。`, tags: ['family'], refs: { person: baby.id } });
      out.push(baby.id);
    }
  }
  // children of a cohabiting partnership
  const partner = personsWithRole(life, D, 'partner').find((p) => life.relationships[p.id].partnership_status === 'cohabiting' && p.tags.includes('partner'));
  if (partner && age >= 18 && age <= 44) {
    const kids = Object.values(life.persons).filter((p) => p.kin === 'child').length;
    const pa = personAge(partner, life.clock.index);
    if (kids < T.child_cap && pa <= 44 && rng.chance(T.child_birth)) {
      const kid = addPerson(life, D, rng, { kin: 'child', ageYears: 0, household: h.id });
      kid.born_idx = life.clock.index;
      log(life, { type: 'person', icon: '👶', text: `${partner.name}との間に子（${kinLabel(kid)}）が生まれた。`, tags: ['family'], refs: { person: kid.id } });
      applyEffects(life, { happiness: 3, resources: -2 });
      out.push(kid.id);
    }
  }
  return out;
}

/** Everyone other than the protagonist can die too. Uses the same baseline table (no personal risk modifiers). */
export function personDeaths(life, D, rng, ctx) {
  const idx = life.clock.index, src = mortalitySource(life, D, ctx);
  const deaths = [];
  for (const p of Object.values(life.persons)) {
    if (!p.alive) continue;
    const age = personAge(p, idx);
    if (age < 0) continue;
    const q = quarterlyQ(annualQ(life, D, ctx, age, src), 1);
    if (rng.next() < q) {
      p.alive = false; p.died_idx = idx;
      const r = life.relationships[p.id];
      const was = r.status;
      r.status = 'ended_death';
      if (p.tags.includes('partner')) r.partnership_status = r.partnership_status || 'cohabiting';
      addRelHistory(life, p.id, '亡くなった');
      if (was === 'active') {
        const close = clamp((r.closeness - 20) / 80, 0, 1);
        const hit = -Math.round(2 + 6 * close);
        applyEffects(life, { happiness: hit });
        const lbl = kinLabel(p);
        log(life, {
          type: 'death_other', icon: '🕊', importance: 2,
          text: `${p.name}（${lbl}、${age}歳）が亡くなった。`,
          brief: `${p.name}（${lbl}）が亡くなった。`,
          tags: ['loss', 'family'], deltas: { happiness: hit }, refs: { person: p.id },
        });
        deaths.push(p.id);
      }
    }
  }
  return deaths;
}

/** If all guardians of a child are gone, a relative steps in so a child is never left without a caregiver. */
export function ensureGuardian(life, D, rng) {
  const age = Math.floor(life.clock.index / 4);
  if (age >= 18) return null;
  if (personsWithRole(life, D, 'caregiver').length > 0) return null;
  const h = householdOf(life);
  // promote an existing adult relative first
  const adults = Object.values(life.persons).filter((p) => isActive(life, p) && ['grandparent', 'aunt_uncle', 'other_kin', 'parent'].includes(p.kin) && personAge(p, life.clock.index) >= 18);
  let g = adults[0];
  if (!g) {
    const ageYears = Math.round(rng.range(26, 55));
    g = addPerson(life, D, rng, { kin: rng.chance(0.6) ? 'aunt_uncle' : 'other_kin', ageYears, tags: ['guardian'], household: h.id, closenessBoost: -10 });
    log(life, { type: 'family', icon: '🏠', importance: 2, text: `${g.name}（${kinLabel(g)}）があなたを引き取り、世話をしてくれることになった。`, brief: `${g.name}があなたの世話をしてくれることになった。`, tags: ['family'], refs: { person: g.id } });
  } else {
    if (!g.tags.includes('guardian')) g.tags.push('guardian');
    if (g.household_id !== h.id) { g.household_id = h.id; if (!h.members.includes(g.id)) h.members.push(g.id); }
    log(life, { type: 'family', icon: '🏠', importance: 2, text: `${g.name}（${kinLabel(g)}）が、あなたの世話を引き受けた。`, tags: ['family'], refs: { person: g.id } });
  }
  return g.id;
}
