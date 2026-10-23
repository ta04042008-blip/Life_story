// Ongoing states and the base (environment) change applied once per quarter, plus scheduled tasks and follow-up records.
import { clamp, clamp100, round1, expit, mean } from './util.js';
import { personAge } from './calendar.js';
import { log } from './history.js';
import { applyEffects, addSkill, householdOf, setResources, BAND_LABELS } from './effects.js';
import { addPerson, nextId, personsWithRole, isActive, kinLabel, bumpRel } from './persons.js';
import { reviewEpisode, resolveEpisode, activeEpisodes } from './episodes.js';
import { bandLabel } from './util.js';
import { SKILL_LABELS } from './opportunities.js';

const successProb = (S, Dif) => clamp(expit((S - Dif) / 12), 0.05, 0.95);

// ---------------------------------------------------------------------------------------------------------
// scheduled tasks: travel and illness reviews

export function processWorldTasks(life, D, rng, ctx) {
  const idx = life.clock.index, es = life.event_state, p = life.protagonist;
  const due = es.world_tasks.filter((t) => t.at <= idx);
  es.world_tasks = es.world_tasks.filter((t) => t.at > idx);
  for (const t of due) {
    if (t.task === 'travel_departure') {
      if (!p.travel || p.travel.status !== 'preparing') continue;
      p.travel.status = 'traveling';
      const arrive = idx + p.travel.travel_quarters;
      es.world_tasks.push({ id: `${t.id}:arrive`, task: 'travel_arrival', at: arrive, offer_id: p.travel.offer_id });
      log(life, { type: 'travel', icon: '🧳', text: `${p.travel.destination_label}へ向けて出発した。`, brief: '出発した。', tags: ['migration'] });
    } else if (t.task === 'travel_arrival') {
      if (!p.travel || p.travel.offer_id !== t.offer_id) continue;
      arrive(life, D, rng, ctx);
    } else if (t.task === 'illness_review') {
      const ep = p.illnesses[t.illness_id];
      if (!ep || ep.resolved) continue;
      reviewEpisode(life, D, rng, t);
    }
  }
}

function arrive(life, D, rng, ctx) {
  const p = life.protagonist, tr = p.travel;
  const old = householdOf(life);
  const comp = life.persons[tr.companion_id];
  const hid = nextId(life, 'h');
  const loc = { id: tr.destination_id, label: tr.destination_label, settlement_profile: tr.destination_profile };
  const display = clamp100(old.resources.display * D.tuning.migration.resource_keep);
  const members = ['me'];
  const moving = new Set();
  const minor = Math.floor(life.clock.index / 4) < 18;
  if (minor) { for (const m of old.members) moving.add(m); } // a child moves with the whole household
  else if (comp && comp.alive && isActive(life, comp)) moving.add(comp.id);
  for (const m of moving) if (m !== 'me') members.push(m);
  life.households[hid] = { id: hid, members, resources: { display, band: old.resources.band, band_at_birth: null }, location: loc, origin_note: `${tr.destination_label}で始めた世帯` };
  old.members = old.members.filter((m) => !members.includes(m));
  for (const m of members) if (m !== 'me') life.persons[m].household_id = hid;
  p.household_id = hid; p.location = loc;
  setResources(life, display);
  p.last_travel = { ...tr, status: 'arrived', arrived_idx: life.clock.index };
  p.travel = null;
  // those left behind drift into "away" status (no longer in daily contact)
  for (const pp of Object.values(life.persons)) if (pp.alive && pp.household_id === old.id) pp.away = true;
  log(life, { type: 'travel', icon: '📍', importance: 2, text: `${loc.label}に着き、新しい暮らしが始まった。`, brief: `${loc.label}に着いた。`, tags: ['migration'] });
  applyEffects(life, { happiness: 0 });
  // a first acquaintance in the new place
  if (rng.chance(D.tuning.migration.new_peer_chance)) {
    const a = Math.floor(life.clock.index / 4);
    const pr = addPerson(life, D, rng, { kin: 'friend', ageYears: Math.max(10, a + Math.round(rng.range(-6, 6))), tags: ['friend'] });
    log(life, { type: 'person', icon: '🤝', text: `${pr.name}と顔見知りになった。`, tags: ['meeting'], refs: { person: pr.id } });
  }
}

// ---------------------------------------------------------------------------------------------------------
// follow-up records (後日談): recorded once, never re-applying the original effects

function conditionHolds(life, f) {
  const p = life.protagonist, s = f.snapshot || {};
  switch (f.condition) {
    case 'protagonist_alive': return true;
    case 'protagonist_alive_and_same_education_active': return p.education.status === 'enrolled' && p.education.institution_id === s.edu;
    case 'protagonist_alive_and_same_job_active': return p.work?.status === 'active' && p.work.contract_id === s.contract;
    case 'protagonist_alive_and_same_apprenticeship_active': return p.apprenticeship?.status === 'active' && p.apprenticeship.contract_id === s.appr;
    case 'protagonist_alive_and_arrived_at_destination': return p.location.id === s.dest;
    case 'protagonist_alive_and_same_partnership_active': return !!s.partner && life.persons[s.partner]?.alive && life.relationships[s.partner]?.partnership_status === 'cohabiting';
    case 'protagonist_alive_and_partner_alive': return !!s.partner && !!life.persons[s.partner]?.alive;
    default: return true;
  }
}

