// Converts the spec's WPP 2024 q_x CSV (both-sexes series) into one compact JSON file the game can load.
// Run:  node tools/build-mortality.mjs
// Input : spec/data/mortality-wpp2024-qx-both.csv.gz   (verbatim from the spec package)
// Output: data/derived/mortality-wpp2024-both.json
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const SRC = 'spec/data/mortality-wpp2024-qx-both.csv.gz';
const OUT = 'data/derived/mortality-wpp2024-both.json';
const FIRST_YEAR = 1950, LAST_YEAR = 2100, AGES = 101; // ages 0..99 from WPP, index 100 = "100+" game-estimated tail

const gz = readFileSync(SRC);
const lines = gunzipSync(gz).toString('utf8').trim().split('\n');
const header = lines[0].split(',');
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const series = {};
const countries = {};
const typeByYear = {};
for (const line of lines.slice(1)) {
  const f = line.split(',');
  const id = f[col.scenario_id];
  const year = Number(f[col.calendar_year]);
  const age = Number(f[col.age_start_years]);
  const q = Number(f[col.q_x]);
  if (!series[id]) { series[id] = new Array((LAST_YEAR - FIRST_YEAR + 1) * AGES).fill(null); countries[id] = f[col.country_name_wpp]; }
  series[id][(year - FIRST_YEAR) * AGES + age] = Math.round(q * 1e6); // micro-probability, integer
  typeByYear[year] = f[col.series_type];
}
for (const [id, arr] of Object.entries(series)) {
  if (arr.some((v) => v === null)) throw new Error(`gap in series ${id}`);
}
const estimateThrough = Math.max(...Object.entries(typeByYear).filter(([, t]) => t === 'estimate').map(([y]) => Number(y)));
const out = {
  meta: {
    id: 'mortality-wpp2024-both',
    description: 'Annual probability of death q_x by country, calendar year and exact age, both sexes combined. Values are integers in millionths (q = value / 1e6). Index = (year - first_year) * ages + age.',
    first_year: FIRST_YEAR, last_year: LAST_YEAR, ages: AGES,
    age_100_note: 'Index 100 is the open 100+ interval: a low-confidence GAME ESTIMATE extrapolated from the q98-q99 logit trend, not a WPP value.',
    estimate_through_year: estimateThrough,
    projection_from_year: estimateThrough + 1,
    projection_variant: 'WPP 2024 Medium variant',
    source: 'United Nations, DESA, Population Division. World Population Prospects 2024 (MORT/F04 life-table survivors at exact age), both sexes.',
    license: 'CC BY 3.0 IGO. Modified: q_x = 1 - l(x+1)/l(x) derived by the spec package; compacted here.',
    derived_from: SRC,
    derived_from_sha256: createHash('sha256').update(gz).digest('hex'),
    scope_note: 'National period life tables. NOT measured rates for the named city.',
  },
  countries,
  series,
};
writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, Object.keys(series).join(','), 'estimate through', estimateThrough);
