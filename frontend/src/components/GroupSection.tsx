"use client";

import { useState } from "react";
import { Group, Stock, deleteGroup } from "@/lib/api";
import StockTable from "./StockTable";

interface Props {
  group: Group | null; // null = Ungrouped section
  stocks: Stock[];
  groups: Group[];
  onChanged: () => void;
}

export default function GroupSection({ group, stocks, groups, onChanged }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!group) return;
    setDeleting(true);
    await deleteGroup(group.id);
    setDeleting(false);
    setConfirming(false);
    onChanged();
  };

  const canDelete = group !== null && stocks.length === 0;

  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/60">
        <button
          onClick={() => setIsOpen((o) => !o)}
          className="text-muted/40 hover:text-muted transition-colors shrink-0"
          title={isOpen ? "Collapse" : "Expand"}
        >
          <span
            className="text-[10px] inline-block transition-transform duration-200"
            style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            ▶
          </span>
        </button>

        <h2 className="font-display text-xl font-bold text-ticker tracking-wide">
          {group?.name ?? "Ungrouped"}
        </h2>

        <span className="text-[10px] text-muted font-mono tracking-wider">
          {stocks.length} position{stocks.length !== 1 ? "s" : ""}
        </span>

        {canDelete && (
          <div className="ml-auto">
            {confirming ? (
              <span className="flex items-center gap-2 font-mono text-xs">
                <span className="text-red tracking-wider">REMOVE GROUP?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-red hover:brightness-125 transition-all leading-none px-0.5"
                  title="Confirm"
                >
                  {deleting ? "…" : "✓"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="text-muted hover:text-ticker transition-colors leading-none px-0.5"
                  title="Cancel"
                >
                  ✗
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="text-muted/30 hover:text-red transition-colors text-xs font-mono tracking-wider ml-auto"
              >
                × delete group
              </button>
            )}
          </div>
        )}
      </div>

      {isOpen && (
        stocks.length === 0 ? (
          <p className="text-muted/40 text-xs font-mono py-6 text-center tracking-widest">
            NO POSITIONS — ADD A STOCK AND ASSIGN IT TO THIS GROUP
          </p>
        ) : (
          <StockTable
            stocks={stocks}
            groups={groups}
            onDeleted={onChanged}
            onEdited={onChanged}
          />
        )
      )}
    </div>
  );
}
