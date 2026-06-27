"use client";

import { useState, useEffect } from "react";
import { fetchIndices, IndexQuote } from "@/lib/api";

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted/40">—</span>;
  const pos = value >= 0;
  return (
    <span className={pos ? "text-green" : "text-red"}>
      {pos ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function RsiCell({ rsi }: { rsi: number | null }) {
  if (rsi == null) return <span className="text-muted/40">—</span>;
  const color = rsi > 70 ? "text-red" : rsi < 30 ? "text-green" : "text-muted/70";
  const label = rsi > 70 ? " OB" : rsi < 30 ? " OS" : "";
  return (
    <span className={color}>
      {rsi.toFixed(1)}<span className="text-[10px]">{label}</span>
    </span>
  );
}

function MaRegime({ price, ma50, ma200 }: { price: number; ma50: number | null; ma200: number | null }) {
  if (ma50 == null && ma200 == null) return <span className="text-muted/40">—</span>;
  const above50  = ma50  != null ? price > ma50  : null;
  const above200 = ma200 != null ? price > ma200 : null;
  const golden   = ma50 != null && ma200 != null ? ma50 > ma200 : null;

  let label: string;
  let color: string;
  if (above50 && above200 && golden)        { label = "Bull"; color = "text-green"; }
  else if (above50 && above200 && !golden)  { label = "Recovery"; color = "text-accent"; }
  else if (above50 === false && above200 === false && golden === false) { label = "Bear"; color = "text-red"; }
  else if (above50 === false && above200)   { label = "Pullback"; color = "text-accent"; }
  else if (above50 && above200 === false)   { label = "Bounce"; color = "text-accent"; }
  else                                       { label = "Mixed"; color = "text-muted/60"; }

  const ma50Arrow  = above50  != null ? (above50  ? "▲" : "▼") : "";
  const ma200Arrow = above200 != null ? (above200 ? "▲" : "▼") : "";

  return (
    <span className={`${color} text-[11px]`}>
      {label}
      <span className="text-muted/40 text-[9px] ml-1.5 font-mono">
        {ma50Arrow && `50${ma50Arrow}`}{ma50Arrow && ma200Arrow && " "}
        {ma200Arrow && `200${ma200Arrow}`}
      </span>
    </span>
  );
}

const TH = "pb-2 pr-6 text-left text-[10px] tracking-[0.2em] uppercase text-muted/50 whitespace-nowrap font-mono";
const TD = "py-2.5 pr-6 font-mono text-sm";

export default function IndexBar() {
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIndices()
      .then(setIndices)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mb-10 border border-border/30 px-6 py-4">
        <span className="text-[10px] tracking-[0.2em] text-muted/40 font-mono uppercase animate-pulse">
          Loading market data...
        </span>
      </div>
    );
  }

  if (indices.length === 0) return null;

  return (
    <div className="mb-10 border border-border/30">
      <div className="px-6 py-2 border-b border-border/20">
        <span className="text-[9px] tracking-[0.3em] text-muted/40 font-mono uppercase">
          Market Overview
        </span>
      </div>
      <div className="overflow-x-auto px-6 py-1">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className={TH}>Index</th>
              <th className={`${TH} text-right`}>Price</th>
              <th className={TH}>Day</th>
              <th className={TH}>Week</th>
              <th className={TH}>Month</th>
              <th className={TH}>YTD</th>
              <th className={TH}>52W High</th>
              <th className={TH}>52W Low</th>
              <th className={TH}>RSI 14</th>
              <th className={`${TH} pr-0`}>MA Regime</th>
            </tr>
          </thead>
          <tbody>
            {indices.map((q) => (
              <tr key={q.ticker} className="border-t border-border/20 hover:bg-surface/50 transition-colors">
                <td className={TD}>
                  <span className="text-[#c8c4bc] font-semibold">{q.name}</span>
                  <span className="text-muted/30 text-[10px] ml-2">{q.ticker}</span>
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  <span className="text-ticker">
                    {q.price > 0
                      ? q.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : "—"}
                  </span>
                </td>
                <td className={`${TD} tabular-nums`}><Delta value={q.day_change_pct} /></td>
                <td className={`${TD} tabular-nums`}><Delta value={q.week_change_pct} /></td>
                <td className={`${TD} tabular-nums`}><Delta value={q.month_change_pct} /></td>
                <td className={`${TD} tabular-nums`}><Delta value={q.ytd_change_pct} /></td>
                <td className={`${TD} tabular-nums text-muted/60`}>
                  {q.week52_high != null
                    ? q.week52_high.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : "—"}
                </td>
                <td className={`${TD} tabular-nums text-muted/60`}>
                  {q.week52_low != null
                    ? q.week52_low.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : "—"}
                </td>
                <td className={`${TD} tabular-nums`}>
                  <RsiCell rsi={q.rsi14} />
                </td>
                <td className={`${TD} pr-0`}>
                  <MaRegime price={q.price} ma50={q.ma50} ma200={q.ma200} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
