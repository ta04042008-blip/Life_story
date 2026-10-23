// Pure view builders: (life, data) -> DOM nodes. They never change the life.
import { h, svg } from './dom.js';
import { ageOf, yearOf, quarterOf, personAge } from '../sim/calendar.js';
import { bandLabel } from '../sim/util.js';
import { BAND_LABELS, householdOf } from '../sim/effects.js';
import { personsWithRole, personSummary, kinLabel } from '../sim/persons.js';
import { personalityView, AXES, AXIS_INFO, evidenceFor } from '../sim/personality.js';
import { activeEpisodes } from '../sim/episodes.js';
import { SKILL_LABELS } from '../sim/opportunities.js';
import { DELTA_LABELS, deltaText, entryText } from '../sim/history.js';
import { EVIDENCE_LABELS, REGION_LABELS } from '../sim/context.js';
import { FOCUS_LABELS } from '../sim/decisions.js';

export const QUARTER_NAMES = ['第1四半期', '第2四半期', '第3四半期', '第4四半期'];

export function meter(label, value, extra) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return h('div', { class: 'meter', role: 'img', 'aria-label': `${label}：${bandLabel(value)}` },
    h('span', { class: 'meter-label', text: label }),
    h('span', { class: 'meter-bar' }, h('span', { class: 'meter-fill', style: { width: v + '%' } })),
    h('span', { class: 'meter-band', text: extra || bandLabel(value) }));
}

export function stateMeters(life) {
  const p = life.protagonist, hh = householdOf(life);
  return h('div', { class: 'meters' },
    meter('健康', p.health), meter('学び', p.learning), meter('魅力', p.charm),
    meter('暮らし', hh.resources.display, BAND_LABELS[hh.resources.band]), meter('幸福感', p.happiness));
}

/** One sentence describing how life is going right now. */
export function lifeLine(life, ctx) {
  const p = life.protagonist, age = ageOf(life.clock.index), scene = ctx.terms.scene;
  const eps = activeEpisodes(life);
  let s;
  if (p.travel && p.travel.status === 'traveling') s = `${p.travel.destination_label}へ向かう道の途中にいる。`;
  else if (p.travel && p.travel.status === 'preparing') s = `${p.travel.destination_label}への旅立ちの支度をしている。`;
  else if (age < 3) s = `${scene}の中で、養育者に見守られて育っている。`;
  else if (p.education?.status === 'enrolled') s = `${p.education.institution_label || ctx.terms.school}で学びながら暮らしている。`;
  else if (p.apprenticeship?.status === 'active') s = `${life.persons[p.apprenticeship.mentor_id]?.name || '師'}のもとで技を身につけている。`;
  else if (p.work?.status === 'active') s = `${p.work.label || ctx.terms.work}に取り組みながら暮らしている。`;
  else if (age < 13) s = `${scene}の中で、日々を過ごしている。`;
  else s = `${scene}の中で、自分の道を探しながら過ごしている。`;
  if (eps.length) s += ' 体調がすぐれない時期でもある。';
  return s;
}

function kv(k, v) { return h('div', { class: 'kv' }, h('dt', { text: k }), h('dd', null, v)); }

