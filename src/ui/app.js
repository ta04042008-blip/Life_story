// The controller: screens, play loop, panels, saving. All game rules live in src/sim; this file only shows them and calls advance/answer.
import { h, clear, $ } from './dom.js';
import { loadData } from '../sim/data.js';
import { newLife, advance, answer, answerAuto, currentContext, setFocus, setAuto } from '../sim/engine.js';
import { serialize, hydrate, SLOT_IDS, summaryOf } from '../sim/save.js';
import { buildReview } from '../sim/review.js';
import { ageOf, yearOf, quarterOf } from '../sim/calendar.js';
import { personSummary } from '../sim/persons.js';
import { personalityView } from '../sim/personality.js';
import { BAND_LABELS } from '../sim/effects.js';
import { FOCUS_LABELS } from '../sim/decisions.js';
import { entryText } from '../sim/history.js';
import { EVIDENCE_LABELS } from '../sim/context.js';
import { createStore } from './store.js';
import { drawScene } from './scene.js';
import * as V from './views.js';

const root = document.getElementById('app');
const S = {
  D: null, store: null, screen: 'title', life: null, playing: false, resume: false, fast: 0, speed: 1, timer: null,
  panel: null, journal: { filter: 'key', limit: 120 }, notice: null, lastSaveOk: true, sceneT: 0, raf: null,
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

const SLOT_LABELS = { auto: '自動保存', auto_prev: '直前の自動保存', manual1: '手動保存 1', manual2: '手動保存 2', manual3: '手動保存 3', restore: '復元用（直前の人生）' };
const SPEEDS = [1, 2, 4, 8];
const QUARTER_MS = 8000;

// ------------------------------------------------------------------------------------------------ boot
async function boot() {
  try {
    S.D = await loadData(async (p) => { const r = await fetch(p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); });
  } catch (e) {
    root.replaceChildren(h('main', { class: 'screen' }, h('h1', { text: '読み込めませんでした' }),
      h('p', { text: 'ゲームのデータを読み込めませんでした。ファイルを直接開いている場合は、簡易サーバー経由（例：python3 -m http.server）で開いてください。公開サイトの場合は、通信状況を確認して再読み込みしてください。' }),
      h('p', { class: 'note', text: String(e.message || e) })));
    return;
  }
  S.store = createStore(S.D);
  S.speed = S.store.getPref('speed', 1);
  applyPrefs();
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', () => { if (S.life && S.screen === 'life') save('auto'); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.panel) closePanel(); });
  showTitle();
}

function applyPrefs() {
  const size = S.store.getPref('fontScale', 1);
  document.documentElement.style.setProperty('--font-scale', String(size));
  document.documentElement.classList.toggle('reduce-motion', !!S.store.getPref('reduceMotion', S.reduced));
}
const motionOK = () => !document.documentElement.classList.contains('reduce-motion');

// ------------------------------------------------------------------------------------------------ title
function showTitle() {
  stopLoop(); S.screen = 'title'; S.panel = null; S.life = null;
  document.body.classList.remove('sheet-open');
  const auto = S.store.slots.info('auto'), past = S.store.pastList();
  const seedInput = h('input', { type: 'number', inputmode: 'numeric', id: 'seed', placeholder: '空欄で毎回ランダム', min: 0, max: 4294967295 });
  const pic = h('canvas', { class: 'pic', width: 240, height: 80, 'aria-hidden': 'true' });
  const main = h('main', { class: 'screen title' }, h('div', { class: 'in' },
    pic,
    h('h1', { 'aria-label': '巡る一生' }, h('span', { 'aria-hidden': 'true', text: '巡る' }), h('span', { 'aria-hidden': 'true', text: '一生' })),
    h('p', { class: 'lead', text: '西暦27年から2026年までのどこかに生まれ、四半期ごとに、ひとつの人生を最後まで歩みます。' }),
    h('p', { class: 'note', text: '成人向けの人生シミュレーションです（18歳以上）。出生の場所・年・境遇は抽選で決まり、選べません。' }),
    h('div', { class: 'menu' },
      h('button', { class: 'tb main', onclick: () => { const v = seedInput.value.trim(); startNew(v === '' ? null : Number(v) >>> 0); } }, '新しい人生を始める'),
      auto && !auto.broken ? h('button', { class: 'tb', onclick: () => loadSlot('auto') }, h('span', null, 'つづきから'), h('small', { text: `${auto.name}・${auto.age}歳${auto.dead ? '（人生は終わっています）' : ''}・${auto.label}` })) : null,
      h('details', { class: 'adv' }, h('summary', { text: 'シードを指定して同じ人生を再現する' }),
        h('p', { class: 'note', text: '同じシードと同じ選択なら、同じ人生になります。' }), h('label', { for: 'seed', text: 'シード（0〜4294967295）' }), seedInput)),
    past.length ? h('section', null, h('h2', { text: 'これまでの人生' }), h('ul', { class: 'people' }, past.map((p) => h('li', null,
      h('button', { class: 'person-row', onclick: () => openPast(p.id) }, h('span', { class: 'p-name', text: p.name }), h('span', { class: 'p-meta', text: `${p.birth_year}〜${p.death_year}年・${p.age}歳・${p.where}` })))))) : null,
    h('section', { class: 'foot' },
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => openImport() }, 'JSONを読み込む'), h('button', { class: 'btn ghost', onclick: () => openSettingsTitle() }, '表示設定'), h('button', { class: 'btn ghost', onclick: () => openDataOnly() }, '出典・ライセンス')),
      h('p', { class: 'note', text: S.store.persistent ? '保存はこの端末のブラウザ内だけです。端末の故障やデータ消去に備え、ときどき「書き出し」でJSONを保存してください。' : 'このブラウザでは端末内保存が使えません。続きを残すには「書き出し」でJSONを保存してください。' }))));
  root.replaceChildren(main);
  const q = Math.floor(Math.random() * 4), styles = ['premodern', 'industrial', 'midcentury', 'contemporary'], sets = ['rural_or_village', 'town_or_market_center', 'urban_or_city'];
  drawScene(pic, { seed: Math.floor(Math.random() * 60000), season: q, age: 20 + Math.floor(Math.random() * 40), settlement: sets[Math.floor(Math.random() * 3)], style: styles[Math.floor(Math.random() * 4)], people: [{ age: 6 }, { age: 30 }, { age: 3 }], night: false, playing: false, reduced: true }, 0);
  document.title = '巡る一生';
}

