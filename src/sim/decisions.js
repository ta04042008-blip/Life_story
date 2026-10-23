// Building decisions: which small choice is offered this quarter, and the exact major-decision objects.
// A decision is stored in full (text, choices, bound person, offer snapshot) so a saved game resumes the identical prompt.
import { nextId, personsWithRole, isActive } from './persons.js';
import { householdOf } from './effects.js';
import { activeEpisodes } from './episodes.js';
import { clone } from './util.js';

export const MAJOR_EVENT = {
  education: 'education_transition', apprenticeship: 'apprenticeship_offer', job: 'job_offer',
  migration: 'migration_offer', partnership: 'partnership_decision', treatment: 'treatment_decision',
};
const OFFER_KEY = { education: 'education', apprenticeship: 'apprenticeship', job: 'work', migration: 'migration', partnership: 'partnership' };
export const FOCUS_LABELS = { livelihood: '生計', learning: '学び・技能', relationships: '家族・人間関係', health: '健康・安全' };

export function renderTerms(text, terms) {
  return text.replace(/\{(\w+)\}/g, (m, k) => terms[k] ?? m);
}

/** Impl-defined life conditions used by extra events. */
function condHolds(life, D, token) {
  const p = life.protagonist;
  switch (token) {
    case 'work_active': return p.work?.status === 'active';
    case 'no_work': return !p.work || p.work.status !== 'active';
    case 'partnered': return personsWithRole(life, D, 'partner').some((x) => x.tags.includes('partner'));
    case 'not_partnered': return !personsWithRole(life, D, 'partner').some((x) => x.tags.includes('partner'));
    case 'has_dependent': return personsWithRole(life, D, 'dependent').length > 0;
    case 'enrolled': return p.education.status === 'enrolled' || p.learning_access?.kind === 'school';
    case 'no_mentor': return personsWithRole(life, D, 'mentor').length === 0;
    case 'few_friends': return personsWithRole(life, D, 'friend').length < 3;
    case 'few_peers': return personsWithRole(life, D, 'peer').length + personsWithRole(life, D, 'friend').length < 2;
    case 'has_illness': return activeEpisodes(life).length > 0;
    case 'no_illness': return activeEpisodes(life).length === 0;
    case 'travelling': return !!p.travel;
    default: return true;
  }
}

function contextOk(life, D, ctx, ev) {
  const r = ev.context_requires;
  if (!r) return true;
  if (r.era_in && !r.era_in.includes(ctx.era_id)) return false;
  if (r.settlement_in && !r.settlement_in.includes(ctx.settlement_profile)) return false;
  if (r.min_year && ctx.year < r.min_year) return false;
  if (r.max_year && ctx.year > r.max_year) return false;
  if (r.all) for (const t of r.all) if (!condHolds(life, D, t)) return false;
  return true;
}

function choiceFeasible(life, D, caps, ch, eventRoles) {
  const req = ch.requires;
  if (!req) return true;
  if (req.capabilities_all && !req.capabilities_all.every((c) => caps.has(c))) return false;
  if (req.roles && !req.roles.every((r) => personsWithRole(life, D, r).length > 0)) return false;
  if (req.min_resources != null && householdOf(life).resources.display < req.min_resources) return false;
  if (req.all && !req.all.every((t) => condHolds(life, D, t))) return false;
  return true;
}

function rolesResolve(life, D, ev, binding) {
  const roles = ev.required_person_roles || [];
  const target = binding?.target_binding?.role ? [binding.target_binding.role] : roles;
  const found = {};
  for (const r of new Set([...roles, ...target])) {
    const ps = personsWithRole(life, D, r);
    if (!ps.length) return null;
    found[r] = ps[0].id;
  }
  return { found, primary: roles[0] ? found[roles[0]] : (target[0] ? found[target[0]] : null), role: roles[0] || target[0] || null };
}

