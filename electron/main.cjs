const http = require("node:http");
const path = require("node:path");
const { app, BrowserWindow, shell } = require("electron");
const next = require("next");

let server = null;

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
  const nextApp = next({
    dev: !app.isPackaged && process.env.ELECTRON_DEV_NEXT !== "0",
    dir: root,
    hostname: "127.0.0.1",
  });
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
  const url = process.env.ELECTRON_START_URL || await startNextServer();
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
});