// ---------------------------------------------------------------------------------------------------------
export function selfPanel(life, D, ctx) {
  const p = life.protagonist, age = ageOf(life.clock.index), view = personalityView(life, D);
  const wrap = h('div', { class: 'panel-body' });
  wrap.append(h('h3', { text: `${p.name}（${age}歳）` }));
  wrap.append(h('p', { class: 'muted', text: `${yearOf(life.clock)}年 ${QUARTER_NAMES[quarterOf(life.clock)]} ／ ${ctx.place_label}` }));
  wrap.append(stateMeters(life));
  wrap.append(h('h4', { text: '身についたこと' }));
  const sk = Object.entries(p.skills).filter(([, v]) => v > 0);
  wrap.append(sk.length ? h('div', { class: 'chips' }, sk.map(([k, v]) => h('span', { class: 'chip', text: `${SKILL_LABELS[k] || k} ${bandLabel(v)}` }))) : h('p', { class: 'muted', text: 'まだ特に身についた技はありません。' }));
  wrap.append(h('h4', { text: '性格の傾向' }));
  if (!view.ready) {
    wrap.append(h('p', { class: 'muted', text: `性格は生まれつき決まりません。自分で選んだ（${p.personality.valid_count}回）選択の積み重ねから見えてきます。${D.tuning.personality.type_min_age}歳以上で選択が${D.tuning.personality.type_min_choices}回を超えると、傾向の名前が表示されます。` }));
  } else wrap.append(h('p', { class: 'type-name', text: view.typeName }));
  for (const ax of AXES) {
    const s = view.axes[ax], info = AXIS_INFO[ax];
    const row = h('div', { class: 'axis' },
      h('div', { class: 'axis-head' }, h('span', { text: info.left.word }), h('strong', { text: info.name }), h('span', { text: info.right.word })),
      h('div', { class: 'axis-track', role: 'img', 'aria-label': `${info.name}：${s.settled ? (s.side === 'balanced' ? '均衡' : s.side === 'left' ? info.left.word : info.right.word) : '未定'}` },
        h('span', { class: 'axis-mid' }), h('span', { class: 'axis-dot' + (s.settled ? '' : ' faint'), style: { left: Math.max(2, Math.min(98, s.value)) + '%' } })));
    wrap.append(row);
    if (s.settled && (s.side === 'left' || s.side === 'right')) {
      const ev = evidenceFor(life, ax, s.side, 2);
      if (ev.length) wrap.append(h('p', { class: 'axis-why', text: '例：' + ev.map((e) => e.text).join(' ／ ') }));
    }
  }
  wrap.append(h('p', { class: 'note', text: '乳幼児期の養育者の判断は、性格の証拠には数えません。' }));
  return wrap;
}

// ---------------------------------------------------------------------------------------------------------
export function peoplePanel(life, D, onPick) {
  const wrap = h('div', { class: 'panel-body' });
  wrap.append(relationMap(life, D, onPick));
  const idx = life.clock.index;
  const all = Object.values(life.persons).map((x) => personSummary(life, x, idx));
  const act = all.filter((x) => x.alive && x.status === 'active').sort((a, b) => b.closeness - a.closeness);
  const other = all.filter((x) => !(x.alive && x.status === 'active'));
  wrap.append(h('h4', { text: 'いま関わりのある人' }));
  const list = h('ul', { class: 'people' });
  for (const x of act) list.append(personRow(x, onPick));
  wrap.append(list);
  if (other.length) {
    wrap.append(h('h4', { text: '別れた人・亡くなった人' }));
    const l2 = h('ul', { class: 'people dim' });
    for (const x of other) l2.append(personRow(x, onPick));
    wrap.append(l2);
  }
  return wrap;
}

function personRow(x, onPick) {
  return h('li', null, h('button', { class: 'person-row', onclick: () => onPick(x.id) },
    h('span', { class: 'p-name', text: x.name }),
    h('span', { class: 'p-meta', text: `${x.label}・${x.age}歳${x.alive ? '' : '・故人'}${x.away ? '・離れている' : ''}` }),
    x.closeness != null ? h('span', { class: 'p-bars', 'aria-hidden': 'true' }, h('i', { style: { width: x.closeness + '%' } })) : null));
}

export function relationMap(life, D, onPick) {
  const idx = life.clock.index;
  const list = Object.values(life.persons).map((x) => personSummary(life, x, idx)).filter((x) => x.alive && x.status === 'active').slice(0, 14);
  const W = 320, H = 260, cx = W / 2, cy = H / 2;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'relmap', role: 'group', 'aria-label': '相関図' });
  s.append(svg('circle', { cx, cy, r: 100, class: 'ring' }), svg('circle', { cx, cy, r: 60, class: 'ring' }));
  list.sort((a, b) => b.closeness - a.closeness);
  list.forEach((x, i) => {
    const ang = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
    const dist = 125 - (x.closeness / 100) * 85;
    const px = cx + Math.cos(ang) * dist * (W / H) * 0.9, py = cy + Math.sin(ang) * dist;
    const tense = x.tension >= 45;
    s.append(svg('line', { x1: cx, y1: cy, x2: px, y2: py, class: 'rel-line' + (tense ? ' tense' : ''), 'stroke-width': 1 + (x.trust / 100) * 2.5 }));
    const g = svg('g', { class: 'node', tabindex: 0, role: 'button', 'aria-label': `${x.name}（${x.label}）`, transform: `translate(${px},${py})` });
    g.append(svg('circle', { r: 11 + x.closeness / 14, class: 'node-c' + (tense ? ' tense' : '') }), svg('text', { class: 'node-t', 'text-anchor': 'middle', y: 4 }, x.name.slice(0, 3)));
    const go = () => onPick(x.id);
    g.addEventListener('click', go); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    s.append(g);
  });
  const me = svg('g', { transform: `translate(${cx},${cy})` }, svg('circle', { r: 20, class: 'me-c' }), svg('text', { class: 'me-t', 'text-anchor': 'middle', y: 4 }, life.protagonist.name.slice(0, 3)));
  s.append(me);
  return h('figure', { class: 'relfig' }, s, h('figcaption', { class: 'note', text: '中心に近いほど親密、線の太さは信頼、赤みを帯びた線は緊張が高い関係です。' }));
}

