"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { PrismaFlow, Study } from "@/server/types";

function FlowBox({
  heading,
  rows,
  accent,
}: {
  heading: string;
  rows: Array<{ label: string; value: number | string; strong?: boolean }>;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "border px-4 py-3 w-full max-w-md",
        accent
          ? "border-[color:var(--color-redink)]"
          : "border-[color:var(--color-outline-variant)]",
      )}
    >
      <p className="text-[10px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] mb-1.5">
        {heading}
      </p>
      <dl className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <dt className={cn("text-[13px]", r.strong && "font-medium")}>{r.label}</dt>
            <dd className={cn("font-mono tabular text-[14px]", r.strong && "text-[color:var(--color-redink)]")}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Arrow() {
  return (
    <div className="my-1 text-[color:var(--color-on-surface-variant)] font-display text-[18px] leading-none">
      ↓
    </div>
  );
}

export function PrismaPanel({
  study,
}: {
  study: Pick<Study, "id" | "title">;
}) {
  const [flow, setFlow] = useState<PrismaFlow | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/studies/${study.id}/prisma`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { flow: PrismaFlow; markdown: string };
        setFlow(data.flow);
        setMarkdown(data.markdown);
      } finally {
        setLoading(false);
      }
    })();
  }, [study.id]);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const exportBase = `/api/studies/${study.id}/records/export`;

  return (
    <div className="reveal">
      <div className="border-b-2 border-[color:var(--color-ink)] pb-3">
        <div className="flex items-baseline justify-between">
          <Link
            href={`/projects/${study.id}/corpus`}
            className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
          >
            ← Corpus & screening
          </Link>
          <Link
            href={`/projects/${study.id}/setup`}
            className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
          >
            Design canvas →
          </Link>
        </div>
        <h1
          className="font-display text-[26px] leading-tight mt-2"
          style={{ fontVariationSettings: "'opsz' 48, 'wght' 420" }}
        >
          {study.title}
        </h1>
        <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
          PRISMA-ScR flow & exports
        </p>
      </div>

      {loading && (
        <p className="mt-6 text-[13px] italic text-[color:var(--color-on-surface-variant)]">Loading…</p>
      )}

      {flow && (
        <div className="mt-6 grid grid-cols-[1fr_280px] gap-8 items-start">
          <div className="flex flex-col items-center">
            <FlowBox
              heading="Identification"
              rows={[
                ...flow.per_database.map((d) => ({ label: d.database, value: d.yield_count })),
                { label: "Records identified", value: flow.identified, strong: true },
              ]}
            />
            <Arrow />
            <FlowBox
              heading="De-duplication"
              rows={[
                { label: "Duplicates removed (derived)", value: flow.duplicates_removed },
                { label: "Records screened", value: flow.screened, strong: true },
              ]}
            />
            <Arrow />
            <FlowBox
              heading="Screening"
              rows={[
                { label: "Excluded", value: flow.excluded },
                { label: "Pending / unscreened", value: flow.pending },
                { label: "Maybe", value: flow.maybe },
              ]}
            />
            <Arrow />
            <FlowBox
              heading="Included"
              accent
              rows={[
                { label: "Sources included", value: flow.included, strong: true },
                { label: "of which confirmed", value: flow.confirmed },
              ]}
            />
            {flow.identified === 0 && (
              <p className="mt-3 max-w-md text-[12px] italic text-[color:var(--color-on-surface-variant)]">
                No search yields imported yet — the identification count comes from the
                search-process CSV. Import it on the corpus page to complete the top of the flow.
              </p>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] mb-2">
                Flow text
              </p>
              <button
                type="button"
                onClick={copyMarkdown}
                className="px-3 py-1.5 text-[12px] font-mono uppercase tracking-wide border border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-surface)] transition-colors"
              >
                {copied ? "Copied ✓" : "Copy flow markdown"}
              </button>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] mb-2">
                Exports
              </p>
              <div className="flex flex-col items-start gap-1.5 text-[13px]">
                <a className="underline hover:text-[color:var(--color-redink)]" href={`${exportBase}?view=records&format=csv`}>
                  Records + decisions (CSV)
                </a>
                <a className="underline hover:text-[color:var(--color-redink)]" href={`${exportBase}?view=characteristics&format=csv`}>
                  Characteristics of included (CSV)
                </a>
                <a className="underline hover:text-[color:var(--color-redink)]" href={`${exportBase}?view=characteristics&format=md`}>
                  Characteristics of included (Markdown)
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