function stateSentence(life, f) {
  const p = life.protagonist, h = householdOf(life);
  const bits = [`今の健康は「${bandLabel(p.health)}」、暮らし向きは「${BAND_LABELS[h.resources.band]}」`];
  const t = f.target_id ? life.persons[f.target_id] : null;
  if (t) {
    const r = life.relationships[t.id];
    if (t.alive && r.status === 'active') bits.push(`${t.name}との関係は 親密さ${Math.round(r.closeness)}・信頼${Math.round(r.trust)}・緊張${Math.round(r.tension)}`);
    else bits.push(`${t.name}との時間は、いまは思い出として残っている`);
  }
  return bits.join('。') + '。';
}

export function processFollowups(life, D) {
  const es = life.event_state, idx = life.clock.index;
  const due = es.followups.filter((f) => f.due_idx <= idx && !es.followups_done.includes(f.id));
  es.followups = es.followups.filter((f) => !(f.due_idx <= idx));
  for (const f of due) {
    es.followups_done.push(f.id);
    if (es.followups_done.length > 400) es.followups_done.splice(0, 100);
    if (!conditionHolds(life, f)) {
      log(life, { type: 'followup', icon: '📝', text: `【後日談｜${f.title}】あのころの状況は変わり、暮らしは別の形になっている。`, brief: `【後日談｜${f.title}】状況は変わった。`, tags: ['followup'], refs: { followup: f.id } });
      continue;
    }
    log(life, { type: 'followup', icon: '📝', text: `【後日談｜${f.title}】${f.text} ${stateSentence(life, f)}`, brief: `【後日談｜${f.title}】${stateSentence(life, f)}`, tags: ['followup'], refs: { followup: f.id } });
  }
}

// ---------------------------------------------------------------------------------------------------------
// base environment change

function healthTarget(D, age, resources) {
  const S = D.tuning.state;
  const decline = Math.max(0, age - S.health_decline_from) * S.health_decline_per_year;
  return clamp(S.health_target_base - decline + S.health_resource_slope * (resources - 50), 15, 90);
}

export function environmentStep(life, D, rng, ctx) {
  const S = D.tuning.state, p = life.protagonist, h = householdOf(life), age = Math.floor(life.clock.index / 4);

  // health: drift toward an age/resource dependent level, extra pressure when resources are short
  const t = healthTarget(D, age, h.resources.display);
  let dh = S.health_drift * (t - p.health);
  if (h.resources.display < S.scarcity_below) dh -= S.scarcity_health_loss;
  p.health = clamp100(p.health + dh);

  // household resources: slow return to the household's own level, noise, work income, child costs
  const anchor = h.anchor ?? (h.anchor = h.resources.display);
  let dr = S.resource_return * (anchor - h.resources.display) + rng.normal(0, S.resource_noise);
  if (p.work?.status === 'active') dr += D.tuning.work.income_per_quarter[p.work.wage_level || 'mid'];
  const kids = personsWithRole(life, D, 'dependent').filter((x) => personAge(x, life.clock.index) < 15).length;
  dr -= kids * S.child_cost;
  setResources(life, h.resources.display + dr);

  // learning: age-appropriate accumulation
  if (age >= 6) {
    const a = p.learning_access, enrolled = p.education.status === 'enrolled';
    let g = S.learning_independent * (ctx.flags.self_study ? 1 : 0.5);
    if (a) g = Math.max(g, S.learning_access[a.kind] ?? 0.4);
    if (enrolled) g = Math.max(g, S.learning_enrolled);
    p.learning = clamp100(p.learning + g * (1 - p.learning / 120));
    if (a && (a.kind === 'household' || a.kind === 'community' || a.kind === 'school')) addSkill(life, 'literacy', 0.35);
  }

  progressEducation(life, D, rng);
  progressApprenticeship(life, D, rng);
  progressWork(life, D, rng, age);
}

