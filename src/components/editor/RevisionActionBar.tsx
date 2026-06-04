"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api";
import type { RevisionAction } from "@/server/types";

interface RevisionActionBarProps {
  onApplyAction?: (action: RevisionAction) => void;
}

export function RevisionActionBar({ onApplyAction }: RevisionActionBarProps) {
  const [actions, setActions] = useState<RevisionAction[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newReplacement, setNewReplacement] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchJson<RevisionAction[]>("/api/revision-actions");
        setActions(data);
      } catch {
        // Leave the list empty if the action library cannot be loaded.
      }
    }

    load();
  }, []);

  const handleCreate = async () => {
    if (!newLabel || !newPattern) return;
    try {
      const action = await fetchJson<RevisionAction>("/api/revision-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel,
          action_type: "find_replace",
          config_json: JSON.stringify({ pattern: newPattern, replacement: newReplacement }),
        }),
      });
      setActions((prev) => [...prev, action]);
      setShowCreate(false);
      setNewLabel("");
      setNewPattern("");
      setNewReplacement("");
    } catch {
      // Keep the current form state if creation fails.
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="text-[11px] text-[color:var(--color-sepia)] hover:text-[color:var(--color-ink)]"
      >
        {showCreate ? "Cancel" : "+ New pattern"}
      </button>

      {showCreate && (
        <div className="space-y-2 pl-3 border-l border-[color:var(--color-rule)]">
          <input
            placeholder="Label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-full bg-transparent border-0 border-b border-[color:var(--color-rule)] py-1 text-[12px] focus:outline-none focus:border-[color:var(--color-ink)]"
          />
          <input
            placeholder="Find"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            className="w-full bg-transparent border-0 border-b border-[color:var(--color-rule)] py-1 text-[12px] font-mono focus:outline-none focus:border-[color:var(--color-ink)]"
          />
          <input
            placeholder="Replace"
            value={newReplacement}
            onChange={(e) => setNewReplacement(e.target.value)}
            className="w-full bg-transparent border-0 border-b border-[color:var(--color-rule)] py-1 text-[12px] font-mono focus:outline-none focus:border-[color:var(--color-ink)]"
          />
          <button
            onClick={handleCreate}
            className="px-3 py-1 bg-[color:var(--color-ink)] text-[color:var(--color-paper)] text-[11px] hover:bg-[color:var(--color-redink)] transition-colors"
          >
            Save
          </button>
        </div>
      )}

      {actions.length === 0 && !showCreate && (
        <p className="font-display italic text-[12px] text-[color:var(--color-sepia)]">
          No saved patterns.
        </p>
      )}

      <ul className="space-y-2">
        {actions.map((action) => (
          <li key={action.id}>
            <button
              onClick={() => onApplyAction?.(action)}
              className="w-full text-left flex items-center gap-2 py-1 hover:text-[color:var(--color-ink)]"
            >
              <span className="text-[12px] text-[color:var(--color-ink)]">{action.label}</span>
              <span className="ml-auto font-mono text-[10px] text-[color:var(--color-sepia)] tabular">
                ×{action.use_count}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
