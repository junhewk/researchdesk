"use client";

import { useState } from "react";

export interface ActivityEntry {
  id: string;
  name: string;
  input: unknown;
  result?: unknown;
  isError?: boolean;
  pending: boolean;
}

interface ActivityDrawerProps {
  entries: ActivityEntry[];
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function inputPreview(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return truncate(input, 160);
  try {
    return truncate(JSON.stringify(input), 160);
  } catch {
    return String(input);
  }
}

function resultPreview(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return truncate(result, 240);
  try {
    return truncate(JSON.stringify(result), 240);
  } catch {
    return String(result);
  }
}

function fullJson(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="py-1.5 border-b border-[color:var(--color-rule)] last:border-b-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left flex items-baseline gap-2 font-mono text-[10px] hover:text-[color:var(--color-ink)]"
      >
        <span
          className={
            entry.isError
              ? "text-[color:var(--color-redink)]"
              : entry.pending
                ? "text-[color:var(--color-sepia)]"
                : "text-[color:var(--color-ink)]"
          }
        >
          {entry.name}
        </span>
        <span className="text-[color:var(--color-sepia)] truncate flex-1">
          {inputPreview(entry.input)}
        </span>
        <span className="text-[color:var(--color-sepia-light)] shrink-0">
          {entry.pending ? "…" : entry.isError ? "err" : "ok"}
        </span>
        <span className="text-[color:var(--color-sepia-light)] shrink-0">{expanded ? "−" : "+"}</span>
      </button>
      {!expanded && entry.result !== undefined && (
        <div className="mt-1 pl-3 border-l border-[color:var(--color-rule)] font-mono text-[10px] text-[color:var(--color-sepia)] whitespace-pre-wrap">
          {resultPreview(entry.result)}
        </div>
      )}
      {expanded && (
        <div className="mt-1 space-y-2">
          <div className="pl-3 border-l border-[color:var(--color-rule)]">
            <div className="font-mono text-[10px] text-[color:var(--color-sepia-light)] uppercase tracking-wide">
              input
            </div>
            <pre className="font-mono text-[10px] text-[color:var(--color-ink)] whitespace-pre-wrap">
              {fullJson(entry.input)}
            </pre>
          </div>
          {entry.result !== undefined && (
            <div
              className={`pl-3 border-l ${
                entry.isError
                  ? "border-[color:var(--color-redink)]"
                  : "border-[color:var(--color-ok)]"
              }`}
            >
              <div className="font-mono text-[10px] text-[color:var(--color-sepia-light)] uppercase tracking-wide">
                result
              </div>
              <pre className="font-mono text-[10px] text-[color:var(--color-ink-soft)] whitespace-pre-wrap">
                {fullJson(entry.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function ActivityDrawer({ entries }: ActivityDrawerProps) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <div className="border-t border-[color:var(--color-rule)] mt-3 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-baseline justify-between text-left text-[10px] font-mono uppercase tracking-wide text-[color:var(--color-sepia)] hover:text-[color:var(--color-ink)] py-1"
      >
        <span>
          Activity · {entries.length} action{entries.length !== 1 ? "s" : ""}
        </span>
        <span>{open ? "− hide" : "+ show"}</span>
      </button>
      {open && (
        <ul className="mt-1 max-h-[240px] overflow-y-auto">
          {entries.map((e) => (
            <ActivityRow key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