function progressEducation(life, D, rng) {
  const p = life.protagonist, e = p.education;
  if (e.status !== 'enrolled') return;
  if (life.clock.index < e.start_quarter + e.duration_quarters) return;
  const h = householdOf(life);
  const S = 0.45 * p.learning + 0.2 * p.happiness + 0.2 * p.health + 0.15 * h.resources.display;
  const prob = successProb(S, D.tuning.education.difficulty);
  if (rng.next() < prob) {
    e.status = 'completed'; e.end_idx = life.clock.index;
    const d = applyEffects(life, { learning: 3, happiness: 2 });
    log(life, { type: 'learning', icon: '🎓', importance: 2, text: '学びの区切りを迎え、ひと通りを修めることができた。', brief: '学びを修めた。', tags: ['education'], deltas: d });
  } else {
    e.status = 'withdrawn'; e.end_idx = life.clock.index;
    const d = applyEffects(life, { learning: 1, happiness: -2 });
    log(life, { type: 'learning', icon: '📘', importance: 2, text: '学びの場は思うように続かず、途中で離れることになった。得たものは残っている。', brief: '学びの場を離れた。', tags: ['education'], deltas: d });
  }
}

function progressApprenticeship(life, D, rng) {
  const p = life.protagonist, a = p.apprenticeship;
  if (!a || a.status !== 'active') return;
  const mentor = life.persons[a.mentor_id];
  if (!mentor || !mentor.alive) {
    a.status = 'interrupted'; a.end_idx = life.clock.index;
    log(life, { type: 'learning', icon: '🛠', importance: 2, text: '教えてくれていた人がいなくなり、修業は中断された。身についたことは残っている。', brief: '修業は中断された。', tags: ['apprenticeship'] });
    return;
  }
  addSkill(life, a.skill_id, D.tuning.apprenticeship.skill_per_quarter);
  bumpRel(life, mentor.id, 'trust', 0.4);
  bumpRel(life, mentor.id, 'closeness', 0.4);
  if (life.clock.index < a.start_quarter + a.duration_quarters) return;
  const r = life.relationships[mentor.id];
  const S = 0.3 * p.learning + 0.3 * (p.skills[a.skill_id] ?? 0) + 0.2 * r.trust + 0.2 * p.health;
  const prob = successProb(S, D.tuning.apprenticeship.difficulty);
  if (rng.next() < prob) {
    a.status = 'completed'; a.end_idx = life.clock.index;
    const gain = addSkill(life, a.skill_id, D.tuning.apprenticeship.completion_bonus);
    const d = applyEffects(life, { happiness: 3, learning: 2 });
    log(life, { type: 'learning', icon: '🛠', importance: 2, text: `${mentor.name}のもとでの修業を終え、「${SKILL_LABELS[a.skill_id]}」をひと通り身につけた。`, brief: `修業を終えた。`, tags: ['apprenticeship'], deltas: { ...d, [a.skill_id]: gain } });
  } else {
    a.status = 'ended_early'; a.end_idx = life.clock.index;
    const gain = addSkill(life, a.skill_id, D.tuning.apprenticeship.partial_bonus);
    log(life, { type: 'learning', icon: '🛠', importance: 2, text: `修業は思うようには運ばず、区切りをつけることになった。それでも「${SKILL_LABELS[a.skill_id]}」の手応えは残った。`, brief: '修業に区切りをつけた。', tags: ['apprenticeship'], deltas: { [a.skill_id]: gain } });
  }
}

function progressWork(life, D, rng, age) {
  const p = life.protagonist, w = p.work;
  if (!w || w.status !== 'active') return;
  addSkill(life, 'livelihood', D.tuning.work.skill_per_quarter);
  const T = D.tuning.work;
  let stop = null;
  if (age >= T.retire_from && rng.chance(Math.min(T.retire_max, T.retire_step * (age - T.retire_from + 1)))) stop = '仕事を退き、暮らしの重心を移した。';
  else if (p.health < T.health_stop && rng.chance(0.35)) stop = '体調のため、仕事を離れることになった。';
  else rng.next(); // keep draw count stable
  if (stop) {
    w.status = 'ended'; w.end_idx = life.clock.index;
    p.work_history = p.work_history || []; p.work_history.push({ ...w });
    log(life, { type: 'work', icon: '🧰', importance: 2, text: stop, brief: '仕事を離れた。', tags: ['work'] });
    p.work = null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// happiness follows living conditions slowly (prototype-rules section 3)

export function updateHappiness(life, D) {
  const S = D.tuning.state, p = life.protagonist, h = householdOf(life);
  const active = Object.values(life.persons).filter((x) => isActive(life, x));
  const supports = active.filter((x) => life.relationships[x.id].closeness >= 40 && life.relationships[x.id].trust >= 40).length;
  const together = active.filter((x) => x.household_id === p.household_id);
  const conflict = together.reduce((s, x) => s + Math.max(0, life.relationships[x.id].tension - 50) / 10, 0);
  const isolated = !active.some((x) => life.relationships[x.id].closeness >= 30);
  const relAdj = clamp(S.support_weight * Math.min(S.support_cap, supports) - conflict - (isolated ? S.isolation_penalty : 0), -10, 10);
  const target = 50 + 0.2 * (p.health - 50) + 0.2 * (h.resources.display - 50) + relAdj;
  p.happiness = clamp100(p.happiness + S.happiness_rate * (target - p.happiness));
  return { target: round1(target), relAdj: round1(relAdj) };
}
