/**
 * Build the per-manuscript answer key (ground truth) for scoring review arms.
 *
 *   npm run exp:keys -- --manuscripts all
 *
 * Writes experiments/manuscript-review/answer_keys/{manuscriptId}.json with the
 * deterministic gold issues a good review should catch. No LLM, no API key —
 * runs the product's own oracle so the key never drifts from the app.
 *
 * Layers (see the plan):
 *   (a) gate      — runReadinessPreChecks + runProtocolCompareChecks. PRIMARY.
 *   (b) checklist — reporting-guideline items whose detect_regex does NOT match.
 *   (c) reviewer  — human reviewer letters, captured verbatim for later
 *                   atomization (LLM split + human check) into gold issues.
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/server/db";
import { listManuscripts, getManuscript } from "@/server/manuscripts";
import {
  createReadinessCheck,
  runReadinessPreChecks,
  runProtocolCompareChecks,
  listReadinessItems,
} from "@/server/readinessChecks";
import { suggestGuidelines, getChecklistTemplate } from "@/server/checklistKnowledge";
import { listCommentaries } from "@/server/commentaries";
import type { ReportingGuideline, Severity, StudyDesign } from "@/server/types";

interface GoldIssue {
  id: string;
  layer: "gate" | "checklist" | "reviewer";
  source_ref: string;
  gold_severity: Severity | null;
  description: string;
  detect: "deterministic" | "manual";
}

/** Map free-text research_type values to the StudyDesign union suggestGuidelines
 * expects (the seed uses "randomized-trial", the union uses "rct"). */
const DESIGN_ALIASES: Record<string, StudyDesign> = {
  "randomized-trial": "rct",
  "randomised-trial": "rct",
  "randomized controlled trial": "rct",
  rct: "rct",
  cohort: "cohort",
  "case-control": "case_control",
  case_control: "case_control",
  "cross-sectional": "cross_sectional",
  cross_sectional: "cross_sectional",
  "systematic-review": "systematic_review",
  systematic_review: "systematic_review",
  "scoping-review": "scoping_review",
  scoping_review: "scoping_review",
};

function normalizeDesign(researchType: string | null): StudyDesign | null {
  if (!researchType) return null;
  const key = researchType.trim().toLowerCase();
  // Alias first; otherwise pass the value through (it may already be a valid
  // StudyDesign like "diagnostic_accuracy"). suggestGuidelines tolerates strings
  // and falls back to defaults for genuinely unknown values.
  return (DESIGN_ALIASES[key] ?? (key as StudyDesign)) || null;
}

/** Run the deterministic oracle on an ephemeral readiness check, then delete it
 * so the answer-key build leaves no rows behind in the product DB. */
function gateGold(manuscriptId: string, studyId: string | null): GoldIssue[] {
  const check = createReadinessCheck({ manuscriptId, studyId });
  try {
    runReadinessPreChecks({ checkId: check.id, manuscriptId });
    if (studyId) runProtocolCompareChecks({ checkId: check.id, manuscriptId, studyId });
    return listReadinessItems(check.id).map((item, i) => ({
      id: `gate:${item.gate}:${i}`,
      layer: "gate" as const,
      source_ref: item.gate,
      gold_severity: item.severity,
      description: item.finding_md,
      detect: "deterministic" as const,
    }));
  } finally {
    const db = getDb();
    db.prepare("DELETE FROM readiness_check_items WHERE check_id = ?").run(check.id);
    db.prepare("DELETE FROM readiness_checks WHERE id = ?").run(check.id);
  }
}

function checklistGold(
  text: string,
  guidelines: ReportingGuideline[],
): GoldIssue[] {
  const out: GoldIssue[] = [];
  for (const guideline of guidelines) {
    const tpl = getChecklistTemplate(guideline);
    for (const item of tpl.items) {
      if (!item.detect_regex) continue; // only regex-checkable items are deterministic gold
      if (!item.detect_regex.test(text)) {
        out.push({
          id: `checklist:${item.item_key}`,
          layer: "checklist",
          source_ref: `${guideline} ${item.item_key} (${item.section})`,
          gold_severity: "minor",
          description: item.prompt,
          detect: "deterministic",
        });
      }
    }
  }
  return out;
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[a.slice(2)] = "true";
      else {
        out[a.slice(2)] = next;
        i += 1;
      }
    }
  }
  return {
    manuscripts: out.manuscripts ?? "all",
    guidelines: out.guidelines ?? null, // optional comma override
    out: out.out ?? "experiments/manuscript-review/answer_keys",
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ids =
    args.manuscripts === "all"
      ? listManuscripts({ limit: 1000 }).map((m) => m.id)
      : args.manuscripts.split(",").map((s) => s.trim()).filter(Boolean);

  if (ids.length === 0) {
    console.error("No manuscripts. Seed first (npm run seed:demo) or pass --manuscripts <id,...>.");
    process.exit(1);
  }

  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  for (const id of ids) {
    const m = getManuscript(id);
    if (!m) {
      console.warn(`  skip ${id}: not found`);
      continue;
    }

    const gold: GoldIssue[] = [];
    gold.push(...gateGold(m.id, m.study_id));

    const guidelines: ReportingGuideline[] = args.guidelines
      ? (args.guidelines.split(",").map((s) => s.trim()) as ReportingGuideline[])
      : suggestGuidelines("manuscript", normalizeDesign(m.research_type));
    gold.push(...checklistGold(m.content_md, guidelines));

    const reviewerLetters = listCommentaries(m.id).map((c) => ({
      id: c.id,
      reviewer_label: c.reviewer_label,
      source: c.source,
      round: c.round,
      content_md: c.content_md,
      // Atomize into layer-(c) gold with `npm run exp:keys -- --atomize` (LLM)
      // followed by a human pass. Captured verbatim here.
      atomized: false,
    }));

    const file = path.join(outDir, `${m.id}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          schema: "answer-key/v1",
          manuscriptId: m.id,
          title: m.title,
          research_type: m.research_type,
          study_id: m.study_id,
          guidelines,
          gold,
          counts: {
            gate: gold.filter((g) => g.layer === "gate").length,
            checklist: gold.filter((g) => g.layer === "checklist").length,
          },
          reviewer_letters: reviewerLetters,
        },
        null,
        2,
      ),
    );
    console.log(
      `  ${m.id}  gate=${gold.filter((g) => g.layer === "gate").length} ` +
        `checklist=${gold.filter((g) => g.layer === "checklist").length} ` +
        `letters=${reviewerLetters.length}  → ${path.basename(file)}`,
    );
  }
}

main();
