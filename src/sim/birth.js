// Birth lottery and household generation. Everything is drawn from the life's own seeded RNG in a fixed order.
// Order (spec: birth-sampling.md): year -> broad region -> place/community -> settlement profile -> household
// -> resource band -> people -> starting state. Region weights and the year weight are GAME-BALANCE weights, not population shares.
import { Rng } from './rng.js';
import { clamp100 } from './util.js';
import { addPerson, makeName, nextId } from './persons.js';
import { REGION_LABELS } from './context.js';

export function birthYearWindow(D) {
  const to = D.referenceYear;
  const count = D.sampling.birth_year_window.count;
  return { from: to - count + 1, to, count };
}

/** Deep-dive scenarios that can host a birth in this region and year. */
export function deepDiveCandidates(D, region, year) {
  return Object.values(D.scenarios).filter((sc) => {
    const sm = D.scenarioMap[sc.id];
    if (sm.macro_region !== region) return false;
    const to = sc.period.to === 'release_reference_year' ? D.referenceYear : sc.period.to;
    return year >= sc.period.from && year <= to;
  }).map((s) => s.id);
}

function weightedFromMap(rng, map) {
  const items = Object.entries(map).map(([k, w]) => ({ k, w }));
  return rng.weighted(items).k;
}

export function newLifeId(rng) {
  const a = rng.u32().toString(36), b = rng.u32().toString(36);
  return `life-${a}${b}`;
}

/**
 * Create a brand-new life at birth.
 * opts.override = { birthYear, region, scenarioId } is for QA only; the draws still happen so the RNG stream stays aligned.
 */
