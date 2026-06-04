"use client";

import { FileEdit, FilePlus } from "lucide-react";

export interface TouchedFile {
  path: string;
  insertions: number;
  deletions: number;
  tool: string;
  pending: boolean;
  isError: boolean;
}

interface FilesTouchedPanelProps {
  files: TouchedFile[];
  onReviewChanges?: () => void;
}

export function FilesTouchedPanel({ files, onReviewChanges }: FilesTouchedPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="label">Files touched</div>
        <span className="font-mono text-[10px] text-[color:var(--color-sepia)] tabular">
          {files.length}
        </span>
      </div>
      {files.length === 0 ? (
        <p className="text-[12px] text-[color:var(--color-sepia)] italic">
          No edits yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f, idx) => {
            const Icon = f.tool === "Write" ? FilePlus : FileEdit;
            return (
              <li
                key={`${f.path}-${idx}`}
                className="flex items-baseline gap-2"
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    f.isError
                      ? "text-[color:var(--color-redink)]"
                      : f.pending
                        ? "text-[color:var(--color-sepia)]"
                        : "text-[color:var(--color-ok)]"
                  }`}
                />
                <span className="flex-1 truncate font-mono text-[11px] text-[color:var(--color-ink)]">
                  {f.path}
                </span>
                <span
                  className={`font-mono text-[10px] tabular ${
                    f.isError
                      ? "text-[color:var(--color-redink)]"
                      : f.pending
                        ? "text-[color:var(--color-sepia)]"
                        : "text-[color:var(--color-ok)]"
                  }`}
                >
                  {f.pending
                    ? "writing…"
                    : f.isError
                      ? "fail"
                      : `+${f.insertions} −${f.deletions}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {onReviewChanges && files.length > 0 && (
        <button
          type="button"
          onClick={onReviewChanges}
          className="w-full px-3 py-2 text-[12px] border border-[color:var(--color-rule)] text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)]"
        >
          Review changes
        </button>
      )}
    </div>
  );
}
