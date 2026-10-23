// Save / load. A save is the whole life object as JSON (the RNG state, quarter phase and the unanswered decision are inside it),
// plus a small envelope. Loading never re-runs anything, so nothing is rerolled or applied twice.
import { Rng } from './rng.js';

export const SAVE_FORMAT = 'life-story-save';
export const SLOT_IDS = ['auto', 'auto_prev', 'manual1', 'manual2', 'manual3', 'restore'];

export function serialize(life, D) {
  return JSON.stringify({
    format: SAVE_FORMAT, schema_version: D.versions.schema_version, rules_version: D.versions.rules_version,
    data_version: D.versions.data_version, saved_at: new Date().toISOString(), life: JSON.parse(JSON.stringify(life)),
  });
}

export function summaryOf(life) {
  const age = Math.floor(life.clock.index / 4);
  return {
    id: life.id, name: life.protagonist.name, birth_year: life.origin.birth_year, year: life.origin.birth_year + age,
    age, dead: !!life.dead, label: life.origin.place_label || `${life.origin.region_label}（ゲーム用推定）`,
  };
}

/** @returns {{ok:true, life:object, warnings:string[]} | {ok:false, error:string}} */
export function hydrate(text, D) {
  let o;
  try { o = typeof text === 'string' ? JSON.parse(text) : text; } catch { return { ok: false, error: 'ファイルを読み取れませんでした（JSONではありません）。' }; }
  if (!o || o.format !== SAVE_FORMAT || !o.life) return { ok: false, error: 'このゲームのセーブデータではありません。' };
  if (o.schema_version !== D.versions.schema_version) return { ok: false, error: `セーブデータの形式（${o.schema_version}）に対応していません。` };
  const life = o.life;
  for (const k of ['rng', 'clock', 'protagonist', 'persons', 'relationships', 'households', 'event_state', 'settings']) {
    if (life[k] == null) return { ok: false, error: `セーブデータが壊れています（${k} がありません）。` };
  }
  const bad = checkLife(life, D);
  if (bad) return { ok: false, error: 'セーブデータの内容に不整合があります：' + bad };
  life.rng = new Rng(life.rng);
  const warnings = [];
  if (o.rules_version !== D.versions.rules_version) warnings.push(`ルール版が異なります（保存時 ${o.rules_version}／現在 ${D.versions.rules_version}）。続きは動作しますが、保存時と同じ結果になるとは限りません。`);
  if (o.data_version !== D.versions.data_version) warnings.push(`データ版が異なります（保存時 ${o.data_version}／現在 ${D.versions.data_version}）。`);
  return { ok: true, life, warnings };
}

/** Slot storage over any {getItem,setItem,removeItem} (localStorage in the browser, a Map-like in tests). */
export class SaveStore {
  constructor(storage, D, prefix = 'life-story:') { this.s = storage; this.D = D; this.p = prefix; }
  key(slot) { return this.p + slot; }
  read(slot) { try { return this.s.getItem(this.key(slot)); } catch { return null; } }
  info(slot) {
    const t = this.read(slot); if (!t) return null;
    const r = hydrate(t, this.D); if (!r.ok) return { slot, broken: true, error: r.error };
    return { slot, ...summaryOf(r.life), warnings: r.warnings };
  }
  write(slot, life) {
    if (slot === 'auto') { const prev = this.read('auto'); if (prev) this.s.setItem(this.key('auto_prev'), prev); }
    this.s.setItem(this.key(slot), serialize(life, this.D));
  }
  /** Before a manual load, keep what was being played so it can be restored. */
  stashRestore(life) { this.s.setItem(this.key('restore'), serialize(life, this.D)); }
  load(slot) { const t = this.read(slot); return t ? hydrate(t, this.D) : { ok: false, error: '空の保存枠です。' }; }
  remove(slot) { try { this.s.removeItem(this.key(slot)); } catch { /* ignore */ } }
}

/** Structural checks before a life is accepted (import, load). Returns an error string or null. */
export function checkLife(life, D) {
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const r = life.rng;
  if (!r || !Array.isArray(r.state) || r.state.length !== 4 || !r.state.every(num)) return '乱数の状態が不正です';
  const c = life.clock;
  if (!c || !Number.isInteger(c.index) || c.index < 0 || !Number.isInteger(c.birth_year)) return '時刻の情報が不正です';
  if (!['idle', 'small', 'majors', 'finish', 'dead'].includes(c.phase)) return '四半期の進行状態が不正です';
  const p = life.protagonist;
  for (const k of ['health', 'learning', 'charm', 'happiness']) if (!num(p[k]) || p[k] < 0 || p[k] > 100) return `${k} の値が範囲外です`;
  if (!life.households[p.household_id]) return '世帯の参照が不正です';
  for (const id of Object.keys(life.relationships)) if (!life.persons[id]) return '関係が存在しない人物を指しています';
  for (const hh of Object.values(life.households)) for (const m of hh.members) if (m !== 'me' && !life.persons[m]) return '世帯が存在しない人物を指しています';
  const d = life.pending_decision;
  if (d) {
    if (!D.events[d.event_id] && d.event_id !== D.fallbackPolicy.id) return '未回答の決断が未知のイベントを指しています';
    if (!Array.isArray(d.choices) || d.choices.length < 1) return '未回答の決断に選択肢がありません';
    if (d.target && !life.persons[d.target.person_id]) return '未回答の決断が存在しない人物を指しています';
  }
  if (!Array.isArray(life.history) || !life.event_state || !Array.isArray(life.event_state.followups)) return '記録の形式が不正です';
  return null;
}
