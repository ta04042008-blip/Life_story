// Opportunities ("offers") and the capabilities derived from them.
// An offer is a concrete chance (a place, a master, a job, a destination, a partner). The estimate file gives the
// annual chance that at least one offer of a family appears for an eligible person - NOT the chance it is accepted.
// Capabilities (what the events ask for) are never switched on by culture or age alone: they come from offers and state.
import { quarterlyFromAnnual } from './util.js';
import { range } from './data.js';
import { addPerson, nextId, personsWithRole, isActive, kinLabel } from './persons.js';
import { log } from './history.js';
import { householdOf } from './effects.js';
import { activeEpisodes } from './episodes.js';

export const SKILL_LABELS = { literacy: '読み書きと記録', craft: '手仕事', livelihood: '生業の技', care: '世話や看護' };

export function opportunityRates(D, ctx) {
  const prof = D.oppProfiles[ctx.opp_profile];
  const q = (r) => quarterlyFromAnnual(range(r));
  return { learning: q(prof.learning), work: q(prof.paid_or_household_work), migration: q(prof.migration), care_support: q(prof.care_support), profile: ctx.opp_profile };
}

// ---------------------------------------------------------------------------------------------------------
// Learning access: who/what teaches the protagonist right now (household, community teacher, master, school).

function pickAccessKind(rng, kinds, age) {
  const w = { household: 1, community: 2, master: age >= 10 ? 2 : 0, school: 4 };
  const items = kinds.map((k) => ({ k, w: w[k] ?? 1 }));
  return rng.weighted(items).k;
}

function startAccess(life, D, rng, ctx, kind, byCaregiver) {
  const A = D.tuning.access, p = life.protagonist, age = Math.floor(life.clock.index / 4);
  const h = householdOf(life);
  if (h.resources.display < A.min_resources[kind]) {
    log(life, { type: 'learning', icon: '📖', text: `${ctx.terms.school}に通う話はあったが、暮らしの事情で見送られた。`, brief: '学ぶ機会は見送られた。', tags: ['learning'] });
    return null;
  }
  let providerId = null;
  if (kind === 'household') {
    const elder = Object.values(life.persons).filter((x) => isActive(life, x) && x.household_id === p.household_id && ['parent', 'grandparent', 'aunt_uncle', 'sibling'].includes(x.kin)).sort((a, b) => a.born_idx - b.born_idx)[0];
    providerId = elder ? elder.id : null;
  } else {
    const t = addPerson(life, D, rng, { kin: 'mentor', ageYears: Math.round(rng.range(28, 58)), tags: ['mentor', 'teacher'] });
    providerId = t.id;
  }
  const len = A.length_quarters[kind];
  p.learning_access = { id: nextId(life, 'a'), kind, provider_id: providerId, since_idx: life.clock.index, ends_idx: life.clock.index + len[0] + rng.int(len[1] - len[0] + 1) };
  const labels = { household: '身近な大人から読み書きや知識を教わる', community: `${ctx.terms.school}に通い始める`, master: `${ctx.terms.mentor}のもとで学び始める`, school: `${ctx.terms.school}に通い始める` };
  log(life, {
    type: 'learning', icon: '📖',
    text: byCaregiver ? `養育者の判断で、${labels[kind]}ことになった。` : `${labels[kind]}ことになった。`,
    brief: `${labels[kind]}ことになった。`, tags: ['learning'], refs: providerId ? { person: providerId } : null,
  });
  return p.learning_access;
}

