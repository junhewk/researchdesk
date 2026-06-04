"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { RevisionEditor } from "@/components/editor/RevisionEditor";
import { RewritePanel } from "@/components/editor/RewritePanel";
import { RevisionActionBar } from "@/components/editor/RevisionActionBar";
import { fetchJson } from "@/lib/api";
import type { Manuscript, Revision } from "@/server/types";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const manuscriptId = params.id;

  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [activeRewrite, setActiveRewrite] = useState<Revision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [m, r] = await Promise.all([
          fetchJson<Manuscript>(`/api/manuscripts/${manuscriptId}`),
          fetchJson<Revision[]>(`/api/manuscripts/${manuscriptId}/revisions`),
        ]);
        setManuscript(m);
        setRevisions(r);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load editor");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [manuscriptId]);

  const pendingRewrites = revisions.filter(
    (r) => r.category === "rewrite" && r.status === "pending",
  );

  const handleSave = async (content: string) => {
    await fetch(`/api/manuscripts/${manuscriptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_md: content }),
    });
  };

  const handleRewriteSave = async (rewrittenText: string) => {
    if (!activeRewrite) return;
    await fetch(`/api/manuscripts/${manuscriptId}/revisions/${activeRewrite.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_revision: rewrittenText, status: "applied" }),
    });
    setRevisions((prev) =>
      prev.map((r) =>
        r.id === activeRewrite.id ? { ...r, user_revision: rewrittenText, status: "applied" } : r,
      ),
    );
    setActiveRewrite(null);
  };

  if (loading || !manuscript) {
    if (loading) {
      return <div className="py-20 text-center text-[14px] text-[color:var(--color-on-surface-variant)]">Loading…</div>;
    }

    return (
      <div className="py-20 text-center space-y-3">
        <p className="text-[15px] text-[color:var(--color-error)]">
          {error || "Editor unavailable"}
        </p>
        <Link href={`/my-articles/${manuscriptId}`} className="text-[12px] underline underline-offset-4">
          &larr; Back
        </Link>
      </div>
    );
  }

  return (
    <div className="reveal">
      <div className="mb-5 flex items-baseline justify-between">
        <Link href={`/my-articles/${manuscriptId}`} className="text-[12px] text-[color:var(--color-sepia)] hover:text-[color:var(--color-ink)]">
          &larr; {manuscript.title}
        </Link>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-8 h-[calc(100vh-12rem)]">
        <div className="border border-[color:var(--color-rule)] overflow-hidden flex flex-col">
          {activeRewrite ? (
            <RewritePanel
              originalText={activeRewrite.rewrite_context || activeRewrite.revised_md || ""}
              suggestion={activeRewrite.suggestion_md}
              onSave={handleRewriteSave}
              onDismiss={() => setActiveRewrite(null)}
            />
          ) : (
            <RevisionEditor initialContent={manuscript.content_md} onSave={handleSave} />
          )}
        </div>

        <aside className="space-y-8 overflow-y-auto pr-2">
          {pendingRewrites.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <div className="label">Pending rewrites</div>
                <span className="font-mono text-[10px] text-[color:var(--color-sepia)] tabular">{pendingRewrites.length}</span>
              </div>
              <div className="space-y-3">
                {pendingRewrites.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRewrite(r)}
                    className="block w-full text-left border-l border-[color:var(--color-rewrite)] pl-3 py-1 hover:border-[color:var(--color-ink)] transition-colors"
                  >
                    <p className="line-clamp-2 text-[12px] text-[color:var(--color-ink-soft)]">
                      {r.suggestion_md}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="label mb-3">Saved patterns</div>
            <RevisionActionBar />
          </section>
        </aside>
      </div>
    </div>
  );
}
