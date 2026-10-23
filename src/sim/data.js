// Loads every data file once and builds lookup tables. Simulation code only ever reads from the
// object returned here, so the same code runs in the browser (fetch) and in Node tests (fs).

export const FILES = {
  events: 'spec/data/events-initial.json',
  extraEvents: 'data/impl/events-extra.json',
  outcomes: 'spec/data/event-outcomes.json',
  bindings: 'spec/data/scenario-bindings.json',
  birthSampling: 'spec/data/global-birth-sampling.json',
  birthEstimates: 'spec/data/birth-estimates.json',
  mortalityHist: 'spec/data/mortality-historical-estimates.json',
  mortalityLedger: 'spec/data/mortality-estimates.json',
  oppEstimates: 'spec/data/scenario-opportunity-estimates.json',
  successors: 'spec/data/scenario-successor-estimates.json',
  mortalityModern: 'data/derived/mortality-wpp2024-both.json',
  scenarioMap: 'data/impl/scenario-profile-map.json',
  generic: 'data/impl/generic-contexts.json',
  tuning: 'data/impl/engine-tuning.json',
};

/** @param {(path:string)=>Promise<any>} readJson */
export async function loadData(readJson) {
  const entries = await Promise.all(Object.entries(FILES).map(async ([k, p]) => [k, await readJson(p)]));
  return buildData(Object.fromEntries(entries));
}

export function buildData(raw) {
  const D = { raw };
  D.tuning = raw.tuning;
  D.versions = raw.tuning.versions;
  D.referenceYear = raw.tuning.reference_year;

  // events: spec templates + implementation-authored extras share one shape
  D.events = {};
  for (const e of raw.events.events) D.events[e.id] = { ...e, source: 'spec' };
  for (const e of raw.extraEvents.events) D.events[e.id] = { ...e, source: 'impl' };
  D.eventList = Object.values(D.events);
  D.fallbackPolicy = raw.extraEvents.fallback_policy;
  D.outcomes = {};
  for (const c of raw.outcomes.contracts) D.outcomes[c.event_id] = c;

  D.scenarios = {};
  for (const s of raw.bindings.scenarios) {
    const bindings = {};
    for (const b of s.bindings) bindings[b.event_id] = b;
    D.scenarios[s.id] = { ...s, bindingsById: bindings };
  }
  D.scenarioMap = raw.scenarioMap.scenarios;
  D.scenarioMapMeta = raw.scenarioMap;
  D.generic = raw.generic;
  D.sampling = raw.birthSampling;
  D.birthEstimates = raw.birthEstimates;
  D.successors = raw.successors.scenarios;
  D.opp = raw.oppEstimates;
  D.oppProfiles = { ...raw.oppEstimates.profiles, ...raw.generic.extra_opportunity_profiles };
  D.histBands = raw.mortalityHist.age_bands;
  D.histProfiles = raw.mortalityHist.scenario_profiles;
  D.modernMort = raw.mortalityModern;
  return D;
}

/** Resolve the numeric value of '$reference_year' style tokens in the successor table. */
export function successorYear(v, referenceYear) {
  if (typeof v === 'number') return v;
  const m = /^reference_year\+(\d+)$/.exec(v);
  if (m) return referenceYear + Number(m[1]);
  throw new Error('unknown year token ' + v);
}

export const range = (r) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : r);
