"use client";

import { useState } from "react";
import { Check, Circle, FileEdit, FilePlus, Search } from "lucide-react";

export type StreamCardEntry =
  | { kind: "plan"; id: string; todos: Array<{ content: string; status: string }> }
  | {
      kind: "file_edit";
      id: string;
      tool: string;
      path: string;
      insertions: number;
      deletions: number;
      diff?: string;
      pending: boolean;
      isError?: boolean;
    }
  | {
      kind: "file_search";
      id: string;
      tool: string;
      pattern: string;
      summary: string;
      pending: boolean;
      isError?: boolean;
    };

function todoIcon(status: string) {
  if (status === "completed") {
    return (
      <Check className="h-3.5 w-3.5 text-[color:var(--color-ok)]" aria-hidden />
    );
  }
  if (status === "in_progress") {
    return (
      <span
        className="block h-3.5 w-3.5 rounded-full border border-[color:var(--color-redink)] bg-[color:var(--color-redink)]/20"
        aria-hidden
      />
    );
  }
  if (status === "cancelled") {
    return (
      <span
        className="block h-3.5 w-3.5 rounded-full border border-dashed border-[color:var(--color-sepia)]"
        aria-hidden
      />
    );
  }
  return (
    <Circle
      className="h-3.5 w-3.5 text-[color:var(--color-sepia)]"
      aria-hidden
    />
  );
}

export function PlanCard({
  todos,
}: {
  todos: Array<{ content: string; status: string }>;
}) {
  if (!todos || todos.length === 0) return null;
  return (
    <section className="border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)]/40 px-3 py-2">
      <div className="label mb-2 text-[color:var(--color-redink)]">Plan</div>
      <ul className="space-y-1">
        {todos.map((todo, idx) => (
          <li
            key={idx}
            className={`flex items-start gap-2 text-[13px] leading-snug ${
              todo.status === "completed"
                ? "text-[color:var(--color-sepia)] line-through decoration-[color:var(--color-sepia)]/50"
                : "text-[color:var(--color-ink)]"
            }`}
          >
            <span className="mt-0.5">{todoIcon(todo.status)}</span>
            <span className="whitespace-pre-wrap">{todo.content}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FileEditCard({ entry }: { entry: Extract<StreamCardEntry, { kind: "file_edit" }> }) {
  const [open, setOpen] = useState(false);
  const Icon = entry.tool === "Write" ? FilePlus : FileEdit;
  const status = entry.pending
    ? "writing…"
    : entry.isError
      ? "failed"
      : `+${entry.insertions} −${entry.deletions}`;
  return (
    <article className="border-l-2 border-[color:var(--color-redink)]/40 pl-3 py-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-redink)]" />
        <span className="font-mono text-[12px] text-[color:var(--color-ink)]">{entry.path}</span>
        <span
          className={`ml-auto font-mono text-[10px] tabular ${
            entry.isError
              ? "text-[color:var(--color-redink)]"
              : entry.pending
                ? "text-[color:var(--color-sepia)]"
                : "text-[color:var(--color-ok)]"
          }`}
        >
          {status}
        </span>
        <span className="font-mono text-[10px] text-[color:var(--color-sepia-light)]">{open ? "−" : "+"}</span>
      </button>
      {open && entry.diff && (
        <pre className="mt-2 overflow-x-auto border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] p-2 font-mono text-[11px] leading-relaxed">
          {entry.diff}
        </pre>
      )}
    </article>
  );
}

export function FileSearchCard({
  entry,
}: {
  entry: Extract<StreamCardEntry, { kind: "file_search" }>;
}) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <Search className="h-3 w-3 shrink-0 text-[color:var(--color-sepia)]" />
      <span className="font-mono text-[11px] text-[color:var(--color-sepia)]">{entry.tool}</span>
      <span className="truncate font-mono text-[11px] text-[color:var(--color-ink-soft)]">
        {entry.pattern}
      </span>
      <span className="ml-auto font-mono text-[10px] text-[color:var(--color-sepia-light)]">
        {entry.pending ? "…" : entry.summary}
      </span>
    </div>
  );
}
