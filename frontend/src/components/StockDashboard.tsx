"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchStocks, fetchGroups, createGroup, Stock, Group } from "@/lib/api";
import GroupSection from "./GroupSection";
import AddStockModal from "./AddStockModal";
import IndexBar from "./IndexBar";

export default function StockDashboard() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const groupInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [stockData, groupData] = await Promise.all([fetchStocks(), fetchGroups()]);
      setStocks(stockData);
      setGroups(groupData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (addingGroup) groupInputRef.current?.focus();
  }, [addingGroup]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setSavingGroup(true);
    try {
      await createGroup(newGroupName.trim());
      setNewGroupName("");
      setAddingGroup(false);
      await reload();
    } catch {
      // name conflict or network error — stay open
    } finally {
      setSavingGroup(false);
    }
  };

  const ungrouped = stocks.filter((s) => s.group_id === null);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[1920px] mx-auto px-8 py-12">
        {/* Header */}
        <header className="mb-16 flex items-end justify-between border-b border-border pb-8">
          <div>
            <p className="text-xs tracking-[0.35em] text-muted uppercase mb-3 font-mono">
              Personal Equity Tracker
            </p>
            <h1 className="font-display text-6xl font-extrabold tracking-tight text-ticker leading-none">
              Portfolio
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {!loading && (
              <span className="text-xs text-muted font-mono">
                {stocks.length} position{stocks.length !== 1 ? "s" : ""}
              </span>
            )}

            {/* Inline add-group input */}
            {addingGroup ? (
              <div className="flex items-center gap-2">
                <input
                  ref={groupInputRef}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateGroup();
                    if (e.key === "Escape") { setAddingGroup(false); setNewGroupName(""); }
                  }}
                  placeholder="Group name"
                  className="bg-bg border border-border px-3 py-2 font-mono text-sm text-[#c8c4bc] placeholder:text-muted/40 focus:outline-none focus:border-accent transition-colors w-40"
                />
                <button
                  onClick={handleCreateGroup}
                  disabled={savingGroup || !newGroupName.trim()}
                  className="px-3 py-2 bg-accent text-bg text-xs font-mono font-bold disabled:opacity-40 hover:brightness-110 transition-all tracking-wide"
                >
                  {savingGroup ? "…" : "ADD"}
                </button>
                <button
                  onClick={() => { setAddingGroup(false); setNewGroupName(""); }}
                  className="text-muted hover:text-[#c8c4bc] text-xs font-mono transition-colors px-1"
                >
                  ✗
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingGroup(true)}
                className="border border-border text-muted px-4 py-2.5 text-xs font-mono tracking-wider hover:text-[#c8c4bc] hover:border-muted transition-colors"
              >
                + ADD GROUP
              </button>
            )}

            <button
              onClick={() => setShowModal(true)}
              className="border border-accent text-accent px-6 py-2.5 text-sm font-mono tracking-wider hover:bg-accent hover:text-bg transition-colors duration-150"
            >
              + ADD POSITION
            </button>
          </div>
        </header>

        <IndexBar />

        {/* Loading / error */}
        {loading && (
          <div className="text-muted text-sm font-mono py-20 text-center">
            <span className="tracking-widest">FETCHING MARKET DATA</span>
            <span className="animate-pulse">...</span>
            {stocks.length > 0 && (
              <p className="text-xs mt-3 text-muted/60">
                Refreshing prices for {stocks.length} position{stocks.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
        {error && (
          <div className="text-red text-sm font-mono py-8 border border-red/30 px-6">
            {error}
            <button onClick={reload} className="ml-6 underline hover:no-underline">retry</button>
          </div>
        )}

        {/* Group sections */}
        {!loading && !error && (
          <>
            {groups.map((group) => (
              <GroupSection
                key={group.id}
                group={group}
                stocks={stocks.filter((s) => s.group_id === group.id)}
                groups={groups}
                onChanged={reload}
              />
            ))}
            {/* Ungrouped always at bottom */}
            {(ungrouped.length > 0 || groups.length === 0) && (
              <GroupSection
                key="ungrouped"
                group={null}
                stocks={ungrouped}
                groups={groups}
                onChanged={reload}
              />
            )}
          </>
        )}
      </div>

      {showModal && (
        <AddStockModal
          groups={groups}
          onClose={() => setShowModal(false)}
          onAdded={() => { setShowModal(false); reload(); }}
        />
      )}
    </div>
  );
}
