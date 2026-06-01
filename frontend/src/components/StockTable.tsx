"use client";

import { useState, useMemo, Fragment } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Stock, Group, deleteStock } from "@/lib/api";
import StockLinks from "./StockLinks";
import EditStockModal from "./EditStockModal";

type SortKey = "name" | "added_date" | "since_added" | "day" | "week" | "month" | "ytd";
type SortDir = "asc" | "desc";

// ── small helpers ────────────────────────────────────────────────────

function fmt(v: number, currency: string, decimals = 2) {
  const sym = currency === "SEK" ? "kr " : currency === "EUR" ? "€" : "$";
  return `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>;
  const pos = value >= 0;
  return (
    <span className={pos ? "text-green" : "text-red"}>
      {pos ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function Price({ value, currency }: { value: number; currency: string }) {
  return <span>{fmt(value, currency)}</span>;
}

function SinceAdded({ current, added }: { current: number; added: number }) {
  if (!added) return <span className="text-muted">—</span>;
  return <Delta value={((current - added) / added) * 100} />;
}

function Week52({ value, currency }: { value: number | null; currency: string }) {
  if (value == null) return <span className="text-muted">—</span>;
  return <span>{fmt(value, currency)}</span>;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-muted/30 ml-1 text-[9px]">⇅</span>;
  return <span className="text-accent ml-1 text-[9px]">{dir === "asc" ? "↑" : "↓"}</span>;
}

// ── mini bar used by MACD hist and Bollinger %B ──────────────────────

function MiniBar({ pct, color }: { pct: number; color: string }) {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div className="w-16 h-1.5 bg-border rounded-sm overflow-hidden">
      <div className={`h-full rounded-sm ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

// ── sentiment helpers ────────────────────────────────────────────────

type Sentiment = { label: string; color: string };

function macdSentiment(line: number | null, hist: number | null): Sentiment | null {
  if (line == null || hist == null) return null;
  if (hist > 0 && line > 0) return { label: "Momentum building", color: "text-green" };
  if (hist > 0 && line < 0) return { label: "Recovering", color: "text-green/80" };
  if (hist < 0 && line > 0) return { label: "Momentum fading", color: "text-accent" };
  return { label: "Bearish momentum", color: "text-red" };
}

function maSentiment(ma50: number | null, ma200: number | null, cur: number): Sentiment | null {
  if (ma50 == null || ma200 == null) return null;
  const above50 = cur > ma50;
  const above200 = cur > ma200;
  const golden = ma50 > ma200;
  if (above50 && above200 && golden)  return { label: "Strong uptrend", color: "text-green" };
  if (above50 && above200 && !golden) return { label: "Recovery — death cross", color: "text-accent" };
  if (above50 && !above200)           return { label: "Short-term bounce", color: "text-accent" };
  if (!above50 && above200)           return { label: "Short-term weakness", color: "text-accent" };
  if (!above50 && !above200 && golden) return { label: "Weakening trend", color: "text-red" };
  return { label: "Downtrend", color: "text-red" };
}

function bollingerSentiment(pct: number | null): Sentiment | null {
  if (pct == null) return null;
  if (pct > 100) return { label: "Extended above band", color: "text-red" };
  if (pct > 80)  return { label: "Near upper band — stretched", color: "text-accent" };
  if (pct > 60)  return { label: "Upper range", color: "text-muted" };
  if (pct > 40)  return { label: "Midrange", color: "text-muted" };
  if (pct > 20)  return { label: "Lower range", color: "text-muted" };
  if (pct >= 0)  return { label: "Near lower band — depressed", color: "text-accent" };
  return { label: "Extended below band", color: "text-green" };
}

function atrSentiment(pctOfPrice: number | null): Sentiment | null {
  if (pctOfPrice == null) return null;
  if (pctOfPrice > 6)  return { label: "High volatility — wide stops needed", color: "text-red" };
  if (pctOfPrice > 3)  return { label: "Moderate volatility", color: "text-accent" };
  if (pctOfPrice > 1.5) return { label: "Normal volatility", color: "text-muted" };
  return { label: "Low volatility", color: "text-muted" };
}

function SentimentLabel({ s }: { s: Sentiment | null }) {
  if (!s) return null;
  return <p className={`text-[9px] font-mono mb-3 -mt-2 ${s.color}`}>{s.label}</p>;
}

// ── technical panel sections ─────────────────────────────────────────

function PanelLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] tracking-[0.2em] uppercase text-muted mb-1">{children}</p>;
}

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-1.5">
      <span className="text-[10px] text-muted font-mono w-14 shrink-0">{label}</span>
      <span className="text-[11px] font-mono text-[#c8c4bc]">{children}</span>
    </div>
  );
}

