export const LOCAL_API_TOKEN_HEADER = "x-reviewer-app-token";

export function getLocalApiToken(): string | null {
  const token = process.env.REVIEWER_APP_TOKEN?.trim();
  return token || null;
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
