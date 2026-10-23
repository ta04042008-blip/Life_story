// The life review shown after death. Built only from the saved life, so it can be rebuilt any time.
import { personalityView, AXES, AXIS_INFO, evidenceFor } from './personality.js';
import { personSummary } from './persons.js';
import { bandLabel } from './util.js';
import { EVIDENCE_LABELS } from './context.js';
import { SKILL_LABELS } from './opportunities.js';
import { yearOf } from './calendar.js';

export function buildReview(life, D) {
  const o = life.origin, p = life.protagonist, d = life.dead;
  const birthYear = o.birth_year;
  const where = o.place_label || `${o.region_label}（ゲーム用推定の出生舞台）`;
  const track = life.stats_track;
  const peak = (i) => track.reduce((m, r) => (r[i] > m.v ? { v: r[i], age: Math.floor(r[0] / 4) } : m), { v: -1, age: 0 });
  const last = track[track.length - 1] || [0, 0, 0, 0, 0, 0];

  const autoChoices = life.history.filter((h) => h.type === 'choice' && h.refs && h.refs.auto).length;
  const allChoices = life.history.filter((h) => (h.type === 'choice' || h.type === 'major') && h.refs && h.refs.event).length;
  const playerChoices = life.history.filter((h) => (h.type === 'choice' || h.type === 'major') && h.refs && !h.refs.auto && h.refs.reason == null).length;

  const keepTypes = new Set(['major', 'death', 'travel', 'work', 'family', 'learning']);
  let timeline = life.history.filter((h) => h.type !== 'followup' && ((keepTypes.has(h.type) && h.importance >= 2) || (h.type === 'birthday' && h.age % 10 === 0 && h.age > 0) || (h.type === 'health' && h.importance >= 2 && !/戻/.test(h.text))));
  if (timeline.length > 45) { const head = timeline.filter((h) => h.type === 'major' || h.type === 'death'); timeline = head.length > 45 ? head.slice(0, 44).concat(head.slice(-1)) : timeline.filter((h) => head.includes(h) || h.type === 'birthday').slice(0, 45); }
  const people = Object.values(life.persons).map((x) => ({ ...personSummary(life, x, d ? d.idx : life.clock.index), died_idx: x.died_idx })).sort((a, b) => (b.closeness ?? 0) - (a.closeness ?? 0));

  const view = personalityView(life, D);
  const axes = AXES.map((ax) => {
    const s = view.axes[ax];
    return {
      axis: ax, name: AXIS_INFO[ax].name, value: Math.round(s.value), settled: s.settled, side: s.side,
      left: AXIS_INFO[ax].left, right: AXIS_INFO[ax].right,
      examples: s.side === 'left' ? evidenceFor(life, ax, 'left', 3) : s.side === 'right' ? evidenceFor(life, ax, 'right', 3) : [],
    };
  });

  const skills = Object.entries(p.skills).map(([k, v]) => ({ key: k, label: SKILL_LABELS[k] || k, value: Math.round(v) }));

  return {
    title: `${p.name}の一生`,
    name: p.name, birth_year: birthYear, death_year: d ? d.year : yearOf(life.clock), age: d ? d.age : Math.floor(life.clock.index / 4),
    where, cause: d ? d.cause.label : null, mortality_source: d ? d.source : null,
    stats: {
      health: { peak: peak(1), final: last[1], band: bandLabel(last[1]) },
      learning: { peak: peak(2), final: last[2], band: bandLabel(last[2]) },
      charm: { peak: peak(3), final: last[3], band: bandLabel(last[3]) },
      resources: { peak: peak(4), final: last[4], band: bandLabel(last[4]) },
      happiness: { peak: peak(5), final: last[5], band: bandLabel(last[5]) },
    },
    series: track,
    skills, education: p.education, work: p.work, apprenticeship: p.apprenticeship,
    timeline, people, personality: { ready: view.ready, typeName: view.typeName, words: view.words, axes, snapshots: p.personality.snapshots, valid_count: p.personality.valid_count },
    places: life.world.context_log || [],
    choices: { total: allChoices, auto: autoChoices, player: playerChoices },
    origin_note: {
      region_weights: o.sampling.region_weights, p_year: o.sampling.p_year, year_window: o.sampling.year_window,
      note: o.sampling.note, household: o.household_composition_label, resource_band: o.resource_band,
    },
    evidence_labels: [...new Set((life.world.context_log || []).map((c) => EVIDENCE_LABELS[c.tier] || c.tier))],
    footer: 'この一生はゲーム用の推定にもとづく物語で、実在の人物や統計を再現したものではありません。',
  };
}
