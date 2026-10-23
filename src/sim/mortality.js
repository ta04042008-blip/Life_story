// Age-specific mortality. Sources, in the order the spec asks for:
//  - from 1950: WPP 2024 country series (both sexes), estimate through 2023 and Medium projection to 2100;
//    places with no country series use a labelled blend (GAME ESTIMATE). After 2100 the 2100 table is held (game hypothesis).
//  - before 1950: the spec's low/central/high game-estimate age bands (rural_agrarian / urban_trade).
// Annual q_x -> quarter: q_Q = 1 - (1 - q_x)^(1/4). Individual risk: q' = 1 - (1 - q_x)^HR.
import { clamp, expit, logit } from './util.js';

function bandQ(D, profile, mode, age) {
  for (const b of D.histBands) {
    const end = b.age_end_exclusive == null ? Infinity : b.age_end_exclusive;
    if (age >= b.age_start && age < end) return b[profile][mode];
  }
  return D.histBands[D.histBands.length - 1][profile][mode];
}

function modernQ(D, seriesId, year, age) {
  const m = D.modernMort.meta;
  const y = clamp(year, m.first_year, m.last_year);
  const a = Math.min(age, m.ages - 1);
  return D.modernMort.series[seriesId][(y - m.first_year) * m.ages + a] / 1e6;
}

/** Which table applies to this life/context? Returned for both calculation and the data screen. */
export function mortalitySource(life, D, ctx) {
  const o = life.origin;
  if (ctx.mortality_kind === 'historical') {
    const sm = o.scenario_id ? D.scenarioMap[o.scenario_id] : null;
    const profile = sm?.mortality_profile || D.scenarioMapMeta.mortality_profile_for_settlement[o.settlement_profile_birth || ctx.settlement_profile];
    return { kind: 'hist_game_estimate', profile, mode: o.mortality_mode, label: 'ゲーム用推定の年齢別死亡（史実の死亡率ではありません）', tier: 'game_estimate' };
  }
  const anchors = ctx.country_series ? [ctx.country_series] : D.scenarioMapMeta.generic_modern_mortality_anchor[o.macro_region];
  const held = ctx.year > D.modernMort.meta.last_year;
  let label, tier;
  if (ctx.country_series) {
    label = held ? '国連WPP 2024の2100年の表を据え置き（ゲーム用仮説）'
      : ctx.year <= D.modernMort.meta.estimate_through_year ? '国連WPP 2024 国別推計（市域の実測ではありません）'
      : '国連WPP 2024 国別予測・中位（市域の実測ではありません）';
    tier = held ? 'game_hypothesis' : ctx.year <= D.modernMort.meta.estimate_through_year ? 'published_estimate' : 'published_projection';
  } else {
    label = '国別系列のない場所：既存の国別系列を使うゲーム用推定';
    tier = 'game_estimate';
  }
  return { kind: 'wpp', anchors, held, label, tier };
}

/** Annual probability of death between exact ages age and age+1 for this calendar year. */
export function annualQ(life, D, ctx, age, src = mortalitySource(life, D, ctx)) {
  if (src.kind === 'hist_game_estimate') return bandQ(D, src.profile, src.mode, age);
  if (src.anchors.length === 1) return modernQ(D, src.anchors[0], ctx.year, age);
  let s = 0;
  for (const id of src.anchors) s += logit(clamp(modernQ(D, id, ctx.year, age), 1e-6, 0.999));
  return expit(s / src.anchors.length);
}

/** Relative hazard from the protagonist's current state. Bounded, and a documented game tuning (not a measured effect). */
export function relativeHazard(D, health, resources) {
  const t = D.tuning.mortality;
  const hr = Math.exp(-t.health_slope * (health - 65)) * Math.exp(-t.resource_slope * (resources - 50));
  return clamp(hr, t.hr_min, t.hr_max);
}

export function quarterlyQ(qAnnual, hr = 1) {
  const q = 1 - Math.pow(1 - clamp(qAnnual, 0, 0.999999), hr);
  return 1 - Math.pow(1 - clamp(q, 0, 0.999999), 0.25);
}

/** Cause label for the life review. A narrative category only (gentle, no method), chosen after death is decided. */
export function causeLabel(rng, age, activeKinds) {
  if (activeKinds.includes('injury')) return { key: 'injury', label: 'けがが重なった' };
  if (activeKinds.includes('chronic_condition')) return { key: 'chronic', label: '長く続いた体調の不調' };
  if (activeKinds.includes('short_illness')) return { key: 'illness', label: '病気' };
  if (age < 5) return { key: 'early_illness', label: '幼い頃の病気や体の弱さ' };
  if (age < 60) {
    const pool = [{ key: 'illness', label: '病気', w: 6 }, { key: 'accident', label: '事故や思いがけない出来事', w: 3 }, { key: 'other', label: '突然の不調', w: 2 }];
    return rng.weighted(pool);
  }
  if (age < 80) return rng.weighted([{ key: 'illness', label: '病気', w: 6 }, { key: 'aging', label: '老いによる衰え', w: 4 }]);
  return rng.weighted([{ key: 'aging', label: '老いによる衰え', w: 8 }, { key: 'illness', label: '病気', w: 3 }]);
}
