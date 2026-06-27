import type { Stock } from "./api";

export type CrossoverSignalType =
  | "golden_cross"
  | "macd_bullish_cross"
  | "oversold_recovery"
  | "volume_breakout"
  | "death_cross"
  | "macd_bearish_cross"
  | "triple_overbought"
  | "trend_breakdown";

export interface CrossoverSignalResult {
  type: CrossoverSignalType;
  label: string;
  direction: "bullish" | "bearish";
  confidence: "high" | "medium";
  target: string;
  stop: string;
  triggeredConditions: string[];
}

export interface CrossoverStockSignals {
  stock: Stock;
  signals: CrossoverSignalResult[];
}

const fmt = (n: number, decimals = 2) => n.toFixed(decimals);

// ── bullish detectors ─────────────────────────────────────────────────

function goldenCross(s: Stock): CrossoverSignalResult | null {
  const { golden_cross_days, current_price: p, week52_high, atr14 } = s;
  if (golden_cross_days == null) return null;

  const confidence = golden_cross_days <= 2 ? "high" : "medium";
  const target = week52_high != null
    ? `${fmt(week52_high)} (52W high)`
    : atr14 != null ? `${fmt(p + 3 * atr14)} (+3×ATR)` : "N/A";
  const stop = atr14 != null ? `${fmt(p - 1.5 * atr14)} (-1.5×ATR)` : "N/A";

  return {
    type: "golden_cross",
    label: "Golden Cross",
    direction: "bullish",
    confidence,
    target,
    stop,
    triggeredConditions: [
      `MA50 crossed above MA200 ${golden_cross_days === 0 ? "today" : `${golden_cross_days} day${golden_cross_days !== 1 ? "s" : ""} ago`}`,
      "Trend regime flipped bullish — long-term momentum shift",
    ],
  };
}

function macdBullishCross(s: Stock): CrossoverSignalResult | null {
  const { prev_macd_hist, macd_hist, macd_line, adx14, current_price: p, atr14 } = s;
  if (prev_macd_hist == null || macd_hist == null) return null;
  if (!(prev_macd_hist < 0 && macd_hist > 0)) return null;
  if (adx14 == null || adx14 <= 15) return null;

  const linePositive = macd_line != null && macd_line > 0;
  const confidence = linePositive ? "high" : "medium";
  const target = atr14 != null ? `${fmt(p + 2 * atr14)} (+2×ATR)` : "N/A";
  const stop   = atr14 != null ? `${fmt(p - atr14)} (-1×ATR)` : "N/A";

  const conditions = [
    `MACD histogram crossed from ${fmt(prev_macd_hist, 3)} → +${fmt(macd_hist, 3)}`,
    `ADX ${fmt(adx14, 1)} — trend present`,
  ];
  if (linePositive) conditions.push(`MACD line +${fmt(macd_line!, 3)} above zero — full momentum reversal`);
  else conditions.push(`MACD line ${fmt(macd_line!, 3)} still negative — early stage turn`);

  return {
    type: "macd_bullish_cross",
    label: "MACD Bullish Cross",
    direction: "bullish",
    confidence,
    target,
    stop,
    triggeredConditions: conditions,
  };
}

