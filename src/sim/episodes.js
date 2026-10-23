// Illness / injury / chronic-condition episodes. New episodes appear at the spec's illustrative annual ranges
// (pacing parameters, NOT incidence rates). How an episode ends is a separate small game model.
import { quarterlyFromAnnual, clamp, expit, mean } from './util.js';
import { range } from './data.js';
import { nextId, personsWithRole } from './persons.js';
import { log } from './history.js';
import { applyEffects, householdOf } from './effects.js';

const FAMILY_LABEL = { short_illness: '体調を崩した', injury: 'けがをした', chronic_condition: '長く続く体の不調が出てきた' };

function ageBand(age) {
  if (age < 5) return '0-4';
  if (age < 15) return '5-14';
  if (age < 40) return '15-39';
  if (age < 65) return '40-64';
  return '65+';
}

export function activeEpisodes(life) { return Object.values(life.protagonist.illnesses).filter((e) => !e.resolved); }

/** Possibly start new episodes this quarter. Returns the new episodes. */
export function spawnEpisodes(life, D, rng) {
  const age = Math.floor(life.clock.index / 4);
  const bands = D.opp.health_episode_model.age_bands[ageBand(age)];
  const E = D.tuning.episodes;
  const made = [];
  for (const [family, rg] of Object.entries(bands)) {
    if (activeEpisodes(life).some((e) => e.family === family)) continue;
    if (!rng.chance(quarterlyFromAnnual(range(rg)))) continue;
    const sev = rng.weighted(Object.entries(E.severity_weights[family]).map(([k, w]) => ({ k, w }))).k;
    const id = nextId(life, 'e');
    const ep = {
      id, family, severity: sev, start_idx: life.clock.index, quarters_active: 0,
      duration: E.duration[family] ? E.duration[family][0] + rng.int(E.duration[family][1] - E.duration[family][0] + 1) : null,
      care_plan: null, decision_needed: false, resolved: false, reviews: 0,
    };
    ep.decision_needed = sev !== 'mild';
    life.protagonist.illnesses[id] = ep;
    const txt = FAMILY_LABEL[family];
    log(life, {
      type: 'health', icon: family === 'injury' ? '🩹' : '🌡', importance: sev === 'serious' ? 2 : 1,
      text: `${txt}。${sev === 'mild' ? '大事には至らなそうだ。' : sev === 'moderate' ? 'しばらく無理はできそうにない。' : 'しばらく生活への影響が続きそうだ。'}`,
      brief: `${txt}。`, tags: ['health', family],
    });
    made.push(ep);
  }
  return made;
}

/** Per-quarter effect of episodes still running. */
export function episodeQuarterEffects(life, D, rng) {
  const E = D.tuning.episodes;
  for (const ep of activeEpisodes(life)) {
    ep.quarters_active += 1;
    let loss = E.health_loss[ep.severity];
    if (ep.family === 'chronic_condition') loss = E.health_loss_chronic[ep.severity];
    if (ep.care_plan?.mode === 'treatment') loss *= E.plan_factor.treatment;
    else if (ep.care_plan?.mode === 'daily_support') loss *= E.plan_factor.daily_support;
    applyEffects(life, { health: -loss, happiness: -loss * 0.25 });
    // natural recovery for episodes without a scheduled review
    if (ep.family !== 'chronic_condition' && !ep.care_plan && ep.quarters_active >= ep.duration) {
      if (rng.chance(E.natural_recovery[ep.severity])) resolveEpisode(life, D, ep, 'natural');
    }
    if (ep.family !== 'chronic_condition' && ep.care_plan && ep.quarters_active >= ep.duration + 8) resolveEpisode(life, D, ep, 'long');
  }
}

