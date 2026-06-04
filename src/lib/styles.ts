/**
 * Status / category / severity style maps for chips, badges, and pills.
 *
 * Outlined chips, never filled — the Scholarly Minimalist system uses
 * tonal contrast between the chip ink and surrounding surface, plus 1px
 * outlines, rather than heavy filled badges with shadows.
 */

export const STATUS_STYLES: Record<string, string> = {
  draft:
    "text-[color:var(--color-on-surface-variant)] bg-[color:var(--color-surface-container-low)]",
  in_revision:
    "text-[color:var(--color-on-tertiary-container)] bg-[color:var(--color-surface-container-low)]",
  in_review:
    "text-[color:var(--color-primary)] bg-[color:var(--color-surface-container-low)]",
  completed:
    "text-[color:var(--color-on-primary)] bg-[color:var(--color-primary)]",
};

export const CATEGORY_STYLES: Record<string, string> = {
  mechanical:
    "text-[color:var(--color-primary)] border-[color:var(--color-primary)]",
  rewrite:
    "text-[color:var(--color-tertiary-container)] border-[color:var(--color-tertiary-container)]",
  structural:
    "text-[color:var(--color-on-error-container)] border-[color:var(--color-on-error-container)]",
  evidence:
    "text-[color:var(--color-primary-container)] border-[color:var(--color-primary-container)]",
};

export const SEVERITY_STYLES: Record<string, string> = {
  minor:
    "text-[color:var(--color-on-surface-variant)] border-[color:var(--color-outline-variant)]",
  major:
    "text-[color:var(--color-tertiary-container)] border-[color:var(--color-tertiary-container)]",
  critical:
    "text-[color:var(--color-error)] border-[color:var(--color-error)]",
};

// Decision-card lifecycle states for the Methods Workbench canvas. Outlined
// chips, consistent with the rest of the system.
export const DECISION_STATE_STYLES: Record<string, string> = {
  not_started:
    "text-[color:var(--color-on-surface-variant)] border-[color:var(--color-outline-variant)]",
  drafted:
    "text-[color:var(--color-primary)] border-[color:var(--color-primary)]",
  underspecified:
    "text-[color:var(--color-tertiary-container)] border-[color:var(--color-tertiary-container)]",
  conflicting:
    "text-[color:var(--color-error)] border-[color:var(--color-error)]",
  evidence_supported:
    "text-[color:var(--color-on-secondary-container)] border-[color:var(--color-on-secondary-container)]",
  needs_input:
    "text-[color:var(--color-tertiary)] border-[color:var(--color-tertiary)]",
  unknown:
    "text-[color:var(--color-on-surface-variant)] border-[color:var(--color-outline-variant)] italic",
  assumed:
    "text-[color:var(--color-tertiary-container)] border-[color:var(--color-tertiary-container)] italic",
  locked:
    "text-[color:var(--color-on-primary)] bg-[color:var(--color-primary)] border-[color:var(--color-primary)]",
};

export const DECISION_STATE_LABEL: Record<string, string> = {
  not_started: "not started",
  drafted: "drafted",
  underspecified: "underspecified",
  conflicting: "conflicting",
  evidence_supported: "evidence-supported",
  needs_input: "needs input",
  unknown: "unknown",
  assumed: "assumed",
  locked: "locked",
};

// Preflight finding severities.
export const PREFLIGHT_SEVERITY_STYLES: Record<string, string> = {
  blocking: "text-[color:var(--color-error)] border-[color:var(--color-error)]",
  important:
    "text-[color:var(--color-tertiary-container)] border-[color:var(--color-tertiary-container)]",
  minor:
    "text-[color:var(--color-on-surface-variant)] border-[color:var(--color-outline-variant)]",
};

export const EVIDENCE_KIND_LABEL: Record<string, string> = {
  prior_design: "prior designs",
  population: "populations",
  outcome: "outcomes",
  confounder: "confounders",
  bias: "known biases",
  measure: "measures",
  other: "other",
};

export const REVISION_STATUS_STYLES: Record<string, string> = {
  pending:
    "text-[color:var(--color-on-surface-variant)] bg-[color:var(--color-surface-container-low)]",
  applied:
    "text-[color:var(--color-on-secondary-container)] bg-[color:var(--color-secondary-container)]",
  dismissed:
    "text-[color:var(--color-error)] bg-[color:var(--color-surface-container-low)] line-through opacity-60",
};
