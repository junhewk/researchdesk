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