function oversoldRecovery(s: Stock): CrossoverSignalResult | null {
  const { prev_rsi14, rsi14, stoch_k, stoch_d, macd_hist, prev_macd_hist, current_price: p, ma50, atr14 } = s;
  if (prev_rsi14 == null || rsi14 == null) return null;
  if (!(prev_rsi14 < 30 && rsi14 >= 30)) return null;
  // Guard: MACD hist must be improving (not worsening)
  if (macd_hist != null && prev_macd_hist != null && macd_hist < prev_macd_hist) return null;

  const stochConfirming = stoch_k != null && stoch_d != null && stoch_k > stoch_d;
  const confidence = stochConfirming ? "high" : "medium";
  const target = ma50 != null ? `${fmt(ma50)} (MA50 mean reversion)` : atr14 != null ? `${fmt(p + 2 * atr14)} (+2×ATR)` : "N/A";
  const stop   = atr14 != null ? `${fmt(p - atr14)} (-1×ATR)` : "N/A";

  const conditions = [
    `RSI crossed above 30 (was ${fmt(prev_rsi14, 1)}, now ${fmt(rsi14, 1)}) — exiting oversold`,
  ];
  if (stochConfirming) conditions.push(`Stochastic %K ${fmt(stoch_k!, 1)} > %D ${fmt(stoch_d!, 1)} — momentum confirming`);
  if (macd_hist != null && prev_macd_hist != null)
    conditions.push(`MACD histogram improving (${fmt(prev_macd_hist, 3)} → ${fmt(macd_hist, 3)})`);

  return {
    type: "oversold_recovery",
    label: "Oversold Recovery",
    direction: "bullish",
    confidence,
    target,
    stop,
    triggeredConditions: conditions,
  };
}

function volumeBreakout(s: Stock): CrossoverSignalResult | null {
  const { current_price: p, week52_high, volume, avg_volume_10d, obv_slope, adx14, atr14 } = s;
  if (week52_high == null || volume == null || avg_volume_10d == null || avg_volume_10d === 0) return null;
  if (adx14 == null || adx14 <= 20) return null;
  if (obv_slope == null || obv_slope <= 0) return null;

  const pctFromHigh = (week52_high - p) / week52_high;
  if (pctFromHigh < 0 || pctFromHigh > 0.005) return null;

  const volRatio = volume / avg_volume_10d;
  if (volRatio < 2.0) return null;

  const confidence = volRatio >= 2.5 ? "high" : "medium";
  const target = atr14 != null ? `${fmt(p + 3 * atr14)} (+3×ATR)` : "N/A";
  const stop   = atr14 != null ? `${fmt(p - 1.5 * atr14)} (-1.5×ATR)` : "N/A";

  return {
    type: "volume_breakout",
    label: "Volume Breakout",
    direction: "bullish",
    confidence,
    target,
    stop,
    triggeredConditions: [
      `Price ${fmt(p)} within 0.5% of 52W high (${fmt(week52_high)})`,
      `Volume ${fmt(volRatio, 1)}× average — surge confirmation`,
      `OBV slope +${fmt(obv_slope, 0)}% — accumulation`,
      `ADX ${fmt(adx14, 1)} — trending market`,
    ],
  };
}

// ── bearish detectors ─────────────────────────────────────────────────

function deathCross(s: Stock): CrossoverSignalResult | null {
  const { death_cross_days, current_price: p, atr14 } = s;
  if (death_cross_days == null) return null;

  const confidence = death_cross_days <= 2 ? "high" : "medium";
  const stop = atr14 != null ? `${fmt(p - 1.5 * atr14)} (-1.5×ATR)` : "N/A";

  return {
    type: "death_cross",
    label: "Death Cross",
    direction: "bearish",
    confidence,
    target: "N/A",
    stop,
    triggeredConditions: [
      `MA50 crossed below MA200 ${death_cross_days === 0 ? "today" : `${death_cross_days} day${death_cross_days !== 1 ? "s" : ""} ago`}`,
      "Trend regime flipped bearish — long-term momentum shift",
    ],
  };
}

function macdBearishCross(s: Stock): CrossoverSignalResult | null {
  const { prev_macd_hist, macd_hist, macd_line, rsi14 } = s;
  if (prev_macd_hist == null || macd_hist == null) return null;
  if (!(prev_macd_hist > 0 && macd_hist < 0)) return null;
  // Guard: RSI must be elevated — not firing into an existing crash
  if (rsi14 == null || rsi14 <= 50) return null;

  const linePositive = macd_line != null && macd_line > 0;
  const confidence = linePositive ? "high" : "medium";

  const conditions = [
    `MACD histogram crossed from +${fmt(prev_macd_hist, 3)} → ${fmt(macd_hist, 3)}`,
    `RSI ${fmt(rsi14, 1)} — price was elevated`,
  ];
  if (linePositive) conditions.push(`MACD line +${fmt(macd_line!, 3)} — crossing down from bull territory`);
  else conditions.push(`MACD line ${fmt(macd_line!, 3)} — momentum worsening`);

  return {
    type: "macd_bearish_cross",
    label: "MACD Bearish Cross",
    direction: "bearish",
    confidence,
    target: "N/A",
    stop: "N/A",
    triggeredConditions: conditions,
  };
}

