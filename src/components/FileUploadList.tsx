"use client";

import { useCallback, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";

/** Categories the user can tag a file with at upload time. Note: this
 * superset spans both initial-upload (manuscript + supplementary) and
 * revision-upload (revised manuscript + commentaries) flows. The parent
 * page decides which subset is offered via `kindOptions`. */
export type UploadKind =
  | "manuscript"
  | "commentary"
  | "decision_letter"
  | "reviewer_report"
  | "response_letter"
  | "table"
  | "appendix"
  | "supplement"
  | "figure"
  | "other"
  | "protocol"
  | "registration"
  | "irb_letter"
  | "crf"
  | "icf";

export interface UploadKindOption {
  value: UploadKind;
  label: string;
  group?: "primary" | "commentary" | "asset";
}

export interface UploadEntry {
  /** Stable client-only id for keying React + drag/reorder. */
  id: string;
  file: File;
  kind: UploadKind;
  label: string;
  /** Set after /api/upload completes. */
  extracted?: {
    title: string;
    content_md: string;
    file_format: "docx" | "pdf" | "md";
    original_file: string;
    word_count: number;
    page_count: number | null;
  };
  uploading: boolean;
  error: string | null;
}

interface FileUploadListProps {
  entries: UploadEntry[];
  onChange: (next: UploadEntry[]) => void;
  kindOptions: UploadKindOption[];
  defaultKind: UploadKind;
  /** Disables the picker for entries with kind === "manuscript" (used on
   * the initial-upload form where exactly one manuscript is required). */
  lockManuscript?: boolean;
  accept?: string;
  className?: string;
}

const DEFAULT_ACCEPT = ".docx,.pdf,.md,.markdown";

export function makeUploadId(): string {
  return `u_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function FileUploadList({
  entries,
  onChange,
  kindOptions,
  defaultKind,
  lockManuscript = false,
  accept = DEFAULT_ACCEPT,
  className,
}: FileUploadListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadEntry = useCallback(
    async (entry: UploadEntry): Promise<UploadEntry> => {
      try {
        const formData = new FormData();
        formData.append("file", entry.file);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Upload failed (${res.status})`);
        }
        const data = (await res.json()) as UploadEntry["extracted"];
        return { ...entry, extracted: data, uploading: false, error: null };
      } catch (err) {
        return {
          ...entry,
          uploading: false,
          error: err instanceof Error ? err.message : "Upload failed",
        };
      }
    },
    [],
  );

  const addFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList) return;
      const files = Array.from(fileList);
      if (files.length === 0) return;

      // Insert placeholder rows immediately so the user sees them queued
      const placeholders: UploadEntry[] = files.map((file) => ({
        id: makeUploadId(),
        file,
        kind: defaultKind,
        label: "",
        uploading: true,
        error: null,
      }));
      const queued = [...entries, ...placeholders];
      onChange(queued);

      // Then process each upload, replacing its row when done.
      let current = queued;
      for (const placeholder of placeholders) {
        const finished = await uploadEntry(placeholder);
        current = current.map((e) => (e.id === placeholder.id ? finished : e));
        onChange(current);
      }
    },
    [defaultKind, entries, onChange, uploadEntry],
  );

  const updateEntry = useCallback(
    (id: string, patch: Partial<UploadEntry>) => {
      onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    },
    [entries, onChange],
  );

  const removeEntry = useCallback(
    (id: string) => {
      onChange(entries.filter((e) => e.id !== id));
    },
    [entries, onChange],
  );

  return (
    <div className={className}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed py-8 text-center transition-colors ${
          dragOver
            ? "border-[color:var(--color-primary)] bg-[color:var(--color-surface-container-low)]"
            : "border-[color:var(--color-outline-variant)] hover:border-[color:var(--color-outline)]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
        <Upload
          className="mx-auto h-5 w-5 text-[color:var(--color-on-surface-variant)]"
          strokeWidth={1.75}
        />
        <p className="mt-2 font-display text-[15px] font-medium text-[color:var(--color-on-surface)]">
          Drop files or click to add
        </p>
        <p className="mt-1 label-sm tabular text-[color:var(--color-on-surface-variant)]">
          .docx · .pdf · .md · multiple at once
        </p>
      </div>

      {/* Queue */}
      {entries.length > 0 && (
        <ul className="mt-4 space-y-2">
          {entries.map((entry) => {
            const lockKind = lockManuscript && entry.kind === "manuscript";
            return (
              <li
                key={entry.id}
                className={`rounded-lg border px-4 py-3 ${
                  entry.error
                    ? "border-[color:var(--color-error)] bg-[color:var(--color-error-container)]/30"
                    : "border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-[color:var(--color-on-surface-variant)]">
                    {entry.uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                    ) : (
                      <FileText className="h-4 w-4" strokeWidth={1.75} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <code className="font-mono text-[13px] font-semibold text-[color:var(--color-on-surface)] break-all">
                        {entry.file.name}
                      </code>
                      <span className="label-sm tabular text-[color:var(--color-on-surface-variant)]">
                        {(entry.file.size / 1024).toFixed(1)} KB
                      </span>
                      {entry.extracted?.word_count !== undefined && (
                        <span className="label-sm tabular text-[color:var(--color-on-surface-variant)]">
                          {entry.extracted.word_count.toLocaleString()} words
                        </span>
                      )}
                    </div>
                    {entry.error && (
                      <p className="mt-1 text-[12px] text-[color:var(--color-on-error-container)]">
                        {entry.error}
                      </p>
                    )}
                    {/* Kind + label row */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-[12px]">
                        <span className="label-sm">Kind</span>
                        <select
                          value={entry.kind}
                          onChange={(e) =>
                            updateEntry(entry.id, {
                              kind: e.target.value as UploadKind,
                            })
                          }
                          disabled={lockKind || entry.uploading}
                          className="rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-2 py-1 text-[12px] text-[color:var(--color-on-surface)] focus:border-[color:var(--color-primary)] outline-none disabled:opacity-60"
                        >
                          {kindOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="inline-flex flex-1 min-w-[160px] items-center gap-1.5 text-[12px]">
                        <span className="label-sm">Label</span>
                        <input
                          type="text"
                          value={entry.label}
                          onChange={(e) =>
                            updateEntry(entry.id, { label: e.target.value })
                          }
                          placeholder="Optional (e.g. 'Reviewer 2')"
                          disabled={entry.uploading}
                          className="flex-1 min-w-0 rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-2 py-1 text-[12px] text-[color:var(--color-on-surface)] focus:border-[color:var(--color-primary)] outline-none disabled:opacity-60"
                        />
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    aria-label={`Remove ${entry.file.name}`}
                    className="text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-error)] transition-colors"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {entries.length === 0 && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] italic text-[color:var(--color-on-surface-variant)]">
          <Paperclip className="h-3 w-3" strokeWidth={1.75} />
          No files yet
        </p>
      )}
    </div>
  );
}
