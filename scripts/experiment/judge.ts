/**
 * Blinded LLM-as-judge scoring for the review arms.
 *
 *   npm run exp:judge -- --provider openai --model gpt-5.4 --temperature 0
 *
 * For every run JSON in experiments/manuscript-review/runs/, the judge receives
 * the manuscript, the answer key's gold issues, and the arm's review items WITH
 * ARM IDENTITY STRIPPED and items presented in a content-hashed (provenance-
 * blind) order. It decides which items match which gold issues and rates each
 * item. Outputs three long-format files for the mixed-effects analysis:
 *
 *   scores.jsonl    — one summary row per (manuscript x arm x rep)
 *   gold_obs.jsonl  — one row per (gold issue x run): detected 0/1   [primary]
 *   item_obs.jsonl  — one row per (review item x run): validity/halluc/etc.
 *
 * Validate the judge against the human-rated subset (npm run exp:packets) before
 * trusting it; freeze this prompt on a pilot first. Requires a provider API key.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getManuscript } from "@/server/manuscripts";
import { anchorParagraph } from "@/server/paragraphAnchor";
import { runStructured, truncateForPrompt } from "@/server/apiAgent/structuredRunner";
import { apiProviderSchema, type ApiAgentConfig, type ApiProvider } from "@/server/apiAgent/providers";

const JudgeSchema = z.object({
  matches: z
    .array(
      z.object({
        review_item_id: z.string(),
        gold_id: z.string().nullable(),
        match_type: z.enum(["exact", "partial", "none"]),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
  per_item: z
    .array(
      z.object({
        review_item_id: z.string(),
        valid: z.boolean(),
        hallucination: z.boolean(),
        specificity: z.number().int().min(0).max(2),
        actionability: z.number().int().min(0).max(2),
        severity_calibration: z.enum(["under", "match", "over"]),
      }),
    )
    .default([]),
  per_gold: z
    .array(
      z.object({
        gold_id: z.string(),
        detected: z.boolean(),
        best_item_id: z.string().nullable(),
      }),
    )
    .default([]),
  notes_md: z.string().default(""),
});

const JUDGE_SYSTEM = [
  "You are a blinded adjudicator of peer-review comments.",
  "You are given a manuscript, a list of known ground-truth issues (gold), and a set of review comments from an unknown source.",
  "Decide which comments address which known issues, and rate each comment.",
  "",
  "- A comment matches a gold issue only if it identifies the SAME underlying problem; gesturing near it without locating or specifying it is `partial` at best.",
  "- Do not reward verbosity or vague hedging.",
  "- `hallucination` = the comment asserts something about the manuscript that is false or unsupported.",
  "- `valid` = the comment is a real, defensible issue (whether or not it is in the gold list).",
  "- `specificity` 0-2: 0 generic, 1 names a section/claim, 2 pinpoints the exact location/quote.",
  "- `actionability` 0-2: 0 none, 1 vague direction, 2 concrete fix or wording.",
  "- `severity_calibration`: compare the comment's stated severity to the issue's true seriousness.",
  "- Never try to infer which system or persona produced the comments.",
].join("\n");

interface GoldIssue {
  id: string;
  layer: string;
  source_ref: string;
  gold_severity: string | null;
  description: string;
}
interface ArmItem {
  category: string;
  severity: string | null;
  section_ref: string | null;
  content_md: string;
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
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
    runs: out.runs ?? "experiments/manuscript-review/runs",
    keys: out.keys ?? "experiments/manuscript-review/answer_keys",
    out: out.out ?? "experiments/manuscript-review",
    provider: out.provider ?? "openai",
    model: out.model ?? null,
    temperature: Number(out.temperature ?? "0"),
    overwrite: out.overwrite === "true",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = apiProviderSchema.parse(args.provider) as ApiProvider;
  const config: ApiAgentConfig = { provider, model: args.model };

  const runsDir = path.resolve(args.runs);
  const keysDir = path.resolve(args.keys);
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(runsDir)) {
    console.error(`No runs dir at ${runsDir}. Run npm run exp:run first.`);
    process.exit(1);
  }

  const runFiles = fs.readdirSync(runsDir).filter((f) => f.endsWith(".json"));
  const scoresPath = path.join(outDir, "scores.jsonl");
  const goldObsPath = path.join(outDir, "gold_obs.jsonl");
  const itemObsPath = path.join(outDir, "item_obs.jsonl");
  if (args.overwrite) {
    for (const p of [scoresPath, goldObsPath, itemObsPath]) if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  const keyCache = new Map<string, { gold: GoldIssue[] }>();
  function loadKey(manuscriptId: string) {
    if (!keyCache.has(manuscriptId)) {
      const kp = path.join(keysDir, `${manuscriptId}.json`);
      if (!fs.existsSync(kp)) throw new Error(`missing answer key for ${manuscriptId} (run exp:keys)`);
      keyCache.set(manuscriptId, JSON.parse(fs.readFileSync(kp, "utf8")));
    }
    return keyCache.get(manuscriptId)!;
  }

  let scored = 0;
  for (const f of runFiles) {
    const run = JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8"));
    const { manuscriptId, arm, rep } = run;
    const items: ArmItem[] = run.items ?? [];
    const key = loadKey(manuscriptId);
    const gold = key.gold as GoldIssue[];

    const manuscript = getManuscript(manuscriptId);
    if (!manuscript) {
      console.warn(`  skip ${f}: manuscript ${manuscriptId} not found`);
      continue;
    }

    // Provenance-blind order: sort by content hash, then assign opaque ids.
    const presented = items
      .map((it) => ({ it, h: sha1(it.content_md) }))
      .sort((a, b) => (a.h < b.h ? -1 : 1))
      .map((x, i) => ({ id: `item_${i + 1}`, item: x.it }));
    const byId = new Map(presented.map((p) => [p.id, p.item]));

    const judged = await runStructured({
      config,
      schema: JudgeSchema,
      schemaName: "JudgeResult",
      temperature: args.temperature,
      systemPrompt: JUDGE_SYSTEM,
      userPrompt: [
        "## Manuscript",
        truncateForPrompt(manuscript.content_md, 60_000),
        "",
        "## Gold issues (ground truth a good review should catch)",
        JSON.stringify(
          gold.map((g) => ({ gold_id: g.id, layer: g.layer, severity: g.gold_severity, issue: g.description })),
          null,
          2,
        ),
        "",
        "## Review comments to adjudicate (source unknown)",
        JSON.stringify(
          presented.map((p) => ({
            review_item_id: p.id,
            category: p.item.category,
            stated_severity: p.item.severity,
            section_ref: p.item.section_ref,
            comment: p.item.content_md,
          })),
          null,
          2,
        ),
        "",
        "Return matches (one per comment), per_item ratings (one per comment), and per_gold (one per gold issue).",
      ].join("\n"),
    });
    const v = judged.parsed;

    // ---- metrics ----
    const total = presented.length;
    const detectedGold = new Set(v.per_gold.filter((g) => g.detected).map((g) => g.gold_id));
    const matchedItemIds = new Set(
      v.matches.filter((m) => m.match_type !== "none" && m.gold_id).map((m) => m.review_item_id),
    );
    const validItems = v.per_item.filter((p) => p.valid).length;
    const halluc = v.per_item.filter((p) => p.hallucination).length;
    const meanSpec = total ? v.per_item.reduce((s, p) => s + p.specificity, 0) / v.per_item.length : 0;
    const meanAct = total ? v.per_item.reduce((s, p) => s + p.actionability, 0) / v.per_item.length : 0;
    const hasSectionRef = items.filter((it) => (it.section_ref ?? "").trim().length > 0).length;
    const sectionRefResolves = items.filter(
      (it) => it.section_ref && anchorParagraph(manuscript.content_md, it.section_ref).status === "matched",
    ).length;

    const goldByLayer = (layer: string) => gold.filter((g) => g.layer === layer);
    const recallIn = (subset: GoldIssue[]) =>
      subset.length ? subset.filter((g) => detectedGold.has(g.id)).length / subset.length : null;

    const summary = {
      schema: "score/v1",
      manuscriptId,
      arm,
      rep,
      temperature: run.temperature,
      model: run.config?.model ?? args.model,
      provider: run.config?.provider ?? provider,
      n_items: total,
      n_gold: gold.length,
      recall_overall: recallIn(gold),
      recall_gate: recallIn(goldByLayer("gate")), // PRIMARY
      recall_checklist: recallIn(goldByLayer("checklist")),
      recall_reviewer: recallIn(goldByLayer("reviewer")),
      precision: total ? validItems / total : null,
      fdr: total ? 1 - validItems / total : null,
      matched_rate: total ? matchedItemIds.size / total : null,
      hallucination_rate: total ? halluc / total : null,
      mean_specificity: meanSpec,
      mean_actionability: meanAct,
      has_section_ref_rate: total ? hasSectionRef / total : null,
      section_ref_resolves_rate: total ? sectionRefResolves / total : null,
      redundancy: detectedGold.size ? matchedItemIds.size / detectedGold.size : null,
      sev_calibration: {
        under: v.per_item.filter((p) => p.severity_calibration === "under").length,
        match: v.per_item.filter((p) => p.severity_calibration === "match").length,
        over: v.per_item.filter((p) => p.severity_calibration === "over").length,
      },
    };
    fs.appendFileSync(scoresPath, JSON.stringify(summary) + "\n");

    // issue-level (primary GLMM): detected 0/1 per gold per run
    for (const g of gold) {
      fs.appendFileSync(
        goldObsPath,
        JSON.stringify({
          manuscriptId,
          arm,
          rep,
          gold_id: g.id,
          layer: g.layer,
          gold_severity: g.gold_severity,
          detected: detectedGold.has(g.id) ? 1 : 0,
        }) + "\n",
      );
    }
    // item-level: validity/hallucination per emitted comment
    for (const p of v.per_item) {
      const orig = byId.get(p.review_item_id);
      fs.appendFileSync(
        itemObsPath,
        JSON.stringify({
          manuscriptId,
          arm,
          rep,
          review_item_id: p.review_item_id,
          category: orig?.category ?? null,
          matched: matchedItemIds.has(p.review_item_id) ? 1 : 0,
          valid: p.valid ? 1 : 0,
          hallucination: p.hallucination ? 1 : 0,
          specificity: p.specificity,
          actionability: p.actionability,
          severity_calibration: p.severity_calibration,
        }) + "\n",
      );
    }

    scored += 1;
    console.log(
      `  ${arm} rep${rep} ${manuscriptId}  recall_gate=${summary.recall_gate?.toFixed(2) ?? "—"} ` +
        `halluc=${summary.hallucination_rate?.toFixed(2) ?? "—"} items=${total}`,
    );
  }

  console.log(`\nScored ${scored}/${runFiles.length} runs → ${scoresPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
