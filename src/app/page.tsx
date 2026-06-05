import Link from "next/link";
import {
  ArrowRight,
  Clock,
  FileEdit,
  Plus,
} from "lucide-react";
import { getDb } from "@/server/db";
import { DemoSeedButton } from "@/components/DemoSeedButton";
import { MarkdownText } from "@/components/MarkdownText";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SubmissionRow {
  id: string;
  title: string;
  status: "draft" | "in_revision" | "in_review" | "completed";
  research_domain: string | null;
  journal_type: string | null;
  research_type: string | null;
  updated_at: number;
  revision_round: number;
  revision_total: number;
  revision_resolved: number;
}

interface ActivityRow {
  kind: "commentary" | "revision" | "review";
  id: string;
  manuscript_id: string;
  manuscript_title: string;
  summary: string;
  created_at: number;
}

interface Stats {
  manuscripts: number;
  revisions: number;
  reviews: number;
}

function getSubmissions(): SubmissionRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         m.id, m.title, m.status, m.research_domain, m.journal_type,
         m.research_type, m.updated_at,
         COALESCE(MAX(r.round), 1) AS revision_round,
         COUNT(r.id) AS revision_total,
         SUM(CASE WHEN r.status IN ('applied','dismissed') THEN 1 ELSE 0 END) AS revision_resolved
       FROM manuscripts m
       LEFT JOIN revisions r ON r.manuscript_id = m.id
       GROUP BY m.id
       ORDER BY m.updated_at DESC
       LIMIT 6`,
    )
    .all() as SubmissionRow[];
}

function getStats(): Stats {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM manuscripts) AS manuscripts,
         (SELECT COUNT(*) FROM revisions)   AS revisions,
         (SELECT COUNT(*) FROM reviews)     AS reviews`,
    )
    .get() as Stats;
}

