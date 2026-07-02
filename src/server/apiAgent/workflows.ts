import { z } from "zod";
import { searchArticles } from "@/server/articleSearch";
import { getChecklist, listChecklistItems, updateChecklistItem } from "@/server/reportingChecklists";
import { appendReadinessItem, getReadinessCheck, listReadinessItems, updateReadinessCheck } from "@/server/readinessChecks";
import { listCommentaries } from "@/server/commentaries";
import { createReview } from "@/server/reviews";
import { getManuscript } from "@/server/manuscripts";
import {
  getReviewerResponse,
  listResponseItems,
  updateResponse,
  updateResponseItem,
} from "@/server/reviewerResponses";
import {
  clearProposalOptions,
  clearRiskFindings,
  createEvidenceItem,
  createFinding,
  createProposalOption,
  getSnapshot,
  getStudy,
  listDecisions,
  listEvidenceItems,
  listProposalOptions,
} from "@/server/studies";
import { getCardDef, getCardStage } from "@/server/methods/cardSchema";
import { parseValue } from "@/server/methods/preflight";
import { sanitizeProposalFields } from "@/server/methods/proposals";
import { searchCommentaries, searchReviews } from "@/server/search";
import { buildGroundingPack } from "@/server/reviewGrounding";
import type { EvidenceItemKind, ReviewCategory, Severity } from "@/server/types";
import { runStructured, truncateForPrompt } from "./structuredRunner";
import type { ApiAgentConfig } from "./providers";

/** Number of identical grounded reviewers the product runs by default before the
 * neutral merge. The persona-vs-context experiment's winning arm was a grounded
 * ensemble; 3 is the chosen quality/cost balance (a single pass is `fanout: 1`). */
export const DEFAULT_ENSEMBLE_FANOUT = 3;

export const CORE_RULES = [
  "Never generate novel research content or unsupported claims.",
  "Ground findings in the provided manuscript, study cards, prior review context, or reporting guidelines.",
  "Prefer concrete, actionable findings over generic advice.",
  "If evidence is insufficient, say what is missing instead of inventing facts.",
].join("\n- ");

export const REVIEW_DEPTH_INSTRUCTION =
  "Depth target: for a protocol-length or full manuscript, aim for 10-18 distinct, non-overlapping findings across critical, major, and minor severity where the text supports them. Return fewer only when you have exhausted concrete grounded issues; never pad with generic comments.";

const ChecklistResultSchema = z.object({
  items: z.array(z.object({
    item_id: z.string().min(1),
    status: z.enum(["unaddressed", "addressed", "partial", "na"]),
    evidence_md: z.string().nullable().default(null),
    location_ref: z.string().nullable().default(null),
  })).default([]),
  summary_md: z.string().min(1),
});

const ReadinessResultSchema = z.object({
  items: z.array(z.object({
    gate: z.string().min(1),
    severity: z.enum(["minor", "major", "critical"]).nullable().default(null),
    finding_md: z.string().min(1),
    suggested_fix_md: z.string().nullable().default(null),
  })).default([]),
  verdict: z.enum(["ready", "ready_with_caveats", "not_ready"]),
  overall_score: z.number().int().min(0).max(100),
  summary_md: z.string().min(1),
});

const PreflightRiskResultSchema = z.object({
  findings: z.array(z.object({
    severity: z.enum(["blocking", "important", "minor"]),
    card_type: z.string().nullable().default(null),
    title: z.string().min(1),
    detail_md: z.string().nullable().default(null),
  })).default([]),
  summary_md: z.string().min(1),
});

const ReviewPlanSchema = z.object({
  review_search_queries: z.array(z.string().min(1)).max(3).default([]),
  article_search_queries: z.array(z.string().min(1)).max(3).default([]),
});

export const ReviewResultSchema = z.object({
  items: z.array(z.object({
    category: z.enum(["mechanical", "rewrite", "structural", "evidence"]),
    severity: z.enum(["minor", "major", "critical"]).nullable().default(null),
    section_ref: z.string().nullable().default(null),
    content_md: z.string().min(1),
  })).default([]),
  summary_md: z.string().min(1),
});

/** One structured review finding (item of {@link ReviewResultSchema}). Exported
 * so the experiment harness (src/server/experiment/reviewArms.ts) can type the
 * per-persona sub-reviews and the merged output it feeds back through this same
 * schema. */
export type ReviewItem = z.infer<typeof ReviewResultSchema>["items"][number];

