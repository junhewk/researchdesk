"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  GripVertical,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { MarkdownText } from "@/components/MarkdownText";
import type {
  Commentary,
  ManuscriptAsset,
  ManuscriptAssetKind,
  ManuscriptAssetSummary,
} from "@/server/types";

interface AttachmentsPanelProps {
  manuscriptId: string;
}

type AnyItem =
  | { kind: "asset"; data: ManuscriptAssetSummary }
  | { kind: "commentary"; data: Commentary };

const ASSET_KIND_OPTIONS: ManuscriptAssetKind[] = [
  "table",
  "appendix",
  "figure",
  "supplement",
  "response_letter",
  "other",
];

function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function kindBadgeClass(kind: ManuscriptAssetKind): string {
  switch (kind) {
    case "table":
      return "bg-[color:var(--color-primary-container)]/20 text-[color:var(--color-primary)]";
    case "appendix":
      return "bg-[color:var(--color-tertiary-container)]/30 text-[color:var(--color-tertiary-container)]";
    case "figure":
      return "bg-[color:var(--color-secondary-container)]/40 text-[color:var(--color-on-secondary-container)]";
    case "supplement":
      return "bg-[color:var(--color-surface-container-high)] text-[color:var(--color-on-surface-variant)]";
    case "response_letter":
      return "bg-[color:var(--color-error-container)]/30 text-[color:var(--color-on-error-container)]";
    default:
      return "bg-[color:var(--color-surface-container-high)] text-[color:var(--color-on-surface-variant)]";
  }
}

