"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Stock, Group, updateStock } from "@/lib/api";

interface Props {
  stock: Stock;
  groups: Group[];
  onClose: () => void;
  onSaved: () => void;
}

export default function EditStockModal({ stock, groups, onClose, onSaved }: Props) {
  const [groupId, setGroupId] = useState<number | null>(stock.group_id);
  const [notes, setNotes] = useState(stock.source_notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateStock(stock.id, { group_id: groupId, source_notes: notes, owned: stock.owned });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };

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
        className="bg-surface border border-border w-full max-w-md p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-8">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted mb-2">Edit Position</p>
          <h2 className="font-display text-3xl font-bold text-ticker">{stock.ticker}</h2>
          <p className="text-sm text-muted font-mono mt-1 truncate">{stock.name}</p>
        </div>

        <div className="space-y-5">
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

          {error && <p className="text-red text-xs font-mono">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-border text-muted hover:text-[#c8c4bc] text-xs tracking-widest uppercase transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 bg-accent text-bg font-display font-bold text-sm disabled:opacity-40 hover:brightness-110 transition-all tracking-wide"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
