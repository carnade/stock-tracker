import type { Stock } from "./api";

export type SignalType =
  | "pullback_entry"
  | "oversold_bounce"
  | "macd_momentum_turn"
  | "breakout_setup"
  | "overbought_scale_out"
  | "momentum_fading"
  | "trend_exhaustion"
  | "below_key_support";

export interface SignalResult {
  type: SignalType;
  label: string;
  direction: "bullish" | "bearish";
  confidence: "high" | "medium" | "low";
  entryZone: string;
  target: string;
  stop: string;
  triggeredConditions: string[];
}

export interface StockSignals {
  stock: Stock;
  signals: SignalResult[];
}

const fmt = (n: number, decimals = 2) => n.toFixed(decimals);

function pullbackEntry(s: Stock): SignalResult | null {
  const { current_price: p, ma50, adx14, obv_slope, week52_high, atr14 } = s;
  if (ma50 == null || p == null) return null;

  const pctAboveMa50 = (p - ma50) / ma50;
  const conditions: string[] = [];

  const inHighZone   = pctAboveMa50 >= 0 && pctAboveMa50 <= 0.03;
  const inMediumZone = pctAboveMa50 >= 0 && pctAboveMa50 <= 0.05;
  const adxHigh      = adx14 != null && adx14 > 20;
  const adxMed       = adx14 != null && adx14 > 15;
  const obvPos       = obv_slope != null && obv_slope > 0;

  if (inHighZone)   conditions.push(`Price within 3% above MA50 (${fmt(ma50)})`);
  else if (inMediumZone) conditions.push(`Price within 5% above MA50 (${fmt(ma50)})`);
  if (adxHigh || adxMed) conditions.push(`ADX ${fmt(adx14!, 1)} — trend confirmed`);
  if (obvPos) conditions.push(`OBV slope +${fmt(obv_slope!, 0)}% — accumulation`);

  const isHigh   = inHighZone && adxHigh && obvPos;
  const isMedium = inMediumZone && adxMed && obvPos;

  if (!isHigh && !isMedium) return null;

  const target = week52_high != null
    ? `${fmt(week52_high)} (52W high)`
    : atr14 != null ? `${fmt(p + 3 * atr14)} (+3×ATR)` : "—";
  const stop = atr14 != null ? `${fmt(p - 1.5 * atr14)} (-1.5×ATR)` : "—";

  return {
    type: "pullback_entry",
    label: "Pullback Entry",
    direction: "bullish",
    confidence: isHigh ? "high" : "medium",
    entryZone: `Near MA50 (~${fmt(ma50)})`,
    target,
    stop,
    triggeredConditions: conditions,
  };
}

function oversoldBounce(s: Stock): SignalResult | null {
  const { current_price: p, rsi14, stoch_k, bb_pct, ma50, atr14 } = s;

  let met = 0;
  const conditions: string[] = [];

  if (rsi14 != null && rsi14 < 35)  { met++; conditions.push(`RSI ${fmt(rsi14, 1)} — oversold`); }
  if (stoch_k != null && stoch_k < 20) { met++; conditions.push(`Stochastic %K ${fmt(stoch_k, 1)} — oversold zone`); }
  if (bb_pct != null && bb_pct < 15)   { met++; conditions.push(`Bollinger %B ${fmt(bb_pct, 0)}% — near/below lower band`); }

  // low confidence: softer thresholds, at least 1 of 2
  const softRsi   = rsi14 != null && rsi14 < 40;
  const softStoch = stoch_k != null && stoch_k < 25;

  if (met === 0 && !(softRsi && softStoch)) return null;

  let confidence: "high" | "medium" | "low";
  if (met === 3) {
    confidence = "high";
  } else if (met >= 2) {
    confidence = "medium";
  } else if (met === 1 || (softRsi && softStoch)) {
    confidence = "low";
    if (softRsi && rsi14! >= 35)   conditions.push(`RSI ${fmt(rsi14!, 1)} — approaching oversold`);
    if (softStoch && stoch_k! >= 20) conditions.push(`Stochastic %K ${fmt(stoch_k!, 1)} — near oversold zone`);
  } else {
    return null;
  }

  const target = ma50 != null ? `${fmt(ma50)} (MA50 mean reversion)` : "—";
  const stop   = p != null && atr14 != null ? `${fmt(p - 1.5 * atr14)} (-1.5×ATR)` : "—";
  const entry  = p != null ? `${fmt(p)} — mean reversion zone` : "—";

  return {
    type: "oversold_bounce",
    label: "Oversold Bounce",
    direction: "bullish",
    confidence,
    entryZone: entry,
    target,
    stop,
    triggeredConditions: conditions,
  };
}