const ReviewerResponseDraftSchema = z.object({
  items: z.array(z.object({
    item_id: z.string().min(1),
    response_md: z.string().min(1),
    change_pointer_md: z.string().nullable().default(null),
    status: z.enum(["drafting", "accepted", "declined"]).default("drafting"),
  })).default([]),
  summary_md: z.string().min(1),
});

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function manuscriptContext(manuscriptId: string): string {
  const manuscript = getManuscript(manuscriptId);
  if (!manuscript) throw new Error("manuscript not found");
  return [
    `Title: ${manuscript.title}`,
    manuscript.research_domain ? `Domain: ${manuscript.research_domain}` : null,
    manuscript.research_type ? `Research type: ${manuscript.research_type}` : null,
    manuscript.journal_type ? `Target journal: ${manuscript.journal_type}` : null,
    manuscript.review_request ? `User review scope: ${manuscript.review_request}` : null,
    "",
    "Manuscript:",
    truncateForPrompt(manuscript.content_md),
  ].filter(Boolean).join("\n");
}

export async function runChecklistAgent(opts: {
  checklistId: string;
  config: ApiAgentConfig;
}): Promise<{ updated: number; summary_md: string }> {
  const checklist = getChecklist(opts.checklistId);
  if (!checklist) throw new Error("checklist not found");
  if (checklist.subject_type !== "manuscript") {
    throw new Error("only manuscript checklists are supported");
  }

  const items = listChecklistItems(checklist.id);
  const itemIds = new Set(items.map((item) => item.id));
  const result = await runStructured({
    config: opts.config,
    schema: ChecklistResultSchema,
    schemaName: "ChecklistResult",
    systemPrompt: `You are a reporting-checklist compliance assistant.\n\n- ${CORE_RULES}`,
    userPrompt: [
      manuscriptContext(checklist.subject_id),
      "",
      `Guideline: ${checklist.guideline} ${checklist.version}`,
      "Checklist items:",
      asJson(items.map((item) => ({
        item_id: item.id,
        item_key: item.item_key,
        section: item.section,
        prompt: item.prompt,
        current_status: item.status,
      }))),
      "",
      "For every item you can judge, set addressed/partial/unaddressed/na with concise evidence and a section/location reference.",
    ].join("\n"),
  });

  let updated = 0;
  for (const item of result.parsed.items) {
    if (!itemIds.has(item.item_id)) continue;
    const next = updateChecklistItem(item.item_id, {
      status: item.status,
      evidence_md: item.evidence_md,
      location_ref: item.location_ref,
    });
    if (next) updated += 1;
  }

  return { updated, summary_md: result.parsed.summary_md };
}

export async function runReadinessAgent(opts: {
  checkId: string;
  config: ApiAgentConfig;
}): Promise<{ created: number; verdict: string; overall_score: number; summary_md: string }> {
  const check = getReadinessCheck(opts.checkId);
  if (!check) throw new Error("readiness check not found");

  const existingItems = listReadinessItems(check.id);
  const result = await runStructured({
    config: opts.config,
    schema: ReadinessResultSchema,
    schemaName: "ReadinessResult",
    systemPrompt: `You are a manuscript-readiness assistant.\n\n- ${CORE_RULES}`,
    userPrompt: [
      manuscriptContext(check.manuscript_id),
      "",
      "Existing deterministic findings:",
      asJson(existingItems.map((item) => ({
        gate: item.gate,
        severity: item.severity,
        finding_md: item.finding_md,
      }))),
      "",
      "Find additional submission-readiness gaps only when they are concrete and not duplicates of existing findings.",
    ].join("\n"),
  });

  let created = 0;
  for (const item of result.parsed.items) {
    const inserted = appendReadinessItem({
      checkId: check.id,
      gate: item.gate,
      severity: item.severity,
      finding_md: item.finding_md,
      suggested_fix_md: item.suggested_fix_md,
    });
    if (inserted) created += 1;
  }
  updateReadinessCheck(check.id, {
    status: "completed",
    overall_score: result.parsed.overall_score,
    summary_md: [
      `Verdict: ${result.parsed.verdict.replaceAll("_", " ")}`,
      "",
      result.parsed.summary_md,
    ].join("\n"),
  });

  return {
    created,
    verdict: result.parsed.verdict,
    overall_score: result.parsed.overall_score,
    summary_md: result.parsed.summary_md,
  };
}

