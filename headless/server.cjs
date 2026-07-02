const http = require("node:http");
const path = require("node:path");
const next = require("next");

const LOCAL_API_TOKEN_HEADER = "x-researchdesk-token";
const LEGACY_LOCAL_API_TOKEN_HEADER = "x-reviewer-app-token";

function getLocalApiToken() {
  return process.env.RESEARCHDESK_APP_TOKEN || process.env.REVIEWER_APP_TOKEN;
}

function normalizeEnv() {
  if (process.env.RESEARCHDESK_DATA_DIR && !process.env.REVIEWER_DATA_DIR) {
    process.env.REVIEWER_DATA_DIR = process.env.RESEARCHDESK_DATA_DIR;
  }
  if (process.env.REVIEWER_DATA_DIR && !process.env.RESEARCHDESK_DATA_DIR) {
    process.env.RESEARCHDESK_DATA_DIR = process.env.REVIEWER_DATA_DIR;
  }
  if (process.env.RESEARCHDESK_APP_TOKEN && !process.env.REVIEWER_APP_TOKEN) {
    process.env.REVIEWER_APP_TOKEN = process.env.RESEARCHDESK_APP_TOKEN;
  }
  if (process.env.REVIEWER_APP_TOKEN && !process.env.RESEARCHDESK_APP_TOKEN) {
    process.env.RESEARCHDESK_APP_TOKEN = process.env.REVIEWER_APP_TOKEN;
  }
}

function isApiRequest(req) {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    return url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function rejectUnauthorizedApiRequest(req, res) {
  if (!isApiRequest(req) || req.method === "OPTIONS") return false;
  const token = getLocalApiToken();
  if (!token) return false;

  for (const header of [LOCAL_API_TOKEN_HEADER, LEGACY_LOCAL_API_TOKEN_HEADER]) {
    const provided = req.headers[header];
    const headerValue = Array.isArray(provided) ? provided[0] : provided;
    if (headerValue === token) return false;
  }

  res.writeHead(401, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ error: "Unauthorized local app request" }));
  return true;
}

async function main() {
  normalizeEnv();
  process.env.NODE_ENV = process.env.NODE_ENV || "production";

  const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
  const port = Number(process.env.PORT || process.env.RESEARCHDESK_PORT || 3871);
  const nextApp = next({
    dev: false,
    dir: root,
    hostname: "127.0.0.1",
  });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();

  const server = http.createServer((req, res) => {
    if (rejectUnauthorizedApiRequest(req, res)) return;
    handler(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("could not bind local Next server");
  }

  const readyUrl = `http://127.0.0.1:${address.port}`;
  process.env.RESEARCHDESK_API_URL = readyUrl;
  process.env.REVIEWER_API_URL = process.env.REVIEWER_API_URL || readyUrl;
  console.log(`READY ${readyUrl}`);

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