export function personSheet(life, D, id) {
  const x = life.persons[id], r = life.relationships[id];
  const idx = life.clock.index;
  const sm = personSummary(life, x, idx);
  const wrap = h('div', { class: 'panel-body' });
  wrap.append(h('h3', { text: x.name }), h('p', { class: 'muted', text: `${sm.label}・${sm.age}歳${x.alive ? '' : '（故人）'}` }));
  if (r) {
    wrap.append(h('div', { class: 'meters' }, meter('親密さ', r.closeness), meter('信頼', r.trust), meter('緊張', r.tension)));
    wrap.append(h('dl', { class: 'kvs' }, kv('関係の状態', ({ active: '続いている', ended: '終わった', ended_away: '離れて会えなくなった', ended_death: '亡くなった' })[r.status] || r.status),
      r.partnership_status ? kv('暮らし', r.partnership_status === 'cohabiting' ? '一緒に暮らしている' : '別々に暮らしている') : null,
      x.household_id === life.protagonist.household_id ? kv('住まい', '同じ世帯') : kv('住まい', '別の世帯')));
    const hist = (r.history || []).slice(-8).reverse();
    wrap.append(h('h4', { text: 'これまでの出来事' }));
    wrap.append(hist.length ? h('ul', { class: 'hist' }, hist.map((e) => h('li', { text: `${yearOf(life.clock, e.idx)}年　${e.text}` }))) : h('p', { class: 'muted', text: 'まだ特筆する出来事はありません。' }));
  }
  return wrap;
}

// ---------------------------------------------------------------------------------------------------------
export function livingPanel(life, D, ctx) {
  const p = life.protagonist, hh = householdOf(life), wrap = h('div', { class: 'panel-body' });
  wrap.append(h('h3', { text: '暮らし・家計' }));
  wrap.append(h('dl', { class: 'kvs' },
    kv('住んでいる所', ctx.place_label),
    kv('暮らし向き', `${BAND_LABELS[hh.resources.band]}（${Math.round(hh.resources.display)}／100）`),
    kv('出生時の暮らし向き', BAND_LABELS[hh.resources.band_at_birth] || BAND_LABELS[life.origin.resource_band] || '—'),
    kv('世帯', `${hh.members.length}人`),
    kv('学び', p.education?.status === 'enrolled' ? `${p.education.institution_label || ctx.terms.school}に通っている` : p.education?.status === 'completed' ? '課程を終えた' : ['withdrawn', 'interrupted'].includes(p.education?.status) ? '途中でやめた' : '特に通っていない'),
    kv('仕事', p.work?.status === 'active' ? `${p.work.label}（${({ low: '収入は控えめ', mid: '収入は並', high: '収入は手厚め' })[p.work.wage_level] || ''}）` : '特定の仕事には就いていない'),
    kv('技の修行', p.apprenticeship?.status === 'active' ? `${life.persons[p.apprenticeship.mentor_id]?.name || '師'}のもとで修行中` : 'なし')));
  wrap.append(h('h4', { text: '世帯の人たち' }));
  wrap.append(h('ul', { class: 'people' }, hh.members.filter((m) => m !== 'me').map((m) => life.persons[m]).filter(Boolean).map((x) => {
    const s = personSummary(life, x); return h('li', { class: 'plain', text: `${x.name}（${s.label}・${s.age}歳${x.alive ? '' : '・故人'}）` });
  })));
  const eps = activeEpisodes(life);
  wrap.append(h('h4', { text: '体の具合' }));
  wrap.append(eps.length ? h('ul', { class: 'hist' }, eps.map((e) => h('li', { text: `${({ short_illness: '体調不良', injury: 'けが', chronic_condition: '長引く不調' })[e.family] || '不調'}（${({ mild: '軽い', moderate: 'やや重い', serious: '重い' })[e.severity]}）${e.care_plan ? '・対応中' : ''}` }))) : h('p', { class: 'muted', text: '目立った不調はありません。' }));
  const offers = Object.entries(life.event_state.offers);
  if (offers.length) {
    wrap.append(h('h4', { text: '今期の機会' }));
    const names = { education: '学びの機会', apprenticeship: '修行の話', work: '仕事の話', migration: '移住の話', partnership: 'パートナーの話' };
    wrap.append(h('ul', { class: 'hist' }, offers.map(([k]) => h('li', { text: names[k] || k }))));
  }
  wrap.append(h('p', { class: 'note', text: '暮らし向きは、どの時代・地域でも比べられるよう0〜100にまとめたゲーム内の指標です。実際の金額や資産量は表していません。' }));
  return wrap;
}