export async function runPreflightRiskAgent(opts: {
  studyId: string;
  config: ApiAgentConfig;
  sessionId?: string | null;
}): Promise<{ created: number; summary_md: string }> {
  const study = getStudy(opts.studyId);
  if (!study) throw new Error("study not found");
  const cards = listDecisions(study.id).map((decision) => {
    const def = getCardDef(study.mode, decision.card_type);
    return {
      card_type: decision.card_type,
      label: def?.label ?? decision.card_type,
      stage: getCardStage(study.mode, decision.card_type),
      state: decision.state,
      value: parseValue(decision.value_json),
      open_question_md: decision.open_question_md,
    };
  });

  const result = await runStructured({
    config: opts.config,
    schema: PreflightRiskResultSchema,
    schemaName: "PreflightRiskResult",
    systemPrompt: `You audit study-design cards for methodological risk.\n\n- ${CORE_RULES}`,
    userPrompt: [
      `Study: ${study.title}`,
      study.research_question ? `Question: ${study.research_question}` : null,
      `Mode: ${study.mode}`,
      "",
      "Cards:",
      asJson(cards),
      "",
      "Identify concrete methodological risks only: bias, invalid timing, selection problems, missing analysis safeguards, multiplicity, or infeasible design assumptions.",
    ].filter(Boolean).join("\n"),
  });

  clearRiskFindings(study.id);
  let created = 0;
  for (const finding of result.parsed.findings) {
    createFinding({
      study_id: study.id,
      session_id: opts.sessionId ?? null,
      layer: "risk",
      severity: finding.severity,
      card_type: finding.card_type,
      title: finding.title,
      detail_md: finding.detail_md,
    });
    created += 1;
  }
  return { created, summary_md: result.parsed.summary_md };
}

const EvidenceExtractionSchema = z.object({
  items: z.array(z.object({
    kind: z.enum(["prior_design", "population", "outcome", "confounder", "bias", "measure", "other"]),
    label: z.string().min(1),
    detail_md: z.string().nullable().default(null),
  })).default([]),
  summary_md: z.string().min(1),
});

/** Mine a free-form evidence snapshot (pasted notes, MDR/RW report without a
 * digest) into structured evidence items. Synchronous structured pass — the
 * working sibling of the deterministic extractFromSnapshot digest path. */
export async function runEvidenceExtractionAgent(opts: {
  snapshotId: string;
  config: ApiAgentConfig;
}): Promise<{ created: number; summary_md: string }> {
  const snapshot = getSnapshot(opts.snapshotId);
  if (!snapshot) throw new Error("snapshot not found");
  const study = getStudy(snapshot.study_id);
  if (!study) throw new Error("study not found");

  const result = await runStructured({
    config: opts.config,
    schema: EvidenceExtractionSchema,
    schemaName: "EvidenceExtractionResult",
    systemPrompt: `You mine imported research notes for study-design-relevant evidence items.\n\n- ${CORE_RULES}\n- Do NOT invent items that are not supported by the provided text.`,
    userPrompt: [
      `Study: ${study.title}`,
      study.research_question ? `Question: ${study.research_question}` : null,
      `Mode: ${study.mode}`,
      "",
      "Imported notes / snapshot content:",
      truncateForPrompt(snapshot.raw_json),
      "",
      "Extract design-relevant items: prior study designs, populations/eligibility, outcomes and their timing, confounders, known bias risks, and measures/instruments. Give each a short label and a one-line detail with its grounding in the text.",
    ].filter(Boolean).join("\n"),
  });

  let created = 0;
  for (const item of result.parsed.items) {
    createEvidenceItem({
      snapshot_id: snapshot.id,
      study_id: study.id,
      kind: item.kind as EvidenceItemKind,
      label: item.label,
      detail_md: item.detail_md,
    });
    created += 1;
  }
  return { created, summary_md: result.parsed.summary_md };
}

const CardProposalSchema = z.object({
  options: z.array(z.object({
    label: z.string().min(1),
    value_suggestion: z.string().min(1),
    fields_suggestion: z.record(z.string(), z.string()).default({}),
    consequence_md: z.string().nullable().default(null),
  })).min(1).max(4),
  summary_md: z.string().min(1),
});

/** Generate 2–4 evidence-grounded options for one decision card. Replaces the
 * card's currently shown options with the returned set, so a follow-up reply
 * ("frame it as 90-day instead") refreshes the list in place. The agent never
 * sets the card value — the user picks via "Use this" or edits directly. */