export function AttachmentsPanel({ manuscriptId }: AttachmentsPanelProps) {
  const [assets, setAssets] = useState<ManuscriptAssetSummary[]>([]);
  const [commentaries, setCommentaries] = useState<Commentary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [contents, setContents] = useState<Map<string, string>>(new Map());
  const [contentLoading, setContentLoading] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editKind, setEditKind] = useState<ManuscriptAssetKind>("other");
  const [editLabel, setEditLabel] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editingError, setEditingError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, cRes] = await Promise.all([
        fetch(`/api/manuscripts/${manuscriptId}/assets`),
        fetch(`/api/manuscripts/${manuscriptId}/commentaries`),
      ]);
      if (aRes.ok) setAssets((await aRes.json()) as ManuscriptAssetSummary[]);
      if (cRes.ok) setCommentaries((await cRes.json()) as Commentary[]);
    } finally {
      setLoading(false);
    }
  }, [manuscriptId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openItem = useCallback(
    async (item: AnyItem) => {
      if (openId === item.data.id) {
        setOpenId(null);
        return;
      }
      setOpenId(item.data.id);
      if (item.kind === "commentary") {
        setContents((prev) => {
          const next = new Map(prev);
          next.set(item.data.id, item.data.content_md);
          return next;
        });
        return;
      }
      if (contents.has(item.data.id)) return;
      setContentLoading(item.data.id);
      try {
        const res = await fetch(
          `/api/manuscripts/${manuscriptId}/assets/${item.data.id}`,
        );
        if (res.ok) {
          const full = (await res.json()) as ManuscriptAsset;
          setContents((prev) => {
            const next = new Map(prev);
            next.set(item.data.id, full.content_md);
            return next;
          });
        }
      } finally {
        setContentLoading(null);
      }
    },
    [contents, manuscriptId, openId],
  );

  const startEdit = useCallback(
    (item: AnyItem) => {
      setEditing(item.data.id);
      setEditingError(null);
      if (item.kind === "asset") {
        setEditKind(item.data.kind);
        setEditLabel(item.data.label ?? "");
      } else {
        setEditKind("other");
        setEditLabel(item.data.reviewer_label ?? "");
      }
      setEditContent(contents.get(item.data.id) ?? "");
      // Make sure the content is loaded so we don't blank it out on save
      if (!contents.has(item.data.id) && item.kind === "asset") {
        void openItem(item);
      } else if (item.kind === "commentary") {
        setEditContent(item.data.content_md);
      }
    },
    [contents, openItem],
  );

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setEditingError(null);
  }, []);

  const saveEdit = useCallback(
    async (item: AnyItem) => {
      try {
        if (item.kind === "asset") {
          const res = await fetch(
            `/api/manuscripts/${manuscriptId}/assets/${item.data.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kind: editKind,
                label: editLabel.trim() || null,
                content_md: editContent,
              }),
            },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } else {
          const res = await fetch(
            `/api/manuscripts/${manuscriptId}/commentaries/${item.data.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reviewer_label: editLabel.trim() || null,
                content_md: editContent,
              }),
            },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
        setContents((prev) => {
          const next = new Map(prev);
          next.set(item.data.id, editContent);
          return next;
        });
        setEditing(null);
        await reload();
      } catch (err) {
        setEditingError(err instanceof Error ? err.message : "Save failed");
      }
    },
    [editContent, editKind, editLabel, manuscriptId, reload],
  );

  const deleteItem = useCallback(
    async (item: AnyItem) => {
      const label =
        item.kind === "asset"
          ? item.data.label || item.data.original_file
          : item.data.reviewer_label || `commentary round ${item.data.round}`;
      const ok = window.confirm(
        `Delete "${label}"? This cannot be undone.`,
      );
      if (!ok) return;
      const url =
        item.kind === "asset"
          ? `/api/manuscripts/${manuscriptId}/assets/${item.data.id}`
          : `/api/manuscripts/${manuscriptId}/commentaries/${item.data.id}`;
      await fetch(url, { method: "DELETE" });
      await reload();
    },
    [manuscriptId, reload],
  );

  // HTML5 drag-reorder — assets only
  const dragOverRef = useRef<string | null>(null);
  const onDragStart = (assetId: string) => {
    setDragId(assetId);
    dragOverRef.current = null;
  };
  const onDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    dragOverRef.current = overId;
  };
  const onDragEnd = async () => {
    const src = dragId;
    const dst = dragOverRef.current;
    setDragId(null);
    dragOverRef.current = null;
    if (!src || !dst || src === dst) return;
    const ids = assets.map((a) => a.id);
    const srcIdx = ids.indexOf(src);
    const dstIdx = ids.indexOf(dst);
    if (srcIdx < 0 || dstIdx < 0) return;
    const reordered = [...ids];
    reordered.splice(srcIdx, 1);
    reordered.splice(dstIdx, 0, src);
    // Optimistic
    setAssets((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]));
      return reordered.map((id, i) => ({ ...(map.get(id)!), position: i }));
    });
    await fetch(`/api/manuscripts/${manuscriptId}/assets/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered }),
    });
    await reload();
  };

  const total = assets.length + commentaries.length;

  if (loading && total === 0) {
    return (
      <div className="rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-4 py-3 text-[12px] italic text-[color:var(--color-on-surface-variant)]">
        Loading attachments…
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-4 py-3 text-[12px] italic text-[color:var(--color-on-surface-variant)]">
        No attachments yet. Upload tables, appendices, or commentaries from
        the revision flow.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)]">
      <header className="flex items-center gap-2 border-b border-[color:var(--color-outline-variant)] px-4 py-3">
        <Paperclip
          className="h-3.5 w-3.5 text-[color:var(--color-on-surface-variant)]"
          strokeWidth={1.75}
        />
        <h2 className="font-display text-[13px] font-semibold text-[color:var(--color-on-surface)]">
          Attachments
        </h2>
        <span className="ml-auto label-sm tabular text-[color:var(--color-on-surface-variant)]">
          {total}
        </span>
      </header>

      <ul className="divide-y divide-[color:var(--color-outline-variant)]">
        {/* Commentaries first (round-tagged) */}
        {commentaries.map((c) => {
          const item: AnyItem = { kind: "commentary", data: c };
          const isOpen = openId === c.id;
          const isEditing = editing === c.id;
          return (
            <li key={c.id} className="px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-[color:var(--color-tertiary-container)]/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[color:var(--color-tertiary-container)]">
                  R{c.round}
                </span>
                <button
                  type="button"
                  onClick={() => void openItem(item)}
                  className="min-w-0 flex-1 text-left hover:text-[color:var(--color-primary)]"
                >
                  <div className="truncate text-[12px] font-medium text-[color:var(--color-on-surface)]">
                    {c.reviewer_label || "Reviewer"}
                  </div>
                  <div className="label-sm text-[color:var(--color-on-surface-variant)]">
                    {c.source ?? "uploaded"} ·{" "}
                    {formatBytes(Buffer.byteLength?.(c.content_md, "utf8") ?? c.content_md.length)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  aria-label="Edit commentary"
                  className="text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
                >
                  <Pencil className="h-3 w-3" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteItem(item)}
                  aria-label="Delete commentary"
                  className="text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-error)]"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                </button>
              </div>
              {isEditing && (
                <EditForm
                  showKind={false}
                  kind={editKind}
                  setKind={setEditKind}
                  label={editLabel}
                  setLabel={setEditLabel}
                  content={editContent}
                  setContent={setEditContent}
                  onSave={() => void saveEdit(item)}
                  onCancel={cancelEdit}
                  error={editingError}
                />
              )}
              {isOpen && !isEditing && (
                <div className="mt-2 max-h-[280px] overflow-y-auto rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)] px-3 py-2">
                  {contentLoading === c.id ? (
                    <Loader2 className="h-3 w-3 animate-spin text-[color:var(--color-on-surface-variant)]" />
                  ) : (
                    <MarkdownText
                      text={contents.get(c.id) ?? c.content_md}
                      compact
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}

        {/* Assets — drag-reorderable */}
        {assets.map((a) => {
          const item: AnyItem = { kind: "asset", data: a };
          const isOpen = openId === a.id;
          const isEditing = editing === a.id;
          const isDragging = dragId === a.id;
          return (
            <li
              key={a.id}
              draggable={!isEditing}
              onDragStart={() => onDragStart(a.id)}
              onDragOver={(e) => onDragOver(e, a.id)}
              onDragEnd={() => void onDragEnd()}
              className={`px-3 py-2.5 ${
                isDragging
                  ? "opacity-50 bg-[color:var(--color-surface-container)]"
                  : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 shrink-0 cursor-grab text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)] active:cursor-grabbing"
                  title="Drag to reorder"
                >
                  <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <span
                  className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${kindBadgeClass(a.kind)}`}
                >
                  {a.kind === "response_letter" ? "response" : a.kind}
                </span>
                <button
                  type="button"
                  onClick={() => void openItem(item)}
                  className="min-w-0 flex-1 text-left hover:text-[color:var(--color-primary)]"
                >
                  <div className="truncate text-[12px] font-medium text-[color:var(--color-on-surface)]">
                    {a.label || a.original_file}
                  </div>
                  <div className="label-sm text-[color:var(--color-on-surface-variant)] truncate">
                    {a.label ? a.original_file + " · " : ""}
                    {formatBytes(a.byte_size)}
                    {a.version_number ? ` · v${a.version_number}` : ""}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  aria-label="Edit asset"
                  className="text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
                >
                  <Pencil className="h-3 w-3" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteItem(item)}
                  aria-label="Delete asset"
                  className="text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-error)]"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                </button>
                <ChevronDown
                  className={`mt-0.5 h-3 w-3 shrink-0 text-[color:var(--color-on-surface-variant)] transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  strokeWidth={1.75}
                />
              </div>
              {isEditing && (
                <EditForm
                  showKind
                  kindOptions={ASSET_KIND_OPTIONS}
                  kind={editKind}
                  setKind={setEditKind}
                  label={editLabel}
                  setLabel={setEditLabel}
                  content={editContent}
                  setContent={setEditContent}
                  onSave={() => void saveEdit(item)}
                  onCancel={cancelEdit}
                  error={editingError}
                />
              )}
              {isOpen && !isEditing && (
                <div className="mt-2 max-h-[280px] overflow-y-auto rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)] px-3 py-2">
                  {contentLoading === a.id ? (
                    <Loader2 className="h-3 w-3 animate-spin text-[color:var(--color-on-surface-variant)]" />
                  ) : (
                    <MarkdownText
                      text={contents.get(a.id) ?? "(no content)"}
                      compact
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EditForm({
  showKind,
  kindOptions,
  kind,
  setKind,
  label,
  setLabel,
  content,
  setContent,
  onSave,
  onCancel,
  error,
}: {
  showKind: boolean;
  kindOptions?: ManuscriptAssetKind[];
  kind: ManuscriptAssetKind;
  setKind: (k: ManuscriptAssetKind) => void;
  label: string;
  setLabel: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  error: string | null;
}) {
  return (
    <div className="mt-2 space-y-2 rounded border border-[color:var(--color-primary)] bg-[color:var(--color-surface-container-low)] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {showKind && kindOptions && (
          <label className="inline-flex items-center gap-1.5 text-[12px]">
            <span className="label-sm">Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ManuscriptAssetKind)}
              className="rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-2 py-1 text-[12px]"
            >
              {kindOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="inline-flex flex-1 min-w-[120px] items-center gap-1.5 text-[12px]">
          <span className="label-sm">Label</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1 min-w-0 rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-2 py-1 text-[12px]"
          />
        </label>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        className="w-full resize-y rounded border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-2 py-1.5 font-mono text-[12px] leading-snug text-[color:var(--color-on-surface)] focus:border-[color:var(--color-primary)] outline-none"
      />
      {error && (
        <p className="text-[11px] text-[color:var(--color-error)]">{error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded border border-[color:var(--color-outline-variant)] px-2 py-1 text-[12px] hover:border-[color:var(--color-outline)]"
        >
          <X className="h-3 w-3" strokeWidth={2} />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="inline-flex items-center gap-1 rounded bg-[color:var(--color-primary)] px-2 py-1 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)]"
        >
          <Check className="h-3 w-3" strokeWidth={2} />
          Save
        </button>
      </div>
    </div>
  );
}
