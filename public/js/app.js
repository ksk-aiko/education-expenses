import { solvePlan, yearlySummary, ymLabel, parseYM } from './calc.js';
import { defaultState, applyLevel, buildStages, HIGH_PRESETS, UNIV_PRESETS, JUNIOR_PRESET, LEVELS } from './presets.js';

const STORAGE_KEY = 'education-planner:v1';
const form = document.getElementById('form');
const out = document.getElementById('result');

let state = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.junior && saved.high && saved.univ) return merge(defaultState(), saved);
  } catch { /* 保存データなし・破損は初期値で続行 */ }
  return defaultState();
}
function merge(base, src) {
  for (const k of Object.keys(base)) {
    if (!(k in src)) continue;
    if (base[k] && typeof base[k] === 'object') merge(base[k], src[k]);
    else base[k] = src[k];
  }
  return base;
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 保存不可でも動作 */ }
}

const getPath = (o, p) => p.split('.').reduce((a, k) => a[k], o);
function setPath(o, p, v) {
  const keys = p.split('.');
  const last = keys.pop();
  keys.reduce((a, k) => a[k], o)[last] = v;
}

function syncForm() {
  form.querySelectorAll('[data-path]').forEach((el) => {
    const v = getPath(state, el.dataset.path);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  });
  const hasHigh = state.high.type !== 'none';
  document.getElementById('highItems').hidden = !hasHigh;
  document.getElementById('univItems').hidden = state.univ.type === 'none';
  document.getElementById('juniorItems').hidden = !state.junior.on;
}

function readValue(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number') return el.value === '' ? (el.dataset.path === 'deposit' ? '' : 0) : Number(el.value);
  return el.value;
}

form.addEventListener('input', (e) => {
  const el = e.target.closest('[data-path]');
  if (!el) return;
  const path = el.dataset.path;
  setPath(state, path, readValue(el));
  if (path === 'level') applyLevel(state, state.level);
  if (path === 'high.type' && HIGH_PRESETS[state.high.type]) {
    const hp = HIGH_PRESETS[state.high.type];
    const f = LEVELS[state.level];
    for (const k of ['school', 'soccer', 'juku']) state.high[k].amount = Math.round(hp[k] * f * 2) / 2;
  }
  if (path === 'univ.type' && UNIV_PRESETS[state.univ.type]) {
    state.univ.amount = Math.round(UNIV_PRESETS[state.univ.type].total * LEVELS[state.level] * 2) / 2;
  }
  if (['level', 'high.type', 'univ.type', 'junior.on'].includes(path)) syncForm();
  save();
  render();
});

document.getElementById('reset').addEventListener('click', () => {
  state = defaultState();
  save();
  syncForm();
  render();
});

const yen = (v) => `${Math.round(v).toLocaleString('ja-JP')}円`;
const man = (v) => {
  const m = v / 10000;
  return `${(Math.abs(m) >= 100 ? Math.round(m) : Math.round(m * 10) / 10).toLocaleString('ja-JP')}万円`;
};

