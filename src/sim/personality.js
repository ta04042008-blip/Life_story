// Personality is never assigned. It is read back from accumulated choices (spec section 5 / prototype-rules section 6).
// Each axis keeps E (signed evidence) and W (amount of evidence). Display value = 50 + 50*E/(8+W).
import { yearOf } from './calendar.js';
import { pushCapped } from './util.js';

export const AXES = ['judgment', 'approach', 'change', 'time'];
export const AXIS_INFO = {
  judgment: { name: '判断の向き', left: { word: '自律', desc: '自分の考えを優先する' }, right: { word: '協調', desc: '周囲との調和を優先する' } },
  approach: { name: '行動の構え', left: { word: '慎重', desc: '慎重に備える' }, right: { word: '挑戦', desc: 'まず試してみる' } },
  change: { name: '変化への姿勢', left: { word: '継承', desc: '慣れた方法を守る' }, right: { word: '探索', desc: '新しい方法を求める' } },
  time: { name: '時間の使い方', left: { word: '計画', desc: '先を見通して計画する' }, right: { word: '即応', desc: '目の前の流れに応じる' } },
};

export function addEvidence(life, D, tags, weight, meta) {
  const P = life.protagonist.personality, year = yearOf(life.clock);
  const decay = D.tuning.personality.yearly_decay;
  for (const [axis, tag] of Object.entries(tags || {})) {
    const a = P.axes[axis];
    if (!a || !tag) continue;
    const n = year - a.last_year;
    if (n > 0) { a.E *= Math.pow(decay, n); a.W *= Math.pow(decay, n); a.last_year = year; }
    a.E += weight * tag;
    a.W += weight * Math.abs(tag);
    pushCapped(P.evidence, { idx: life.clock.index, event: meta.event, choice: meta.choice, axis, tag, w: weight, auto: !!meta.auto, text: meta.text }, D.tuning.personality.evidence_cap);
  }
}

export function axisState(a, D) {
  const need = D.tuning.personality.settled_evidence;
  const value = 50 + 50 * a.E / (need + a.W);
  const settled = a.W >= need;
  let side = 'undecided';
  if (settled) side = value <= 40 ? 'left' : value >= 60 ? 'right' : 'balanced';
  return { value, settled, side, W: a.W };
}

export function personalityView(life, D) {
  const P = life.protagonist.personality;
  const axes = {};
  for (const ax of AXES) axes[ax] = axisState(P.axes[ax], D);
  const age = Math.floor(life.clock.index / 4);
  const ready = age >= D.tuning.personality.type_min_age && P.valid_count >= D.tuning.personality.type_min_choices;
  const words = AXES.map((ax) => {
    const s = axes[ax];
    if (s.side === 'left') return AXIS_INFO[ax].left.word;
    if (s.side === 'right') return AXIS_INFO[ax].right.word;
    return s.side === 'balanced' ? '均衡' : '未定';
  });
  return { axes, ready, typeName: ready ? words.join('・') : null, words, validCount: P.valid_count };
}

export function snapshot(life, D, reason) {
  const v = personalityView(life, D);
  life.protagonist.personality.snapshots.push({ idx: life.clock.index, age: Math.floor(life.clock.index / 4), reason, typeName: v.typeName, words: v.words, values: Object.fromEntries(AXES.map((a) => [a, Math.round(v.axes[a].value)])) });
}

/** Up to n example choices that support one axis side, newest first. */
export function evidenceFor(life, axis, side, n = 3) {
  const ev = life.protagonist.personality.evidence.filter((e) => e.axis === axis && Math.sign(e.tag) === (side === 'left' ? -1 : 1));
  return ev.slice(-n).reverse();
}
