// "おまかせ": pick the executable option that best fits the annual focus. Ties: lower risk of hard-to-undo loss,
// then the saved RNG. No peeking at hidden outcomes (prototype-rules section 7).
import { FOCUS_LABELS } from './decisions.js';

export function autoChoose(life, D, rng, decision) {
  const focus = decision.actor === 'caregiver' ? 'health' : life.settings.focus;
  const scored = decision.choices.map((c) => ({ c, fit: c.focus_scores?.[focus] ?? 0, risk: c.risk || 0 }));
  const bestFit = Math.max(...scored.map((s) => s.fit));
  let pool = scored.filter((s) => s.fit === bestFit);
  const minRisk = Math.min(...pool.map((s) => s.risk));
  pool = pool.filter((s) => s.risk === minRisk);
  const tie = pool.length > 1;
  const pick = tie ? pool[rng.int(pool.length)] : pool[0];
  const who = decision.actor === 'caregiver' ? '養育者の判断（健康を重視）' : `今年の重点「${FOCUS_LABELS[focus]}」`;
  return { choice: pick.c.id, reason: `${who}に最も合う選択肢として${tie ? '（同点のため保存済みの乱数で）' : ''}選んだ` };
}
