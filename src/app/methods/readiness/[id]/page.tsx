import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getReadinessCheck,
  listReadinessItems,
} from "@/server/readinessChecks";
import { getManuscript } from "@/server/manuscripts";
import { getStudy } from "@/server/studies";
import { formatDate } from "@/lib/utils";
import { ReadinessItemsList } from "./ReadinessItemsList";

export const dynamic = "force-dynamic";

export default async function ReadinessCheckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const check = getReadinessCheck(id);
  if (!check) notFound();
  const manuscript = getManuscript(check.manuscript_id);
  const comparedStudy = check.study_id ? getStudy(check.study_id) : undefined;
  const items = listReadinessItems(id);

  const counts = items.reduce(
    (acc, it) => {
      acc[it.severity ?? "minor"] = (acc[it.severity ?? "minor"] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="reveal mx-auto max-w-4xl">
      <Link
        href={
          manuscript
            ? `/my-articles/${manuscript.id}/workspace`
            : "/methods-workbench"
        }
        className="text-[12px] text-[color:var(--color-on-surface-variant)] hover:text-[color:var(--color-on-surface)]"
      >
        &larr; {manuscript?.title ?? "Methods Workbench"}
      </Link>

      <header className="mt-3 mb-6">
        <h1
          className="font-display text-[32px] leading-tight tracking-tight"
          style={{ letterSpacing: "-0.01em" }}
        >
          Readiness check
        </h1>
        <p className="mt-2 text-[12px] font-mono tabular text-[color:var(--color-on-surface-variant)]">
          {[
            `status: ${check.status}`,
            check.overall_score != null ? `score: ${check.overall_score}` : null,
            `confidentiality: ${check.effective_confidentiality}`,
            `started ${formatDate(check.created_at)}`,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
        {comparedStudy && (
          <p className="mt-1 text-[12px] text-[color:var(--color-on-surface-variant)]">
            compared against study:{" "}
            <Link
              href={`/methods/${comparedStudy.id}`}
              className="underline underline-offset-2 hover:text-[color:var(--color-redink)]"
            >
              {comparedStudy.title}
            </Link>
          </p>
        )}
      </header>

      <section className="mb-8 flex flex-wrap gap-4 text-[12px] font-mono">
        <span>critical: {counts.critical ?? 0}</span>
        <span>major: {counts.major ?? 0}</span>
        <span>minor: {counts.minor ?? 0}</span>
        <span>total: {items.length}</span>
      </section>

      {check.summary_md && (
        <section className="mb-8 border-l-2 border-[color:var(--color-outline-variant)] pl-4">
          <h2 className="label mb-2">Summary</h2>
          <p className="text-[14px] whitespace-pre-wrap">{check.summary_md}</p>
        </section>
      )}

      <ReadinessItemsList checkId={id} items={items} />
    </div>
  );
}
