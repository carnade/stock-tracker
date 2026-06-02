"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { fetchStocks, Stock } from "@/lib/api";
import {
  detectSignals,
  StockSignals,
  SignalResult,
  SignalType,
  BULLISH_SIGNAL_TYPES,
  BEARISH_SIGNAL_TYPES,
  SIGNAL_LABELS,
} from "@/lib/signalEngine";
import StockLinks from "./StockLinks";

// ── helpers ───────────────────────────────────────────────────────────

function ConfidenceDots({ confidence, direction }: { confidence: SignalResult["confidence"]; direction: SignalResult["direction"] }) {
  const color = direction === "bullish" ? "text-green" : "text-accent";
  const filled = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  return (
    <div className={`flex items-center gap-0.5 font-mono text-[11px] ${color}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= filled ? "" : "opacity-20"}>●</span>
      ))}
    </div>
  );
}

function SignalBadge({ direction }: { direction: SignalResult["direction"] }) {
  return direction === "bullish"
    ? <span className="text-[9px] font-mono tracking-wider text-green border border-green/30 px-1.5 py-0.5">ENTRY</span>
    : <span className="text-[9px] font-mono tracking-wider text-accent border border-accent/30 px-1.5 py-0.5">EXIT</span>;
}

const TH = "py-3 pr-4 text-left text-[10px] tracking-[0.2em] uppercase text-muted whitespace-nowrap";
const TD = "py-4 pr-4 font-mono text-sm";

// ── signal row ────────────────────────────────────────────────────────

function SignalRow({ stock, signal, index }: { stock: Stock; signal: SignalResult; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <motion.tr
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03, duration: 0.2 }}
        className="border-b border-border/30 hover:bg-surface transition-colors"
      >
        <td className="py-4 pr-1 w-6">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted/40 hover:text-muted transition-colors"
          >
            <span
              className="text-[10px] inline-block transition-transform duration-200"
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
          </button>
        </td>
        <td className={TD}>
          <span className="text-ticker font-semibold tracking-wider">{stock.ticker}</span>
        </td>
        <td className="py-4 pr-2 w-4">
          <span className={`text-[11px] leading-none ${stock.owned ? "text-green" : "text-muted/20"}`} title={stock.owned ? "Owned" : "Not owned"}>
            {stock.owned ? "●" : "○"}
          </span>
        </td>
        <td className={`${TD} max-w-[180px]`}>
          <span className="truncate block text-[#b8b3ab]" title={stock.name}>
            {stock.name !== stock.ticker ? stock.name : ""}
          </span>
        </td>
        <td className={`${TD} text-right`}>
          <span className="text-ticker tabular-nums">
            {stock.current_price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {stock.currency !== "USD" && (
              <span className="text-muted/50 text-[10px] ml-1">{stock.currency}</span>
            )}
          </span>
        </td>
        <td className={TD}>
          <ConfidenceDots confidence={signal.confidence} direction={signal.direction} />
        </td>
        <td className={TD}>
          <SignalBadge direction={signal.direction} />
        </td>
        <td className={`${TD} text-[11px]`}>
          {signal.target !== "N/A"
            ? <span className="text-green/70">{signal.target}</span>
            : <span className="text-muted/30">—</span>}
        </td>
        <td className={`${TD} text-[11px]`}>
          {signal.stop !== "N/A"
            ? <span className="text-red/70">{signal.stop}</span>
            : <span className="text-muted/30">—</span>}
        </td>
        <td className={`${TD} pr-0`}>
          <StockLinks stock={stock} />
        </td>
      </motion.tr>
      <AnimatePresence>
        {expanded && (
          <tr key={`${stock.id}-${signal.type}-detail`}>
            <td colSpan={10} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="bg-surface border-b border-border/60 px-8 py-4">
                  <p className="text-[9px] tracking-[0.2em] uppercase text-muted mb-3">Triggered conditions</p>
                  <ul className="space-y-1">
                    {signal.triggeredConditions.map((c, i) => (
                      <li key={i} className={`text-[11px] font-mono ${signal.direction === "bullish" ? "text-green/80" : "text-accent/80"}`}>
                        · {c}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

// ── signal bucket ─────────────────────────────────────────────────────

function SignalBucket({
  type,
  items,
  defaultOpen,
}: {
  type: SignalType;
  items: { stock: Stock; signal: SignalResult }[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isBullish = BULLISH_SIGNAL_TYPES.includes(type);
  const borderCls = isBullish ? "border-green/20" : "border-accent/20";
  const headerCls = isBullish ? "text-green/80" : "text-accent";

  return (
    <div className={`mb-5 border ${borderCls}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-surface transition-colors text-left"
      >
        <span
          className="text-[10px] text-muted/40 inline-block transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▶
        </span>
        <span className={`text-xs font-mono tracking-[0.25em] font-semibold ${headerCls}`}>
          {SIGNAL_LABELS[type].toUpperCase()}
        </span>
        <span className="text-[10px] text-muted font-mono ml-1">
          {items.length} position{items.length !== 1 ? "s" : ""}
        </span>
      </button>

      <AnimatePresence>
        {open && (
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
                    <th className="py-3 pr-2 w-4" />
                    <th className={TH}>Name</th>
                    <th className={`${TH} text-right`}>Price</th>
                    <th className={TH}>Confidence</th>
                    <th className={TH}>Type</th>
                    <th className={TH}>Target</th>
                    <th className={TH}>Stop</th>
                    <th className={`${TH} pr-0`}>Links</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {items.map(({ stock, signal }, i) => (
                      <SignalRow key={`${stock.id}-${signal.type}`} stock={stock} signal={signal} index={i} />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── no-signal bucket ──────────────────────────────────────────────────

function NoSignalBucket({ stocks }: { stocks: Stock[] }) {
  const [open, setOpen] = useState(false);
  if (stocks.length === 0) return null;

  return (
    <div className="mb-5 border border-border/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-surface transition-colors text-left"
      >
        <span
          className="text-[10px] text-muted/40 inline-block transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▶
        </span>
        <span className="text-xs font-mono tracking-[0.25em] font-semibold text-muted/50">
          NO SIGNAL
        </span>
        <span className="text-[10px] text-muted/40 font-mono ml-1">
          {stocks.length} position{stocks.length !== 1 ? "s" : ""}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 px-8 py-4 flex flex-wrap gap-3">
              {stocks.map((s) => (
                <span key={s.id} className="text-xs font-mono text-muted/40 tracking-wider">{s.ticker}</span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── summary strip ─────────────────────────────────────────────────────

function SummaryStrip({ allSignals }: { allSignals: StockSignals[] }) {
  const counts = useMemo(() => {
    const map: Partial<Record<SignalType, number>> = {};
    for (const { signals } of allSignals) {
      for (const sig of signals) {
        map[sig.type] = (map[sig.type] ?? 0) + 1;
      }
    }
    return map;
  }, [allSignals]);

  const types = [...BULLISH_SIGNAL_TYPES, ...BEARISH_SIGNAL_TYPES];
  const active = types.filter((t) => (counts[t] ?? 0) > 0);
  if (active.length === 0) return null;

  return (
    <div className="flex items-center gap-2 mb-10 flex-wrap">
      {active.map((t) => {
        const isBullish = BULLISH_SIGNAL_TYPES.includes(t);
        const cls = isBullish
          ? "border-green/30 text-green/80 bg-green/5"
          : "border-accent/30 text-accent bg-accent/5";
        return (
          <span key={t} className={`px-3 py-1.5 border text-[10px] font-mono tracking-wider ${cls}`}>
            {SIGNAL_LABELS[t].toUpperCase()} — {counts[t]}
          </span>
        );
      })}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────

export default function SignalsDashboard() {
  const [stocks, setStocks]   = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

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

  const allSignals = useMemo(() => stocks.map(detectSignals), [stocks]);

  const buckets = useMemo(() => {
    const map: Partial<Record<SignalType, { stock: Stock; signal: SignalResult }[]>> = {};
    const noSignal: Stock[] = [];
    for (const { stock, signals } of allSignals) {
      if (signals.length === 0) { noSignal.push(stock); continue; }
      for (const signal of signals) {
        if (!map[signal.type]) map[signal.type] = [];
        map[signal.type]!.push({ stock, signal });
      }
    }
    return { map, noSignal };
  }, [allSignals]);

  const totalSignals = allSignals.reduce((n, s) => n + s.signals.length, 0);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[1920px] mx-auto px-8 py-12">
        {/* Header */}
        <header className="mb-10 border-b border-border pb-8">
          <p className="text-xs tracking-[0.35em] text-muted uppercase mb-3 font-mono">Entry / Exit</p>
          <div className="flex items-end justify-between gap-6">
            <h1 className="font-display text-6xl font-extrabold tracking-tight text-ticker leading-none">
              Signals
            </h1>
            {!loading && (
              <span className="text-xs text-muted font-mono mb-1">
                {totalSignals} signal{totalSignals !== 1 ? "s" : ""} across {stocks.length} position{stocks.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </header>

        {loading && (
          <div className="text-muted text-sm font-mono py-20 text-center">
            <span className="tracking-widest">SCANNING POSITIONS</span>
            <span className="animate-pulse">...</span>
          </div>
        )}

        {!loading && error && (
          <div className="text-red text-sm font-mono py-8 border border-red/30 px-6">
            {error}
            <button onClick={load} className="ml-6 underline hover:no-underline">retry</button>
          </div>
        )}

        {!loading && !error && stocks.length === 0 && (
          <div className="text-center py-32 text-muted text-sm font-mono tracking-widest">
            NO POSITIONS TO SCAN
            <br />
            <span className="text-xs mt-2 block">Add stocks on the Portfolio page first.</span>
          </div>
        )}

        {!loading && !error && stocks.length > 0 && (
          <>
            <SummaryStrip allSignals={allSignals} />

            {BULLISH_SIGNAL_TYPES.map((type) => {
              const items = buckets.map[type];
              if (!items || items.length === 0) return null;
              return (
                <SignalBucket key={type} type={type} items={items} defaultOpen={true} />
              );
            })}

            {BEARISH_SIGNAL_TYPES.map((type) => {
              const items = buckets.map[type];
              if (!items || items.length === 0) return null;
              return (
                <SignalBucket key={type} type={type} items={items} defaultOpen={false} />
              );
            })}

            <NoSignalBucket stocks={buckets.noSignal} />
          </>
        )}
      </div>
    </div>
  );
}
