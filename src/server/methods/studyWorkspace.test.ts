import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { closeDb } from "../db";

// Each test runs against a fresh temp DB so migrations + seeding are exercised.
async function withTempDb<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.REVIEWER_DATA_DIR;
  const dir = mkdtempSync(path.join(tmpdir(), "reviewer-study-"));
  process.env.REVIEWER_DATA_DIR = dir;
  // db.ts memoizes the connection on globalThis; clear it so each test gets
  // its own temp database.
  closeDb();
  try {
    return await fn();
  } finally {
    closeDb();
    if (previous === undefined) delete process.env.REVIEWER_DATA_DIR;
    else process.env.REVIEWER_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

function loadFixture(name: string) {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), "test/fixtures/methods", name), "utf-8"),
  );
}

test("creating a study seeds the observational card set; preflight is pure", async () => {
  await withTempDb(async () => {
    const { createStudy, listDecisions } = await import("../studies");
    const { runDeterministicPreflight } = await import("./preflight");
    const study = createStudy({
      title: "Early vasopressors and 30-day mortality",
      mode: "retrospective_observational",
      research_question: "Does early vasopressor use reduce 30-day mortality?",
    });
    const decisions = listDecisions(study.id);
    assert.equal(decisions.length, 18);
    assert.ok(decisions.every((d) => d.state === "not_started"));

    const report = runDeterministicPreflight({ study, decisions });
    assert.equal(report.readyPct, 0);
    assert.ok(report.findings.length > 0, "expected completeness findings");
    assert.ok(report.nextBestAction, "expected a next best action");
  });
});

test("study creation rejects attempts to import an existing manuscript", async () => {
  await withTempDb(async () => {
    const { createManuscript, getManuscript } = await import("../manuscripts");
    const { POST } = await import("../../app/api/studies/route");
    const manuscript = createManuscript({
      title: "AI education manuscript",
      content_md: "Draft text about AI education in shared decision medicine.",
      research_domain: "medical education",
      research_type: "review",
    });

    const response = await POST(
      new Request("http://localhost/api/studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: manuscript.title,
          mode: "scoping_review",
          research_question: "How is AI used for education in shared decision medicine?",
          source_manuscript_id: manuscript.id,
        }),
      }) as never,
    );

    assert.equal(response.status, 400);
    assert.equal(getManuscript(manuscript.id)?.study_id, null);
  });
});

test("article creation from a study is the forward workbench bridge", async () => {
  await withTempDb(async () => {
    const { listManuscripts } = await import("../manuscripts");
    const { createStudy } = await import("../studies");
    const { createArticleFromStudy } = await import("../studyArticle");
    const study = createStudy({
      title: "AI education scoping review",
      mode: "scoping_review",
      research_question: "How is AI used for education in shared decision medicine?",
    });

    const result = createArticleFromStudy(study.id);
    const linked = listManuscripts({ studyId: study.id, limit: 5 });
    const reused = createArticleFromStudy(study.id);

    assert.equal(result.created, true);
    assert.equal(result.manuscript.study_id, study.id);
    assert.equal(result.links.article, `/my-articles/${result.manuscript.id}`);
    assert.equal(result.links.workspace, `/my-articles/${result.manuscript.id}/workspace`);
    assert.equal(result.links.sourceStudy, `/methods-workbench/${study.id}`);
    assert.equal(linked.length, 1);
    assert.equal(reused.created, false);
    assert.equal(reused.manuscript.id, result.manuscript.id);
  });
});

test("workbench import options show linked and unlinked article reviews", async () => {
  await withTempDb(async () => {
    const { createStudy } = await import("../studies");
    const {
      createArticleFromStudy,
      listStudyArticleImportOptions,
    } = await import("../studyArticle");
    const linkedStudy = createStudy({
      title: "Linked scoping review",
      mode: "scoping_review",
    });
    const unlinkedStudy = createStudy({
      title: "Unlinked clinical trial",
      mode: "interventional",
    });
    const article = createArticleFromStudy(linkedStudy.id);

    const options = listStudyArticleImportOptions({ limit: 10 });
    const linked = options.find((option) => option.study.id === linkedStudy.id);
    const unlinked = options.find((option) => option.study.id === unlinkedStudy.id);

    assert.equal(linked?.manuscript?.id, article.manuscript.id);
    assert.equal(linked?.links.workspace, `/my-articles/${article.manuscript.id}/workspace`);
    assert.equal(linked?.links.sourceStudy, `/methods-workbench/${linkedStudy.id}`);
    assert.equal(unlinked?.manuscript, null);
    assert.equal(unlinked?.links.workspace, null);
  });
});

