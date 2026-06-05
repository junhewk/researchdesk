const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, shell } = require("electron");

let server = null;
let serverProcess = null;

function appRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
}

function ensureDesktopEnv() {
  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  process.env.REVIEWER_DATA_DIR =
    process.env.REVIEWER_DATA_DIR || path.join(app.getPath("userData"), "data");
}

async function startNextServer() {
  const root = appRoot();
  const next = require("next");
  const nextApp = next({ dev: false, dir: root, hostname: "127.0.0.1" });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();

  server = http.createServer((req, res) => handler(req, res));
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

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
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
