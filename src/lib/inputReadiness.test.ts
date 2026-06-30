import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewInputs,
  buildReviewSetupInputs,
  buildWorkbenchInputs,
  buildWorkbenchSetupInputs,
  mentionedAssetKinds,
  summarizeInputReadiness,
} from "./inputReadiness";
import type {
  Commentary,
  Manuscript,
  ManuscriptAssetSummary,
} from "@/server/types";

test("workbench setup marks title and mode as required", () => {
  const items = buildWorkbenchSetupInputs({
    title: "",
    mode: null,
    researchQuestion: "Does X improve Y?",
  });
  const summary = summarizeInputReadiness(items);
  assert.equal(summary.missingRequired, 2);
  assert.equal(
    items.find((item) => item.id === "research-question")?.status,
    "present",
  );
});

test("workbench scoping review requires search and records imports", () => {
  const items = buildWorkbenchInputs({
    studyId: "st_1",
    mode: "scoping_review",
    evidenceCount: 0,
    corpus: { searches: 0, records: 0, confirmed: 0, needs_review: 0 },
    cards: [
      {
        card_type: "review_question",
        label: "Review question",
        stage: "Question",
        state: "drafted",
        stale: false,
        requiredFields: [{ id: "population", label: "Population" }],
        value: { value: "Question", fields: { population: "Adults" } },
      },
    ],
  });
  assert.equal(
    items.find((item) => item.id === "search-process-csv")?.status,
    "missing",
  );
  assert.equal(
    items.find((item) => item.id === "records-csv")?.status,
    "missing",
  );
});

test("review setup requires manuscript title and focus", () => {
  const items = buildReviewSetupInputs({
    entries: [{ kind: "manuscript", extracted: { title: "Draft" } }],
    title: "Draft",
    researchDomain: "",
    journalType: "",
    researchType: "",
    reviewRequest: "",
  });
  assert.equal(
    items.find((item) => item.id === "manuscript-file")?.status,
    "present",
  );
  assert.equal(
    items.find((item) => item.id === "review-focus")?.status,
    "missing",
  );
});

test("review inputs suggest missing referenced assets", () => {
  const manuscript: Manuscript = {
    id: "ms_1",
    study_id: null,
    title: "Draft",
    content_md: "Results are shown in Figure 1 and Table 2.",
    original_content_md: null,
    original_file: "draft.md",
    file_format: "md",
    journal_type: "Journal",
    research_domain: "Education",
    research_type: "empirical",
    review_request: "General pre-submission review.",
    project_root: null,
    primary_file: null,
    is_git: false,
    status: "draft",
    created_at: 1,
    updated_at: 1,
  };
  const assets: ManuscriptAssetSummary[] = [
    {
      id: "ma_1",
      manuscript_id: "ms_1",
      kind: "figure",
      label: null,
      original_file: "figure1.md",
      file_format: "md",
      byte_size: 10,
      version_number: null,
      position: 0,
      created_at: 1,
      updated_at: 1,
    },
  ];
  const items = buildReviewInputs({
    manuscript,
    assets,
    commentaries: [] as Commentary[],
  });
  assert.deepEqual(mentionedAssetKinds(manuscript.content_md), [
    "figure",
    "table",
  ]);
  assert.match(
    items.find((item) => item.id === "mentioned-assets")?.detail ?? "",
    /table/,
  );
});
