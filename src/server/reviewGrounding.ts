/**
 * The deterministic grounding pack injected into every grounded review.
 *
 * The persona-vs-context experiment found three checks to be *categorical* wins —
 * errors the model is structurally incapable of catching on its own, so only
 * grounding surfaces them:
 *
 *   - GRIM (arithmetic): a reported mean impossible for its stated N.
 *   - DOI / retraction: a cited reference that does not resolve or is retracted.
 *   - Protocol drift: the manuscript diverging from the registered study cards.
 *
 * This module computes those facts and renders them as a markdown block that is
 * appended to the review's tool context, so every reviewer in the ensemble (and
 * the prompt) sees the same verified findings. Unlike the experiment's stand-in
 * pack, this is computed by the product's real tools.
 *
 * Confidentiality: GRIM and protocol drift are local (no network). DOI validation
 * makes external calls (the DOI string only, never manuscript text) and is gated
 * behind `allowExternal` — the own-article review path enables it; a confidential
 * review-request path must pass `false` unless the user has consented.
 */
import { getManuscript } from "./manuscripts";
import { computeProtocolCompareFindings } from "./readinessChecks";
import { validateDoi } from "./articleSearch";
import { runGrimChecks } from "./integrity";

export interface GroundingPackResult {
  /** rendered markdown block, or "" when nothing was found */
  block: string;
  grimFlags: number;
  doiChecked: number;
  doiUnresolved: number;
  doiRetracted: number;
  protocolFindings: number;
}

const EMPTY: GroundingPackResult = {
  block: "",
  grimFlags: 0,
  doiChecked: 0,
  doiUnresolved: 0,
  doiRetracted: 0,
  protocolFindings: 0,
};

// Conservative DOI matcher; trailing punctuation/markdown is trimmed below.
const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>)\]}]+/gi;
const MAX_DOIS = 15;

/** Extract unique, normalized DOIs from manuscript prose (capped). */
export function extractDois(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.match(DOI_RE) ?? []) {
    const doi = raw.replace(/[.,;:)\]}>]+$/, "").toLowerCase();
    if (doi.length < 8 || seen.has(doi)) continue;
    seen.add(doi);
    out.push(doi);
    if (out.length >= MAX_DOIS) break;
  }
  return out;
}

/**
 * Build the deterministic grounding pack for a manuscript. Returns an empty block
 * when no check fires, so the review prompt stays clean for clean manuscripts.
 */
export async function buildGroundingPack(opts: {
  manuscriptId: string;
  allowExternal: boolean;
}): Promise<GroundingPackResult> {
  const manuscript = getManuscript(opts.manuscriptId);
  if (!manuscript) return EMPTY;
  const text = manuscript.content_md;
  const lines: string[] = [];
  const result = { ...EMPTY };

  // 1. GRIM — local, always.
  const grim = runGrimChecks(text);
  if (grim.length > 0) {
    result.grimFlags = grim.length;
    lines.push(
      "- Statistical possibility (GRIM): the following reported means are not " +
        "arithmetically achievable for their stated N, assuming integer-valued " +
        "items (Likert/score/count). Verify the measure is integer-valued before " +
        "reporting; if it is, the value is inconsistent with N.",
    );
    for (const g of grim) {
      const near = g.nearest != null ? ` (nearest achievable ≈ ${g.nearest})` : "";
      lines.push(`    • mean ${g.mean} with n=${g.n}${near} — "${g.snippet}"`);
    }
  }

  // 2. Protocol drift — local, only when a study is linked.
  if (manuscript.study_id) {
    const drift = computeProtocolCompareFindings({
      manuscriptId: manuscript.id,
      studyId: manuscript.study_id,
    });
    if (drift.length > 0) {
      result.protocolFindings = drift.length;
      lines.push(
        "- Protocol drift (manuscript vs the registered study design cards):",
      );
      for (const f of drift) {
        lines.push(`    • [${f.severity}] ${f.gate}: ${f.finding_md}`);
      }
    }
  }

  // 3. DOI / retraction — network; gated.
  if (opts.allowExternal) {
    const dois = extractDois(text);
    if (dois.length > 0) {
      const checks = await Promise.all(
        dois.map((doi) =>
          validateDoi(doi)
            .then((r) => ({ doi, ...r }))
            .catch(() => null),
        ),
      );
      const resolved = checks.filter((c) => c !== null) as Array<
        { doi: string } & Awaited<ReturnType<typeof validateDoi>>
      >;
      result.doiChecked = resolved.length;
      const unresolved = resolved.filter((c) => !c.exists);
      const retracted = resolved.filter((c) => c.exists && c.is_retracted);
      result.doiUnresolved = unresolved.length;
      result.doiRetracted = retracted.length;
      if (unresolved.length > 0) {
        lines.push(
          "- Citation integrity: the following cited DOIs did NOT resolve in " +
            "Crossref/OpenAlex (possibly fabricated or mistyped): " +
            unresolved.map((c) => c.doi).join(", ") + ".",
        );
      }
      if (retracted.length > 0) {
        lines.push(
          "- Citation integrity: the following cited DOIs are RETRACTED — do not " +
            "rely on them: " +
            retracted.map((c) => `${c.doi}${c.title ? ` ("${c.title}")` : ""}`).join("; ") +
            ".",
        );
      }
    }
  }

  if (lines.length === 0) return EMPTY;
  result.block = [
    "Verified grounding (deterministic checks — treat as established facts the " +
      "manuscript text alone cannot reveal):",
    ...lines,
  ].join("\n");
  return result;
}
