/**
 * Export blinded human-rating packets to validate the LLM judge.
 *
 *   npm run exp:packets -- --n 400 --seed pilot-1
 *
 * Samples N review comments across all runs, strips arm/model/rep, and presents
 * them in a hash-shuffled order with opaque packet ids. ≥2 experts rate each
 * comment; judge↔human agreement (kappa) then validates (or recalibrates) the
 * LLM judge before the full scoring is trusted.
 *
 * Outputs (experiments/manuscript-review/rating_packets/):
 *   packets.jsonl          — what raters see (packet_id, manuscriptId, comment)
 *   ratings_template.csv    — empty grid for raters to fill
 *   key.jsonl               — packet_id → provenance. RATER-BLIND; analysis only.
 *
 * No API key or model needed — pure sampling. Deterministic given --seed.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

interface Candidate {
  manuscriptId: string;
  arm: string;
  rep: number;
  itemIndex: number;
  category: string;
  severity: string | null;
  section_ref: string | null;
  content_md: string;
  sourceRun: string;
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
    out: out.out ?? "experiments/manuscript-review/rating_packets",
    n: Number(out.n ?? "400"),
    seed: out.seed ?? "pilot-1",
  };
}

function hash(seed: string, c: Candidate): string {
  return createHash("sha1")
    .update(`${seed}|${c.manuscriptId}|${c.arm}|${c.rep}|${c.itemIndex}`)
    .digest("hex");
}

function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runsDir = path.resolve(args.runs);
  if (!fs.existsSync(runsDir)) {
    console.error(`No runs dir at ${runsDir}. Run npm run exp:run first.`);
    process.exit(1);
  }
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  interface RunFile {
    manuscriptId: string;
    arm: string;
    rep: number;
    items?: Array<{
      category: string;
      severity: string | null;
      section_ref: string | null;
      content_md: string;
    }>;
  }

  const candidates: Candidate[] = [];
  for (const f of fs.readdirSync(runsDir).filter((x) => x.endsWith(".json"))) {
    const run = JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8")) as RunFile;
    (run.items ?? []).forEach((it, i) => {
      candidates.push({
        manuscriptId: run.manuscriptId,
        arm: run.arm,
        rep: run.rep,
        itemIndex: i,
        category: it.category,
        severity: it.severity ?? null,
        section_ref: it.section_ref ?? null,
        content_md: it.content_md,
        sourceRun: f,
      });
    });
  }

  if (candidates.length === 0) {
    console.error("No review comments found in runs. Generate reviews first (npm run exp:run).");
    process.exit(1);
  }

  // Deterministic blind sample + order: sort by seeded hash, take N.
  const ordered = candidates
    .map((c) => ({ c, h: hash(args.seed, c) }))
    .sort((a, b) => (a.h < b.h ? -1 : 1))
    .slice(0, Math.min(args.n, candidates.length));

  const packetsPath = path.join(outDir, "packets.jsonl");
  const keyPath = path.join(outDir, "key.jsonl");
  const csvPath = path.join(outDir, "ratings_template.csv");
  for (const p of [packetsPath, keyPath, csvPath]) if (fs.existsSync(p)) fs.unlinkSync(p);

  const csvRows = [
    [
      "packet_id",
      "valid_0_1",
      "hallucination_0_1",
      "specificity_0_2",
      "actionability_0_2",
      "matches_gold_id",
      "notes",
    ].join(","),
  ];

  ordered.forEach(({ c }, i) => {
    const packetId = `pkt_${String(i + 1).padStart(4, "0")}`;
    fs.appendFileSync(
      packetsPath,
      JSON.stringify({
        packet_id: packetId,
        manuscriptId: c.manuscriptId, // raters load the manuscript to judge validity
        category: c.category,
        stated_severity: c.severity,
        section_ref: c.section_ref,
        comment: c.content_md,
      }) + "\n",
    );
    fs.appendFileSync(
      keyPath,
      JSON.stringify({
        packet_id: packetId,
        manuscriptId: c.manuscriptId,
        arm: c.arm, // unblinded provenance — analysis only
        rep: c.rep,
        itemIndex: c.itemIndex,
        sourceRun: c.sourceRun,
      }) + "\n",
    );
    csvRows.push([csvCell(packetId), "", "", "", "", "", ""].join(","));
  });

  fs.writeFileSync(csvPath, csvRows.join("\n") + "\n");

  console.log(
    `Exported ${ordered.length} blinded packets (of ${candidates.length} comments) to ${outDir}\n` +
      `  packets.jsonl  → give to raters (with manuscript access)\n` +
      `  ratings_template.csv → ≥2 raters fill independently\n` +
      `  key.jsonl  → KEEP BLIND until judge↔human kappa is computed`,
  );
}

main();
