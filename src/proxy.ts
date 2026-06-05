import { NextResponse, type NextRequest } from "next/server";
import {
  getLocalApiToken,
  LOCAL_API_TOKEN_HEADER,
} from "@/lib/localApiAuth";

export function proxy(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  const token = getLocalApiToken();
  if (!token) {
    return NextResponse.next();
  }

  if (request.headers.get(LOCAL_API_TOKEN_HEADER) === token) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: "Unauthorized local app request" },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export const config = {
  matcher: "/api/:path*",
};
