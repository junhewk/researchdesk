/**
 * Generate the 6 review arms on a local OpenAI-compatible server (llama.cpp /
 * llama-server) using grammar-constrained structured output. Drives the SAME
 * prompts as the Claude pilot (from manifest.json) so the ONLY thing that
 * changes between trials is the model — a clean weak-vs-strong comparison.
 *
 *   node scripts/experiment/run-arms-http.mjs \
 *     --manifest experiments/manuscript-review/manifest.json \
 *     --out experiments/manuscript-review/trials/02-qwen3_6-27b-checklist/runs \
 *     --url http://100.122.169.13:8091/v1 --model qwen3.6-27b-mtp-q8 --reps 2 --concurrency 3
 *
 * Structured output uses response_format json_schema (llama-server grammar-
 * constrains generation to the schema, incl. enums). Sampling follows the Qwen3
 * instruct (non-thinking) recommendation; grammar decoding suppresses <think>.
 */
import fs from "node:fs";
import path from "node:path";

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) o[k] = "true";
      else { o[k] = v; i += 1; }
    }
  }
  return o;
}
const A = args(process.argv.slice(2));
const MANIFEST = JSON.parse(fs.readFileSync(A.manifest ?? "experiments/manuscript-review/manifest.json", "utf8"));
const OUT = A.out ?? "experiments/manuscript-review/trials/02-qwen3_6-27b-checklist/runs";
const URL = (A.url ?? "http://100.122.169.13:8091/v1").replace(/\/$/, "");
const MODEL = A.model ?? "qwen3.6-27b-mtp-q8";
const REPS = Number(A.reps ?? "2");
const CONC = Number(A.concurrency ?? "1"); // local server serves ~1 slot (429 on parallel)
const TEMP = Number(A.temperature ?? "0.7");
const ALL_ARMS = ["naive", "persona", "context", "persona_context", "ensemble_naive", "ensemble_context"];
const ARM_NAMES = A.arms ? A.arms.split(",").map((s) => s.trim()).filter(Boolean) : ALL_ARMS;
const ONLY_MIDS = A.manuscripts && A.manuscripts !== "all" ? new Set(A.manuscripts.split(",").map((s) => s.trim())) : null;
fs.mkdirSync(OUT, { recursive: true });

const reviewItem = {
  type: "object", additionalProperties: false,
  properties: {
    category: { type: "string", enum: ["mechanical", "rewrite", "structural", "evidence"] },
    severity: { type: "string", enum: ["minor", "major", "critical"] },
    section_ref: { type: "string" },
    content_md: { type: "string" },
  },
  required: ["category", "severity", "section_ref", "content_md"],
};
const REVIEW_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { items: { type: "array", items: reviewItem }, summary_md: { type: "string" } },
  required: ["items", "summary_md"],
};

// Qwen3 instruct (non-thinking) sampling recommendation.
async function complete(system, user, schema, schemaName) {
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: TEMP, top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.5,
    max_tokens: 4096, // headroom so merged outputs don't truncate into invalid JSON
    response_format: { type: "json_schema", json_schema: { name: schemaName, schema } },
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const res = await fetch(`${URL}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.status === 429) { await sleep(1500 * attempt); continue; } // server busy → back off
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const content = j.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(content);
      // truncation guard: a clipped response yields fewer tokens than the cap but
      // still parses only if the grammar happened to close; if finish_reason=length, retry bigger.
      if (j.choices?.[0]?.finish_reason === "length") throw new Error("truncated (finish_reason=length)");
      return parsed;
    } catch (e) {
      const truncated = /Unterminated|Unexpected end|truncated/.test(e.message);
      if (truncated && body.max_tokens < 8192) body.max_tokens = Math.min(8192, body.max_tokens * 2); // adapt up
      if (attempt >= 4) { console.error(`    call failed (${schemaName}): ${e.message}`); return { items: [], summary_md: "" }; }
      await sleep(800 * attempt);
    }
  }
  return { items: [], summary_md: "" };
}

const MERGE_SYSTEM = [
  "You are a neutral review aggregator. You receive several independent review reports of the same manuscript and consolidate them into one.",
  "- Merge items describing the same underlying problem; keep the union of all genuinely distinct issues.",
  "- Never drop a real issue only one source raised, and never invent an issue no source raised.",
  "- Preserve the most specific section_ref; assign one final severity per merged issue.",
].join("\n");

async function runArm(mid, arm, rep) {
  const m = MANIFEST.manuscripts[mid];
  const spec = MANIFEST.arms[arm];
  const userBody =
    `## Manuscript and context\n${m.userContext}` +
    (spec.grounding ? `\n\n${m.groundingBlock}` : "") +
    `\n\n${MANIFEST.instruction}`;
  const subItems = [];
  for (const sc of spec.subCalls) {
    const r = await complete(sc.system, userBody, REVIEW_SCHEMA, "ReviewResult");
    subItems.push(Array.isArray(r.items) ? r.items : []);
  }
  let items;
  if (spec.merge) {
    const payload = subItems.map((items, i) => ({ reviewer: `r${i + 1}`, items }));
    const r = await complete(
      MERGE_SYSTEM,
      `Independent reviews (JSON):\n${JSON.stringify(payload)}\n\nReturn the consolidated review.`,
      REVIEW_SCHEMA, "ReviewResult",
    );
    items = Array.isArray(r.items) ? r.items : [];
  } else {
    items = subItems[0] ?? [];
  }
  return { mid, arm, rep, nSub: spec.subCalls.length, nItems: items.length, items };
}

// task list
const TASKS = [];
for (const mid of Object.keys(MANIFEST.manuscripts).filter((id) => !ONLY_MIDS || ONLY_MIDS.has(id)))
  for (const arm of ARM_NAMES)
    for (let rep = 1; rep <= REPS; rep += 1) {
      const f = path.join(OUT, `${mid}__${arm}__rep${rep}.json`);
      if (!fs.existsSync(f) || A.overwrite === "true") TASKS.push({ mid, arm, rep, f });
    }

console.log(`qwen run: ${TASKS.length} arm-runs (${Object.keys(MANIFEST.manuscripts).length} manuscripts x ${ARM_NAMES.length} arms x ${REPS} reps) @ ${URL} model=${MODEL} temp=${TEMP} conc=${CONC}`);

let done = 0;
async function worker(queue) {
  while (queue.length) {
    const t = queue.shift();
    const started = Date.now();
    const r = await runArm(t.mid, t.arm, t.rep);
    fs.writeFileSync(t.f, JSON.stringify(r, null, 2));
    done += 1;
    console.log(`  [${done}/${TASKS.length}] ${t.arm} rep${t.rep} ${t.mid.slice(0, 5)} → ${r.nItems} items (${r.nSub} sub, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
}
const queue = [...TASKS];
await Promise.all(Array.from({ length: Math.min(CONC, queue.length || 1) }, () => worker(queue)));
console.log(`\nDone. ${done}/${TASKS.length} arm-runs → ${OUT}`);
