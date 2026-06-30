import type {
  Commentary,
  Manuscript,
  ManuscriptAssetSummary,
  StudyMode,
} from "@/server/types";

export type InputTier = "required" | "recommended" | "suggested";
export type InputStatus =
  | "missing"
  | "present"
  | "needs_attention"
  | "not_applicable";
export type InputStage =
  | "setup"
  | "design"
  | "corpus"
  | "context"
  | "run";

export interface InputReadinessItem {
  id: string;
  label: string;
  detail: string;
  tier: InputTier;
  status: InputStatus;
  stage: InputStage;
  actionLabel?: string;
  href?: string;
  target?: string;
}

export interface InputReadinessSummary {
  total: number;
  present: number;
  missingRequired: number;
  needsAttention: number;
  ready: boolean;
}

export interface WorkbenchSetupState {
  title: string;
  mode: StudyMode | null;
  researchQuestion: string;
}

export interface WorkbenchCardInput {
  card_type: string;
  label: string;
  stage: string;
  state: string;
  stale: boolean;
  requiredFields: Array<{ id: string; label: string }>;
  value: { value?: string; fields?: Record<string, string> };
}

export interface WorkbenchCorpusState {
  searches: number;
  records: number;
  confirmed: number;
  needs_review: number;
}

export interface WorkbenchInputArgs {
  studyId: string;
  mode: StudyMode;
  cards: WorkbenchCardInput[];
  evidenceCount: number;
  corpus?: WorkbenchCorpusState | null;
}

export interface ReviewSetupEntryInput {
  kind: string;
  label?: string;
  extracted?: unknown;
  uploading?: boolean;
  error?: string | null;
}