function randomSeed() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; }

function startNew(seed) {
  if (S.life && !S.life.dead) S.store.stash(S.life);
  const life = newLife(S.D, seed == null ? randomSeed() : seed);
  life.settings.expression = S.store.getPref('expression', 'standard');
  S.life = life; showBirth();
}

// ------------------------------------------------------------------------------------------------ birth explanation
function showBirth() {
  S.screen = 'birth';
  const life = S.life, o = life.origin, ctx = currentContext(life, S.D), win = o.sampling.year_window;
  const family = Object.values(life.persons).filter((p) => p.household_id === 'h1').map((p) => personSummary(life, p));
  const row = (k, v) => [h('dt', { text: k }), h('dd', null, v)];
  const main = h('main', { class: 'screen birth' },
    h('p', { class: 'note', text: '人生が決まりました' }),
    h('div', { class: 'cert' },
      h('div', { class: 'h2' }, h('div', null, h('h1', { text: '出生届' }), h('p', { class: 'no', text: `シード ${o.rng_seed}` })), h('div', { class: 'stampc', 'aria-hidden': 'true', text: '誕生' })),
      h('dl', null,
        ...row('氏名', life.protagonist.name),
        ...row('生まれた年', `${o.birth_year}年`),
        ...row('地域', `${o.region_label}（${ctx.place_label}）`),
        ...row('暮らしの舞台', ctx.terms.scene),
        ...row('家族', [h('div', { text: o.household_composition_label }), h('div', { class: 'fam' }, family.map((f) => h('span', { text: f.label })))]),
        ...row('家の暮らし向き', BAND_LABELS[o.resource_band]),
        ...row('資料の区分', [h('span', { class: 'badge', text: ctx.evidence_label }), ' ', ctx.generic_badge ? h('span', { class: 'badge', text: ctx.generic_badge }) : null]))),
    h('section', { class: 'why' },
      h('h2', { text: 'この人生が選ばれたわけ' }),
      h('ul', { class: 'hist' },
        h('li', { text: `出生年：${win.from}〜${win.to}年から、どの年も同じ確率（1/${win.count}）で抽選されました。` }),
        h('li', { text: '地域：8つの広域地域から均等に抽選されました。これはゲーム用の重みで、当時の人口の比率ではありません。' }),
        h('li', { text: o.kind === 'deep_dive' ? `場所：この地域・年代には詳しく作り込んだ出生舞台があり、${o.place_label}が選ばれました。` : '場所：この地域・年代には作り込んだ舞台がないため、地域と居住形態にもとづくゲーム用推定の舞台を使います。実在の都市名や慣習は使いません。' }),
        h('li', { text: '世帯と暮らし向き：仮の抽選です。史実の人口比ではありません。' }),
        h('li', { text: '同じシードと同じ選択で、同じ人生を再現できます。' }))),
    h('div', { class: 'stack' }, h('button', { class: 'btn primary big', onclick: () => beginLife() }, 'この人生を歩む'),
      h('button', { class: 'btn ghost', onclick: showTitle }, 'タイトルに戻る')));
  root.replaceChildren(main); window.scrollTo(0, 0);
}

function beginLife() { save('auto'); showLife(); }

