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
  const [editingJournal, setEditingJournal] = useState(false);
  const [journalDraft, setJournalDraft] = useState(manuscript.journal_type ?? "");
  const [savingJournal, setSavingJournal] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [editingResearch, setEditingResearch] = useState(false);
  const [domainDraft, setDomainDraft] = useState(manuscript.research_domain ?? "");
  const [typeDraft, setTypeDraft] = useState(manuscript.research_type ?? "");
  const [savingResearch, setSavingResearch] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

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

  useEffect(() => {
    setJournalDraft(manuscript.journal_type ?? "");
  }, [manuscript.id, manuscript.journal_type]);

  useEffect(() => {
    setDomainDraft(manuscript.research_domain ?? "");
    setTypeDraft(manuscript.research_type ?? "");
  }, [manuscript.id, manuscript.research_domain, manuscript.research_type]);

  const items = useMemo(
    () => buildReviewInputs({ manuscript, assets, commentaries }),
    [assets, commentaries, manuscript],
  );

  const handleItemAction = useCallback((item: InputReadinessItem) => {
    if (item.target === "review-focus") setEditingFocus(true);
    if (item.target === "journal-context") setEditingJournal(true);
    if (item.target === "research-context") setEditingResearch(true);
  }, []);

  async function saveManuscriptPatch(
    patch: Partial<
      Pick<
        Manuscript,
        "journal_type" | "research_domain" | "research_type" | "review_request"
      >
    >,
  ) {
    const res = await fetch(`/api/manuscripts/${manuscript.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
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
  }

  async function saveFocus() {
    const nextFocus = focusDraft.trim();
    if (!nextFocus) {
      setFocusError("Add a short review focus before saving.");
      return;
    }
    setSavingFocus(true);
    setFocusError(null);
    try {
      await saveManuscriptPatch({ review_request: nextFocus });
      setEditingFocus(false);
    } catch (err) {
      setFocusError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingFocus(false);
    }
  }

  async function saveJournal() {
    const nextJournal = journalDraft.trim();
    if (!nextJournal) {
      setJournalError("Add a target journal, journal family, or venue.");
      return;
    }
    setSavingJournal(true);
    setJournalError(null);
    try {
      await saveManuscriptPatch({ journal_type: nextJournal });
      setEditingJournal(false);
    } catch (err) {
      setJournalError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingJournal(false);
    }
  }

  async function saveResearchContext() {
    const nextDomain = domainDraft.trim();
    const nextType = typeDraft.trim();
    if (!nextDomain || !nextType) {
      setResearchError("Add both research domain and research type.");
      return;
    }
    setSavingResearch(true);
    setResearchError(null);
    try {
      await saveManuscriptPatch({
        research_domain: nextDomain,
        research_type: nextType,
      });
      setEditingResearch(false);
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingResearch(false);
    }
  }

  const focusMissing = !manuscript.review_request?.trim();
  const journalMissing = !manuscript.journal_type?.trim();
  const researchMissing =
    !manuscript.research_domain?.trim() || !manuscript.research_type?.trim();

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

      {(journalMissing || editingJournal) && (
        <section className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-4 py-3">
          <label htmlFor="workspace-target-journal" className="label block mb-1.5">
            Target journal
          </label>
          <input
            id="workspace-target-journal"
            value={journalDraft}
            onChange={(event) => setJournalDraft(event.target.value)}
            placeholder="E.g. BMJ Open, Patient Education and Counseling, medical education journal"
            className="w-full rounded border border-[color:var(--color-outline-variant)] bg-transparent px-3 py-2 text-[12px] text-[color:var(--color-on-surface)] outline-none focus:border-[color:var(--color-primary)]"
          />
          {journalError && (
            <p className="mt-1 text-[11px] text-[color:var(--color-error)]">
              {journalError}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            {!journalMissing && (
              <button
                type="button"
                onClick={() => {
                  setJournalDraft(manuscript.journal_type ?? "");
                  setEditingJournal(false);
                  setJournalError(null);
                }}
                className="px-3 py-1 text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => void saveJournal()}
              disabled={savingJournal}
              className="rounded bg-[color:var(--color-primary)] px-3 py-1 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40"
            >
              {savingJournal ? "Saving..." : "Save journal"}
            </button>
          </div>
        </section>
      )}

      {(researchMissing || editingResearch) && (
        <section className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-4 py-3">
          <div className="grid gap-3">
            <label htmlFor="workspace-research-domain" className="block">
              <span className="label mb-1.5 block">Research domain</span>
              <input
                id="workspace-research-domain"
                value={domainDraft}
                onChange={(event) => setDomainDraft(event.target.value)}
                placeholder="E.g. evidence synthesis, medical education, clinical decision support"
                className="w-full rounded border border-[color:var(--color-outline-variant)] bg-transparent px-3 py-2 text-[12px] text-[color:var(--color-on-surface)] outline-none focus:border-[color:var(--color-primary)]"
              />
            </label>
            <label htmlFor="workspace-research-type" className="block">
              <span className="label mb-1.5 block">Research type</span>
              <input
                id="workspace-research-type"
                value={typeDraft}
                onChange={(event) => setTypeDraft(event.target.value)}
                placeholder="E.g. scoping review, protocol, qualitative study"
                className="w-full rounded border border-[color:var(--color-outline-variant)] bg-transparent px-3 py-2 text-[12px] text-[color:var(--color-on-surface)] outline-none focus:border-[color:var(--color-primary)]"
              />
            </label>
          </div>
          {researchError && (
            <p className="mt-1 text-[11px] text-[color:var(--color-error)]">
              {researchError}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            {!researchMissing && (
              <button
                type="button"
                onClick={() => {
                  setDomainDraft(manuscript.research_domain ?? "");
                  setTypeDraft(manuscript.research_type ?? "");
                  setEditingResearch(false);
                  setResearchError(null);
                }}
                className="px-3 py-1 text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => void saveResearchContext()}
              disabled={savingResearch}
              className="rounded bg-[color:var(--color-primary)] px-3 py-1 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40"
            >
              {savingResearch ? "Saving..." : "Save context"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
