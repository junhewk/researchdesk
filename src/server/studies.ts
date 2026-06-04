import { nanoid } from "nanoid";
import { getDb, buildAssignments } from "./db";
import { nowUnix } from "@/lib/utils";
import { getModeSchema, downstreamCards } from "./methods/cardSchema";
import type {
  Study,
  StudyMode,
  StudyStatus,
  ProtocolConfidentialityMode,
  DesignDecision,
  DecisionState,
  DecisionLogEntry,
  DecisionLogAction,
  EvidenceSnapshot,
  EvidenceSource,
  EvidenceItem,
  EvidenceItemKind,
  DecisionEvidenceLink,
  PreflightFinding,
  PreflightLayer,
  PreflightSeverity,
  PreflightFindingStatus,
  StudyArtifact,
  StudyArtifactKind,
  CardProposalOption,
} from "./types";

// ===========================================================================
// Persistence for the StudyDesignState workspace. Pure data access — design
// logic (preflight compute, evidence extraction, artifact compile) lives in
// src/server/methods/*.
// ===========================================================================

// --------------------------------------------------------------------------
// Studies
// --------------------------------------------------------------------------

export function listStudies(opts?: {
  status?: StudyStatus;
  mode?: StudyMode;
  limit?: number;
  offset?: number;
}): Study[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.status) {
    clauses.push("status = ?");
    params.push(opts.status);
  }
  if (opts?.mode) {
    clauses.push("mode = ?");
    params.push(opts.mode);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return db
    .prepare(
      `SELECT * FROM studies ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Study[];
}

export function getStudy(id: string): Study | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM studies WHERE id = ?").get(id) as
    | Study
    | undefined;
}

export function createStudy(data: {
  title: string;
  mode: StudyMode;
  research_question?: string | null;
  confidentiality_mode?: ProtocolConfidentialityMode;
}): Study {
  const db = getDb();
  const now = nowUnix();
  const id = `st_${nanoid(16)}`;
  const study: Study = {
    id,
    title: data.title,
    mode: data.mode,
    research_question: data.research_question ?? null,
    confidentiality_mode: data.confidentiality_mode ?? "cloud_default",
    cloud_consent_at: null,
    status: "draft",
    created_at: now,
    updated_at: now,
  };

  const schema = getModeSchema(data.mode);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO studies
         (id, title, mode, research_question, confidentiality_mode,
          cloud_consent_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      study.id,
      study.title,
      study.mode,
      study.research_question,
      study.confidentiality_mode,
      study.cloud_consent_at,
      study.status,
      study.created_at,
      study.updated_at,
    );
    const insertCard = db.prepare(
      `INSERT INTO design_decisions
         (id, study_id, card_type, state, value_json, open_question_md,
          stale, position, created_at, updated_at)
       VALUES (?, ?, ?, 'not_started', NULL, NULL, 0, ?, ?, ?)`,
    );
    schema.cards.forEach((card, i) => {
      insertCard.run(`dd_${nanoid(16)}`, id, card.key, i, now, now);
    });
  })();

  return study;
}

export function updateStudy(
  id: string,
  data: Partial<Pick<Study, "title" | "research_question" | "status">>,
): Study | undefined {
  const db = getDb();
  const existing = getStudy(id);
  if (!existing) return undefined;
  const { sets, params } = buildAssignments(data);
  if (sets.length === 0) return existing;
  sets.push("updated_at = ?");
  params.push(nowUnix(), id);
  db.prepare(`UPDATE studies SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return getStudy(id);
}

export function deleteStudy(id: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM studies WHERE id = ?").run(id).changes > 0;
}

export function touchStudy(id: string): void {
  const db = getDb();
  db.prepare("UPDATE studies SET updated_at = ? WHERE id = ?").run(nowUnix(), id);
}

export function setStudyConfidentialityMode(
  id: string,
  mode: ProtocolConfidentialityMode,
  consent: boolean = false,
): Study | undefined {
  const existing = getStudy(id);
  if (!existing) return undefined;
  const db = getDb();
  const now = nowUnix();
  if (mode === "cloud_default" && existing.confidentiality_mode === "local_only") {
    if (!consent) {
      throw new Error(
        "switching from local_only to cloud_default requires explicit consent",
      );
    }
    db.prepare(
      `UPDATE studies SET confidentiality_mode = ?, cloud_consent_at = ?, updated_at = ? WHERE id = ?`,
    ).run(mode, now, now, id);
  } else {
    db.prepare(
      `UPDATE studies SET confidentiality_mode = ?, updated_at = ? WHERE id = ?`,
    ).run(mode, now, id);
  }
  return getStudy(id);
}

// --------------------------------------------------------------------------
// Decision cards
// --------------------------------------------------------------------------

interface DecisionRow {
  id: string;
  study_id: string;
  card_type: string;
  state: DecisionState;
  value_json: string | null;
  open_question_md: string | null;
  stale: number;
  position: number;
  created_at: number;
  updated_at: number;
}

function rowToDecision(row: DecisionRow): DesignDecision {
  return { ...row, stale: Boolean(row.stale) };
}

export function listDecisions(studyId: string): DesignDecision[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM design_decisions WHERE study_id = ? ORDER BY position",
    )
    .all(studyId) as DecisionRow[];
  return rows.map(rowToDecision);
}