test("public manuscript creation refuses direct study links", async () => {
  await withTempDb(async () => {
    const { listManuscripts } = await import("../manuscripts");
    const { createStudy } = await import("../studies");
    const { POST } = await import("../../app/api/manuscripts/route");
    const study = createStudy({
      title: "Source Workbench",
      mode: "systematic_review",
    });

    const response = await POST(
      new Request("http://localhost/api/manuscripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          study_id: study.id,
          title: "Direct link attempt",
          content_md: "This should not create a linked article review.",
        }),
      }) as never,
    );

    assert.equal(response.status, 400);
    assert.equal(listManuscripts({ studyId: study.id, limit: 5 }).length, 0);
  });
});

test("deterministic extraction materializes evidence from an MDR digest", async () => {
  await withTempDb(async () => {
    const { createStudy, createSnapshot, listEvidenceItems } = await import("../studies");
    const { extractFromSnapshot } = await import("./evidence");
    const study = createStudy({
      title: "Septic shock cohort",
      mode: "retrospective_observational",
    });
    const fx = loadFixture("mdr-septic-shock.json");
    const snapshot = createSnapshot({
      study_id: study.id,
      source: "mdr",
      raw_json: JSON.stringify(fx),
    });
    const items = extractFromSnapshot(snapshot);
    assert.ok(items.length >= 10, `expected >=10 items, got ${items.length}`);
    const outcomes = listEvidenceItems(study.id, "outcome");
    assert.ok(
      outcomes.some((o) => o.label.includes("28-day mortality")),
      "expected 28-day mortality among extracted outcomes",
    );
  });
});

test("mapped records CSV seeds decisions from arbitrary category columns", async () => {
  await withTempDb(async () => {
    const { createStudy } = await import("../studies");
    const { importScopingCsvWithMapping, recordStats, listRecords } = await import("./reviewCorpus");
    const study = createStudy({ title: "Scoping", mode: "scoping_review" });
    const csv = [
      "Article ID,Name,Category,Reason,Flag",
      "1,AI tutor for SDM,Core,Direct education,Y",
      "2,Clinical decision support,Reserve,Clinician support,N",
      "3,Off-topic prediction,No,No education,N",
    ].join("\n");

    importScopingCsvWithMapping(study.id, "records.csv", csv, {
      fields: {
        external_id: "Article ID",
        title: "Name",
        screen_tier: "Category",
        screen_reason: "Reason",
      },
      decision: {
        column: "Category",
        values: {
          Core: "include",
          Reserve: "maybe",
          No: "exclude",
        },
        default_decision: "unscreened",
      },
      needs_review: { column: "Flag", true_values: ["Y"] },
      confidence: "high",
      rationale_md: "test mapping",
      warnings: [],
    });

    const stats = recordStats(study.id);
    assert.equal(stats.include, 1);
    assert.equal(stats.maybe, 1);
    assert.equal(stats.exclude, 1);
    assert.equal(stats.unscreened, 0);
    assert.equal(stats.needs_review, 1);

    const records = listRecords(study.id, { limit: 10 }).records;
    assert.equal(records[0].screen_tier, "Core");
    assert.equal(records[0].decision_reason, "Imported from Category: Core");
  });
});

test("mapped records CSV does not overwrite confirmed decisions by default", async () => {
  await withTempDb(async () => {
    const { createStudy } = await import("../studies");
    const { importScopingCsvWithMapping, listRecords, patchRecord, recordStats } = await import("./reviewCorpus");
    const study = createStudy({ title: "Scoping", mode: "scoping_review" });
    const mapping = {
      fields: { external_id: "ID", title: "Title" },
      decision: {
        column: "Disposition",
        values: { Keep: "include" as const, Drop: "exclude" as const },
        default_decision: "unscreened" as const,
      },
      needs_review: { column: null, true_values: ["Y"] },
      confidence: "high" as const,
      rationale_md: "",
      warnings: [],
    };

    importScopingCsvWithMapping(
      study.id,
      "records.csv",
      ["ID,Title,Disposition", "1,First,Keep", "2,Second,Keep"].join("\n"),
      mapping,
    );
    const first = listRecords(study.id, { limit: 10 }).records[0];
    patchRecord(first.id, { decision: "maybe", user_confirmed: true });

    importScopingCsvWithMapping(
      study.id,
      "records.csv",
      ["ID,Title,Disposition", "1,First,Drop", "2,Second,Drop"].join("\n"),
      mapping,
    );

    const records = listRecords(study.id, { limit: 10 }).records;
    assert.equal(records.find((r) => r.external_id === "1")?.decision, "maybe");
    assert.equal(records.find((r) => r.external_id === "2")?.decision, "exclude");
    const stats = recordStats(study.id);
    assert.equal(stats.maybe, 1);
    assert.equal(stats.exclude, 1);
  });
});

