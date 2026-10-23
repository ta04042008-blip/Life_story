// Applying a chosen option exactly once: numeric effects, state operations from the outcome contracts, personality evidence,
// journal entry and scheduled follow-ups. The state-operation interpreter only understands the fixed operation set from the
// spec (set / append / consume / ensure_relationship / schedule / end / apply_household_plan) - never arbitrary code.
import { clone, clamp100, pushCapped, round1 } from './util.js';
import { addPerson, nextId, rel, addRelHistory, kinLabel, bumpRel } from './persons.js';
import { applyEffects, addSkill, householdOf, setResources } from './effects.js';
import { addEvidence } from './personality.js';
import { log, deltaText } from './history.js';
import { isDecisionStillValid } from './decisions.js';
import { SKILL_LABELS } from './opportunities.js';
import { personAge } from './calendar.js';

// ---------------------------------------------------------------------------------------------------------
// reference evaluation: "$offer.education.institution_id", "$clock.index+1", "$offer.migration.travel_quarters+2"

function lookup(path, scope) {
  let cur = scope;
  for (const seg of path.split('.')) { if (cur == null) return undefined; cur = cur[seg]; }
  return cur;
}
export function evalRef(v, scope) {
  if (typeof v !== 'string' || !v.startsWith('$')) return v;
  const m = /^\$([A-Za-z0-9_.]+)(?:\+(\$?[A-Za-z0-9_.]+))?$/.exec(v);
  if (!m) throw new Error('bad reference ' + v);
  const base = lookup(m[1], scope);
  if (base === undefined) throw new Error('unresolved reference ' + v);
  if (!m[2]) return base;
  const add = m[2].startsWith('$') ? lookup(m[2].slice(1), scope) : Number(m[2]);
  return base + add;
}
function evalDeep(v, scope) {
  if (typeof v === 'string') return evalRef(v, scope);
  if (Array.isArray(v)) return v.map((x) => evalDeep(x, scope));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, evalDeep(x, scope)]));
  return v;
}

const ROOTS = new Set(['protagonist', 'relationships', 'households']);
function setPath(life, path, value, scope) {
  const segs = path.split('.').map((s) => (s.startsWith('$') ? String(lookup(s.slice(1), scope)) : s));
  if (!ROOTS.has(segs[0])) throw new Error('path root not allowed: ' + segs[0]);
  let cur = life;
  for (let i = 0; i < segs.length - 1; i++) {
    if (cur[segs[i]] == null) cur[segs[i]] = {};
    cur = cur[segs[i]];
  }
  cur[segs[segs.length - 1]] = value;
}

// ---------------------------------------------------------------------------------------------------------

function buildScope(life, D, decision) {
  const offer = clone(life.event_state.offers); // every offer open this quarter (e.g. the education decision may pick the open work offer)
  if (decision.offer_kind) offer[decision.offer_kind] = decision.offer;
  if (decision.major_type === 'treatment') {
    const ep = life.protagonist.illnesses[decision.illness_id];
    const rq = ep.severity === 'serious' ? D.tuning.episodes.review_quarters.serious : D.tuning.episodes.review_quarters.moderate;
    offer.treatment = { options_known: true, treatment_plan_id: `plan:care:${ep.id}`, support_plan_id: `plan:support:${ep.id}`, review_quarters: rq, outcome_model_id: 'game_review_v1' };
  }
  return {
    decision: { id: decision.id }, offer, clock: { index: life.clock.index }, protagonist: { ...life.protagonist, location_id: life.protagonist.location?.id },
    scenario: { mentor_relationship_template: 'tuning.relationship_templates.mentor' },
    illness: { id: decision.illness_id }, illness_id: decision.illness_id, partner_id: decision.offer?.partner_id,
  };
}