export async function runCardProposalAgent(opts: {
  studyId: string;
  cardType: string;
  sessionId?: string | null;
  userReply?: string | null;
  config: ApiAgentConfig;
}): Promise<{ created: number; summary_md: string }> {
  const study = getStudy(opts.studyId);
  if (!study) throw new Error("study not found");
  const def = getCardDef(study.mode, opts.cardType);
  const decisions = listDecisions(study.id);
  const allowedKinds = new Set(def?.evidenceKinds ?? []);
  const evidence = listEvidenceItems(study.id).filter(
    (item) => allowedKinds.size === 0 || allowedKinds.has(item.kind),
  );
  const currentOptions = listProposalOptions(study.id, opts.cardType);
  const requiredFields = def?.requiredFields ?? [];
  const requiredFieldIds = requiredFields.map((field) => field.id);

  const cards = decisions.map((decision) => ({
    card_type: decision.card_type,
    label: getCardDef(study.mode, decision.card_type)?.label ?? decision.card_type,
    state: decision.state,
    value: parseValue(decision.value_json).value ?? null,
  }));

  const result = await runStructured({
    config: opts.config,
    schema: CardProposalSchema,
    schemaName: "CardProposalResult",
    systemPrompt: `You help a researcher specify one methodological decision in their study design by proposing options.\n\n- ${CORE_RULES}\n- Never decide for the researcher: propose 2–4 concrete options with one-line trade-offs (feasibility, bias, missingness, comparability) and let them choose.`,
    userPrompt: [
      `Study: ${study.title}`,
      study.research_question ? `Question: ${study.research_question}` : null,
      `Mode: ${study.mode}`,
      "",
      `Decision to propose options for: ${def?.label ?? opts.cardType}`,
      def?.help ? `What this decision covers: ${def.help}` : null,
      requiredFields.length > 0
        ? `Required sub-field ids and labels: ${asJson(requiredFields.map((f) => ({ id: f.id, label: f.label })))}`
        : null,
      "",
      "Current decisions on the canvas:",
      asJson(cards),
      "",
      "Imported evidence relevant to this decision:",
      asJson(evidence.map((item) => ({ kind: item.kind, label: item.label, detail: item.detail_md }))),
      "",
      "Options currently shown to the researcher (may be pre-seeded; keep, refine, or replace them):",
      asJson(currentOptions.map((o) => ({
        label: o.label,
        value_suggestion: o.value_suggestion,
        fields_suggestion: o.fields_suggestion,
        consequence_md: o.consequence_md,
      }))),
      opts.userReply ? `\nResearcher's follow-up request: ${opts.userReply}` : null,
      "",
      "Return the full updated set of 2–4 options. `value_suggestion` is the exact text that would go in the card's headline value. If required sub-fields are listed above, include `fields_suggestion` keyed by those exact ids with concise text the researcher can review/edit before saving. Omit unsupported sub-fields. `consequence_md` is a one-line trade-off grounded in the evidence above.",
    ].filter(Boolean).join("\n"),
  });

  clearProposalOptions(study.id, opts.cardType);
  let created = 0;
  for (const option of result.parsed.options) {
    createProposalOption({
      study_id: study.id,
      card_type: opts.cardType,
      session_id: opts.sessionId ?? null,
      label: option.label,
      value_suggestion: option.value_suggestion,
      fields_suggestion: sanitizeProposalFields(
        option.fields_suggestion,
        requiredFieldIds,
      ),
      consequence_md: option.consequence_md,
    });
    created += 1;
  }
  return { created, summary_md: result.parsed.summary_md };
}

export async function gatherReviewContext(
  config: ApiAgentConfig,
  manuscriptId: string,
): Promise<string> {
  const plan = await runStructured({
    config,
    schema: ReviewPlanSchema,
    schemaName: "ReviewPlan",
    systemPrompt: "You choose search queries that would help calibrate a manuscript review. Return only queries.",
    userPrompt: manuscriptContext(manuscriptId).slice(0, 30_000),
    maxRepairAttempts: 1,
  });

  const reviewRows = plan.parsed.review_search_queries.flatMap((query) => [
    ...searchReviews({ query, limit: 5 }),
    ...searchCommentaries({ query, limit: 5 }),
  ]);
  const articleRows = (
    await Promise.all(
      plan.parsed.article_search_queries.map((query) =>
        searchArticles({ query, source: "both", limit: 5 }).catch((err) => ({
          query,
          error: err instanceof Error ? err.message : String(err),
        })),
      ),
    )
  );

  return [
    "Prior review/commentary search results:",
    asJson(reviewRows),
    "",
    "Scholarly search results:",
    asJson(articleRows),
  ].join("\n");
}

