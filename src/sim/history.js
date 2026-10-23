// The life journal. Entries are compact, ordered and never rewritten.
import { yearOf, quarterOf, ageOf } from './calendar.js';

export function log(life, { type, icon = '・', text, brief = null, tags = [], deltas = null, refs = null, importance = 1 }) {
  const c = life.clock;
  const entry = {
    n: life.history.length + 1, idx: c.index, year: yearOf(c), q: quarterOf(c), age: ageOf(c.index),
    type, icon, text, brief: brief || text, tags, importance,
  };
  if (deltas && Object.keys(deltas).length) entry.deltas = deltas;
  if (refs) entry.refs = refs;
  life.history.push(entry);
  return entry;
}

/** "表示設定" - standard or brief wording for heavy topics. */
export const entryText = (e, expression) => (expression === 'brief' ? e.brief : e.text);

export const DELTA_LABELS = {
  health: '健康', learning: '学び', charm: '魅力', happiness: '幸福感', resources: '暮らし向き',
  'relationship.closeness': '親密さ', 'relationship.trust': '信頼', 'relationship.tension': '緊張',
  literacy: '読み書き', craft: '手仕事', livelihood: '生業', care: 'ケア',
};
export function deltaText(deltas) {
  return Object.entries(deltas).map(([k, v]) => `${DELTA_LABELS[k] || k}${v > 0 ? '+' : ''}${v}`).join(' ');
}
