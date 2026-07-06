// Provider and workflow types
export type Provider =
  | "openai"
  | "codex"
  | "gemini"
  | "deepseek"
  | "ollama"
  | "lmstudio"
  | "llama_server";
export type AgentEffort = "low" | "medium" | "high" | "xhigh" | "max";

// 'revision' / 'review' are the legacy single-purpose workflows kept for
// backwards-compatible queries. 'manuscript' is the unified continuing
// thread — one per manuscript — that hosts every intent via slash commands.
// 'methods' is the upstream Methods Workbench workflow that hosts protocol
// building/auditing, SAP drafting, data-dictionary editing, reporting-
// checklist work, manuscript-readiness checks, and reviewer-response
// drafting; the specific intent is recorded in `mode`.
export type Workflow = "revision" | "review" | "manuscript" | "methods";

// Slash-command intent recorded on the session at creation time. Free-form
// string at the DB layer (no CHECK) so adding commands needs no migration.
export type SessionMode =
  | "revise"
  | "review"
  | "draft"
  | "cite"
  | "explain"
  | "finalize"
  | "version"
  | "protocol_build"
  | "protocol_audit"
  | "sap"
  | "data_dictionary"
  | "reporting_checklist"
  | "readiness"
  | "reviewer_response";

export type ManuscriptVersionSource = "upload" | "agent_revise" | "user_edit";

export interface ManuscriptVersion {
  id: string;
  manuscript_id: string;
  version_number: number;
  label: string | null;
  content_md: string;
  source: ManuscriptVersionSource;
  session_id: string | null;
  created_at: number;
}

export type ManuscriptAssetKind =
  | "table"
  | "appendix"
  | "figure"
  | "supplement"
  | "response_letter"
  | "other";

export interface ManuscriptAsset {
  id: string;
  manuscript_id: string;
  kind: ManuscriptAssetKind;
  label: string | null;
  original_file: string;
  file_format: string | null;
  content_md: string;
  byte_size: number | null;
  version_number: number | null;
  position: number;
  created_at: number;
  updated_at: number;
}

/** Lightweight asset listing (no content_md) for inventory APIs. */
export type ManuscriptAssetSummary = Omit<ManuscriptAsset, "content_md">;
export type CloudReviewProvider = "claude" | "codex";
export type OutsideManuscriptStatus =
  | "draft"
  | "synthesizing"
  | "synthesized"
  | "outlining"
  | "outlined"
  | "detailing"
  | "auditing"
  | "finalizing"
  | "ready"
  | "failed";
export type OutsideConfidentialityMode =
  | "local_only"
  | "paragraph_cloud_assist"
  | "full_cloud_review";
export type OutsideReviewItemStage = "draft" | "detailed";
export type OutsideReviewItemStatus = "pending" | "accepted" | "dismissed";
export type OutsideAnchorStatus = "pending" | "matched" | "unmatched";
export type OutsideResolutionState = "resolved" | "ambiguous" | "unresolved";
export type OutsideConfidence = "low" | "medium" | "high";
export type OutsideValidity = "valid_issue" | "possible_issue" | "false_positive";
export type OutsideCloudTask =
  | "verify_issue"
  | "literature_check"
  | "stats_check"
  | "global_context_check";
export type OutsideSessionKind =
  | "synthesis"
  | "outline"
  | "detail"
  | "reference_audit"
  | "finalize";
export type OutsideSessionStatus = "running" | "completed" | "failed";
export type OutsideArtifactKind =
  | "section"
  | "reference"
  | "figure"
  | "table"
  | "appendix";
export type OutsideToolKind =
  | "file_search"
  | "grep"
  | "scholarly_search"
  | "web_search"
  | "quantitative_check"
  | "image_check"
  | "reference_audit";
export type OutsideToolRunStatus = "completed" | "blocked" | "failed";
export type OutsideToolPrivacyClass =
  | "local"
  | "external_search"
  | "cloud_prompt";
