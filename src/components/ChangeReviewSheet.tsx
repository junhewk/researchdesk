"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api";

interface ChangeReviewSheetProps {
  manuscriptId: string;
  sessionId: string;
  onClose: () => void;
  onReverted?: () => void;
}

interface GitStatItem {
  path: string;
  insertions: number;
  deletions: number;
}

interface GitDiffResponse {
  is_git: true;
  stats?: GitStatItem[];
  file?: string;
  diff?: string;
}

interface SnapshotDiffResponse {
  is_git: false;
  changed?: string[];
  created?: string[];
  deleted?: string[];
  file?: string;
  live?: string;
}

type DiffResponse = GitDiffResponse | SnapshotDiffResponse;

export function ChangeReviewSheet({
  manuscriptId,
  sessionId,
  onClose,
  onReverted,
}: ChangeReviewSheetProps) {
  const [data, setData] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string>("");
  const [reverting, setReverting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchJson<DiffResponse>(
        `/api/manuscripts/${manuscriptId}/changes?session_id=${sessionId}`,
      );
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [manuscriptId, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const showDiff = async (file: string) => {
    setOpenFile(file);
    if (data?.is_git) {
      const res = await fetchJson<{ diff: string }>(
        `/api/manuscripts/${manuscriptId}/changes?session_id=${sessionId}&file=${encodeURIComponent(file)}`,
      );
      setDiffText(res.diff || "(no changes)");
    } else {
      setDiffText("(snapshot diff — open the file in your editor to view)");
    }
  };

  const toggle = (file: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const revertSelected = async () => {
    if (selected.size === 0) return;
    setReverting(true);
    try {
      await fetch(`/api/manuscripts/${manuscriptId}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          files: Array.from(selected),
        }),
      });
      setSelected(new Set());
      await load();
      onReverted?.();
    } finally {
      setReverting(false);
    }
  };

  const fileList: Array<{ path: string; meta: string }> =
    data?.is_git
      ? (data.stats ?? []).map((s) => ({
          path: s.path,
          meta: `+${s.insertions} −${s.deletions}`,
        }))
      : data
        ? [
            ...(data.changed ?? []).map((p) => ({ path: p, meta: "modified" })),
            ...(data.created ?? []).map((p) => ({ path: p, meta: "new" })),
            ...(data.deleted ?? []).map((p) => ({ path: p, meta: "deleted" })),
          ]
        : [];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30">
      <div className="flex h-full w-full max-w-3xl flex-col bg-[color:var(--color-paper)] shadow-2xl">
        <div className="flex items-baseline justify-between border-b border-[color:var(--color-rule)] px-6 py-4">
          <div>
            <div className="label">Review changes</div>
            <p className="font-mono text-[11px] text-[color:var(--color-sepia)]">
              {data?.is_git ? "git working tree" : "session snapshot"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[12px] text-[color:var(--color-sepia)] hover:text-[color:var(--color-ink)]"
          >
            close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="font-display italic text-[color:var(--color-sepia)]">Loading…</p>
          ) : fileList.length === 0 ? (
            <p className="font-display italic text-[color:var(--color-sepia)]">
              No changes detected.
            </p>
          ) : (
            <ul className="space-y-2">
              {fileList.map((f) => (
                <li key={f.path} className="border-b border-[color:var(--color-rule)] py-2">
                  <div className="flex items-baseline gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(f.path)}
                      onChange={() => toggle(f.path)}
                      className="h-3.5 w-3.5 accent-[color:var(--color-ink)]"
                    />
                    <button
                      type="button"
                      onClick={() => showDiff(f.path)}
                      className="flex-1 text-left font-mono text-[12px] text-[color:var(--color-ink)] hover:text-[color:var(--color-redink)]"
                    >
                      {f.path}
                    </button>
                    <span className="font-mono text-[11px] text-[color:var(--color-sepia)] tabular">
                      {f.meta}
                    </span>
                  </div>
                  {openFile === f.path && (
                    <pre className="mt-2 overflow-x-auto border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] p-3 font-mono text-[11px] leading-relaxed">
                      {diffText}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-baseline justify-end gap-3 border-t border-[color:var(--color-rule)] px-6 py-3">
          <span className="font-mono text-[11px] text-[color:var(--color-sepia)]">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={revertSelected}
            disabled={selected.size === 0 || reverting}
            className="px-3 py-1.5 text-[12px] text-[color:var(--color-redink)] border border-[color:var(--color-rule)] hover:border-[color:var(--color-redink)] disabled:opacity-40"
          >
            {reverting ? "Reverting…" : "Revert selected"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] text-[color:var(--color-ink)] border border-[color:var(--color-rule)] hover:border-[color:var(--color-ink)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