function macdMomentumTurn(s: Stock): SignalResult | null {
  const { current_price: p, macd_hist, adx14, atr14 } = s;
  if (macd_hist == null) return null;
  if (macd_hist <= 0) return null;

  const conditions: string[] = [`MACD histogram +${fmt(macd_hist, 3)} — positive momentum`];

  const adxHigh = adx14 != null && adx14 > 15;
  const adxMed  = adx14 != null && adx14 >= 10 && adx14 <= 15;

  if (adxHigh) conditions.push(`ADX ${fmt(adx14!, 1)} — trend supporting`);
  else if (adxMed) conditions.push(`ADX ${fmt(adx14!, 1)} — weak trend`);
  else if (adx14 != null) conditions.push(`ADX ${fmt(adx14, 1)} — ranging market`);

  const isHigh   = adxHigh;
  const isMedium = adxMed;
  if (!isHigh && !isMedium) return null;

  const target = p != null && atr14 != null ? `${fmt(p + 2 * atr14)} (+2×ATR)` : "—";
  const stop   = p != null && atr14 != null ? `${fmt(p - 1.5 * atr14)} (-1.5×ATR)` : "—";
  const entry  = p != null ? `${fmt(p)} (momentum turn)` : "—";

  return {
    type: "macd_momentum_turn",
    label: "MACD Momentum Turn",
    direction: "bullish",
    confidence: isHigh ? "high" : "medium",
    entryZone: entry,
    target,
    stop,
    triggeredConditions: conditions,
  };
}

function breakoutSetup(s: Stock): SignalResult | null {
  const { current_price: p, week52_high, volume, avg_volume_10d, obv_slope, atr14 } = s;
  if (week52_high == null || p == null) return null;

  const pctFromHigh = (week52_high - p) / week52_high;
  const volRatio    = volume != null && avg_volume_10d != null && avg_volume_10d > 0
    ? volume / avg_volume_10d : null;
  const obvPos = obv_slope != null && obv_slope > 0;

  const conditions: string[] = [];

  const inHighZone   = pctFromHigh >= 0 && pctFromHigh <= 0.02;
  const inMediumZone = pctFromHigh >= 0 && pctFromHigh <= 0.04;

  if (inHighZone)   conditions.push(`Price within 2% of 52W high (${fmt(week52_high)})`);
  else if (inMediumZone) conditions.push(`Price within 4% of 52W high (${fmt(week52_high)})`);

  if (volRatio != null) {
    if (volRatio > 1.3) conditions.push(`Volume ${fmt(volRatio, 1)}× avg — strong confirmation`);
    else if (volRatio > 1.1) conditions.push(`Volume ${fmt(volRatio, 1)}× avg — above average`);
  }
  if (obvPos) conditions.push(`OBV slope +${fmt(obv_slope!, 0)}% — accumulation`);

  const volHigh = volRatio != null && volRatio > 1.3;
  const volMed  = volRatio != null && volRatio > 1.1;

  const isHigh   = inHighZone && volHigh && obvPos;
  const isMedium = inMediumZone && volMed && obvPos;

  if (!isHigh && !isMedium) return null;

  const target = `${fmt(week52_high * 1.05)} (5% above 52W high)`;
  const stop   = atr14 != null ? `${fmt(p - 1.5 * atr14)} (-1.5×ATR)` : "—";

  return {
    type: "breakout_setup",
    label: "Breakout Setup",
    direction: "bullish",
    confidence: isHigh ? "high" : "medium",
    entryZone: `Near 52W high (~${fmt(week52_high)})`,
    target,
    stop,
    triggeredConditions: conditions,
  };
}

function overboughtScaleOut(s: Stock): SignalResult | null {
  const { rsi14, stoch_k, bb_pct } = s;

  let met = 0;
  const conditions: string[] = [];

  if (rsi14 != null && rsi14 > 75)  { met++; conditions.push(`RSI ${fmt(rsi14, 1)} — overbought`); }
  if (stoch_k != null && stoch_k > 80) { met++; conditions.push(`Stochastic %K ${fmt(stoch_k, 1)} — overbought zone`); }
  if (bb_pct != null && bb_pct > 85)   { met++; conditions.push(`Bollinger %B ${fmt(bb_pct, 0)}% — near/above upper band`); }

  if (met < 2) return null;

  return {
    type: "overbought_scale_out",
    label: "Overbought / Scale Out",
    direction: "bearish",
    confidence: met === 3 ? "high" : "medium",
    entryZone: "N/A — exit signal",
    target: "N/A",
    stop: "N/A",
    triggeredConditions: conditions,
  };
}