// ------------------------------------------------------------------------------------------------ life screen
let el = {};
function showLife() {
  S.screen = 'life'; S.panel = null;
  const life = S.life;
  if (life.dead) { showReview(); return; }
  el = {};
  el.play = h('button', { class: 'btn play', onclick: togglePlay });
  el.speedBtn = h('button', { class: 'btn speed', 'aria-label': '速度', onclick: cycleSpeed });
  el.date = h('div', { class: 'date' }, el.dateB = h('b'), el.dateS = h('small'));
  el.months = h('div', { class: 'months', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i')));
  el.tick = h('i'); el.tickbar = h('div', { class: 'tickbar', 'aria-hidden': 'true' }, el.tick);
  el.who = h('span', { class: 'who' }); el.stage = h('span', { class: 'tag' });
  el.type = h('button', { class: 'tag', onclick: () => openPanel('self'), title: '性格の傾向を見る' });
  el.where = h('p', { class: 'where' });
  el.stats = h('div'); el.line = h('p', { class: 'lifeline', 'aria-live': 'polite' });
  el.focus = h('div', { class: 'chips', role: 'group', 'aria-label': '今年の重点' }, Object.entries(FOCUS_LABELS).map(([k, t]) => h('button', { class: 'chip', 'data-f': k, onclick: () => { setFocus(S.life, k); save('auto'); refresh(); } }, t)));
  el.canvas = h('canvas', { class: 'scene', width: 240, height: 80, role: 'img', 'aria-label': '現在の暮らしの風景（ゲーム用の簡略化）' });
  el.cap = h('div', { class: 'sceneinfo' }, el.capL = h('span'), h('span', { text: '背景はゲーム用の推定・簡略化' }));
  el.feed = h('ol', { class: 'feed', 'aria-live': 'polite' });
  el.banner = h('div', { class: 'banner-slot' });
  el.next = h('button', { class: 'btn', onclick: runToDecision, text: '次の決断まで進む' });
  el.autoSmall = h('label', { class: 'sw' }, h('input', { type: 'checkbox', onchange: (e) => { setAuto(S.life, { small: e.target.checked }); save('auto'); } }), h('span', { text: '日常の選択をおまかせ' }));
  el.autoMajor = h('label', { class: 'sw' }, h('input', { type: 'checkbox', onchange: (e) => { setAuto(S.life, { major: e.target.checked }); save('auto'); } }), h('span', { text: '大きな決断もおまかせ' }));
  el.sheet = h('div', { class: 'sheet-host' });
  const tabs = [['life', '生活'], ['people', '人物'], ['living', '暮らし'], ['journal', '記録'], ['menu', 'メニュー']];
  const nav = h('nav', { class: 'nav', 'aria-label': '画面の切り替え' }, h('div', null, tabs.map(([k, t]) => h('button', { 'data-k': k, onclick: () => (k === 'life' ? closePanel() : openPanel(k)) }, t))));
  const main = h('main', { class: 'life' },
    h('header', { class: 'topbar' }, h('div', { class: 'row' }, el.play, el.speedBtn, el.date), el.months, el.tickbar),
    h('div', { class: 'screen-life' },
      h('section', { class: 'card' }, h('div', { class: 'who-row' }, el.who, el.stage, el.type), el.where, el.stats, el.line,
        h('div', { class: 'policy' }, h('label', { text: '今年の重点' }), el.focus)),
      h('div', { class: 'scene-wrap' }, el.canvas, el.cap),
      el.banner,
      h('section', { class: 'card recent' }, h('h2', { text: '最近の出来事' }), el.feed),
      h('section', { class: 'card' }, h('h2', { text: '進め方' }), el.next, h('div', { class: 'sw-row' }, el.autoSmall, el.autoMajor))),
    el.sheet);
  root.replaceChildren(main, nav);
  refresh(); startScene();
  if (life.pending_decision) { showBannerForPending(); openDecision(); }
}

const STAGES = [[6, '乳幼児期'], [13, '児童期'], [18, '少年少女期'], [30, '青年期'], [45, '壮年期'], [65, '中年期'], [200, '高齢期']];
function refresh() {
  const life = S.life; if (!life || S.screen !== 'life') return;
  const ctx = currentContext(life, S.D), age = ageOf(life.clock.index), q = quarterOf(life.clock);
  el.dateB.textContent = `${yearOf(life.clock)}年${['春', '夏', '秋', '冬'][q]}`;
  el.dateS.textContent = `経過 ${age}年（四半期ごとに進行）`;
  [...el.months.children].forEach((i, k) => i.classList.toggle('on', k <= q));
  el.who.textContent = life.protagonist.name;
  el.stage.textContent = `${age}歳・${STAGES.find(([a]) => age < a)[1]}`;
  const pv = personalityView(life, S.D);
  el.type.textContent = `気質 ${pv.ready ? pv.typeName : '形成中'}`;
  el.where.textContent = `${ctx.region_label}・${ctx.place_label}${ctx.generic_badge ? '（ゲーム用推定）' : ''}`;
  el.stats.replaceChildren(V.statGrid(life));
  el.line.textContent = V.lifeLine(life, ctx);
  for (const b of el.focus.children) b.setAttribute('aria-pressed', String(b.dataset.f === life.settings.focus));
  el.autoSmall.firstChild.checked = !!life.settings.auto_small; el.autoMajor.firstChild.checked = !!life.settings.auto_major;
  el.capL.textContent = `${['春', '夏', '秋', '冬'][q]}の景色`;
  const ex = life.settings.expression;
  const recent = life.history.slice(-6).reverse();
  if (!recent.length) el.feed.replaceChildren(h('li', null, h('span', { class: 'f-age' }), h('span', { class: 'muted', text: 'まだ出来事はありません。再生を押すと、最初の四半期が始まります。' })));
  else el.feed.replaceChildren(...recent.map((e) => h('li', { class: 'type-' + e.type }, h('span', { class: 'f-age', text: `${e.age}歳` }), h('span', { text: entryText(e, ex) }))));
  renderControls(); drawNow();
}

function renderControls() {
  if (!el.play) return;
  const dead = !!S.life.dead, awaiting = !!S.life.pending_decision;
  el.play.textContent = S.playing ? '■ 一時停止' : '▶ 再生'; el.play.setAttribute('aria-pressed', String(S.playing));
  el.play.disabled = dead || awaiting;
  el.next.disabled = dead || awaiting;
  el.speedBtn.textContent = `×${S.speed}`;
  const run = S.playing && !S.panel;
  el.tick.classList.remove('run');
  if (run) { void el.tick.offsetWidth; el.tick.style.setProperty('--dur', (S.fast ? 60 : QUARTER_MS / S.speed) + 'ms'); el.tick.classList.add('run'); }
  for (const b of document.querySelectorAll('.nav button')) b.classList.toggle('on', S.panel ? b.dataset.k === navKey(S.panel.kind) : b.dataset.k === 'life');
}
const navKey = (k) => ({ person: 'people', self: 'menu', data: 'menu', saves: 'menu', settings: 'menu', decision: 'life' })[k] || k;
function cycleSpeed() { S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length]; S.store.setPref('speed', S.speed); renderControls(); restartTimer(); }

function showBannerForPending() {
  el.banner.replaceChildren(S.life.pending_decision ? h('button', { class: 'banner', onclick: openDecision }, h('strong', { text: S.life.pending_decision.title }), h('span', { text: '決断が待っています。タップして開く' })) : '');
}

// ------------------------------------------------------------------------------------------------ scene
function sceneView(bubble) {
  const life = S.life, ctx = currentContext(life, S.D), age = ageOf(life.clock.index);
  const people = Object.values(life.persons).filter((p) => p.household_id === life.protagonist.household_id && p.alive).map((p) => ({ age: personAgeNow(p), alive: p.alive }));
  return { seed: life.origin.rng_seed & 0xffff, season: quarterOf(life.clock), age, settlement: ctx.settlement_profile, style: ctx.scene_style, people, night: false, playing: S.playing && !S.panel, reduced: !motionOK(), bubble };
}
function personAgeNow(p) { return Math.floor((S.life.clock.index - p.born_idx) / 4); }
function drawNow() { if (el.canvas && S.life && S.screen === 'life') drawScene(el.canvas, sceneView(), S.sceneT); }
function startScene() {
  cancelAnimationFrame(S.raf);
  const loop = (ts) => {
    if (S.screen !== 'life') return;
    if (S.playing && motionOK() && !document.hidden) { S.sceneT = ts / 1000; drawNow(); }
    S.raf = requestAnimationFrame(loop);
  };
  S.raf = requestAnimationFrame(loop);
  window.addEventListener('resize', drawNow);
}

// ------------------------------------------------------------------------------------------------ play loop
function togglePlay() { S.playing ? pause() : play(); }
function play() {
  if (!S.life || S.life.dead || S.life.pending_decision || S.panel) return;
  S.playing = true; S.fast = 0; renderControls(); restartTimer();
}
function pause() { S.playing = false; S.fast = 0; clearTimeout(S.timer); S.timer = null; if (S.screen === 'life') renderControls(); }
function stopLoop() { pause(); cancelAnimationFrame(S.raf); window.removeEventListener('resize', drawNow); }
function restartTimer() { clearTimeout(S.timer); if (S.playing) S.timer = setTimeout(tick, S.fast ? 60 : QUARTER_MS / S.speed); }

function runToDecision() {
  if (S.life.pending_decision || S.life.dead) return;
  S.fast = 48; S.playing = true; renderControls(); restartTimer();
}

function tick() {
  S.timer = null;
  if (!S.playing || !S.life || S.panel) return;
  const r = advance(S.life, S.D);
  if (S.fast) { S.fast -= 1; if (S.fast <= 0) { S.playing = false; S.fast = 0; } }
  afterAdvance(r);
  if (S.playing && !S.life.pending_decision && !S.life.dead) restartTimer();
}

function afterAdvance(r) {
  if (r.status === 'awaiting') { S.resume = S.playing || S.resume; S.playing = false; S.fast = 0; save('auto'); refresh(); showBannerForPending(); openDecision(); return; }
  if (r.status === 'dead') { S.playing = false; onDeath(); return; }
  save('auto'); refresh();
}

function onDeath() {
  save('auto');
  const review = buildReview(S.life, S.D);
  S.store.pastAdd(S.life, review);
  setTimeout(showReview, S.reduced ? 0 : 1200);
  refresh();
}

// ------------------------------------------------------------------------------------------------ decisions
function openDecision() {
  const life = S.life, d = life.pending_decision; if (!d) return;
  S.panel = { kind: 'decision' }; renderSheet();
}
function choose(choiceId) {
  const life = S.life, d = life.pending_decision; if (!d) return;
  answer(life, S.D, d.id, choiceId);
  decisionDone();
}
function chooseAuto() { if (!S.life.pending_decision) return; answerAuto(S.life, S.D); decisionDone(); }
function decisionDone() {
  S.panel = null; el.banner.replaceChildren(); renderSheet(); save('auto'); refresh();
  announce('回答しました。');
  if (S.resume) { S.resume = false; play(); }
}

// ------------------------------------------------------------------------------------------------ panels (bottom sheets)
function openPanel(kind, extra) {
  if (S.life.pending_decision && kind !== 'decision') { /* the decision stays pending; information panels are still readable */ }
  S.panelResume = S.playing || S.panelResume; pause();
  S.panel = { kind, ...extra }; renderSheet();
}
function closePanel() {
  const wasDecision = S.panel?.kind === 'decision';
  S.panel = null; renderSheet();
  if (!wasDecision && S.panelResume && !S.life.pending_decision) { S.panelResume = false; play(); } else S.panelResume = false;
}

function renderSheet() {
  if (!el.sheet) return;
  clear(el.sheet);
  document.body.classList.toggle('sheet-open', !!S.panel);
  if (!S.panel) { renderControls(); return; }
  const life = S.life, D = S.D, ctx = currentContext(life, D), k = S.panel.kind;
  let body, title;
  const rerender = () => renderSheet();
  switch (k) {
    case 'decision': {
      const d = life.pending_decision;
      title = d.kind === 'major' ? '人生の決断' : '今期の選択';
      body = V.decisionView(life, D, d, ctx, { choose, auto: chooseAuto, later: () => closePanel(), scene: () => decisionScene(d) });
      break;
    }
    case 'self': title = '自分'; body = V.selfPanel(life, D, ctx); break;
    case 'people': title = '人物・相関図'; body = V.peoplePanel(life, D, (id) => openPanel('person', { id })); break;
    case 'person': title = '人物'; body = h('div', null, h('button', { class: 'btn ghost', onclick: () => openPanel('people') }, '← 人物一覧'), V.personSheet(life, D, S.panel.id)); break;
    case 'living': title = '暮らし・家計'; body = V.livingPanel(life, D, ctx); break;
    case 'journal': title = '人生の記録'; body = V.journalPanel(life, D, S.journal, rerender); break;
    case 'data': title = '時代・データ・出典'; body = V.dataPanel(life, D, ctx); break;
    case 'saves': title = '保存・読み込み'; body = savesPanel(); break;
    case 'settings': title = '設定'; body = settingsPanel(); break;
    case 'menu': title = 'メニュー'; body = menuPanel(); break;
    default: title = ''; body = h('div');
  }
  const closeBtn = h('button', { class: 'close', 'aria-label': '閉じる', onclick: closePanel }, '×');
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', { text: title }), closeBtn), h('div', { class: 'sheet-body' }, body));
  el.sheet.append(h('div', { class: 'scrim', onclick: closePanel }), sheet);
  closeBtn.focus({ preventScroll: true });
  sheet.addEventListener('keydown', trapFocus);
  renderControls();
  if (k === 'decision') typewriter(sheet.querySelector('.dec-text'));
}
function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const f = [...e.currentTarget.querySelectorAll('button,a[href],input,select,summary,[tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function decisionScene(d) {
  const cv = h('canvas', { class: 'dec-scene', width: 198, height: 100, 'aria-hidden': 'true' });
  const t = d.target && S.life.persons[d.target.person_id];
  queueMicrotask(() => drawScene(cv, sceneView(t ? t.name.slice(0, 6) : null), 0));
  return cv;
}
function typewriter(node) {
  if (!node || !motionOK()) return;
  const full = node.dataset.full; node.textContent = ''; let i = 0;
  const id = setInterval(() => { i += 1; node.textContent = full.slice(0, i); if (i >= full.length || !node.isConnected) clearInterval(id); }, 28);
  node.addEventListener('click', () => { clearInterval(id); node.textContent = full; }, { once: true });
}

function menuPanel() {
  return h('div', { class: 'panel-body menu' },
    h('button', { class: 'btn big', onclick: () => openPanel('self') }, '自分（能力と性格の傾向）'),
    h('button', { class: 'btn big', onclick: () => openPanel('data') }, '時代・データ・出典'),
    h('button', { class: 'btn big', onclick: () => openPanel('saves') }, '保存・読み込み'),
    h('button', { class: 'btn big', onclick: () => openPanel('settings') }, '設定'),
    h('button', { class: 'btn big', onclick: () => { if (confirm('現在の人生を復元用に残して、新しい人生を始めます。よろしいですか？')) { S.panel = null; startNew(null); } } }, '新しい人生を始める'),
    h('button', { class: 'btn ghost', onclick: () => { save('auto'); S.panel = null; showTitle(); } }, 'タイトルへ戻る（自動保存されます）'));
}

function settingsPanel() {
  const life = S.life, st = S.store;
  const wrap = h('div', { class: 'panel-body' });
  const seg = (name, opts, cur, fn) => h('div', { class: 'seg', role: 'group', 'aria-label': name }, opts.map(([v, t]) => h('button', { class: cur === v ? 'on' : '', 'aria-pressed': String(cur === v), onclick: () => { fn(v); renderSheet(); } }, t)));
  wrap.append(h('h4', { text: '重い出来事の表現' }), seg('表現', [['standard', '標準'], ['brief', '簡潔']], life.settings.expression, (v) => { life.settings.expression = v; st.setPref('expression', v); save('auto'); refresh(); }));
  wrap.append(h('p', { class: 'note', text: '病気・死別・暴力などの描写の詳しさです。簡潔にすると、結果だけを短く伝えます。' }));
  wrap.append(h('h4', { text: '文字の大きさ' }), seg('文字', [[0.9, '小'], [1, '標準'], [1.15, '大'], [1.3, '特大']], st.getPref('fontScale', 1), (v) => { st.setPref('fontScale', v); applyPrefs(); }));
  wrap.append(h('h4', { text: '動きを減らす' }), seg('動き', [[false, '通常'], [true, '減らす']], st.getPref('reduceMotion', S.reduced), (v) => { st.setPref('reduceMotion', v); applyPrefs(); }));
  wrap.append(h('h4', { text: '年間の重点' }), seg('重点', Object.entries(FOCUS_LABELS), life.settings.focus, (v) => { setFocus(life, v); save('auto'); refresh(); }));
  wrap.append(h('p', { class: 'note', text: '重点は、日常の選択の出やすさとおまかせの判断の目安になります。' }));
  return wrap;
}

// ------------------------------------------------------------------------------------------------ saving
function save(slot) {
  const r = S.store.save(slot, S.life);
  if (!r.ok && S.lastSaveOk) announce(r.error, true);
  S.lastSaveOk = r.ok;
  return r;
}
let liveEl;
function announce(msg, warn = false) {
  if (!liveEl) { liveEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(liveEl); }
  liveEl.textContent = msg; liveEl.classList.toggle('warn', warn); liveEl.classList.add('show');
  clearTimeout(liveEl._t); liveEl._t = setTimeout(() => liveEl.classList.remove('show'), warn ? 7000 : 2200);
}

function savesPanel() {
  const wrap = h('div', { class: 'panel-body' });
  wrap.append(h('p', { class: 'note', text: '自動保存は、四半期の処理が終わるたびと、決断に答えたときに行われます。手動保存は自動保存で上書きされません。' }));
  const list = h('ul', { class: 'slots' });
  for (const slot of SLOT_IDS) {
    const info = S.store.slots.info(slot);
    const row = h('li', { class: 'slot' }, h('div', null, h('strong', { text: SLOT_LABELS[slot] }), h('p', { class: 'muted', text: info ? (info.broken ? '読み込めない保存データです' : `${info.name}・${info.age}歳・${info.year}年${info.dead ? '・終了' : ''}`) : '空き' })),
      h('div', { class: 'row' },
        slot.startsWith('manual') ? h('button', { class: 'btn', onclick: () => { const r = save(slot); announce(r.ok ? '保存しました。' : r.error, !r.ok); renderSheet(); }, text: '保存' }) : null,
        info && !info.broken ? h('button', { class: 'btn', onclick: () => loadSlot(slot), text: '読み込む' }) : null,
        info && slot.startsWith('manual') ? h('button', { class: 'btn ghost', onclick: () => { S.store.slots.remove(slot); renderSheet(); }, text: '削除' }) : null));
    list.append(row);
  }
  wrap.append(list);
  wrap.append(h('h4', { text: 'バックアップ' }), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: exportJson, text: 'JSONを書き出す' }), h('button', { class: 'btn', onclick: openImport, text: 'JSONを読み込む' })));
  wrap.append(h('p', { class: 'note', text: '読み込む前に、いまの人生は「復元用」の枠に退避されます。不正なデータや対応していない版のファイルは受け付けず、いまの人生はそのまま残ります。' }));
  return wrap;
}

