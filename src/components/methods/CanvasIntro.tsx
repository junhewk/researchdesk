"use client";

export const CANVAS_INTRO_STORAGE_KEY = "reviewer.methods.canvasIntro.v1";

/**
 * Dismissible legend for the three-column study canvas. Visibility is owned
 * by StudyWorkspace: auto-opened for a study with no work done yet, reopened
 * from the "How this works" header button.
 */
export function CanvasIntro({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  if (!open) return null;

  return (
    <div className="mt-4 border-y border-[color:var(--color-outline-variant)] py-3">
      <div className="grid grid-cols-1 gap-4 text-[12px] leading-relaxed xl:grid-cols-[250px_minmax(0,1fr)_290px] xl:gap-6">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
            Evidence (left)
          </span>
          <p className="mt-0.5">
            Facts pulled from your notes — drag one onto a card to back up that
            decision.
          </p>
        </div>
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
            Decisions (center)
          </span>
          <p className="mt-0.5">
            Every methodological choice in your study, grouped by stage. Open a
            card and type — or click &ldquo;Ask for options&rdquo; and the
            assistant suggests choices with trade-offs. You always decide.
          </p>
        </div>
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
            Checks (right)
          </span>
          <p className="mt-0.5">
            Automatic checks on your design. Clear the blocking items first;
            the &ldquo;next best action&rdquo; always points somewhere useful.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-[11px] text-[color:var(--color-on-surface-variant)]">
          The documents at the bottom (protocol, analysis plan, checklist)
          compile automatically from your decisions — nothing is final until
          you lock it.
        </p>
        <button
          onClick={onDismiss}
          className="shrink-0 text-left text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)] sm:ml-4 sm:text-right"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
