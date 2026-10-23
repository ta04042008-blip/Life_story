// The quarter loop. A quarter is a small state machine so it can stop at any decision and resume without repeating anything:
//   idle -> (begin: context, tasks, follow-ups, episodes, people, offers) -> small -> majors -> finish -> idle
// Everything random is drawn from life.rng, which is part of the saved life.
import { createLife } from './birth.js';
import { resolveContext } from './context.js';
import { yearOf, quarterOf, ageOf } from './calendar.js';
import { log } from './history.js';
import { computeCapabilities, generateOffers, expireOffers, updateAccess } from './opportunities.js';
import { buildFallbackDecision, buildSmallDecision, eligibleSmallEvents, nextMajorDecision, scoreEvent } from './decisions.js';
import { resolveDecision } from './outcomes.js';
import { autoChoose } from './auto.js';
import { spawnEpisodes, episodeQuarterEffects, caregiverPlanChoice, activeEpisodes } from './episodes.js';
import { processWorldTasks, processFollowups, environmentStep, updateHappiness } from './progress.js';
import { meetPeople, driftRelationships, householdGrowth, personDeaths, ensureGuardian } from './social.js';
import { annualQ, causeLabel, mortalitySource, quarterlyQ, relativeHazard } from './mortality.js';
import { snapshot as personalitySnapshot, personalityView } from './personality.js';
import { applyEffects, householdOf } from './effects.js';
import { bandLabel } from './util.js';

export function newLife(D, seed, opts) { return createLife(D, seed, opts); }

export const currentContext = (life, D) => resolveContext(life, D);

/** Run the life until it needs the player, finishes a quarter, or ends. */
export function advance(life, D) {
  const rng = life.rng;
  let guard = 0;
  while (guard++ < 50) {
    if (life.dead) return { status: 'dead' };
    if (life.pending_decision) return { status: 'awaiting' };
    const c = life.clock;
    if (c.phase === 'idle') { beginQuarter(life, D, rng); c.phase = 'small'; continue; }
    const ctx = resolveContext(life, D);
    // capabilities follow the live state (an offer consumed by an earlier decision this quarter must not still be available)
    if (c.phase !== 'finish') life.event_state.quarter.caps = [...computeCapabilities(life, D, ctx)];
    const caps = new Set(life.event_state.quarter.caps);
    if (c.phase === 'small') {
      c.phase = 'majors';
      const d = pickSmall(life, D, rng, ctx, caps);
      if (d) { const r = present(life, D, rng, d, life.settings.auto_small); if (r) return r; }
      continue;
    }
    if (c.phase === 'majors') {
      const d = nextMajorDecision(life, D, ctx, caps);
      if (!d) { c.phase = 'finish'; continue; }
      const r = present(life, D, rng, d, life.settings.auto_major);
      if (r) return r;
      continue;
    }
    if (c.phase === 'finish') {
      finishQuarter(life, D, rng, ctx);
      return { status: life.dead ? 'dead' : 'quarter_done' };
    }
    throw new Error('bad phase ' + c.phase);
  }
  throw new Error('advance loop guard');
}

/** Show a decision to the player, or answer it automatically. Returns {status:'awaiting'} when the player must answer. */
function present(life, D, rng, d, autoFlag) {
  if (d.actor === 'caregiver') { autoAnswer(life, D, rng, d, 'caregiver'); return null; }
  if (autoFlag) { autoAnswer(life, D, rng, d, 'auto'); return null; }
  life.pending_decision = d;
  return { status: 'awaiting' };
}

function autoAnswer(life, D, rng, d, by) {
  let choiceId, reason;
  if (d.major_type === 'treatment' && by === 'caregiver') { choiceId = caregiverPlanChoice(life); if (!d.choices.some((c) => c.id === choiceId)) choiceId = d.choices[0].id; reason = '養育者が暮らしの状況から判断した'; }
  else ({ choice: choiceId, reason } = autoChoose(life, D, rng, d));
  resolveDecision(life, D, rng, d, choiceId, { by, reason });
}

/** The player answers the pending decision. Duplicate calls for the same decision do nothing. */
export function answer(life, D, decisionId, choiceId) {
  const d = life.pending_decision;
  if (!d || d.id !== decisionId) return { ok: false, duplicate: true };
  const res = resolveDecision(life, D, life.rng, d, choiceId, { by: 'player' });
  life.pending_decision = null;
  return res;
}

/** Let the おまかせ logic answer the pending decision (used when the player flips the switch mid-prompt). */
export function answerAuto(life, D) {
  const d = life.pending_decision;
  if (!d) return { ok: false };
  const { choice, reason } = autoChoose(life, D, life.rng, d);
  const res = resolveDecision(life, D, life.rng, d, choice, { by: 'auto', reason });
  life.pending_decision = null;
  return res;
}

