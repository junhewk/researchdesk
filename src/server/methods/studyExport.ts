import fs from "fs";
import path from "path";
import { getDb } from "../db";
import { getCardDef } from "./cardSchema";
import { parseValue } from "./preflight";
import { renderArtifactMarkdown, type CompiledArtifact } from "./artifacts";
import type { Study, DesignDecision, DecisionLogEntry } from "../types";
import { resolveDataDir } from "@/lib/dataDir";

// Markdown dual-write for studies — mirrors src/server/markdownExport.ts so the
// design state, decision log, and compiled artifacts live as files under
// data/exports/studies/{id}/ alongside the SQLite source of truth.

function dataDir(): string {
  const db = getDb();
  const list = db.pragma("database_list") as Array<{ file: string }>;
  if (list[0]?.file) return path.dirname(list[0].file);
  return resolveDataDir();
}

function studyDir(studyId: string): string {
  return path.resolve(dataDir(), "exports", "studies", studyId);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function deleteStudyExport(studyId: string): void {
  const dir = studyDir(studyId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export function exportStudy(
  study: Study,
  decisions: DesignDecision[],
  log: DecisionLogEntry[],
): void {
  const dir = studyDir(study.id);
  ensureDir(dir);

  const frontmatter = [
    "---",
    `title: "${study.title.replace(/"/g, '\\"')}"`,
    `mode: ${study.mode}`,
    `confidentiality: ${study.confidentiality_mode}`,
    `status: ${study.status}`,
    `created_at: ${new Date(study.created_at * 1000).toISOString()}`,
    `updated_at: ${new Date(study.updated_at * 1000).toISOString()}`,
    "---",
    "",
  ].join("\n");

  const body: string[] = [
    `# ${study.title}`,
    "",
    study.research_question ? `**Research question:** ${study.research_question}` : "",
    "",
    "## Decision cards",
    "",
  ];
  for (const d of decisions) {
    const def = getCardDef(study.mode, d.card_type);
    const value = parseValue(d.value_json);
    body.push(`### ${def?.label ?? d.card_type}  _(${d.state}${d.stale ? ", stale" : ""})_`);
    if (value.value) body.push(value.value);
    for (const f of def?.requiredFields ?? []) {
      const v = value.fields?.[f.id];
      if (v) body.push(`- **${f.label}:** ${v}`);
    }
    if (d.open_question_md) body.push(`> Open question: ${d.open_question_md}`);
    body.push("");
  }

  fs.writeFileSync(path.join(dir, "study.md"), frontmatter + body.join("\n"), "utf-8");

  const logLines: string[] = ["# Decision log", ""];
  for (const entry of log) {
    const def = entry.card_type
      ? getCardDef(study.mode, entry.card_type)
      : undefined;
    logLines.push(
      `## ${new Date(entry.created_at * 1000).toISOString()} — ${def?.label ?? entry.card_type ?? "study"} (${entry.action})`,
    );
    if (entry.decision_md) logLines.push(`- **Decision:** ${entry.decision_md}`);
    if (entry.reason_md) logLines.push(`- **Reason:** ${entry.reason_md}`);
    if (entry.rejected_alternatives_md)
      logLines.push(`- **Rejected:** ${entry.rejected_alternatives_md}`);
    if (entry.open_concern_md)
      logLines.push(`- **Open concern:** ${entry.open_concern_md}`);
    logLines.push("");
  }
  fs.writeFileSync(path.join(dir, "decision-log.md"), logLines.join("\n"), "utf-8");
}

export function exportStudyArtifact(
  studyId: string,
  compiled: CompiledArtifact,
  overrideMd?: string | null,
): void {
  const dir = path.join(studyDir(studyId), "artifacts");
  ensureDir(dir);
  fs.writeFileSync(
    path.join(dir, `${compiled.kind}.md`),
    renderArtifactMarkdown(compiled, overrideMd),
    "utf-8",
  );
}

export function exportStudyDraftingPrompts(
  studyId: string,
  files: { agentsMd: string; draftMd: string },
): void {
  const dir = studyDir(studyId);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "AGENTS.md"), files.agentsMd, "utf-8");
  fs.writeFileSync(path.join(dir, "drafting-prompts.md"), files.draftMd, "utf-8");
}

export function readStudyDraftingPrompts(
  studyId: string,
): { agentsMd: string | null; draftMd: string | null } {
  const dir = studyDir(studyId);
  const read = (name: string): string | null => {
    const file = path.join(dir, name);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
  };
  return {
    agentsMd: read("AGENTS.md"),
    draftMd: read("drafting-prompts.md"),
  };
}