export function eligibleSmallEvents(life, D, ctx, caps) {
  const idx = life.clock.index, age = Math.floor(idx / 4), es = life.event_state;
  const out = [];
  for (const ev of D.eventList) {
    if (ev.kind !== 'small' || ev.id === D.fallbackPolicy.id) continue;
    if (age < ev.age_min || age > ev.age_max) continue;
    const last = es.cooldowns[ev.id];
    if (last != null && ev.cooldown_quarters != null && idx - last < ev.cooldown_quarters) continue;
    if (ev.max_occurrences != null && (es.counts[ev.id] || 0) >= ev.max_occurrences) continue;
    if (!(ev.capabilities_all || []).every((c) => caps.has(c))) continue;
    if (!contextOk(life, D, ctx, ev)) continue;
    const binding = ctx.binding?.bindingsById?.[ev.id] || null;
    const rr = rolesResolve(life, D, ev, binding);
    if (!rr) continue;
    const allowed = binding?.inherit_choice_ids;
    const feasible = ev.choices.filter((c) => (!allowed || allowed.includes(c.id)) && choiceFeasible(life, D, caps, c));
    if (feasible.length < 2) continue;
    out.push({ ev, binding, rr, choices: feasible });
  }
  return out;
}

export function scoreEvent(cand, focus, D, life) {
  const idx = life.clock.index, es = life.event_state;
  let w = cand.ev.weight ?? 1;
  const best = Math.max(...cand.choices.map((c) => c.focus_scores?.[focus] ?? 0));
  if (best >= 3) w *= D.tuning.selection.focus_boost;
  const seenAt = es.recent_small.lastIndexOf(cand.ev.id);
  if (seenAt >= 0) w *= D.tuning.selection.recent_penalty;
  return w;
}

function bodyText(ev, binding, ctx, expression) {
  const std = binding ? binding.text_standard : renderTerms(ev.text_standard, ctx.terms);
  const brief = binding ? (binding.text_brief || binding.text_standard) : renderTerms(ev.text_brief || ev.text_standard, ctx.terms);
  return { std, brief };
}

function snapshotChoices(choices) {
  return choices.map((c) => ({
    id: c.id, text: c.text, effects: clone(c.effects || {}), focus_scores: clone(c.focus_scores || {}), risk: c.risk || 0,
    personality_tags: clone(c.personality_tags || {}), creates: c.creates ? clone(c.creates) : null, skills: c.skills ? clone(c.skills) : null,
    consumes_offer: c.consumes_offer || null,
  }));
}

export function buildSmallDecision(life, D, ctx, caps, cand) {
  const { ev, binding, rr, choices } = cand;
  const age = Math.floor(life.clock.index / 4);
  const t = bodyText(ev, binding, ctx);
  const id = nextId(life, 'd');
  const actor = age < 6 ? 'caregiver' : 'protagonist';
  return {
    id, kind: 'small', event_id: ev.id, title: ev.title, source: ev.source, quarter_idx: life.clock.index,
    text_standard: t.std, text_brief: t.brief, content_tags: ev.content_tags || [],
    actor, target: rr.primary ? { role: rr.role, person_id: rr.primary } : null,
    choices: snapshotChoices(choices), context_line: `${ctx.terms.scene}`,
    weight: D.tuning.personality.weights.small,
  };
}

export function buildFallbackDecision(life, D, ctx, caps) {
  const F = D.fallbackPolicy, age = Math.floor(life.clock.index / 4);
  const opts = F.options.filter((o) => age >= (o.age_min ?? 0) && age <= (o.age_max ?? 200) && choiceFeasible(life, D, caps, o));
  const id = nextId(life, 'd');
  const members = personsWithRole(life, D, 'household_member');
  return {
    id, kind: 'small', event_id: F.id, title: F.title, source: 'fallback', quarter_idx: life.clock.index,
    text_standard: renderTerms(age < 6 ? F.text_infant : F.text, ctx.terms), text_brief: renderTerms(age < 6 ? F.text_infant : F.text, ctx.terms), content_tags: [],
    actor: age < 6 ? 'caregiver' : 'protagonist', target: members.length ? { role: 'household_member', person_id: members[0].id } : null,
    choices: snapshotChoices(opts), context_line: ctx.terms.scene, weight: D.tuning.personality.weights.small,
  };
}

/** Pop the next valid major seed and turn it into a decision object. Returns null when none remain. */
export function nextMajorDecision(life, D, ctx, caps) {
  const q = life.event_state.quarter;
  while (q.majors.length) {
    const seed = q.majors.shift();
    const d = buildMajorDecision(life, D, ctx, caps, seed);
    if (d) return d;
  }
  return null;
}