// ---------------------------------------------------------------------------------------------------------

function pickSmall(life, D, rng, ctx, caps) {
  const cands = eligibleSmallEvents(life, D, ctx, caps);
  if (!cands.length) return buildFallbackDecision(life, D, ctx, caps);
  const focus = life.settings.focus;
  const cand = rng.weighted(cands, (c) => scoreEvent(c, focus, D, life));
  return buildSmallDecision(life, D, ctx, caps, cand);
}

function beginQuarter(life, D, rng) {
  const c = life.clock, idx = c.index;
  const ctx = resolveContext(life, D);
  if (life.world.context_id !== ctx.id) {
    life.world.context_log = life.world.context_log || [];
    const label = ctx.successor?.label || ctx.era_label, last = life.world.context_log[life.world.context_log.length - 1];
    // only a change of the record actually read is worth a note (a new year alone is not)
    if (!last || last.label !== label || last.kind !== ctx.kind || last.tier !== ctx.evidence) {
      life.world.context_log.push({ idx, year: ctx.year, id: ctx.id, label, kind: ctx.kind, tier: ctx.evidence });
      if (life.world.context_log.length > 80) life.world.context_log.shift();
    }
    life.world.context_id = ctx.id; life.world.context_kind = ctx.kind;
  }
  life.event_state.quarter = { idx, offers_new: [], majors: [], flags: {}, caps: [], ctx_id: ctx.id };

  // birthday record (a short yearly summary)
  if (idx > 0 && idx % 4 === 0) {
    const age = ageOf(idx), p = life.protagonist;
    log(life, { type: 'birthday', icon: '🎂', text: `${age}歳になった。（健康：${bandLabel(p.health)} ／ 学び：${bandLabel(p.learning)}）`, brief: `${age}歳になった。`, tags: ['age'], importance: age % 10 === 0 ? 2 : 0 });
    if (age % 10 === 0) personalitySnapshot(life, D, `${age}歳の節目`);
  }

  processWorldTasks(life, D, rng, ctx);
  processFollowups(life, D);
  spawnEpisodes(life, D, rng);
  updateAccess(life, D);
  meetPeople(life, D, rng, ctx);
  ensureGuardian(life, D, rng);
  generateOffers(life, D, rng, ctx);
  life.event_state.quarter.caps = [...computeCapabilities(life, D, ctx)];
}

function finishQuarter(life, D, rng, ctx) {
  const c = life.clock, p = life.protagonist, age = ageOf(c.index);
  episodeQuarterEffects(life, D, rng);
  environmentStep(life, D, rng, ctx);
  driftRelationships(life, D, rng);
  householdGrowth(life, D, rng);
  personDeaths(life, D, rng, ctx);
  ensureGuardian(life, D, rng);
  updateHappiness(life, D);

  // protagonist mortality last (prototype-rules section 8). Baseline table x state-based relative hazard; no separate instant-death rolls.
  const src = mortalitySource(life, D, ctx);
  const qa = annualQ(life, D, ctx, age, src);
  const hr = relativeHazard(D, p.health, householdOf(life).resources.display);
  const qq = quarterlyQ(qa, hr);
  life.mortality_last = { age, year: ctx.year, q_annual: qa, hr, q_quarter: qq, source: src.label, tier: src.tier };
  const dies = rng.next() < qq || age >= D.tuning.mortality.max_age;
  const causeDraw = causeLabel(rng, age, activeEpisodes(life).map((e) => e.family));

  life.stats_track.push([c.index, Math.round(p.health), Math.round(p.learning), Math.round(p.charm), Math.round(householdOf(life).resources.display), Math.round(p.happiness)]);

  expireOffers(life);
  if (dies) {
    life.dead = { idx: c.index, age, year: yearOf(c), quarter: quarterOf(c), cause: causeDraw, source: src.label };
    personalitySnapshot(life, D, '人生の終わり');
    log(life, {
      type: 'death', icon: '🕯', importance: 3,
      text: `${age}歳でその生涯を閉じた。（ゲーム内の表現：${causeDraw.label}）`,
      brief: `${age}歳でその生涯を閉じた。`, tags: ['death'],
    });
    life.pending_decision = null;
    c.phase = 'dead';
    return;
  }
  c.index += 1;
  c.phase = 'idle';
}

// ---------------------------------------------------------------------------------------------------------
// settings that can change mid-life

export function setFocus(life, focus) { life.settings.focus = focus; }
export function setAuto(life, { small, major }) {
  if (small != null) life.settings.auto_small = !!small;
  if (major != null) life.settings.auto_major = !!major;
}