// Factor clauses for the review system prompt. The product (and the
// context-only experiment arm) makes its anti-persona, grounded stance explicit
// here so the persona/context factors can be toggled independently and audited.
// These two lines are the one deliberate refinement vs. the older implicit
// prompt: the product now *states* "ground, don't role-play" rather than only
// implying it through CORE_RULES.
export const ANTI_PERSONA_CLAUSE =
  "Review as one integrated expert reviewer. Do not adopt a named reviewer persona.";
const GROUND_CONTEXT_CLAUSE =
  "Calibrate and ground your review in the user's prior review patterns and the scholarly search results provided below.";
const SOLO_GROUND_CLAUSE =
  "Ground your review only in the manuscript text provided below.";

/** Compose the review system prompt from the two factors. Pure (no I/O) so the
 * experiment harness can hash it and a unit test can prove factor isolation
 * without spending API tokens: toggling one factor changes exactly one line. */
export function composeReviewSystemPrompt(opts: {
  grounding: boolean;
  personaClause?: string | null;
}): string {
  return [
    "You are a journal-article review assistant.",
    "",
    `- ${opts.personaClause ?? ANTI_PERSONA_CLAUSE}`,
    `- ${opts.grounding ? GROUND_CONTEXT_CLAUSE : SOLO_GROUND_CLAUSE}`,
    `- ${CORE_RULES}`,
  ].join("\n");
}

export interface ReviewRunResult {
  items: ReviewItem[];
  summary_md: string;
  rawText: string;
  attempts: number;
  /** The fully composed system prompt actually sent. Returned so the experiment
   * harness can hash it and prove factor isolation (e.g. naive vs context differ
   * only by the grounding clause). Small; safe to persist. */
  systemPrompt: string;
}

/**
 * Core review pass shared by the product and by every experiment arm. Composes
 * the system prompt from two independent factors and returns the parsed result
 * WITHOUT persisting (no createReview) so callers decide what to do with it.
 *
 * - Factor A (persona): pass `personaClause` to review from a named disciplinary
 *   lens; pass null/omit for the integrated, anti-persona reviewer.
 * - Factor B (context): `grounding` toggles the prior-review/scholarly context.
 *   Pass a precomputed `toolContext` to gather once and share across a persona
 *   panel (fairness + cost); otherwise it is gathered here when grounding is on.
 */
export async function reviewManuscriptStructured(opts: {
  manuscriptId: string;
  config: ApiAgentConfig;
  grounding: boolean;
  personaClause?: string | null;
  toolContext?: string;
  temperature?: number;
}): Promise<ReviewRunResult> {
  const toolContext = opts.grounding
    ? opts.toolContext ?? (await gatherReviewContext(opts.config, opts.manuscriptId))
    : "";
  const systemPrompt = composeReviewSystemPrompt({
    grounding: opts.grounding,
    personaClause: opts.personaClause,
  });
  const userPrompt = [
    manuscriptContext(opts.manuscriptId),
    ...(opts.grounding ? ["", toolContext] : []),
    "",
    "Create review findings for substantive problems. Each finding must include the problem, why it matters, and a concrete suggested action.",
    REVIEW_DEPTH_INSTRUCTION,
  ].join("\n");

  const result = await runStructured({
    config: opts.config,
    schema: ReviewResultSchema,
    schemaName: "ReviewResult",
    systemPrompt,
    userPrompt,
    temperature: opts.temperature,
  });
  return {
    items: result.parsed.items,
    summary_md: result.parsed.summary_md,
    rawText: result.rawText,
    attempts: result.attempts,
    systemPrompt,
  };
}

/** Neutral merge step for an ensemble of reviews. Reuses the product review
 * schema so merged output is directly comparable to a single pass. Exported (with
 * {@link AGGREGATOR_SYSTEM}) so the experiment harness consolidates its panel/
 * ensemble arms through the exact same code — one source of truth for the merge. */