function applyOps(life, D, decision, ops, scope) {
  let pendingEnd = null;
  for (const op of ops) {
    switch (op.op) {
      case 'set': {
        setPath(life, op.path, evalDeep(op.value, scope), scope);
        break;
      }
      case 'append': {
        if (op.path !== 'activity_traces') throw new Error('append path ' + op.path);
        const p = life.protagonist;
        p.activity_traces = p.activity_traces || [];
        pushCapped(p.activity_traces, evalDeep(op.value, scope), 300);
        break;
      }
      case 'consume': {
        const kind = op.path.split('.')[1];
        const id = evalRef(op.value, scope);
        const cur = life.event_state.offers[kind];
        if (cur && cur.id === id) delete life.event_state.offers[kind];
        life.event_state.consumed_offers.push(id);
        break;
      }
      case 'ensure_relationship': {
        const v = evalDeep(op.value, scope);
        const person = life.persons[v.target_id];
        if (!person) throw new Error('missing person ' + v.target_id);
        if (v.role === 'mentor') { person.tags = person.tags.filter((t) => t !== 'mentor_candidate'); if (!person.tags.includes('mentor')) person.tags.push('mentor'); }
        const r = life.relationships[person.id];
        if (!r) throw new Error('missing relationship');
        r.status = 'active';
        break;
      }
      case 'schedule': {
        const v = evalDeep(op.value, scope);
        const task = { id: `${decision.id}:${v.task}`, ...v };
        life.event_state.world_tasks.push(task);
        break;
      }
      case 'end': {
        // replace the old contract only after the new one commits (applied after the loop)
        if (life.protagonist.work && life.protagonist.work.status === 'active') pendingEnd = clone(life.protagonist.work);
        break;
      }
      case 'apply_household_plan': {
        applyHouseholdPlan(life, D, evalDeep(op.value, scope));
        break;
      }
      default: throw new Error('unknown op ' + op.op);
    }
  }
  if (pendingEnd) {
    const cur = life.protagonist.work;
    if (cur && cur.contract_id !== pendingEnd.contract_id) {
      life.protagonist.work_history = life.protagonist.work_history || [];
      life.protagonist.work_history.push({ ...pendingEnd, status: 'ended', end_idx: life.clock.index });
    }
  }
}

export function applyHouseholdPlan(life, D, plan) {
  const partner = life.persons[plan.partner_id];
  const r = life.relationships[partner.id];
  partner.tags = partner.tags.filter((t) => t !== 'partner_candidate');
  if (!partner.tags.includes('partner')) partner.tags.push('partner');
  partner.kin = 'partner'; r.type = 'partner'; r.partnership_status = 'cohabiting';
  const p = life.protagonist, cur = householdOf(life);
  if (plan.kind === 'merge_into_protagonist_household') {
    if (partner.household_id && life.households[partner.household_id]) {
      life.households[partner.household_id].members = life.households[partner.household_id].members.filter((m) => m !== partner.id);
    }
    partner.household_id = cur.id;
    if (!cur.members.includes(partner.id)) cur.members.push(partner.id);
  } else {
    const hid = nextId(life, 'h');
    const display = clamp100(0.5 * cur.resources.display + 0.5 * 50 - 3);
    life.households[hid] = { id: hid, members: ['me', partner.id], resources: { display, band: cur.resources.band, band_at_birth: null }, location: clone(p.location), origin_note: '二人で始めた世帯' };
    cur.members = cur.members.filter((m) => m !== 'me');
    p.household_id = hid; partner.household_id = hid;
    setResources(life, display);
  }
}

// ---------------------------------------------------------------------------------------------------------

const GENERIC_FOLLOWUP = { id: 'reflection', delay_quarters: 2, condition: 'protagonist_alive', text: 'あのときの選択のあとの暮らしを振り返ります。' };

