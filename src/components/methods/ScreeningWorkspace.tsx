"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  SCREENING_DECISION_STYLES,
  SCREENING_DECISION_LABEL,
  SCREEN_TIER_STYLES,
  SCREEN_CONFIDENCE_STYLES,
} from "@/lib/styles";
import type { ReviewRecord, ScreeningDecision, Study } from "@/server/types";

interface Stats {
  total: number;
  include: number;
  exclude: number;
  maybe: number;
  unscreened: number;
  confirmed: number;
  needs_review: number;
}

const EMPTY_STATS: Stats = {
  total: 0,
  include: 0,
  exclude: 0,
  maybe: 0,
  unscreened: 0,
  confirmed: 0,
  needs_review: 0,
};

const DECISIONS: ScreeningDecision[] = ["include", "exclude", "maybe", "unscreened"];
const TIERS = ["primary", "secondary", "unclear"];
const CONFIDENCES = ["high", "med", "low"];

interface Filters {
  decision: ScreeningDecision | "";
  tier: string;
  confidence: string;
  needs_review: "" | "1" | "0";
  q: string;
}

const EMPTY_FILTERS: Filters = { decision: "", tier: "", confidence: "", needs_review: "", q: "" };

function Chip({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-px border text-[10px] font-mono uppercase tracking-wide whitespace-nowrap",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function ScreeningWorkspace({
  study,
}: {
  study: Pick<Study, "id" | "title" | "research_question" | "mode">;
}) {
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const buildQuery = useCallback((f: Filters): string => {
    const sp = new URLSearchParams();
    if (f.decision) sp.set("decision", f.decision);
    if (f.tier) sp.set("tier", f.tier);
    if (f.confidence) sp.set("confidence", f.confidence);
    if (f.needs_review) sp.set("needs_review", f.needs_review);
    if (f.q.trim()) sp.set("q", f.q.trim());
    sp.set("limit", "2000");
    return sp.toString();
  }, []);

  const fetchRecords = useCallback(
    async (f: Filters) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/studies/${study.id}/records?${buildQuery(f)}`);
        if (!res.ok) throw new Error("could not load records");
        const data = (await res.json()) as { records: ReviewRecord[]; total: number; stats: Stats };
        setRecords(data.records);
        setTotal(data.total);
        setStats(data.stats);
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "load error");
      } finally {
        setLoading(false);
      }
    },
    [study.id, buildQuery],
  );

  useEffect(() => {
    fetchRecords(filters);
  }, [fetchRecords, filters]);

  async function handleImport(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /\.csv$/i.test(f.name) || f.type === "text/csv");
    if (list.length === 0) {
      setNotice("Drop .csv files (search-process and/or records).");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const fd = new FormData();
      for (const f of list) fd.append("file", f);
      const res = await fetch(`/api/studies/${study.id}/import`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { results?: Array<{ kind: string; searches?: number; records?: number; inserted?: number; updated?: number; duplicates?: number }>; error?: string }
        | null;
      if (!res.ok || !data?.results) throw new Error(data?.error || `import failed (${res.status})`);
      const summary = data.results
        .map((r) =>
          r.kind === "search"
            ? `${r.searches ?? 0} database searches`
            : `${r.records ?? 0} records (${r.inserted ?? 0} new, ${r.updated ?? 0} updated${r.duplicates ? `, ${r.duplicates} dup` : ""})`,
        )
        .join("; ");
      setNotice(`Imported: ${summary}.`);
      await fetchRecords(filters);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "import error");
    } finally {
      setBusy(false);
    }
  }

  async function setDecision(record: ReviewRecord, decision: ScreeningDecision) {
    // optimistic
    setRecords((rs) =>
      rs.map((r) => (r.id === record.id ? { ...r, decision, user_confirmed: true } : r)),
    );
    try {
      const res = await fetch(`/api/studies/${study.id}/records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, user_confirmed: true }),
      });
      if (!res.ok) throw new Error("save failed");
      await fetchRecords(filters);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "save error");
      await fetchRecords(filters);
    }
  }

  async function bulkApply(decision: ScreeningDecision) {
    if (!total) return;
    const scope =
      filters.decision || filters.tier || filters.confidence || filters.needs_review || filters.q.trim()
        ? "filtered"
        : "all";
    if (!window.confirm(`Set decision "${decision}" on ${total} ${scope} record(s) and mark them confirmed?`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/studies/${study.id}/records/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: {
            decision: filters.decision || undefined,
            tier: filters.tier || undefined,
            confidence: filters.confidence || undefined,
            needs_review: filters.needs_review ? filters.needs_review === "1" : undefined,
          },
          decision,
          user_confirmed: true,
        }),
      });
      const data = (await res.json()) as { changed: number };
      setNotice(`Updated ${data.changed} record(s).`);
      await fetchRecords(filters);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "bulk error");
    } finally {
      setBusy(false);
    }
  }

  const hasData = stats.total > 0;

  return (
    <div className="reveal">
      <ScreeningHeader study={study} stats={stats} />

      <ImportPanel onImport={handleImport} busy={busy} compact={hasData} />

      {notice && (
        <div className="mt-3 px-3 py-2 text-[12px] border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)]">
          {notice}
        </div>
      )}

      {hasData && (
        <>
          <FilterBar
            filters={filters}
            total={total}
            onChange={setFilters}
            onBulk={bulkApply}
            busy={busy}
          />
          <RecordTable
            records={records}
            loading={loading}
            expanded={expanded}
            onToggle={(id) =>
              setExpanded((s) => {
                const next = new Set(s);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onDecision={setDecision}
          />
        </>
      )}
    </div>
  );
}

function StatCount({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <span
        className={cn(
          "font-mono tabular text-[18px] leading-none",
          accent ? "text-[color:var(--color-redink)]" : "",
        )}
      >
        {value}
      </span>
      <span className="text-[9px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
        {label}
      </span>
    </div>
  );
}

function ScreeningHeader({
  study,
  stats,
}: {
  study: Pick<Study, "id" | "title" | "research_question">;
  stats: Stats;
}) {
  return (
    <div className="border-b-2 border-[color:var(--color-ink)] pb-3 sticky top-0 z-30 bg-[color:var(--color-surface)]">
      <div className="flex items-baseline justify-between">
        <Link
          href={`/methods-workbench/${study.id}`}
          className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
        >
          ← Design canvas
        </Link>
        <Link
          href={`/methods-workbench/${study.id}/prisma`}
          className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
        >
          PRISMA flow & exports →
        </Link>
      </div>
      <div className="flex items-end justify-between gap-4 mt-2">
        <div>
          <h1
            className="font-display text-[26px] leading-tight"
            style={{ fontVariationSettings: "'opsz' 48, 'wght' 420" }}
          >
            {study.title}
          </h1>
          <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
            Corpus & screening
          </p>
        </div>
        {stats.total > 0 && (
          <div className="flex items-end gap-4">
            <StatCount label="screened" value={stats.total} />
            <StatCount label="include" value={stats.include} accent />
            <StatCount label="exclude" value={stats.exclude} />
            <StatCount label="maybe" value={stats.maybe} />
            <StatCount label="pending" value={stats.unscreened} />
            <StatCount label="confirmed" value={stats.confirmed} />
          </div>
        )}
      </div>
    </div>
  );
}

function ImportPanel({
  onImport,
  busy,
  compact,
}: {
  onImport: (files: FileList | File[]) => void;
  busy: boolean;
  compact: boolean;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onImport(e.dataTransfer.files);
      }}
      className={cn(
        "mt-4 border border-dashed px-4 transition-colors",
        compact ? "py-2.5" : "py-8 text-center",
        over
          ? "border-[color:var(--color-redink)] bg-[color:var(--color-surface-container-low)]"
          : "border-[color:var(--color-outline-variant)]",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onImport(e.target.files);
          e.target.value = "";
        }}
      />
      <div className={cn("flex items-center gap-3", compact ? "justify-between" : "flex-col")}>
        <p className={cn("text-[13px]", compact ? "" : "font-display text-[15px]")}>
          {busy ? (
            "Importing…"
          ) : compact ? (
            "Re-import or add CSVs (search-process and/or records)."
          ) : (
            <>
              Drop your <span className="font-medium">search-process</span> and{" "}
              <span className="font-medium">records</span> CSVs here — both are auto-detected.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="px-3 py-1.5 text-[12px] font-mono uppercase tracking-wide border border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-surface)] disabled:opacity-40 transition-colors"
        >
          Choose files
        </button>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent border border-[color:var(--color-outline-variant)] px-1.5 py-0.5 text-[12px] normal-case tracking-normal focus:outline-none focus:border-[color:var(--color-primary)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterBar({
  filters,
  total,
  onChange,
  onBulk,
  busy,
}: {
  filters: Filters;
  total: number;
  onChange: (f: Filters) => void;
  onBulk: (decision: ScreeningDecision) => void;
  busy: boolean;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[color:var(--color-outline-variant)] pb-3">
      <input
        value={filters.q}
        onChange={(e) => onChange({ ...filters, q: e.target.value })}
        placeholder="Search title / authors / abstract…"
        className="bg-transparent border-b border-[color:var(--color-outline-variant)] py-1 text-[13px] w-56 focus:outline-none focus:border-[color:var(--color-primary)]"
      />
      <Select
        label="decision"
        value={filters.decision}
        onChange={(v) => onChange({ ...filters, decision: v as ScreeningDecision | "" })}
        options={[{ value: "", label: "all" }, ...DECISIONS.map((d) => ({ value: d, label: d }))]}
      />
      <Select
        label="tier"
        value={filters.tier}
        onChange={(v) => onChange({ ...filters, tier: v })}
        options={[{ value: "", label: "all" }, ...TIERS.map((t) => ({ value: t, label: t }))]}
      />
      <Select
        label="conf"
        value={filters.confidence}
        onChange={(v) => onChange({ ...filters, confidence: v })}
        options={[{ value: "", label: "all" }, ...CONFIDENCES.map((c) => ({ value: c, label: c }))]}
      />
      <Select
        label="needs review"
        value={filters.needs_review}
        onChange={(v) => onChange({ ...filters, needs_review: v as "" | "1" | "0" })}
        options={[
          { value: "", label: "all" },
          { value: "1", label: "flagged" },
          { value: "0", label: "not flagged" },
        ]}
      />
      <span className="text-[11px] font-mono tabular text-[color:var(--color-on-surface-variant)]">
        {total} shown
      </span>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
          Bulk →
        </span>
        {(["include", "exclude", "maybe"] as ScreeningDecision[]).map((d) => (
          <button
            key={d}
            type="button"
            disabled={busy || total === 0}
            onClick={() => onBulk(d)}
            className={cn(
              "px-2 py-0.5 text-[11px] font-mono uppercase tracking-wide border transition-colors disabled:opacity-40",
              SCREENING_DECISION_STYLES[d],
              "hover:bg-[color:var(--color-surface-container-low)]",
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function RecordTable({
  records,
  loading,
  expanded,
  onToggle,
  onDecision,
}: {
  records: ReviewRecord[];
  loading: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDecision: (record: ReviewRecord, decision: ScreeningDecision) => void;
}) {
  if (loading && records.length === 0) {
    return <p className="mt-6 text-[13px] italic text-[color:var(--color-on-surface-variant)]">Loading…</p>;
  }
  if (records.length === 0) {
    return (
      <p className="mt-6 text-[13px] italic text-[color:var(--color-on-surface-variant)]">
        No records match these filters.
      </p>
    );
  }
  return (
    <div className="mt-2 divide-y divide-[color:var(--color-outline-variant)]">
      {records.map((r) => (
        <RecordRow
          key={r.id}
          record={r}
          open={expanded.has(r.id)}
          onToggle={() => onToggle(r.id)}
          onDecision={onDecision}
        />
      ))}
    </div>
  );
}

function RecordRow({
  record,
  open,
  onToggle,
  onDecision,
}: {
  record: ReviewRecord;
  open: boolean;
  onToggle: () => void;
  onDecision: (record: ReviewRecord, decision: ScreeningDecision) => void;
}) {
  return (
    <div className="py-3">
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col gap-1 w-[88px]">
          {record.screen_tier && (
            <Chip
              label={record.screen_tier}
              className={SCREEN_TIER_STYLES[record.screen_tier] ?? SCREEN_TIER_STYLES.secondary}
            />
          )}
          {record.screen_confidence && (
            <Chip
              label={record.screen_confidence}
              className={SCREEN_CONFIDENCE_STYLES[record.screen_confidence] ?? SCREEN_CONFIDENCE_STYLES.med}
            />
          )}
          {record.needs_review && (
            <Chip label="needs review" className="text-[color:var(--color-redink)] border-[color:var(--color-redink)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <button type="button" onClick={onToggle} className="text-left block w-full">
            <span className="font-display text-[15px] leading-snug">{record.title || "(untitled)"}</span>
            <span className="mt-0.5 block text-[12px] text-[color:var(--color-on-surface-variant)]">
              {[record.authors, record.year ?? undefined, record.journal].filter(Boolean).join(" · ")}
            </span>
          </button>
          {record.screen_reason && (
            <p className="mt-1 text-[12px] italic text-[color:var(--color-on-surface-variant)]">
              AI: {record.screen_reason}
            </p>
          )}
          {open && (
            <div className="mt-2 space-y-1 text-[12px] text-[color:var(--color-on-surface-variant)]">
              {record.abstract && <p className="leading-relaxed">{record.abstract}</p>}
              <p className="font-mono text-[11px]">
                {[
                  record.doi && `doi:${record.doi}`,
                  record.pmid && `pmid:${record.pmid}`,
                  record.source_databases,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="inline-flex border border-[color:var(--color-outline-variant)]">
            {(["include", "maybe", "exclude"] as ScreeningDecision[]).map((d) => {
              const active = record.decision === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onDecision(record, d)}
                  title={SCREENING_DECISION_LABEL[d]}
                  className={cn(
                    "px-2 py-0.5 text-[11px] font-mono uppercase tracking-wide transition-colors",
                    active
                      ? cn(SCREENING_DECISION_STYLES[d], "bg-[color:var(--color-surface-container-low)]")
                      : "text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-ink)]",
                  )}
                >
                  {d === "include" ? "✓" : d === "exclude" ? "✕" : "?"}
                </button>
              );
            })}
          </div>
          <span className="text-[9px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
            {record.user_confirmed ? "confirmed" : record.ai_final ? `ai: ${record.ai_final}` : "unconfirmed"}
          </span>
        </div>
      </div>
    </div>
  );
}