export const AGGREGATOR_SYSTEM = [
  "You are a neutral review aggregator. You receive several independent review reports of the same manuscript and must consolidate them into one.",
  "",
  `- ${ANTI_PERSONA_CLAUSE}`,
  "- Merge items that describe the same underlying problem into a single item; keep the union of all genuinely distinct issues.",
  "- Never drop a real issue just because only one source raised it, and never invent an issue that no source raised.",
  "- Preserve the most specific section_ref available for each merged issue.",
  "- Assign one final severity per merged issue: the most severe credible assessment among the sources.",
  `- ${CORE_RULES}`,
].join("\n");

export async function aggregateReviews(opts: {
  config: ApiAgentConfig;
  subReviews: { persona?: string | null; items: ReviewItem[] }[];
  temperature?: number;
}): Promise<{ items: ReviewItem[]; summary_md: string }> {
  const payload = opts.subReviews.map((r, i) => ({
    reviewer: r.persona ?? `reviewer_${i + 1}`,
    items: r.items,
  }));
  const result = await runStructured({
    config: opts.config,
    schema: ReviewResultSchema,
    schemaName: "ReviewResult",
    systemPrompt: AGGREGATOR_SYSTEM,
    userPrompt: [
      "Independent review reports (JSON):",
      asJson(payload),
      "",
      "Return the consolidated review: the union of distinct issues, duplicates merged, exactly one severity per issue.",
      REVIEW_DEPTH_INSTRUCTION,
      "Do not over-compress the merged review into a short shortlist; preserve every distinct supported issue from the independent reports.",
    ].join("\n"),
    temperature: opts.temperature,
  });
  return { items: result.parsed.items, summary_md: result.parsed.summary_md };
}

export interface EnsembleRunResult {
  items: ReviewItem[];
  summary_md: string;
  /** the per-reviewer passes that succeeded (≤ fanout; failed ones are dropped) */
  subReviews: ReviewRunResult[];
  merged: boolean;
  /** how many reviewers were requested vs how many failed and were dropped */
  attempted: number;
  dropped: number;
  /** the shared grounded context block sent to each reviewer ("" when ungrounded) */
  toolContext: string;
}

/**
 * The product review architecture: a context-grounded ensemble. Gathers the
 * grounding context **once** (prior-review/scholarly retrieval + the deterministic
 * grounding pack — GRIM / DOI / protocol drift), shares it across `fanout`
 * identical integrated reviewers, then consolidates with one neutral merge. This
 * is the experiment's winning `ensemble_context` shape made the default; pass
 * `fanout: 1` for a single grounded pass (the Advanced escape hatch).
 *
 * Returns the merged items WITHOUT persisting — callers decide what to do.
 */