function narrate(life, D, d, ch, scope) {
  const o = d.offer, name = (id) => life.persons[id]?.name;
  const pre = d.actor === 'caregiver' ? '養育者の判断で、' : '';
  if (d.kind === 'major') {
    const key = `${d.major_type}.${ch.id}`;
    const m = {
      'education.enroll': `${o?.institution_label}で学び始めた。`,
      'education.work': `${scope.offer.work?.label || '仕事'}の道に進むことにした。`,
      'education.defer': '進学は見送り、あらためて道を考えることにした。',
      'apprenticeship.accept': `${name(o?.mentor_id)}のもとで「${SKILL_LABELS[o?.skill_id]}」の修業を始めた。`,
      'apprenticeship.decline': '修業の話は見送り、いまの暮らしを続けることにした。',
      'job.accept': `新しい仕事（${o?.label}）を始めた。`,
      'job.stay': 'いまの活動を続けることにした。',
      'migration.move': `${o?.destination_label}への移住の準備を始めた。`,
      'migration.stay': 'いまの土地で暮らしを続けることにした。',
      'partnership.together': `${name(o?.partner_id)}と共に暮らし始めた。`,
      'partnership.wait': `${name(o?.partner_id)}とは、別々に暮らしながら関係を続けることにした。`,
      'treatment.care': `${pre}療養に専念することにした。`,
      'treatment.support': `${pre}日々の支えを中心に過ごすことにした。`,
    }[key];
    if (m) return m;
  }
  return `${pre}${d.title}：${ch.text}。`.replace(/。。$/, '。');
}

function defaultContract(decision, choice) {
  return {
    numeric_effects: { mode: 'inherit_template_once' },
    state_operations: [{ op: 'append', path: 'activity_traces', value: { event_id: decision.event_id, choice_id: choice.id, decision_id: '$decision.id', quarter: '$clock.index' } }],
    followups: [{ ...GENERIC_FOLLOWUP }],
  };
}

/**
 * Resolve a decision. `meta` = { by: 'player'|'auto'|'caregiver', reason?: string }.
 * Returns { ok, duplicate, invalid, deltas, entry }.
 */
export function resolveDecision(life, D, rng, decision, choiceId, meta = { by: 'player' }) {
  if (life.resolutions.includes(decision.id)) return { ok: false, duplicate: true };
  if (!isDecisionStillValid(life, D, decision)) {
    life.resolutions.push(decision.id);
    log(life, { type: 'system', icon: '…', text: `「${decision.title}」の前提が変わったため、この場面は見送られた。`, tags: ['void'] });
    return { ok: false, invalid: true };
  }
  const choice = decision.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error(`unknown choice ${choiceId} for ${decision.id}`);

  const age = Math.floor(life.clock.index / 4);
  const contractAll = D.outcomes[decision.event_id];
  const contract = contractAll?.choices.find((c) => c.choice_id === choiceId) || defaultContract(decision, choice);
  const scope = buildScope(life, D, decision);

  // transaction: snapshot the subtree the operations can touch
  const snap = clone({ protagonist: life.protagonist, households: life.households, persons: life.persons, relationships: life.relationships, event_state: life.event_state });
  let deltas = {};
  try {
    // numeric effects
    const mode = contract.numeric_effects?.mode;
    const effects = mode === 'replace_template_once' ? contract.numeric_effects.values : choice.effects;
    deltas = applyEffects(life, effects, decision.target?.person_id);
    // skill gains
    const sk = choice.skills || D.tuning.skill_effects[`${decision.event_id}.${choiceId}`];
    if (sk) for (const [s, a] of Object.entries(sk)) { const d = addSkill(life, s, a); if (d) deltas[s] = d; }
    // state operations
    applyOps(life, D, decision, contract.state_operations || [], scope);
    // hooks implemented in code
    postHooks(life, D, decision, choice, deltas);
    finalizeWork(life, scope);
    finalizeTravel(life, scope);
  } catch (err) {
    // roll back everything the failed resolution touched
    life.protagonist = snap.protagonist; life.households = snap.households; life.persons = snap.persons;
    life.relationships = snap.relationships; life.event_state = snap.event_state;
    throw err;
  }

  // people created by the choice (meeting events)
  if (choice.creates) createFromChoice(life, D, rng, choice.creates);

  // personality evidence: only the protagonist's own choices, age 6+
  if (decision.actor === 'protagonist' && age >= 6) {
    addEvidence(life, D, choice.personality_tags, decision.weight, { event: decision.event_id, choice: choice.id, auto: meta.by === 'auto', text: choice.text });
    life.protagonist.personality.valid_count += 1;
  }

  // journal
  const text = narrate(life, D, decision, choice, scope);
  const brief = text;
  const auto = meta.by === 'auto' ? '（おまかせ）' : meta.by === 'caregiver' ? '' : '';
  const entry = log(life, {
    type: decision.kind === 'major' ? 'major' : 'choice', icon: decision.kind === 'major' ? '◆' : '・',
    text: `${text}${auto}`, brief: `${brief}${auto}`, importance: decision.kind === 'major' ? 3 : 1,
    tags: [decision.event_id, ...(decision.content_tags || [])], deltas,
    refs: { decision: decision.id, event: decision.event_id, choice: choice.id, auto: meta.by === 'auto', reason: meta.reason || null },
  });

  // follow-ups
  const snapshot = Object.fromEntries(Object.entries({
    edu: life.protagonist.education?.institution_id, contract: life.protagonist.work?.contract_id,
    appr: life.protagonist.apprenticeship?.contract_id, partner: decision.offer?.partner_id, dest: decision.offer?.destination_id,
  }).filter(([, v]) => v !== undefined));
  for (const f of contract.followups || []) {
    let delay;
    try { delay = evalRef(f.delay_quarters, scope); } catch { delay = 2; }
    life.event_state.followups.push({
      id: `${f.id}@${decision.id}`, base_id: f.id, due_idx: life.clock.index + Math.max(1, delay), decision_id: decision.id,
      event_id: decision.event_id, choice_id: choice.id, title: decision.title, target_id: decision.target?.person_id || null,
      condition: f.condition, text: f.text, snapshot,
    });
  }

  // bookkeeping
  const es = life.event_state;
  es.counts[decision.event_id] = (es.counts[decision.event_id] || 0) + 1;
  if (decision.kind === 'small') { es.cooldowns[decision.event_id] = life.clock.index; pushCapped(es.recent_small, decision.event_id, D.tuning.selection.recent_window); }
  life.resolutions.push(decision.id);
  if (life.resolutions.length > 400) life.resolutions.splice(0, 100);
  return { ok: true, deltas, entry };
}

