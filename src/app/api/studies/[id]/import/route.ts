import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import { importScopingCsv, type ImportKind, type ImportResult } from "@/server/methods/reviewCorpus";

// POST multipart/form-data with one or more `file` fields (the search-process
// CSV and/or the records CSV). The shape of each file is auto-detected; an
// optional `kind` form field ("search" | "records") forces it. The user can
// drop both CSVs at once — each is imported and its result returned.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const files = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const forced = formData.get("kind");
  const forceKind =
    forced === "search" || forced === "records" ? (forced as ImportKind) : undefined;

  const results: ImportResult[] = [];
  try {
    for (const file of files) {
      const text = await file.text();
      results.push(importScopingCsv(id, file.name, text, forceKind));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ results });
}
