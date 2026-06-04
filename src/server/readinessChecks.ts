import { nanoid } from "nanoid";
import { getDb, buildAssignments } from "./db";
import { nowUnix } from "@/lib/utils";
import { getManuscript, touchManuscript } from "./manuscripts";
import { getStudy, listDecisions } from "./studies";
import { getModeSchema } from "./methods/cardSchema";
import { getChecklistTemplate } from "./checklistKnowledge";
import { isReadyState, parseValue } from "./methods/preflight";
import type {
  ProtocolConfidentialityMode,
  ReadinessCheck,
  ReadinessCheckItem,
  ReadinessCheckStatus,
  ReadinessItemStatus,
  Severity,
} from "./types";

interface ReadinessItemRow extends Omit<ReadinessCheckItem, "auto_detected"> {
  auto_detected: number;
}

function rowToItem(row: ReadinessItemRow): ReadinessCheckItem {
  return { ...row, auto_detected: Boolean(row.auto_detected) };
}

export function getReadinessCheck(
  checkId: string,
): ReadinessCheck | undefined {
  return getDb()
    .prepare("SELECT * FROM readiness_checks WHERE id = ?")
    .get(checkId) as ReadinessCheck | undefined;
}

export function listReadinessChecks(manuscriptId: string): ReadinessCheck[] {
  return getDb()
    .prepare(
      `SELECT * FROM readiness_checks
       WHERE manuscript_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(manuscriptId) as ReadinessCheck[];
}

export function listReadinessItems(checkId: string): ReadinessCheckItem[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM readiness_check_items
       WHERE check_id = ?
       ORDER BY created_at ASC`,
    )
    .all(checkId) as ReadinessItemRow[];
  return rows.map(rowToItem);
}

