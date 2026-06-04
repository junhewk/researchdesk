"use client";

import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; classes: string }> = {
  running: {
    label: "Running",
    classes: "text-[color:var(--color-ok)]",
  },
  idle: {
    label: "Idle",
    classes: "text-[color:var(--color-sepia)]",
  },
  completed: {
    label: "Completed",
    classes: "text-[color:var(--color-ink)]",
  },
  crashed: {
    label: "Crashed",
    classes: "text-[color:var(--color-redink)]",
  },
  new: {
    label: "New",
    classes: "text-[color:var(--color-mechanical)]",
  },
  awaiting_user: {
    label: "Awaiting",
    classes: "text-[color:var(--color-rewrite)]",
  },
};

export function StatusPill({ status }: { status: string }) {
  const config = statusConfig[status] ?? {
    label: status,
    classes: "text-[color:var(--color-sepia)]",
  };

  return (
    <span className={cn("inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider", config.classes)}>
      {status === "running" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-ok)] opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--color-ok)]" />
        </span>
      )}
      {config.label}
    </span>
  );
}
