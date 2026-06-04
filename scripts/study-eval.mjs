// Live UI eval of the Methods Workbench affordances (septic-shock cohort).
// Drives a real headless browser through prod (3871) and screenshots each step.
// Usage: node scripts/study-eval.mjs
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.EVAL_BASE || "http://localhost:3871";
const OUT = "/tmp/study-eval2";
mkdirSync(OUT, { recursive: true });

let n = 0;
async function shot(page, name) {
  n += 1;
  const file = path.join(OUT, `${String(n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("shot " + file);
}

const mdr = readFileSync("test/fixtures/methods/mdr-septic-shock.json", "utf-8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1180 } });
page.setDefaultTimeout(30000);

try {
  // 1) Triage
  await page.goto(`${BASE}/methods/new`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/Early vasopressors/i).waitFor();
  await page.getByPlaceholder(/Early vasopressors/i).fill(
    "Early vasopressors and 30-day mortality in septic shock",
  );
  await page
    .getByPlaceholder(/What are you trying to find out/i)
    .fill("Does early vasopressor use reduce 30-day mortality in adults with septic shock?");
  await page.getByText("Analyzing patient-level data").click();
  await shot(page, "triage");

  // 2) Canvas — grouped stages, progress rail, Next CTA
  await page.getByRole("button", { name: /Build the canvas/i }).click();
  await page.waitForURL(/\/methods\/st_/);
  const studyId = page.url().split("/methods/")[1];
  console.log("study", studyId);
  await page.waitForSelector("text=Question & data source");
  await shot(page, "canvas-stages");

  // 3) Import MDR snapshot
  await page.getByRole("button", { name: "+ Import" }).click();
  await page.waitForSelector("text=Import evidence snapshot");
  await page.locator("div.fixed.inset-0 textarea").fill(mdr);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.waitForSelector("text=28-day mortality", { timeout: 20000 });
  await shot(page, "evidence-extracted");

  // 4) Evidence "+ Add to card" menu
  try {
    const label = page.getByText("28-day mortality", { exact: true }).first();
    await label.locator('xpath=following-sibling::button[1]').click();
    await page.waitForSelector("text=Add to card");
    await shot(page, "evidence-add-menu");
    await page.locator("div.z-40").getByText("Outcome definition").click();
    await page.waitForTimeout(1200);
    await shot(page, "evidence-linked");
  } catch (e) {
    console.log("evidence-menu step:", e.message);
  }

  // 5) Inline-edit the Outcome card (no Edit button; autosaves on blur)
  const oc = page.locator("#card-outcome");
  await oc.scrollIntoViewIfNeeded();
  if (!(await oc.locator("textarea").isVisible().catch(() => false))) {
    await oc.locator("button").first().click();
  }
  await oc.locator("textarea").fill("30-day all-cause mortality");
  const inputs = oc.locator("input");
  await inputs.nth(0).fill("all-cause death");
  await inputs.nth(1).fill("30 days post index");
  await inputs.nth(2).fill("linked national death registry");
  await shot(page, "outcome-inline-edit");
  await page.keyboard.press("Tab"); // blur -> autosave
  await page.waitForTimeout(1500);
  await shot(page, "outcome-set");

  // 6) Propose options -> "Use this" pre-fill (cloud)
  try {
    const cq = page.locator("#card-clinical_question");
    await cq.scrollIntoViewIfNeeded();
    if (!(await cq.locator("textarea").isVisible().catch(() => false))) {
      await cq.locator("button").first().click();
    }
    await cq.getByRole("button", { name: "Propose options" }).click();
    await page.waitForSelector("text=Proposals —", { timeout: 15000 });
    await shot(page, "proposal-stream");
    // poll API for posted options
    let opts = 0;
    for (let i = 0; i < 30; i++) {
      const r = await fetch(`${BASE}/api/studies/${studyId}/cards/clinical_question/proposals`).then((x) => x.json());
      opts = Array.isArray(r) ? r.length : 0;
      if (opts > 0) break;
      await page.waitForTimeout(5000);
    }
    console.log("proposal options:", opts);
    await page.waitForTimeout(1500);
    await shot(page, "proposal-options");
    if (opts > 0) {
      await page.getByRole("button", { name: "Use this" }).first().click();
      await page.waitForTimeout(1500);
      await shot(page, "proposal-used");
    } else {
      await page.getByRole("button", { name: "Close" }).click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log("proposal step:", e.message);
    await shot(page, "proposal-fallback");
    await page.getByRole("button", { name: "Close" }).click().catch(() => {});
  }

  // 7) Inspector — clickable finding jumps to its card
  try {
    await page.locator("aside").last().getByText(/is not started|is underspecified|specified before/i).first().click();
    await page.waitForTimeout(1000);
    await shot(page, "finding-jump");
  } catch (e) {
    console.log("finding-jump step:", e.message);
  }

  // 8) Artifacts
  await page.getByText("Artifacts").scrollIntoViewIfNeeded();
  await shot(page, "artifacts");

  console.log("EVAL_OK study=" + studyId);
} catch (err) {
  console.error("EVAL_ERROR", err);
  await shot(page, "error-state");
  process.exitCode = 1;
} finally {
  await browser.close();
}
