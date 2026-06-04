import { NextRequest } from "next/server";
import { createSseResponse } from "@/server/events";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return createSseResponse(id, request.signal);
}
