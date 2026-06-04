"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileUploadList,
  type UploadEntry,
  type UploadKind,
  type UploadKindOption,
} from "@/components/FileUploadList";
import type { Manuscript, ManuscriptVersion } from "@/server/types";

const REVISION_KIND_OPTIONS: UploadKindOption[] = [
  { value: "manuscript", label: "Revised manuscript (required)", group: "primary" },
  { value: "commentary", label: "Commentary", group: "commentary" },
  { value: "decision_letter", label: "Decision letter", group: "commentary" },
  { value: "reviewer_report", label: "Reviewer report", group: "commentary" },
  { value: "response_letter", label: "Response letter", group: "asset" },
  { value: "table", label: "Table", group: "asset" },
  { value: "appendix", label: "Appendix", group: "asset" },
  { value: "supplement", label: "Supplement", group: "asset" },
  { value: "figure", label: "Figure", group: "asset" },
  { value: "other", label: "Other", group: "asset" },
];

function isCommentary(k: UploadKind): boolean {
  return k === "commentary" || k === "decision_letter" || k === "reviewer_report";
}

function isAsset(k: UploadKind): boolean {
  return (
    k === "table" ||
    k === "appendix" ||
    k === "supplement" ||
    k === "figure" ||
    k === "response_letter" ||
    k === "other"
  );
}

export default function UploadRevisionPage() {
  const router = useRouter();
  const { id: manuscriptId } = useParams<{ id: string }>();

  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [versions, setVersions] = useState<ManuscriptVersion[]>([]);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!manuscriptId) return;
    let cancelled = false;
    (async () => {
      try {
        const [mRes, vRes] = await Promise.all([
          fetch(`/api/manuscripts/${manuscriptId}`),
          fetch(`/api/manuscripts/${manuscriptId}/versions`),
        ]);
        if (cancelled) return;
        if (!mRes.ok) throw new Error("Manuscript not found");
        setManuscript((await mRes.json()) as Manuscript);
        if (vRes.ok) setVersions((await vRes.json()) as ManuscriptVersion[]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manuscriptId]);

  const nextVersionNumber = versions.length + 1;
  const nextRound = useMemo(() => {
    // Round-N commentaries land alongside vN (we use the next version
    // number as the next round to keep the timeline aligned).
    return nextVersionNumber;
  }, [nextVersionNumber]);

  const manuscriptEntry = entries.find(
    (e) => e.kind === "manuscript" && e.extracted,
  );
  const manuscriptCount = entries.filter((e) => e.kind === "manuscript").length;
  const allResolved = entries.every((e) => !e.uploading);
  const hasErrors = entries.some((e) => e.error);
  const canSubmit =
    !!manuscriptEntry &&
    manuscriptCount === 1 &&
    allResolved &&
    !hasErrors &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !manuscriptEntry?.extracted || !manuscriptId) return;
    setSubmitting(true);
    setError(null);
    try {
      const label =
        versionLabel.trim() || `Round ${nextRound} revision`;

      // 1. Append the new manuscript version
      const versionRes = await fetch(
        `/api/manuscripts/${manuscriptId}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content_md: manuscriptEntry.extracted.content_md,
            label,
            source: "user_edit",
          }),
        },
      );
      if (!versionRes.ok) {
        const body = await versionRes.json().catch(() => ({}));
        throw new Error(body.error || `Version create failed (${versionRes.status})`);
      }

      // 2. POST commentaries and assets in parallel, tagged with the round
      const tasks: Promise<unknown>[] = [];
      for (const entry of entries) {
        if (entry.id === manuscriptEntry.id || !entry.extracted) continue;
        if (isCommentary(entry.kind)) {
          tasks.push(
            fetch(`/api/manuscripts/${manuscriptId}/commentaries`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content_md: entry.extracted.content_md,
                reviewer_label:
                  entry.label.trim() ||
                  (entry.kind === "decision_letter"
                    ? "Editor"
                    : entry.kind === "reviewer_report"
                      ? "Reviewer"
                      : undefined),
                round: nextRound,
              }),
            }),
          );
        } else if (isAsset(entry.kind)) {
          tasks.push(
            fetch(`/api/manuscripts/${manuscriptId}/assets`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kind: entry.kind,
                label: entry.label.trim() || undefined,
                original_file: entry.extracted.original_file,
                file_format: entry.extracted.file_format,
                content_md: entry.extracted.content_md,
                byte_size: entry.file.size,
                version_number: nextVersionNumber,
              }),
            }),
          );
        }
      }
      await Promise.all(tasks);

      router.push(`/my-articles/${manuscriptId}/workspace?center=diff`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setSubmitting(false);
    }
  };

  if (error && !manuscript) {
    return (
      <div className="py-20 text-center">
        <p className="mb-3 text-[15px] text-[color:var(--color-error)]">{error}</p>
        <Link
          href="/my-articles"
          className="text-[13px] underline underline-offset-4"
        >
          &larr; My articles
        </Link>
      </div>
    );
  }

  if (!manuscript) {
    return (
      <div className="py-20 text-center text-[14px] text-[color:var(--color-on-surface-variant)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="reveal mx-auto max-w-2xl">
      <Link
        href={`/my-articles/${manuscriptId}/workspace`}
        className="text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
      >
        &larr; Workspace
      </Link>

      <h1
        className="mt-3 font-display text-[32px] font-bold tracking-tight leading-tight"
        style={{ letterSpacing: "-0.02em" }}
      >
        Upload revision
      </h1>
      <p className="mt-2 text-[14px] text-[color:var(--color-on-surface-variant)]">
        For <span className="italic">{manuscript.title}</span>. The revised
        manuscript becomes <strong>v{nextVersionNumber}</strong>; commentaries
        and supplements land at <strong>round {nextRound}</strong>.
      </p>

      {error && (
        <div className="mt-6 rounded border-l-2 border-[color:var(--color-error)] bg-[color:var(--color-error-container)] pl-4 py-2 text-[13px] text-[color:var(--color-on-error-container)]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label htmlFor="version-label" className="label block mb-1.5">
            Version label
          </label>
          <input
            id="version-label"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            placeholder={`Round ${nextRound} revision`}
            className="w-full bg-transparent border-0 border-b border-[color:var(--color-outline-variant)] py-1.5 text-[14px] focus:outline-none focus:border-[color:var(--color-primary)]"
          />
          <p className="mt-1 label-sm text-[color:var(--color-on-surface-variant)]">
            Shown in the Diff tab&apos;s version picker.
          </p>
        </div>

        <FileUploadList
          entries={entries}
          onChange={setEntries}
          kindOptions={REVISION_KIND_OPTIONS}
          defaultKind="manuscript"
        />

        {manuscriptCount > 1 && (
          <p className="text-[12px] text-[color:var(--color-error)]">
            Exactly one file must be tagged <strong>Revised manuscript</strong>;
            you currently have {manuscriptCount}.
          </p>
        )}
        {entries.length > 0 && manuscriptCount === 0 && (
          <p className="text-[12px] text-[color:var(--color-on-surface-variant)]">
            Tag one of your files as <strong>Revised manuscript</strong> to
            continue.
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center rounded bg-[color:var(--color-primary)] px-5 py-2.5 text-[14px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40 transition-colors"
        >
          {submitting
            ? "Uploading…"
            : `Upload as v${nextVersionNumber} / round ${nextRound}`}
        </button>
      </form>
    </div>
  );
}
