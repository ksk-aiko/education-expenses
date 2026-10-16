// 教育費貯蓄計画の計算ロジック（DOM非依存・金額は円）

export function parseYM(ym) {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
}

export function ymLabel(idx) {
  return `${Math.floor(idx / 12)}/${String((idx % 12) + 1).padStart(2, '0')}`;
}

// 年度（4月始まり）
export function fiscalYear(idx) {
  const y = Math.floor(idx / 12);
  return (idx % 12) >= 3 ? y : y - 1;
}

/**
 * stages: [{ id, label, startYM, months, lump, items: [{label, amount}] }]
 *   lump: 開始月に一括で支払う額（段階の合計を上限とする）。残りは months で均等割り。
 * 返り値: { startIdx, endIdx, months: [{idx, byStage:{id:円}, total}], stageTotals }
 */
export function buildTimeline(stages, startYM) {
  const startIdx = parseYM(startYM);
  const active = stages.filter((s) => s.items.length && s.months > 0);
  if (!active.length) return { startIdx, endIdx: startIdx - 1, months: [], stageTotals: {} };

  const endIdx = Math.max(...active.map((s) => parseYM(s.startYM) + s.months - 1));
  const months = [];
  for (let idx = startIdx; idx <= endIdx; idx++) months.push({ idx, byStage: {}, total: 0 });

  const stageTotals = {};
  for (const s of active) {
    const total = s.items.reduce((a, i) => a + i.amount, 0);
    const lump = Math.min(Math.max(s.lump || 0, 0), total);
    const monthly = (total - lump) / s.months;
    const sIdx = parseYM(s.startYM);
    stageTotals[s.id] = total;
    for (let k = 0; k < s.months; k++) {
      const idx = sIdx + k;
      if (idx < startIdx) continue; // 計画開始前の支出は対象外
      const amt = monthly + (k === 0 ? lump : 0);
      const row = months[idx - startIdx];
      row.byStage[s.id] = (row.byStage[s.id] || 0) + amt;
      row.total += amt;
    }
  }
  return { startIdx, endIdx, months, stageTotals };
}

/**
 * 計画を解く。
 *  share: あなたの負担割合(0-1)
 *  household: 家計から毎月払える教育費(円・負担割合適用後の額に対して)
 *  savings: 現在の専用貯蓄(円)
 *  deposit: 月額積立(円)。null なら残高が尽きない最小額を自動計算
 */
export function solvePlan({ stages, startYM, share = 1, household = 0, savings = 0, deposit = null }) {
  const tl = buildTimeline(stages, startYM);
  const n = tl.months.length;
  const rows = tl.months.map((m) => {
    const cost = m.total * share;
    const fromHousehold = Math.min(cost, household);
    return { idx: m.idx, byStage: m.byStage, cost, fromHousehold, shortfall: cost - fromHousehold };
  });

  // 月初に積立→当月の不足分を貯蓄から支払う。残高 S + x*t - D_t >= 0 を満たす最小の x
  let cum = 0;
  let required = 0;
  rows.forEach((r, i) => {
    cum += r.shortfall;
    required = Math.max(required, (cum - savings) / (i + 1));
  });
  const autoDeposit = Math.ceil(required / 100) * 100;
  const used = deposit == null ? autoDeposit : deposit;

  let bal = savings;
  let cumCost = 0;
  let firstShortage = null;
  let minBalance = savings;
  for (const r of rows) {
    bal += used - r.shortfall;
    cumCost += r.cost;
    r.balance = bal;
    r.cumCost = cumCost;
    if (bal < -0.5 && firstShortage == null) firstShortage = r.idx;
    minBalance = Math.min(minBalance, bal);
  }

  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return {
    tl, rows, n,
    totalCost: sum('cost'),
    fromHousehold: sum('fromHousehold'),
    fromSavings: sum('shortfall'),
    autoDeposit, used, firstShortage, minBalance,
    evenSplit: n ? Math.max(0, (sum('shortfall') - savings) / n) : 0,
    finalBalance: rows.length ? rows[rows.length - 1].balance : savings,
  };
}

/** 年度別集計 */
export function yearlySummary(plan) {
  const map = new Map();
  for (const r of plan.rows) {
    const fy = fiscalYear(r.idx);
    if (!map.has(fy)) map.set(fy, { fy, months: 0, byStage: {}, cost: 0, fromHousehold: 0, shortfall: 0, balance: 0 });
    const y = map.get(fy);
    y.months++;
    y.cost += r.cost;
    y.fromHousehold += r.fromHousehold;
    y.shortfall += r.shortfall;
    y.balance = r.balance;
    for (const [id, v] of Object.entries(r.byStage)) y.byStage[id] = (y.byStage[id] || 0) + v;
  }
  return [...map.values()];
}