export async function reviewManuscriptEnsemble(opts: {
  manuscriptId: string;
  config: ApiAgentConfig;
  grounding: boolean;
  fanout: number;
  personaClause?: string | null;
  toolContext?: string;
  temperature?: number;
  /** allow the grounding pack's network DOI/retraction checks (own-article path) */
  allowExternal?: boolean;
}): Promise<EnsembleRunResult> {
  const fanout = Math.max(1, Math.floor(opts.fanout));

  // Factor B — gather once, share across the ensemble (fairness + cost). The
  // retrieval context and the deterministic pack are concatenated into one block.
  let toolContext = "";
  if (opts.grounding) {
    if (opts.toolContext !== undefined) {
      toolContext = opts.toolContext;
    } else {
      const retrieval = await gatherReviewContext(opts.config, opts.manuscriptId);
      const pack = await buildGroundingPack({
        manuscriptId: opts.manuscriptId,
        allowExternal: opts.allowExternal ?? false,
      });
      toolContext = [retrieval, pack.block].filter(Boolean).join("\n\n");
    }
  }

  // Fan out the reviewers tolerantly: a single sub-reviewer that fails (e.g. a
  // weak/local model emitting malformed structured output) must not sink the
  // whole review — drop it and merge the survivors. Only a total wipeout throws.
  const settled = await Promise.allSettled(
    Array.from({ length: fanout }, () =>
      reviewManuscriptStructured({
        manuscriptId: opts.manuscriptId,
        config: opts.config,
        grounding: opts.grounding,
        personaClause: opts.personaClause ?? null,
        toolContext: opts.grounding ? toolContext : undefined,
        temperature: opts.temperature,
      }),
    ),
  );
  const subReviews = settled
    .filter((s): s is PromiseFulfilledResult<ReviewRunResult> => s.status === "fulfilled")
    .map((s) => s.value);
  const dropped = fanout - subReviews.length;
  if (subReviews.length === 0) {
    const firstRejected = settled.find((s) => s.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw firstRejected?.reason instanceof Error
      ? firstRejected.reason
      : new Error("all reviewers failed");
  }

  if (subReviews.length === 1) {
    return {
      items: subReviews[0].items,
      summary_md: subReviews[0].summary_md,
      subReviews,
      merged: false,
      attempted: fanout,
      dropped,
      toolContext,
    };
  }

  const merged = await aggregateReviews({
    config: opts.config,
    subReviews: subReviews.map((r) => ({ items: r.items })),
    temperature: opts.temperature,
  });
  return {
    items: merged.items,
    summary_md: merged.summary_md,
    subReviews,
    merged: true,
    attempted: fanout,
    dropped,
    toolContext,
  };
}

export async function runReviewAgent(opts: {
  manuscriptId: string;
  config: ApiAgentConfig;
}): Promise<{ created: number; summary_md: string }> {
  // The product review path is now a context-grounded ensemble (the experiment's
  // winning architecture): N identical grounded reviewers + a neutral merge, with
  // the deterministic grounding pack injected. This is the own-article path, so
  // external DOI/retraction validation is allowed. Persistence stays here.
  const result = await reviewManuscriptEnsemble({
    manuscriptId: opts.manuscriptId,
    config: opts.config,
    grounding: true,
    fanout: opts.config.ensembleCount ?? DEFAULT_ENSEMBLE_FANOUT,
    personaClause: null,
    allowExternal: true,
  });

  let created = 0;
  for (const item of result.items) {
    createReview({
      manuscript_id: opts.manuscriptId,
      category: item.category as ReviewCategory,
      severity: (item.severity ?? undefined) as Severity | undefined,
      section_ref: item.section_ref ?? undefined,
      content_md: item.content_md,
    });
    created += 1;
  }
  return { created, summary_md: result.summary_md };
}

export async function runReviewerResponseAgent(opts: {
  responseId: string;
  config: ApiAgentConfig;
}): Promise<{ updated: number; summary_md: string }> {
  const response = getReviewerResponse(opts.responseId);
  if (!response) throw new Error("reviewer response not found");

  const items = listResponseItems(response.id);
  if (items.length === 0) {
    const summary =
      "No reviewer-response items were available to draft. Add or upload reviewer comments first.";
    updateResponse(response.id, { summary_md: summary });
    return { updated: 0, summary_md: summary };
  }

  const itemIds = new Set(items.map((item) => item.id));
  const letters = listCommentaries(response.manuscript_id).filter(
    (commentary) =>
      commentary.source === "decision_letter" ||
      commentary.source === "reviewer_report" ||
      commentary.source === "prior_response",
  );

  const result = await runStructured({
    config: opts.config,
    schema: ReviewerResponseDraftSchema,
    schemaName: "ReviewerResponseDraft",
    systemPrompt: `You are a response-to-reviewers drafting assistant.\n\n- ${CORE_RULES}\n- Never claim a manuscript change has already been made unless the supplied manuscript text already contains it.\n- When a revision is needed, draft the response as a proposed change and keep the item status as drafting.`,
    userPrompt: [
      manuscriptContext(response.manuscript_id),
      "",
      "Reviewer letters and prior responses:",
      asJson(letters.map((letter) => ({
        source: letter.source,
        reviewer_label: letter.reviewer_label,
        round: letter.round,
        content_md: letter.content_md,
      }))),
      "",
      "Response items to draft:",
      asJson(items.map((item) => ({
        item_id: item.id,
        comment_excerpt: item.comment_excerpt,
        current_response_md: item.response_md,
        current_change_pointer_md: item.change_pointer_md,
      }))),
      "",
      "For each item, draft a concise point-by-point response. Use change_pointer_md for the manuscript section that should be revised, or null when no manuscript change is needed.",
    ].join("\n"),
  });

  let updated = 0;
  for (const item of result.parsed.items) {
    if (!itemIds.has(item.item_id)) continue;
    const next = updateResponseItem(item.item_id, {
      response_md: item.response_md,
      change_pointer_md: item.change_pointer_md,
      status: item.status,
    });
    if (next) updated += 1;
  }
  updateResponse(response.id, {
    status: "drafting",
    summary_md: result.parsed.summary_md,
  });

  return { updated, summary_md: result.parsed.summary_md };
}