function buildMajorDecision(life, D, ctx, caps, seed) {
  const evId = MAJOR_EVENT[seed.type];
  const ev = D.events[evId];
  const age = Math.floor(life.clock.index / 4);
  const binding = ctx.binding?.bindingsById?.[evId] || null;
  const es = life.event_state;
  let offer = null, ep = null;
  if (seed.type === 'treatment') {
    ep = life.protagonist.illnesses[seed.illness_id];
    if (!ep || ep.resolved || ep.care_plan) return null;
  } else {
    offer = es.offers[OFFER_KEY[seed.type]];
    if (!offer) return null; // already used (e.g. work chosen in the education decision)
    if (seed.type === 'job' && offer.scope !== 'job') return null;
    if (es.consumed_offers.includes(offer.id)) return null;
  }
  if (age < ev.age_min || age > ev.age_max) return null;
  const rr = rolesResolve(life, D, ev, binding);
  if (!rr) return null;
  const allowed = binding?.inherit_choice_ids;
  let choices = ev.choices.filter((c) => (!allowed || allowed.includes(c.id)) && choiceFeasible(life, D, caps, c));
  if (seed.type === 'treatment') {
    const care = choices.find((c) => c.id === 'care');
    if (care && householdOf(life).resources.display < D.tuning.episodes.care_min_resources) choices = choices.filter((c) => c.id !== 'care');
  }
  if (seed.type === 'education' && !choices.some((c) => c.id === 'enroll')) return null;
  if (choices.length < 2) {
    // the spec: fewer than two executable choices means the decision is not presented
    return null;
  }
  const t = bodyText(ev, binding, ctx);
  const id = nextId(life, 'd');
  const actor = (seed.type === 'treatment' && age < 6) ? 'caregiver' : 'protagonist';
  const decision = {
    id, kind: 'major', major_type: seed.type, event_id: evId, title: ev.title, source: 'spec', quarter_idx: life.clock.index,
    text_standard: t.std, text_brief: t.brief, content_tags: ev.content_tags || [], actor,
    target: rr.primary ? { role: rr.role, person_id: rr.primary } : null,
    offer_id: offer?.id || null, offer_kind: offer ? OFFER_KEY[seed.type] : null, offer: offer ? clone(offer) : null,
    illness_id: ep?.id || null, illness: ep ? { id: ep.id, family: ep.family, severity: ep.severity } : null,
    choices: snapshotChoices(choices), context_line: ctx.terms.scene, weight: D.tuning.personality.weights.major,
  };
  // concrete text so the player sees the real names behind the offer
  decision.detail = describeOffer(life, D, decision, ctx);
  return decision;
}

export function describeOffer(life, D, d, ctx) {
  const o = d.offer;
  const name = (id) => life.persons[id]?.name;
  switch (d.major_type) {
    case 'education': return `${o.institution_label}への道が開けています（目安：${o.duration_quarters}四半期）。`;
    case 'apprenticeship': return `${name(o.mentor_id)}のもとで「${({ literacy: '読み書きと記録', craft: '手仕事', livelihood: '生業の技', care: '世話や看護' })[o.skill_id]}」を身につける話です（目安：${o.duration_quarters}四半期）。`;
    case 'job': return `${o.label}にかかわる仕事の話です（${({ low: '収入は控えめ', mid: '収入は並', high: '収入は手厚め' })[o.wage_level]}）。`;
    case 'migration': return `${o.destination_label}への移住の話です。同行するのは${name(o.companion_id)}。移動には約${o.travel_quarters}四半期かかります。`;
    case 'partnership': return `${name(o.partner_id)}と暮らしを共にする話が持ち上がっています。`;
    case 'treatment': return `${({ short_illness: '体調不良', injury: 'けが', chronic_condition: '長引く不調' })[d.illness.family]}（${({ moderate: 'やや重い', serious: '重い' })[d.illness.severity] || '軽い'}）への向き合い方を決めます。`;
    default: return '';
  }
}

export function isDecisionStillValid(life, D, d) {
  if (d.target && !isActive(life, life.persons[d.target.person_id])) return false;
  if (d.kind !== 'major') return true;
  if (d.major_type === 'treatment') { const ep = life.protagonist.illnesses[d.illness_id]; return !!ep && !ep.resolved && !ep.care_plan; }
  const cur = life.event_state.offers[d.offer_kind];
  if (!cur || cur.id !== d.offer_id) return false;
  if (d.major_type === 'apprenticeship') return isActive(life, life.persons[d.offer.mentor_id]);
  if (d.major_type === 'partnership') return isActive(life, life.persons[d.offer.partner_id]);
  if (d.major_type === 'migration') return isActive(life, life.persons[d.offer.companion_id]) && !life.protagonist.travel;
  return true;
}