export function getDecision(
  studyId: string,
  cardType: string,
): DesignDecision | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM design_decisions WHERE study_id = ? AND card_type = ?",
    )
    .get(studyId, cardType) as DecisionRow | undefined;
  return row ? rowToDecision(row) : undefined;
}

export function getDecisionById(id: string): DesignDecision | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM design_decisions WHERE id = ?")
    .get(id) as DecisionRow | undefined;
  return row ? rowToDecision(row) : undefined;
}

/** Patch a card's fields. Does NOT propagate staleness — callers that mutate
 * the card's value should call markDownstreamStale separately. */
export function patchDecision(
  studyId: string,
  cardType: string,
  patch: {
    value_json?: string | null;
    state?: DecisionState;
    open_question_md?: string | null;
    stale?: boolean;
  },
): DesignDecision | undefined {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.value_json !== undefined) {
    sets.push("value_json = ?");
    params.push(patch.value_json);
  }
  if (patch.state !== undefined) {
    sets.push("state = ?");
    params.push(patch.state);
  }
  if (patch.open_question_md !== undefined) {
    sets.push("open_question_md = ?");
    params.push(patch.open_question_md);
  }
  if (patch.stale !== undefined) {
    sets.push("stale = ?");
    params.push(patch.stale ? 1 : 0);
  }
  if (sets.length === 0) return getDecision(studyId, cardType);
  sets.push("updated_at = ?");
  params.push(nowUnix(), studyId, cardType);
  db.prepare(
    `UPDATE design_decisions SET ${sets.join(", ")} WHERE study_id = ? AND card_type = ?`,
  ).run(...params);
  touchStudy(studyId);
  return getDecision(studyId, cardType);
}

/** Mark every card that depends on `cardType` as stale (needs re-check). */
export function markDownstreamStale(
  study: Pick<Study, "id" | "mode">,
  cardType: string,
): void {
  const downstream = downstreamCards(study.mode, cardType);
  if (downstream.length === 0) return;
  const db = getDb();
  const placeholders = downstream.map(() => "?").join(", ");
  db.prepare(
    `UPDATE design_decisions SET stale = 1, updated_at = ?
       WHERE study_id = ? AND card_type IN (${placeholders})`,
  ).run(nowUnix(), study.id, ...downstream);
}

// --------------------------------------------------------------------------
// Decision log (append-only)
// --------------------------------------------------------------------------

