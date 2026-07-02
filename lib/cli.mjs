#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PORT = 3871;
const PRODUCT_NAME = "ResearchDesk";

function homeDir() {
  return os.homedir() || process.cwd();
}

function userConfigDir() {
  if (process.env.RESEARCHDESK_CONFIG_DIR) {
    return path.resolve(process.env.RESEARCHDESK_CONFIG_DIR);
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || homeDir(), PRODUCT_NAME);
  }
  if (process.platform === "darwin") {
    return path.join(homeDir(), "Library", "Application Support", PRODUCT_NAME);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homeDir(), ".config"), "researchdesk");
}

function defaultDataDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || homeDir(), PRODUCT_NAME, "data");
  }
  if (process.platform === "darwin") {
    return path.join(homeDir(), "Library", "Application Support", PRODUCT_NAME, "data");
  }
  return path.join(
    process.env.XDG_DATA_HOME || path.join(homeDir(), ".local", "share"),
    "researchdesk",
  );
}

function configPath() {
  return path.join(userConfigDir(), "config.json");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

function normalizeConfig(raw = {}) {
  return {
    port: Number(raw.port || process.env.PORT || DEFAULT_PORT),
    dataDir:
      process.env.RESEARCHDESK_DATA_DIR ||
      process.env.REVIEWER_DATA_DIR ||
      raw.dataDir ||
      defaultDataDir(),
    appToken:
      process.env.RESEARCHDESK_APP_TOKEN ||
      process.env.REVIEWER_APP_TOKEN ||
      raw.appToken ||
      randomBytes(32).toString("hex"),
  };
}

function writeConfig(config) {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

function ensureConfig() {
  const file = configPath();
  const existing = readJson(file);
  const config = normalizeConfig(existing || {});
  if (!existing) {
    writeConfig(config);
  } else if (
    existing.port !== config.port ||
    existing.dataDir !== config.dataDir ||
    existing.appToken !== config.appToken
  ) {
    writeConfig(config);
  }
  fs.mkdirSync(config.dataDir, { recursive: true });
  return config;
}

function nodePath() {
  const candidates =
    process.platform === "win32"
      ? [
          path.join(ROOT, "runtime", "node", "node.exe"),
          path.join(ROOT, "runtime", "node", "bin", "node.exe"),
        ]
      : [
          path.join(ROOT, "runtime", "node", "bin", "node"),
          path.join(ROOT, "runtime", "node", "node"),
        ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || process.execPath;
}

function baseEnv(config, extra = {}) {
  const apiUrl =
    extra.RESEARCHDESK_API_URL ||
    process.env.RESEARCHDESK_API_URL ||
    process.env.REVIEWER_API_URL ||
    `http://localhost:${config.port}`;
  const dataDir =
    process.env.RESEARCHDESK_DATA_DIR ||
    process.env.REVIEWER_DATA_DIR ||
    config.dataDir;
  const token =
    process.env.RESEARCHDESK_APP_TOKEN ||
    process.env.REVIEWER_APP_TOKEN ||
    config.appToken;

  return {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(config.port),
    RESEARCHDESK_DATA_DIR: dataDir,
    REVIEWER_DATA_DIR: dataDir,
    RESEARCHDESK_APP_TOKEN: token,
    REVIEWER_APP_TOKEN: token,
    RESEARCHDESK_API_URL: apiUrl,
    REVIEWER_API_URL: apiUrl,
    ...extra,
  };
}

function runChild(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

function startServer(config, extraEnv = {}, stdio = "inherit") {
  return spawn(nodePath(), [path.join(ROOT, "headless", "server.cjs"), ROOT], {
    cwd: ROOT,
    env: baseEnv(config, extraEnv),
    stdio,
  });
}

function runServer(args) {
  const config = ensureConfig();
  const portIndex = args.indexOf("--port");
  if (portIndex >= 0 && args[portIndex + 1]) {
    config.port = Number(args[portIndex + 1]);
  }
  runChild(nodePath(), [path.join(ROOT, "headless", "server.cjs"), ROOT], {
    env: baseEnv(config),
  });
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("READY ")) {
          settled = true;
          resolve(line.slice("READY ".length).trim());
        } else if (line) {
          process.stderr.write(`${line}\n`);
        }
      }
    });

    child.once("error", (err) => {
      if (!settled) reject(err);
    });
    child.once("exit", (code, signal) => {
      if (!settled) {
        reject(new Error(`server exited before ready (${signal || code})`));
      }
    });
  });
}

