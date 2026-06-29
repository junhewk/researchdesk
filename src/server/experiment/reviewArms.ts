/**
 * Experiment harness — the six review arms of the persona-vs-context factorial.
 *
 * This module is additive and experiment-only. It composes the SAME core review
 * pass the product uses (`reviewManuscriptStructured` in apiAgent/workflows.ts)
 * under different settings of two independent factors:
 *
 *   Factor A (persona):  4 named disciplinary reviewers  vs  one integrated reviewer
 *   Factor B (context):  product grounding pipeline on    vs  manuscript-only
 *
 * Two ensemble controls (N *identical* integrated reviewers, merged the same way
 * as the persona panel) isolate the persona-framing effect from the mere fact of
 * running N reviewers + a merge pass. See the plan: hypothesis H4.
 *
 * Nothing here persists to the product tables — callers (the runner script) own
 * output. See `docs/EXPERIMENT.md`.
 */
import { createHash } from "node:crypto";
import type { ApiAgentConfig } from "@/server/apiAgent/providers";
import { runStructured } from "@/server/apiAgent/structuredRunner";
import {
  ANTI_PERSONA_CLAUSE,
  CORE_RULES,
  ReviewResultSchema,
  gatherReviewContext,
  reviewManuscriptStructured,
  type ReviewItem,
} from "@/server/apiAgent/workflows";

/** The four disciplinary lenses the commercial "reviewer persona" apps assemble.
 * Each clause is the only thing that differs between the persona sub-calls — so a
 * persona arm vs. its ensemble control differs by exactly these strings. */
export const PERSONA_ROSTER: { key: string; clause: string }[] = [
  {
    key: "statistician",
    clause:
      "You are a biostatistician. Review strictly from a statistical lens — study design, sample-size justification and power, choice and assumptions of analyses, multiplicity, effect sizes, confidence intervals, missing-data handling, and honest reporting of uncertainty. Surface only issues your statistical expertise is best placed to catch.",
  },
  {
    key: "methodologist",
    clause:
      "You are a research-methodology specialist. Review strictly from a methods lens — internal/external validity, bias (selection, measurement, confounding), protocol adherence, eligibility and comparator definition, outcome specification and timing, and reporting-guideline conformance. Surface only issues your methodological expertise is best placed to catch.",
  },
  {
    key: "domain_expert",
    clause:
      "You are a senior domain expert in this manuscript's clinical/scientific field. Review strictly from a substantive lens — plausibility of mechanisms and claims, clinical relevance, consistency with established evidence, and whether the conclusions are warranted by the data. Surface only issues your domain expertise is best placed to catch.",
  },
  {
    key: "writer_editor",
    clause:
      "You are a scientific writer/editor. Review strictly from a communication lens — structure, clarity, internal consistency between abstract/results/tables, citation/reporting mechanics, and whether each claim is stated precisely. Surface only issues your editorial expertise is best placed to catch.",
  },
];

export type ArmName =
  | "naive"
  | "persona"
  | "context"
  | "persona_context"
  | "ensemble_naive"
  | "ensemble_context";

export interface ArmSpec {
  /** distinct persona clause per sub-call (Factor A on) */
  persona: boolean;
  /** N identical integrated reviewers (the H4 control) */
  ensemble: boolean;
  /** Factor B: product grounding pipeline */
  grounding: boolean;
  /** number of sub-reviews before any merge (1 = single pass) */
  fanout: number;
}

const PANEL_SIZE = PERSONA_ROSTER.length;

export const ARMS: Record<ArmName, ArmSpec> = {
  naive: { persona: false, ensemble: false, grounding: false, fanout: 1 },
  persona: { persona: true, ensemble: false, grounding: false, fanout: PANEL_SIZE },
  context: { persona: false, ensemble: false, grounding: true, fanout: 1 },
  persona_context: { persona: true, ensemble: false, grounding: true, fanout: PANEL_SIZE },
  ensemble_naive: { persona: false, ensemble: true, grounding: false, fanout: PANEL_SIZE },
  ensemble_context: { persona: false, ensemble: true, grounding: true, fanout: PANEL_SIZE },
};

export const ALL_ARMS = Object.keys(ARMS) as ArmName[];

export function isArmName(value: string): value is ArmName {
  return value in ARMS;
}

export interface SubReview {
  /** persona key, or null for an integrated/identical reviewer */
  persona: string | null;
  items: ReviewItem[];
  summary_md: string;
  attempts: number;
  systemPrompt: string;
  systemPromptHash: string;
  ms: number;
}

