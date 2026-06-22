// Thin HTTP client for the Reviewer-Agent local app. Every MCP tool is a wrapper
// over an existing /api/* route, so this module is the only place that knows the
// base URL and the short-lived app token (header `x-reviewer-app-token`, matching
// src/lib/localApiAuth.ts). When REVIEWER_APP_TOKEN is unset the app leaves /api
// unauthenticated (src/proxy.ts) and we simply send no token.

const TOKEN_HEADER = "x-reviewer-app-token";

export const BASE =
  process.env.REVIEWER_API_URL?.replace(/\/$/, "") ||
  `http://localhost:${process.env.PORT || "3871"}`;

const TOKEN = process.env.REVIEWER_APP_TOKEN?.trim() || null;

function authHeaders(extra = {}) {
  return TOKEN ? { [TOKEN_HEADER]: TOKEN, ...extra } : { ...extra };
}

async function readBody(res, path, method) {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status} ${res.statusText}: ${text.slice(0, 800)}`,
    );
  }
  return text;
}

/** GET/POST a JSON endpoint and return the parsed object (null on empty body). */
export async function apiJson(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await readBody(res, path, method);
  return text ? JSON.parse(text) : null;
}

/** GET an endpoint that returns plain text (CSV / markdown export). */
export async function apiText(path) {
  const res = await fetch(BASE + path, { headers: authHeaders() });
  return readBody(res, path, "GET");
}

/** POST one or more files as multipart/form-data (the CSV import route).
 * files: Array<{ name: string, data: Buffer | Uint8Array }>. Note: we must NOT
 * set Content-Type — fetch adds the multipart boundary itself. */
export async function apiUpload(path, files, fields = {}) {
  const form = new FormData();
  for (const f of files) {
    form.append("file", new Blob([f.data], { type: "text/csv" }), f.name);
  }
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  const text = await readBody(res, path, "POST");
  return text ? JSON.parse(text) : null;
}
