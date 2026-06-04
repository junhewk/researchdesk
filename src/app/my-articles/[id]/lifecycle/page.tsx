import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  RefreshCw,
} from "lucide-react";
import { getDb } from "@/server/db";
import { FinalizeButton } from "@/components/FinalizeButton";
import type {
  Commentary,
  Manuscript,
  Review,
  Revision,
  RevisionTable,
} from "@/server/types";

interface JourneyEvent {
  id: string;
  label: string;
  detail: string;
  ts: number | null;
  state: "complete" | "current" | "pending";
}

interface VersionRow {
  id: string;
  filename: string;
  round: number | null;
  uploaded_at: number;
  source: string;
  is_latest: boolean;
}

function loadManuscript(id: string): Manuscript | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM manuscripts WHERE id = ?")
    .get(id) as
    | (Omit<Manuscript, "is_git"> & { is_git: 0 | 1 })
    | undefined;
  if (!row) return null;
  return { ...row, is_git: Boolean(row.is_git) } as Manuscript;
}

function loadRevisions(id: string): Revision[] {
  return getDb()
    .prepare(
      "SELECT * FROM revisions WHERE manuscript_id = ? ORDER BY created_at ASC",
    )
    .all(id) as Revision[];
}

function loadCommentaries(id: string): Commentary[] {
  return getDb()
    .prepare(
      "SELECT * FROM commentaries WHERE manuscript_id = ? ORDER BY round ASC, created_at ASC",
    )
    .all(id) as Commentary[];
}

function loadReviews(id: string): Review[] {
  return getDb()
    .prepare(
      "SELECT * FROM reviews WHERE manuscript_id = ? ORDER BY created_at DESC",
    )
    .all(id) as Review[];
}

function loadRevisionTables(id: string): RevisionTable[] {
  return getDb()
    .prepare(
      "SELECT * FROM revision_tables WHERE manuscript_id = ? ORDER BY round ASC, created_at ASC",
    )
    .all(id) as RevisionTable[];
}

function formatDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function describeStage(
  m: Manuscript,
  latestRound: number,
): { label: string; body: string; tone: "complete" | "active" | "neutral" } {
  if (m.status === "completed") {
    return {
      label: "Completed",
      body: "Manuscript accepted for publication.",
      tone: "complete",
    };
  }
  if (m.status === "in_revision") {
    return {
      label: `Revision Round ${latestRound || 1}`,
      body: "Drafting revisions in response to peer feedback.",
      tone: "active",
    };
  }
  if (m.status === "in_review") {
    return {
      label: latestRound > 0 ? `Review Round ${latestRound}` : "Under Review",
      body: "Awaiting reviewer consensus.",
      tone: "active",
    };
  }
  return {
    label: "Draft",
    body: "Manuscript in progress; no review submitted yet.",
    tone: "neutral",
  };
}

function buildJourney(
  m: Manuscript,
  commentaries: Commentary[],
  revisions: Revision[],
): JourneyEvent[] {
  const events: JourneyEvent[] = [];
  events.push({
    id: "initial",
    label: "Initial Submission",
    detail: "Manuscript submitted to editorial board for initial screening.",
    ts: m.created_at,
    state: "complete",
  });

  const commentaryRounds = new Map<number, number>();
  for (const c of commentaries) {
    const prev = commentaryRounds.get(c.round);
    if (prev === undefined || c.created_at < prev) {
      commentaryRounds.set(c.round, c.created_at);
    }
  }
  const revisionRounds = new Map<number, { min: number; max: number }>();
  for (const r of revisions) {
    const cur = revisionRounds.get(r.round);
    if (!cur) {
      revisionRounds.set(r.round, { min: r.created_at, max: r.created_at });
    } else {
      cur.min = Math.min(cur.min, r.created_at);
      cur.max = Math.max(cur.max, r.created_at);
    }
  }

  const rounds = new Set<number>([
    ...commentaryRounds.keys(),
    ...revisionRounds.keys(),
  ]);
  const sortedRounds = [...rounds].sort((a, b) => a - b);

  const completed = m.status === "completed";
  const currentRound = sortedRounds[sortedRounds.length - 1] ?? 0;

  for (const round of sortedRounds) {
    const cTs = commentaryRounds.get(round);
    if (cTs) {
      events.push({
        id: `comm-${round}`,
        label: `Review Round ${round} Completed`,
        detail:
          "Feedback received from peer reviewers; revisions requested where appropriate.",
        ts: cTs,
        state: "complete",
      });
    }
    const rRange = revisionRounds.get(round);
    if (rRange) {
      const isCurrent = !completed && round === currentRound;
      const totalForRound = revisions.filter((r) => r.round === round).length;
      events.push({
        id: `rev-${round}`,
        label: isCurrent
          ? `Revised Submission (R${round}) — In Progress`
          : `Revised Submission (R${round})`,
        detail: isCurrent
          ? `Drafting ${totalForRound} revision item${totalForRound === 1 ? "" : "s"} for this round.`
          : `${totalForRound} revision item${totalForRound === 1 ? "" : "s"} filed for this round.`,
        ts: rRange.min,
        state: isCurrent ? "current" : "complete",
      });
    }
  }

  events.push({
    id: "final",
    label: "Final Acceptance",
    detail: completed
      ? "Manuscript accepted for publication."
      : "Awaiting reviewer consensus on final revision.",
    ts: completed ? m.updated_at : null,
    state: completed ? "complete" : "pending",
  });

  return events;
}

