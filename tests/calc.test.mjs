import test from 'node:test';
import assert from 'node:assert/strict';
import { solvePlan, buildTimeline } from '../public/js/calc.js';
import { defaultState, buildStages } from '../public/js/presets.js';

const MAN = 10000;
const base = () => {
  const s = defaultState();
  return { stages: buildStages(s), startYM: s.startYM };
};

test('既定条件の費用総額は資料の基準ケース300万円（公立中＋公立高）', () => {
  const tl = buildTimeline(base().stages, '2026-10');
  const total = tl.months.reduce((a, m) => a + m.total, 0);
  assert.ok(Math.abs(total - 300 * MAN) < 1);
});

test('私立高校を選ぶと400万円（基準ケース）', () => {
  const s = defaultState();
  s.high.type = 'private';
  s.high.school.amount = 170;
  const tl = buildTimeline(buildStages(s), s.startYM);
  assert.ok(Math.abs(tl.months.reduce((a, m) => a + m.total, 0) - 400 * MAN) < 1);
});

test('自動計算した月額積立で残高が一度も不足しない／1000円減ると不足する', () => {
  const b = base();
  const p = solvePlan({ ...b });
  assert.equal(p.firstShortage, null);
  assert.ok(p.minBalance >= -0.5);
  const lower = solvePlan({ ...b, deposit: p.autoDeposit - 1000 });
  assert.notEqual(lower.firstShortage, null);
});

test('現在の貯蓄や家計負担が増えると必要月額が下がる', () => {
  const b = base();
  const a = solvePlan({ ...b }).autoDeposit;
  assert.ok(solvePlan({ ...b, savings: 100 * MAN }).autoDeposit < a);
  assert.ok(solvePlan({ ...b, household: 20000 }).autoDeposit < a);
});

test('負担割合50%で費用総額・必要額が半分になる', () => {
  const b = base();
  const full = solvePlan({ ...b });
  const half = solvePlan({ ...b, share: 0.5 });
  assert.ok(Math.abs(half.totalCost * 2 - full.totalCost) < 1);
  assert.ok(Math.abs(half.autoDeposit * 2 - full.autoDeposit) <= 200);
});

test('項目なしは空の計画', () => {
  const p = solvePlan({ stages: [], startYM: '2026-10' });
  assert.equal(p.n, 0);
});

test('大学を追加すると期間が2037年3月まで延びる', () => {
  const s = defaultState();
  s.univ.type = 'pub_home';
  const p = solvePlan({ stages: buildStages(s), startYM: s.startYM });
  assert.equal(p.rows[p.n - 1].idx, 2037 * 12 + 2);
  assert.ok(Math.abs(p.totalCost - 700 * MAN) < 1);
});