function runMcpWithEnv(config, apiUrl) {
  runChild(nodePath(), [path.join(ROOT, "mcp", "server.mjs")], {
    env: baseEnv(config, apiUrl ? { RESEARCHDESK_API_URL: apiUrl, REVIEWER_API_URL: apiUrl } : {}),
  });
}

async function runMcp(args) {
  const config = ensureConfig();
  if (!args.includes("--with-server")) {
    runMcpWithEnv(config);
    return;
  }

  const server = startServer(config, { PORT: "0" }, ["ignore", "pipe", "inherit"]);
  const apiUrl = await waitForReady(server);
  const mcp = spawn(nodePath(), [path.join(ROOT, "mcp", "server.mjs")], {
    cwd: ROOT,
    env: baseEnv(config, {
      PORT: "0",
      RESEARCHDESK_API_URL: apiUrl,
      REVIEWER_API_URL: apiUrl,
    }),
    stdio: "inherit",
  });
  mcp.on("exit", (code, signal) => {
    server.kill();
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

function cliCommandPath() {
  const name = process.platform === "win32" ? "researchdesk.cmd" : "researchdesk";
  const bundled = path.join(ROOT, "bin", name);
  return fs.existsSync(bundled) && fs.existsSync(path.join(ROOT, "runtime", "node"))
    ? bundled
    : process.argv[1];
}

function printConfig(kind) {
  const command = cliCommandPath();
  if (kind === "codex") {
    console.log(`[mcp_servers.researchdesk]
command = ${JSON.stringify(command)}
args = ["mcp", "--with-server"]`);
    return;
  }
  if (kind === "claude") {
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            researchdesk: {
              command,
              args: ["mcp", "--with-server"],
            },
          },
        },
        null,
        2,
      ),
    );
    return;
  }
  throw new Error("usage: researchdesk config codex|claude");
}

async function doctor() {
  const config = ensureConfig();
  const apiUrl =
    process.env.RESEARCHDESK_API_URL ||
    process.env.REVIEWER_API_URL ||
    `http://localhost:${config.port}`;
  console.log(`${PRODUCT_NAME} doctor`);
  console.log(`node: ${nodePath()}`);
  console.log(`config: ${configPath()}`);
  console.log(`data: ${config.dataDir}`);
  console.log(`api: ${apiUrl}`);

  try {
    const res = await fetch(`${apiUrl}/api/studies`, {
      headers: { "x-researchdesk-token": config.appToken },
    });
    console.log(`server: HTTP ${res.status}`);
    process.exit(res.status === 200 || res.status === 401 ? 0 : 1);
  } catch (err) {
    console.log(`server: not reachable (${err instanceof Error ? err.message : String(err)})`);
    process.exit(1);
  }
}

function usage() {
  console.log(`Usage: researchdesk <command>

Commands:
  init                 create user config and data directory
  server [--port N]    run the headless app server on 127.0.0.1
  mcp [--with-server]  run the MCP stdio bridge
  config codex|claude  print MCP client config
  doctor               check local config and server reachability`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "init": {
      const config = ensureConfig();
      console.log(`config: ${configPath()}`);
      console.log(`data: ${config.dataDir}`);
      break;
    }
    case "server":
      runServer(args);
      break;
    case "mcp":
      await runMcp(args);
      break;
    case "config":
      printConfig(args[0]);
      break;
    case "doctor":
      await doctor();
      break;
    case "-h":
    case "--help":
    case undefined:
      usage();
      break;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
