"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReadinessCheckItem } from "@/server/types";

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-[color:var(--color-error)] text-[color:var(--color-error)]",
  major:
    "border-[color:var(--color-tertiary)] text-[color:var(--color-tertiary)]",
  minor:
    "border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]",
};

interface Props {
  checkId: string;
  items: ReadinessCheckItem[];
}

export function ReadinessItemsList({ checkId, items }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <p className="text-[13px] text-[color:var(--color-on-surface-variant)] italic">
        No items yet — the agent appends gates as it identifies them.
      </p>
    );
  }

  const update = (itemId: string, status: "accepted" | "dismissed" | "open") => {
    startTransition(async () => {
      await fetch(`/api/readiness/${checkId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    });
  };

  return (
    <ul className="divide-y divide-[color:var(--color-outline-variant)] border-t border-[color:var(--color-outline-variant)]">
      {items.map((item) => (
        <li
          key={item.id}
          className={`py-4 ${item.status === "dismissed" ? "opacity-50" : ""}`}
        >
          <div className="flex items-baseline gap-3 mb-2">
            <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide">
              {item.gate.replace(/_/g, " ")}
            </span>
            {item.severity && (
              <span
                className={`shrink-0 px-2 py-0.5 text-[10px] tracking-wide uppercase font-mono border ${
                  SEVERITY_STYLE[item.severity] ?? ""
                }`}
              >
                {item.severity}
              </span>
            )}
            {item.auto_detected && (
              <span className="shrink-0 font-mono text-[10px] uppercase text-[color:var(--color-on-surface-variant)]">
                auto-detected
              </span>
            )}
            <span className="ml-auto text-[11px] font-mono text-[color:var(--color-on-surface-variant)]">
              {item.status}
            </span>
          </div>
          <p className="text-[14px] leading-snug whitespace-pre-wrap">
            {item.finding_md}
          </p>
          {item.suggested_fix_md && (
            <p className="mt-2 text-[13px] text-[color:var(--color-on-surface-variant)] whitespace-pre-wrap">
              <span className="font-mono uppercase text-[10px] mr-2">fix</span>
              {item.suggested_fix_md}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {item.status !== "accepted" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => update(item.id, "accepted")}
                className="text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5 hover:bg-[color:var(--color-surface-container)]"
              >
                Accept
              </button>
            )}
            {item.status !== "dismissed" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => update(item.id, "dismissed")}
                className="text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5 hover:bg-[color:var(--color-surface-container)]"
              >
                Dismiss
              </button>
            )}
            {item.status !== "open" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => update(item.id, "open")}
                className="text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5 hover:bg-[color:var(--color-surface-container)]"
              >
                Reopen
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
