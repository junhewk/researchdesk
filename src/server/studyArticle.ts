import {
  autoProvisionProjectFolder,
  createManuscript,
  listLatestManuscriptsByStudyIds,
  listManuscripts,
  replaceUneditedGeneratedContent,
} from "@/server/manuscripts";
import { createAsset, listAssets } from "@/server/manuscriptAssets";
import { getModeSchema } from "@/server/methods/cardSchema";
import {
  ALL_ARTIFACT_KINDS,
  compileArtifact,
  renderArtifactMarkdown,
} from "@/server/methods/artifacts";
import { parseValue } from "@/server/methods/preflight";
import {
  getOrCreateArtifact,
  getStudy,
  listStudies,
  listDecisions,
  updateArtifact,
} from "@/server/studies";
import { readStudyDraftingPrompts } from "@/server/methods/studyExport";
import type {
  DesignDecision,
  Manuscript,
  Study,
  StudyArtifactKind,
} from "@/server/types";

export interface StudyArticleResult {
  manuscript: Manuscript;
  created: boolean;
  links: {
    article: string;
    workspace: string;
    sourceStudy: string;
  };
}

export interface StudyArticleImportOption {
  study: Pick<
    Study,
    | "id"
    | "title"
    | "mode"
    | "research_question"
    | "status"
    | "confidentiality_mode"
    | "created_at"
    | "updated_at"
  >;
  manuscript: Pick<Manuscript, "id" | "title" | "status" | "updated_at"> | null;
  links: {
    sourceStudy: string;
    article: string | null;
    workspace: string | null;
  };
}

const MODE_RESEARCH_TYPE: Record<Study["mode"], string> = {
  systematic_review: "systematic-review",
  scoping_review: "scoping-review",
  retrospective_observational: "retrospective-observational",
  interventional: "randomized-trial",
};

const MODE_DOMAIN: Record<Study["mode"], string> = {
  systematic_review: "evidence synthesis",
  scoping_review: "evidence synthesis",
  retrospective_observational: "clinical epidemiology",
  interventional: "clinical trial",
};

function valueOf(
  byType: Map<string, DesignDecision>,
  cardType: string,
): { value: string; fields: Record<string, string> } {
  const parsed = parseValue(byType.get(cardType)?.value_json ?? null);
  return {
    value: parsed.value?.trim() ?? "",
    fields: parsed.fields ?? {},
  };
}

function bulletLines(fields: Record<string, string>): string[] {
  return Object.entries(fields)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `- **${key.replaceAll("_", " ")}:** ${value.trim()}`);
}

function draftTitle(study: Study): string {
  if (study.mode === "systematic_review") {
    return `${study.title.replace(/\s*\([^)]*\)\s*$/, "")}: systematic review protocol`;
  }
  if (study.mode === "scoping_review") {
    return `${study.title.replace(/\s*\([^)]*\)\s*$/, "")}: scoping review protocol`;
  }
  if (study.mode === "retrospective_observational") {
    return `${study.title}: retrospective cohort study`;
  }
  return `${study.title}: study manuscript draft`;
}

function genericStudyDraft(
  study: Study,
  decisions: DesignDecision[],
): string {
  const schema = getModeSchema(study.mode);
  const byType = new Map(decisions.map((decision) => [decision.card_type, decision]));
  const sections = schema.cards.map((card) => {
    const value = valueOf(byType, card.key);
    return [
      `### ${card.label}`,
      value.value || "_Not specified yet._",
      ...bulletLines(value.fields),
    ].join("\n");
  });

  return [
    `# ${draftTitle(study)}`,
    "",
    `> Generated from Methods Workbench study \`${study.id}\`. Treat this as a structured article draft; expand narrative sections and fill Results when data are available.`,
    "",
    "## Abstract",
    `**Objective:** ${study.research_question ?? "To be completed."}`,
    "**Methods:** The design decisions below were promoted from Methods Workbench.",
    "**Results:** To be completed.",
    "**Conclusions:** To be completed.",
    "",
    "## Introduction",
    "_Add the clinical or methodological rationale here._",
    "",
    "## Methods",
    ...sections,
    "",
    "## Results",
    "_Pending data collection or analysis._",
    "",
    "## Discussion",
    "_Interpret findings against the pre-specified design decisions._",
    "",
    "## Declarations",
    "**Funding:** _To be added._",
    "**Competing interests:** _To be added._",
    "**Data availability:** _To be added._",
  ].join("\n");
}

function buildDraft(study: Study, decisions: DesignDecision[]): string {
  return genericStudyDraft(study, decisions);
}

function artifactFilename(kind: StudyArtifactKind): string {
  return `methods-${kind.replaceAll("_", "-")}.md`;
}