export function createLife(D, seed, opts = {}) {
  const rng = Rng.fromSeed(seed);
  const T = D.tuning;
  const win = birthYearWindow(D);
  const ov = opts.override || {};

  const drawnYear = win.from + rng.int(win.count);
  const year = ov.birthYear ?? drawnYear;
  const regionKey = weightedFromMap(rng, D.sampling.macro_region_weights);
  const region = ov.region ?? regionKey;

  const cands = deepDiveCandidates(D, region, year);
  const uPlace = rng.next();
  const uPick = rng.next();
  let scenarioId = null;
  if (ov.scenarioId) scenarioId = ov.scenarioId;
  else if (cands.length && uPlace < T.birth.deep_dive_place_share) scenarioId = cands[Math.floor(uPick * cands.length)];

  const sm = scenarioId ? D.scenarioMap[scenarioId] : null;
  const macro = sm ? sm.macro_region : region;
  const settlementDraw = weightedFromMap(rng, D.sampling.settlement_profile_weights);
  const settlement = sm ? sm.settlement_profile : settlementDraw;

  // household archetype (story category, NOT a historical class share)
  const archMap = scenarioId
    ? D.birthEstimates.household_archetype_priors[scenarioId].weights
    : D.sampling.household_archetype_weights_by_settlement[settlement];
  const archetype = weightedFromMap(rng, archMap);
  const band = weightedFromMap(rng, D.birthEstimates.resource_band_weights);
  const bandValue = D.birthEstimates.resource_band_display_values[band];
  const resourceDisplay = clamp100(bandValue + rng.range(-T.birth.resource_individual_noise, T.birth.resource_individual_noise));

  const clock = { index: 0, birth_year: year, birth_quarter: rng.int(4), phase: 'idle', quarter_started: false };
  const life = {
    schema_version: D.versions.schema_version, rules_version: D.versions.rules_version, data_version: D.versions.data_version,
    life_id: newLifeId(rng), saved_at: null,
    rng: null,
    origin: null,
    clock,
    protagonist: null,
    households: {},
    persons: {},
    relationships: {},
    world: { context_id: null, last_decade_snapshot: -1 },
    event_state: {
      cooldowns: {}, counts: {}, seq: {}, consumed_offers: [], presented_offers: [],
      followups: [], followups_done: [], world_tasks: [], recent_small: [], offers: {}, quarter: null,
    },
    pending_decision: null,
    history: [], resolutions: [],
    settings: { focus: 'livelihood', auto_small: true, auto_major: false, speed: 1, expression: 'standard' },
    dead: null,
    stats_track: [],
  };

  const poolId = sm ? sm.name_pool : 'generic';
  life.origin = {
    birth_year: year, birth_quarter_note: '誕生した四半期は仮の抽選です',
    macro_region: macro, region_label: REGION_LABELS[macro],
    scenario_id: scenarioId, kind: scenarioId ? 'deep_dive' : 'generic',
    place_label: sm ? sm.location_label : null,
    settlement_profile_birth: settlement, household_archetype: archetype, resource_band: band,
    name_pool: poolId, mortality_mode: 'central', rng_seed: seed >>> 0,
    sampling: {
      year_window: win, p_year: 1 / win.count,
      region_weights: D.sampling.macro_region_weights,
      deep_dive_candidates: cands, deep_dive_place_share: T.birth.deep_dive_place_share,
      settlement_weights: D.sampling.settlement_profile_weights,
      archetype_weights: archMap, resource_band_weights: D.birthEstimates.resource_band_weights,
      note: D.birthEstimates.display_label || '仮の境遇抽選（史実の人口比ではありません）',
    },
  };

  const loc = sm
    ? { id: sm.location_id, label: sm.location_label, settlement_profile: settlement }
    : { id: `generic:${macro}:${settlement}`, label: `${REGION_LABELS[macro]}の${D.scenarioMapMeta.settlement_profile_for_generic_labels[settlement]}（ゲーム用推定）`, settlement_profile: settlement };

  life.households.h1 = { id: 'h1', members: ['me'], resources: { display: resourceDisplay, band, band_at_birth: band }, location: loc, origin_note: '出生時の世帯' };

  const sexMe = rng.chance(0.5) ? 'f' : 'm'; // only used to draw a name
  life.protagonist = {
    id: 'me', name: makeName(life, D, rng, sexMe),
    health: clamp100(65 + rng.range(-T.birth.health_noise, T.birth.health_noise)),
    learning: 0,
    charm: clamp100(50 + rng.range(-T.birth.charm_noise, T.birth.charm_noise)),
    happiness: 50,
    skills: { literacy: 0, craft: 0, livelihood: 0, care: 0 },
    household_id: 'h1', location: { ...loc },
    education: { status: 'none' }, apprenticeship: null, work: null, travel: null,
    illnesses: {}, learning_access: null,
    personality: { axes: { judgment: { E: 0, W: 0, last_year: year }, approach: { E: 0, W: 0, last_year: year }, change: { E: 0, W: 0, last_year: year }, time: { E: 0, W: 0, last_year: year } }, evidence: [], valid_count: 0, snapshots: [] },
    born_resources: resourceDisplay,
  };

  buildHousehold(life, D, rng);

  life.rng = rng; // keep the live Rng; serialisation calls toJSON()
  return life;
}

function buildHousehold(life, D, rng) {
  const T = D.tuning.birth;
  const comp = rng.weighted(T.household_composition);
  life.origin.household_composition = comp.id;
  life.origin.household_composition_label = comp.label;
  const guardianTag = ['guardian'];
  const ageAt = (lo, hi) => Math.round(rng.range(lo, hi));
  const h = 'h1';
  const add = (kin, age, tags = [], sex = null) => addPerson(life, D, rng, { kin, ageYears: age, tags, household: h, sex });

  if (comp.parents >= 1) { const a = ageAt(20, 38); add('parent', a, guardianTag); if (comp.parents >= 2) add('parent', clampAge(a + ageAt(-6, 6)), guardianTag); }
  if (comp.elder) add('grandparent', ageAt(48, 68), []);
  if (comp.kin_adult) add('aunt_uncle', ageAt(24, 50), ['guardian']);
  if (comp.guardian_kind === 'elder_guardian') {
    const kind = rng.weighted([{ k: 'grandparent', w: 6 }, { k: 'aunt_uncle', w: 3 }, { k: 'other_kin', w: 1 }]).k;
    add(kind, kind === 'grandparent' ? ageAt(50, 66) : ageAt(26, 48), guardianTag);
  }
  const sibCount = weightedIndex(rng, T.older_siblings_weights);
  for (let i = 0; i < sibCount; i++) add('sibling', ageAt(1, 12), []);
}

const clampAge = (a) => Math.max(18, a);
function weightedIndex(rng, weights) { return rng.weighted(weights.map((w, i) => ({ i, w }))).i; }