function MacdSection({ stock }: { stock: Stock }) {
  const { macd_line: line, macd_signal: signal, macd_hist: hist } = stock;
  const histMax = 0.5;
  const histPct = hist != null ? (Math.abs(hist) / histMax) * 100 : 0;
  return (
    <div>
      <PanelLabel>MACD (12,26,9)</PanelLabel>
      <SentimentLabel s={macdSentiment(line, hist)} />
      <PanelRow label="Line">
        {line != null ? (
          <span className={line >= 0 ? "text-green" : "text-red"}>
            {line >= 0 ? "+" : ""}{line.toFixed(3)}
          </span>
        ) : "—"}
      </PanelRow>
      <PanelRow label="Signal">
        {signal != null ? (
          <span className={signal >= 0 ? "text-green" : "text-red"}>
            {signal >= 0 ? "+" : ""}{signal.toFixed(3)}
          </span>
        ) : "—"}
      </PanelRow>
      <PanelRow label="Hist">
        {hist != null ? (
          <span className="flex items-center gap-2">
            <MiniBar pct={histPct} color={hist >= 0 ? "bg-green/70" : "bg-red/70"} />
            <span className={hist >= 0 ? "text-green" : "text-red"}>
              {hist >= 0 ? "+" : ""}{hist.toFixed(3)}
            </span>
          </span>
        ) : "—"}
      </PanelRow>
    </div>
  );
}

function MaSection({ stock }: { stock: Stock }) {
  const { ma50, ma200, current_price: cur, currency } = stock;
  return (
    <div>
      <PanelLabel>MA50 / MA200</PanelLabel>
      <SentimentLabel s={maSentiment(ma50, ma200, cur)} />
      <PanelRow label="50D">
        {ma50 != null ? (
          <span className="flex items-center gap-1.5">
            {fmt(ma50, currency)}
            <span className={cur >= ma50 ? "text-green text-[9px]" : "text-red text-[9px]"}>
              {cur >= ma50 ? "▲" : "▼"}
            </span>
          </span>
        ) : "—"}
      </PanelRow>
      <PanelRow label="200D">
        {ma200 != null ? (
          <span className="flex items-center gap-1.5">
            {fmt(ma200, currency)}
            <span className={cur >= ma200 ? "text-green text-[9px]" : "text-red text-[9px]"}>
              {cur >= ma200 ? "▲" : "▼"}
            </span>
          </span>
        ) : "—"}
      </PanelRow>
    </div>
  );
}

function BollingerSection({ stock }: { stock: Stock }) {
  const { bb_upper, bb_lower, bb_pct, currency } = stock;
  return (
    <div>
      <PanelLabel>Bollinger (20)</PanelLabel>
      <SentimentLabel s={bollingerSentiment(bb_pct)} />
      <PanelRow label="Upper">{bb_upper != null ? fmt(bb_upper, currency) : "—"}</PanelRow>
      <PanelRow label="Lower">{bb_lower != null ? fmt(bb_lower, currency) : "—"}</PanelRow>
      <PanelRow label="%B">
        {bb_pct != null ? (
          <span className="flex items-center gap-2">
            <MiniBar
              pct={bb_pct}
              color={bb_pct > 80 ? "bg-red/70" : bb_pct < 20 ? "bg-green/70" : "bg-accent/60"}
            />
            <span className="text-muted">{bb_pct.toFixed(0)}%</span>
          </span>
        ) : "—"}
      </PanelRow>
    </div>
  );
}

