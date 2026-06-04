import { createEvidenceItem } from "../studies";
import type { EvidenceItem, EvidenceItemKind, EvidenceSnapshot } from "../types";

// Deterministic evidence extraction. When an imported snapshot already carries
// a structured `digest` object (MDR/RW exports that pre-summarize, and the
// test fixtures), we materialize evidence_items with zero LLM calls. Free-form
// reports without a digest are mined by the agent extraction pass instead
// (see studySessions.ts).

const DIGEST_KEY_TO_KIND: Record<string, EvidenceItemKind> = {
  prior_designs: "prior_design",
  prior_design: "prior_design",
  populations: "population",
  population: "population",
  outcomes: "outcome",
  outcome: "outcome",
  confounders: "confounder",
  confounder: "confounder",
  biases: "bias",
  bias: "bias",
  measures: "measure",
  measure: "measure",
  other: "other",
};

interface DigestEntry {
  label: string;
  detail?: string;
  ref?: unknown;
}

function asDigest(rawJson: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const digest = parsed?.digest;
    return digest && typeof digest === "object"
      ? (digest as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function snapshotHasDigest(rawJson: string): boolean {
  return asDigest(rawJson) !== null;
}

export function extractFromSnapshot(snapshot: EvidenceSnapshot): EvidenceItem[] {
  const digest = asDigest(snapshot.raw_json);
  if (!digest) return [];
  const items: EvidenceItem[] = [];
  for (const [key, kind] of Object.entries(DIGEST_KEY_TO_KIND)) {
    const arr = digest[key];
    if (!Array.isArray(arr)) continue;
    for (const raw of arr as unknown[]) {
      const entry: DigestEntry =
        typeof raw === "string" ? { label: raw } : (raw as DigestEntry);
      if (!entry || typeof entry.label !== "string" || !entry.label.trim()) {
        continue;
      }
      items.push(
        createEvidenceItem({
          snapshot_id: snapshot.id,
          study_id: snapshot.study_id,
          kind,
          label: entry.label.trim(),
          detail_md: typeof entry.detail === "string" ? entry.detail : null,
          source_ref_json: entry.ref ? JSON.stringify(entry.ref) : null,
        }),
      );
    }
  }
  return items;
}
