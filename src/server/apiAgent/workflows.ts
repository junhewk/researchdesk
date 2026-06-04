import { z } from "zod";
import { searchArticles } from "@/server/articleSearch";
import { getChecklist, listChecklistItems, updateChecklistItem } from "@/server/reportingChecklists";
import { appendReadinessItem, getReadinessCheck, listReadinessItems, updateReadinessCheck } from "@/server/readinessChecks";
import { createReview } from "@/server/reviews";
import { getManuscript } from "@/server/manuscripts";
import { clearRiskFindings, createFinding, getStudy, listDecisions } from "@/server/studies";
import { getCardDef, getCardStage } from "@/server/methods/cardSchema";
import { parseValue } from "@/server/methods/preflight";
import { searchCommentaries, searchReviews } from "@/server/search";
import type { ReviewCategory, Severity } from "@/server/types";
import { runStructured, truncateForPrompt } from "./structuredRunner";
import type { ApiAgentConfig } from "./providers";

const CORE_RULES = [
  "Never generate novel research content or unsupported claims.",
  "Ground findings in the provided manuscript, study cards, prior review context, or reporting guidelines.",
  "Prefer concrete, actionable findings over generic advice.",
  "If evidence is insufficient, say what is missing instead of inventing facts.",
].join("\n- ");

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

const ReviewResultSchema = z.object({
  items: z.array(z.object({
    category: z.enum(["mechanical", "rewrite", "structural", "evidence"]),
    severity: z.enum(["minor", "major", "critical"]).nullable().default(null),
    section_ref: z.string().nullable().default(null),
    content_md: z.string().min(1),
  })).default([]),
  summary_md: z.string().min(1),
});

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function manuscriptContext(manuscriptId: string): string {
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

async function gatherReviewContext(
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

export async function runReviewAgent(opts: {
  manuscriptId: string;
  config: ApiAgentConfig;
}): Promise<{ created: number; summary_md: string }> {
  const toolContext = await gatherReviewContext(opts.config, opts.manuscriptId);
  const result = await runStructured({
    config: opts.config,
    schema: ReviewResultSchema,
    schemaName: "ReviewResult",
    systemPrompt: `You are a journal-article review assistant.\n\n- ${CORE_RULES}`,
    userPrompt: [
      manuscriptContext(opts.manuscriptId),
      "",
      toolContext,
      "",
      "Create review findings for substantive problems. Each finding must include the problem, why it matters, and a concrete suggested action.",
    ].join("\n"),
  });

  let created = 0;
  for (const item of result.parsed.items) {
    createReview({
      manuscript_id: opts.manuscriptId,
      category: item.category as ReviewCategory,
      severity: (item.severity ?? undefined) as Severity | undefined,
      section_ref: item.section_ref ?? undefined,
      content_md: item.content_md,
    });
    created += 1;
  }
  return { created, summary_md: result.parsed.summary_md };
}