function getRecentActivity(): ActivityRow[] {
  const db = getDb();
  // The outer SELECT wraps the UNION so SQLite resolves ORDER BY against
  // the unified result set rather than the trailing arm.
  return db
    .prepare(
      `SELECT * FROM (
         SELECT 'commentary' AS kind, c.id, c.manuscript_id,
                m.title AS manuscript_title,
                substr(c.content_md, 1, 200) AS summary,
                c.created_at
           FROM commentaries c
           JOIN manuscripts m ON c.manuscript_id = m.id
         UNION ALL
         SELECT 'revision' AS kind, r.id, r.manuscript_id,
                m.title AS manuscript_title,
                substr(r.suggestion_md, 1, 200) AS summary,
                r.created_at
           FROM revisions r
           JOIN manuscripts m ON r.manuscript_id = m.id
         UNION ALL
         SELECT 'review' AS kind, rv.id, rv.manuscript_id,
                m.title AS manuscript_title,
                substr(rv.content_md, 1, 200) AS summary,
                rv.created_at
           FROM reviews rv
           JOIN manuscripts m ON rv.manuscript_id = m.id
       )
       ORDER BY created_at DESC
       LIMIT 5`,
    )
    .all() as ActivityRow[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_revision: "In Revision",
  in_review: "In Review",
  completed: "Completed",
};

const ACTIVITY_VERB: Record<ActivityRow["kind"], { noun: string; verb: string }> = {
  commentary: { noun: "Commentary", verb: "added on" },
  revision: { noun: "Revision", verb: "filed for" },
  review: { noun: "Review", verb: "drafted for" },
};

function SubmissionCard({ s, now }: { s: SubmissionRow; now: number }) {
  const inRevision = s.status === "in_revision";
  const pct =
    s.revision_total > 0
      ? Math.round((s.revision_resolved / s.revision_total) * 100)
      : 0;

  return (
    <Link
      href={`/my-articles/${s.id}/workspace`}
      className="block rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-5 py-5 transition-colors hover:border-[color:var(--color-outline)]"
    >
      <h3 className="font-display text-[17px] font-semibold leading-snug text-[color:var(--color-on-surface)] break-words [overflow-wrap:anywhere]">
        {s.title}
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {inRevision ? (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] bg-[color:var(--color-secondary-container)] text-[color:var(--color-on-secondary-container)]">
            Round {s.revision_round}
          </span>
        ) : (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] bg-[color:var(--color-surface-container)] text-[color:var(--color-on-surface-variant)]">
            {STATUS_LABEL[s.status] ?? s.status}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--color-on-surface-variant)]">
          <Clock className="h-3 w-3" strokeWidth={1.75} />
          Last updated: {relativeTime(s.updated_at, now)}
        </span>
        {(s.research_domain || s.journal_type) && (
          <span className="text-[12px] text-[color:var(--color-on-surface-variant)]">
            {[s.research_domain, s.journal_type].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {inRevision && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="label-sm text-[color:var(--color-on-surface)] font-medium">
              Revision Progress
            </span>
            <span className="tabular text-[13px] font-semibold text-[color:var(--color-on-surface)]">
              {pct}%
            </span>
          </div>
          <div
            className="h-1 w-full rounded-full overflow-hidden bg-[color:var(--color-surface-container-high)]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-[color:var(--color-primary)] transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}

function ActivityEvent({
  ev,
  index,
  total,
  now,
}: {
  ev: ActivityRow;
  index: number;
  total: number;
  now: number;
}) {
  const dotColor =
    index === 0
      ? "bg-[color:var(--color-tertiary-container)]"
      : index === 1
        ? "bg-[color:var(--color-secondary)]"
        : "bg-[color:var(--color-outline-variant)]";
  const isLast = index === total - 1;
  const meta = ACTIVITY_VERB[ev.kind];
  const quote = ev.summary?.replace(/\s+/g, " ").trim();

  return (
    <li className="relative pl-7">
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[10px] top-3 bottom-[-20px] w-px bg-[color:var(--color-outline-variant)]"
        />
      )}
      <span
        aria-hidden
        className={`absolute left-[6px] top-1.5 h-2 w-2 rounded-full ring-4 ring-[color:var(--color-surface-container-lowest)] ${dotColor}`}
      />
      <div className="label-sm text-[color:var(--color-on-surface-variant)]">
        {relativeTime(ev.created_at, now)}
      </div>
      <div className="mt-0.5 text-[13px] leading-snug">
        <span className="font-medium text-[color:var(--color-on-surface)]">
          {meta.noun}
        </span>{" "}
        <span className="text-[color:var(--color-on-surface-variant)]">
          {meta.verb}
        </span>{" "}
        <Link
          href={`/my-articles/${ev.manuscript_id}/workspace`}
          className="italic text-[color:var(--color-on-surface)] hover:text-[color:var(--color-primary)] underline-offset-2 hover:underline decoration-[color:var(--color-outline-variant)] break-words [overflow-wrap:anywhere]"
        >
          {ev.manuscript_title}
        </Link>
        <span className="text-[color:var(--color-on-surface-variant)]">.</span>
      </div>
      {quote && (
        <div className="mt-2 max-h-[3.4em] overflow-hidden rounded bg-[color:var(--color-surface-container-low)] px-3 py-2 text-[color:var(--color-on-surface-variant)]">
          <MarkdownText text={quote} compact muted />
        </div>
      )}
    </li>
  );
}

export default function ResearcherHubPage() {
  const submissions = getSubmissions();
  const stats = getStats();
  const activity = getRecentActivity();
  // Server Component: this renders once per request, so Date.now() is the
  // legitimate request-time value, not a re-render hazard.
  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="reveal mx-auto max-w-[1280px]">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-10 xl:gap-12">
        {/* MAIN COLUMN */}
        <div className="min-w-0">
          {/* Page header */}
          <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 mb-10">
            <div className="min-w-0">
              <h1
                className="font-display text-[40px] leading-[1.05] tracking-tight text-[color:var(--color-on-surface)]"
                style={{ fontWeight: 700, letterSpacing: "-0.02em" }}
              >
                Researcher Hub
              </h1>
              <p className="mt-2 text-[15px] leading-[1.5] text-[color:var(--color-on-surface-variant)]">
                Manage your active submissions and peer reviews.
              </p>
              <p className="mt-3 font-mono text-[11px] tabular text-[color:var(--color-on-surface-variant)] tracking-[0.04em]">
                {stats.manuscripts} manuscript{stats.manuscripts === 1 ? "" : "s"}
                {"  ·  "}
                {stats.revisions} revision{stats.revisions === 1 ? "" : "s"}
                {"  ·  "}
                {stats.reviews} review{stats.reviews === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-2">
              <DemoSeedButton />
              <Link
                href="/my-articles/new"
                className="inline-flex items-center gap-2 rounded px-4 py-2.5 text-[14px] font-medium bg-[color:var(--color-primary)] text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] transition-colors"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                New Submission
              </Link>
            </div>
          </header>

          {/* My Submissions */}
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-display text-[18px] font-semibold text-[color:var(--color-on-surface)]">
              <FileEdit
                className="h-4 w-4 text-[color:var(--color-on-surface-variant)]"
                strokeWidth={1.75}
              />
              My Submissions
            </h2>
            {submissions.length === 0 ? (
              <p className="py-8 text-[15px] font-body italic text-[color:var(--color-on-surface-variant)]">
                No submissions yet.{" "}
                <Link
                  href="/my-articles/new"
                  className="not-italic font-display font-medium text-[color:var(--color-primary)] underline-offset-2 hover:underline"
                >
                  Start your first manuscript &rarr;
                </Link>
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {submissions.map((s) => (
                  <SubmissionCard key={s.id} s={s} now={now} />
                ))}
              </div>
            )}
          </section>

        </div>

        {/* RIGHT COLUMN — Recent Activity */}
        <aside className="hidden xl:block">
          <div className="sticky top-10">
            <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] shadow-[0_2px_8px_rgba(22,40,57,0.04)]">
              <header className="flex items-center gap-2 border-b border-[color:var(--color-outline-variant)] px-5 py-4">
                <Clock
                  className="h-4 w-4 text-[color:var(--color-on-surface-variant)]"
                  strokeWidth={1.75}
                />
                <h2 className="font-display text-[15px] font-semibold text-[color:var(--color-on-surface)]">
                  Recent Activity
                </h2>
              </header>

              <div className="px-5 py-5">
                {activity.length === 0 ? (
                  <p className="font-body italic text-[13px] leading-relaxed text-[color:var(--color-on-surface-variant)]">
                    Nothing to show yet. Activity appears here as you and the
                    agent work the manuscript.
                  </p>
                ) : (
                  <ul className="space-y-6">
                    {activity.map((ev, i) => (
                      <ActivityEvent
                        key={`${ev.kind}-${ev.id}`}
                        ev={ev}
                        index={i}
                        total={activity.length}
                        now={now}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {activity.length > 0 && (
                <div className="border-t border-[color:var(--color-outline-variant)] px-5 py-3">
                  <Link
                    href="/archives"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)] underline-offset-2 hover:underline"
                  >
                    View all activity
                    <ArrowRight className="h-3 w-3" strokeWidth={2} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
