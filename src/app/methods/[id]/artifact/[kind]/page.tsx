import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getStudy, listDecisions, getOrCreateArtifact } from "@/server/studies";
import {
  compileArtifact,
  renderArtifactMarkdown,
  ALL_ARTIFACT_KINDS,
} from "@/server/methods/artifacts";
import { MarkdownText } from "@/components/MarkdownText";
import { InfoTip } from "@/components/ui/InfoTip";
import { ARTIFACT_KIND_INFO, ARTIFACT_READY_PCT_EXPLAIN } from "@/lib/methodsLabels";
import type { StudyArtifactKind } from "@/server/types";

export const dynamic = "force-dynamic";

function isKind(k: string): k is StudyArtifactKind {
  return (ALL_ARTIFACT_KINDS as string[]).includes(k);
}

export default async function ArtifactDetailPage({
  params,
}: {
  params: Promise<{ id: string; kind: string }>;
}) {
  const { id, kind } = await params;
  const study = getStudy(id);
  if (!study) redirect("/methods-workbench/studies");
  if (!isKind(kind)) notFound();

  const compiled = compileArtifact(study, listDecisions(id), kind);
  const stored = getOrCreateArtifact(id, kind);
  const md = renderArtifactMarkdown(compiled, stored.override_md);

  return (
    <div className="reveal max-w-3xl">
      <div className="border-b-2 border-[color:var(--color-ink)] pb-3">
        <Link
          href={`/methods-workbench/${id}`}
          className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-redink)]"
        >
          ← {study.title}
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <h1
            className="font-display text-[30px] leading-none tracking-tight"
            style={{ fontVariationSettings: "'opsz' 60, 'wght' 400" }}
          >
            {compiled.title}
          </h1>
          <span className="text-[11px] font-mono uppercase tracking-wide text-[color:var(--color-on-surface-variant)]">
            <InfoTip explain={ARTIFACT_READY_PCT_EXPLAIN} underline={false}>
              {compiled.ready_pct}% ready
            </InfoTip>
          </span>
        </div>
        {ARTIFACT_KIND_INFO[kind] && (
          <p className="mt-1 text-[12px] text-[color:var(--color-on-surface-variant)]">
            {ARTIFACT_KIND_INFO[kind].explain} It updates automatically as you
            work the decision canvas.
          </p>
        )}
        <div className="mt-2 flex gap-3 text-[10px] font-mono uppercase">
          {(
            [
              { fmt: "md", title: "Download as Markdown text" },
              { fmt: "csv", title: "Download as a spreadsheet (CSV)" },
              { fmt: "json", title: "Download as structured data (JSON)" },
            ] as const
          ).map(({ fmt, title }) => (
            <a
              key={fmt}
              href={`/api/studies/${id}/artifacts/${kind}/export?format=${fmt}`}
              title={title}
              className="hover:text-[color:var(--color-redink)]"
            >
              {fmt}
            </a>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <MarkdownText text={md} />
      </div>
    </div>
  );
}
