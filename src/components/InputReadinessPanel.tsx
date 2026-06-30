"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Lightbulb,
  Search,
} from "lucide-react";
import {
  type InputReadinessItem,
  type InputTier,
  summarizeInputReadiness,
} from "@/lib/inputReadiness";

const TIER_LABEL: Record<InputTier, string> = {
  required: "Required",
  recommended: "Recommended",
  suggested: "Suggested",
};

const TIER_ORDER: InputTier[] = ["required", "recommended", "suggested"];

function statusIcon(item: InputReadinessItem) {
  if (item.status === "present") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--color-secondary)]" strokeWidth={1.8} />;
  }
  if (item.status === "needs_attention") {
    return <AlertCircle className="h-3.5 w-3.5 text-[color:var(--color-error)]" strokeWidth={1.8} />;
  }
  if (item.tier === "suggested") {
    return <Lightbulb className="h-3.5 w-3.5 text-[color:var(--color-tertiary)]" strokeWidth={1.8} />;
  }
  return <Circle className="h-3.5 w-3.5 text-[color:var(--color-on-surface-variant)]" strokeWidth={1.8} />;
}

function statusText(item: InputReadinessItem): string {
  switch (item.status) {
    case "present":
      return "ready";
    case "needs_attention":
      return "check";
    case "not_applicable":
      return "n/a";
    default:
      return item.tier === "suggested" ? "suggested" : "missing";
  }
}

function statusClass(item: InputReadinessItem): string {
  if (item.status === "present") return "text-[color:var(--color-secondary)]";
  if (item.status === "needs_attention") return "text-[color:var(--color-error)]";
  if (item.status === "missing" && item.tier === "required") return "text-[color:var(--color-error)]";
  return "text-[color:var(--color-on-surface-variant)]";
}

export function InputReadinessPanel({
  title = "Inputs",
  description,
  items,
  className = "",
  onItemAction,
  onAgentScan,
  agentScanLabel = "Scan for missing inputs",
  agentScanDisabled = false,
}: {
  title?: string;
  description?: string;
  items: InputReadinessItem[];
  className?: string;
  onItemAction?: (item: InputReadinessItem) => void;
  onAgentScan?: () => void;
  agentScanLabel?: string;
  agentScanDisabled?: boolean;
}) {
  const summary = summarizeInputReadiness(items);
  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    items: items.filter((item) => item.tier === tier && item.status !== "not_applicable"),
  })).filter((group) => group.items.length > 0);

  return (
    <section className={`rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] ${className}`}>
      <div className="border-b border-[color:var(--color-outline-variant)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[15px] font-semibold text-[color:var(--color-on-surface)]">
            {title}
          </h2>
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide ${
              summary.ready
                ? "bg-[color:var(--color-secondary-container)] text-[color:var(--color-on-secondary-container)]"
                : "bg-[color:var(--color-error-container)] text-[color:var(--color-on-error-container)]"
            }`}
          >
            {summary.ready ? "ready" : `${summary.missingRequired} required`}
          </span>
        </div>
        {description && (
          <p className="mt-1 text-[11px] leading-snug text-[color:var(--color-on-surface-variant)]">
            {description}
          </p>
        )}
        <div className="mt-2 h-1 rounded bg-[color:var(--color-outline-variant)]">
          <div
            className="h-1 rounded bg-[color:var(--color-primary)]"
            style={{
              width: summary.total
                ? `${Math.round((summary.present / summary.total) * 100)}%`
                : "0%",
            }}
          />
        </div>
      </div>

      <div className="px-3 py-3 space-y-4">
        {grouped.map((group) => (
          <div key={group.tier}>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
              {TIER_LABEL[group.tier]}
            </div>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded border border-[color:var(--color-outline-variant)] px-2.5 py-2"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">{statusIcon(item)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-[color:var(--color-on-surface)]">
                          {item.label}
                        </p>
                        <span className={`shrink-0 font-mono text-[9px] uppercase tracking-wide ${statusClass(item)}`}>
                          {statusText(item)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-[color:var(--color-on-surface-variant)]">
                        {item.detail}
                      </p>
                      {item.actionLabel && (
                        item.href ? (
                          <Link
                            href={item.href}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--color-primary)] hover:underline"
                          >
                            {item.actionLabel}
                            <ArrowRight className="h-3 w-3" strokeWidth={1.8} />
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onItemAction?.(item)}
                            disabled={!onItemAction}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--color-primary)] hover:underline disabled:opacity-40"
                          >
                            {item.actionLabel}
                            <ArrowRight className="h-3 w-3" strokeWidth={1.8} />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {onAgentScan && (
          <button
            type="button"
            onClick={onAgentScan}
            disabled={agentScanDisabled}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-2 text-[12px] font-medium text-[color:var(--color-on-surface)] hover:border-[color:var(--color-outline)] disabled:opacity-40"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
            {agentScanLabel}
          </button>
        )}
      </div>
    </section>
  );
}