function attachArtifacts(study: Study, manuscriptId: string, decisions: DesignDecision[]): void {
  for (const kind of ALL_ARTIFACT_KINDS) {
    const compiled = compileArtifact(study, decisions, kind);
    const stored = getOrCreateArtifact(study.id, kind);
    updateArtifact(study.id, kind, {
      compiled_json: JSON.stringify(compiled),
      ready_pct: compiled.ready_pct,
    });
    const md = renderArtifactMarkdown(compiled, stored.override_md);
    createAsset({
      manuscriptId,
      kind: "appendix",
      label: `Methods Workbench - ${compiled.title}`,
      original_file: artifactFilename(kind),
      file_format: "markdown",
      content_md: md,
    });
  }
}

function attachLatestHarness(studyId: string, manuscriptId: string): void {
  const files = readStudyDraftingPrompts(studyId);
  if (!files.agentsMd) return;
  const alreadyAttached = listAssets(manuscriptId).some(
    (asset) => asset.original_file === "AGENTS.md" && asset.label === "Article-writing harness",
  );
  if (alreadyAttached) return;
  createAsset({
    manuscriptId,
    kind: "appendix",
    label: "Article-writing harness",
    original_file: "AGENTS.md",
    file_format: "markdown",
    content_md: files.agentsMd,
  });
}

export function listStudyArticleImportOptions(opts?: {
  limit?: number;
}): StudyArticleImportOption[] {
  const studies = listStudies({ limit: opts?.limit ?? 100 });
  const manuscriptsByStudy = listLatestManuscriptsByStudyIds(studies.map((study) => study.id));
  return studies.map((study) => {
    const manuscript = manuscriptsByStudy.get(study.id) ?? null;
    return {
      study: {
        id: study.id,
        title: study.title,
        mode: study.mode,
        research_question: study.research_question,
        status: study.status,
        confidentiality_mode: study.confidentiality_mode,
        created_at: study.created_at,
        updated_at: study.updated_at,
      },
      manuscript: manuscript
        ? {
            id: manuscript.id,
            title: manuscript.title,
            status: manuscript.status,
            updated_at: manuscript.updated_at,
          }
        : null,
      links: {
        sourceStudy: `/projects/${study.id}/setup`,
        article: manuscript ? `/projects/${study.id}/article` : null,
        workspace: manuscript ? `/projects/${study.id}/article` : null,
      },
    };
  });
}

export function createArticleFromStudy(
  studyId: string,
  opts: { reuseExisting?: boolean } = {},
): StudyArticleResult {
  const study = getStudy(studyId);
  if (!study) throw new Error("study not found");

  if (opts.reuseExisting !== false) {
    const existing = listManuscripts({ studyId, limit: 1 })[0];
    if (existing) {
      const generatedByThisStudy =
        existing.original_file === `methods-workbench-${study.id}.md` &&
        existing.review_request?.startsWith(
          `Draft generated from Methods Workbench study ${study.id}.`,
        );
      const manuscript = generatedByThisStudy
        ? replaceUneditedGeneratedContent(
            existing.id,
            buildDraft(study, listDecisions(study.id)),
          ) ?? existing
        : existing;
      attachLatestHarness(study.id, manuscript.id);
      return {
        manuscript,
        created: false,
        links: {
          article: `/projects/${study.id}/article`,
          workspace: `/projects/${study.id}/article`,
          sourceStudy: `/projects/${study.id}/setup`,
        },
      };
    }
  }

  const decisions = listDecisions(study.id);
  const draft = buildDraft(study, decisions);
  const manuscript = createManuscript({
    study_id: study.id,
    title: draftTitle(study),
    content_md: draft,
    original_file: `methods-workbench-${study.id}.md`,
    file_format: "markdown",
    research_domain: MODE_DOMAIN[study.mode],
    research_type: MODE_RESEARCH_TYPE[study.mode],
    // Carry the study's confidentiality intent onto the article so a
    // local_only study's promoted review stays off cloud providers.
    confidentiality_mode: study.confidentiality_mode,
    review_request:
      `Draft generated from Methods Workbench study ${study.id}. ` +
      "Expand the manuscript while preserving the pre-specified design decisions.",
  });

  attachArtifacts(study, manuscript.id, decisions);
  attachLatestHarness(study.id, manuscript.id);
  const linked = autoProvisionProjectFolder(manuscript.id);

  return {
    manuscript: linked,
    created: true,
    links: {
      article: `/projects/${study.id}/article`,
      workspace: `/projects/${study.id}/article`,
      sourceStudy: `/projects/${study.id}/setup`,
    },
  };
}
