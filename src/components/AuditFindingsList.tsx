"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProtocolAuditItem } from "@/server/types";

interface Props {
  protocolId: string;
  auditId: string;
  items: ProtocolAuditItem[];
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-[color:var(--color-error)] text-[color:var(--color-error)]",
  major: "border-[color:var(--color-tertiary)] text-[color:var(--color-tertiary)]",
  minor: "border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]",
};

export function AuditFindingsList({ protocolId, auditId, items }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <p className="text-[13px] text-[color:var(--color-on-surface-variant)] italic">
        No findings yet. The agent will append items here as it runs.
      </p>
    );
  }

  const byCategory = items.reduce<Record<string, ProtocolAuditItem[]>>(
    (acc, item) => {
      acc[item.category] = acc[item.category] ?? [];
      acc[item.category].push(item);
      return acc;
    },
    {},
  );

  const update = (itemId: string, status: "accepted" | "dismissed" | "open") => {
    startTransition(async () => {
      await fetch(
        `/api/protocols/${protocolId}/audits/${auditId}/items/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      {Object.entries(byCategory).map(([category, list]) => (
        <section key={category}>
          <h3 className="label mb-3">{category.replace(/_/g, " ")}</h3>
          <ul className="divide-y divide-[color:var(--color-outline-variant)] border-t border-[color:var(--color-outline-variant)]">
            {list.map((item) => (
              <li
                key={item.id}
                className={`py-4 ${item.status === "dismissed" ? "opacity-50" : ""}`}
              >
                <div className="flex items-baseline gap-3 mb-2">
                  {item.severity && (
                    <span
                      className={`shrink-0 px-2 py-0.5 text-[10px] tracking-wide uppercase font-mono border ${
                        SEVERITY_STYLE[item.severity] ?? ""
                      }`}
                    >
                      {item.severity}
                    </span>
                  )}
                  {item.section_ref && (
                    <span className="shrink-0 font-mono text-[11px] text-[color:var(--color-on-surface-variant)]">
                      {item.section_ref}
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
                {item.quoted_text && (
                  <blockquote className="mb-2 border-l-2 border-[color:var(--color-outline-variant)] pl-3 text-[13px] italic text-[color:var(--color-on-surface-variant)]">
                    {item.quoted_text}
                  </blockquote>
                )}
                <p className="text-[14px] leading-snug whitespace-pre-wrap">
                  {item.finding_md}
                </p>
                {item.suggested_fix_md && (
                  <p className="mt-2 text-[13px] text-[color:var(--color-on-surface-variant)] whitespace-pre-wrap">
                    <span className="font-mono uppercase text-[10px] mr-2">
                      fix
                    </span>
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
        </section>
      ))}
    </div>
  );
}
