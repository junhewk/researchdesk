import { listManuscripts, listLatestManuscriptsByStudyIds, getManuscript } from "./manuscripts";
import { getStudy, listStudies } from "./studies";
import { readStudyDraftingPrompts } from "./methods/studyExport";
import type {
  Manuscript,
  ManuscriptStatus,
  ProtocolConfidentialityMode,
  Study,
  StudyMode,
  StudyStatus,
} from "./types";

export type ProjectKind = "study" | "study_article" | "article";
export type ProjectStageKey = "setup" | "harness" | "article" | "review";
export type ProjectStageStatus = "ready" | "needs_input" | "missing" | "unavailable";

export interface ProjectStageState {
  key: ProjectStageKey;
  label: string;
  status: ProjectStageStatus;
  href: string | null;
  detail: string;
}

export interface ResearchProjectLinks {
  overview: string;
  setup: string | null;
  harness: string | null;
  article: string | null;
  review: string | null;
  corpus: string | null;
  prisma: string | null;
}

export interface ResearchProjectSummary {
  id: string;
  kind: ProjectKind;
  title: string;
  researchQuestion: string | null;
  mode: StudyMode | null;
  studyStatus: StudyStatus | null;
  manuscriptStatus: ManuscriptStatus | null;
  confidentialityMode: ProtocolConfidentialityMode;
  studyId: string | null;
  manuscriptId: string | null;
  createdAt: number;
  updatedAt: number;
  stages: Record<ProjectStageKey, ProjectStageState>;
  nextActionLabel: string;
  nextActionHref: string;
  links: ResearchProjectLinks;
}

export interface ResearchProjectDetail extends ResearchProjectSummary {
  study: Study | null;
  manuscript: Manuscript | null;
}

const STAGE_LABELS: Record<ProjectStageKey, string> = {
  setup: "Setup",
  harness: "Harness",
  article: "Article",
  review: "Review",
};

function projectLinks(projectId: string, study: Study | null, manuscript: Manuscript | null): ResearchProjectLinks {
  const hasStudy = Boolean(study);
  const hasArticle = Boolean(manuscript);
  return {
    overview: `/projects/${projectId}`,
    setup: hasStudy ? `/projects/${projectId}/setup` : null,
    harness: hasStudy ? `/projects/${projectId}/harness` : null,
    article: hasStudy || hasArticle ? `/projects/${projectId}/article` : null,
    review: hasArticle ? `/projects/${projectId}/review` : null,
    corpus: study?.mode === "scoping_review" ? `/projects/${projectId}/corpus` : null,
    prisma: study?.mode === "scoping_review" ? `/projects/${projectId}/prisma` : null,
  };
}

function buildStages(
  projectId: string,
  study: Study | null,
  manuscript: Manuscript | null,
): Record<ProjectStageKey, ProjectStageState> {
  const links = projectLinks(projectId, study, manuscript);
  const hasHarness = study ? Boolean(readStudyDraftingPrompts(study.id).agentsMd) : false;
  const reviewReady = Boolean(manuscript?.review_request?.trim());

  return {
    setup: {
      key: "setup",
      label: STAGE_LABELS.setup,
      status: study ? "ready" : "unavailable",
      href: links.setup,
      detail: study
        ? "Research setup and methodological decisions are available."
        : "This direct article has no linked research setup.",
    },
    harness: {
      key: "harness",
      label: STAGE_LABELS.harness,
      status: study ? (hasHarness ? "ready" : "needs_input") : "unavailable",
      href: links.harness,
      detail: study
        ? hasHarness
          ? "Article-writing harness has been generated."
          : "Generate the article-writing harness from the setup."
        : "Harness generation requires a research setup.",
    },
    article: {
      key: "article",
      label: STAGE_LABELS.article,
      status: manuscript ? "ready" : "missing",
      href: links.article,
      detail: manuscript
        ? "Written article text is linked to this project."
        : "Add the written article before review can run.",
    },
    review: {
      key: "review",
      label: STAGE_LABELS.review,
      status: manuscript ? (reviewReady ? "ready" : "needs_input") : "missing",
      href: links.review,
      detail: manuscript
        ? reviewReady
          ? "Review inputs are ready to run."
          : "Add a review focus and any supporting material."
        : "Review starts after the article exists.",
    },
  };
}

function nextAction(
  stages: Record<ProjectStageKey, ProjectStageState>,
  links: ResearchProjectLinks,
): { label: string; href: string } {
  if (stages.harness.status === "needs_input" && links.harness) {
    return { label: "Create harness", href: links.harness };
  }
  if (stages.article.status === "missing" && links.article) {
    return { label: "Add article", href: links.article };
  }
  if (stages.review.status === "needs_input" && links.review) {
    return { label: "Prepare review", href: links.review };
  }
  if (links.review) return { label: "Open review", href: links.review };
  if (links.setup) return { label: "Open setup", href: links.setup };
  return { label: "Open project", href: links.overview };
}

function fromRows(study: Study | null, manuscript: Manuscript | null): ResearchProjectDetail {
  const id = study?.id ?? manuscript!.id;
  const links = projectLinks(id, study, manuscript);
  const stages = buildStages(id, study, manuscript);
  const action = nextAction(stages, links);
  const createdAt = Math.min(
    study?.created_at ?? Number.POSITIVE_INFINITY,
    manuscript?.created_at ?? Number.POSITIVE_INFINITY,
  );
  const updatedAt = Math.max(study?.updated_at ?? 0, manuscript?.updated_at ?? 0);

  return {
    id,
    kind: study && manuscript ? "study_article" : study ? "study" : "article",
    title: study?.title ?? manuscript!.title,
    researchQuestion: study?.research_question ?? null,
    mode: study?.mode ?? null,
    studyStatus: study?.status ?? null,
    manuscriptStatus: manuscript?.status ?? null,
    confidentialityMode:
      study?.confidentiality_mode ?? manuscript?.confidentiality_mode ?? "cloud_default",
    studyId: study?.id ?? null,
    manuscriptId: manuscript?.id ?? null,
    createdAt: Number.isFinite(createdAt) ? createdAt : updatedAt,
    updatedAt,
    stages,
    nextActionLabel: action.label,
    nextActionHref: action.href,
    links,
    study,
    manuscript,
  };
}

export function listResearchProjects(opts?: { limit?: number }): ResearchProjectSummary[] {
  const limit = opts?.limit ?? 200;
  const studies = listStudies({ limit });
  const manuscriptsByStudy = listLatestManuscriptsByStudyIds(studies.map((study) => study.id));
  const studyProjects = studies.map((study) => fromRows(study, manuscriptsByStudy.get(study.id) ?? null));

  const directArticles = listManuscripts({ limit })
    .filter((manuscript) => !manuscript.study_id)
    .map((manuscript) => fromRows(null, manuscript));

  return [...studyProjects, ...directArticles]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function getResearchProject(id: string): ResearchProjectDetail | null {
  const study = getStudy(id);
  if (study) {
    return fromRows(study, listManuscripts({ studyId: study.id, limit: 1 })[0] ?? null);
  }

  const manuscript = getManuscript(id);
  if (!manuscript) return null;
  if (manuscript.study_id) {
    const sourceStudy = getStudy(manuscript.study_id);
    return sourceStudy ? fromRows(sourceStudy, manuscript) : fromRows(null, manuscript);
  }
  return fromRows(null, manuscript);
}

export function projectIdForManuscript(manuscript: Pick<Manuscript, "id" | "study_id">): string {
  return manuscript.study_id ?? manuscript.id;
}
