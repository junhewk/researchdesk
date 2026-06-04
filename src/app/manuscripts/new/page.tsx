"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  FileUploadList,
  type UploadEntry,
  type UploadKind,
  type UploadKindOption,
} from "@/components/FileUploadList";

type AssetKind =
  | "table"
  | "appendix"
  | "supplement"
  | "figure"
  | "response_letter"
  | "other";

const INITIAL_KIND_OPTIONS: UploadKindOption[] = [
  { value: "manuscript", label: "Manuscript (required)", group: "primary" },
  { value: "commentary", label: "Commentary", group: "commentary" },
  { value: "decision_letter", label: "Decision letter", group: "commentary" },
  { value: "reviewer_report", label: "Reviewer report", group: "commentary" },
  { value: "table", label: "Table", group: "asset" },
  { value: "appendix", label: "Appendix", group: "asset" },
  { value: "supplement", label: "Supplement", group: "asset" },
  { value: "figure", label: "Figure", group: "asset" },
  { value: "response_letter", label: "Response letter", group: "asset" },
  { value: "other", label: "Other", group: "asset" },
];

function isCommentary(k: UploadKind): boolean {
  return k === "commentary" || k === "decision_letter" || k === "reviewer_report";
}

function isAsset(k: UploadKind): k is AssetKind {
  return (
    k === "table" ||
    k === "appendix" ||
    k === "supplement" ||
    k === "figure" ||
    k === "response_letter" ||
    k === "other"
  );
}

