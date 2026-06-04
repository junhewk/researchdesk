const mammoth = require("mammoth") as {
  convertToMarkdown(opts: { buffer: Buffer }): Promise<{ value: string }>;
};

export interface ConversionResult {
  markdown: string;
  metadata: {
    title?: string;
    format: "docx" | "pdf" | "md";
    pageCount?: number;
    wordCount: number;
  };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)/m);
  return match?.[1]?.trim();
}

function cleanMammothMarkdown(md: string): string {
  return md
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\r\n/g, "\n")
    .trim();
}

export async function convertToMarkdown(
  buffer: Buffer,
  filename: string,
): Promise<ConversionResult> {
  const ext = filename.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "docx": {
      const result = await mammoth.convertToMarkdown({ buffer });
      const markdown = cleanMammothMarkdown(result.value);
      return {
        markdown,
        metadata: {
          title: extractTitle(markdown),
          format: "docx",
          wordCount: countWords(markdown),
        },
      };
    }
    case "pdf": {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      const markdown = data.text;
      return {
        markdown,
        metadata: {
          title: extractTitle(markdown),
          format: "pdf",
          pageCount: data.numpages,
          wordCount: countWords(markdown),
        },
      };
    }
    case "md":
    case "markdown": {
      const markdown = buffer.toString("utf-8");
      return {
        markdown,
        metadata: {
          title: extractTitle(markdown),
          format: "md",
          wordCount: countWords(markdown),
        },
      };
    }
    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }
}
