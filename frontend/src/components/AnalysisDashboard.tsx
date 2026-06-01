"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { motion, AnimatePresence } from "motion/react";
import { fetchStocks, analyzeStocks, Stock } from "@/lib/api";
import { scoreStock, SwingSignal, Rating, SignalFactor } from "@/lib/swingScore";
import StockLinks from "./StockLinks";

type ScoredStock = { stock: Stock; signal: SwingSignal };

const RATINGS: Rating[] = ["Strong Buy", "Buy", "Neutral", "Sell", "Strong Sell"];

const RATING_STYLE: Record<Rating, { badge: string; header: string; border: string }> = {
  "Strong Buy":  { badge: "border-green/30 text-green bg-green/5",    header: "text-green",    border: "border-green/20"  },
  "Buy":         { badge: "border-green/20 text-green/70",            header: "text-green/70", border: "border-border"    },
  "Neutral":     { badge: "border-border text-muted",                 header: "text-muted",    border: "border-border"    },
  "Sell":        { badge: "border-accent/30 text-accent",             header: "text-accent",   border: "border-border"    },
  "Strong Sell": { badge: "border-red/30 text-red bg-red/5",          header: "text-red",      border: "border-red/20"    },
};

function groupByRating(stocks: Stock[]): Record<Rating, ScoredStock[]> {
  const map: Record<Rating, ScoredStock[]> = {
    "Strong Buy": [], "Buy": [], "Neutral": [], "Sell": [], "Strong Sell": [],
  };
  for (const stock of stocks) {
    const signal = scoreStock(stock);
    map[signal.rating].push({ stock, signal });
  }
  for (const list of Object.values(map)) {
    list.sort((a, b) => b.signal.totalScore - a.signal.totalScore);
  }
  return map;
}

// ── helpers ───────────────────────────────────────────────────────────

function FactorChip({ name, score, direction }: SignalFactor) {
  const abbr =
    name === "MA Trend"     ? "MA"   :
    name === "EMA Cross"    ? "EMA"  :
    name === "MACD"         ? "MACD" :
    name === "RSI 14"       ? "RSI"  :
    name === "Stochastic"   ? "STO"  :
    name === "Bollinger %B" ? "BB"   :
    name === "ADX / OBV"    ? "ADX"  :
    name.toUpperCase().slice(0, 4);

  let iconCls = "text-muted/40";
  let icon    = "—";
  if (direction === "bullish") {
    iconCls = score >= 2 ? "text-green" : "text-green/60";
    icon    = score >= 2 ? "▲▲" : "▲";
  } else if (direction === "bearish") {
    iconCls = score <= -2 ? "text-red" : "text-accent";
    icon    = score <= -2 ? "▼▼" : "▼";
  }

  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[26px]">
      <span className="text-[9px] tracking-wide text-muted/60 uppercase leading-none">{abbr}</span>
      <span className={`text-[10px] leading-none font-mono ${iconCls}`}>{icon}</span>
    </div>
  );
}

function ScoreDisplay({ score, completeness }: { score: number; completeness: number }) {
  const color =
    score >= 9  ? "text-green" :
    score >= 3  ? "text-green/70" :
    score >= -2 ? "text-muted" :
    score >= -8 ? "text-accent" :
    "text-red";
  const signed = score > 0 ? `+${score}` : `${score}`;
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className={`text-sm font-mono font-semibold tabular-nums ${color}`}>{signed}</span>
      {completeness < 0.6 && (
        <span className="text-[9px] text-accent" title="Partial data — some indicators unavailable">⚠</span>
      )}
    </div>
  );
}

function FactorDetailPanel({ signal }: { signal: SwingSignal }) {
  return (
    <div className="bg-surface border-b border-border/60 px-8 py-5">
      <div className="grid grid-cols-3 gap-3">
        {signal.factors.map((f) => {
          const dirColor =
            f.direction === "bullish" ? "text-green" :
            f.direction === "bearish" ? (f.score <= -2 ? "text-red" : "text-accent") :
            "text-muted";
          const signed = f.score > 0 ? `+${f.score}` : `${f.score}`;
          return (
            <div key={f.name} className="border border-border/40 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] tracking-[0.2em] uppercase text-muted">{f.name}</span>
                <span className={`text-[11px] font-mono font-semibold ${dirColor}`}>
                  {signed} / {f.maxScore}
                </span>
              </div>
              <p className={`text-[11px] font-mono leading-relaxed ${dirColor}`}>{f.description}</p>
            </div>
          );
        })}
      </div>
      {signal.dataCompleteness < 0.6 && (
        <p className="text-[10px] text-accent font-mono mt-4">
          ⚠ Only {signal.factors.length} of 7 indicators available — rating confidence is reduced.
        </p>
      )}
    </div>
  );
}

