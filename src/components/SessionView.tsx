"use client";

import { useRef, useState, useCallback } from "react";
import { Paperclip, Send, Square, X } from "lucide-react";
import { SessionStream } from "@/components/SessionStream";
import { fetchJson } from "@/lib/api";
import type { SessionStatus, Workflow } from "@/server/types";

interface SessionViewProps {
  sessionId: string;
  workflow?: Workflow;
  onSuggestionCreated?: (data: unknown) => void;
  onTurnComplete?: () => void;
  onFileEdit?: (entry: {
    path: string;
    insertions: number;
    deletions: number;
    tool: string;
    pending: boolean;
    isError: boolean;
  }) => void;
  placeholder?: string;
  initialStartMessage?: string;
}

interface UploadResult {
  title: string;
  content_md: string;
  file_format: "docx" | "pdf" | "md";
  original_file: string;
  word_count: number;
  page_count: number | null;
}

interface UploadedReference extends UploadResult {
  handle: string;
}

const MAX_REFERENCE_CHARS = 80_000;

function makeHandle(filename: string, existing: Set<string>): string {
  const cleaned =
    filename
      .normalize("NFKC")
      .replace(/\s+/g, "_")
      .replace(/[^\p{L}\p{N}._-]/gu, "")
      .replace(/^_+|_+$/g, "") || "file";
  let handle = `@${cleaned}`;
  let suffix = 2;
  while (existing.has(handle)) {
    handle = `@${cleaned}-${suffix}`;
    suffix += 1;
  }
  return handle;
}

function appendHandle(text: string, handle: string): string {
  if (text.includes(handle)) return text;
  if (!text.trim()) return `${handle} `;
  return `${text.trimEnd()} ${handle} `;
}

