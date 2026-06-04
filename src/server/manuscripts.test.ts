import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  autoProvisionedRoot,
  gitCleanTree,
  shouldUseGitProtection,
} from "./manuscripts";

function git(cwd: string, args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Reviewer Agent Test",
      "-c",
      "user.email=reviewer-agent-test@example.com",
      ...args,
    ],
    { cwd, stdio: "ignore" },
  );
}

test("auto-provisioned project roots are snapshot-backed", () => {
  const previous = process.env.REVIEWER_DATA_DIR;
  const dataDir = mkdtempSync(path.join(tmpdir(), "reviewer-agent-data-"));
  process.env.REVIEWER_DATA_DIR = dataDir;
  try {
    const root = autoProvisionedRoot("ms-auto");
    assert.equal(shouldUseGitProtection("ms-auto", root), false);
  } finally {
    if (previous === undefined) delete process.env.REVIEWER_DATA_DIR;
    else process.env.REVIEWER_DATA_DIR = previous;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("gitCleanTree ignores dirty files outside the linked project folder", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "reviewer-agent-repo-"));
  try {
    git(repo, ["init"]);
    mkdirSync(path.join(repo, "project"));
    writeFileSync(path.join(repo, "README.md"), "root\n");
    writeFileSync(path.join(repo, "project", "manuscript.md"), "tracked\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "init"]);

    writeFileSync(path.join(repo, "outside.md"), "untracked outside project\n");
    assert.equal(gitCleanTree(path.join(repo, "project")), true);

    writeFileSync(path.join(repo, "project", "manuscript.md"), "changed\n");
    assert.equal(gitCleanTree(path.join(repo, "project")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
