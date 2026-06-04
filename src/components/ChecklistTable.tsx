"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  ReportingChecklistItem,
  ReportingChecklistItemStatus,
} from "@/server/types";

interface Props {
  checklistId: string;
  items: ReportingChecklistItem[];
}

const STATUS_STYLE: Record<ReportingChecklistItemStatus, string> = {
  unaddressed:
    "border-[color:var(--color-error)] text-[color:var(--color-error)]",
  partial:
    "border-[color:var(--color-tertiary)] text-[color:var(--color-tertiary)]",
  addressed:
    "border-[color:var(--color-secondary)] text-[color:var(--color-secondary)]",
  na: "border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]",
};

const STATUS_OPTIONS: ReportingChecklistItemStatus[] = [
  "unaddressed",
  "partial",
  "addressed",
  "na",
];

interface RowProps {
  item: ReportingChecklistItem;
  checklistId: string;
  onSaved: () => void;
}

function Row({ item, checklistId, onSaved }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [evidence, setEvidence] = useState(item.evidence_md ?? "");
  const [location, setLocation] = useState(item.location_ref ?? "");
  const [busy, startTransition] = useTransition();

  const setStatus = (status: ReportingChecklistItemStatus) => {
    startTransition(async () => {
      await fetch(`/api/checklists/${checklistId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onSaved();
    });
  };

  const save = () => {
    startTransition(async () => {
      await fetch(`/api/checklists/${checklistId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidence_md: evidence,
          location_ref: location,
          status: evidence.trim() ? "addressed" : "unaddressed",
        }),
      });
      setEditing(false);
      onSaved();
    });
  };

  return (
    <li className="py-4">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="shrink-0 font-mono text-[11px] text-[color:var(--color-on-surface-variant)] w-20 tabular">
          {item.item_key}
        </span>
        {item.section && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
            {item.section}
          </span>
        )}
        <span
          className={`ml-auto shrink-0 px-2 py-0.5 text-[10px] tracking-wide uppercase font-mono border ${STATUS_STYLE[item.status]}`}
        >
          {item.status}
        </span>
      </div>
      <p className="text-[14px] leading-snug">{item.prompt}</p>
      {item.location_ref && !editing && (
        <p className="mt-1 text-[12px] font-mono text-[color:var(--color-on-surface-variant)]">
          @ {item.location_ref}
        </p>
      )}
      {item.evidence_md && !editing && (
        <p className="mt-1 text-[13px] text-[color:var(--color-on-surface-variant)] whitespace-pre-wrap">
          {item.evidence_md}
        </p>
      )}
      {editing && (
        <div className="mt-2 space-y-2">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (e.g. §3.2, p. 8)"
            className="w-full text-[12px] font-mono border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-2 py-1"
          />
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Evidence — quote supporting passage"
            rows={3}
            className="w-full text-[13px] border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-2 py-1.5 resize-y"
          />
        </div>
      )}
      <div className="mt-2 flex gap-2 flex-wrap">
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5 hover:bg-[color:var(--color-surface-container)]"
          >
            Edit evidence
          </button>
        )}
        {editing && (
          <>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="text-[11px] font-mono uppercase tracking-wide bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)] px-2 py-0.5"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEvidence(item.evidence_md ?? "");
                setLocation(item.location_ref ?? "");
              }}
              className="text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5"
            >
              Cancel
            </button>
          </>
        )}
        {STATUS_OPTIONS.filter((s) => s !== item.status).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => setStatus(s)}
            className="text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-outline-variant)] px-2 py-0.5 hover:bg-[color:var(--color-surface-container)]"
          >
            → {s}
          </button>
        ))}
      </div>
    </li>
  );
}

export function ChecklistTable({ checklistId, items }: Props) {
  const router = useRouter();
  const onSaved = () => router.refresh();

  if (items.length === 0) {
    return (
      <p className="text-[13px] text-[color:var(--color-on-surface-variant)] italic">
        Checklist has no items.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[color:var(--color-outline-variant)] border-t border-[color:var(--color-outline-variant)]">
      {items.map((it) => (
        <Row key={it.id} item={it} checklistId={checklistId} onSaved={onSaved} />
      ))}
    </ul>
  );
}
