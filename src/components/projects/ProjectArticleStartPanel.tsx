"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";

export function ProjectArticleStartPanel({
  studyId,
}: {
  studyId: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function createArticle() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/studies/${studyId}/article`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reuse_existing: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `article creation failed (${res.status})`);
        return;
      }
      router.push(`/projects/${studyId}/article`);
    });
  }

  return (
    <section className="rounded-lg border border-[color:var(--color-outline-variant)] bg-[color:var(--color-surface-container-lowest)] px-5 py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-[18px] font-semibold text-[color:var(--color-on-surface)]">
            Add the written article
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-[color:var(--color-on-surface-variant)]">
            Review starts once the project has manuscript text. Create an
            article workspace from the setup, then replace or revise the draft
            with your written article.
          </p>
        </div>
        <button
          type="button"
          onClick={createArticle}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded bg-[color:var(--color-primary)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--color-on-primary)] transition-colors hover:bg-[color:var(--color-primary-container)] disabled:opacity-40"
        >
          <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
          {busy ? "Creating..." : "Create article workspace"}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-[12px] text-[color:var(--color-error)]">
          {error}
        </p>
      )}
      <p className="mt-4 text-[12px] text-[color:var(--color-on-surface-variant)]">
        Already have an unrelated article without project setup?{" "}
        <Link
          href="/projects/new/article"
          className="inline-flex items-center gap-1 font-medium text-[color:var(--color-primary)] underline-offset-2 hover:underline"
        >
          Create article-only project
          <ArrowRight className="h-3 w-3" strokeWidth={1.75} />
        </Link>
      </p>
    </section>
  );
}
