import { NextRequest, NextResponse } from "next/server";
import { getStudy, listDecisions, getOrCreateArtifact } from "@/server/studies";
import {
  compileArtifact,
  renderArtifactMarkdown,
  ALL_ARTIFACT_KINDS,
} from "@/server/methods/artifacts";
import type { StudyArtifactKind } from "@/server/types";

function isKind(k: string): k is StudyArtifactKind {
  return (ALL_ARTIFACT_KINDS as string[]).includes(k);
}

function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const { id, kind } = await params;
  const study = getStudy(id);
  if (!study || !isKind(kind)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const format = request.nextUrl.searchParams.get("format") ?? "md";
  const compiled = compileArtifact(study, listDecisions(id), kind);
  const stored = getOrCreateArtifact(id, kind);
  const base = `${kind}`;

  if (format === "json") {
    return new NextResponse(JSON.stringify(compiled, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${base}.json"`,
      },
    });
  }

  if (format === "csv") {
    const rows = ["section,heading,ready,body"];
    for (const s of compiled.sections) {
      rows.push(
        [csvCell(s.key), csvCell(s.heading), s.ready ? "ready" : "incomplete", csvCell(s.body_md)].join(
          ",",
        ),
      );
    }
    return new NextResponse(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
      },
    });
  }

  // default: markdown
  return new NextResponse(renderArtifactMarkdown(compiled, stored.override_md), {
    headers: {
      "Content-Type": "text/markdown",
      "Content-Disposition": `attachment; filename="${base}.md"`,
    },
  });
}
