import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStudy } from "@/server/studies";
import { importScopingCsv, importScopingCsvWithMapping, type ImportResult } from "@/server/methods/reviewCorpus";
import {
  CsvImportMappingSchema,
  detectCsvImportKind,
  parseCsvForImport,
} from "@/server/methods/csvImportMapping";

const applySchema = z.object({
  files: z.array(z.object({
    filename: z.string().min(1),
    mapping: CsvImportMappingSchema.optional(),
    overwrite_confirmed: z.boolean().optional(),
  })).default([]),
});

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
  const rawMappings = formData.get("mappings");
  let mappingPayload: unknown = { files: [] };
  try {
    mappingPayload =
      typeof rawMappings === "string" && rawMappings.trim()
        ? JSON.parse(rawMappings)
        : { files: [] };
  } catch {
    return NextResponse.json({ error: "Invalid mappings JSON" }, { status: 400 });
  }
  const parsedMappings = applySchema.safeParse(mappingPayload);
  if (!parsedMappings.success) {
    return NextResponse.json({ error: parsedMappings.error.flatten() }, { status: 400 });
  }
  const mappings = new Map(parsedMappings.data.files.map((item) => [item.filename, item]));

  const results: ImportResult[] = [];
  try {
    for (const file of files) {
      const text = await file.text();
      const rows = parseCsvForImport(text);
      if (rows.length === 0) throw new Error(`${file.name}: empty CSV`);
      const kind = detectCsvImportKind(rows);
      if (kind === "search") {
        results.push(importScopingCsv(id, file.name, text, "search"));
        continue;
      }
      const entry = mappings.get(file.name);
      if (!entry?.mapping) {
        throw new Error(`${file.name}: approved column mapping required`);
      }
      results.push(
        importScopingCsvWithMapping(
          id,
          file.name,
          text,
          entry.mapping,
          { overwriteConfirmed: entry.overwrite_confirmed ?? false },
        ),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ results });
}