export function appendDecisionLog(entry: {
  study_id: string;
  decision_id?: string | null;
  card_type?: string | null;
  action: DecisionLogAction;
  decision_md?: string | null;
  reason_md?: string | null;
  rejected_alternatives_md?: string | null;
  open_concern_md?: string | null;
  evidence_ids_json?: string | null;
}): DecisionLogEntry {
  const db = getDb();
  const row: DecisionLogEntry = {
    id: `dl_${nanoid(16)}`,
    study_id: entry.study_id,
    decision_id: entry.decision_id ?? null,
    card_type: entry.card_type ?? null,
    action: entry.action,
    decision_md: entry.decision_md ?? null,
    reason_md: entry.reason_md ?? null,
    rejected_alternatives_md: entry.rejected_alternatives_md ?? null,
    open_concern_md: entry.open_concern_md ?? null,
    evidence_ids_json: entry.evidence_ids_json ?? null,
    created_at: nowUnix(),
  };
  db.prepare(
    `INSERT INTO decision_log
       (id, study_id, decision_id, card_type, action, decision_md, reason_md,
        rejected_alternatives_md, open_concern_md, evidence_ids_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.study_id,
    row.decision_id,
    row.card_type,
    row.action,
    row.decision_md,
    row.reason_md,
    row.rejected_alternatives_md,
    row.open_concern_md,
    row.evidence_ids_json,
    row.created_at,
  );
  return row;
}

export function listDecisionLog(studyId: string): DecisionLogEntry[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM decision_log WHERE study_id = ? ORDER BY created_at DESC",
    )
    .all(studyId) as DecisionLogEntry[];
}

// --------------------------------------------------------------------------
// Evidence snapshots + items + links
// --------------------------------------------------------------------------

export function createSnapshot(data: {
  study_id: string;
  source: EvidenceSource;
  label?: string | null;
  raw_json: string;
  report_md?: string | null;
}): EvidenceSnapshot {
  const db = getDb();
  const row: EvidenceSnapshot = {
    id: `es_${nanoid(16)}`,
    study_id: data.study_id,
    source: data.source,
    label: data.label ?? null,
    raw_json: data.raw_json,
    report_md: data.report_md ?? null,
    imported_at: nowUnix(),
  };
  db.prepare(
    `INSERT INTO evidence_snapshots
       (id, study_id, source, label, raw_json, report_md, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.study_id,
    row.source,
    row.label,
    row.raw_json,
    row.report_md,
    row.imported_at,
  );
  touchStudy(data.study_id);
  return row;
}

export function listSnapshots(studyId: string): EvidenceSnapshot[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM evidence_snapshots WHERE study_id = ? ORDER BY imported_at DESC",
    )
    .all(studyId) as EvidenceSnapshot[];
}

export function getSnapshot(id: string): EvidenceSnapshot | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM evidence_snapshots WHERE id = ?").get(id) as
    | EvidenceSnapshot
    | undefined;
}