function tripleOverbought(s: Stock): CrossoverSignalResult | null {
  const { rsi14, stoch_k, bb_pct } = s;
  if (rsi14 == null || stoch_k == null || bb_pct == null) return null;
  if (!(rsi14 > 75 && stoch_k > 80 && bb_pct > 85)) return null;

  return {
    type: "triple_overbought",
    label: "Triple Overbought",
    direction: "bearish",
    confidence: "high",
    target: "N/A",
    stop: "N/A",
    triggeredConditions: [
      `RSI ${fmt(rsi14, 1)} > 75 — overbought`,
      `Stochastic %K ${fmt(stoch_k, 1)} > 80 — overbought zone`,
      `Bollinger %B ${fmt(bb_pct, 0)}% > 85 — near/above upper band`,
    ],
  };
}

function trendBreakdown(s: Stock): CrossoverSignalResult | null {
  const { current_price: p, ma50, ma200, atr14, adx14, prev_rsi14 } = s;
  if (p == null || ma50 == null || atr14 == null || adx14 == null) return null;
  if (!(p < ma50 - atr14 && adx14 > 25)) return null;
  // Guard: don't signal into an already-oversold bottom
  if (prev_rsi14 != null && prev_rsi14 < 30) return null;

  const downtrend = ma200 != null && ma50 < ma200;
  const confidence = downtrend ? "high" : "medium";

  const conditions = [
    `Price ${fmt(p)} below MA50 (${fmt(ma50)}) − ATR (${fmt(atr14)}) support`,
    `ADX ${fmt(adx14, 1)} > 25 — trending breakdown`,
  ];
  if (downtrend) conditions.push(`MA50 (${fmt(ma50)}) < MA200 (${fmt(ma200!)}) — confirmed downtrend structure`);

  return {
    type: "trend_breakdown",
    label: "Trend Breakdown",
    direction: "bearish",
    confidence,
    target: "N/A",
    stop: `${fmt(p - 1.5 * atr14)} (-1.5×ATR)`,
    triggeredConditions: conditions,
  };
}

// ── engine ────────────────────────────────────────────────────────────

const DETECTORS = [
  goldenCross,
  macdBullishCross,
  oversoldRecovery,
  volumeBreakout,
  deathCross,
  macdBearishCross,
  tripleOverbought,
  trendBreakdown,
];

export function detectCrossoverSignals(stock: Stock): CrossoverStockSignals {
  const signals: CrossoverSignalResult[] = [];
  for (const detect of DETECTORS) {
    try {
      const result = detect(stock);
      if (result) signals.push(result);
    } catch {
      // skip failed detectors
    }
  }
  return { stock, signals };
}

export const BULLISH_CROSSOVER_TYPES: CrossoverSignalType[] = [
  "golden_cross",
  "macd_bullish_cross",
  "oversold_recovery",
  "volume_breakout",
];

export const BEARISH_CROSSOVER_TYPES: CrossoverSignalType[] = [
  "death_cross",
  "macd_bearish_cross",
  "triple_overbought",
  "trend_breakdown",
];

export const CROSSOVER_SIGNAL_LABELS: Record<CrossoverSignalType, string> = {
  golden_cross:       "Golden Cross",
  macd_bullish_cross: "MACD Bullish Cross",
  oversold_recovery:  "Oversold Recovery",
  volume_breakout:    "Volume Breakout",
  death_cross:        "Death Cross",
  macd_bearish_cross: "MACD Bearish Cross",
  triple_overbought:  "Triple Overbought",
  trend_breakdown:    "Trend Breakdown",
};