export type SessionStatus =
  | "new"
  | "running"
  | "idle"
  | "awaiting_user"
  | "completed"
  | "crashed";
export type SuggestionCategory = "mechanical" | "rewrite";
export type ReviewCategory =
  | "mechanical"
  | "rewrite"
  | "structural"
  | "evidence";
export type ManuscriptStatus =
  | "draft"
  | "in_revision"
  | "in_review"
  | "completed";
export type RevisionStatus = "pending" | "applied" | "dismissed";
export type Severity = "minor" | "major" | "critical";
export type RelationType =
  | "responds_to"
  | "revises"
  | "references"
  | "cited_by"
  | "supports"
  | "contradicts"
  | "reports"
  | "reported_by"
  | "has_readiness_check"
  | "has_reviewer_response"
  | "has_audit"
  | "has_sap"
  | "has_data_dictionary"
  | "follows_guideline";
export type EntityType =
  | "manuscript"
  | "commentary"
  | "revision"
  | "review"
  | "article_ref"
  | "protocol"
  | "protocol_audit"
  | "readiness_check"
  | "reviewer_response"
  | "reporting_checklist";
export type ArticleSource =
  | "semantic_scholar"
  | "openalex"
  | "pubmed"
  | "manual";
export type RevisionActionType =
  | "find_replace"
  | "rewrite_pattern"
  | "style_rule";

// ---------------------------------------------------------------------------
// Database row types
// ---------------------------------------------------------------------------

export interface Manuscript {
  id: string;
  study_id: string | null;
  title: string;
  content_md: string;
  /** Snapshot of content_md at upload time. Frozen — used for original-vs-
   * current diff and as the canonical "what the user started with". */
  original_content_md: string | null;
  original_file: string | null;
  file_format: string | null;
  journal_type: string | null;
  research_domain: string | null;
  research_type: string | null;
  review_request: string | null;
  project_root: string | null;
  primary_file: string | null;
  is_git: boolean;
  /** Carried over when an article is promoted from a Methods Workbench study.
   * `local_only` keeps the article's review/revision sessions on a local
   * provider — cloud backends are refused for it. */
  confidentiality_mode: ProtocolConfidentialityMode;
  status: ManuscriptStatus;
  created_at: number;
  updated_at: number;
}

export interface RevisionTable {
  id: string;
  manuscript_id: string;
  session_id: string | null;
  round: number;
  relative_path: string;
  created_at: number;
}

export interface Commentary {
  id: string;
  manuscript_id: string;
  reviewer_label: string | null;
  content_md: string;
  source: string | null;
  round: number;
  created_at: number;
}

export interface Revision {
  id: string;
  manuscript_id: string;
  commentary_id: string | null;
  category: SuggestionCategory;
  status: RevisionStatus;
  suggestion_md: string;
  revised_md: string | null;
  rewrite_context: string | null;
  user_revision: string | null;
  round: number;
  created_at: number;
  applied_at: number | null;
}

export interface Review {
  id: string;
  manuscript_id: string;
  category: ReviewCategory;
  content_md: string;
  severity: Severity | null;
  section_ref: string | null;
  status: RevisionStatus;
  created_at: number;
}

export interface Relation {
  id: string;
  source_type: EntityType;
  source_id: string;
  target_type: EntityType;
  target_id: string;
  relation_type: RelationType;
  metadata_json: string | null;
  created_at: number;
}

export interface ArticleReference {
  id: string;
  doi: string | null;
  title: string;
  authors_json: string | null;
  year: number | null;
  journal: string | null;
  abstract_md: string | null;
  source: ArticleSource;
  external_id: string | null;
  metadata_json: string | null;
  created_at: number;
}

export interface Domain {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
}

export interface Journal {
  id: string;
  name: string;
  domain_id: string | null;
  guidelines_md: string | null;
  created_at: number;
}