test("proposal seeds are grounded in triage input and imported evidence", async () => {
  await withTempDb(async () => {
    const {
      createStudy,
      createSnapshot,
      listDecisions,
      listEvidenceItems,
    } = await import("../studies");
    const { extractFromSnapshot } = await import("./evidence");
    const { buildSeedProposalOptions } = await import("./proposals");
    const study = createStudy({
      title: "Septic shock cohort",
      mode: "retrospective_observational",
      research_question:
        "Does early vasopressor use reduce 30-day mortality in adults with septic shock?",
    });
    const fx = loadFixture("mdr-septic-shock.json");
    const snapshot = createSnapshot({
      study_id: study.id,
      source: "mdr",
      raw_json: JSON.stringify(fx),
    });
    extractFromSnapshot(snapshot);

    const clinical = buildSeedProposalOptions({
      study,
      decisions: listDecisions(study.id),
      evidence: listEvidenceItems(study.id),
      cardType: "clinical_question",
    });
    assert.ok(
      clinical.some((o) => o.value_suggestion === study.research_question),
      "expected the user-entered research question as a pickable option",
    );

    const outcome = buildSeedProposalOptions({
      study,
      decisions: listDecisions(study.id),
      evidence: listEvidenceItems(study.id),
      cardType: "outcome",
    });
    assert.ok(
      outcome.some((o) => o.value_suggestion === "28-day mortality"),
      "expected imported outcome labels as pickable options",
    );
  });
});

test("proposal options persist field-level suggestions", async () => {
  await withTempDb(async () => {
    const {
      createStudy,
      createProposalOption,
      listProposalOptions,
    } = await import("../studies");
    const study = createStudy({
      title: "AI education scoping review",
      mode: "scoping_review",
    });
    createProposalOption({
      study_id: study.id,
      card_type: "eligibility_criteria",
      label: "Medical students using generative AI",
      value_suggestion: "Generative AI use in medical education settings",
      fields_suggestion: {
        inclusion: "Studies of generative AI tools used for health-professions education.",
        exclusion: "Non-educational AI decision-support studies and non-health education settings.",
        sources: "Peer-reviewed studies, conference papers, and relevant grey literature.",
      },
      consequence_md:
        "Matches the scoping-review question while keeping source types explicit.",
    });

    const [option] = listProposalOptions(study.id, "eligibility_criteria");
    assert.deepEqual(option.fields_suggestion, {
      inclusion: "Studies of generative AI tools used for health-professions education.",
      exclusion: "Non-educational AI decision-support studies and non-health education settings.",
      sources: "Peer-reviewed studies, conference papers, and relevant grey literature.",
    });
  });
});

test("a manual decision writes exactly one log row and clears its own stale flag", async () => {
  await withTempDb(async () => {
    const { createStudy, getDecision, listDecisionLog } = await import("../studies");
    const { setCard } = await import("./cardService");
    const study = createStudy({ title: "S", mode: "retrospective_observational" });

    setCard(study.id, "outcome", {
      value: "30-day all-cause mortality",
      fields: {
        outcome: "all-cause death",
        timepoint: "30 days",
        ascertainment: "linked death registry",
      },
    });
    const card = getDecision(study.id, "outcome");
    assert.ok(card && card.state === "drafted", `state was ${card?.state}`);
    const logForOutcome = listDecisionLog(study.id).filter(
      (e) => e.card_type === "outcome",
    );
    assert.equal(logForOutcome.length, 1);
  });
});

test("changing an upstream card marks downstream cards stale", async () => {
  await withTempDb(async () => {
    const { createStudy, getDecision } = await import("../studies");
    const { setCard } = await import("./cardService");
    const study = createStudy({ title: "S", mode: "retrospective_observational" });

    // cohort_entry is upstream of outcome (outcome.dependsOn includes cohort_entry).
    setCard(study.id, "cohort_entry", {
      value: "first ICU admission meeting Sepsis-3",
      fields: { index_date: "first Sepsis-3", entry_rule: "ICU admission" },
    });
    setCard(study.id, "outcome", {
      value: "30-day mortality",
      fields: { outcome: "death", timepoint: "30d", ascertainment: "registry" },
    });
    assert.equal(getDecision(study.id, "outcome")?.stale, false);

    // Change the upstream card → downstream outcome should be flagged stale.
    setCard(study.id, "cohort_entry", { value: "first qualifying lactate >2" });
    assert.equal(getDecision(study.id, "outcome")?.stale, true);
  });
});

