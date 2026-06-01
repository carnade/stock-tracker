import type { Stock } from "./api";

export type Rating = "Strong Buy" | "Buy" | "Neutral" | "Sell" | "Strong Sell";

export interface SignalFactor {
  name: string;
  score: number;
  maxScore: number;
  description: string;
  direction: "bullish" | "bearish" | "neutral" | "na";
}

export interface SwingSignal {
  rating: Rating;
  totalScore: number;
  factors: SignalFactor[];
  dataCompleteness: number; // 0–1
}

// Total max score: 2+2+2+2+2+2+2 = 14
function ratingFromScore(score: number): Rating {
  if (score >= 9)  return "Strong Buy";
  if (score >= 3)  return "Buy";
  if (score >= -2) return "Neutral";
  if (score >= -8) return "Sell";
  return "Strong Sell";
}

export function scoreStock(stock: Stock): SwingSignal {
  const factors: SignalFactor[] = [];
  const TOTAL_FACTORS = 7;

  // ── 1. MA Trend (±2) ─────────────────────────────────────────────────
  if (stock.ma50 != null && stock.ma200 != null) {
    const cur = stock.current_price;
    const aboveMa50 = cur > stock.ma50;
    const aboveMa200 = cur > stock.ma200;
    const goldenCross = stock.ma50 > stock.ma200;
    let score: number;
    let description: string;
    let direction: SignalFactor["direction"];
    if (aboveMa50 && goldenCross) {
      score = 2;
      description = `Price above MA50 (${stock.ma50.toFixed(2)}) and MA200 (${stock.ma200.toFixed(2)}), golden cross active — strong uptrend`;
      direction = "bullish";
    } else if (aboveMa50 && aboveMa200) {
      score = 1;
      description = `Price above MA50 and MA200, but MA50 still below MA200 — recovering, no golden cross yet`;
      direction = "bullish";
    } else if (!aboveMa50 && aboveMa200) {
      score = -1;
      description = `Price below MA50 (${stock.ma50.toFixed(2)}) but above MA200 — short-term pullback in long-term uptrend`;
      direction = "bearish";
    } else if (!goldenCross) {
      score = -2;
      description = `Price below MA50 and MA200, death cross active — confirmed downtrend`;
      direction = "bearish";
    } else {
      score = -1;
      description = `Price below MA50 (${stock.ma50.toFixed(2)}) — short-term weakness`;
      direction = "bearish";
    }
    factors.push({ name: "MA Trend", score, maxScore: 2, description, direction });
  }

  // ── 2. EMA Cross (±2) ────────────────────────────────────────────────
  if (stock.ema9 != null && stock.ema21 != null && stock.ema21 !== 0) {
    const pctDiff = ((stock.ema9 - stock.ema21) / stock.ema21) * 100;
    let score: number;
    let description: string;
    let direction: SignalFactor["direction"];
    if (pctDiff > 1) {
      score = 2;
      description = `EMA9 (${stock.ema9.toFixed(2)}) above EMA21 (${stock.ema21.toFixed(2)}) by ${pctDiff.toFixed(1)}% — short-term momentum clearly bullish`;
      direction = "bullish";
    } else if (pctDiff > 0) {
      score = 1;
      description = `EMA9 slightly above EMA21 — mild short-term bullish bias`;
      direction = "bullish";
    } else if (pctDiff >= -0.5) {
      score = 0;
      description = `EMA9 and EMA21 nearly equal — no clear short-term direction`;
      direction = "neutral";
    } else if (pctDiff >= -1) {
      score = -1;
      description = `EMA9 slightly below EMA21 — mild short-term bearish bias`;
      direction = "bearish";
    } else {
      score = -2;
      description = `EMA9 (${stock.ema9.toFixed(2)}) below EMA21 (${stock.ema21.toFixed(2)}) by ${Math.abs(pctDiff).toFixed(1)}% — short-term momentum clearly bearish`;
      direction = "bearish";
    }
    factors.push({ name: "EMA Cross", score, maxScore: 2, description, direction });
  }

  // ── 3. MACD (±2) ─────────────────────────────────────────────────────
  if (stock.macd_line != null && stock.macd_hist != null) {
    const line = stock.macd_line;
    const hist = stock.macd_hist;
    let score: number;
    let description: string;
    let direction: SignalFactor["direction"];
    if (hist > 0 && line > 0) {
      score = 2;
      description = `Histogram +${hist.toFixed(3)}, line +${line.toFixed(3)} — momentum building above zero`;
      direction = "bullish";
    } else if (hist > 0 && line <= 0) {
      score = 1;
      description = `Histogram turning up (${hist.toFixed(3)}) while MACD line (${line.toFixed(3)}) still negative — early recovery`;
      direction = "bullish";
    } else if (hist <= 0 && line > 0) {
      score = -1;
      description = `Histogram falling (${hist.toFixed(3)}) despite positive MACD line — momentum fading`;
      direction = "bearish";
    } else {
      score = -2;
      description = `Histogram ${hist.toFixed(3)}, line ${line.toFixed(3)} — both negative, bearish momentum`;
      direction = "bearish";
    }
    factors.push({ name: "MACD", score, maxScore: 2, description, direction });
  }

  // ── 4. RSI (±2) ──────────────────────────────────────────────────────
  if (stock.rsi14 != null) {
    const rsi = stock.rsi14;
    let score: number;
    let description: string;
    let direction: SignalFactor["direction"];
    if (rsi < 30) {
      score = 2;
      description = `RSI ${rsi.toFixed(1)} — oversold territory, high-probability bounce zone`;
      direction = "bullish";
    } else if (rsi < 45) {
      score = 1;
      description = `RSI ${rsi.toFixed(1)} — below midpoint, selling pressure easing`;
      direction = "bullish";
    } else if (rsi < 60) {
      score = 0;
      description = `RSI ${rsi.toFixed(1)} — neutral range, no extremes`;
      direction = "neutral";
    } else if (rsi < 75) {
      score = -1;
      description = `RSI ${rsi.toFixed(1)} — elevated, approaching overbought`;
      direction = "bearish";
    } else {
      score = -2;
      description = `RSI ${rsi.toFixed(1)} — overbought, pullback risk elevated`;
      direction = "bearish";
    }
    factors.push({ name: "RSI 14", score, maxScore: 2, description, direction });
  }

  // ── 5. Stochastic (±2) ───────────────────────────────────────────────
  if (stock.stoch_k != null && stock.stoch_d != null) {
    const k = stock.stoch_k;
    const d = stock.stoch_d;
    let score: number;
    let description: string;
    let direction: SignalFactor["direction"];
    if (k < 20 && k > d) {
      score = 2;
      description = `%K ${k.toFixed(1)} oversold and crossing above %D — bullish reversal signal`;
      direction = "bullish";
    } else if (k < 20) {
      score = 1;
      description = `%K ${k.toFixed(1)} in oversold zone (<20), watching for cross above %D (${d.toFixed(1)})`;
      direction = "bullish";
    } else if (k <= 80) {
      score = 0;
      description = `%K ${k.toFixed(1)} in neutral range (20–80)`;
      direction = "neutral";
    } else if (k > 80 && k < d) {
      score = -2;
      description = `%K ${k.toFixed(1)} overbought and crossing below %D — bearish reversal signal`;
      direction = "bearish";
    } else {
      score = -1;
      description = `%K ${k.toFixed(1)} in overbought zone (>80), watching for cross below %D (${d.toFixed(1)})`;
      direction = "bearish";
    }
    factors.push({ name: "Stochastic", score, maxScore: 2, description, direction });
  }

  // ── 6. Bollinger %B (±2) ─────────────────────────────────────────────
  if (stock.bb_pct != null) {
    const pct = stock.bb_pct;
    let score: number;
    let description: string;
    let direction: SignalFactor["direction"];
    if (pct < 10) {
      score = 2;
      description = `Bollinger %B ${pct.toFixed(0)}% — at or below lower band, price deeply compressed`;
      direction = "bullish";
    } else if (pct < 30) {
      score = 1;
      description = `Bollinger %B ${pct.toFixed(0)}% — near lower band, potential mean reversion`;
      direction = "bullish";
    } else if (pct < 70) {
      score = 0;
      description = `Bollinger %B ${pct.toFixed(0)}% — midrange, no squeeze or extension`;
      direction = "neutral";
    } else if (pct < 90) {
      score = -1;
      description = `Bollinger %B ${pct.toFixed(0)}% — near upper band, price extended`;
      direction = "bearish";
    } else {
      score = -2;
      description = `Bollinger %B ${pct.toFixed(0)}% — at or above upper band, very extended`;
      direction = "bearish";
    }
    factors.push({ name: "Bollinger %B", score, maxScore: 2, description, direction });
  }

  // ── 7. ADX / OBV (±2) ────────────────────────────────────────────────
  const hasAdx = stock.adx14 != null && stock.adx_plus_di != null && stock.adx_minus_di != null;
  const hasObv = stock.obv_slope != null;
  if (hasAdx || hasObv) {
    let score = 0;
    const descParts: string[] = [];
    let direction: SignalFactor["direction"] = "neutral";

    if (hasAdx) {
      const adx = stock.adx14!;
      const pdi = stock.adx_plus_di!;
      const mdi = stock.adx_minus_di!;
      if (adx > 25 && pdi > mdi) {
        score += 1;
        descParts.push(`ADX ${adx.toFixed(1)} — strong trend, +DI (${pdi.toFixed(1)}) leads bearish`);
        direction = "bullish";
      } else if (adx > 25 && mdi > pdi) {
        score -= 1;
        descParts.push(`ADX ${adx.toFixed(1)} — strong trend, -DI (${mdi.toFixed(1)}) leads bearish`);
        direction = "bearish";
      } else if (adx < 20) {
        descParts.push(`ADX ${adx.toFixed(1)} — ranging market, trend signals less reliable`);
      } else {
        descParts.push(`ADX ${adx.toFixed(1)} — moderate trend strength`);
      }
    }

    if (hasObv) {
      const slope = stock.obv_slope!;
      if (slope > 50) {
        score += 1;
        descParts.push(`OBV rising strongly (+${slope.toFixed(0)}%) — accumulation confirmed`);
        if (direction === "neutral") direction = "bullish";
      } else if (slope < -50) {
        score -= 1;
        descParts.push(`OBV falling sharply (${slope.toFixed(0)}%) — distribution pressure`);
        if (direction === "neutral") direction = "bearish";
      } else if (slope > 10) {
        descParts.push(`OBV slowly rising (+${slope.toFixed(0)}%) — mild accumulation`);
      } else if (slope < -10) {
        descParts.push(`OBV slowly falling (${slope.toFixed(0)}%) — mild distribution`);
      } else {
        descParts.push(`OBV flat — no clear volume trend`);
      }
    }

    score = Math.max(-2, Math.min(2, score));
    if (score === 0) direction = "neutral";
    else if (score > 0) direction = "bullish";
    else direction = "bearish";

    factors.push({
      name: "ADX / OBV",
      score,
      maxScore: 2,
      description: descParts.join("; "),
      direction,
    });
  }

  const totalScore = factors.reduce((s, f) => s + f.score, 0);

  return {
    rating: ratingFromScore(totalScore),
    totalScore,
    factors,
    dataCompleteness: factors.length / TOTAL_FACTORS,
  };
}
