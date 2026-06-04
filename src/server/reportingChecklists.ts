import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import { getChecklistTemplate } from "./checklistKnowledge";
import { getManuscript, touchManuscript } from "./manuscripts";
import type {
  ReportingChecklist,
  ReportingChecklistItem,
  ReportingChecklistItemStatus,
  ReportingChecklistSubjectType,
  ReportingGuideline,
} from "./types";

interface ChecklistItemRow extends Omit<ReportingChecklistItem, "required" | "auto_detected"> {
  required: number;
  auto_detected: number;
}

function rowToItem(row: ChecklistItemRow): ReportingChecklistItem {
  return {
    ...row,
    required: Boolean(row.required),
    auto_detected: Boolean(row.auto_detected),
  };
}

export function getChecklist(checklistId: string): ReportingChecklist | undefined {
  return getDb()
    .prepare("SELECT * FROM reporting_checklists WHERE id = ?")
    .get(checklistId) as ReportingChecklist | undefined;
}

export function listChecklists(
  subjectType: ReportingChecklistSubjectType,
  subjectId: string,
): ReportingChecklist[] {
  return getDb()
    .prepare(
      `SELECT * FROM reporting_checklists
       WHERE subject_type = ? AND subject_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(subjectType, subjectId) as ReportingChecklist[];
}

export function listChecklistItems(
  checklistId: string,
): ReportingChecklistItem[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM reporting_checklist_items
       WHERE checklist_id = ?
       ORDER BY position ASC, created_at ASC`,
    )
    .all(checklistId) as ChecklistItemRow[];
  return rows.map(rowToItem);
}

function touchSubject(checklist: ReportingChecklist): void {
  // Protocol-subject checklists are no longer created; only manuscripts remain.
  if (checklist.subject_type === "manuscript") {
    touchManuscript(checklist.subject_id);
  }
}

/** Create a checklist + seed its items from the static knowledge base. */
export function createChecklist(opts: {
  subject_type: ReportingChecklistSubjectType;
  subject_id: string;
  guideline: ReportingGuideline;
}): ReportingChecklist {
  // Verify the subject exists. Protocol checklists are no longer supported.
  if (opts.subject_type === "protocol") {
    throw new Error("protocol checklists are no longer supported");
  }
  if (!getManuscript(opts.subject_id)) {
    throw new Error("manuscript not found");
  }

  const template = getChecklistTemplate(opts.guideline);
  if (!template) {
    throw new Error(`unknown guideline: ${opts.guideline}`);
  }
  if (template.subject_type !== opts.subject_type) {
    throw new Error(
      `${opts.guideline} applies to ${template.subject_type}, not ${opts.subject_type}`,
    );
  }

  const db = getDb();
  const now = nowUnix();
  const id = `chk_${nanoid(16)}`;
  const checklist: ReportingChecklist = {
    id,
    subject_type: opts.subject_type,
    subject_id: opts.subject_id,
    guideline: opts.guideline,
    version: template.version,
    created_at: now,
    updated_at: now,
  };

  db.transaction(() => {
    db.prepare(
      `INSERT INTO reporting_checklists
         (id, subject_type, subject_id, guideline, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      checklist.id,
      checklist.subject_type,
      checklist.subject_id,
      checklist.guideline,
      checklist.version,
      checklist.created_at,
      checklist.updated_at,
    );

    const insertItem = db.prepare(
      `INSERT INTO reporting_checklist_items
         (id, checklist_id, item_key, section, prompt, required, status,
          evidence_md, location_ref, auto_detected, position,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    template.items.forEach((it, idx) => {
      insertItem.run(
        `chi_${nanoid(16)}`,
        checklist.id,
        it.item_key,
        it.section,
        it.prompt,
        it.required_for ? 1 : 1,
        "unaddressed",
        null,
        null,
        0,
        idx,
        now,
        now,
      );
    });
  })();

  touchSubject(checklist);
  return checklist;
}

export function updateChecklistItem(
  itemId: string,
  patch: {
    status?: ReportingChecklistItemStatus;
    evidence_md?: string | null;
    location_ref?: string | null;
  },
): ReportingChecklistItem | undefined {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM reporting_checklist_items WHERE id = ?")
    .get(itemId) as ChecklistItemRow | undefined;
  if (!existing) return undefined;

  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (patch.evidence_md !== undefined) {
    sets.push("evidence_md = ?");
    params.push(patch.evidence_md);
  }
  if (patch.location_ref !== undefined) {
    sets.push("location_ref = ?");
    params.push(patch.location_ref);
  }
  if (sets.length === 0) return rowToItem(existing);

  const now = nowUnix();
  sets.push("updated_at = ?");
  params.push(now, itemId);
  db.prepare(
    `UPDATE reporting_checklist_items SET ${sets.join(", ")} WHERE id = ?`,
  ).run(...params);
  db.prepare(
    "UPDATE reporting_checklists SET updated_at = ? WHERE id = ?",
  ).run(now, existing.checklist_id);
  const checklist = getChecklist(existing.checklist_id);
  if (checklist) touchSubject(checklist);
  return rowToItem({ ...existing, ...patch, updated_at: now } as ChecklistItemRow);
}

/** Regex pre-pass over the subject's content. Any item whose detect_regex
 * matches gets marked `addressed` with `auto_detected=true`, unless it is
 * already addressed (don't overwrite user-curated state). */
export function autoDetectChecklistItems(checklistId: string): {
  detected: number;
} {
  const checklist = getChecklist(checklistId);
  if (!checklist) return { detected: 0 };
  const template = getChecklistTemplate(checklist.guideline);
  if (!template) return { detected: 0 };

  const text =
    checklist.subject_type === "manuscript"
      ? (getManuscript(checklist.subject_id)?.content_md ?? "")
      : "";
  if (!text) return { detected: 0 };

  const db = getDb();
  const items = listChecklistItems(checklistId);
  const findItem = (key: string) => items.find((it) => it.item_key === key);

  let detected = 0;
  const now = nowUnix();
  for (const tpl of template.items) {
    if (!tpl.detect_regex) continue;
    const item = findItem(tpl.item_key);
    if (!item || item.status !== "unaddressed") continue;
    if (tpl.detect_regex.test(text)) {
      db.prepare(
        `UPDATE reporting_checklist_items
            SET status = 'addressed', auto_detected = 1, updated_at = ?
          WHERE id = ?`,
      ).run(now, item.id);
      detected += 1;
    }
  }
  if (detected > 0) {
    db.prepare(
      "UPDATE reporting_checklists SET updated_at = ? WHERE id = ?",
    ).run(now, checklistId);
    touchSubject(checklist);
  }
  return { detected };
}