export function resolveEpisode(life, D, ep, how, extra = {}) {
  ep.resolved = true; ep.end_idx = life.clock.index; ep.outcome = how;
  const regain = ep.family === 'chronic_condition' ? 0 : 2;
  const d = applyEffects(life, { health: regain, happiness: 1 });
  log(life, {
    type: 'health', icon: '🌿', importance: ep.severity === 'mild' ? 1 : 2,
    text: ep.family === 'chronic_condition' ? '不調と付き合いながらの暮らしが落ち着いてきた。' : '体調が戻り、いつもの暮らしに戻ることができた。',
    brief: '体調が戻った。', tags: ['health'], deltas: d,
  });
}

/** Review of an episode with a care plan. Uses the spec's logistic form S vs difficulty D. */
export function reviewEpisode(life, D, rng, task) {
  const ep = life.protagonist.illnesses[task.illness_id];
  if (!ep || ep.resolved) return null;
  const E = D.tuning.episodes, p = life.protagonist, h = householdOf(life);
  const helpers = Object.values(life.persons).filter((x) => x.alive && life.relationships[x.id].status === 'active' && x.household_id === p.household_id);
  const supportScore = helpers.length ? mean(helpers.map((x) => (life.relationships[x.id].closeness + life.relationships[x.id].trust) / 2)) : 20;
  const planBonus = ep.care_plan?.mode === 'treatment' ? E.review.plan_bonus.treatment : E.review.plan_bonus.daily_support;
  const S = E.review.w_health * p.health + E.review.w_resources * h.resources.display + E.review.w_support * supportScore + planBonus;
  const Dif = E.review.difficulty[ep.family === 'chronic_condition' ? 'chronic' : ep.severity];
  const prob = clamp(expit((S - Dif) / 12), 0.05, 0.95);
  ep.reviews += 1;
  const rqDefault = ep.severity === 'serious' ? E.review_quarters.serious : E.review_quarters.moderate;
  task = { ...task, review_quarters: Number.isFinite(task.review_quarters) ? task.review_quarters : rqDefault };
  const r = rng.next();
  let result;
  if (r < prob) result = 'improved';
  else if (r < prob + (1 - prob) * E.review.continue_share) result = 'continuing';
  else result = 'worsened';
  const out = { episode: ep.id, S: Math.round(S), D: Dif, prob: Math.round(prob * 100) / 100, result };
  if (result === 'improved') {
    if (ep.family === 'chronic_condition') {
      ep.severity = 'moderate'; ep.managed = true;
      log(life, { type: 'health', icon: '🌿', text: '見直しの結果、無理のない付き合い方が見つかり、不調は落ち着いている。', brief: '不調は落ち着いている。', tags: ['health'] });
      scheduleReview(life, ep, task.review_quarters * 2);
    } else {
      resolveEpisode(life, D, ep, 'reviewed_improved');
    }
  } else if (result === 'continuing') {
    log(life, { type: 'health', icon: '⏳', text: '見直しの時期を迎えたが、回復にはもう少し時間がかかりそうだ。', brief: '回復にはもう少しかかりそうだ。', tags: ['health'] });
    scheduleReview(life, ep, task.review_quarters);
  } else {
    const d = applyEffects(life, { health: -E.review.worsen_health });
    if (ep.severity === 'moderate') ep.severity = 'serious';
    log(life, { type: 'health', icon: '⚠', importance: 2, text: '見通しは思わしくなく、状態が重くなってしまった。周囲と相談しながら続けていく。', brief: '状態が重くなった。', tags: ['health'], deltas: d });
    scheduleReview(life, ep, task.review_quarters);
  }
  return out;
}

export function scheduleReview(life, ep, delayQuarters) {
  if (!Number.isFinite(delayQuarters)) delayQuarters = 2;
  life.event_state.world_tasks.push({
    id: `${ep.id}:review:${ep.reviews}`, task: 'illness_review', illness_id: ep.id,
    at: life.clock.index + Math.max(1, delayQuarters), review_quarters: Math.max(1, delayQuarters),
  });
}

/** For infants and young children the caregiver chooses the care plan without asking the player. */
export function caregiverPlanChoice(life) {
  return householdOf(life).resources.display >= 35 ? 'care' : 'support';
}
