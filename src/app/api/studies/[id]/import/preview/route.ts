import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import {
  detectCsvImportKind,
  interpretRecordCsvMapping,
  parseCsvForImport,
  previewSearchCsv,
  type CsvImportPreviewFile,
} from "@/server/methods/csvImportMapping";
import {
  apiProviderSchema,
  isLocalApiProvider,
  resolveApiProvider,
  type ApiProvider,
} from "@/server/apiAgent/providers";

function providerFromForm(formData: FormData): {
  provider: ApiProvider | null;
  model: string | null;
  error: string | null;
} {
  const rawProvider = formData.get("provider");
  const providerWasProvided = typeof rawProvider === "string" && rawProvider.trim() !== "";
  const parsedProvider = providerWasProvided
    ? apiProviderSchema.safeParse(rawProvider)
    : { success: true as const, data: undefined };
  if (!parsedProvider.success) {
    return { provider: null, model: null, error: "Invalid provider" };
  }
  const rawModel = formData.get("model");
  return {
    provider: resolveApiProvider(parsedProvider.data, providerWasProvided),
    model: typeof rawModel === "string" && rawModel.trim() ? rawModel.trim() : null,
    error: null,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const study = getStudy(id);
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const files = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const provider = providerFromForm(formData);
  if (provider.error || !provider.provider) {
    return NextResponse.json({ error: provider.error ?? "Provider required" }, { status: 400 });
  }
  if (study.confidentiality_mode === "local_only" && !isLocalApiProvider(provider.provider)) {
    return NextResponse.json(
      { error: "study is local_only; choose a local provider: ollama, lmstudio, llama_server" },
      { status: 400 },
    );
  }

  const envTimeout = Number(process.env.API_AGENT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 180_000;
  const resolvedProvider = provider.provider;
  const resolvedModel = provider.model;

  let previews: CsvImportPreviewFile[];
  try {
    previews = await Promise.all(
      files.map(async (file) => {
        const text = await file.text();
        const rows = parseCsvForImport(text);
        if (rows.length === 0) throw new Error(`${file.name}: empty CSV`);
        const kind = detectCsvImportKind(rows);
        return kind === "records"
          ? interpretRecordCsvMapping({
              filename: file.name,
              rows,
              config: {
                provider: resolvedProvider,
                model: resolvedModel,
                timeoutMs,
              },
            })
          : previewSearchCsv(file.name, rows);
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import preview failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ files: previews });
}