function momentumFading(s: Stock): SignalResult | null {
  const { macd_hist, macd_line, rsi14 } = s;
  if (macd_hist == null) return null;
  if (macd_hist >= 0) return null;

  const conditions: string[] = [`MACD histogram ${fmt(macd_hist, 3)} — momentum fading`];

  const linePositive = macd_line != null && macd_line > 0;
  const rsiHigh      = rsi14 != null && rsi14 > 65;
  const rsiMed       = rsi14 != null && rsi14 > 60;

  if (linePositive) conditions.push(`MACD line ${fmt(macd_line!, 3)} still positive — classic divergence`);
  if (rsiHigh || rsiMed) conditions.push(`RSI ${fmt(rsi14!, 1)} — elevated levels`);

  const isHigh   = linePositive && rsiHigh;
  const isMedium = rsiMed;

  if (!isHigh && !isMedium) return null;

  return {
    type: "momentum_fading",
    label: "Momentum Fading",
    direction: "bearish",
    confidence: isHigh ? "high" : "medium",
    entryZone: "N/A — exit/reduce signal",
    target: "N/A",
    stop: "N/A",
    triggeredConditions: conditions,
  };
}

function trendExhaustion(s: Stock): SignalResult | null {
  const { current_price: p, adx14, adx_plus_di, adx_minus_di, ma50, atr14 } = s;
  if (adx14 == null || adx_plus_di == null || adx_minus_di == null) return null;

  const mdiLeads = adx_minus_di > adx_plus_di;
  if (!mdiLeads) return null;

  const conditions: string[] = [`ADX ${fmt(adx14, 1)} — -DI (${fmt(adx_minus_di, 1)}) > +DI (${fmt(adx_plus_di, 1)})`];

  const nearMa50 = ma50 != null && p != null && Math.abs(p - ma50) / ma50 < 0.03;
  if (nearMa50) conditions.push(`Price near MA50 (~${fmt(ma50!)}) — at key support/resistance`);

  const isHigh   = adx14 > 25 && mdiLeads && nearMa50;
  const isMedium = adx14 > 20 && mdiLeads;

  if (!isHigh && !isMedium) return null;

  const stop = ma50 != null && atr14 != null ? `${fmt(ma50 - atr14)} (MA50 - ATR)` : "—";

  return {
    type: "trend_exhaustion",
    label: "Trend Exhaustion",
    direction: "bearish",
    confidence: isHigh ? "high" : "medium",
    entryZone: "Watch for breakdown below MA50",
    target: "N/A",
    stop,
    triggeredConditions: conditions,
  };
}

function belowKeySupport(s: Stock): SignalResult | null {
  const { current_price: p, ma50, atr14 } = s;
  if (p == null || ma50 == null || atr14 == null) return null;
  if (p >= ma50 - atr14) return null;

  return {
    type: "below_key_support",
    label: "Below Key Support",
    direction: "bearish",
    confidence: "high",
    entryZone: "N/A — stop loss territory",
    target: `${fmt(ma50)} (MA50 recovery target)`,
    stop: `${fmt(p - 1.5 * atr14)} (-1.5×ATR)`,
    triggeredConditions: [
      `Price ${fmt(p)} below MA50 (${fmt(ma50)}) minus ATR (${fmt(atr14)})`,
    ],
  };
}

const DETECTORS = [
  pullbackEntry,
  oversoldBounce,
  macdMomentumTurn,
  breakoutSetup,
  overboughtScaleOut,
  momentumFading,
  trendExhaustion,
  belowKeySupport,
];

export function detectSignals(stock: Stock): StockSignals {
  const signals: SignalResult[] = [];
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

export const BULLISH_SIGNAL_TYPES: SignalType[] = [
  "pullback_entry",
  "oversold_bounce",
  "macd_momentum_turn",
  "breakout_setup",
];

export const BEARISH_SIGNAL_TYPES: SignalType[] = [
  "overbought_scale_out",
  "momentum_fading",
  "trend_exhaustion",
  "below_key_support",
];

export const SIGNAL_LABELS: Record<SignalType, string> = {
  pullback_entry:       "Pullback Entry",
  oversold_bounce:      "Oversold Bounce",
  macd_momentum_turn:   "MACD Momentum Turn",
  breakout_setup:       "Breakout Setup",
  overbought_scale_out: "Overbought / Scale Out",
  momentum_fading:      "Momentum Fading",
  trend_exhaustion:     "Trend Exhaustion",
  below_key_support:    "Below Key Support",
};
