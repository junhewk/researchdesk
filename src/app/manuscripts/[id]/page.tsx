"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatDate, groupBy } from "@/lib/utils";
import {
  STATUS_STYLES,
  CATEGORY_STYLES,
  SEVERITY_STYLES,
  REVISION_STATUS_STYLES,
} from "@/lib/styles";
import type {
  Manuscript,
  Commentary,
  Revision,
  Review,
  ReviewCategory,
} from "@/server/types";

export default function ManuscriptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [commentaries, setCommentaries] = useState<Commentary[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [revisionRoundFilter, setRevisionRoundFilter] = useState<string>("all");
  const [revisionCategoryFilter, setRevisionCategoryFilter] = useState<string>("all");

  const handleDelete = async () => {
    if (!manuscript) return;
    const confirmed = window.confirm(
      `Erase "${manuscript.title}"?\n\nThis deletes the article, its commentaries, revisions, reviews, and any agent sessions. The markdown export folder is also removed. This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    const res = await fetch(`/api/manuscripts/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/projects");
    } else {
      setDeleting(false);
      window.alert("Failed to delete manuscript.");
    }
  };

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const [mRes, cRes, rvRes, rwRes] = await Promise.all([
          fetch(`/api/manuscripts/${id}`),
          fetch(`/api/manuscripts/${id}/commentaries`),
          fetch(`/api/manuscripts/${id}/revisions`),
          fetch(`/api/manuscripts/${id}/reviews`),
        ]);
        if (!mRes.ok) throw new Error("Manuscript not found");
        const [m, c, rv, rw] = await Promise.all([
          mRes.json(),
          cRes.ok ? cRes.json() : [],
          rvRes.ok ? rvRes.json() : [],
          rwRes.ok ? rwRes.json() : [],
        ]);
        setManuscript(m);
        setCommentaries(c);
        setRevisions(rv);
        setReviews(rw);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load manuscript");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return <div className="py-20 text-center font-display italic text-[18px] text-[color:var(--color-sepia)]">Loading…</div>;
  }

  if (error || !manuscript) {
    return (
      <div className="py-20 text-center space-y-3">
        <p className="font-display italic text-[color:var(--color-redink)] text-[20px]">
          {error || "Manuscript not found"}
        </p>
        <Link href="/projects" className="text-[13px] underline underline-offset-4">
          &larr; Back
        </Link>
      </div>
    );
  }

  const commentaryRounds = groupBy(commentaries, (c) => String(c.round));
  const roundNumbers = Object.keys(commentaryRounds).map(Number).sort((a, b) => a - b);
  const revisionRounds = [...new Set(revisions.map((r) => r.round))].sort();
  const filteredRevisions = revisions.filter((r) => {
    if (revisionRoundFilter !== "all" && r.round !== Number(revisionRoundFilter)) return false;
    if (revisionCategoryFilter !== "all" && r.category !== revisionCategoryFilter) return false;
    return true;
  });
  const reviewsByCategory = groupBy(reviews, (r) => r.category);
  const categoryOrder: ReviewCategory[] = ["mechanical", "rewrite", "structural", "evidence"];
  const projectId = manuscript.study_id ?? id;

  return (
    <div className="reveal">
      <Link href="/projects" className="text-[12px] text-[color:var(--color-sepia)] hover:text-[color:var(--color-ink)]">
        &larr; Research Projects
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="font-display text-[40px] leading-[1.1] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 72, 'wght' 430" }}>
          {manuscript.title}
        </h1>
        <div className="mt-3 flex items-center gap-4 flex-wrap text-[12px] text-[color:var(--color-sepia)]">
          <span className={`px-2 py-0.5 text-[10px] tracking-wide uppercase font-mono ${STATUS_STYLES[manuscript.status] || ""}`}>
            {manuscript.status.replace("_", " ")}
          </span>
          {manuscript.research_domain && <span>{manuscript.research_domain}</span>}
          {manuscript.research_type && <span>· {manuscript.research_type.replace("-", " ")}</span>}
          {manuscript.journal_type && <span className="italic font-display">· for {manuscript.journal_type}</span>}
          {manuscript.study_id && (
            <Link
              href={`/projects/${manuscript.study_id}/setup`}
              className="italic font-display underline-offset-2 hover:underline"
            >
              · setup source
            </Link>
          )}
          <span className="ml-auto font-mono tabular">
            {formatDate(manuscript.updated_at)}
          </span>
        </div>
        {!manuscript.study_id && (
          <p className="mt-3 max-w-2xl border-l-2 border-[color:var(--color-outline-variant)] pl-3 text-[12px] text-[color:var(--color-sepia)]">
            No source methods are linked. This direct article can be reviewed,
            but readiness checks cannot compare it against a Workbench plan.
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          <Link href={`/projects/${projectId}/article`} className="px-4 py-1.5 text-[12px] bg-[color:var(--color-ink)] text-[color:var(--color-paper)] hover:bg-[color:var(--color-redink)] transition-colors">
            Open workspace
          </Link>
          <Link href={`/projects/${projectId}/lifecycle`} className="px-4 py-1.5 text-[12px] border border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-paper)] transition-colors">
            Lifecycle
          </Link>
          <Link href={`/projects/${projectId}/editor`} className="px-4 py-1.5 text-[12px] border border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-paper)] transition-colors">
            Editor
          </Link>
          {manuscript.study_id && (
            <Link
              href={`/projects/${manuscript.study_id}/setup`}
              className="px-4 py-1.5 text-[12px] border border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-paper)] transition-colors"
            >
              Setup
            </Link>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto text-[12px] text-[color:var(--color-sepia)] hover:text-[color:var(--color-redink)] disabled:opacity-40 transition-colors"
          >
            {deleting ? "Erasing…" : "Erase article"}
          </button>
        </div>
      </div>

      <Tabs defaultValue="content" className="space-y-6">
        <TabsList className="bg-transparent border-b border-[color:var(--color-rule)] rounded-none p-0 h-auto gap-6 w-full justify-start">
          {[
            { v: "content", label: "Content" },
            { v: "commentaries", label: `Commentaries (${commentaries.length})` },
            { v: "revisions", label: `Revisions (${revisions.length})` },
            { v: "reviews", label: `Reviews (${reviews.length})` },
          ].map((t) => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="text-[12px] rounded-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-[color:var(--color-ink)] data-[state=active]:border-b data-[state=active]:border-[color:var(--color-ink)] data-[state=active]:shadow-none px-0 pb-3 -mb-[1px] border-b border-transparent text-[color:var(--color-sepia)]"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="content">
          <article className="font-body whitespace-pre-wrap text-[15px] leading-[1.75] text-[color:var(--color-ink)] max-w-[65ch]">
            {manuscript.content_md}
          </article>
        </TabsContent>

        <TabsContent value="commentaries" className="space-y-8">
          {roundNumbers.length === 0 ? (
            <p className="py-12 text-center font-display italic text-[18px] text-[color:var(--color-sepia)]">
              No commentaries yet.
            </p>
          ) : (
            roundNumbers.map((round) => (
              <section key={round}>
                <div className="label mb-4">Round {round}</div>
                <div className="space-y-5">
                  {commentaryRounds[String(round)].map((c) => (
                    <article key={c.id}>
                      <div className="flex items-baseline gap-3 mb-1">
                        <span className="font-display italic text-[14px] text-[color:var(--color-ink)]">
                          {c.reviewer_label || "Reviewer"}
                        </span>
                        <span className="font-mono text-[10px] text-[color:var(--color-sepia)] tabular">
                          {formatDate(c.created_at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[color:var(--color-ink)]">
                        {c.content_md}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </TabsContent>

        <TabsContent value="revisions" className="space-y-6">
          <div className="flex items-center gap-3 text-[12px]">
            <Select value={revisionRoundFilter} onValueChange={setRevisionRoundFilter}>
              <SelectTrigger className="w-32 h-8 rounded-none border-[color:var(--color-rule)] bg-transparent text-[12px]">
                <SelectValue placeholder="Round" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rounds</SelectItem>
                {revisionRounds.map((r) => (
                  <SelectItem key={r} value={String(r)}>Round {r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={revisionCategoryFilter} onValueChange={setRevisionCategoryFilter}>
              <SelectTrigger className="w-36 h-8 rounded-none border-[color:var(--color-rule)] bg-transparent text-[12px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="mechanical">Mechanical</SelectItem>
                <SelectItem value="rewrite">Rewrite</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[color:var(--color-sepia)] font-mono tabular">
              {filteredRevisions.length}
            </span>
          </div>

          {filteredRevisions.length === 0 ? (
            <p className="py-12 text-center font-display italic text-[18px] text-[color:var(--color-sepia)]">
              No revisions.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-rule)] border-t border-[color:var(--color-rule)]">
              {filteredRevisions.map((r) => (
                <li key={r.id} className="py-4">
                  <div className="flex items-center gap-2 mb-1.5 text-[11px]">
                    <span className={`px-1.5 py-0.5 text-[10px] tracking-wide uppercase font-mono ${CATEGORY_STYLES[r.category] || ""}`}>
                      {r.category}
                    </span>
                    <span className={`px-1.5 py-0.5 text-[10px] tracking-wide uppercase font-mono ${REVISION_STATUS_STYLES[r.status] || ""}`}>
                      {r.status}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-[color:var(--color-sepia)] tabular">
                      Round {r.round}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-[14px] leading-relaxed">
                    {r.suggestion_md}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="reviews" className="space-y-10">
          {reviews.length === 0 ? (
            <p className="py-12 text-center font-display italic text-[18px] text-[color:var(--color-sepia)]">
              No reviews.
            </p>
          ) : (
            categoryOrder
              .filter((cat) => reviewsByCategory[cat]?.length)
              .map((cat) => (
                <section key={cat}>
                  <div className="label mb-4">{cat} · {reviewsByCategory[cat].length}</div>
                  <div className="space-y-5">
                    {reviewsByCategory[cat].map((rv) => (
                      <article key={rv.id}>
                        <div className="flex items-center gap-3 mb-1.5 flex-wrap text-[11px]">
                          {rv.severity && (
                            <span className={`px-1.5 py-0.5 text-[10px] tracking-wide uppercase font-mono border ${SEVERITY_STYLES[rv.severity] || ""}`}>
                              {rv.severity}
                            </span>
                          )}
                          {rv.section_ref && (
                            <span className="italic font-display text-[13px] text-[color:var(--color-sepia)]">
                              {rv.section_ref}
                            </span>
                          )}
                          <span className="ml-auto font-mono text-[10px] text-[color:var(--color-sepia)] tabular">
                            {formatDate(rv.created_at)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
                          {rv.content_md}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