test("artifact ready_pct is recomputed from card states", async () => {
  await withTempDb(async () => {
    const { createStudy, listDecisions } = await import("../studies");
    const { setCard } = await import("./cardService");
    const { compileArtifact } = await import("./artifacts");
    const study = createStudy({ title: "S", mode: "retrospective_observational" });

    const before = compileArtifact(study, listDecisions(study.id), "protocol");
    assert.equal(before.ready_pct, 0);

    setCard(study.id, "clinical_question", {
      value: "Does X reduce Y?",
      fields: { question: "X→Y", hypothesis: "X reduces Y" },
    });
    const after = compileArtifact(study, listDecisions(study.id), "protocol");
    assert.ok(after.ready_pct > 0, "ready_pct should rise after a card is ready");
  });
});

test("a local_only study refuses a cloud provider for agent passes", async () => {
  await withTempDb(async () => {
    const { createStudy } = await import("../studies");
    const { getStudySupervisor } = await import("./studySessions");
    const study = createStudy({
      title: "Confidential",
      mode: "retrospective_observational",
      confidentiality_mode: "local_only",
    });
    const sup = getStudySupervisor();
    assert.throws(
      () =>
        sup.createSession({
          studyId: study.id,
          pass: "card_proposal",
          provider: "openai",
        }),
      /local_only/,
    );
    // The local provider is allowed.
    assert.doesNotThrow(() =>
      sup.createSession({
        studyId: study.id,
        pass: "card_proposal",
        provider: "llama_server",
      }),
    );
  });
});

test("resolveManuscriptProvider keeps a local_only article on a local backend", async () => {
  await withTempDb(async () => {
    const { resolveManuscriptProvider, isLocalApiProvider, DEFAULT_LOCAL_API_PROVIDER } =
      await import("../apiAgent/providers");

    // local_only: an explicit cloud provider is coerced to a local backend.
    assert.equal(resolveManuscriptProvider("openai", true, true), DEFAULT_LOCAL_API_PROVIDER);
    // local_only with no provider supplied still lands on a local backend.
    assert.ok(isLocalApiProvider(resolveManuscriptProvider(undefined, false, true)));
    // local_only: an explicit local provider is preserved.
    assert.equal(resolveManuscriptProvider("lmstudio", true, true), "lmstudio");
    // cloud_default: an explicit cloud provider is left untouched.
    assert.equal(resolveManuscriptProvider("openai", true, false), "openai");
  });
});

test("promoting a local_only study yields a local_only article that refuses cloud sessions", async () => {
  await withTempDb(async () => {
    const { createStudy } = await import("../studies");
    const { createArticleFromStudy } = await import("../studyArticle");
    const { getManuscript } = await import("../manuscripts");
    const { getOrCreateManuscriptSession } = await import("../sessionQueries");

    const study = createStudy({
      title: "Local scoping",
      mode: "scoping_review",
      confidentiality_mode: "local_only",
    });
    const { manuscript } = createArticleFromStudy(study.id);

    // The promoted article carries the study's confidentiality intent.
    assert.equal(manuscript.confidentiality_mode, "local_only");
    assert.equal(getManuscript(manuscript.id)?.confidentiality_mode, "local_only");

    // A cloud provider is refused for the promoted article's session...
    await assert.rejects(
      () => getOrCreateManuscriptSession(manuscript.id, { provider: "openai" }),
      /local_only/,
    );
    // ...while a local provider opens a session.
    const session = await getOrCreateManuscriptSession(manuscript.id, { provider: "ollama" });
    assert.equal(session.provider, "ollama");
  });
});

test("a cloud_default article accepts a cloud session provider", async () => {
  await withTempDb(async () => {
    const { createManuscript } = await import("../manuscripts");
    const { getOrCreateManuscriptSession } = await import("../sessionQueries");

    const manuscript = createManuscript({ title: "Own article", content_md: "# Draft" });
    assert.equal(manuscript.confidentiality_mode, "cloud_default");

    const session = await getOrCreateManuscriptSession(manuscript.id, { provider: "openai" });
    assert.equal(session.provider, "openai");
  });
});