function AtrSection({ stock }: { stock: Stock }) {
  const { atr14, currency, current_price } = stock;
  const atrPct = atr14 != null && current_price > 0 ? (atr14 / current_price) * 100 : null;
  return (
    <div>
      <PanelLabel>ATR (14)</PanelLabel>
      <SentimentLabel s={atrSentiment(atrPct)} />
      <PanelRow label="Value">
        {atr14 != null ? (
          <span>{fmt(atr14, currency)}</span>
        ) : "—"}
      </PanelRow>
      {atrPct != null && (
        <PanelRow label="% Price">
          <span className="text-muted">{atrPct.toFixed(2)}%</span>
        </PanelRow>
      )}
    </div>
  );
}

function EmaSection({ stock }: { stock: Stock }) {
  const { ema9, ema21, currency } = stock;
  if (ema9 == null || ema21 == null) return null;
  const pctDiff = ema21 !== 0 ? ((ema9 - ema21) / ema21) * 100 : 0;
  const bullish = ema9 > ema21;
  return (
    <div>
      <PanelLabel>EMA 9 / 21</PanelLabel>
      <SentimentLabel s={bullish
        ? { label: pctDiff > 1 ? "Short-term uptrend" : "Mild bullish bias", color: "text-green" }
        : { label: pctDiff < -1 ? "Short-term downtrend" : "Mild bearish bias", color: "text-red" }
      } />
      <PanelRow label="EMA 9">{fmt(ema9, currency)}</PanelRow>
      <PanelRow label="EMA 21">{fmt(ema21, currency)}</PanelRow>
      <PanelRow label="Spread">
        <span className={bullish ? "text-green" : "text-red"}>
          {pctDiff >= 0 ? "+" : ""}{pctDiff.toFixed(2)}%
        </span>
      </PanelRow>
    </div>
  );
}

function StochSection({ stock }: { stock: Stock }) {
  const { stoch_k, stoch_d } = stock;
  if (stoch_k == null || stoch_d == null) return null;
  const oversold = stoch_k < 20;
  const overbought = stoch_k > 80;
  const zone = oversold ? "Oversold" : overbought ? "Overbought" : "Neutral";
  const zoneColor = oversold ? "text-green" : overbought ? "text-red" : "text-muted";
  const crossBull = oversold && stoch_k > stoch_d;
  const crossBear = overbought && stoch_k < stoch_d;
  const sentiment = crossBull
    ? { label: "Bullish cross from oversold", color: "text-green" }
    : crossBear
    ? { label: "Bearish cross from overbought", color: "text-red" }
    : oversold
    ? { label: "Oversold — watch for cross", color: "text-green/80" }
    : overbought
    ? { label: "Overbought — watch for cross", color: "text-accent" }
    : null;
  return (
    <div>
      <PanelLabel>Stochastic (14,3)</PanelLabel>
      <SentimentLabel s={sentiment} />
      <PanelRow label="%K">
        <span className={zoneColor}>{stoch_k.toFixed(1)}</span>
      </PanelRow>
      <PanelRow label="%D">
        <span className="text-[#c8c4bc]">{stoch_d.toFixed(1)}</span>
      </PanelRow>
      <PanelRow label="Zone">
        <span className={zoneColor}>{zone}</span>
      </PanelRow>
    </div>
  );
}

