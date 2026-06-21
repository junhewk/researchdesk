import { NextRequest, NextResponse } from "next/server";
import { getStudy } from "@/server/studies";
import { exportRecordsCsv, renderCharacteristics } from "@/server/methods/reviewCorpus";

// GET ?view=records|characteristics & ?format=csv|md
//   records (default)        → round-trip CSV of every record + its decision
//   characteristics          → table of the included sources (csv or md)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getStudy(id)) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  const sp = request.nextUrl.searchParams;
  const view = sp.get("view") ?? "records";
  const format = (sp.get("format") ?? "csv") === "md" ? "md" : "csv";

  if (view === "characteristics") {
    const body = renderCharacteristics(id, format);
    return new NextResponse(body, {
      headers: {
        "Content-Type": format === "md" ? "text/markdown" : "text/csv",
        "Content-Disposition": `attachment; filename="characteristics.${format}"`,
      },
    });
  }

  // default: round-trip records CSV
  return new NextResponse(exportRecordsCsv(id), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="records.csv"`,
    },
  });
}
