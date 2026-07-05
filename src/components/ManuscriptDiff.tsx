"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { diffLines, diffWordsWithSpace, type Change } from "diff";
import { ArrowLeftRight, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { AgentEffort, ManuscriptVersion, Provider } from "@/server/types";

interface ManuscriptDiffProps {
  manuscriptId: string;
  /** Latest content_md (mirrored to manuscripts.content_md). Used as a
   * fallback if the versions list hasn't loaded yet. */
  fallbackCurrent: string;
  provider?: Provider;
  model?: string;
  effort?: AgentEffort | "" | null;
}

type Granularity = "line" | "word";

interface Stats {
  insertions: number;
  deletions: number;
  unchanged: number;
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

function statsFor(changes: Change[], granularity: Granularity): Stats {
  let insertions = 0;
  let deletions = 0;
  let unchanged = 0;
  for (const c of changes) {
    const n =
      granularity === "line"
        ? countLines(c.value)
        : (c.value.match(/\S+/g)?.length ?? 0);
    if (c.added) insertions += n;
    else if (c.removed) deletions += n;
    else unchanged += n;
  }
  return { insertions, deletions, unchanged };
}

function versionLabel(v: ManuscriptVersion): string {
  const base = v.label?.trim() || `Version ${v.version_number}`;
  return `v${v.version_number} · ${base}`;
}

export function ManuscriptDiff({
  manuscriptId,
  fallbackCurrent,
  provider,
  model,
  effort,
}: ManuscriptDiffProps) {
  const [versions, setVersions] = useState<ManuscriptVersion[] | null>(null);
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("line");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);

  const loadVersions = useCallback(async (selectLatest = false) => {
    const res = await fetch(`/api/manuscripts/${manuscriptId}/versions`);
    if (!res.ok) return;
    const data = (await res.json()) as ManuscriptVersion[];
    setVersions(data);
    if (data.length === 0) return;
    setLeftId((prev) => prev ?? data[0].id);
    setRightId((prev) =>
      selectLatest ? data[data.length - 1].id : prev ?? data[data.length - 1].id,
    );
  }, [manuscriptId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const left = versions?.find((v) => v.id === leftId) ?? null;
  const right = versions?.find((v) => v.id === rightId) ?? null;

  const leftText = left?.content_md ?? "";
  const rightText = right?.content_md ?? fallbackCurrent;

  const changes = useMemo<Change[]>(() => {
    if (granularity === "line") {
      return diffLines(leftText, rightText, { newlineIsToken: true });
    }
    return diffWordsWithSpace(leftText, rightText);
  }, [leftText, rightText, granularity]);

  const stats = useMemo(
    () => statsFor(changes, granularity),
    [changes, granularity],
  );

  const sameVersion = leftId !== null && leftId === rightId;
  const identical = stats.insertions === 0 && stats.deletions === 0;

  const createNewVersion = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    setCreateNotice(null);
    try {
      const body: { provider?: Provider; model?: string; effort?: AgentEffort } = {};
      if (provider) body.provider = provider;
      if (model?.trim()) body.model = model.trim();
      if (effort) body.effort = effort;
      const res = await fetch(`/api/manuscripts/${manuscriptId}/versions/run-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { session_id?: string };
      setCreateNotice("Version pass started. This view will refresh when it finishes.");

      if (data.session_id) {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const statusRes = await fetch(`/api/sessions/${data.session_id}`);
          if (!statusRes.ok) continue;
          const statusData = (await statusRes.json()) as { status?: string };
          if (statusData.status === "crashed") {
            throw new Error("Version agent failed.");
          }
          if (
            statusData.status === "idle" ||
            statusData.status === "completed"
          ) {
            await loadVersions(true);
            setCreateNotice("Version list refreshed.");
            return;
          }
        }
      }

      await loadVersions(true);
      setCreateNotice("Version run is still working. Use Refresh in a moment.");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Version run failed");
    } finally {
      setCreating(false);
    }
  }, [creating, effort, loadVersions, manuscriptId, model, provider]);

  if (versions === null) {
    return (
      <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-6 py-12 text-center">
        <p className="text-[14px] italic text-[color:var(--color-on-surface-variant)]">
          Loading versions…
        </p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-6 py-12 text-center">
        <p className="text-[14px] italic text-[color:var(--color-on-surface-variant)]">
          No versions recorded yet. Use Create new version after review
          suggestions are ready.
        </p>
        <button
          type="button"
          onClick={() => void createNewVersion()}
          disabled={creating}
          className="mt-4 inline-flex items-center gap-1.5 rounded bg-[color:var(--color-primary)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {creating ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
              Creating…
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" strokeWidth={2} />
              Create new version
            </>
          )}
        </button>
        {createNotice && (
          <p className="mt-3 text-[12px] text-[color:var(--color-on-surface-variant)]">
            {createNotice}
          </p>
        )}
        {createError && (
          <p className="mt-3 text-[12px] text-[color:var(--color-error)]">
            {createError}
          </p>
        )}
      </div>
    );
  }

  const dropdown = (
    label: string,
    value: string | null,
    onChange: (id: string) => void,
  ) => (
    <label className="inline-flex items-center gap-2 text-[12px]">
      <span className="label-sm">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-2 py-1 text-[13px] text-[color:var(--color-on-surface)] focus:border-[color:var(--color-primary)] outline-none"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {versionLabel(v)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)]">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-[color:var(--color-outline-variant)] px-5 py-3">
        <ArrowLeftRight
          className="h-4 w-4 text-[color:var(--color-on-surface-variant)]"
          strokeWidth={1.75}
        />
        <h2 className="font-display text-[15px] font-semibold text-[color:var(--color-on-surface)]">
          Compare versions
        </h2>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void loadVersions()}
            className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)] underline-offset-2 hover:underline"
          >
            <RefreshCw className="h-3 w-3" strokeWidth={1.75} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void createNewVersion()}
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded bg-[color:var(--color-primary)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Create a new manuscript version"
          >
            {creating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                Creating…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" strokeWidth={2} />
                Create new version
              </>
            )}
          </button>
        </div>
      </header>

      {createError && (
        <div className="border-b border-[color:var(--color-error)] bg-[color:var(--color-error-container)] px-5 py-2 text-[12px] text-[color:var(--color-on-error-container)]">
          {createError}
        </div>
      )}
      {createNotice && (
        <div className="border-b border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)] px-5 py-2 text-[12px] text-[color:var(--color-on-surface-variant)]">
          {createNotice}
        </div>
      )}

      {/* Version pickers + granularity toggle */}
      <div className="flex flex-wrap items-center gap-4 border-b border-[color:var(--color-outline-variant)] px-5 py-3">
        {dropdown("Left", leftId, setLeftId)}
        <span aria-hidden className="text-[color:var(--color-outline-variant)]">
          vs
        </span>
        {dropdown("Right", rightId, setRightId)}

        <div className="ml-auto flex items-center gap-3 text-[12px]">
          {!sameVersion && (
            <>
              <span className="inline-flex items-center gap-1 text-[color:var(--color-change-inserted-ink)]">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-sm bg-[color:var(--color-change-inserted-bg)]"
                />
                +{stats.insertions}
              </span>
              <span className="inline-flex items-center gap-1 text-[color:var(--color-change-deleted-ink)]">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-sm bg-[color:var(--color-change-deleted-bg)]"
                />
                −{stats.deletions}
              </span>
              <span className="label-sm tabular">
                ({granularity === "line" ? "lines" : "words"})
              </span>
            </>
          )}

          <div className="inline-flex rounded border border-[color:var(--color-outline-variant)] overflow-hidden">
            {(["line", "word"] as const).map((g) => {
              const active = granularity === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularity(g)}
                  className={`px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    active
                      ? "bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)]"
                      : "bg-[color:var(--color-surface-container-lowest)] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
                  }`}
                >
                  {g === "line" ? "By line" : "By word"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Diff body */}
      {sameVersion ? (
        <p className="px-6 py-12 text-center text-[14px] italic text-[color:var(--color-on-surface-variant)]">
          Same version selected on both sides.
        </p>
      ) : identical ? (
        <p className="px-6 py-12 text-center text-[14px] italic text-[color:var(--color-on-surface-variant)]">
          No differences between these versions.
        </p>
      ) : (
        <pre className="overflow-x-auto px-5 py-5 font-body text-[14px] leading-[26px] text-[color:var(--color-on-surface)] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {changes.map((c, i) => {
            if (c.added) {
              return (
                <span
                  key={i}
                  className="bg-[color:var(--color-change-inserted-bg)] text-[color:var(--color-change-inserted-ink)] font-bold"
                >
                  {c.value}
                </span>
              );
            }
            if (c.removed) {
              return (
                <span
                  key={i}
                  className="bg-[color:var(--color-change-deleted-bg)] text-[color:var(--color-change-deleted-ink)] line-through italic"
                >
                  {c.value}
                </span>
              );
            }
            return <span key={i}>{c.value}</span>;
          })}
        </pre>
      )}
    </div>
  );
}
