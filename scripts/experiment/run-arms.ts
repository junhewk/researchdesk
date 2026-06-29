/**
 * Generate review outputs for the persona-vs-context factorial.
 *
 *   npm run exp:run -- --manuscripts all --arms naive,persona,context,persona_context,ensemble_naive,ensemble_context \
 *                      --reps 3 --provider openai --model gpt-5.4 --temperature 0.1
 *
 * Writes one JSON per (manuscript x arm x rep) to
 *   experiments/manuscript-review/runs/{manuscriptId}__{arm}__rep{k}.json
 *
 * The base model + decoding are pinned identically across every arm (the central
 * confound to control). Run the same command at --temperature 0.7 --reps 5 for
 * the consistency block, and with --provider gemini --model gemini-2.5-pro for
 * the replication block. Requires the relevant provider API key in the env.
 */
import fs from "node:fs";
import path from "node:path";
import { listManuscripts, getManuscript } from "@/server/manuscripts";
import type { ApiAgentConfig, ApiProvider } from "@/server/apiAgent/providers";
import { apiProviderSchema } from "@/server/apiAgent/providers";
import { ALL_ARMS, isArmName, runArm, type ArmName } from "@/server/experiment/reviewArms";

interface Args {
  manuscripts: string;
  arms: string;
  reps: number;
  provider: string;
  model: string | null;
  temperature: number;
  timeoutMs: number;
  out: string;
  overwrite: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out[key] = "true";
      } else {
        out[key] = next;
        i += 1;
      }
    }
  }
  return {
    manuscripts: out.manuscripts ?? "all",
    arms: out.arms ?? ALL_ARMS.join(","),
    reps: Number(out.reps ?? "3"),
    provider: out.provider ?? "openai",
    model: out.model ?? null,
    temperature: Number(out.temperature ?? "0.1"),
    timeoutMs: Number(out.timeoutMs ?? out["timeout-ms"] ?? "180000"),
    out: out.out ?? "experiments/manuscript-review/runs",
    overwrite: out.overwrite === "true",
  };
}

function resolveManuscriptIds(spec: string): string[] {
  if (spec === "all") return listManuscripts({ limit: 1000 }).map((m) => m.id);
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveArms(spec: string): ArmName[] {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => {
      if (!isArmName(name)) {
        throw new Error(`unknown arm "${name}"; valid: ${ALL_ARMS.join(", ")}`);
      }
      return name;
    });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = apiProviderSchema.parse(args.provider) as ApiProvider;
  const manuscriptIds = resolveManuscriptIds(args.manuscripts);
  const arms = resolveArms(args.arms);

  if (manuscriptIds.length === 0) {
    console.error("No manuscripts to run. Seed first (npm run seed:demo) or pass --manuscripts <id,...>.");
    process.exit(1);
  }

  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  const config: ApiAgentConfig = {
    provider,
    model: args.model, // pinned explicitly; do not rely on saved provider settings
    timeoutMs: args.timeoutMs,
  };

  const total = manuscriptIds.length * arms.length * args.reps;
  let done = 0;
  let failed = 0;
  console.log(
    `Running ${total} reviews: ${manuscriptIds.length} manuscript(s) x ${arms.length} arm(s) x ${args.reps} rep(s) ` +
      `on ${provider}/${args.model ?? "(default)"} @ temp ${args.temperature}\n`,
  );

  for (const manuscriptId of manuscriptIds) {
    const manuscript = getManuscript(manuscriptId);
    if (!manuscript) {
      console.warn(`  skip ${manuscriptId}: not found`);
      continue;
    }
    for (const arm of arms) {
      for (let rep = 1; rep <= args.reps; rep += 1) {
        const file = path.join(outDir, `${manuscriptId}__${arm}__rep${rep}.json`);
        if (!args.overwrite && fs.existsSync(file)) {
          done += 1;
          console.log(`  [${done}/${total}] skip (exists) ${path.basename(file)}`);
          continue;
        }
        try {
          const result = await runArm({ arm, manuscriptId, config, temperature: args.temperature });
          fs.writeFileSync(
            file,
            JSON.stringify(
              {
                schema: "review-arm/v1",
                manuscriptTitle: manuscript.title,
                rep,
                temperature: args.temperature,
                ...result, // includes manuscriptId, arm, items, subReviews, config, hashes
              },
              null,
              2,
            ),
          );
          done += 1;
          console.log(
            `  [${done}/${total}] ${arm} rep${rep} → ${result.items.length} items ` +
              `(${result.subReviews.length} sub, ${result.ms}ms)  ${path.basename(file)}`,
          );
        } catch (err) {
          failed += 1;
          done += 1;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  [${done}/${total}] FAIL ${arm} rep${rep} on ${manuscriptId}: ${msg}`);
        }
      }
    }
  }

  console.log(`\nDone. ${done - failed}/${total} succeeded, ${failed} failed. Output: ${outDir}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