// ── table ─────────────────────────────────────────────────────────────

const TH = "py-3 pr-3 text-left text-[10px] tracking-[0.2em] uppercase text-muted whitespace-nowrap";
const TD = "py-4 pr-3 font-mono text-sm";

function RatingSections({
  byRating,
  openRatings,
  toggleRating,
  expandedId,
  setExpandedId,
}: {
  byRating: Record<Rating, ScoredStock[]>;
  openRatings: Set<Rating>;
  toggleRating: (r: Rating) => void;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
}) {
  return (
    <>
      {/* Summary strip */}
      <div className="flex items-center gap-3 mb-10 flex-wrap">
        {RATINGS.map((r) => {
          const count = byRating[r].length;
          const style = RATING_STYLE[r];
          return (
            <button
              key={r}
              onClick={() => { if (count > 0) toggleRating(r); }}
              className={`px-3 py-1.5 border text-[10px] font-mono tracking-wider transition-all ${style.badge} ${count === 0 ? "opacity-25 cursor-default" : "hover:brightness-110"}`}
            >
              {r.toUpperCase()} — {count}
            </button>
          );
        })}
      </div>

      {/* Sections */}
      {RATINGS.map((rating) => {
        const items = byRating[rating];
        if (items.length === 0) return null;
        const isOpen = openRatings.has(rating);
        const style  = RATING_STYLE[rating];

        return (
          <div key={rating} className={`mb-6 border ${style.border}`}>
            <button
              onClick={() => toggleRating(rating)}
              className="w-full flex items-center gap-3 px-6 py-4 hover:bg-surface transition-colors text-left"
            >
              <span
                className="text-[10px] text-muted/40 inline-block transition-transform duration-200"
                style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
              >
                ▶
              </span>
              <span className={`text-xs font-mono tracking-[0.25em] font-semibold ${style.header}`}>
                {rating.toUpperCase()}
              </span>
              <span className="text-[10px] text-muted font-mono ml-1">
                {items.length} position{items.length !== 1 ? "s" : ""}
              </span>
            </button>

            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="overflow-x-auto border-t border-border/40">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-border/40">
                          <th className="py-3 w-6 pr-1" />
                          <th className={TH}>Ticker</th>
                          <th className={TH}>Name</th>
                          <th className={`${TH} text-right pr-4`}>Score</th>
                          <th className={TH}>Signals</th>
                          <th className={`${TH} pr-0`}>Links</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence>
                          {items.map(({ stock, signal }, i) => {
                            const isExpanded = expandedId === stock.id;
                            return (
                              <Fragment key={stock.id}>
                                <motion.tr
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.03, duration: 0.2 }}
                                  className="border-b border-border/30 hover:bg-surface transition-colors"
                                >
                                  <td className="py-4 pr-1 w-6">
                                    <button
                                      onClick={() => setExpandedId(isExpanded ? null : stock.id)}
                                      className="text-muted/40 hover:text-muted transition-colors"
                                      title="Expand signal breakdown"
                                    >
                                      <span
                                        className="text-[10px] inline-block transition-transform duration-200"
                                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                      >
                                        ▶
                                      </span>
                                    </button>
                                  </td>
                                  <td className={TD}>
                                    <span className="text-ticker font-semibold tracking-wider">{stock.ticker}</span>
                                  </td>
                                  <td className={`${TD} max-w-[220px]`}>
                                    <span className="truncate block text-[#b8b3ab]" title={stock.name}>
                                      {stock.name !== stock.ticker ? stock.name : ""}
                                    </span>
                                  </td>
                                  <td className={`${TD} text-right pr-4`}>
                                    <ScoreDisplay score={signal.totalScore} completeness={signal.dataCompleteness} />
                                  </td>
                                  <td className={TD}>
                                    <div className="flex items-center gap-3">
                                      {signal.factors.map((f) => (
                                        <FactorChip key={f.name} {...f} />
                                      ))}
                                    </div>
                                  </td>
                                  <td className={`${TD} pr-0`}>
                                    <StockLinks stock={stock} />
                                  </td>
                                </motion.tr>
                                <AnimatePresence>
                                  {isExpanded && (
                                    <tr key={`${stock.id}-detail`}>
                                      <td colSpan={6} className="p-0">
                                        <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: "auto", opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          transition={{ duration: 0.2, ease: "easeInOut" }}
                                          className="overflow-hidden"
                                        >
                                          <FactorDetailPanel signal={signal} />
                                        </motion.div>
                                      </td>
                                    </tr>
                                  )}
                                </AnimatePresence>
                              </Fragment>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </>
  );
}

// ── main component ────────────────────────────────────────────────────

export default function AnalysisDashboard() {
  const [stocks, setStocks]         = useState<Stock[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [openRatings, setOpenRatings] = useState<Set<Rating>>(new Set(RATINGS));

  // quick check
  const [quickInput, setQuickInput]   = useState("");
  const [quickMode, setQuickMode]     = useState(false);
  const [quickStocks, setQuickStocks] = useState<Stock[]>([]);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError]   = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setStocks(await fetchStocks());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runQuickCheck = async () => {
    const raw = quickInput.trim();
    if (!raw) return;
    setQuickLoading(true);
    setQuickError(null);
    setExpandedId(null);
    try {
      const result = await analyzeStocks(raw);
      if (result.length === 0) {
        setQuickError("No data found for the given tickers. Check the symbols and try again.");
      } else {
        setQuickStocks(result);
        setQuickMode(true);
        setOpenRatings(new Set(RATINGS));
      }
    } catch (e: unknown) {
      setQuickError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setQuickLoading(false);
    }
  };

  const exitQuickMode = () => {
    setQuickMode(false);
    setExpandedId(null);
    setQuickError(null);
  };

  const toggleRating = (r: Rating) =>
    setOpenRatings((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      return next;
    });

  const activeStocks = quickMode ? quickStocks : stocks;
  const byRating = groupByRating(activeStocks);
  const isLoading = quickMode ? quickLoading : loading;
  const activeError = quickMode ? quickError : error;

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[1920px] mx-auto px-8 py-12">
        {/* Header */}
        <header className="mb-10 border-b border-border pb-8">
          <p className="text-xs tracking-[0.35em] text-muted uppercase mb-3 font-mono">
            {quickMode ? "Swing Signal · Quick Check" : "Swing Signal"}
          </p>
          <div className="flex items-end justify-between gap-6">
            <div className="flex items-end gap-5">
              <h1 className="font-display text-6xl font-extrabold tracking-tight text-ticker leading-none">
                Analysis
              </h1>
              {quickMode && (
                <button
                  onClick={exitQuickMode}
                  className="text-[11px] font-mono tracking-[0.2em] uppercase text-muted hover:text-[#c8c4bc] transition-colors mb-2 border border-border px-3 py-1.5"
                >
                  ← Portfolio
                </button>
              )}
            </div>

            {/* Quick check input — always visible */}
            <div className="flex items-center gap-3 mb-1">
              {!quickMode && !loading && (
                <span className="text-xs text-muted font-mono mr-2">
                  {stocks.length} position{stocks.length !== 1 ? "s" : ""} scored
                </span>
              )}
              {quickMode && (
                <span className="text-xs text-muted font-mono mr-2">
                  {quickStocks.length} ticker{quickStocks.length !== 1 ? "s" : ""} analyzed
                </span>
              )}
              <input
                ref={inputRef}
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runQuickCheck(); }}
                placeholder="AAPL, MSFT, TSLA..."
                className="bg-bg border border-border px-3 py-2 font-mono text-xs text-[#c8c4bc] placeholder:text-muted/30 focus:outline-none focus:border-accent transition-colors w-52"
              />
              <button
                onClick={runQuickCheck}
                disabled={quickLoading || !quickInput.trim()}
                className="border border-border text-muted px-4 py-2 text-xs font-mono tracking-wider hover:text-[#c8c4bc] hover:border-muted transition-colors disabled:opacity-40"
              >
                {quickLoading ? "…" : "ANALYZE"}
              </button>
            </div>
          </div>
        </header>

        {/* Loading */}
        {isLoading && (
          <div className="text-muted text-sm font-mono py-20 text-center">
            <span className="tracking-widest">{quickLoading ? "FETCHING MARKET DATA" : "SCORING POSITIONS"}</span>
            <span className="animate-pulse">...</span>
          </div>
        )}

        {/* Error */}
        {!isLoading && activeError && (
          <div className="text-red text-sm font-mono py-8 border border-red/30 px-6">
            {activeError}
            {!quickMode && (
              <button onClick={load} className="ml-6 underline hover:no-underline">retry</button>
            )}
          </div>
        )}

        {/* Portfolio empty state */}
        {!quickMode && !loading && !error && stocks.length === 0 && (
          <div className="text-center py-32 text-muted text-sm font-mono tracking-widest">
            NO POSITIONS TO ANALYZE
            <br />
            <span className="text-xs mt-2 block">Add stocks on the Portfolio page first.</span>
          </div>
        )}

        {/* Rating sections */}
        {!isLoading && !activeError && activeStocks.length > 0 && (
          <RatingSections
            byRating={byRating}
            openRatings={openRatings}
            toggleRating={toggleRating}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
          />
        )}
      </div>
    </div>
  );
}
