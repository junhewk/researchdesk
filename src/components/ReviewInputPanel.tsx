"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InputReadinessPanel } from "@/components/InputReadinessPanel";
import {
  buildReviewInputs,
  type InputReadinessItem,
} from "@/lib/inputReadiness";
import type {
  Commentary,
  Manuscript,
  ManuscriptAssetSummary,
} from "@/server/types";

export function ReviewInputPanel({
  manuscript,
  onManuscriptChange,
  onAgentScan,
}: {
  manuscript: Manuscript;
  onManuscriptChange: (manuscript: Manuscript) => void;
  onAgentScan: () => void;
}) {
  const [assets, setAssets] = useState<ManuscriptAssetSummary[]>([]);
  const [commentaries, setCommentaries] = useState<Commentary[]>([]);
  const [editingFocus, setEditingFocus] = useState(false);
  const [focusDraft, setFocusDraft] = useState(manuscript.review_request ?? "");
  const [savingFocus, setSavingFocus] = useState(false);
  const [focusError, setFocusError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [aRes, cRes] = await Promise.all([
      fetch(`/api/manuscripts/${manuscript.id}/assets`),
      fetch(`/api/manuscripts/${manuscript.id}/commentaries`),
    ]);
    if (aRes.ok) setAssets((await aRes.json()) as ManuscriptAssetSummary[]);
    if (cRes.ok) setCommentaries((await cRes.json()) as Commentary[]);
  }, [manuscript.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setFocusDraft(manuscript.review_request ?? "");
  }, [manuscript.id, manuscript.review_request]);

  const items = useMemo(
    () => buildReviewInputs({ manuscript, assets, commentaries }),
    [assets, commentaries, manuscript],
  );

  const handleItemAction = useCallback((item: InputReadinessItem) => {
    if (item.target === "review-focus") setEditingFocus(true);
  }, []);

  async function saveFocus() {
    const nextFocus = focusDraft.trim();
    if (!nextFocus) {
      setFocusError("Add a short review focus before saving.");
      return;
    }
    setSavingFocus(true);
    setFocusError(null);
    try {
      const res = await fetch(`/api/manuscripts/${manuscript.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_request: nextFocus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = data as { error?: unknown };
        throw new Error(
          typeof err.error === "string"
            ? err.error
            : `Save failed (${res.status})`,
        );
      }
      onManuscriptChange(data as Manuscript);
      setEditingFocus(false);
    } catch (err) {
      setFocusError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingFocus(false);
    }
  }

  const focusMissing = !manuscript.review_request?.trim();

  return (
    <div className="space-y-3">
      <InputReadinessPanel
        title="Review Inputs"
        description="Required items support the review run; recommended and suggested items improve grounding."
        items={items}
        onItemAction={handleItemAction}
        onAgentScan={onAgentScan}
        agentScanLabel="Prepare agent scan"
      />

      {(focusMissing || editingFocus) && (
        <section className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-4 py-3">
          <label htmlFor="workspace-review-focus" className="label block mb-1.5">
            Review focus
          </label>
          <textarea
            id="workspace-review-focus"
            value={focusDraft}
            onChange={(event) => setFocusDraft(event.target.value)}
            rows={3}
            placeholder="E.g. General pre-submission review, with extra attention to methods, claims, and journal fit."
            className="w-full rounded border border-[color:var(--color-outline-variant)] bg-transparent px-3 py-2 text-[12px] text-[color:var(--color-on-surface)] outline-none focus:border-[color:var(--color-primary)]"
          />
          {focusError && (
            <p className="mt-1 text-[11px] text-[color:var(--color-error)]">
              {focusError}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            {!focusMissing && (
              <button
                type="button"
                onClick={() => {
                  setFocusDraft(manuscript.review_request ?? "");
                  setEditingFocus(false);
                  setFocusError(null);
                }}
                className="px-3 py-1 text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => void saveFocus()}
              disabled={savingFocus}
              className="rounded bg-[color:var(--color-primary)] px-3 py-1 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40"
            >
              {savingFocus ? "Saving..." : "Save focus"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
