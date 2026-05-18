"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { previewStock, addStock, StockPreview, Group } from "@/lib/api";

interface Props {
  groups: Group[];
  onClose: () => void;
  onAdded: () => void;
}

interface PreviewResult {
  ticker: string;
  data: StockPreview | null;
  error: string | null;
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline border-b border-border pb-2.5">
      <span className="text-[10px] tracking-[0.2em] uppercase text-muted">{label}</span>
      <span className={`text-sm font-mono ${highlight ? "text-ticker font-semibold" : "text-[#c8c4bc]"}`}>
        {value}
      </span>
    </div>
  );
}

function fmtPrice(price: number, currency: string) {
  const sym = currency === "SEK" ? "kr " : currency === "EUR" ? "€" : "$";
  return `${sym}${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseTickers(raw: string): string[] {
  return raw.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
}

export default function AddStockModal({ groups, onClose, onAdded }: Props) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [tickerInput, setTickerInput] = useState("");
  const [notes, setNotes] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [previews, setPreviews] = useState<PreviewResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const isBatch = parseTickers(tickerInput).length > 1 || previews.length > 1;
  const validPreviews = previews.filter((p) => p.data);

  const handlePreview = async () => {
    const tickers = parseTickers(tickerInput);
    if (!tickers.length) return;
    setLoading(true);
    setError(null);

    const results = await Promise.allSettled(tickers.map((t) => previewStock(t)));
    setPreviews(
      results.map((r, i) => ({
        ticker: tickers[i],
        data: r.status === "fulfilled" ? r.value : null,
        error: r.status === "rejected" ? (r.reason as Error).message : null,
      }))
    );

    setLoading(false);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    if (!validPreviews.length) return;
    setLoading(true);
    setProgress({ done: 0, total: validPreviews.length });

    for (let i = 0; i < validPreviews.length; i++) {
      try {
        await addStock(validPreviews[i].ticker, notes, groupId);
      } catch {
        // already tracked — skip silently
      }
      setProgress({ done: i + 1, total: validPreviews.length });
    }

    setLoading(false);
    onAdded();
  };

  const confirmLabel = loading && progress
    ? `Adding ${progress.done} / ${progress.total}...`
    : isBatch
    ? `Confirm + Track ${validPreviews.length}`
    : "Confirm + Track";

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="bg-surface border border-border w-full max-w-lg p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "form" ? (
          <>
            <div className="mb-8">
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted mb-2">New Position</p>
              <h2 className="font-display text-3xl font-bold text-ticker">Add Stock</h2>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted block mb-2">
                  Ticker Symbol
                  <span className="ml-2 normal-case tracking-normal text-muted/50">
                    — comma-separate for multiple
                  </span>
                </label>
                <input
                  ref={inputRef}
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handlePreview()}
                  placeholder="AAPL  or  AAPL, GOOGL, ERIC-B.ST"
                  className="w-full bg-bg border border-border px-4 py-3 font-mono text-ticker placeholder:text-muted/40 focus:outline-none focus:border-accent text-sm transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted block mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why are you tracking this?"
                  rows={3}
                  className="w-full bg-bg border border-border px-4 py-3 font-mono text-sm placeholder:text-muted/50 focus:outline-none focus:border-border/80 resize-none text-[#c8c4bc] transition-colors"
                />
              </div>

              {groups.length > 0 && (
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-muted block mb-2">
                    Group
                  </label>
                  <select
                    value={groupId ?? ""}
                    onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-bg border border-border px-4 py-3 font-mono text-sm text-[#c8c4bc] focus:outline-none focus:border-accent transition-colors appearance-none"
                  >
                    <option value="">Ungrouped</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {error && <p className="text-red text-xs font-mono">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 border border-border text-muted hover:text-[#c8c4bc] text-xs tracking-widest uppercase transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePreview}
                  disabled={loading || !tickerInput.trim()}
                  className="flex-1 py-3 bg-accent text-bg font-display font-bold text-sm disabled:opacity-40 hover:brightness-110 transition-all tracking-wide"
                >
                  {loading ? "Looking up..." : "Preview →"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-[10px] tracking-[0.3em] uppercase text-muted mb-2">
                  {isBatch
                    ? `${validPreviews.length} of ${previews.length} resolved`
                    : "Confirm Position"}
                </p>
                <h2 className="font-display text-3xl font-bold text-ticker">
                  {isBatch ? "Batch Add" : previews[0]?.ticker ?? ""}
                </h2>
              </div>
              <button
                onClick={() => { setStep("form"); setError(null); }}
                className="text-muted hover:text-[#c8c4bc] text-xs font-mono tracking-wider transition-colors mt-1"
              >
                ← BACK
              </button>
            </div>

            {isBatch ? (
              <div className="mb-6 max-h-60 overflow-y-auto">
                <table className="w-full text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-border text-[10px] tracking-widest uppercase text-muted">
                      <th className="text-left py-2 pr-4">Ticker</th>
                      <th className="text-left py-2 pr-4">Name</th>
                      <th className="text-right py-2 pr-4">Price</th>
                      <th className="text-left py-2">Sector</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previews.map((p) => (
                      <tr key={p.ticker} className="border-b border-border/40">
                        <td className="py-2.5 pr-4">
                          <span className={p.data ? "text-ticker font-semibold" : "text-muted line-through"}>
                            {p.ticker}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 max-w-[160px] truncate">
                          {p.data ? (
                            <span className="text-[#b8b3ab]">{p.data.name}</span>
                          ) : (
                            <span className="text-red">{p.error ?? "Not found"}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-ticker">
                          {p.data ? fmtPrice(p.data.current_price, p.data.currency) : "—"}
                        </td>
                        <td className="py-2.5 text-muted truncate max-w-[100px]">
                          {p.data?.sector ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : previews[0]?.data ? (
              <div className="space-y-3 mb-6">
                <Row label="Name" value={previews[0].data.name} />
                <Row label="Sector" value={previews[0].data.sector || "—"} />
                <Row label="Industry" value={previews[0].data.industry || "—"} />
                <Row label="Current Price" value={fmtPrice(previews[0].data.current_price, previews[0].data.currency)} highlight />
                <Row label="Currency" value={previews[0].data.currency} />
                <Row label="Avanza Link" value={previews[0].data.avanza_url ? "✓ Resolved" : "Not available"} />
                {notes && <Row label="Thesis" value={notes} />}
              </div>
            ) : (
              <p className="text-red text-sm font-mono mb-6">
                {previews[0]?.error ?? "Ticker not found"}
              </p>
            )}

            {notes && isBatch && (
              <p className="text-[10px] text-muted font-mono mb-5 border border-border/50 px-3 py-2">
                Source applied to all:{" "}
                <span className="text-[#c8c4bc]">{notes}</span>
              </p>
            )}

            {!isBatch && previews[0]?.data && (
              <p className="text-[10px] text-muted font-mono mb-6 leading-relaxed">
                Today&apos;s price will be saved as your entry price.
              </p>
            )}

            {error && <p className="text-red text-xs font-mono mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 border border-border text-muted hover:text-[#c8c4bc] text-xs tracking-widest uppercase transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || validPreviews.length === 0}
                className="flex-1 py-3 bg-green text-bg font-display font-bold text-sm disabled:opacity-40 hover:brightness-110 transition-all tracking-wide"
              >
                {confirmLabel}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
