// Resolves "what social conditions apply right now" for a life: place, year, terms, flags, evidence labels.
// Resolution order follows data/spec: deep-dive record in its validity window -> authored successor
// -> generic regional/era estimate. A window edge only swaps which record is read; nothing is triggered.
import { yearOf, quarterOf } from './calendar.js';
import { successorYear } from './data.js';

export const REGION_LABELS = {
  east_asia: '東アジア', south_asia: '南アジア', southeast_asia: '東南アジア',
  west_and_central_asia_north_africa: '西・中央アジア／北アフリカ', sub_saharan_africa: 'サハラ以南アフリカ',
  europe: 'ヨーロッパ', americas: '南北アメリカ', oceania: 'オセアニア',
};
export const EVIDENCE_LABELS = {
  game_estimate: 'ゲーム用推定', game_hypothesis: 'ゲーム用仮説',
  mixed_national_series_and_game_estimate: '国別の公表推計・予測＋ゲーム用推定',
  published_estimate: '公表推計', published_projection: '公表予測（中位）',
};

export function eraFor(D, year) {
  return D.generic.eras.find((e) => year >= e.from && year <= e.to) || D.generic.eras[D.generic.eras.length - 1];
}

function scenarioWindow(D, sc) {
  const to = sc.period.to === 'release_reference_year' ? D.referenceYear : sc.period.to;
  return { from: sc.period.from, to };
}

export function findSuccessor(D, scenarioId, year) {
  const list = D.successors[scenarioId]?.successors || [];
  for (const s of list) {
    const from = successorYear(s.from_year, D.referenceYear), to = successorYear(s.to_year, D.referenceYear);
    if (year >= from && year <= to) return { ...s, from, to };
  }
  return null;
}

export function resolveContext(life, D, idx = life.clock.index) {
  const clock = life.clock;
  const year = yearOf(clock, idx), quarter = quarterOf(clock, idx);
  const o = life.origin;
  const loc = life.protagonist.location;
  const settlement = loc.settlement_profile;
  const era = eraFor(D, year);
  const termEra = D.generic.term_era_for_era[era.id];
  const sc = o.scenario_id ? D.scenarios[o.scenario_id] : null;
  const sm = o.scenario_id ? D.scenarioMap[o.scenario_id] : null;

  let kind = 'generic', binding = null, successor = null, terms, evidence = 'game_estimate', countrySeries = sm?.country_series || null;
  let id;
  if (sc) {
    const w = scenarioWindow(D, sc);
    if (year >= w.from && year <= w.to) {
      kind = 'deep_dive'; binding = sc; terms = sc.terms; id = `${sc.id}:${year}`;
      evidence = 'game_estimate';
    } else {
      kind = 'successor';
      successor = findSuccessor(D, o.scenario_id, year);
      id = successor ? `${o.scenario_id}:successor:${successor.from}-${successor.to}` : `${o.scenario_id}:successor:open`;
      evidence = successor?.evidence_tier || 'game_estimate';
      // From 2000 on, the same country's modern scene wording applies (no scripted switch, just which record is read).
      const pair = sm.modern_pair ? D.scenarios[sm.modern_pair] : null;
      if (pair && year >= 2000) { terms = pair.terms; binding = pair; }
      else terms = D.generic.terms[settlement][termEra];
    }
  } else {
    terms = D.generic.terms[settlement][termEra];
    id = `global:${o.macro_region}:${settlement}:${year}`;
    evidence = 'game_estimate';
  }

  const learningKinds = (sm && kind === 'deep_dive' ? sm.learning_kinds : era.learning_kinds[settlement]) || ['household'];
  const schoolLike = sm && kind === 'deep_dive' ? sm.school_like_institutions : learningKinds.includes('school') || learningKinds.includes('master');
  const oppProfile = kind === 'deep_dive' ? D.opp.scenarios[o.scenario_id].profile_id
    : (kind === 'successor' && year >= 2000 && sm?.modern_pair) ? D.opp.scenarios[sm.modern_pair].profile_id
    : era.opportunity_profile[settlement];

  const future = year > D.referenceYear;
  let seriesState = 'none';
  if (era.mortality !== 'historical') seriesState = year <= D.modernMort.meta.estimate_through_year ? 'published_estimate' : year <= D.modernMort.meta.last_year ? 'published_projection' : 'game_hypothesis';

  return {
    id, year, quarter, era_id: era.id, era_label: era.label, scene_style: era.scene_style,
    kind, scenario_id: o.scenario_id, binding, successor,
    terms, place_label: loc.label, region: o.macro_region, region_label: REGION_LABELS[o.macro_region],
    settlement_profile: settlement, evidence, evidence_label: EVIDENCE_LABELS[evidence] || evidence,
    generic_badge: o.scenario_id ? null : D.generic.label_generic,
    flags: {
      learning_kinds: learningKinds, school_like: schoolLike,
      self_study: era.self_study_materials || (life.protagonist.skills.literacy ?? 0) >= 15,
      writing_common: era.writing_common,
    },
    opp_profile: oppProfile, country_series: countrySeries, mortality_kind: era.mortality,
    future, series_state: seriesState,
  };
}
