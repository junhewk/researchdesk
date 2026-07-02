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

type ManuscriptInputPatch = Partial<
  Pick<
    Manuscript,
    "journal_type" | "research_domain" | "research_type" | "review_request"
  >
>;

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
  const [editingJournal, setEditingJournal] = useState(false);
  const [editingResearch, setEditingResearch] = useState(false);

  const load = useCallback(async () => {
    const [aRes, cRes] = await Promise.all([
      fetch(`/api/manuscripts/${manuscript.id}/assets`),
      fetch(`/api/manuscripts/${manuscript.id}/commentaries`),
    ]);
    if (aRes.ok) setAssets((await aRes.json()) as ManuscriptAssetSummary[]);
    if (cRes.ok) setCommentaries((await cRes.json()) as Commentary[]);
  }, [manuscript.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount fetch; setState lands after the awaited fetch, not synchronously.
    void load();
  }, [load]);

  const items = useMemo(
    () => buildReviewInputs({ manuscript, assets, commentaries }),
    [assets, commentaries, manuscript],
  );

  const handleItemAction = useCallback((item: InputReadinessItem) => {
    if (item.target === "review-focus") setEditingFocus(true);
    if (item.target === "journal-context") setEditingJournal(true);
    if (item.target === "research-context") setEditingResearch(true);
  }, []);

  async function saveManuscriptPatch(patch: ManuscriptInputPatch) {
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

      <EditableFieldSection
        key={`focus:${manuscript.id}:${manuscript.review_request ?? ""}`}
        visible={focusMissing || editingFocus}
        canCancel={!focusMissing}
        saveLabel="Save focus"
        inputs={[
          {
            id: "workspace-review-focus",
            label: "Review focus",
            placeholder:
              "E.g. General pre-submission review, with extra attention to methods, claims, and journal fit.",
            multiline: true,
            rows: 3,
            value: manuscript.review_request ?? "",
          },
        ]}
        validate={([focus]) =>
          focus.trim() ? null : "Add a short review focus before saving."
        }
        toPatch={([focus]) => ({ review_request: focus.trim() })}
        onSave={saveManuscriptPatch}
        onClose={() => setEditingFocus(false)}
      />

      <EditableFieldSection
        key={`journal:${manuscript.id}:${manuscript.journal_type ?? ""}`}
        visible={journalMissing || editingJournal}
        canCancel={!journalMissing}
        saveLabel="Save journal"
        inputs={[
          {
            id: "workspace-target-journal",
            label: "Target journal",
            placeholder:
              "E.g. BMJ Open, Patient Education and Counseling, medical education journal",
            value: manuscript.journal_type ?? "",
          },
        ]}
        validate={([journal]) =>
          journal.trim()
            ? null
            : "Add a target journal, journal family, or venue."
        }
        toPatch={([journal]) => ({ journal_type: journal.trim() })}
        onSave={saveManuscriptPatch}
        onClose={() => setEditingJournal(false)}
      />

      <EditableFieldSection
        key={`research:${manuscript.id}:${manuscript.research_domain ?? ""}:${manuscript.research_type ?? ""}`}
        visible={researchMissing || editingResearch}
        canCancel={!researchMissing}
        saveLabel="Save context"
        inputs={[
          {
            id: "workspace-research-domain",
            label: "Research domain",
            placeholder:
              "E.g. evidence synthesis, medical education, clinical decision support",
            value: manuscript.research_domain ?? "",
          },
          {
            id: "workspace-research-type",
            label: "Research type",
            placeholder: "E.g. scoping review, protocol, qualitative study",
            value: manuscript.research_type ?? "",
          },
        ]}
        validate={([domain, type]) =>
          domain.trim() && type.trim()
            ? null
            : "Add both research domain and research type."
        }
        toPatch={([domain, type]) => ({
          research_domain: domain.trim(),
          research_type: type.trim(),
        })}
        onSave={saveManuscriptPatch}
        onClose={() => setEditingResearch(false)}
      />
    </div>
  );
}

interface EditableInput {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  multiline?: boolean;
  rows?: number;
}

/** One collapsible "fill in a missing review input" section. Owns the
 * draft/saving/error lifecycle for one-or-more text fields so each manuscript
 * field is a single declarative entry above rather than a copy of the whole
 * edit-in-place state machine. The caller passes a `key` derived from the
 * stored values, so React remounts (and re-seeds the drafts) whenever the
 * manuscript changes underneath — no draft-sync effect needed. */
function EditableFieldSection({
  visible,
  canCancel,
  inputs,
  validate,
  toPatch,
  saveLabel,
  onSave,
  onClose,
}: {
  visible: boolean;
  canCancel: boolean;
  inputs: EditableInput[];
  validate: (values: string[]) => string | null;
  toPatch: (values: string[]) => ManuscriptInputPatch;
  saveLabel: string;
  onSave: (patch: ManuscriptInputPatch) => Promise<void>;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<string[]>(() =>
    inputs.map((input) => input.value),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const setDraft = (index: number, value: string) =>
    setDrafts((prev) => prev.map((v, i) => (i === index ? value : v)));

  const cancel = () => {
    setDrafts(inputs.map((input) => input.value));
    setError(null);
    onClose();
  };

  const save = async () => {
    const validationError = validate(drafts);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(toPatch(drafts));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "w-full rounded border border-[color:var(--color-outline-variant)] bg-transparent px-3 py-2 text-[12px] text-[color:var(--color-on-surface)] outline-none focus:border-[color:var(--color-primary)]";

  return (
    <section className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-4 py-3">
      <div className="grid gap-3">
        {inputs.map((input, index) => (
          <label key={input.id} htmlFor={input.id} className="block">
            <span className="label mb-1.5 block">{input.label}</span>
            {input.multiline ? (
              <textarea
                id={input.id}
                value={drafts[index] ?? ""}
                onChange={(event) => setDraft(index, event.target.value)}
                rows={input.rows ?? 3}
                placeholder={input.placeholder}
                className={fieldClass}
              />
            ) : (
              <input
                id={input.id}
                value={drafts[index] ?? ""}
                onChange={(event) => setDraft(index, event.target.value)}
                placeholder={input.placeholder}
                className={fieldClass}
              />
            )}
          </label>
        ))}
      </div>
      {error && (
        <p className="mt-1 text-[11px] text-[color:var(--color-error)]">
          {error}
        </p>
      )}
      <div className="mt-2 flex justify-end gap-2">
        {canCancel && (
          <button
            type="button"
            onClick={cancel}
            className="px-3 py-1 text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded bg-[color:var(--color-primary)] px-3 py-1 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40"
        >
          {saving ? "Saving..." : saveLabel}
        </button>
      </div>
    </section>
  );
}