// ---------------------------------------------------------------------------------------------------------
export function journalPanel(life, D, state, rerender) {
  const wrap = h('div', { class: 'panel-body' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '表示する記録' },
    ...[['key', '主な出来事'], ['all', 'すべて']].map(([k, t]) => h('button', { class: state.filter === k ? 'on' : '', 'aria-pressed': state.filter === k, onclick: () => { state.filter = k; state.limit = 120; rerender(); } }, t)));
  wrap.append(seg);
  const ex = life.settings.expression;
  let list = life.history.filter((e) => (state.filter === 'all' ? true : e.importance >= 2 || e.type === 'birthday' && e.age % 5 === 0));
  const total = list.length;
  list = list.slice(-state.limit).reverse();
  if (total > list.length) wrap.append(h('button', { class: 'btn ghost', onclick: () => { state.limit += 200; rerender(); }, text: `さらに古い記録を表示（残り${total - list.length}件）` }));
  let lastYear = null;
  const ul = h('ol', { class: 'journal' });
  for (const e of list) {
    if (e.year !== lastYear) { ul.append(h('li', { class: 'jy' }, h('strong', { text: `${e.year}年` }), h('span', { text: `${e.age}歳` }))); lastYear = e.year; }
    const li = h('li', { class: 'je type-' + e.type }, h('span', { class: 'je-icon', 'aria-hidden': 'true', text: e.icon || '・' }),
      h('div', null, h('p', { text: entryText(e, ex) }), e.deltas ? h('p', { class: 'deltas', text: deltaText(e.deltas) }) : null));
    ul.append(li);
  }
  wrap.append(ul.children.length ? ul : h('p', { class: 'muted', text: 'まだ記録がありません。' }));
  return wrap;
}