function removeHandle(text: string, handle: string): string {
  return text.replaceAll(handle, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
}

function contentWithReferences(text: string, refs: UploadedReference[]): string {
  if (refs.length === 0) return text;
  const files = refs.map((ref) => {
    const clipped =
      ref.content_md.length > MAX_REFERENCE_CHARS
        ? `${ref.content_md.slice(0, MAX_REFERENCE_CHARS)}\n\n[truncated at ${MAX_REFERENCE_CHARS.toLocaleString()} characters]`
        : ref.content_md;
    return [
      `<file handle="${ref.handle}" name="${ref.original_file}" format="${ref.file_format}" words="${ref.word_count}">`,
      clipped,
      "</file>",
    ].join("\n");
  });

  return [
    text,
    "",
    "Referenced uploaded files are included below. Use only the files explicitly named with @ handles in my message.",
    "",
    files.join("\n\n"),
  ].join("\n");
}

export function SessionView({
  sessionId,
  workflow,
  onSuggestionCreated,
  onTurnComplete,
  onFileEdit,
  placeholder,
  initialStartMessage,
}: SessionViewProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<SessionStatus>("new");
  const [uploads, setUploads] = useState<UploadedReference[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRunning = status === "running";
  const isNew = status === "new";
  const canSend = !isRunning && !isNew && !uploading && input.trim().length > 0;

  const handleStatusChange = useCallback((s: SessionStatus) => setStatus(s), []);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setUploadError(null);
      try {
        const existing = new Set(uploads.map((upload) => upload.handle));
        const converted: UploadedReference[] = [];

        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);
          const data = await fetchJson<UploadResult>("/api/upload", {
            method: "POST",
            body: formData,
          });
          const handle = makeHandle(data.original_file, existing);
          existing.add(handle);
          converted.push({ ...data, handle });
        }

        setUploads((prev) => [...prev, ...converted]);
        setInput((current) => converted.reduce((next, upload) => appendHandle(next, upload.handle), current));
        textareaRef.current?.focus();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [uploads],
  );

  const removeUpload = useCallback((upload: UploadedReference) => {
    setUploads((prev) => prev.filter((item) => item.handle !== upload.handle));
    setInput((current) => removeHandle(current, upload.handle));
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isRunning) return;
    setSending(true);
    setMessageError(null);
    try {
      const refs = uploads.filter((upload) => text.includes(upload.handle));
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentWithReferences(text, refs) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      setInput("");
      textareaRef.current?.focus();
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : "Send failed");
    }
    finally { setSending(false); }
  }, [input, isRunning, sessionId, uploads]);

  const startSession = useCallback(async () => {
    setMessageError(null);
    try {
      const body = initialStartMessage?.trim()
        ? JSON.stringify({ initial_message: initialStartMessage.trim() })
        : undefined;
      const res = await fetch(`/api/sessions/${sessionId}/start`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Start failed (${res.status})`);
      }
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : "Start failed");
    }
  }, [initialStartMessage, sessionId]);

  const interruptSession = useCallback(async () => {
    try { await fetch(`/api/sessions/${sessionId}/interrupt`, { method: "POST" }); }
    catch { /* noop */ }
  }, [sessionId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) sendMessage();
    }
  }, [canSend, sendMessage]);

  return (
    <div className="flex h-full min-h-[500px] flex-col lg:min-h-0">
      <div className="flex-1 min-h-0 overflow-hidden">
        <SessionStream
          sessionId={sessionId}
          workflow={workflow}
          onSuggestionCreated={onSuggestionCreated}
          onStatusChange={handleStatusChange}
          onTurnComplete={onTurnComplete}
          onFileEdit={onFileEdit}
        />
      </div>

      <div className="pt-4 mt-4 border-t border-[color:var(--color-rule)]">
        {messageError && (
          <div className="mb-3 border-l-2 border-[color:var(--color-redink)] pl-3 py-1.5 font-mono text-[11px] text-[color:var(--color-redink)]">
            {messageError}
          </div>
        )}
        {isNew ? (
          <button
            onClick={startSession}
            className="w-full px-4 py-2 bg-[color:var(--color-ink)] text-[color:var(--color-paper)] text-[13px] hover:bg-[color:var(--color-redink)] transition-colors"
          >
            Start session
          </button>
        ) : (
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".docx,.pdf,.md,.markdown"
              className="hidden"
              onChange={(event) => handleUpload(event.target.files)}
            />
            {(uploads.length > 0 || uploadError) && (
              <div className="flex flex-wrap items-center gap-2">
                {uploads.map((upload) => (
                  <span
                    key={upload.handle}
                    className="inline-flex max-w-full items-center border border-[color:var(--color-rule)] font-mono text-[10px] text-[color:var(--color-ink)]"
                    title={`${upload.original_file} · ${upload.word_count.toLocaleString()} words`}
                  >
                    <button
                      type="button"
                      onClick={() => setInput((current) => appendHandle(current, upload.handle))}
                      className="min-w-0 px-2 py-1 hover:text-[color:var(--color-redink)]"
                    >
                      <span className="block truncate">{upload.handle}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUpload(upload)}
                      className="px-1 py-1 text-[color:var(--color-sepia)] hover:text-[color:var(--color-redink)]"
                      aria-label={`Remove ${upload.handle}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {uploadError && (
                  <span className="font-mono text-[10px] text-[color:var(--color-redink)]">
                    {uploadError}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRunning || uploading}
                title="Upload a DOCX, PDF, or Markdown file and reference it with @"
                className="grid h-[38px] w-[38px] shrink-0 place-items-center border border-[color:var(--color-rule)] text-[color:var(--color-sepia)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)] disabled:opacity-40"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isRunning
                    ? "Writing…"
                    : placeholder ?? "Message the agent or reference @uploaded_file"
                }
                disabled={isRunning}
                className="min-h-[40px] max-h-[200px] flex-1 resize-none bg-transparent border border-[color:var(--color-rule)] px-3 py-2 text-[13px] font-body leading-relaxed focus:outline-none focus:border-[color:var(--color-ink)] placeholder:italic placeholder:text-[color:var(--color-sepia-light)] disabled:opacity-50"
                rows={1}
              />
              {isRunning ? (
                <button
                  onClick={interruptSession}
                  title="Halt agent"
                  className="grid h-[38px] w-[38px] shrink-0 place-items-center text-[color:var(--color-redink)] hover:underline"
                >
                  <Square className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  disabled={!canSend || sending}
                  title="Send"
                  className="grid h-[38px] w-[38px] shrink-0 place-items-center bg-[color:var(--color-ink)] text-[color:var(--color-paper)] hover:bg-[color:var(--color-redink)] disabled:opacity-40 transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