export interface ArmResult {
  arm: ArmName;
  spec: ArmSpec;
  manuscriptId: string;
  /** the arm's final output (post-merge for panel/ensemble arms) */
  items: ReviewItem[];
  summary_md: string;
  /** every per-call review feeding the arm (1 for single arms, N for panels) */
  subReviews: SubReview[];
  merged: boolean;
  aggregatorPromptHash: string | null;
  grounding: boolean;
  /** hash of the shared gathered-context block (null when grounding off) */
  toolContextHash: string | null;
  config: { provider: string; model: string | null; temperature: number };
  /** one hash per sub-call system prompt — for factor-isolation auditing */
  promptHashes: string[];
  ms: number;
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 12);
}

/** Neutral merge step for panel/ensemble arms. Reuses the product review schema
 * so merged output is directly comparable to a single arm's output. */
const AGGREGATOR_SYSTEM = [
  "You are a neutral review aggregator. You receive several independent review reports of the same manuscript and must consolidate them into one.",
  "",
  `- ${ANTI_PERSONA_CLAUSE}`,
  "- Merge items that describe the same underlying problem into a single item; keep the union of all genuinely distinct issues.",
  "- Never drop a real issue just because only one source raised it, and never invent an issue that no source raised.",
  "- Preserve the most specific section_ref available for each merged issue.",
  "- Assign one final severity per merged issue: the most severe credible assessment among the sources.",
  `- ${CORE_RULES}`,
].join("\n");

async function aggregate(opts: {
  config: ApiAgentConfig;
  subReviews: SubReview[];
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
      JSON.stringify(payload, null, 2),
      "",
      "Return the consolidated review: the union of distinct issues, duplicates merged, exactly one severity per issue.",
    ].join("\n"),
    temperature: opts.temperature,
  });
  return { items: result.parsed.items, summary_md: result.parsed.summary_md };
}

/**
 * Run one experiment arm against one manuscript. Gathers the grounding context
 * once (when Factor B is on) and shares it across all sub-calls, so the persona
 * panel and its ensemble control see identical context — the only thing that
 * varies within a grounded pair is the persona clause.
 */
export async function runArm(opts: {
  arm: ArmName;
  manuscriptId: string;
  config: ApiAgentConfig;
  temperature?: number;
}): Promise<ArmResult> {
  const spec = ARMS[opts.arm];
  const startedAt = Date.now();

  // Factor B — gather once, share across the panel (fairness + cost).
  const toolContext = spec.grounding
    ? await gatherReviewContext(opts.config, opts.manuscriptId)
    : undefined;

  // Persona arms → distinct clause per roster entry.
  // Ensemble arms → `fanout` identical integrated reviewers (clause = null).
  // Single arms  → one integrated reviewer.
  const clauses: (string | null)[] = spec.persona
    ? PERSONA_ROSTER.map((p) => p.clause)
    : Array.from({ length: spec.fanout }, () => null);
  const keys: (string | null)[] = spec.persona
    ? PERSONA_ROSTER.map((p) => p.key)
    : clauses.map(() => null);

  const subReviews: SubReview[] = await Promise.all(
    clauses.map(async (clause, i) => {
      const t0 = Date.now();
      const r = await reviewManuscriptStructured({
        manuscriptId: opts.manuscriptId,
        config: opts.config,
        grounding: spec.grounding,
        personaClause: clause,
        toolContext,
        temperature: opts.temperature,
      });
      return {
        persona: keys[i],
        items: r.items,
        summary_md: r.summary_md,
        attempts: r.attempts,
        systemPrompt: r.systemPrompt,
        systemPromptHash: sha1(r.systemPrompt),
        ms: Date.now() - t0,
      };
    }),
  );

  let items: ReviewItem[];
  let summary_md: string;
  let aggregatorPromptHash: string | null = null;
  if (subReviews.length > 1) {
    const merged = await aggregate({
      config: opts.config,
      subReviews,
      temperature: opts.temperature,
    });
    items = merged.items;
    summary_md = merged.summary_md;
    aggregatorPromptHash = sha1(AGGREGATOR_SYSTEM);
  } else {
    items = subReviews[0].items;
    summary_md = subReviews[0].summary_md;
  }

  return {
    arm: opts.arm,
    spec,
    manuscriptId: opts.manuscriptId,
    items,
    summary_md,
    subReviews,
    merged: subReviews.length > 1,
    aggregatorPromptHash,
    grounding: spec.grounding,
    toolContextHash: toolContext ? sha1(toolContext) : null,
    config: {
      provider: opts.config.provider,
      model: opts.config.model ?? null,
      temperature: opts.temperature ?? 0.1,
    },
    promptHashes: subReviews.map((r) => r.systemPromptHash),
    ms: Date.now() - startedAt,
  };
}
