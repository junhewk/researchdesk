export const LOCAL_API_TOKEN_HEADER = "x-researchdesk-token";
export const LEGACY_LOCAL_API_TOKEN_HEADER = "x-reviewer-app-token";
export const LOCAL_API_TOKEN_HEADERS = [
  LOCAL_API_TOKEN_HEADER,
  LEGACY_LOCAL_API_TOKEN_HEADER,
] as const;

export function getLocalApiToken(): string | null {
  const token =
    process.env.RESEARCHDESK_APP_TOKEN?.trim() ||
    process.env.REVIEWER_APP_TOKEN?.trim();
  return token || null;
}

export function getApiBaseUrl(explicitBase?: string): string {
  return (
    explicitBase ||
    process.env.RESEARCHDESK_API_URL ||
    process.env.REVIEWER_API_URL ||
    `http://localhost:${process.env.PORT || "3871"}`
  );
}

export function curlAuthArgs(): string {
  const token = getLocalApiToken();
  return token ? `-s -H '${LOCAL_API_TOKEN_HEADER}: ${token}'` : "-s";
}

export function curlJsonHeaders(indent = "  "): string {
  const token = getLocalApiToken();
  const lines = token
    ? [
        `-H '${LOCAL_API_TOKEN_HEADER}: ${token}'`,
        "-H 'Content-Type: application/json'",
      ]
    : ["-H 'Content-Type: application/json'"];

  return lines.map((line) => `${indent}${line} \\`).join("\n");
}