function postHooks(life, D, decision, choice, deltas) {
  const hook = D.tuning.choice_hooks[`${decision.event_id}.${choice.id}`];
  if (!hook) return;
  if (hook.consume_offer) {
    const o = life.event_state.offers[hook.consume_offer];
    if (o) {
      const bonus = D.tuning.work.wage_bonus[o.wage_level] ?? 0;
      const d = applyEffects(life, { resources: bonus });
      if (d.resources) deltas.resources = round1((deltas.resources || 0) + d.resources);
      delete life.event_state.offers[hook.consume_offer];
      life.event_state.consumed_offers.push(o.id);
    }
  }
}

function createFromChoice(life, D, rng, c) {
  const age = Math.floor(life.clock.index / 4);
  const off = c.age_offset || [-3, 3];
  const ageYears = Math.max(c.min_age ?? 5, age + Math.round(rng.range(off[0], off[1])));
  const p = addPerson(life, D, rng, { kin: c.kin, ageYears, tags: c.tags || [], closenessBoost: c.closeness_boost || 0 });
  log(life, { type: 'person', icon: '🤝', text: `${p.name}（${kinLabel(p)}）と知り合った。`, tags: ['meeting'], refs: { person: p.id } });
  return p;
}

function finalizeTravel(life, scope) {
  const tr = life.protagonist.travel, o = scope.offer.migration;
  if (tr && o && tr.offer_id === o.id) {
    tr.destination_id = o.destination_id; tr.destination_label = o.destination_label; tr.destination_profile = o.destination_profile; tr.companion_id = o.companion_id;
  }
}
function finalizeWork(life, scope) {
  const w = life.protagonist.work, o = scope.offer.work;
  if (w && o && w.contract_id === o.contract_id) { w.wage_level = o.wage_level; w.label = o.label; w.scope = o.scope; }
}