// ---------------------------------------------------------------------------------------------------------
export function dataPanel(life, D, ctx) {
  const o = life.origin, wrap = h('div', { class: 'panel-body' });
  wrap.append(h('h3', { text: '時代・地域とデータ' }));
  wrap.append(h('p', { class: 'badge-line' }, h('span', { class: 'badge', text: ctx.evidence_label }), ' ', ctx.generic_badge ? h('span', { class: 'badge', text: ctx.generic_badge }) : null));
  wrap.append(h('dl', { class: 'kvs' },
    kv('いまの年', `${ctx.year}年${ctx.future ? '（2026年より先。ゲーム用の仮説の世界）' : ''}`),
    kv('地域', `${ctx.region_label}／${ctx.place_label}`),
    kv('時代の区分', ctx.era_label),
    kv('参照している記録', ctx.kind === 'deep_dive' ? `${o.place_label}の出生舞台の記録` : ctx.kind === 'successor' ? `後続の社会状況：${ctx.successor?.label || '共通の推定'}` : '地域・居住形態・年代にもとづく共通の推定'),
    kv('死亡の目安', life.mortality_last ? `${life.mortality_last.source}（1年あたり約${(life.mortality_last.q_annual * 100).toFixed(2)}%）` : '最初の四半期の処理後に表示')));
  wrap.append(h('p', { class: 'note', text: '地域や年代に合う記録がない場合は「ゲーム用推定」の舞台を使い、実在の都市名・慣習・統計は使いません。推定値は史実や測定値としては表示しません。' }));
  const ctxLog = life.world.context_log || [];
  wrap.append(h('h4', { text: '社会状況が切り替わった記録' }));
  wrap.append(h('ul', { class: 'hist' }, ctxLog.slice(-8).reverse().map((c) => h('li', { text: `${c.year}年：${c.label}（${EVIDENCE_LABELS[c.tier] || c.tier}）` }))));
  wrap.append(h('p', { class: 'note', text: '切り替わりは、参照する記録が変わるだけです。人生の区切りや自動の出来事ではありません。' }));

  wrap.append(h('h4', { text: '出生の抽選について' }));
  const smp = o.sampling, win = smp.year_window;
  wrap.append(h('dl', { class: 'kvs' },
    kv('出生年の範囲', `${win.from}〜${win.to}年（各年とも同じ確率 1/${win.count}）`),
    kv('地域の抽選', '8つの広域地域を均等に抽選（ゲーム用の重みで、実際の人口比ではありません）'),
    kv('今回の出生地域', REGION_LABELS[o.macro_region]),
    kv('世帯の型・暮らし向き', `${o.household_composition_label}／${BAND_LABELS[o.resource_band]}`),
    kv('乱数シード', String(o.rng_seed))));
  wrap.append(h('p', { class: 'note', text: smp.note }));

  const src = D.raw.bindings.source_candidates;
  const ids = ctx.binding?.source_candidates || (o.scenario_id ? D.scenarios[o.scenario_id].source_candidates : []);
  if (ids && ids.length) {
    wrap.append(h('h4', { text: 'この舞台の調査先（未取り込み）' }));
    wrap.append(h('ul', { class: 'hist' }, ids.map((id) => src[id] && h('li', null, h('a', { href: src[id].url, target: '_blank', rel: 'noopener noreferrer', text: src[id].use }), h('span', { class: 'muted', text: '　取り込み状況：' + ({ candidate_not_imported: '候補・未取り込み' }[src[id].verification] || '資料の範囲確認のみ・数値には未使用') })))));
  }
  wrap.append(h('h4', { text: '出典とライセンス' }));
  const m = D.modernMort.meta;
  wrap.append(h('ul', { class: 'hist' },
    h('li', { text: `年齢別死亡（1950年以降）：${m.source}` }),
    h('li', { text: `ライセンス：${m.license}` }),
    h('li', { text: `${m.projection_variant}の予測は2024年以降。2100年より先は2100年の表を据え置くゲーム用仮説。100歳以上は推定の尾部（WPPの値ではありません）。` }),
    h('li', { text: `1950年より前や国別系列のない場所は、低・中央・高の幅を持つゲーム用推定表を使います。${m.scope_note}` }),
    h('li', { text: '出来事・選択肢・人物は本作のために書き下ろした創作で、実在の人物や出来事の記録ではありません。' })));
  wrap.append(h('p', { class: 'note', text: `ルール版 ${D.versions.rules_version}／データ版 ${D.versions.data_version}。数値はゲーム用の初期調整値で、公開版のデータ審査（利用条件・地域適合・バランス）は未完了です。` }));
  return wrap;
}

// ---------------------------------------------------------------------------------------------------------
export function decisionView(life, D, d, ctx, handlers) {
  const ex = life.settings.expression;
  const wrap = h('div', { class: 'decision', role: 'group', 'aria-labelledby': 'dec-title' });
  wrap.append(h('p', { class: 'dec-kind' + (d.kind === 'major' ? ' major' : ''), text: d.kind === 'major' ? '人生の決断' : '今期の選択' }));
  wrap.append(h('h3', { id: 'dec-title', text: d.title }));
  if (d.actor === 'caregiver') wrap.append(h('p', { class: 'note', text: '幼い時期のため、養育者が決めます。' }));
  const tgt = d.target && life.persons[d.target.person_id];
  if (tgt) wrap.append(h('p', { class: 'muted', text: `関わる人：${tgt.name}（${personSummary(life, tgt).label}）` }));
  wrap.append(h('p', { class: 'dec-text', text: ex === 'brief' ? d.text_brief : d.text_standard }));
  if (d.detail) wrap.append(h('p', { class: 'dec-detail', text: d.detail }));
  const ul = h('div', { class: 'choices' });
  for (const c of d.choices) ul.append(h('button', { class: 'choice', onclick: () => handlers.choose(c.id) }, h('span', { text: c.text }), c.risk >= 2 ? h('small', { text: '結果にばらつきがあります' }) : null));
  wrap.append(ul);
  wrap.append(h('div', { class: 'dec-actions' },
    h('button', { class: 'btn ghost', onclick: handlers.auto, text: 'おまかせで決める' }),
    h('button', { class: 'btn ghost', onclick: handlers.later, text: '閉じる（あとで答える）' })));
  wrap.append(h('p', { class: 'note', text: '閉じても回答したことにはなりません。同じ選択肢がもう一度表示されます。' }));
  return wrap;
}

export { FOCUS_LABELS, DELTA_LABELS };