function AdxSection({ stock }: { stock: Stock }) {
  const { adx14, adx_plus_di, adx_minus_di, obv_slope } = stock;
  if (adx14 == null || adx_plus_di == null || adx_minus_di == null) return null;
  const strong = adx14 > 25;
  const ranging = adx14 < 20;
  const bullDir = adx_plus_di > adx_minus_di;
  const strengthLabel = strong ? "Trending" : ranging ? "Ranging" : "Moderate";
  const strengthColor = strong ? "text-green" : ranging ? "text-accent" : "text-muted";
  const sentiment = strong
    ? { label: bullDir ? "Strong bullish trend" : "Strong bearish trend", color: bullDir ? "text-green" : "text-red" }
    : ranging
    ? { label: "No clear trend — MA signals unreliable", color: "text-accent" }
    : null;
  const obvColor = obv_slope == null ? "text-muted" : obv_slope > 50 ? "text-green" : obv_slope < -50 ? "text-red" : obv_slope > 10 ? "text-green/60" : obv_slope < -10 ? "text-accent" : "text-muted";
  const obvLabel = obv_slope == null ? "—" : obv_slope > 50 ? "Accumulation" : obv_slope < -50 ? "Distribution" : obv_slope > 10 ? "Rising" : obv_slope < -10 ? "Falling" : "Flat";
  return (
    <div>
      <PanelLabel>ADX / OBV</PanelLabel>
      <SentimentLabel s={sentiment} />
      <PanelRow label="ADX">
        <span className={strengthColor}>{adx14.toFixed(1)} — {strengthLabel}</span>
      </PanelRow>
      <PanelRow label="+DI">
        <span className="text-green">{adx_plus_di.toFixed(1)}</span>
      </PanelRow>
      <PanelRow label="-DI">
        <span className="text-red">{adx_minus_di.toFixed(1)}</span>
      </PanelRow>
      {obv_slope != null && (
        <PanelRow label="OBV">
          <span className={obvColor}>{obvLabel} ({obv_slope > 0 ? "+" : ""}{obv_slope.toFixed(0)}%)</span>
        </PanelRow>
      )}
    </div>
  );
}

function TechnicalPanel({ stock, onEdit }: { stock: Stock; onEdit: () => void }) {
  return (
    <div className="bg-surface border-b border-border/60">
      <div className="grid grid-cols-4 gap-6 px-8 py-5">
        <MacdSection stock={stock} />
        <MaSection stock={stock} />
        <BollingerSection stock={stock} />
        <AtrSection stock={stock} />
        <EmaSection stock={stock} />
        <StochSection stock={stock} />
        <AdxSection stock={stock} />
      </div>
      {/* Notes + edit */}
      <div className="flex items-start justify-between gap-6 px-8 pb-5 border-t border-border/40 pt-4">
        <div className="flex-1">
          <p className="text-[9px] tracking-[0.2em] uppercase text-muted mb-1">Notes</p>
          <p className="text-[11px] font-mono text-[#c8c4bc]">
            {stock.source_notes || <span className="text-muted/40">No notes</span>}
          </p>
        </div>
        <button
          onClick={onEdit}
          className="text-muted/40 hover:text-[#c8c4bc] transition-colors text-xs font-mono tracking-wider shrink-0 mt-0.5"
          title="Edit notes and group"
        >
          ✎ EDIT
        </button>
      </div>
    </div>
  );
}

// ── table constants ───────────────────────────────────────────────────

const TH =
  "py-3 pr-3 text-left text-[10px] tracking-[0.2em] uppercase text-muted whitespace-nowrap";
const TH_SORT =
  "py-3 pr-3 text-left text-[10px] tracking-[0.2em] uppercase text-muted whitespace-nowrap cursor-pointer select-none hover:text-[#c8c4bc] transition-colors";
const TH_SORT_R =
  "py-3 pr-3 text-right text-[10px] tracking-[0.2em] uppercase text-muted whitespace-nowrap cursor-pointer select-none hover:text-[#c8c4bc] transition-colors";
const TD = "py-4 pr-3 font-mono text-sm";

// ── main component ────────────────────────────────────────────────────