export default function NewManuscriptPage() {
  const router = useRouter();

  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [title, setTitle] = useState("");
  const [researchDomain, setResearchDomain] = useState("");
  const [journalType, setJournalType] = useState("");
  const [researchType, setResearchType] = useState("");
  const [reviewRequest, setReviewRequest] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manuscriptEntry = useMemo(
    () => entries.find((e) => e.kind === "manuscript" && e.extracted),
    [entries],
  );
  const manuscriptCount = entries.filter((e) => e.kind === "manuscript").length;

  // Auto-fill title from the manuscript file once it lands.
  useEffect(() => {
    if (manuscriptEntry?.extracted && !title) {
      setTitle(manuscriptEntry.extracted.title);
    }
  }, [manuscriptEntry, title]);

  const allUploadsResolved = entries.every((e) => !e.uploading);
  const hasUploadErrors = entries.some((e) => e.error);
  const canSubmit =
    !!manuscriptEntry &&
    manuscriptCount === 1 &&
    allUploadsResolved &&
    !hasUploadErrors &&
    !!title.trim() &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !manuscriptEntry?.extracted) return;
    setSubmitting(true);
    setError(null);
    try {
      // 1. Create the manuscript from the manuscript file
      const res = await fetch("/api/manuscripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content_md: manuscriptEntry.extracted.content_md,
          original_file: manuscriptEntry.extracted.original_file,
          file_format: manuscriptEntry.extracted.file_format,
          research_domain: researchDomain || undefined,
          journal_type: journalType || undefined,
          research_type: researchType || undefined,
          review_request: reviewRequest.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Creation failed (${res.status})`);
      }
      const manuscript = (await res.json()) as { id: string };

      // 2. POST commentaries + assets in parallel
      const tasks: Promise<unknown>[] = [];
      for (const entry of entries) {
        if (entry.id === manuscriptEntry.id || !entry.extracted) continue;
        if (isCommentary(entry.kind)) {
          tasks.push(
            fetch(`/api/manuscripts/${manuscript.id}/commentaries`, {
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
                round: 1,
              }),
            }),
          );
        } else if (isAsset(entry.kind)) {
          tasks.push(
            fetch(`/api/manuscripts/${manuscript.id}/assets`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kind: entry.kind,
                label: entry.label.trim() || undefined,
                original_file: entry.extracted.original_file,
                file_format: entry.extracted.file_format,
                content_md: entry.extracted.content_md,
                byte_size: entry.file.size,
              }),
            }),
          );
        }
      }
      await Promise.all(tasks);

      router.push(`/my-articles/${manuscript.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create manuscript",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="reveal mx-auto max-w-2xl">
      <Link
        href="/my-articles"
        className="text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
      >
        &larr; My articles
      </Link>

      <h1
        className="mt-3 font-display text-[36px] font-bold tracking-tight leading-tight"
        style={{ letterSpacing: "-0.02em" }}
      >
        New article
      </h1>
      <p className="mt-2 mb-8 text-[14px] text-[color:var(--color-on-surface-variant)]">
        Upload the manuscript plus any commentaries, tables, appendices,
        figures, or supplementary files. Tag each with its kind — the agent
        sees the inventory and fetches full text on demand.
      </p>

      {error && (
        <div className="mb-6 rounded border-l-2 border-[color:var(--color-error)] bg-[color:var(--color-error-container)] pl-4 py-2 text-[13px] text-[color:var(--color-on-error-container)]">
          {error}
        </div>
      )}

      <FileUploadList
        entries={entries}
        onChange={setEntries}
        kindOptions={INITIAL_KIND_OPTIONS}
        defaultKind="manuscript"
      />

      {manuscriptCount > 1 && (
        <p className="mt-3 text-[12px] text-[color:var(--color-error)]">
          Exactly one file must be tagged <strong>Manuscript</strong>; you
          currently have {manuscriptCount}.
        </p>
      )}
      {entries.length > 0 && manuscriptCount === 0 && (
        <p className="mt-3 text-[12px] text-[color:var(--color-on-surface-variant)]">
          Tag one of your files as <strong>Manuscript</strong> to continue.
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className={`mt-10 space-y-8 ${manuscriptEntry ? "" : "opacity-60 pointer-events-none"}`}
      >
        <div>
          <label htmlFor="title" className="label block mb-1.5">
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={!manuscriptEntry}
            className="w-full bg-transparent border-0 border-b border-[color:var(--color-on-surface)] font-display text-[20px] font-semibold py-1.5 focus:outline-none focus:border-[color:var(--color-primary)]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="research-domain"
              className="label block mb-1.5"
            >
              Research domain
            </label>
            <input
              id="research-domain"
              value={researchDomain}
              onChange={(e) => setResearchDomain(e.target.value)}
              placeholder="e.g. machine learning"
              className="w-full bg-transparent border-0 border-b border-[color:var(--color-outline-variant)] py-1.5 text-[14px] focus:outline-none focus:border-[color:var(--color-primary)]"
            />
          </div>
          <div>
            <label htmlFor="journal-type" className="label block mb-1.5">
              Target journal
            </label>
            <input
              id="journal-type"
              value={journalType}
              onChange={(e) => setJournalType(e.target.value)}
              placeholder="e.g. NeurIPS"
              className="w-full bg-transparent border-0 border-b border-[color:var(--color-outline-variant)] py-1.5 text-[14px] focus:outline-none focus:border-[color:var(--color-primary)]"
            />
          </div>
          <div>
            <label htmlFor="research-type" className="label block mb-1.5">
              Research type
            </label>
            <Select value={researchType} onValueChange={setResearchType}>
              <SelectTrigger className="w-full border-0 border-b border-[color:var(--color-outline-variant)] rounded-none bg-transparent">
                <SelectValue placeholder="Pick a research type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="empirical">Empirical</SelectItem>
                <SelectItem value="theoretical">Theoretical</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="case-study">Case study</SelectItem>
                <SelectItem value="methodology">Methodology</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label htmlFor="review-request" className="label block mb-1.5">
            What do you want from the agent?
          </label>
          <textarea
            id="review-request"
            value={reviewRequest}
            onChange={(e) => setReviewRequest(e.target.value)}
            rows={3}
            placeholder="Optional. E.g. 'Focus on the statistical claims in §3.'"
            className="w-full rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-3 py-2 text-[13px] text-[color:var(--color-on-surface)] focus:border-[color:var(--color-primary)] outline-none resize-y"
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center rounded bg-[color:var(--color-primary)] px-5 py-2.5 text-[14px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40 transition-colors"
        >
          {submitting ? "Creating…" : "Create manuscript"}
        </button>
      </form>
    </div>
  );
}