export function createEvidenceItem(data: {
  snapshot_id: string;
  study_id: string;
  kind: EvidenceItemKind;
  label: string;
  detail_md?: string | null;
  source_ref_json?: string | null;
}): EvidenceItem {
  const db = getDb();
  const row: EvidenceItem = {
    id: `ei_${nanoid(16)}`,
    snapshot_id: data.snapshot_id,
    study_id: data.study_id,
    kind: data.kind,
    label: data.label,
    detail_md: data.detail_md ?? null,
    source_ref_json: data.source_ref_json ?? null,
    created_at: nowUnix(),
  };
  db.prepare(
    `INSERT INTO evidence_items
       (id, snapshot_id, study_id, kind, label, detail_md, source_ref_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.snapshot_id,
    row.study_id,
    row.kind,
    row.label,
    row.detail_md,
    row.source_ref_json,
    row.created_at,
  );
  return row;
}

export function listEvidenceItems(
  studyId: string,
  kind?: EvidenceItemKind,
): EvidenceItem[] {
  const db = getDb();
  if (kind) {
    return db
      .prepare(
        "SELECT * FROM evidence_items WHERE study_id = ? AND kind = ? ORDER BY created_at",
      )
      .all(studyId, kind) as EvidenceItem[];
  }
  return db
    .prepare("SELECT * FROM evidence_items WHERE study_id = ? ORDER BY kind, created_at")
    .all(studyId) as EvidenceItem[];
}

export function getEvidenceItem(id: string): EvidenceItem | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM evidence_items WHERE id = ?").get(id) as
    | EvidenceItem
    | undefined;
}

export function linkEvidence(
  decisionId: string,
  evidenceItemId: string,
  note?: string | null,
): DecisionEvidenceLink {
  const db = getDb();
  const row: DecisionEvidenceLink = {
    id: `del_${nanoid(16)}`,
    decision_id: decisionId,
    evidence_item_id: evidenceItemId,
    note: note ?? null,
    created_at: nowUnix(),
  };
  db.prepare(
    `INSERT OR IGNORE INTO decision_evidence_links
       (id, decision_id, evidence_item_id, note, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(row.id, row.decision_id, row.evidence_item_id, row.note, row.created_at);
  return row;
}

export function unlinkEvidence(
  decisionId: string,
  evidenceItemId: string,
): boolean {
  const db = getDb();
  return (
    db
      .prepare(
        "DELETE FROM decision_evidence_links WHERE decision_id = ? AND evidence_item_id = ?",
      )
      .run(decisionId, evidenceItemId).changes > 0
  );
}

export function listEvidenceLinks(decisionId: string): EvidenceItem[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ei.* FROM evidence_items ei
         JOIN decision_evidence_links del ON del.evidence_item_id = ei.id
        WHERE del.decision_id = ? ORDER BY ei.kind, ei.created_at`,
    )
    .all(decisionId) as EvidenceItem[];
}

// --------------------------------------------------------------------------
// Preflight findings (persisted agent-produced findings only)
// --------------------------------------------------------------------------

interface FindingRow {
  id: string;
  study_id: string;
  session_id: string | null;
  layer: PreflightLayer;
  severity: PreflightSeverity;
  card_type: string | null;
  title: string;
  detail_md: string | null;
  status: PreflightFindingStatus;
  created_at: number;
  updated_at: number;
}

export function createFinding(data: {
  study_id: string;
  session_id?: string | null;
  layer: PreflightLayer;
  severity: PreflightSeverity;
  card_type?: string | null;
  title: string;
  detail_md?: string | null;
}): PreflightFinding {
  const db = getDb();
  const now = nowUnix();
  const row: PreflightFinding = {
    id: `pf_${nanoid(16)}`,
    study_id: data.study_id,
    session_id: data.session_id ?? null,
    layer: data.layer,
    severity: data.severity,
    card_type: data.card_type ?? null,
    title: data.title,
    detail_md: data.detail_md ?? null,
    status: "open",
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO preflight_findings
       (id, study_id, session_id, layer, severity, card_type, title, detail_md,
        status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.study_id,
    row.session_id,
    row.layer,
    row.severity,
    row.card_type,
    row.title,
    row.detail_md,
    row.status,
    row.created_at,
    row.updated_at,
  );
  return row;
}

export function listFindings(
  studyId: string,
  status?: PreflightFindingStatus,
): PreflightFinding[] {
  const db = getDb();
  if (status) {
    return db
      .prepare(
        "SELECT * FROM preflight_findings WHERE study_id = ? AND status = ? ORDER BY created_at",
      )
      .all(studyId, status) as PreflightFinding[];
  }
  return db
    .prepare("SELECT * FROM preflight_findings WHERE study_id = ? ORDER BY created_at")
    .all(studyId) as FindingRow[] as PreflightFinding[];
}

export function updateFindingStatus(
  id: string,
  status: PreflightFindingStatus,
): void {
  const db = getDb();
  db.prepare(
    "UPDATE preflight_findings SET status = ?, updated_at = ? WHERE id = ?",
  ).run(status, nowUnix(), id);
}

/** Clear open risk-layer findings before a fresh agent risk pass. */
export function clearRiskFindings(studyId: string): void {
  const db = getDb();
  db.prepare(
    "DELETE FROM preflight_findings WHERE study_id = ? AND layer = 'risk' AND status = 'open'",
  ).run(studyId);
}

// --------------------------------------------------------------------------
// Compiled artifacts (one row per study+kind)
// --------------------------------------------------------------------------

export function getOrCreateArtifact(
  studyId: string,
  kind: StudyArtifactKind,
): StudyArtifact {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM study_artifacts WHERE study_id = ? AND kind = ?")
    .get(studyId, kind) as StudyArtifact | undefined;
  if (existing) return existing;
  const row: StudyArtifact = {
    id: `sa_${nanoid(16)}`,
    study_id: studyId,
    kind,
    compiled_json: null,
    override_md: null,
    ready_pct: 0,
    updated_at: nowUnix(),
  };
  db.prepare(
    `INSERT INTO study_artifacts
       (id, study_id, kind, compiled_json, override_md, ready_pct, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.study_id,
    row.kind,
    row.compiled_json,
    row.override_md,
    row.ready_pct,
    row.updated_at,
  );
  return row;
}

export function updateArtifact(
  studyId: string,
  kind: StudyArtifactKind,
  patch: { compiled_json?: string | null; override_md?: string | null; ready_pct?: number },
): StudyArtifact {
  getOrCreateArtifact(studyId, kind);
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.compiled_json !== undefined) {
    sets.push("compiled_json = ?");
    params.push(patch.compiled_json);
  }
  if (patch.override_md !== undefined) {
    sets.push("override_md = ?");
    params.push(patch.override_md);
  }
  if (patch.ready_pct !== undefined) {
    sets.push("ready_pct = ?");
    params.push(patch.ready_pct);
  }
  sets.push("updated_at = ?");
  params.push(nowUnix(), studyId, kind);
  db.prepare(
    `UPDATE study_artifacts SET ${sets.join(", ")} WHERE study_id = ? AND kind = ?`,
  ).run(...params);
  return db
    .prepare("SELECT * FROM study_artifacts WHERE study_id = ? AND kind = ?")
    .get(studyId, kind) as StudyArtifact;
}

export function listArtifacts(studyId: string): StudyArtifact[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM study_artifacts WHERE study_id = ? ORDER BY kind")
    .all(studyId) as StudyArtifact[];
}

// --------------------------------------------------------------------------
// Card proposal options (card_proposal agent pass)
// --------------------------------------------------------------------------

export function clearProposalOptions(studyId: string, cardType: string): void {
  getDb()
    .prepare(
      "DELETE FROM card_proposal_options WHERE study_id = ? AND card_type = ?",
    )
    .run(studyId, cardType);
}

export function createProposalOption(data: {
  study_id: string;
  card_type: string;
  session_id?: string | null;
  label: string;
  value_suggestion?: string | null;
  consequence_md?: string | null;
}): CardProposalOption {
  const db = getDb();
  const row: CardProposalOption = {
    id: `cpo_${nanoid(16)}`,
    study_id: data.study_id,
    card_type: data.card_type,
    session_id: data.session_id ?? null,
    label: data.label,
    value_suggestion: data.value_suggestion ?? null,
    consequence_md: data.consequence_md ?? null,
    created_at: nowUnix(),
  };
  db.prepare(
    `INSERT INTO card_proposal_options
       (id, study_id, card_type, session_id, label, value_suggestion, consequence_md, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.study_id,
    row.card_type,
    row.session_id,
    row.label,
    row.value_suggestion,
    row.consequence_md,
    row.created_at,
  );
  return row;
}

export function listProposalOptions(
  studyId: string,
  cardType: string,
): CardProposalOption[] {
  return getDb()
    .prepare(
      "SELECT * FROM card_proposal_options WHERE study_id = ? AND card_type = ? ORDER BY created_at",
    )
    .all(studyId, cardType) as CardProposalOption[];
}