export default function StockTable({
  stocks,
  groups,
  onDeleted,
  onEdited,
}: {
  stocks: Stock[];
  groups: Group[];
  onDeleted: () => void;
  onEdited: () => void;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingStock, setEditingStock] = useState<Stock | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    await deleteStock(id);
    setDeletingId(null);
    setConfirmingId(null);
    onDeleted();
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const toggleSector = (sector: string) => {
    setSectorFilter((cur) => (cur === sector ? null : sector));
  };

  const toggleExpand = (id: number) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const processed = useMemo(() => {
    let arr = sectorFilter
      ? stocks.filter((s) => (s.industry || s.sector) === sectorFilter)
      : [...stocks];

    if (!sortKey) return arr;

    return arr.sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      switch (sortKey) {
        case "name":
          va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
        case "added_date":
          va = a.added_date; vb = b.added_date; break;
        case "since_added":
          va = a.added_price ? (a.current_price - a.added_price) / a.added_price : -Infinity;
          vb = b.added_price ? (b.current_price - b.added_price) / b.added_price : -Infinity;
          break;
        case "day":
          va = a.day_change_pct ?? -Infinity; vb = b.day_change_pct ?? -Infinity; break;
        case "week":
          va = a.week_change_pct ?? -Infinity; vb = b.week_change_pct ?? -Infinity; break;
        case "month":
          va = a.month_change_pct ?? -Infinity; vb = b.month_change_pct ?? -Infinity; break;
        case "ytd":
          va = a.ytd_change_pct ?? -Infinity; vb = b.ytd_change_pct ?? -Infinity; break;
      }
      const dir = sortDir === "asc" ? 1 : -1;
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  }, [stocks, sortKey, sortDir, sectorFilter]);

  if (stocks.length === 0) {
    return (
      <div className="text-center py-32 text-muted text-sm font-mono tracking-widest">
        NO POSITIONS TRACKED
        <br />
        <span className="text-xs mt-2 block">Add your first stock to get started.</span>
      </div>
    );
  }

  return (
    <div>
      {sectorFilter && (
        <div className="flex items-center gap-3 mb-4 px-1">
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted">Filtered:</span>
          <span className="text-[10px] px-2 py-1 border border-accent text-accent tracking-wider font-mono">
            {sectorFilter}
          </span>
          <button
            onClick={() => setSectorFilter(null)}
            className="text-[10px] text-muted hover:text-[#c8c4bc] font-mono tracking-wider transition-colors"
          >
            ✗ CLEAR
          </button>
          <span className="text-[10px] text-muted font-mono">
            {processed.length} of {stocks.length}
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="py-3 w-6 pr-1" />
              <th className={TH}>Ticker</th>
              <th className={TH_SORT} onClick={() => toggleSort("name")}>
                Name <SortIcon active={sortKey === "name"} dir={sortDir} />
              </th>
              <th className={TH}>Sector</th>
              <th className={TH_SORT} onClick={() => toggleSort("added_date")}>
                Added <SortIcon active={sortKey === "added_date"} dir={sortDir} />
              </th>
              <th className={`${TH} text-right`}>Added&nbsp;@</th>
              <th className={`${TH} text-right`}>Current</th>
              <th
                className="py-3 pr-3 text-right text-[10px] tracking-[0.2em] uppercase text-muted cursor-pointer select-none hover:text-[#c8c4bc] transition-colors leading-tight"
                onClick={() => toggleSort("since_added")}
              >
                Since<br />Added <SortIcon active={sortKey === "since_added"} dir={sortDir} />
              </th>
              <th className={TH_SORT_R} onClick={() => toggleSort("day")}>
                1D <SortIcon active={sortKey === "day"} dir={sortDir} />
              </th>
              <th className={TH_SORT_R} onClick={() => toggleSort("week")}>
                1W <SortIcon active={sortKey === "week"} dir={sortDir} />
              </th>
              <th className={TH_SORT_R} onClick={() => toggleSort("month")}>
                1M <SortIcon active={sortKey === "month"} dir={sortDir} />
              </th>
              <th className={TH_SORT_R} onClick={() => toggleSort("ytd")}>
                YTD <SortIcon active={sortKey === "ytd"} dir={sortDir} />
              </th>
              <th className={`${TH} text-right`}>52W&nbsp;H</th>
              <th className={`${TH} text-right`}>52W&nbsp;L</th>
              <th className={`${TH} text-right`}>RSI&nbsp;14</th>
              <th className={`${TH} text-right`}>Vol&nbsp;/&nbsp;10D</th>
              <th className={`${TH} pr-0`}>Links</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {processed.map((stock, i) => {
                const sectorLabel = stock.industry || stock.sector;
                const isActiveSector = sectorFilter === sectorLabel;
                const isExpanded = expandedId === stock.id;
                return (
                  <Fragment key={stock.id}>
                    <motion.tr
                      key={stock.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ delay: i * 0.04, duration: 0.25 }}
                      className="border-b border-border hover:bg-surface group transition-colors"
                    >
                      <td className="py-4 pr-1 w-6">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleExpand(stock.id); }}
                          className="text-muted/40 hover:text-muted transition-colors"
                          title="Expand technical indicators"
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
                        <span className="text-ticker font-semibold tracking-wider">
                          {stock.ticker}
                        </span>
                      </td>
                      <td className={`${TD} max-w-[180px]`}>
                        <span className="truncate block text-[#b8b3ab]" title={stock.name}>
                          {stock.name}
                        </span>
                      </td>
                      <td className={TD}>
                        {sectorLabel ? (
                          <button
                            onClick={() => toggleSector(sectorLabel)}
                            className={`text-[10px] px-2 py-1 border tracking-wider transition-colors ${
                              isActiveSector
                                ? "border-accent text-accent"
                                : "border-border text-muted hover:border-muted hover:text-[#c8c4bc]"
                            }`}
                          >
                            {sectorLabel}
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className={`${TD} text-muted`}>{stock.added_date}</td>
                      <td className={`${TD} text-right text-muted`}>
                        <Price value={stock.added_price} currency={stock.currency} />
                      </td>
                      <td className={`${TD} text-right text-ticker font-semibold`}>
                        <Price value={stock.current_price} currency={stock.currency} />
                      </td>
                      <td className={`${TD} text-right`}>
                        <SinceAdded current={stock.current_price} added={stock.added_price} />
                      </td>
                      <td className={`${TD} text-right`}>
                        <Delta value={stock.day_change_pct} />
                      </td>
                      <td className={`${TD} text-right`}>
                        <Delta value={stock.week_change_pct} />
                      </td>
                      <td className={`${TD} text-right`}>
                        <Delta value={stock.month_change_pct} />
                      </td>
                      <td className={`${TD} text-right`}>
                        <Delta value={stock.ytd_change_pct} />
                      </td>
                      <td className={`${TD} text-right`}>
                        <Week52 value={stock.week52_high} currency={stock.currency} />
                      </td>
                      <td className={`${TD} text-right`}>
                        <Week52 value={stock.week52_low} currency={stock.currency} />
                      </td>
                      <td className={`${TD} text-right`}>
                        {stock.rsi14 == null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className={stock.rsi14 > 70 ? "text-red" : stock.rsi14 < 30 ? "text-green" : "text-muted"}>
                            {stock.rsi14.toFixed(1)}
                          </span>
                        )}
                      </td>
                      <td className={`${TD} text-right`}>
                        {stock.volume && stock.avg_volume_10d ? (
                          <span className={stock.volume / stock.avg_volume_10d > 1.5 ? "text-green" : "text-muted"}>
                            {(stock.volume / stock.avg_volume_10d).toFixed(1)}×
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className={`${TD} pr-0`}>
                        <div className="flex items-center gap-4">
                          <StockLinks stock={stock} />
                          {confirmingId === stock.id ? (
                            <span className="flex items-center gap-2 font-mono text-xs">
                              <span className="text-red tracking-wider">REMOVE?</span>
                              <button
                                onClick={() => handleDelete(stock.id)}
                                disabled={deletingId === stock.id}
                                className="text-red hover:brightness-125 transition-all leading-none px-0.5"
                                title="Confirm remove"
                              >
                                {deletingId === stock.id ? "…" : "✓"}
                              </button>
                              <button
                                onClick={() => setConfirmingId(null)}
                                className="text-muted hover:text-ticker transition-colors leading-none px-0.5"
                                title="Cancel"
                              >
                                ✗
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmingId(stock.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted hover:text-red transition-all duration-150 text-base leading-none"
                              title="Remove position"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                    <AnimatePresence>
                      {isExpanded && (
                        <tr key={`${stock.id}-detail`}>
                          <td colSpan={17} className="p-0">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <TechnicalPanel
                                stock={stock}
                                onEdit={() => setEditingStock(stock)}
                              />
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

      {editingStock && (
        <EditStockModal
          stock={editingStock}
          groups={groups}
          onClose={() => setEditingStock(null)}
          onSaved={() => { setEditingStock(null); onEdited(); }}
        />
      )}
    </div>
  );
}
