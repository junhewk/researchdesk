import { NextRequest, NextResponse } from "next/server";
import { convertToMarkdown } from "@/server/upload";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await convertToMarkdown(buffer, file.name);
    return NextResponse.json({
      title: result.metadata.title ?? file.name.replace(/\.[^.]+$/, ""),
      content_md: result.markdown,
      file_format: result.metadata.format,
      original_file: file.name,
      word_count: result.metadata.wordCount,
      page_count: result.metadata.pageCount ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Conversion failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