export interface Session {
  id: string;
  manuscript_id: string | null;
  /** Set for `workflow='methods'` sessions whose intent targets a protocol
   * (protocol_build, protocol_audit, sap, data_dictionary, reporting_checklist
   * against a protocol). Null otherwise. */
  protocol_id: string | null;
  /** Set for `workflow='methods'` sessions in the StudyDesignState workspace
   * (card proposals, evidence extraction, preflight risk). Null otherwise. */
  study_id: string | null;
  workflow: Workflow;
  /** Initial slash-command intent (e.g. "revise", "review"). Per-turn intent
   * is carried in user messages, not on the session row. */
  mode: SessionMode | string | null;
  provider: Provider;
  model: string | null;
  effort: AgentEffort | null;
  provider_session_id: string | null;
  status: SessionStatus;
  created_at: number;
  updated_at: number;
}

export interface SessionMessage {
  id: string;
  session_id: string;
  role: string;
  content_json: string;
  turn_seq: number;
  created_at: number;
}

export interface OutsideManuscript {
  id: string;
  title: string;
  content_md: string;
  original_file: string | null;
  file_format: string | null;
  journal_type: string | null;
  research_domain: string | null;
  research_type: string | null;
  review_request: string | null;
  status: OutsideManuscriptStatus;
  confidentiality_mode: OutsideConfidentialityMode;
  allow_external_search: boolean;
  cloud_provider: CloudReviewProvider;
  cloud_consent_at: number | null;
  content_hash: string | null;
  created_at: number;
  updated_at: number;
}

export type DiagramKind = "logic" | "narrative";
export type ManuscriptKind = "owned" | "outside";

export interface ManuscriptDiagram {
  id: string;
  manuscript_id: string;
  manuscript_kind: ManuscriptKind;
  kind: DiagramKind;
  title: string | null;
  mermaid_src: string;
  notes_md: string | null;
  created_at: number;
}

