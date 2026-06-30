"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Clock,
  FileText,
  History,
  MessageSquareText,
  Settings as SettingsIcon,
  Share2,
  Upload,
} from "lucide-react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MethodsActions } from "@/components/MethodsActions";
import { SessionStream } from "@/components/SessionStream";
import {
  PromptComposer,
  type SlashCommand,
} from "@/components/PromptComposer";
import { ProviderSelector } from "@/components/ProviderSelector";
import { AgentModelEffortPicker } from "@/components/AgentModelEffortPicker";
import { MarkdownText } from "@/components/MarkdownText";
import { ManuscriptDiff } from "@/components/ManuscriptDiff";
import { AttachmentsPanel } from "@/components/AttachmentsPanel";
import { ReviewInputPanel } from "@/components/ReviewInputPanel";
import {
  agentRunLabel,
  normalizeEffortForProvider,
  normalizeModelForProvider,
  supportsModelEffort,
  type AgentEffortInput,
} from "@/lib/agentChoices";
import { CATEGORY_STYLES } from "@/lib/styles";
import { relativeTime } from "@/lib/utils";
import type {
  Manuscript,
  Provider,
  Review,
  Revision,
  Session,
  SessionStatus,
} from "@/server/types";

// ─── Slash commands ────────────────────────────────────────────────────────

const MANUSCRIPT_SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/revise",
    title: "Apply revisions to the project files",
    detail:
      "Mechanical fixes + rewrite drafts grounded in the decision letter.",
  },
  {
    command: "/review",
    title: "Critique without editing",
    detail:
      "Produce review items grounded in prior reviews and validated citations.",
  },
  {
    command: "/draft",
    title: "Plan a new section or response",
    detail:
      "Outline what to write — never produces novel research content.",
  },
  {
    command: "/cite",
    title: "Find evidence in the literature",
    detail: "Search Semantic Scholar / OpenAlex; validate every DOI.",
  },
  {
    command: "/explain",
    title: "Summarize a passage or letter",
    detail: "Read-only — does not edit anything.",
  },
  {
    command: "/version",
    title: "Create a new revised manuscript version",
    detail:
      "Agent integrates pending suggestions into a complete v(N+1) and saves it for diffing.",
  },
  {
    command: "/finalize",
    title: "Compile the final submission package",
    detail:
      "Writes response_to_reviewers_final.md + revision_table_final.md and returns a verdict.",
  },
];

// ─── Tab routing ───────────────────────────────────────────────────────────

type CenterTab = "drafts" | "diff" | "history" | "peer";

const TABS: Array<{ key: CenterTab; label: string }> = [
  { key: "drafts", label: "Drafts" },
  { key: "diff", label: "Diff" },
  { key: "history", label: "Revision History" },
  { key: "peer", label: "Peer Feedback" },
];

function parseCenter(raw: string | null): CenterTab {
  // Legacy redirects from /revise and /review come in as `changes` / `findings`.
  switch (raw) {
    case "drafts":
    case "changes":
      return "drafts";
    case "diff":
      return "diff";
    case "history":
    case "versions":
      return "history";
    case "peer":
    case "findings":
      return "peer";
    default:
      return "drafts";
  }
}

function slashOf(text: string): string | null {
  const m = text.trim().match(/^\/[a-z-]+/i);
  return m ? m[0].toLowerCase() : null;
}

function tabForCommand(text: string): CenterTab | null {
  switch (slashOf(text)) {
    case "/revise":
    case "/draft":
      return "drafts";
    case "/review":
    case "/cite":
      return "peer";
    default:
      return null;
  }
}

// ─── Comment model (merge of reviews + revisions) ──────────────────────────

type CommentKind = "review" | "revision";
type CommentCategory = "mechanical" | "rewrite" | "structural" | "evidence";
type CommentSeverity = "Major" | "Minor" | "Critical" | "Resolved";

interface Comment {
  id: string;
  kind: CommentKind;
  category: CommentCategory;
  severity: CommentSeverity;
  content: string;
  section_ref: string | null;
  status: string; // 'pending' | 'applied' | 'dismissed'
  created_at: number;
}

const CATEGORY_AVATAR_LETTER: Record<CommentCategory, string> = {
  mechanical: "M",
  rewrite: "R",
  structural: "S",
  evidence: "E",
};