export interface ReviewSetupState {
  entries: ReviewSetupEntryInput[];
  title: string;
  researchDomain: string;
  journalType: string;
  researchType: string;
  reviewRequest: string;
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function statusFrom(value: boolean): InputStatus {
  return value ? "present" : "missing";
}

function isCardReady(card: WorkbenchCardInput): boolean {
  if (card.state === "locked" || card.state === "evidence_supported") return true;
  if (!hasText(card.value.value)) return false;
  return card.requiredFields.every((field) =>
    hasText(card.value.fields?.[field.id]),
  );
}

function hasAssetKind(
  assets: ManuscriptAssetSummary[],
  kind: ManuscriptAssetSummary["kind"],
): boolean {
  return assets.some((asset) => asset.kind === kind);
}

export function summarizeInputReadiness(
  items: InputReadinessItem[],
): InputReadinessSummary {
  const actionable = items.filter((item) => item.status !== "not_applicable");
  const present = actionable.filter((item) => item.status === "present").length;
  const missingRequired = actionable.filter(
    (item) => item.tier === "required" && item.status !== "present",
  ).length;
  const needsAttention = actionable.filter(
    (item) => item.status === "needs_attention",
  ).length;
  return {
    total: actionable.length,
    present,
    missingRequired,
    needsAttention,
    ready: missingRequired === 0,
  };
}

export function buildWorkbenchSetupInputs(
  state: WorkbenchSetupState,
): InputReadinessItem[] {
  return [
    {
      id: "study-title",
      label: "Working title",
      detail: "A short name for the study canvas and generated artifacts.",
      tier: "required",
      status: statusFrom(hasText(state.title)),
      stage: "setup",
    },
    {
      id: "study-mode",
      label: "Study type",
      detail:
        "Chooses the decision cards and reporting-guideline map for the workspace.",
      tier: "required",
      status: statusFrom(Boolean(state.mode)),
      stage: "setup",
    },
    {
      id: "research-question",
      label: "Research question",
      detail:
        "The first version can be rough; it anchors the question/scope cards.",
      tier: "recommended",
      status: statusFrom(hasText(state.researchQuestion)),
      stage: "setup",
    },
  ];
}

export function buildWorkbenchInputs({
  studyId,
  mode,
  cards,
  evidenceCount,
  corpus,
}: WorkbenchInputArgs): InputReadinessItem[] {
  const missingCards = cards.filter((card) => !isCardReady(card));
  const staleCards = cards.filter((card) => card.stale);
  const items: InputReadinessItem[] = [
    {
      id: "decision-cards",
      label: "Required design decisions",
      detail:
        missingCards.length === 0
          ? "All required decision cards have enough information for artifact drafts."
          : `${missingCards.length} card${missingCards.length === 1 ? "" : "s"} still need required fields.`,
      tier: "required",
      status: missingCards.length === 0 ? "present" : "missing",
      stage: "design",
      actionLabel: missingCards[0] ? `Open ${missingCards[0].label}` : undefined,
      target: missingCards[0]?.card_type,
    },
    {
      id: "stale-decisions",
      label: "Changed upstream decisions",
      detail:
        staleCards.length === 0
          ? "No downstream cards are stale."
          : `${staleCards.length} card${staleCards.length === 1 ? "" : "s"} should be re-checked after upstream edits.`,
      tier: "required",
      status: staleCards.length === 0 ? "present" : "needs_attention",
      stage: "design",
      actionLabel: staleCards[0] ? `Review ${staleCards[0].label}` : undefined,
      target: staleCards[0]?.card_type,
    },
    {
      id: "evidence-notes",
      label: "Evidence notes or snapshot",
      detail:
        evidenceCount > 0
          ? `${evidenceCount} evidence item${evidenceCount === 1 ? "" : "s"} imported for decision support.`
          : "Paste notes or import a structured snapshot so decisions can be evidence-backed.",
      tier: "recommended",
      status: evidenceCount > 0 ? "present" : "missing",
      stage: "context",
      actionLabel: "Add evidence",
      target: "import-evidence",
    },
  ];

  if (mode === "scoping_review") {
    const searchCount = corpus?.searches ?? 0;
    const recordCount = corpus?.records ?? 0;
    const confirmed = corpus?.confirmed ?? 0;
    const needsReview = corpus?.needs_review ?? 0;
    items.push(
      {
        id: "search-process-csv",
        label: "Search-process CSV",
        detail:
          searchCount > 0
            ? `${searchCount} database search${searchCount === 1 ? "" : "es"} imported for PRISMA flow.`
            : "Import database queries, yields, and last-search date.",
        tier: "required",
        status: searchCount > 0 ? "present" : "missing",
        stage: "corpus",
        actionLabel: "Open corpus",
        href: `/methods-workbench/${studyId}/corpus`,
      },
      {
        id: "records-csv",
        label: "Screened-records CSV",
        detail:
          recordCount > 0
            ? `${recordCount} record${recordCount === 1 ? "" : "s"} imported.`
            : "Import screened records with title, abstract, DOI/PMID, and screening decision columns.",
        tier: "required",
        status: recordCount > 0 ? "present" : "missing",
        stage: "corpus",
        actionLabel: "Open corpus",
        href: `/methods-workbench/${studyId}/corpus`,
      },
      {
        id: "screening-confirmation",
        label: "Screening confirmation",
        detail:
          recordCount === 0
            ? "Import records before confirming screening decisions."
            : needsReview > 0
              ? `${needsReview} imported decision${needsReview === 1 ? "" : "s"} still need review.`
              : `${confirmed} decision${confirmed === 1 ? "" : "s"} confirmed.`,
        tier: "recommended",
        status:
          recordCount === 0
            ? "missing"
            : needsReview > 0
              ? "needs_attention"
              : "present",
        stage: "corpus",
        actionLabel: "Review screening",
        href: `/methods-workbench/${studyId}/corpus`,
      },
    );
  }

  if (mode === "systematic_review") {
    items.push({
      id: "review-protocol-details",
      label: "Review protocol details",
      detail:
        "Prepare search sources, screening process, extraction items, risk-of-bias tool, and synthesis plan before drafting.",
      tier: "suggested",
      status: missingCards.length > 0 ? "missing" : "present",
      stage: "design",
    });
  }

  if (mode === "retrospective_observational") {
    items.push({
      id: "data-dictionary-input",
      label: "Variable definitions",
      detail:
        "Prepare data-source coverage, operational exposure/outcome definitions, confounders, and missing-data assumptions.",
      tier: "suggested",
      status: missingCards.length > 0 ? "missing" : "present",
      stage: "context",
    });
  }

  if (mode === "interventional") {
    items.push({
      id: "ai-intervention-input",
      label: "AI intervention specification",
      detail:
        "Prepare model version, input data quality checks, output, oversight, error handling, and deployment context.",
      tier: "suggested",
      status: missingCards.length > 0 ? "missing" : "present",
      stage: "context",
    });
  }

  return items;
}

export function buildReviewSetupInputs(
  state: ReviewSetupState,
): InputReadinessItem[] {
  const manuscriptCount = state.entries.filter(
    (entry) => entry.kind === "manuscript",
  ).length;
  const manuscriptReady = state.entries.some(
    (entry) => entry.kind === "manuscript" && entry.extracted,
  );
  const hasPendingUploads = state.entries.some((entry) => entry.uploading);
  const hasUploadErrors = state.entries.some((entry) => entry.error);
  const hasContextFiles = state.entries.some((entry) =>
    ["table", "figure", "appendix", "supplement", "other"].includes(entry.kind),
  );
  return [
    {
      id: "manuscript-file",
      label: "Manuscript file",
      detail:
        manuscriptCount > 1
          ? "Exactly one uploaded file should be tagged as the manuscript."
          : manuscriptReady
            ? "One manuscript has been uploaded and converted."
            : "Upload one .docx, .pdf, or Markdown manuscript.",
      tier: "required",
      status:
        manuscriptCount > 1 || hasUploadErrors
          ? "needs_attention"
          : manuscriptReady && !hasPendingUploads
            ? "present"
            : "missing",
      stage: "setup",
    },
    {
      id: "manuscript-title",
      label: "Title",
      detail: "Used in the workspace, review summary, and exported artifacts.",
      tier: "required",
      status: statusFrom(hasText(state.title)),
      stage: "setup",
    },
    {
      id: "review-focus",
      label: "Review focus",
      detail:
        "State what the pre-submission review should emphasize, even if it is a general journal-readiness critique.",
      tier: "required",
      status: statusFrom(hasText(state.reviewRequest)),
      stage: "run",
    },
    {
      id: "journal-context",
      label: "Target journal",
      detail:
        "Journal or venue context improves guideline, framing, and fit criticism.",
      tier: "recommended",
      status: statusFrom(hasText(state.journalType)),
      stage: "context",
    },
    {
      id: "research-context",
      label: "Research domain and type",
      detail:
        "Domain and research type help the review choose relevant expectations.",
      tier: "recommended",
      status: statusFrom(
        hasText(state.researchDomain) && hasText(state.researchType),
      ),
      stage: "context",
    },
    {
      id: "supporting-files",
      label: "Tables, figures, appendices, supplements",
      detail:
        hasContextFiles
          ? "Supporting files are included in the project inventory."
          : "Add any cited tables, figures, appendices, or supplementary material.",
      tier: "recommended",
      status: hasContextFiles ? "present" : "missing",
      stage: "context",
    },
  ];
}

export function mentionedAssetKinds(content: string): Array<ManuscriptAssetSummary["kind"]> {
  const found = new Set<ManuscriptAssetSummary["kind"]>();
  if (/\b(fig\.?|figure)\s*\d+/i.test(content)) found.add("figure");
  if (/\btable\s*\d+/i.test(content)) found.add("table");
  if (/\bappendix\b|\bsupplementary appendix\b/i.test(content)) found.add("appendix");
  if (/\bsupplement(?:ary|al)?\b|\bsupplementary material\b/i.test(content)) {
    found.add("supplement");
  }
  return [...found];
}

export function buildReviewInputs(args: {
  manuscript: Manuscript;
  assets: ManuscriptAssetSummary[];
  commentaries: Commentary[];
}): InputReadinessItem[] {
  const { manuscript, assets, commentaries } = args;
  const mentions = mentionedAssetKinds(manuscript.content_md);
  const missingMentioned = mentions.filter((kind) => !hasAssetKind(assets, kind));
  const hasAnyAsset = assets.length > 0;
  const hasMethods = Boolean(manuscript.study_id);
  const hasPriorReviewMaterial = commentaries.length > 0;

  return [
    {
      id: "review-focus",
      label: "Review focus",
      detail: hasText(manuscript.review_request)
        ? manuscript.review_request!
        : "Add the specific scope for this pre-submission review.",
      tier: "required",
      status: statusFrom(hasText(manuscript.review_request)),
      stage: "run",
      actionLabel: "Add focus",
      target: "review-focus",
    },
    {
      id: "journal-context",
      label: "Target journal",
      detail: hasText(manuscript.journal_type)
        ? manuscript.journal_type!
        : "Add target journal or venue so critique can consider fit and conventions.",
      tier: "recommended",
      status: statusFrom(hasText(manuscript.journal_type)),
      stage: "context",
    },
    {
      id: "research-context",
      label: "Research domain and type",
      detail:
        hasText(manuscript.research_domain) && hasText(manuscript.research_type)
          ? `${manuscript.research_domain} · ${manuscript.research_type}`
          : "Add domain and research type for more relevant expectations.",
      tier: "recommended",
      status: statusFrom(
        hasText(manuscript.research_domain) && hasText(manuscript.research_type),
      ),
      stage: "context",
    },
    {
      id: "source-methods",
      label: "Source methods",
      detail: hasMethods
        ? "This manuscript is linked to a Methods Workbench study."
        : "Linking a study lets readiness/review compare manuscript claims against planned methods.",
      tier: "recommended",
      status: hasMethods ? "present" : "missing",
      stage: "context",
    },
    {
      id: "supporting-files",
      label: "Supporting files",
      detail: hasAnyAsset
        ? `${assets.length} supporting file${assets.length === 1 ? "" : "s"} uploaded.`
        : "Upload tables, figures, appendices, supplements, or response material referenced by the manuscript.",
      tier: "recommended",
      status: hasAnyAsset ? "present" : "missing",
      stage: "context",
      actionLabel: "Upload revision",
      href: `/my-articles/${manuscript.id}/upload-revision`,
    },
    {
      id: "mentioned-assets",
      label: "Referenced files present",
      detail:
        missingMentioned.length === 0
          ? "No obvious missing figure/table/supplement references were detected."
          : `Manuscript mentions ${missingMentioned.join(", ")} material that is not uploaded.`,
      tier: "suggested",
      status: missingMentioned.length === 0 ? "present" : "missing",
      stage: "context",
      actionLabel: missingMentioned.length > 0 ? "Upload files" : undefined,
      href:
        missingMentioned.length > 0
          ? `/my-articles/${manuscript.id}/upload-revision`
          : undefined,
    },
    {
      id: "prior-review-corpus",
      label: "Prior review material",
      detail: hasPriorReviewMaterial
        ? `${commentaries.length} prior letter/report item${commentaries.length === 1 ? "" : "s"} available for grounding.`
        : "Optional: upload prior editorial letters or reviewer reports if this article already has feedback.",
      tier: "suggested",
      status: hasPriorReviewMaterial ? "present" : "missing",
      stage: "context",
      actionLabel: "Upload material",
      href: `/my-articles/${manuscript.id}/upload-revision`,
    },
  ];
}