function render() {
  const stages = buildStages(state);
  const share = Math.min(Math.max(Number(state.share) || 0, 0), 100) / 100;
  const depositInput = state.deposit === '' || state.deposit == null ? null : Number(state.deposit);
  const plan = solvePlan({
    stages,
    startYM: state.startYM,
    share,
    household: Number(state.household) || 0,
    savings: (Number(state.savings) || 0) * 10000,
    deposit: depositInput,
  });

  if (!plan.n) {
    out.innerHTML = '<div class="box empty">費用項目が選ばれていません。左のフォームで項目を選んでください。</div>';
    return;
  }

  const years = yearlySummary(plan);
  const stageIds = stages.filter((s) => s.items.length).map((s) => s.id);
  const stageLabel = Object.fromEntries(stages.map((s) => [s.id, s.label]));

  const alerts = [];
  if (plan.firstShortage != null) {
    alerts.push(`<div class="box ng"><h3>資金が不足します</h3>この月額積立では ${ymLabel(plan.firstShortage)} に貯蓄が不足します（最低残高 ${man(plan.minBalance)}）。月額を増やすか、空欄にして自動計算をご利用ください。</div>`);
  } else if (depositInput != null && depositInput < plan.autoDeposit) {
    alerts.push('<div class="box warn">この月額積立は最小必要額を下回っていますが、期間中は不足しません。</div>');
  }
  if (share < 1) alerts.push(`<div class="box warn">負担割合 ${Math.round(share * 100)}% を適用した、あなたの負担分で計算しています。</div>`);
  const startY = parseYM(state.startYM);
  if (stages.some((s) => s.items.length && parseYM(s.startYM) + s.months - 1 < startY)) {
    alerts.push('<div class="box warn">計画開始月より前に終わっている段階があります。その費用は計算に含めていません。</div>');
  }

  const stageRows = stages.filter((s) => s.items.length).map((s) => {
    const total = s.items.reduce((a, i) => a + i.amount, 0);
    const lump = Math.min(s.lump, total);
    const sIdx = parseYM(s.startYM);
    const before = plan.rows.find((r) => r.idx === sIdx - 1);
    const items = s.items.map((i) => `${i.label} ${man(i.amount)}`).join('、');
    return `<tr><td>${s.label}<br><small>${items}</small></td><td>${ymLabel(sIdx)}〜${ymLabel(sIdx + s.months - 1)}</td><td>${man(total * share)}</td><td>${man(lump * share)}</td><td>${before ? man(before.balance) : '—'}</td></tr>`;
  }).join('');

  const yearRows = years.map((y) => `<tr><td>${y.fy}年度${y.months < 12 ? `<br><small>${y.months}か月分</small>` : ''}</td>${stageIds.map((id) => `<td>${y.byStage[id] ? man(y.byStage[id] * share) : '—'}</td>`).join('')}<td>${man(y.cost)}</td><td>${man(y.shortfall)}</td><td>${man(y.balance)}</td></tr>`).join('');
  const sumStage = (id) => plan.rows.reduce((a, r) => a + (r.byStage[id] || 0), 0) * share;

  out.innerHTML = `
    ${alerts.join('')}
    <div class="cards">
      <div class="card key"><div class="label">${depositInput == null ? '必要な月額積立（自動計算）' : '設定した月額積立'}</div><div class="num">${yen(plan.used)}</div><small>${ymLabel(plan.rows[0].idx)}〜${ymLabel(plan.rows[plan.n - 1].idx)}（${plan.n}か月）</small></div>
      <div class="card"><div class="label">費用総額（あなたの負担）</div><div class="num">${man(plan.totalCost)}</div><small>家計から ${man(plan.fromHousehold)}／貯蓄から ${man(plan.fromSavings)}</small></div>
      <div class="card"><div class="label">均等割りの目安</div><div class="num">${yen(plan.evenSplit)}</div><small>（貯蓄からの支出 − 現在の貯蓄）÷ 期間。前払い分を考慮しない単純計算</small></div>
      <div class="card"><div class="label">最低残高</div><div class="num">${man(plan.minBalance)}</div><small>期間終了時の残高 ${man(plan.finalBalance)}</small></div>
    </div>

    <div class="box">
      <h3>貯蓄残高の推移</h3>
      ${chart(plan)}
      <div class="legend"><span><i class="sw-bal"></i>貯蓄残高</span><span><i class="sw-cost"></i>費用の累計</span></div>
    </div>

    <h2>段階別</h2>
    <div class="scroller"><table><thead><tr><th>段階</th><th>期間</th><th>総額</th><th>入学時一時金</th><th>開始前月の貯蓄残高</th></tr></thead><tbody>${stageRows}</tbody></table></div>

    <h2>年度別</h2>
    <div class="scroller"><table><thead><tr><th>年度</th>${stageIds.map((id) => `<th>${stageLabel[id]}</th>`).join('')}<th>費用合計</th><th>貯蓄から支出</th><th>年度末残高</th></tr></thead><tbody>${yearRows}
      <tr class="total"><td>合計</td>${stageIds.map((id) => `<td>${man(sumStage(id))}</td>`).join('')}<td>${man(plan.totalCost)}</td><td>${man(plan.fromSavings)}</td><td></td></tr></tbody></table></div>
`;
}

function chart(plan) {
  const W = 720, H = 260, L = 56, R = 12, T = 12, B = 30;
  const rows = plan.rows;
  const xs = rows.map((r) => r.idx);
  const x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1;
  const ymax = Math.max(1, ...rows.map((r) => Math.max(r.balance, r.cumCost)));
  const ymin = Math.min(0, ...rows.map((r) => r.balance));
  const px = (i) => L + ((i - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const py = (v) => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  const line = (key) => rows.map((r) => `${px(r.idx).toFixed(1)},${py(r[key]).toFixed(1)}`).join(' ');

  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = ymin + ((ymax - ymin) * k) / 4;
    grid += `<line x1="${L}" x2="${W - R}" y1="${py(v)}" y2="${py(v)}" class="g"/><text class="t" x="${L - 6}" y="${py(v) + 4}" text-anchor="end" font-size="11">${Math.round(v / 10000).toLocaleString('ja-JP')}</text>`;
  }
  let ticks = '';
  for (let i = x0; i <= x1; i++) {
    if (i % 12 === 3) ticks += `<text class="t" x="${px(i)}" y="${H - 8}" text-anchor="middle" font-size="11">${Math.floor(i / 12)}/4</text>`;
  }
  const zero = ymin < 0 ? `<line x1="${L}" x2="${W - R}" y1="${py(0)}" y2="${py(0)}" class="z" stroke-dasharray="4 3"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="貯蓄残高と費用累計の推移（縦軸：万円）">
    ${grid}${zero}${ticks}
    <polyline points="${line('cumCost')}" class="s-cost" fill="none" stroke-width="2"/>
    <polyline points="${line('balance')}" class="s-bal" fill="none" stroke-width="2.5"/>
    <text class="t" x="4" y="10" font-size="11">万円</text></svg>`;
}

syncForm();
render();
