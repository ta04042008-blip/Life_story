// Browser storage wrapper. localStorage can be missing or full (private windows, cleared site data), so every call is guarded
// and the game falls back to memory-only without crashing. Failures are reported to the caller, never swallowed silently.
import { SaveStore, serialize, hydrate } from '../sim/save.js';

function makeStorage() {
  try {
    const t = '__ls_test__'; window.localStorage.setItem(t, '1'); window.localStorage.removeItem(t);
    return { backend: window.localStorage, persistent: true };
  } catch {
    const m = new Map();
    return { backend: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }, persistent: false };
  }
}

export function createStore(D) {
  const { backend, persistent } = makeStorage();
  const slots = new SaveStore(backend, D);
  const PAST = 'life-story:past';
  const readPast = () => { try { return JSON.parse(backend.getItem(PAST) || '[]'); } catch { return []; } };
  return {
    persistent, slots,
    /** @returns {{ok:boolean,error?:string}} */
    save(slot, life) {
      try { slots.write(slot, life); return { ok: true }; }
      catch (e) { return { ok: false, error: '端末内に保存できませんでした（保存容量が足りないか、保存が許可されていません）。「書き出し」でJSONを保存してください。' }; }
    },
    stash(life) { try { slots.stashRestore(life); return true; } catch { return false; } },
    pastList() { return readPast().map(({ id, name, birth_year, death_year, age, where }) => ({ id, name, birth_year, death_year, age, where })); },
    pastAdd(life, review) {
      try {
        const list = readPast().filter((p) => p.id !== life.id);
        list.unshift({ id: life.id, name: review.name, birth_year: review.birth_year, death_year: review.death_year, age: review.age, where: review.where, save: serialize(life, D) });
        while (list.length > 4) list.pop();
        backend.setItem(PAST, JSON.stringify(list));
        return true;
      } catch { return false; }
    },
    pastLoad(id) { const p = readPast().find((x) => x.id === id); return p ? hydrate(p.save, D) : { ok: false, error: '見つかりませんでした。' }; },
    getPref(k, d) { try { const v = backend.getItem('life-story:pref:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    setPref(k, v) { try { backend.setItem('life-story:pref:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
}