export function createReadinessCheck(opts: {
  manuscriptId: string;
  protocolId?: string | null;
  studyId?: string | null;
  sessionId?: string | null;
}): ReadinessCheck {
  if (!getManuscript(opts.manuscriptId)) {
    throw new Error("manuscript not found");
  }
  const effective: ProtocolConfidentialityMode = "cloud_default";
  const db = getDb();
  const now = nowUnix();
  const id = `rc_${nanoid(16)}`;
  const check: ReadinessCheck = {
    id,
    manuscript_id: opts.manuscriptId,
    protocol_id: opts.protocolId ?? null,
    study_id: opts.studyId ?? null,
    session_id: opts.sessionId ?? null,
    status: "running",
    overall_score: null,
    summary_md: null,
    effective_confidentiality: effective,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO readiness_checks
       (id, manuscript_id, protocol_id, study_id, session_id, status, overall_score,
        summary_md, effective_confidentiality, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    check.id,
    check.manuscript_id,
    check.protocol_id,
    check.study_id,
    check.session_id,
    check.status,
    check.overall_score,
    check.summary_md,
    check.effective_confidentiality,
    check.created_at,
    check.updated_at,
  );
  touchManuscript(opts.manuscriptId);
  return check;
}

export function updateReadinessCheck(
  checkId: string,
  patch: {
    status?: ReadinessCheckStatus;
    overall_score?: number | null;
    summary_md?: string | null;
  },
): ReadinessCheck | undefined {
  const existing = getReadinessCheck(checkId);
  if (!existing) return undefined;
  const { sets, params } = buildAssignments(patch);
  if (sets.length === 0) return existing;
  const now = nowUnix();
  sets.push("updated_at = ?");
  params.push(now, checkId);
  getDb()
    .prepare(`UPDATE readiness_checks SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
  touchManuscript(existing.manuscript_id);
  return getReadinessCheck(checkId);
}

export function appendReadinessItem(opts: {
  checkId: string;
  gate: string;
  severity?: Severity | null;
  finding_md: string;
  suggested_fix_md?: string | null;
  auto_detected?: boolean;
}): ReadinessCheckItem | undefined {
  const check = getReadinessCheck(opts.checkId);
  if (!check) return undefined;
  const db = getDb();
  const now = nowUnix();
  const id = `rci_${nanoid(16)}`;
  db.prepare(
    `INSERT INTO readiness_check_items
       (id, check_id, manuscript_id, gate, severity, finding_md,
        suggested_fix_md, status, auto_detected, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    opts.checkId,
    check.manuscript_id,
    opts.gate,
    opts.severity ?? null,
    opts.finding_md,
    opts.suggested_fix_md ?? null,
    "open",
    opts.auto_detected ? 1 : 0,
    now,
    now,
  );
  db.prepare("UPDATE readiness_checks SET updated_at = ? WHERE id = ?").run(
    now,
    opts.checkId,
  );
  touchManuscript(check.manuscript_id);
  return getReadinessItem(id);
}

export function getReadinessItem(
  itemId: string,
): ReadinessCheckItem | undefined {
  const row = getDb()
    .prepare("SELECT * FROM readiness_check_items WHERE id = ?")
    .get(itemId) as ReadinessItemRow | undefined;
  return row ? rowToItem(row) : undefined;
}

export function setReadinessItemStatus(
  itemId: string,
  status: ReadinessItemStatus,
): ReadinessCheckItem | undefined {
  const existing = getReadinessItem(itemId);
  if (!existing) return undefined;
  const now = nowUnix();
  getDb()
    .prepare(
      `UPDATE readiness_check_items SET status = ?, updated_at = ? WHERE id = ?`,
    )
    .run(status, now, itemId);
  return getReadinessItem(itemId);
}

/** Cheap pre-checks over the manuscript text. Run before the agent. */
export function runReadinessPreChecks(opts: {
  checkId: string;
  manuscriptId: string;
}): { detected: number } {
  const manuscript = getManuscript(opts.manuscriptId);
  if (!manuscript) return { detected: 0 };
  const text = manuscript.content_md;
  let detected = 0;

  const checks: Array<{
    gate: string;
    severity: Severity;
    test: (txt: string) => boolean;
    finding_md: string;
    suggested_fix_md: string;
  }> = [
    {
      gate: "data_availability",
      severity: "major",
      test: (t) => !/data\s*availability|data\s*sharing/i.test(t),
      finding_md: "No data-availability statement.",
      suggested_fix_md:
        "Add a statement describing where the dataset will be available (e.g., Zenodo, OSF) or why it cannot be shared.",
    },
    {
      gate: "conflict_of_interest",
      severity: "minor",
      test: (t) =>
        !/(conflict|competing)\s*(of\s*)?interests?|disclosure/i.test(t),
      finding_md: "No conflict-of-interest declaration found.",
      suggested_fix_md:
        "Add a 'Competing interests' or 'Conflict of interest' section, even if simply 'The authors declare no competing interests.'",
    },
    {
      gate: "funding",
      severity: "minor",
      test: (t) => !/funding|grant\s*(no\.?|number)/i.test(t),
      finding_md: "No funding statement found.",
      suggested_fix_md:
        "Add a 'Funding' section. If no external funding was received, state so explicitly.",
    },
    {
      gate: "ethics",
      severity: "major",
      test: (t) =>
        !/IRB|ethics\s*committee|institutional\s*review|ethics\s*approval/i.test(t),
      finding_md: "No ethics/IRB approval statement found.",
      suggested_fix_md:
        "Cite the IRB or ethics-committee approval (institution + reference number).",
    },
    {
      gate: "limitations",
      severity: "minor",
      test: (t) => !/limitations?/i.test(t),
      finding_md: "No explicit limitations section.",
      suggested_fix_md:
        "Add a 'Limitations' subsection in the Discussion describing design, sampling, measurement, and generalizability constraints.",
    },
    {
      gate: "abstract_structure",
      severity: "minor",
      test: (t) =>
        !/(Background|Objective|Methods|Results|Conclusion)s?\s*[:.\n]/.test(
          t.slice(0, 3000),
        ),
      finding_md:
        "Abstract does not appear to use a structured format (Background / Methods / Results / Conclusion).",
      suggested_fix_md:
        "Re-structure the abstract with explicit subheadings (Background, Methods, Results, Conclusions) per most clinical journals' requirements.",
    },
  ];

  for (const c of checks) {
    if (c.test(text)) {
      appendReadinessItem({
        checkId: opts.checkId,
        gate: c.gate,
        severity: c.severity,
        finding_md: c.finding_md,
        suggested_fix_md: c.suggested_fix_md,
        auto_detected: true,
      });
      detected += 1;
    }
  }

  return { detected };
}

// Tokens too generic to anchor a protocol↔manuscript comparison on.
const COMPARE_STOPWORDS = new Set([
  "with", "that", "this", "from", "data", "study", "group", "groups",
  "patient", "patients", "based", "using", "week", "weeks", "month",
  "months", "time", "trial", "into", "their", "will", "have", "been",
]);

function significantTokens(s: string): string[] {
  const out = new Set<string>();
  for (const w of s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []) {
    if (!COMPARE_STOPWORDS.has(w)) out.add(w);
  }
  return [...out];
}

/**
 * Deterministic protocol↔manuscript comparison. Diffs a manuscript against the
 * study's compiled design (decision cards + reporting-checklist commitments)
 * and emits readiness findings for the kinds of drift the workshop slide names:
 * claim-support / outcome mismatch, comparator mismatch, protocol drift,
 * outcome-timing ambiguity, data-dictionary inconsistency, and reporting-
 * checklist gaps. No LLM — semantic/paraphrase drift is left to the readiness
 * agent, which appends items under the same gate names.
 */
export function runProtocolCompareChecks(opts: {
  checkId: string;
  manuscriptId: string;
  studyId: string;
}): { detected: number } {
  const manuscript = getManuscript(opts.manuscriptId);
  const study = getStudy(opts.studyId);
  if (!manuscript || !study) return { detected: 0 };
  const text = manuscript.content_md;
  const lower = text.toLowerCase();
  const decisions = listDecisions(opts.studyId);
  const byType = new Map(decisions.map((d) => [d.card_type, d] as const));
  let detected = 0;

  const valueOf = (cardType: string) =>
    parseValue(byType.get(cardType)?.value_json ?? null);
  const stateOf = (cardType: string) => byType.get(cardType)?.state ?? "not_started";
  const add = (
    gate: string,
    severity: Severity,
    finding_md: string,
    suggested_fix_md: string,
  ) => {
    appendReadinessItem({
      checkId: opts.checkId,
      gate,
      severity,
      finding_md,
      suggested_fix_md,
      auto_detected: true,
    });
    detected += 1;
  };
  const mentioned = (phrase: string): boolean => {
    const p = phrase.trim().toLowerCase();
    if (!p) return true;
    if (lower.includes(p)) return true;
    const toks = significantTokens(p);
    return toks.length > 0 && toks.some((t) => lower.includes(t));
  };
  // Stricter than `mentioned`: the head phrase (before any qualifier) must
  // appear verbatim. Used where a generic shared token (e.g. "diabetes") would
  // otherwise mask a real drift.
  const anchorAbsent = (phrase: string): boolean => {
    const anchor = phrase.split(/[(;,\n]/)[0].trim().toLowerCase();
    return anchor.length >= 4 && !lower.includes(anchor);
  };

  // Primary outcome (interventional → primary_outcome; observational → outcome).
  const po = byType.has("primary_outcome") ? valueOf("primary_outcome") : valueOf("outcome");
  const poText = (po.fields?.outcome || po.value || "").trim();
  if (poText && !mentioned(poText)) {
    add(
      "primary_outcome_mismatch",
      "major",
      `Protocol primary outcome ("${poText}") is not clearly reported in the manuscript.`,
      "Report the pre-specified primary outcome explicitly, or document the change and its justification.",
    );
  }

  // Outcome-timing ambiguity: protocol fixes a timepoint the manuscript omits.
  const timepoint = (po.fields?.timepoint || "").trim();
  const tp = timepoint.match(/(\d+)\s*(week|wk|month|day|year)/i);
  if (tp) {
    const re = new RegExp(`\\b${tp[1]}\\s*(?:${tp[2]}|${tp[2]}s)\\b`, "i");
    if (!re.test(text)) {
      add(
        "outcome_timing_ambiguity",
        "minor",
        `Protocol measures the primary outcome at ${timepoint}, but the manuscript does not report this timepoint.`,
        "Align the reported measurement timepoint with the protocol, or explain the deviation.",
      );
    }
  }

  // Comparator drift.
  const comp = valueOf("comparator");
  const compText = (comp.fields?.definition || comp.value || "").trim();
  if (compText && anchorAbsent(compText)) {
    add(
      "comparator_mismatch",
      "major",
      `Protocol comparator ("${compText}") does not appear in the manuscript.`,
      "State the comparator arm exactly as pre-specified, or document the change.",
    );
  }

  // Protocol drift: pre-specified exclusions not reflected in the manuscript.
  const elig = byType.has("eligibility") ? valueOf("eligibility") : valueOf("eligibility_criteria");
  const exclusion = (elig.fields?.exclusion || "").trim();
  if (exclusion && !/exclu/i.test(text)) {
    add(
      "exclusion_drift",
      "minor",
      "The protocol pre-specifies exclusion criteria, but the manuscript reports no exclusions.",
      "Report the pre-specified exclusion criteria in the Methods, or document why they changed.",
    );
  }

  // Data-dictionary inconsistency: defined secondary outcomes absent downstream.
  const sec = valueOf("secondary_outcomes");
  const secText = (sec.fields?.outcomes || sec.value || "").trim();
  if (secText && anchorAbsent(secText)) {
    add(
      "data_dictionary_inconsistency",
      "minor",
      `Secondary outcomes defined in the protocol ("${secText}") are not reflected in the manuscript.`,
      "Keep variables defined in the data dictionary consistent with the manuscript, or note the deviation.",
    );
  }

  // Reporting-checklist gap: items the protocol commits to (a ready source card)
  // whose detectable reporting element is missing from the manuscript.
  const schema = getModeSchema(study.mode);
  for (const guideline of schema.guidelines) {
    const tpl = getChecklistTemplate(guideline);
    const suppliers = new Map<string, string[]>();
    for (const def of schema.cards) {
      for (const key of def.guidelineItems[guideline] ?? []) {
        const list = suppliers.get(key) ?? [];
        list.push(def.key);
        suppliers.set(key, list);
      }
    }
    for (const item of tpl.items) {
      if (!item.detect_regex) continue;
      const committed = (suppliers.get(item.item_key) ?? []).some((c) =>
        isReadyState(stateOf(c)),
      );
      if (committed && !item.detect_regex.test(text)) {
        add(
          "reporting_checklist_gap",
          "major",
          `Protocol commits to ${item.item_key} (${guideline}) — ${item.prompt} — but the manuscript does not appear to report it.`,
          "Add the corresponding reporting element to the manuscript to satisfy the committed checklist item.",
        );
      }
    }
  }

  return { detected };
}