export interface OutsideReviewItem {
  id: string;
  manuscript_id: string;
  parent_outline_id: string | null;
  stage: OutsideReviewItemStage;
  category: ReviewCategory;
  severity: Severity | null;
  section_ref: string | null;
  quoted_text: string | null;
  anchor_offset: number | null;
  anchor_status: OutsideAnchorStatus;
  critique_md: string;
  citations_json: string | null;
  status: OutsideReviewItemStatus;
  detail_error: string | null;
  resolution_state: OutsideResolutionState | null;
  needs_cloud_review: boolean;
  cloud_reason: string | null;
  cloud_provider: CloudReviewProvider | null;
  cloud_reviewed_at: number | null;
  confidence: OutsideConfidence | null;
  validity: OutsideValidity | null;
  missing_inputs_json: string | null;
  cloud_task: OutsideCloudTask | null;
  anchor_confidence: number | null;
  dedupe_key: string | null;
  deterministic_findings_json: string | null;
  adjudication_notes: string | null;
  disagreement_notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface OutsideSession {
  id: string;
  manuscript_id: string;
  kind: OutsideSessionKind;
  status: OutsideSessionStatus;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface OutsideManuscriptArtifact {
  id: string;
  manuscript_id: string;
  kind: OutsideArtifactKind;
  label: string;
  section_ref: string | null;
  anchor_offset: number | null;
  content_text: string;
  metadata_json: string | null;
  created_at: number;
}

export interface OutsideToolRun {
  id: string;
  manuscript_id: string;
  stage: string;
  tool_kind: OutsideToolKind;
  query: string | null;
  input_json: string | null;
  output_json: string | null;
  status: OutsideToolRunStatus;
  error: string | null;
  privacy_class: OutsideToolPrivacyClass;
  created_at: number;
}

export interface OutsideSynthesis {
  id: string;
  manuscript_id: string;
  article_summary_md: string;
  theoretical_assessment_md: string;
  validity_assessment_md: string;
  review_form_json: string | null;
  global_issues_json: string | null;
  detail_tasks_json: string | null;
  missing_inputs_json: string | null;
  tool_runs_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface OutsideReferenceAuditItem {
  id: string;
  manuscript_id: string;
  reference_text: string;
  in_text_key: string | null;
  doi: string | null;
  status: string;
  finding_md: string;
  validation_json: string | null;
  tool_run_id: string | null;
  created_at: number;
}

export type OutsideReviewRecommendation = "accept" | "revise" | "reject";

export interface OutsideReviewDraft {
  id: string;
  manuscript_id: string;
  recommendation: OutsideReviewRecommendation | null;
  critical_feedback_md: string | null;
  methodology_notes_md: string | null;
  confidential_md: string | null;
  created_at: number;
  updated_at: number;
}

export interface OutsideFinalReview {
  id: string;
  manuscript_id: string;
  summary_md: string;
  review_form_json: string | null;
  decision: string | null;
  unresolved_items_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface RevisionAction {
  id: string;
  label: string;
  action_type: RevisionActionType;
  config_json: string;
  use_count: number;
  created_at: number;
  last_used_at: number | null;
}

// ---------------------------------------------------------------------------
// Agent event types (unified across providers)
// ---------------------------------------------------------------------------

export interface AgentMessageBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  [k: string]: unknown;
}

export type AgentEvent =
  | {
      type: "system";
      subtype?: string;
      session_id?: string;
      [k: string]: unknown;
    }
  | {
      type: "assistant";
      message: { content?: AgentMessageBlock[] };
      [k: string]: unknown;
    }
  | {
      type: "user";
      message: { content?: AgentMessageBlock[] };
      [k: string]: unknown;
    }
  | { type: "stream_event"; [k: string]: unknown }
  | { type: "result"; [k: string]: unknown }
  | {
      type: "tool_use";
      name: string;
      input: unknown;
      id?: string;
      [k: string]: unknown;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: unknown;
      [k: string]: unknown;
    }
  | { type: string; [k: string]: unknown };

export interface SupervisorEvent {
  session_id: string;
  kind:
    | "agent_event"
    | "status_change"
    | "error"
    | "process_exit"
    | "process_start";
  payload: unknown;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Tool definition for agent system prompts
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Search result types
// ---------------------------------------------------------------------------

export interface SearchResult {
  id: string;
  type: EntityType;
  snippet: string;
  rank: number;
  metadata?: Record<string, unknown>;
}

export interface ArticleSearchResult {
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  abstract: string | null;
  citation_count: number | null;
  source: ArticleSource;
  external_id: string;
  url: string | null;
}

// ---------------------------------------------------------------------------
// Methods Workbench types
// ---------------------------------------------------------------------------

export type ProtocolPhase = "drafting" | "registered" | "active" | "closed";
export type ProtocolStatus = "draft" | "active" | "archived";
export type ProtocolConfidentialityMode = "cloud_default" | "local_only";

/** Study design — drives reporting-guideline defaults. */
export type StudyDesign =
  | "rct"
  | "cohort"
  | "case_control"
  | "cross_sectional"
  | "qualitative"
  | "systematic_review"
  | "scoping_review"
  | "diagnostic_accuracy"
  | "prediction_model"
  | "case_report"
  | "animal_study"
  | "other";

export interface Protocol {
  id: string;
  title: string;
  content_md: string;
  original_content_md: string | null;
  original_file: string | null;
  file_format: string | null;
  study_design: StudyDesign | string | null;
  phase: ProtocolPhase;
  confidentiality_mode: ProtocolConfidentialityMode;
  cloud_consent_at: number | null;
  project_root: string | null;
  primary_file: string | null;
  is_git: boolean;
  journal_type: string | null;
  research_domain: string | null;
  status: ProtocolStatus;
  created_at: number;
  updated_at: number;
}

export type ProtocolVersionSource = "upload" | "agent_edit" | "user_edit";

export interface ProtocolVersion {
  id: string;
  protocol_id: string;
  version_number: number;
  label: string | null;
  content_md: string;
  source: ProtocolVersionSource;
  session_id: string | null;
  created_at: number;
}

export type ProtocolAssetKind =
  | "sap"
  | "data_dictionary"
  | "crf"
  | "icf"
  | "irb_letter"
  | "registration"
  | "figure"
  | "table"
  | "other";

export interface ProtocolAsset {
  id: string;
  protocol_id: string;
  kind: ProtocolAssetKind;
  label: string | null;
  original_file: string;
  file_format: string | null;
  content_md: string;
  byte_size: number | null;
  version_number: number | null;
  position: number;
  created_at: number;
  updated_at: number;
}

export type ProtocolAssetSummary = Omit<ProtocolAsset, "content_md">;

export type ProtocolAuditStatus = "running" | "completed" | "failed";
export type ProtocolAuditItemCategory =
  | "design"
  | "outcomes"
  | "sample_size"
  | "bias"
  | "statistics"
  | "ethics"
  | "reporting"
  | "other";
export type ProtocolAuditItemStatus = "open" | "accepted" | "dismissed";

export interface ProtocolAudit {
  id: string;
  protocol_id: string;
  session_id: string | null;
  status: ProtocolAuditStatus;
  summary_md: string | null;
  created_at: number;
  updated_at: number;
}

export interface ProtocolAuditItem {
  id: string;
  audit_id: string;
  protocol_id: string;
  category: ProtocolAuditItemCategory;
  severity: Severity | null;
  section_ref: string | null;
  quoted_text: string | null;
  finding_md: string;
  suggested_fix_md: string | null;
  status: ProtocolAuditItemStatus;
  auto_detected: boolean;
  created_at: number;
  updated_at: number;
}

export interface SapDraft {
  id: string;
  protocol_id: string;
  outcomes_json: string | null;
  populations_json: string | null;
  analysis_plan_md: string | null;
  multiplicity_md: string | null;
  missing_data_md: string | null;
  interim_analyses_md: string | null;
  software_json: string | null;
  created_at: number;
  updated_at: number;
}

export type DataDictionaryFieldType =
  | "int"
  | "real"
  | "text"
  | "date"
  | "categorical"
  | "boolean";

export interface DataDictionary {
  id: string;
  protocol_id: string;
  created_at: number;
  updated_at: number;
}

export interface DataDictionaryField {
  id: string;
  dictionary_id: string;
  position: number;
  field_name: string;
  label: string | null;
  data_type: DataDictionaryFieldType;
  units: string | null;
  allowed_values_json: string | null;
  required: boolean;
  derivation_md: string | null;
  notes_md: string | null;
  created_at: number;
  updated_at: number;
}

export type ReportingGuideline =
  | "PRISMA"
  | "PRISMA-P"
  | "PRISMA-ScR"
  | "STROBE"
  | "CONSORT"
  | "SPIRIT"
  | "STARD"
  | "TRIPOD"
  | "CARE"
  | "SRQR"
  | "COREQ"
  | "ARRIVE"
  | "RECORD"
  | "SPIRIT-AI"
  | "CONSORT-AI";

export type ReportingChecklistSubjectType = "protocol" | "manuscript";
export type ReportingChecklistItemStatus =
  | "unaddressed"
  | "addressed"
  | "partial"
  | "na";

export interface ReportingChecklist {
  id: string;
  subject_type: ReportingChecklistSubjectType;
  subject_id: string;
  guideline: ReportingGuideline;
  version: string | null;
  created_at: number;
  updated_at: number;
}

export interface ReportingChecklistItem {
  id: string;
  checklist_id: string;
  item_key: string;
  section: string | null;
  prompt: string;
  required: boolean;
  status: ReportingChecklistItemStatus;
  evidence_md: string | null;
  location_ref: string | null;
  auto_detected: boolean;
  position: number;
  created_at: number;
  updated_at: number;
}

export interface GuidelineItem {
  item_key: string;
  section: string;
  prompt: string;
  required_for?: StudyDesign[];
  detect_regex?: RegExp;
  source_url?: string;
}

export interface GuidelineTemplate {
  id: ReportingGuideline;
  version: string;
  source_url: string;
  subject_type: ReportingChecklistSubjectType;
  items: GuidelineItem[];
}

export type ReadinessCheckStatus = "running" | "completed" | "failed";
export type ReadinessItemStatus = "open" | "accepted" | "dismissed";

export interface ReadinessCheck {
  id: string;
  manuscript_id: string;
  protocol_id: string | null;
  study_id: string | null;
  session_id: string | null;
  status: ReadinessCheckStatus;
  overall_score: number | null;
  summary_md: string | null;
  effective_confidentiality: ProtocolConfidentialityMode;
  created_at: number;
  updated_at: number;
}

export interface ReadinessCheckItem {
  id: string;
  check_id: string;
  manuscript_id: string;
  gate: string;
  severity: Severity | null;
  finding_md: string;
  suggested_fix_md: string | null;
  status: ReadinessItemStatus;
  auto_detected: boolean;
  created_at: number;
  updated_at: number;
}

export type ReviewerResponseStatus = "drafting" | "ready" | "submitted";
export type ReviewerResponseItemStatus = "drafting" | "accepted" | "declined";

export interface ReviewerResponse {
  id: string;
  manuscript_id: string;
  session_id: string | null;
  round: number;
  decision_letter_commentary_id: string | null;
  status: ReviewerResponseStatus;
  summary_md: string | null;
  compiled_asset_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface ReviewerResponseItem {
  id: string;
  response_id: string;
  commentary_id: string | null;
  comment_excerpt: string;
  response_md: string | null;
  change_pointer_md: string | null;
  revision_ids_json: string | null;
  status: ReviewerResponseItemStatus;
  position: number;
  created_at: number;
  updated_at: number;
}

// ===========================================================================
// Methods Workbench v2 — StudyDesignState (pre-document design workspace)
// ===========================================================================

export type StudyMode =
  | "systematic_review"
  | "scoping_review"
  | "retrospective_observational"
  | "interventional";
export type StudyStatus = "draft" | "active" | "archived";

export interface Study {
  id: string;
  title: string;
  mode: StudyMode;
  research_question: string | null;
  confidentiality_mode: ProtocolConfidentialityMode;
  cloud_consent_at: number | null;
  status: StudyStatus;
  created_at: number;
  updated_at: number;
}

/** Lifecycle state of a single decision card. */
export type DecisionState =
  | "not_started"
  | "drafted"
  | "underspecified"
  | "conflicting"
  | "evidence_supported"
  | "needs_input"
  | "unknown"
  | "assumed"
  | "locked";

/** Structured value stored in design_decisions.value_json. `value` is the
 * headline decision; `fields` holds the card's required/optional sub-fields
 * keyed by the field id declared in cardSchema.ts. */
export interface DecisionValue {
  value?: string;
  fields?: Record<string, string>;
}

export interface DesignDecision {
  id: string;
  study_id: string;
  card_type: string;
  state: DecisionState;
  value_json: string | null;
  open_question_md: string | null;
  stale: boolean;
  position: number;
  created_at: number;
  updated_at: number;
}

export type EvidenceSource = "mdr" | "rw";

export interface EvidenceSnapshot {
  id: string;
  study_id: string;
  source: EvidenceSource;
  label: string | null;
  raw_json: string;
  report_md: string | null;
  imported_at: number;
}

export type EvidenceItemKind =
  | "prior_design"
  | "population"
  | "outcome"
  | "confounder"
  | "bias"
  | "measure"
  | "other";

export interface EvidenceItem {
  id: string;
  snapshot_id: string;
  study_id: string;
  kind: EvidenceItemKind;
  label: string;
  detail_md: string | null;
  source_ref_json: string | null;
  created_at: number;
}

export interface DecisionEvidenceLink {
  id: string;
  decision_id: string;
  evidence_item_id: string;
  note: string | null;
  created_at: number;
}

export type DecisionLogAction =
  | "set"
  | "changed"
  | "locked"
  | "unlocked"
  | "cleared";

export interface DecisionLogEntry {
  id: string;
  study_id: string;
  decision_id: string | null;
  card_type: string | null;
  action: DecisionLogAction;
  decision_md: string | null;
  reason_md: string | null;
  rejected_alternatives_md: string | null;
  open_concern_md: string | null;
  evidence_ids_json: string | null;
  created_at: number;
}

export type PreflightLayer = "completeness" | "consistency" | "risk";
export type PreflightSeverity = "blocking" | "important" | "minor";
export type PreflightFindingStatus = "open" | "resolved" | "dismissed";

/** Persisted finding — only agent-produced findings are stored. Deterministic
 * completeness/consistency findings are computed live and never persisted. */
export interface PreflightFinding {
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

/** An agent-proposed option for a single card (card_proposal pass). Rendered
 * as a pickable chip; "Use this" pre-fills the card value (user still saves). */
export interface CardProposalOption {
  id: string;
  study_id: string;
  card_type: string;
  session_id: string | null;
  label: string;
  value_suggestion: string | null;
  fields_suggestion_json: string | null;
  fields_suggestion: Record<string, string> | null;
  consequence_md: string | null;
  created_at: number;
}

export type StudyArtifactKind =
  | "protocol"
  | "sap"
  | "data_dictionary"
  | "checklist_map"
  | "prospero_fields";

export interface StudyArtifact {
  id: string;
  study_id: string;
  kind: StudyArtifactKind;
  compiled_json: string | null;
  override_md: string | null;
  ready_pct: number;
  updated_at: number;
}

// ===========================================================================
// Scoping/systematic review corpus — search yields + a screened-record table.
// Populated by CSV import (src/server/methods/reviewCorpus.ts); the user
// confirms a final inclusion decision per record. Only the `scoping_review`
// mode surfaces these in the UI, but the model is mode-agnostic.
// ===========================================================================

/** One database search row — backs the PRISMA "identification" count. */
export interface ReviewSearch {
  id: string;
  study_id: string;
  database: string;
  query_text: string | null;
  yield_count: number;
  search_date: string | null;
  position: number;
  created_at: number;
}

/** AI screening tier carried verbatim from the import. */
export type ScreenTier = "primary" | "secondary" | "unclear" | string;
export type ScreenConfidence = "high" | "med" | "low" | string;

/** The user-confirmed inclusion decision (distinct from the imported AI
 * columns, which are preserved untouched in `ai_final`/`screen_*`). */
export type ScreeningDecision = "include" | "exclude" | "maybe" | "unscreened";

export interface ReviewRecord {
  id: string;
  study_id: string;
  external_id: string | null;
  title: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  pmid: string | null;
  /** scopus_eid / wos_uid / cinahl_an and any other source identifiers. */
  other_ids_json: string | null;
  abstract: string | null;
  keywords: string | null;
  language: string | null;
  url: string | null;
  source_databases: string | null;
  // Imported AI screening (verbatim, read-only):
  screen_stage: string | null;
  screen_tier: ScreenTier | null;
  screen_reason: string | null;
  screen_confidence: ScreenConfidence | null;
  needs_review: boolean;
  ai_final: string | null;
  ai_final_reason: string | null;
  // User curation:
  decision: ScreeningDecision;
  decision_reason: string | null;
  user_confirmed: boolean;
  /** Data-charting / extraction fields for included sources (key→value). */
  charting_json: string | null;
  dedupe_key: string | null;
  position: number;
  created_at: number;
  updated_at: number;
}

/** Derived PRISMA-ScR flow counts, computed from searches + records. */
export interface PrismaFlow {
  identified: number;
  duplicates_removed: number;
  screened: number;
  included: number;
  excluded: number;
  maybe: number;
  pending: number;
  confirmed: number;
  per_database: Array<{ database: string; yield_count: number }>;
}
