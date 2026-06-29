/**
 * Build the self-contained manifest the review workflow consumes via `args`.
 *
 *   REVIEWER_DATA_DIR=<expdb> npm run exp:manifest -- --manuscripts all
 *
 * For each manuscript it bundles:
 *   - userContext     : title/domain/type + full manuscript text
 *   - groundingBlock  : applicable reporting-guideline checklist (the context arm's
 *                       grounding; NO protocol-diff is handed over, to keep gate
 *                       recall a fair test rather than a tautology)
 *   - gold            : deterministic gates + checklist gaps + curated ledger,
 *                       deduped — the blinded judge scores against this
 * and, per arm, the precomposed system prompts (one per sub-call) from
 * composeReviewSystemPrompt + PERSONA_ROSTER. Output: experiments/manuscript-review/manifest.json
 */
import fs from "node:fs";
import path from "node:path";
import { getManuscript, listManuscripts } from "@/server/manuscripts";
import { manuscriptContext, composeReviewSystemPrompt } from "@/server/apiAgent/workflows";
import { suggestGuidelines, getChecklistTemplate } from "@/server/checklistKnowledge";
import { ARMS, ALL_ARMS, PERSONA_ROSTER, type ArmName } from "@/server/experiment/reviewArms";
import type { ReportingGuideline, StudyDesign } from "@/server/types";

const INSTRUCTION =
  "Create review findings for substantive problems in this manuscript. Each finding must include the problem, why it matters, and a concrete suggested action. Return JSON with `items` (each: category one of mechanical|rewrite|structural|evidence; severity one of minor|major|critical; section_ref; content_md) and a short `summary_md`.";

const DESIGN_ALIASES: Record<string, StudyDesign> = {
  "randomized-trial": "rct",
  "randomised-trial": "rct",
  rct: "rct",
};

function design(researchType: string | null): StudyDesign | null {
  if (!researchType) return null;
  const k = researchType.trim().toLowerCase();
  return (DESIGN_ALIASES[k] ?? (k as StudyDesign)) || null;
}

function groundingBlock(researchType: string | null): { guidelines: ReportingGuideline[]; text: string } {
  const guidelines = suggestGuidelines("manuscript", design(researchType));
  const lines: string[] = [
    "### Reporting-standard grounding",
    `Apply the following reporting guideline(s) to this manuscript: ${guidelines.join(", ") || "(general best practice)"}.`,
    "Check whether each item below is adequately reported; flag any that are missing or inadequate.",
    "",
  ];
  for (const g of guidelines) {
    const tpl = getChecklistTemplate(g);
    lines.push(`#### ${g} ${tpl.version}`);
    for (const it of tpl.items) lines.push(`- ${it.item_key} (${it.section}): ${it.prompt}`);
    lines.push("");
  }
  return { guidelines, text: lines.join("\n") };
}

interface Gold {
  id: string;
  layer: string;
  gold_severity: string | null;
  description: string;
}

function mergeGold(answerKeyPath: string, ledger: Gold[] | undefined): Gold[] {
  const key = JSON.parse(fs.readFileSync(answerKeyPath, "utf8"));
  const det: Gold[] = (key.gold as Gold[]).map((g) => ({
    id: g.id,
    layer: g.layer,
    gold_severity: g.gold_severity,
    description: g.description,
  }));
  // Keys already covered by a deterministic gold, so the ledger doesn't double them.
  // gate ids look like "gate:<gate>:<i>"; checklist ids like "checklist:<item_key>".
  const coveredKeys = new Set<string>();
  for (const g of det) {
    if (g.layer === "gate") coveredKeys.add(`gate:${g.id.split(":")[1]}`);
    if (g.layer === "checklist") coveredKeys.add(g.id);
  }

  const out = [...det];
  let n = 0;
  for (const l of ledger ?? []) {
    const maps = (l as Gold & { maps_to?: string }).maps_to ?? "";
    if ((maps.startsWith("gate:") || maps.startsWith("checklist:")) && coveredKeys.has(maps)) continue; // dedup
    out.push({ id: `ledger:${n++}`, layer: "ledger", gold_severity: l.gold_severity, description: l.description });
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
      else { out[a.slice(2)] = next; i += 1; }
    }
  }
  return {
    manuscripts: out.manuscripts ?? "all",
    keys: out.keys ?? "experiments/manuscript-review/answer_keys",
    out: out.out ?? "experiments/manuscript-review/manifest.json",
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ids =
    args.manuscripts === "all"
      ? listManuscripts({ limit: 1000 }).map((m) => m.id)
      : args.manuscripts.split(",").map((s) => s.trim()).filter(Boolean);

  const ledgersPath = path.resolve("experiments/manuscript-review/ledgers.json");
  const ledgers: Record<string, Gold[]> = fs.existsSync(ledgersPath)
    ? JSON.parse(fs.readFileSync(ledgersPath, "utf8"))
    : {};

  // Arm specs: precompose the (manuscript-independent) system prompts per sub-call.
  const armSpecs: Record<string, {
    grounding: boolean; persona: boolean; ensemble: boolean; merge: boolean;
    subCalls: { label: string; system: string }[];
  }> = {};
  for (const arm of ALL_ARMS as ArmName[]) {
    const spec = ARMS[arm];
    const subCalls = spec.persona
      ? PERSONA_ROSTER.map((p) => ({
          label: p.key,
          system: composeReviewSystemPrompt({ grounding: spec.grounding, personaClause: p.clause }),
        }))
      : Array.from({ length: spec.fanout }, (_, i) => ({
          label: spec.fanout > 1 ? `reviewer_${i + 1}` : "single",
          system: composeReviewSystemPrompt({ grounding: spec.grounding, personaClause: null }),
        }));
    armSpecs[arm] = {
      grounding: spec.grounding,
      persona: spec.persona,
      ensemble: spec.ensemble,
      merge: subCalls.length > 1,
      subCalls,
    };
  }

  const manuscripts: Record<string, {
    title: string; userContext: string; groundingBlock: string;
    guidelines: ReportingGuideline[]; gold: Gold[];
  }> = {};

  for (const id of ids) {
    const m = getManuscript(id);
    if (!m) { console.warn(`  skip ${id}: not found`); continue; }
    const gb = groundingBlock(m.research_type);
    const keyPath = path.join(path.resolve(args.keys), `${id}.json`);
    const gold = fs.existsSync(keyPath) ? mergeGold(keyPath, ledgers[id]) : [];
    manuscripts[id] = {
      title: m.title,
      userContext: manuscriptContext(id),
      groundingBlock: gb.text,
      guidelines: gb.guidelines,
      gold,
    };
    console.log(`  ${id}  gold=${gold.length} (gate+checklist+ledger)  guidelines=${gb.guidelines.join(",") || "-"}`);
  }

  const manifest = {
    schema: "review-manifest/v1",
    meta: { baseModel: "Claude (workflow agents)", note: "context arm grounded in reporting checklist; no protocol-diff handed over" },
    instruction: INSTRUCTION,
    arms: armSpecs,
    manuscripts,
  };
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  const bytes = fs.statSync(outPath).size;
  console.log(`\nManifest → ${outPath} (${(bytes / 1024).toFixed(0)} KB, ${Object.keys(manuscripts).length} manuscripts, ${ALL_ARMS.length} arms)`);
}

main();
