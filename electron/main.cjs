const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, shell } = require("electron");

const LOCAL_API_TOKEN_HEADER = "x-reviewer-app-token";

let server = null;
let serverProcess = null;

function appRoot() {
  if (!app.isPackaged) return path.join(__dirname, "..");

  const asarRoot = path.join(process.resourcesPath, "app.asar");
  return fs.existsSync(asarRoot) ? asarRoot : path.join(process.resourcesPath, "app");
}

function ensureDesktopEnv() {
  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  process.env.REVIEWER_DATA_DIR =
    process.env.REVIEWER_DATA_DIR || path.join(app.getPath("userData"), "data");
  process.env.REVIEWER_APP_TOKEN =
    process.env.REVIEWER_APP_TOKEN || randomBytes(32).toString("hex");
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
  const token = process.env.REVIEWER_APP_TOKEN;
  if (!token) return false;
  const provided = req.headers[LOCAL_API_TOKEN_HEADER];
  const headerValue = Array.isArray(provided) ? provided[0] : provided;
  if (headerValue === token) return false;

  res.writeHead(401, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ error: "Unauthorized local app request" }));
  return true;
}

function isSafeExternalUrl(target) {
  try {
    const parsed = new URL(target);
    return parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function openExternalIfSafe(target) {
  if (isSafeExternalUrl(target)) {
    void shell.openExternal(target);
  }
}

function installLocalApiHeader(win, appUrl) {
  const token = process.env.REVIEWER_APP_TOKEN;
  if (!token) return;

  let origin;
  try {
    origin = new URL(appUrl).origin;
  } catch {
    return;
  }

  win.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [`${origin}/*`] },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          [LOCAL_API_TOKEN_HEADER]: token,
        },
      });
    },
  );
}

async function startNextServer() {
  const root = appRoot();
  const next = require("next");
  const nextApp = next({ dev: false, dir: root, hostname: "127.0.0.1" });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();

  server = http.createServer((req, res) => {
    if (rejectUnauthorizedApiRequest(req, res)) return;
    handler(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("could not bind local Next server");
  }
  return `http://127.0.0.1:${address.port}`;
}

function startNodeNextServer() {
  const root = appRoot();
  const nodeBinary = process.env.ELECTRON_NODE_BINARY || "node";
  const serverScript = path.join(root, "electron", "next-server.cjs");

  return new Promise((resolve, reject) => {
    const child = spawn(nodeBinary, [serverScript, root], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || "production",
        ELECTRON_DEV_NEXT: process.env.ELECTRON_DEV_NEXT || "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess = child;
    let settled = false;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      const readyLine = chunk
        .split(/\r?\n/)
        .find((line) => line.startsWith("READY "));
      if (readyLine && !settled) {
        settled = true;
        resolve(readyLine.slice("READY ".length).trim());
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });

    child.once("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.once("exit", (code, signal) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Next server exited before ready (${signal || code})`));
      }
      if (serverProcess === child) serverProcess = null;
    });
  });
}

function createWindow(url) {
  const appOrigin = new URL(url).origin;
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: "Reviewer Agent",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  installLocalApiHeader(win, url);

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    openExternalIfSafe(target);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, target) => {
    try {
      const targetUrl = new URL(target);
      if (targetUrl.origin === appOrigin) return;
      event.preventDefault();
      openExternalIfSafe(target);
    } catch {
      event.preventDefault();
    }
  });

  void win.loadURL(url);
}

app.whenReady().then(async () => {
  ensureDesktopEnv();
  const url =
    process.env.ELECTRON_START_URL ||
    (app.isPackaged ? await startNextServer() : await startNodeNextServer());
  createWindow(url);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
  });
}).catch((err) => {
  console.error(err);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (server) server.close();
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