function severityForReview(r: Review): CommentSeverity {
  if (r.status === "applied" || r.status === "dismissed") return "Resolved";
  if (r.severity === "critical") return "Critical";
  if (r.severity === "major") return "Major";
  return "Minor";
}

function severityForRevision(r: Revision): CommentSeverity {
  if (r.status === "applied" || r.status === "dismissed") return "Resolved";
  return "Minor";
}

function reviewToComment(r: Review): Comment {
  return {
    id: r.id,
    kind: "review",
    category: r.category,
    severity: severityForReview(r),
    content: r.content_md,
    section_ref: r.section_ref,
    status: r.status,
    created_at: r.created_at,
  };
}

function revisionToComment(r: Revision): Comment {
  return {
    id: r.id,
    kind: "revision",
    category: r.category as CommentCategory,
    severity: severityForRevision(r),
    content: r.suggestion_md,
    section_ref: null,
    status: r.status,
    created_at: r.created_at,
  };
}

// ─── Severity chip styling ─────────────────────────────────────────────────

function severityChipClass(s: CommentSeverity): string {
  switch (s) {
    case "Major":
      return "border-[color:var(--color-tertiary-container)] bg-[color:var(--color-tertiary-container)]/15 text-[color:var(--color-tertiary-container)]";
    case "Critical":
      return "border-[color:var(--color-error)] bg-[color:var(--color-error-container)] text-[color:var(--color-on-error-container)]";
    case "Resolved":
      return "border-[color:var(--color-secondary)] bg-transparent text-[color:var(--color-on-secondary-container)] line-through";
    default:
      return "border-[color:var(--color-outline-variant)] bg-transparent text-[color:var(--color-on-surface-variant)]";
  }
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ManuscriptWorkspacePage() {
  const { id: manuscriptId } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseCenter(searchParams.get("center"));

  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("new");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState<AgentEffortInput>("");

  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [revisionTracking, setRevisionTracking] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialisedRef = useRef(false);
  const nowRef = useRef(Math.floor(Date.now() / 1000));

  const navWith = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) params.delete(k);
        else params.set(k, v);
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const setTab = useCallback(
    (next: CenterTab) =>
      navWith({ center: next === "drafts" ? null : next }),
    [navWith],
  );

  useEffect(() => {
    if (!manuscriptId || initialisedRef.current) return;
    initialisedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const mRes = await fetch(`/api/manuscripts/${manuscriptId}`);
        if (!mRes.ok) throw new Error("Manuscript not found");
        const m = (await mRes.json()) as Manuscript;
        if (cancelled) return;
        setManuscript(m);

        const sRes = await fetch("/api/sessions/manuscript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manuscript_id: manuscriptId,
          }),
        });
        if (cancelled) return;
        if (!sRes.ok) {
          const data = await sRes.json().catch(() => ({}));
          setSessionError(
            typeof data.error === "string"
              ? data.error
              : data.error?.formErrors?.join(", ") || "Could not open session",
          );
          return;
        }
        const s = (await sRes.json()) as Session;
        setSession(s);
        setSessionError(null);
        setSessionStatus(s.status);
        setProvider(s.provider);
        setModel(normalizeModelForProvider(s.provider, s.model ?? ""));
        setEffort(normalizeEffortForProvider(s.provider, s.effort ?? ""));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load workspace");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [manuscriptId]);

  const reloadRevisions = useCallback(async () => {
    if (!manuscriptId) return;
    const res = await fetch(`/api/manuscripts/${manuscriptId}/revisions`);
    if (res.ok) setRevisions((await res.json()) as Revision[]);
  }, [manuscriptId]);

  const reloadReviews = useCallback(async () => {
    if (!manuscriptId) return;
    const res = await fetch(`/api/manuscripts/${manuscriptId}/reviews`);
    if (res.ok) setReviews((await res.json()) as Review[]);
  }, [manuscriptId]);

  useEffect(() => {
    void reloadRevisions();
    void reloadReviews();
  }, [reloadRevisions, reloadReviews]);

  const sendMessage = useCallback(async () => {
    const text = composerText.trim();
    if (!text || !session || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      const next = tabForCommand(text);
      if (next && next !== tab) setTab(next);
      setComposerText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, [composerText, sending, session, setTab, tab]);

  const interrupt = useCallback(async () => {
    if (!session) return;
    await fetch(`/api/sessions/${session.id}/interrupt`, { method: "POST" });
  }, [session]);

  const markCompleted = useCallback(async () => {
    if (!manuscriptId || marking) return;
    const ok = window.confirm(
      "Mark this manuscript as completed? The agent thread stays accessible but the manuscript is closed for new revisions.",
    );
    if (!ok) return;
    setMarking(true);
    setError(null);
    try {
      const res = await fetch(`/api/manuscripts/${manuscriptId}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Refetch manuscript so the header updates.
      const mRes = await fetch(`/api/manuscripts/${manuscriptId}`);
      if (mRes.ok) setManuscript((await mRes.json()) as Manuscript);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark completed");
    } finally {
      setMarking(false);
    }
  }, [manuscriptId, marking]);

  const chooseProvider = useCallback((next: Provider) => {
    setProvider(next);
    setModel((cur) => normalizeModelForProvider(next, cur));
    setEffort((cur) => normalizeEffortForProvider(next, cur));
  }, []);

  const onTurnComplete = useCallback(() => {
    void Promise.all([reloadRevisions(), reloadReviews()]);
  }, [reloadReviews, reloadRevisions]);

  const resolveComment = useCallback(
    async (c: Comment, nextStatus: "applied" | "dismissed") => {
      if (!manuscriptId) return;
      const endpoint =
        c.kind === "review"
          ? `/api/manuscripts/${manuscriptId}/reviews/${c.id}`
          : `/api/manuscripts/${manuscriptId}/revisions/${c.id}`;
      // Fire-and-tolerate: if the PATCH endpoint isn't wired yet, the 404
      // simply leaves state unchanged. Phase 4 hooks up missing routes.
      try {
        await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
      } catch {
        /* noop */
      }
      void (c.kind === "review" ? reloadReviews() : reloadRevisions());
    },
    [manuscriptId, reloadReviews, reloadRevisions],
  );

  // ─── Derived data ──────────────────────────────────────────────────────

  const comments = useMemo<Comment[]>(() => {
    const merged: Comment[] = [
      ...reviews.map(reviewToComment),
      ...revisions.map(revisionToComment),
    ];
    merged.sort((a, b) => b.created_at - a.created_at);
    return merged;
  }, [reviews, revisions]);

  const openCount = comments.filter((c) => c.severity !== "Resolved").length;
  const isRunning = sessionStatus === "running";
  const reviewInputsReady = Boolean(manuscript?.review_request?.trim());
  const canSend =
    !!session && !sending && !isRunning && composerText.trim().length > 0;
  const canRunReview = !!session && !sending && !isRunning && reviewInputsReady;

  // Basic, one-click entry to the product's context-grounded ensemble review
  // (equivalent to typing /review in the composer). The provider/model used is
  // whatever the Advanced drawer selects.
  const runReview = useCallback(async () => {
    if (!session || sending || sessionStatus === "running") return;
    if (!manuscript?.review_request?.trim()) {
      setError("Add a review focus in Review Inputs before running the pre-submission review.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "/review" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Review failed (${res.status})`);
      }
      setTab("peer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start review");
    } finally {
      setSending(false);
    }
  }, [manuscript?.review_request, session, sending, sessionStatus, setTab]);

  const prepareInputScan = useCallback(() => {
    setComposerText(
      "/explain\n\nScan this manuscript project for missing inputs needed before a high-quality pre-submission review. Focus only on missing or weak project inputs, not manuscript critique yet. Return required, recommended, and suggested inputs with the reason each matters.",
    );
  }, []);

  // ─── Bail-out states ───────────────────────────────────────────────────

  if (error && !manuscript) {
    return (
      <div className="py-20 text-center">
        <p className="mb-3 text-[15px] text-[color:var(--color-error)]">
          {error}
        </p>
        <Link
          href="/my-articles"
          className="text-[13px] text-[color:var(--color-on-surface-variant)] underline underline-offset-4 hover:text-[color:var(--color-on-surface)]"
        >
          &larr; My articles
        </Link>
      </div>
    );
  }

  if (!manuscript) {
    return (
      <div className="py-20 text-center text-[14px] text-[color:var(--color-on-surface-variant)]">
        Loading workspace…
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="reveal">
      {/* WORKSPACE HEADER BAR */}
      <header className="mb-8 border-b border-[color:var(--color-outline-variant)]">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pb-3">
          <div className="flex items-baseline gap-6 flex-wrap">
            <h1
              className="font-display text-[19px] font-semibold tracking-tight text-[color:var(--color-on-surface)]"
              style={{ letterSpacing: "-0.01em" }}
            >
              Manuscript Review
            </h1>
            <nav
              role="tablist"
              aria-label="Workspace section"
              className="flex items-center gap-1"
            >
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.key)}
                    className={`relative px-2 py-2 text-[14px] transition-colors ${
                      active
                        ? "text-[color:var(--color-on-surface)] font-medium"
                        : "text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
                    }`}
                  >
                    {t.label}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-2 right-2 -bottom-[12px] h-[1px] bg-[color:var(--color-primary)]"
                      />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <button
              type="button"
              aria-label="Advanced settings"
              title="Advanced: provider, model, revision tracking"
              onClick={() => setSettingsOpen((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded text-[color:var(--color-on-surface-variant)] hover:bg-[color:var(--color-surface-container-low)] hover:text-[color:var(--color-on-surface)] transition-colors"
            >
              <SettingsIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
            {manuscript.study_id && (
              <Link
                href={`/methods-workbench/${manuscript.study_id}`}
                className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[13px] text-[color:var(--color-on-surface)] hover:border-[color:var(--color-outline)] transition-colors"
              >
                <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                Source methods
              </Link>
            )}
            <MethodsActions manuscriptId={manuscriptId} studyId={manuscript.study_id} />
            <Link
              href={`/my-articles/${manuscriptId}/upload-revision`}
              className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[13px] text-[color:var(--color-on-surface)] hover:border-[color:var(--color-outline)] transition-colors"
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
              Upload revision
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-outline-variant)] px-3 py-1.5 text-[13px] text-[color:var(--color-on-surface)] hover:border-[color:var(--color-outline)] transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Share
            </button>
            {manuscript.status === "completed" ? (
              <span className="inline-flex items-center gap-1.5 rounded bg-[color:var(--color-secondary-container)] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[color:var(--color-on-secondary-container)]">
                Completed
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void markCompleted()}
                disabled={marking}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--color-on-surface-variant)] underline-offset-2 hover:text-[color:var(--color-on-surface)] hover:underline disabled:opacity-50"
              >
                {marking ? "Marking…" : "Mark completed"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* TWO-COLUMN BODY */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-8 xl:gap-10">
        {/* CENTER COLUMN */}
        <main className="min-w-0">
          {tab === "drafts" && (
            <DraftsPane
              manuscript={manuscript}
              now={nowRef.current}
              revisionTracking={revisionTracking}
            />
          )}
          {tab === "diff" && (
            <ManuscriptDiff
              manuscriptId={manuscript.id}
              fallbackCurrent={manuscript.content_md}
              sessionId={session?.id ?? null}
            />
          )}
          {tab === "history" && (
            <HistoryPane
              manuscript={manuscript}
              revisions={revisions}
              now={nowRef.current}
            />
          )}
          {tab === "peer" && (
            <PeerFeedbackGrid
              comments={comments}
              onResolve={resolveComment}
              now={nowRef.current}
            />
          )}
        </main>

        {/* RIGHT — INPUTS + ATTACHMENTS + PEER FEEDBACK PANEL */}
        <aside className="lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-6rem)] flex flex-col gap-4">
          <ReviewInputPanel
            manuscript={manuscript}
            onManuscriptChange={setManuscript}
            onAgentScan={prepareInputScan}
          />

          {/* Attachments panel */}
          <AttachmentsPanel manuscriptId={manuscript.id} />

          <div className="flex flex-col rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] shadow-[0_2px_8px_rgba(22,40,57,0.04)] lg:max-h-[calc(100vh-6rem)]">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-[color:var(--color-outline-variant)] px-5 py-4">
              <MessageSquareText
                className="h-4 w-4 text-[color:var(--color-on-surface-variant)]"
                strokeWidth={1.75}
              />
              <h2 className="font-display text-[15px] font-semibold text-[color:var(--color-on-surface)]">
                Peer Feedback
              </h2>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void runReview()}
                  disabled={!canRunReview}
                  title={
                    reviewInputsReady
                      ? "Run the context-grounded ensemble review"
                      : "Add a review focus in Review Inputs first"
                  }
                  className="inline-flex items-center gap-1.5 rounded bg-[color:var(--color-primary)] px-3 py-1 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40 transition-colors"
                >
                  <MessageSquareText className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {isRunning ? "Reviewing…" : "Run review"}
                </button>
                <span className="rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] bg-[color:var(--color-primary-container)] text-[color:var(--color-on-primary)]">
                  {openCount} Open
                </span>
              </div>
            </div>

            {/* Scrollable comment list */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
              {comments.length === 0 ? (
                <p className="px-2 py-6 text-center text-[13px] italic text-[color:var(--color-on-surface-variant)]">
                  No feedback yet. Press{" "}
                  <span className="not-italic font-medium">Run review</span> above
                  (or type <code className="font-mono not-italic">/review</code> in
                  the composer) to begin.
                </p>
              ) : (
                comments.map((c) => (
                  <CommentCard
                    key={`${c.kind}-${c.id}`}
                    c={c}
                    onResolve={resolveComment}
                    now={nowRef.current}
                  />
                ))
              )}
            </div>

            {/* Agent stream + composer */}
            <div className="border-t border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)]">
              {/* Compact stream window */}
              {session ? (
                <details className="group" open={false}>
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)] [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" strokeWidth={2} />
                    <span className="label-sm flex-1 truncate">
                      Agent · {agentRunLabel(session)} · {sessionStatus}
                    </span>
                  </summary>
                  <div className="max-h-[240px] overflow-y-auto border-t border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-4 py-3 text-[12px]">
                    <SessionStream
                      sessionId={session.id}
                      workflow="manuscript"
                      onStatusChange={setSessionStatus}
                      onTurnComplete={onTurnComplete}
                    />
                  </div>
                </details>
              ) : (
                <div className="px-4 py-2 text-[12px] text-[color:var(--color-on-surface-variant)]">
                  {sessionError
                    ? `Manuscript thread unavailable: ${sessionError}`
                    : "Opening manuscript thread..."}
                </div>
              )}

              {/* Advanced drawer — provider/model/effort + revision tracking */}
              {settingsOpen && (
                <div className="border-t border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-4 py-3 space-y-3">
                  <p className="label">Advanced</p>
                  <ProviderSelector
                    value={provider}
                    onChange={chooseProvider}
                  />
                  {supportsModelEffort(provider) && (
                    <AgentModelEffortPicker
                      provider={provider}
                      model={model}
                      effort={effort}
                      onModelChange={setModel}
                      onEffortChange={setEffort}
                    />
                  )}
                  <p className="text-[11px] italic text-[color:var(--color-on-surface-variant)]">
                    Applies to new sessions. The current thread keeps its
                    provider until closed.
                  </p>
                  <label className="flex items-center justify-between gap-2 border-t border-[color:var(--color-outline-variant)] pt-3 text-[12px] text-[color:var(--color-on-surface-variant)] select-none cursor-pointer">
                    <span>Revision tracking (inline change markers)</span>
                    <span
                      role="switch"
                      aria-checked={revisionTracking}
                      tabIndex={0}
                      onClick={() => setRevisionTracking((v) => !v)}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter") {
                          e.preventDefault();
                          setRevisionTracking((v) => !v);
                        }
                      }}
                      className={`inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors ${
                        revisionTracking
                          ? "bg-[color:var(--color-primary)]"
                          : "bg-[color:var(--color-outline-variant)]"
                      }`}
                    >
                      <span
                        className={`block h-[14px] w-[14px] rounded-full bg-[color:var(--color-on-primary)] transition-transform ${
                          revisionTracking ? "translate-x-[14px]" : "translate-x-[2px]"
                        }`}
                      />
                    </span>
                  </label>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="border-t border-[color:var(--color-error)] bg-[color:var(--color-error-container)] px-4 py-2 text-[12px] text-[color:var(--color-on-error-container)]">
                  {error}
                </div>
              )}

              {/* Composer */}
              <div className="px-3 py-3 border-t border-[color:var(--color-outline-variant)]">
                <PromptComposer
                  value={composerText}
                  onChange={setComposerText}
                  onSubmit={() => {
                    if (canSend) void sendMessage();
                  }}
                  submitOnEnter
                  disabled={!session || isRunning || sending}
                  placeholder={
                    sessionError
                      ? "Manuscript chat unavailable"
                      : isRunning
                      ? "Agent is working…"
                      : "Add a comment · type / for commands"
                  }
                  ariaLabel="Message the manuscript agent"
                  slashCommands={MANUSCRIPT_SLASH_COMMANDS}
                />
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[color:var(--color-on-surface-variant)] tabular">
                    {sessionStatus}
                  </span>
                  {isRunning ? (
                    <button
                      onClick={() => void interrupt()}
                      className="text-[12px] font-medium text-[color:var(--color-error)] hover:underline underline-offset-2"
                    >
                      Halt
                    </button>
                  ) : (
                    <button
                      onClick={() => void sendMessage()}
                      disabled={!canSend}
                      className="rounded bg-[color:var(--color-primary)] px-3 py-1 text-[12px] font-medium text-[color:var(--color-on-primary)] hover:bg-[color:var(--color-primary-container)] disabled:opacity-40 transition-colors"
                    >
                      Send
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── DraftsPane ────────────────────────────────────────────────────────────

function DraftsPane({
  manuscript,
  now,
  revisionTracking,
}: {
  manuscript: Manuscript;
  now: number;
  revisionTracking: boolean;
}) {
  return (
    <article className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-6 sm:px-10 lg:px-14 py-10 lg:py-14">
      {/* Title block */}
      <header className="max-w-[720px] mx-auto">
        <h2
          className="font-display text-[34px] sm:text-[40px] leading-[1.1] tracking-tight text-[color:var(--color-on-surface)] break-words [overflow-wrap:anywhere]"
          style={{ fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          {manuscript.title}
        </h2>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[color:var(--color-on-surface-variant)]">
          {manuscript.research_domain && (
            <span className="font-body italic">{manuscript.research_domain}</span>
          )}
          {(manuscript.research_domain && manuscript.journal_type) && (
            <span aria-hidden className="text-[color:var(--color-outline-variant)]">·</span>
          )}
          {manuscript.journal_type && (
            <span className="font-body italic">for {manuscript.journal_type}</span>
          )}
          {manuscript.study_id && (
            <>
              <span aria-hidden className="text-[color:var(--color-outline-variant)]">·</span>
              <Link
                href={`/methods-workbench/${manuscript.study_id}`}
                className="font-body text-[color:var(--color-on-surface-variant)] underline-offset-2 hover:text-[color:var(--color-on-surface)] hover:underline"
              >
                Methods source
              </Link>
            </>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 label-sm text-[color:var(--color-on-surface-variant)]">
            <Clock className="h-3 w-3" strokeWidth={1.75} />
            Last edited {relativeTime(manuscript.updated_at, now)}
          </span>
        </div>
        <div className="mt-6 h-px bg-[color:var(--color-outline-variant)]" />
      </header>

      {/* Body */}
      <div className="mt-10 max-w-[720px] mx-auto manuscript-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="font-display text-[28px] font-semibold leading-tight mt-10 first:mt-0 mb-4 break-words [overflow-wrap:anywhere]">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="font-display text-[22px] font-semibold leading-snug mt-9 first:mt-0 mb-3 break-words [overflow-wrap:anywhere]">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="font-display text-[18px] font-semibold leading-snug mt-7 first:mt-0 mb-2 break-words [overflow-wrap:anywhere]">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="mb-5 last:mb-0 leading-[32px]">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="mb-5 list-disc pl-6 space-y-1.5">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-5 list-decimal pl-6 space-y-1.5">{children}</ol>
            ),
            blockquote: ({ children }) => (
              <blockquote className="my-6 border-l-2 border-[color:var(--color-outline-variant)] pl-5 italic text-[color:var(--color-on-surface-variant)] text-[17px] leading-[28px]">
                {children}
              </blockquote>
            ),
            code: ({ className, children }) => {
              const inline = !className;
              if (inline) {
                return (
                  <code className="rounded bg-[color:var(--color-surface-container)] px-1.5 py-0.5 font-mono text-[0.92em] text-[color:var(--color-on-surface)]">
                    {children}
                  </code>
                );
              }
              return (
                <pre className="my-5 overflow-x-auto rounded bg-[color:var(--color-surface-container)] px-4 py-3 font-mono text-[13px] leading-snug">
                  <code>{children}</code>
                </pre>
              );
            },
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-[color:var(--color-primary)] underline underline-offset-2 hover:text-[color:var(--color-primary-container)]"
              >
                {children}
              </a>
            ),
            hr: () => (
              <hr className="my-8 border-0 border-t border-[color:var(--color-outline-variant)]" />
            ),
            table: ({ children }) => (
              <div className="my-5 overflow-x-auto">
                <table className="w-full text-[15px] border-collapse">{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)] px-3 py-2 text-left font-semibold">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-[color:var(--color-outline-variant)] px-3 py-2 align-top">
                {children}
              </td>
            ),
          }}
        >
          {manuscript.content_md}
        </ReactMarkdown>

        {!revisionTracking && (
          <p className="mt-8 label-sm text-[color:var(--color-on-surface-variant)] italic">
            Revision tracking is off — agent edits won&apos;t be highlighted inline.
          </p>
        )}
      </div>
    </article>
  );
}

// ─── HistoryPane ───────────────────────────────────────────────────────────

function HistoryPane({
  manuscript,
  revisions,
  now,
}: {
  manuscript: Manuscript;
  revisions: Revision[];
  now: number;
}) {
  const byRound = useMemo(() => {
    const map = new Map<number, Revision[]>();
    for (const r of revisions) {
      const list = map.get(r.round) ?? [];
      list.push(r);
      map.set(r.round, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [revisions]);

  return (
    <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-6 sm:px-10 py-8">
      <header className="mb-6 flex items-center gap-2">
        <History
          className="h-4 w-4 text-[color:var(--color-on-surface-variant)]"
          strokeWidth={1.75}
        />
        <h2 className="font-display text-[18px] font-semibold text-[color:var(--color-on-surface)]">
          Revision History
        </h2>
        <span className="ml-auto label-sm">
          {revisions.length} total · {byRound.length} round
          {byRound.length === 1 ? "" : "s"}
        </span>
      </header>

      {manuscript.primary_file && (
        <section className="mb-8">
          <div className="label mb-2">Primary file</div>
          <div className="inline-flex items-center gap-2 rounded border border-[color:var(--color-outline-variant)] px-3 py-2 text-[13px] text-[color:var(--color-on-surface)]">
            <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
            <code className="font-mono">{manuscript.primary_file}</code>
          </div>
        </section>
      )}

      {byRound.length === 0 ? (
        <p className="py-8 text-[14px] italic text-[color:var(--color-on-surface-variant)]">
          No revisions filed yet. Type{" "}
          <code className="font-mono not-italic">/revise</code> in the composer
          to start.
        </p>
      ) : (
        <ol className="relative space-y-8 border-l border-[color:var(--color-outline-variant)] pl-6 ml-2">
          {byRound.map(([round, list]) => (
            <li key={round} className="relative">
              <span
                aria-hidden
                className="absolute -left-[31px] top-1 h-2.5 w-2.5 rounded-full bg-[color:var(--color-primary)] ring-4 ring-[color:var(--color-surface-container-lowest)]"
              />
              <div className="flex items-baseline gap-3 mb-3">
                <h3 className="font-display text-[16px] font-semibold text-[color:var(--color-on-surface)]">
                  Round {round}
                </h3>
                <span className="label-sm text-[color:var(--color-on-surface-variant)]">
                  {list.length} revision{list.length === 1 ? "" : "s"} ·{" "}
                  {relativeTime(
                    Math.max(...list.map((r) => r.created_at)),
                    now,
                  )}
                </span>
              </div>
              <ul className="space-y-2">
                {list.map((r) => (
                  <li
                    key={r.id}
                    className="rounded border border-[color:var(--color-outline-variant)] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 mb-1 text-[11px]">
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono uppercase tracking-[0.06em] ${CATEGORY_STYLES[r.category] || ""}`}
                      >
                        {r.category}
                      </span>
                      <span className="label-sm capitalize">{r.status}</span>
                      <span className="ml-auto tabular text-[color:var(--color-on-surface-variant)]">
                        {relativeTime(r.created_at, now)}
                      </span>
                    </div>
                    <div className="text-[color:var(--color-on-surface)] max-h-[2.8em] overflow-hidden">
                      <MarkdownText text={r.suggestion_md} compact />
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── PeerFeedbackGrid (center pane version of the right sidebar) ──────────

function PeerFeedbackGrid({
  comments,
  onResolve,
  now,
}: {
  comments: Comment[];
  onResolve: (c: Comment, next: "applied" | "dismissed") => void;
  now: number;
}) {
  if (comments.length === 0) {
    return (
      <div className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-6 py-12 text-center">
        <p className="text-[14px] italic text-[color:var(--color-on-surface-variant)]">
          No findings yet. Type{" "}
          <code className="font-mono not-italic">/review</code> in the composer
          to start.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {comments.map((c) => (
        <CommentCard
          key={`${c.kind}-${c.id}`}
          c={c}
          onResolve={onResolve}
          now={now}
          expanded
        />
      ))}
    </div>
  );
}

// ─── CommentCard ───────────────────────────────────────────────────────────

function CommentCard({
  c,
  onResolve,
  now,
  expanded = false,
}: {
  c: Comment;
  onResolve: (c: Comment, next: "applied" | "dismissed") => void;
  now: number;
  expanded?: boolean;
}) {
  const resolved = c.severity === "Resolved";
  const avatarLetter = CATEGORY_AVATAR_LETTER[c.category];
  const avatarTextColor =
    c.category === "mechanical"
      ? "text-[color:var(--color-primary)]"
      : c.category === "rewrite"
        ? "text-[color:var(--color-tertiary-container)]"
        : c.category === "structural"
          ? "text-[color:var(--color-on-error-container)]"
          : "text-[color:var(--color-primary-container)]";

  return (
    <article
      className={`rounded border transition-colors ${
        resolved
          ? "border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-low)]"
          : "border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] hover:border-[color:var(--color-outline)]"
      }`}
    >
      <div className="px-4 py-3">
        {/* Top row */}
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--color-surface-container-high)] font-mono text-[10px] font-bold ${avatarTextColor}`}
          >
            {avatarLetter}
          </span>
          <span className="label text-[10px] capitalize">{c.category}</span>
          <span
            className={`ml-auto inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${severityChipClass(c.severity)}`}
          >
            {c.severity}
          </span>
        </div>

        {/* Body */}
        <div
          className={`mt-2 overflow-hidden ${
            expanded
              ? "max-h-[12em]"
              : "max-h-[6.5em]"
          } ${
            resolved
              ? "[&_*]:text-[color:var(--color-on-surface-variant)] [&_p]:line-through opacity-70"
              : ""
          }`}
        >
          <MarkdownText text={c.content} compact />
        </div>

        {/* Section ref */}
        {c.section_ref && (
          <p className="mt-2 text-[11px] italic font-body text-[color:var(--color-on-surface-variant)] break-words [overflow-wrap:anywhere]">
            Selected text: &ldquo;{c.section_ref}&rdquo;
          </p>
        )}
      </div>

      {/* Footer */}
      <div
        className={`flex items-center gap-2 border-t px-4 py-2 text-[11px] ${
          resolved
            ? "border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]"
            : "border-[color:var(--color-outline-variant)] text-[color:var(--color-on-surface-variant)]"
        }`}
      >
        <span className="tabular">{relativeTime(c.created_at, now)}</span>
        <span className="ml-auto">
          {resolved ? (
            <span className="inline-flex items-center gap-1 text-[color:var(--color-on-secondary-container)]">
              <Check className="h-3 w-3" strokeWidth={2} />
              Resolved
            </span>
          ) : (
            <label className="flex cursor-pointer items-center gap-1.5 select-none hover:text-[color:var(--color-on-surface)] transition-colors">
              <input
                type="checkbox"
                onChange={() => onResolve(c, "applied")}
                className="h-3 w-3 rounded border-[color:var(--color-outline)] accent-[color:var(--color-primary)]"
              />
              Resolve
            </label>
          )}
        </span>
      </div>
    </article>
  );
}