export function updateAccess(life, D) {
  const p = life.protagonist, a = p.learning_access;
  if (!a) return;
  const prov = a.provider_id ? life.persons[a.provider_id] : null;
  const gone = prov && (!prov.alive || life.relationships[prov.id].status !== 'active');
  if (life.clock.index >= a.ends_idx || gone) {
    log(life, { type: 'learning', icon: '📖', text: gone ? '教えてくれていた人がいなくなり、その学びの場は終わった。' : '通っていた学びの区切りがついた。', brief: '学びの場が終わった。', tags: ['learning'] });
    p.learning_access = null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Offers for this quarter.

export function currentOffers(life) { return life.event_state.offers; }

function makeOffer(life, kind, build) {
  const id = nextId(life, 'o');
  const extra = typeof build === 'function' ? build(id) : build;
  const o = { id, kind, created_idx: life.clock.index, ...extra };
  life.event_state.offers[kind] = o;
  life.event_state.quarter.offers_new.push(id);
  return o;
}

export function generateOffers(life, D, rng, ctx) {
  const T = D.tuning, p = life.protagonist, q = life.event_state.quarter, age = Math.floor(life.clock.index / 4);
  const rates = opportunityRates(D, ctx), h = householdOf(life);
  const kinds = ctx.flags.learning_kinds;

  // --- learning family
  const learnHit = rng.next() < rates.learning; // one draw per quarter, always
  if (learnHit) {
    if (age >= 5 && age <= 11 && !p.learning_access) {
      startAccess(life, D, rng, ctx, pickAccessKind(rng, kinds, age), true);
    } else if (age >= 12 && age <= 25) {
      const canEdu = (kinds.includes('school') || kinds.includes('master')) && h.resources.display >= T.education.min_resources && p.education.status !== 'enrolled';
      const canApp = (kinds.includes('master') || kinds.includes('community')) && !p.apprenticeship && age >= 10 && h.resources.display >= T.apprenticeship.min_resources;
      const opts = [];
      if (canEdu) opts.push({ k: 'education', w: T.education.share });
      if (canApp) opts.push({ k: 'apprenticeship', w: T.apprenticeship.share });
      if (!p.learning_access && age <= 17) opts.push({ k: 'access', w: 1 });
      if (opts.length) {
        const pick = rng.weighted(opts).k;
        if (pick === 'access') startAccess(life, D, rng, ctx, pickAccessKind(rng, kinds, age), false);
        else if (pick === 'education') {
          const dur = age < 16 ? 12 + rng.int(9) : 8 + rng.int(9);
          makeOffer(life, 'education', (id) => ({ institution_id: `inst:${ctx.id}:${id}`, institution_label: ctx.terms.school, start_quarter: life.clock.index + 1, duration_quarters: dur }));
          q.majors.push({ type: 'education', priority: 1 });
        } else {
          const skill = rng.weighted([{ k: 'craft', w: 3 }, { k: 'livelihood', w: 3 }, { k: 'literacy', w: ctx.flags.writing_common || kinds.includes('master') ? 2 : 1 }, { k: 'care', w: 1 }]).k;
          const mentor = addPerson(life, D, rng, { kin: 'mentor', ageYears: Math.round(rng.range(30, 60)), tags: ['mentor_candidate'] });
          const dur = 8 + rng.int(13);
          makeOffer(life, 'apprenticeship', (id) => ({ contract_id: `c:${id}`, skill_id: skill, mentor_id: mentor.id, duration_quarters: dur, terms_known: true }));
          q.majors.push({ type: 'apprenticeship', priority: 1 });
        }
      }
    } else if (age >= 20 && age <= 70) {
      q.flags.adult_learning = true;
    }
  }

  // --- work family
  const workHit = rng.next() < rates.work;
  const jobRoll = rng.next();
  if (workHit && age >= 13 && age <= 70 && !life.event_state.offers.work) {
    const share = p.work ? T.work.job_share_employed : T.work.job_share_unemployed;
    const isJob = age >= 15 && jobRoll < share;
    const wage = rng.weighted([{ k: 'low', w: 0.3 }, { k: 'mid', w: 0.5 }, { k: 'high', w: 0.2 }]).k;
    makeOffer(life, 'work', (id) => ({ scope: isJob ? 'job' : 'side', job_id: `job:${id}`, contract_id: `c:${id}`, wage_level: wage, label: ctx.terms.work, prerequisites_met: true }));
    if (isJob) q.majors.push({ type: 'job', priority: 1 });
  }

  // --- migration family
  const migHit = rng.next() < rates.migration;
  if (migHit && age >= 16 && age <= 70 && !p.travel && !life.event_state.offers.migration) {
    const mates = personsWithRole(life, D, 'household_member');
    if (mates.length) {
      const prof = rng.weighted(Object.entries(T.migration.destination_profile_weights).map(([k, w]) => ({ k, w }))).k;
      const tq = ctx.year >= 1950 ? 1 : 1 + rng.int(3);
      makeOffer(life, 'migration', (id) => ({ destination_id: `dest:${id}`, destination_label: ctx.terms.destination, destination_profile: prof, travel_quarters: tq, housing_available: true, route_valid: true, companion_id: mates[0].id }));
      q.majors.push({ type: 'migration', priority: 1 });
    }
  }

  // --- care & support family: a helper who can actually help exists this quarter
  const careHit = rng.next() < rates.care_support;
  const helpers = Object.values(life.persons).filter((x) => isActive(life, x) && life.relationships[x.id].closeness >= 30 && !x.tags.includes('partner_candidate'));
  q.flags.care_support = careHit && helpers.length > 0;

  // --- partnership: a candidate who is close enough, mutual consent assumed from the relationship values
  const partners = personsWithRole(life, D, 'partner');
  const cand = partners.find((x) => x.tags.includes('partner_candidate') || life.relationships[x.id].partnership_status === 'separate_households');
  const partnered = partners.some((x) => life.relationships[x.id].partnership_status === 'cohabiting');
  const partRoll = rng.next();
  const lastOffer = life.event_state.last_partner_offer_idx ?? -99;
  if (cand && !partnered && age >= 18 && !life.event_state.offers.partnership && life.clock.index - lastOffer >= T.partner.reoffer_quarters) {
    const r = life.relationships[cand.id];
    if (r.closeness >= T.partner.min_closeness && r.trust >= T.partner.min_trust && partRoll < T.partner.offer_per_quarter) {
      const hasGuardian = personsWithRole(life, D, 'household_member').some((x) => x.tags.includes('guardian') || ['parent', 'grandparent'].includes(x.kin));
      const planKind = (age < 24 && hasGuardian) ? 'new_household' : 'merge_into_protagonist_household';
      life.event_state.last_partner_offer_idx = life.clock.index;
      makeOffer(life, 'partnership', { partner_id: cand.id, mutual_consent: true, allowed_arrangement: true, household_plan: { kind: planKind, partner_id: cand.id } });
      q.majors.push({ type: 'partnership', priority: 2 });
    }
  }

  // --- illness: treatment decisions come from episodes that need one
  for (const ep of activeEpisodes(life)) {
    if (ep.decision_needed && !ep.care_plan && !ep.decision_queued) {
      ep.decision_queued = true;
      q.majors.push({ type: 'treatment', priority: 0, illness_id: ep.id });
    }
  }
  q.majors.sort((a, b) => a.priority - b.priority);
}

/** Offers expire at the end of the quarter in which they were made (decisions are answered before time moves on). */
export function expireOffers(life) {
  const offers = life.event_state.offers;
  for (const k of Object.keys(offers)) {
    life.event_state.consumed_offers.push(offers[k].id);
    delete offers[k];
  }
  if (life.event_state.consumed_offers.length > 200) life.event_state.consumed_offers.splice(0, 100);
}

// ---------------------------------------------------------------------------------------------------------

export function computeCapabilities(life, D, ctx) {
  const p = life.protagonist, q = life.event_state.quarter, offers = life.event_state.offers;
  const age = Math.floor(life.clock.index / 4);
  const caps = new Set();
  const access = p.learning_access;
  const accessAlive = access && (!access.provider_id || isActive(life, life.persons[access.provider_id]));
  const enrolled = p.education.status === 'enrolled';
  if (age >= 6 && (accessAlive || enrolled)) caps.add('literacy_instruction');
  if (age >= 6 && ctx.flags.self_study) caps.add('independent_learning');
  const hasTeacher = personsWithRole(life, D, 'mentor').length > 0 || (access && ['community', 'master', 'school'].includes(access.kind));
  if (age >= 8 && (hasTeacher || p.apprenticeship?.status === 'active')) caps.add('craft_learning');
  if ((access?.kind === 'school' && accessAlive) || enrolled) caps.add('formal_school_enrolled');
  if (offers.work) caps.add('paid_work_available');
  if (q.flags.adult_learning) caps.add('adult_learning_available');
  if (q.flags.care_support) caps.add('care_support_available');
  const listeners = Object.values(life.persons).filter((x) => isActive(life, x) && life.relationships[x.id].closeness >= 30);
  if (listeners.length) caps.add('recording_available');
  if (offers.education) caps.add('education_offer');
  if (offers.apprenticeship) caps.add('apprenticeship_offer');
  if (offers.work && offers.work.scope === 'job') caps.add('job_offer');
  if (offers.migration) caps.add('migration_offer');
  if (offers.partnership) caps.add('mutual_partnership_offer');
  if (activeEpisodes(life).some((e) => e.decision_needed && !e.care_plan)) caps.add('treatment_options_available');
  if (p.work?.status === 'active') caps.add('work_active');
  return caps;
}