function buildVersions(
  m: Manuscript,
  tables: RevisionTable[],
): VersionRow[] {
  const versions: VersionRow[] = [];
  if (m.original_file) {
    versions.push({
      id: "initial",
      filename: m.original_file,
      round: 1,
      uploaded_at: m.created_at,
      source: "initial upload",
      is_latest: false,
    });
  }
  for (const t of tables) {
    versions.push({
      id: t.id,
      filename: t.relative_path,
      round: t.round,
      uploaded_at: t.created_at,
      source: "agent revision table",
      is_latest: false,
    });
  }
  if (versions.length > 0) {
    const latestTs = Math.max(...versions.map((v) => v.uploaded_at));
    for (const v of versions) v.is_latest = v.uploaded_at === latestTs;
  }
  return versions.sort((a, b) => b.uploaded_at - a.uploaded_at);
}

export default async function LifecyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const manuscript = loadManuscript(id);
  if (!manuscript) notFound();

  const revisions = loadRevisions(id);
  const commentaries = loadCommentaries(id);
  const reviews = loadReviews(id);
  const revisionTables = loadRevisionTables(id);

  const latestRound = Math.max(
    0,
    ...revisions.map((r) => r.round),
    ...commentaries.map((c) => c.round),
  );
  const stage = describeStage(manuscript, latestRound);

  const pendingRevisions = revisions.filter((r) => r.status === "pending");
  const pendingMajorReviews = reviews.filter(
    (rv) =>
      rv.status === "pending" &&
      (rv.severity === "major" || rv.severity === "critical"),
  );
  const outstandingCount = pendingRevisions.length + pendingMajorReviews.length;
  const outstandingItems = [
    ...pendingRevisions
      .slice(0, 3)
      .map((r) => firstLine(r.suggestion_md)),
    ...pendingMajorReviews
      .slice(0, Math.max(0, 3 - pendingRevisions.length))
      .map((rv) => firstLine(rv.content_md)),
  ].slice(0, 3);

  const journey = buildJourney(manuscript, commentaries, revisions);
  const versions = buildVersions(manuscript, revisionTables);
  const completed = manuscript.status === "completed";

  return (
    <div className="reveal">
      {/* Header bar */}
      <header className="mb-8 border-b border-[color:var(--color-outline-variant)] pb-6">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <Link
            href={`/my-articles/${id}/workspace`}
            className="text-[12px] text-[color:var(--color-on-surface-variant)] underline-offset-4 hover:text-[color:var(--color-on-surface)] hover:underline"
          >
            &larr; Workspace
          </Link>
          <h1
            className="font-display text-[28px] font-bold tracking-tight text-[color:var(--color-on-surface)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Lifecycle &amp; Versions
          </h1>
          <p className="text-[14px] text-[color:var(--color-on-surface-variant)] break-words [overflow-wrap:anywhere] min-w-0">
            {manuscript.title}
          </p>
          <Link
            href={`/my-articles/${id}/upload-revision`}
            className="ml-auto inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[13px] text-[color:var(--color-on-surface)] hover:border-[color:var(--color-outline)] transition-colors"
          >
            Upload revision &rarr;
          </Link>
        </div>
      </header>

      {/* Top row: Current Stage + Outstanding Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
        <CurrentStageCard stage={stage} />
        <OutstandingTasksCard
          count={outstandingCount}
          items={outstandingItems}
          revisionCount={pendingRevisions.length}
          reviewCount={pendingMajorReviews.length}
        />
      </div>

      {/* Bottom row: Journey + Version History (with Ready-for-Publication CTA) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8">
        <JourneyPanel events={journey} />

        <div className="space-y-5">
          <VersionsPanel versions={versions} />
          <ReadyForPublicationCard
            manuscriptId={id}
            completed={completed}
            blockers={outstandingCount}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────

function CurrentStageCard({
  stage,
}: {
  stage: ReturnType<typeof describeStage>;
}) {
  const iconTone =
    stage.tone === "complete"
      ? "bg-[color:var(--color-secondary-container)] text-[color:var(--color-on-secondary-container)]"
      : stage.tone === "active"
        ? "bg-[color:var(--color-secondary-container)] text-[color:var(--color-on-secondary-container)]"
        : "bg-[color:var(--color-surface-container-high)] text-[color:var(--color-on-surface-variant)]";

  return (
    <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] p-6">
      <div className="flex items-start gap-4">
        <div
          aria-hidden
          className={`grid h-12 w-12 shrink-0 place-items-center rounded ${iconTone}`}
        >
          <RefreshCw className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="label">Current Stage</div>
          <h2
            className="mt-1 font-display text-[22px] font-bold tracking-tight text-[color:var(--color-on-surface)]"
            style={{ letterSpacing: "-0.01em" }}
          >
            {stage.label}
          </h2>
          <p className="mt-2 text-[14px] leading-snug text-[color:var(--color-on-surface-variant)]">
            {stage.body}
          </p>
        </div>
      </div>
    </div>
  );
}

function OutstandingTasksCard({
  count,
  items,
  revisionCount,
  reviewCount,
}: {
  count: number;
  items: string[];
  revisionCount: number;
  reviewCount: number;
}) {
  const tone =
    count === 0
      ? "bg-[color:var(--color-secondary-container)] text-[color:var(--color-on-secondary-container)]"
      : "bg-[color:var(--color-error-container)] text-[color:var(--color-on-error-container)]";
  const heading =
    count === 0
      ? "All Clear"
      : `${count} ${revisionCount > 0 && reviewCount === 0 ? "Revision" : reviewCount > 0 && revisionCount === 0 ? "Review" : "Task"}${count === 1 ? "" : "s"} Required`;

  return (
    <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] p-6">
      <div className="flex items-start gap-4">
        <div
          aria-hidden
          className={`grid h-12 w-12 shrink-0 place-items-center rounded ${tone}`}
        >
          {count === 0 ? (
            <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
          ) : (
            <AlertCircle className="h-5 w-5" strokeWidth={2} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="label">Outstanding Tasks</div>
          <h2
            className="mt-1 font-display text-[22px] font-bold tracking-tight text-[color:var(--color-on-surface)]"
            style={{ letterSpacing: "-0.01em" }}
          >
            {heading}
          </h2>
          {items.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-[13px] leading-snug text-[color:var(--color-on-surface)]">
              {items.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <span
                    aria-hidden
                    className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-[color:var(--color-on-surface-variant)]"
                  />
                  <span className="line-clamp-1 flex-1 break-words [overflow-wrap:anywhere]">
                    {it}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-[color:var(--color-on-surface-variant)]">
              Nothing pending — the manuscript is fully resolved.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function JourneyPanel({ events }: { events: JourneyEvent[] }) {
  return (
    <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] p-6 sm:p-8">
      <h2 className="mb-6 font-display text-[18px] font-semibold tracking-tight text-[color:var(--color-on-surface)]">
        Journey to Publication
      </h2>
      <ol className="relative space-y-7 border-l border-[color:var(--color-outline-variant)] pl-7 ml-2">
        {events.map((ev, i) => {
          const isLast = i === events.length - 1;
          const dotClass =
            ev.state === "complete"
              ? "bg-[color:var(--color-secondary)] ring-[color:var(--color-surface-container-lowest)]"
              : ev.state === "current"
                ? "bg-[color:var(--color-surface-container-lowest)] border-[2px] border-[color:var(--color-primary)] ring-[color:var(--color-surface-container-lowest)]"
                : "bg-[color:var(--color-surface-container-lowest)] border-[2px] border-[color:var(--color-outline-variant)] ring-[color:var(--color-surface-container-lowest)]";
          const titleClass =
            ev.state === "pending"
              ? "text-[color:var(--color-on-surface-variant)]"
              : "text-[color:var(--color-on-surface)]";
          return (
            <li key={ev.id} className="relative">
              <span
                aria-hidden
                className={`absolute -left-[36px] top-1 h-[14px] w-[14px] rounded-full ring-4 ${dotClass}`}
              />
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h3
                  className={`font-display text-[15px] font-semibold ${titleClass}`}
                >
                  {ev.label}
                </h3>
                {ev.ts !== null ? (
                  <span className="label-sm tabular text-[color:var(--color-on-surface-variant)]">
                    {formatDate(ev.ts)}
                  </span>
                ) : (
                  <span className="label-sm text-[color:var(--color-on-surface-variant)]">
                    Pending
                  </span>
                )}
              </div>
              <p
                className={`mt-1.5 text-[13px] leading-snug ${
                  ev.state === "pending"
                    ? "text-[color:var(--color-on-surface-variant)]/80"
                    : "text-[color:var(--color-on-surface-variant)]"
                }`}
              >
                {ev.detail}
              </p>
              {/* Hide the spine after the last item — visual cleanup */}
              {isLast && (
                <span
                  aria-hidden
                  className="absolute -left-[28px] top-[20px] bottom-[-28px] w-[1px] bg-[color:var(--color-surface-container-lowest)]"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function VersionsPanel({ versions }: { versions: VersionRow[] }) {
  return (
    <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight text-[color:var(--color-on-surface)]">
        Version History
      </h2>
      {versions.length === 0 ? (
        <p className="text-[13px] italic text-[color:var(--color-on-surface-variant)]">
          No tracked file versions yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {versions.map((v) => (
            <li key={v.id} className="flex items-start gap-3">
              <FileText
                className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-on-surface-variant)]"
                strokeWidth={1.75}
              />
              <div className="min-w-0 flex-1">
                <code className="block font-mono text-[13px] font-semibold text-[color:var(--color-on-surface)] break-words [overflow-wrap:anywhere]">
                  {v.filename}
                </code>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="label-sm">
                    {v.source}
                    {" · "}
                    {formatDate(v.uploaded_at)}
                  </span>
                  {v.is_latest && (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] bg-[color:var(--color-secondary-container)] text-[color:var(--color-on-secondary-container)]">
                      Latest Revision
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReadyForPublicationCard({
  manuscriptId,
  completed,
  blockers,
}: {
  manuscriptId: string;
  completed: boolean;
  blockers: number;
}) {
  const enabled = !completed && blockers === 0;
  return (
    <div className="rounded-lg border border-[color:var(--color-primary)] bg-[color:var(--color-primary)] p-6 text-[color:var(--color-on-primary)]">
      <h2
        className="font-display text-[20px] font-bold tracking-tight"
        style={{ letterSpacing: "-0.01em" }}
      >
        Ready for Publication?
      </h2>
      <p className="mt-2 text-[13px] leading-snug text-[color:var(--color-on-primary-container)]">
        {completed
          ? "Manuscript marked as accepted."
          : blockers === 0
            ? "All revisions resolved. The agent can compile the final submission package."
            : `${blockers} task${blockers === 1 ? "" : "s"} still open. Resolve them before finalizing.`}
      </p>
      {completed ? (
        <div className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded bg-[color:var(--color-secondary-container)] px-4 py-2.5 text-[14px] font-semibold text-[color:var(--color-on-secondary-container)]">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
          Completed
        </div>
      ) : (
        <FinalizeButton manuscriptId={manuscriptId} enabled={enabled} />
      )}
      {!completed && enabled && (
        <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-[color:var(--color-on-primary-container)]">
          <Clock className="h-3 w-3" strokeWidth={1.75} />
          The agent writes the response letter + final revision table; you confirm.
        </p>
      )}
    </div>
  );
}

function firstLine(text: string): string {
  return text.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
}