function exportJson() {
  const text = serialize(S.life, S.D), info = summaryOf(S.life);
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: `meguru-isshou_${info.name}_${info.year}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  announce('JSONを書き出しました。');
}

function openImport() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', onchange: async () => {
    const f = input.files[0]; if (!f) return;
    const r = hydrate(await f.text(), S.D);
    if (!r.ok) { announce('読み込めませんでした：' + r.error, true); return; }
    if (r.warnings.length && !confirm(r.warnings.join('\n') + '\n\nそれでも読み込みますか？')) return;
    adopt(r.life);
  } });
  input.click();
}

function loadSlot(slot) {
  const r = S.store.slots.load(slot);
  if (!r.ok) { announce('読み込めませんでした：' + r.error, true); return; }
  if (r.warnings.length && !confirm(r.warnings.join('\n') + '\n\nそれでも読み込みますか？')) return;
  adopt(r.life);
}
function openPast(id) { const r = S.store.pastLoad(id); if (!r.ok) { announce(r.error, true); return; } adopt(r.life); }

function adopt(life) {
  if (S.life && !S.life.dead && S.life.id !== life.id) S.store.stash(S.life);
  stopLoop(); S.life = life; S.panel = null; S.resume = false; S.panelResume = false;
  if (life.dead) showReview(); else showLife();
}

function openSettingsTitle() {
  // A throwaway settings view before a life exists: only display preferences apply.
  const st = S.store, wrap = h('div', { class: 'panel-body' });
  const seg = (name, opts, cur, fn) => h('div', { class: 'seg', role: 'group', 'aria-label': name }, opts.map(([v, t]) => h('button', { class: cur === v ? 'on' : '', 'aria-pressed': String(cur === v), onclick: () => { fn(v); openSettingsTitle(); } }, t)));
  wrap.append(h('h4', { text: '重い出来事の表現（新しい人生から）' }), seg('表現', [['standard', '標準'], ['brief', '簡潔']], st.getPref('expression', 'standard'), (v) => st.setPref('expression', v)));
  wrap.append(h('h4', { text: '文字の大きさ' }), seg('文字', [[0.9, '小'], [1, '標準'], [1.15, '大'], [1.3, '特大']], st.getPref('fontScale', 1), (v) => { st.setPref('fontScale', v); applyPrefs(); }));
  wrap.append(h('h4', { text: '動きを減らす' }), seg('動き', [[false, '通常'], [true, '減らす']], st.getPref('reduceMotion', S.reduced), (v) => { st.setPref('reduceMotion', v); applyPrefs(); }));
  standalone('表示設定', wrap);
}
function openDataOnly() {
  const D = S.D, m = D.modernMort.meta, wrap = h('div', { class: 'panel-body' },
    h('h4', { text: '出典とライセンス' }),
    h('ul', { class: 'hist' }, h('li', { text: m.source }), h('li', { text: 'ライセンス：' + m.license }), h('li', { text: m.scope_note }),
      h('li', { text: '歴史側の死亡・機会・境遇の数値は、低・中央・高の幅を持つゲーム用推定です。史実の測定値ではありません。' }),
      h('li', { text: '出来事・選択肢・人物は本作のために書き下ろした創作です。実在の人物や出来事の記録ではありません。' }),
      h('li', { text: '参考にした外部のゲームがある場合も、素材や文章は使っていません（構成と操作感のみを参考にしています）。' })),
    h('p', { class: 'note', text: `ルール版 ${D.versions.rules_version}／データ版 ${D.versions.data_version}` }));
  standalone('出典・ライセンス', wrap);
}
function standalone(title, body) {
  S.screen = 'title'; stopLoop();
  root.replaceChildren(h('main', { class: 'screen' }, h('button', { class: 'btn ghost', onclick: showTitle }, '← タイトルへ'), h('h1', { text: title }), body));
}

// ------------------------------------------------------------------------------------------------ review
function showReview() {
  stopLoop(); S.screen = 'review'; S.panel = null;
  const life = S.life, D = S.D, R = buildReview(life, D);
  const lifeSpan = `${R.birth_year}年〜${R.death_year}年・${R.age}歳`;
  const chart = reviewChart(R);
  const main = h('main', { class: 'screen review' },
    h('header', null, h('p', { class: 'note', text: '人生の振り返り' }), h('h1', { text: R.title }), h('p', { class: 'lead', text: `${lifeSpan}・${R.where}` }),
      h('p', { text: `最期の表現：${R.cause || '—'}`, class: 'muted' }), h('p', { class: 'note', text: `死亡の判定に使った表：${R.mortality_source}` })),
    h('section', null, h('h2', { text: '暮らしの移り変わり' }), chart,
      h('dl', { class: 'kvs' }, ...[['健康', R.stats.health], ['学び', R.stats.learning], ['魅力', R.stats.charm], ['暮らし向き', R.stats.resources], ['幸福感', R.stats.happiness]].map(([k, s]) => h('div', { class: 'kv' }, h('dt', { text: k }), h('dd', { text: `最高は${s.peak.age}歳ごろ（${s.peak.v >= 80 ? '非常に高い' : s.peak.v >= 60 ? '高い' : s.peak.v >= 40 ? '中程度' : '低い'}）、最後は${s.band}` }))))),
    h('section', null, h('h2', { text: '主な出来事' }), R.timeline.length ? h('ol', { class: 'journal' }, R.timeline.map((e) => h('li', { class: 'je' }, h('span', { class: 'je-icon', text: e.icon }), h('div', null, h('p', { class: 'deltas', text: `${e.year}年・${e.age}歳` }), h('p', { text: entryText(e, life.settings.expression) }))))) : h('p', { class: 'muted', text: '大きな出来事は記録されませんでした。' })),
    h('section', null, h('h2', { text: '身についたこと・歩んだ道' }),
      h('div', { class: 'chips' }, R.skills.filter((s) => s.value > 0).map((s) => h('span', { class: 'chip', text: `${s.label} ${s.value >= 60 ? '高い' : s.value >= 30 ? '中程度' : '芽生え'}` }))),
      h('dl', { class: 'kvs' }, h('div', { class: 'kv' }, h('dt', { text: '学び' }), h('dd', { text: ({ completed: '課程を終えた', enrolled: '学びの途中だった', withdrawn: '途中でやめた', interrupted: '途中でやめた' })[R.education?.status] || '学びの場には通わなかった' })),
        h('div', { class: 'kv' }, h('dt', { text: '仕事' }), h('dd', { text: R.work ? `${R.work.label}` : '特定の仕事には就かなかった' })))),
    h('section', null, h('h2', { text: '人との関わり' }), h('ul', { class: 'people' }, R.people.slice(0, 10).map((x) => h('li', { class: 'plain' }, h('strong', { text: x.name }), `　${x.label}・親密さ${Math.round(x.closeness ?? 0)}・信頼${Math.round(x.trust ?? 0)}${x.alive ? '' : '・亡くなった'}`)))),
    h('section', null, h('h2', { text: '性格の傾向' }),
      R.personality.ready ? h('p', { class: 'type-name', text: R.personality.typeName }) : h('p', { class: 'muted', text: '傾向を言い切れるほどの選択は積み上がりませんでした。' }),
      ...R.personality.axes.map((a) => h('div', { class: 'axis' }, h('div', { class: 'axis-head' }, h('span', { text: a.left.word }), h('strong', { text: a.name }), h('span', { text: a.right.word })),
        h('div', { class: 'axis-track', role: 'img', 'aria-label': `${a.name}：${a.settled ? (a.side === 'balanced' ? '均衡' : a.side === 'left' ? a.left.word : a.right.word) : '未定'}` }, h('span', { class: 'axis-mid' }), h('span', { class: 'axis-dot' + (a.settled ? '' : ' faint'), style: { left: Math.max(2, Math.min(98, a.value)) + '%' } })),
        a.examples.length ? h('p', { class: 'axis-why', text: '例：' + a.examples.map((e) => e.text).join(' ／ ') }) : null)),
      h('p', { class: 'note', text: `選択の内訳：全${R.choices.total}回のうち、おまかせ${R.choices.auto}回。` })),
    h('section', null, h('h2', { text: '生きた時代と場所' }), h('ul', { class: 'hist' }, R.places.slice(-10).map((c) => h('li', { text: `${c.year}年〜：${c.label}（${EVIDENCE_LABELS[c.tier] || c.tier}）` })))),
    h('section', { class: 'why' }, h('h2', { text: 'この人生のデータについて' }),
      h('p', { text: R.footer }), h('p', { class: 'note', text: `出生年は${R.origin_note.year_window.from}〜${R.origin_note.year_window.to}年から等確率、地域は8地域を均等に抽選。世帯：${R.origin_note.household}。参照した資料の区分：${R.evidence_labels.join('、')}。` })),
    h('div', { class: 'stack' }, h('button', { class: 'btn primary big', onclick: () => startNew(null) }, '新しい人生を始める'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: exportJson }, 'この人生をJSONで書き出す'), h('button', { class: 'btn ghost', onclick: showTitle }, 'タイトルへ'))));
  root.replaceChildren(main); window.scrollTo(0, 0);
}

function reviewChart(R) {
  const W = 320, H = 120, pts = R.series, n = pts.length;
  if (n < 2) return h('p', { class: 'muted', text: '記録が短いため、推移は表示しません。' });
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a || {})) e.setAttribute(k, v); return e; };
  const s = mk('svg', { viewBox: `0 0 ${W} ${H + 18}`, class: 'chart', role: 'img', 'aria-label': `健康・学び・暮らし向き・幸福感の推移。0歳から${R.age}歳まで。` });
  const lines = [['健康', 1, 'c1'], ['学び', 2, 'c2'], ['暮らし向き', 4, 'c3'], ['幸福感', 5, 'c4']];
  for (const [, i, cls] of lines) {
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${((k / (n - 1)) * W).toFixed(1)},${(H - (p[i] / 100) * H).toFixed(1)}`).join('');
    s.append(mk('path', { d, class: 'line ' + cls, fill: 'none' }));
  }
  const wrap = h('figure', { class: 'chartfig' }, s, h('figcaption', { class: 'legend' }, lines.map(([t, , cls]) => h('span', { class: 'lg ' + cls, text: t }))));
  return wrap;
}

boot();
