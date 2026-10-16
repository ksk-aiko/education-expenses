// 資料（大学4年間の費用レポート／教育費貯蓄計画）に基づく初期値。単位は万円。
export const LEVELS = { low: 0.8, mid: 1, high: 1.2 };

export const HIGH_PRESETS = {
  public: { label: '公立高校', school: 70, soccer: 50, juku: 90, lump: 60 },
  private: { label: '私立高校', school: 170, soccer: 50, juku: 90, lump: 100 },
};

export const UNIV_PRESETS = {
  pub_home: { label: '国公立大学・自宅通学', total: 400 },
  priv_home: { label: '私立文系大学・自宅通学', total: 550 },
  pub_away: { label: '国公立大学・下宿', total: 700 },
  priv_away: { label: '私立文系大学・下宿', total: 900 },
};

export const JUNIOR_PRESET = { school: 60, soccer: 30, juku: 90, lump: 30 };
export const UNIV_LUMP_RATIO = 0.2; // 入学時にまとめて払う割合（仮置き）

const round = (v) => Math.round(v * 2) / 2;

export function defaultState() {
  return {
    startYM: '2026-10',
    entryYear: 2027, // 中学入学（4月）
    savings: 0,
    household: 0,
    share: 100,
    level: 'mid',
    deposit: '',
    junior: { on: true, school: { on: true, amount: 60 }, soccer: { on: true, amount: 30 }, juku: { on: false, amount: 90 } },
    high: { type: 'public', school: { on: true, amount: 70 }, soccer: { on: true, amount: 50 }, juku: { on: true, amount: 90 } },
    univ: { type: 'none', amount: 400 },
  };
}

/** 費用水準（低め/標準/高め）を全項目の金額へ反映する */
export function applyLevel(state, level) {
  const f = LEVELS[level];
  const hp = HIGH_PRESETS[state.high.type] || HIGH_PRESETS.public;
  state.level = level;
  for (const k of ['school', 'soccer', 'juku']) {
    state.junior[k].amount = round(JUNIOR_PRESET[k] * f);
    state.high[k].amount = round(hp[k] * f);
  }
  if (UNIV_PRESETS[state.univ.type]) state.univ.amount = round(UNIV_PRESETS[state.univ.type].total * f);
}

const MAN = 10000;

/** UI の状態 → 計算用ステージ（円） */
export function buildStages(state) {
  const f = LEVELS[state.level] || 1;
  const Y = Number(state.entryYear);
  const pick = (obj, labels) =>
    Object.entries(labels)
      .filter(([k]) => obj[k].on && obj[k].amount > 0)
      .map(([k, label]) => ({ label, amount: obj[k].amount * MAN }));
  const labels = { school: '学校費', soccer: 'サッカー部', juku: '塾' };
  // 入学時一時金は学校費・部活費の範囲内（塾は含めない）
  const cap = (obj, preset) => {
    const base = ['school', 'soccer'].reduce((a, k) => a + (obj[k].on ? obj[k].amount : 0), 0) * MAN;
    return Math.min(preset * f * MAN, base);
  };

  const stages = [];
  stages.push({
    id: 'junior', label: '公立中学', startYM: `${Y}-04`, months: 36,
    lump: state.junior.on ? cap(state.junior, JUNIOR_PRESET.lump) : 0,
    items: state.junior.on ? pick(state.junior, labels) : [],
  });
  const hp = HIGH_PRESETS[state.high.type];
  stages.push({
    id: 'high', label: hp ? hp.label : '高校', startYM: `${Y + 3}-04`, months: 36,
    lump: hp ? cap(state.high, hp.lump) : 0,
    items: hp ? pick(state.high, labels) : [],
  });
  const up = UNIV_PRESETS[state.univ.type];
  const uTotal = up ? state.univ.amount * MAN : 0;
  stages.push({
    id: 'univ', label: up ? up.label : '大学', startYM: `${Y + 6}-04`, months: 48,
    lump: uTotal * UNIV_LUMP_RATIO,
    items: up && uTotal > 0 ? [{ label: '大学4年間の概算総額', amount: uTotal }] : [],
  });
  return stages;
}
