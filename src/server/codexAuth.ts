import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { nanoid } from "nanoid";
import { resolveDataDir } from "@/lib/dataDir";

const CODEX_DOWNLOAD_URL = "https://github.com/junhewk/researchdesk/releases/latest";
const CODEX_LOGIN_TIMEOUT_MS = Number(process.env.RESEARCHDESK_CODEX_LOGIN_TIMEOUT_MS || 15 * 60_000);
const CODEX_AUTH_CONFIG = 'cli_auth_credentials_store="file"';

const PLATFORM_PACKAGE_BY_TARGET: Record<string, string> = {
  "x86_64-unknown-linux-musl": "@openai/codex-linux-x64",
  "aarch64-unknown-linux-musl": "@openai/codex-linux-arm64",
  "x86_64-apple-darwin": "@openai/codex-darwin-x64",
  "aarch64-apple-darwin": "@openai/codex-darwin-arm64",
  "x86_64-pc-windows-msvc": "@openai/codex-win32-x64",
  "aarch64-pc-windows-msvc": "@openai/codex-win32-arm64",
};

export interface CodexRuntimeStatus {
  available: boolean;
  error: string | null;
  downloadUrl: string;
  codexBinPath: string | null;
  pathDirs: string[];
}

export interface CodexAuthStatus {
  configured: boolean;
  detail: string | null;
  error: string | null;
  runtimeAvailable: boolean;
  runtimeError: string | null;
  runtimeDownloadUrl: string;
  codexHomePath: string;
  authJsonPath: string;
}

export type CodexLoginMode = "browser" | "device";

export interface CodexLoginStatus {
  id: string;
  status: "starting" | "pending" | "completed" | "failed" | "cancelled";
  mode: CodexLoginMode;
  verificationUrl: string | null;
  userCode: string | null;
  message: string | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
}

interface RuntimeResolution {
  binPath: string;
  pathDirs: string[];
}

interface CodexLoginSession extends CodexLoginStatus {
  child: ChildProcess | null;
  timer: ReturnType<typeof setTimeout> | null;
  output: string;
}

const requireFromHere = createRequire(import.meta.url);
const g = globalThis as unknown as {
  __RESEARCHDESK_CODEX_LOGIN__?: CodexLoginSession;
};

function targetTriple(): string | null {
  if (process.platform === "linux" || process.platform === "android") {
    if (process.arch === "x64") return "x86_64-unknown-linux-musl";
    if (process.arch === "arm64") return "aarch64-unknown-linux-musl";
  }
  if (process.platform === "darwin") {
    if (process.arch === "x64") return "x86_64-apple-darwin";
    if (process.arch === "arm64") return "aarch64-apple-darwin";
  }
  if (process.platform === "win32") {
    if (process.arch === "x64") return "x86_64-pc-windows-msvc";
    if (process.arch === "arm64") return "aarch64-pc-windows-msvc";
  }
  return null;
}

function unpackedAsarPath(file: string): string {
  if (!file.includes(".asar")) return file;
  const unpacked = file.replace(".asar", ".asar.unpacked");
  return fs.existsSync(unpacked) ? unpacked : file;
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDirectory(file: string): boolean {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function existingDirs(...dirs: string[]): string[] {
  return dirs.map(unpackedAsarPath).filter(isDirectory);
}

function resolveCodexPackageJson(platformPackage: string): string | null {
  const packageName = platformPackage.replace("@openai/", "");
  const candidates = [
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "node_modules",
      "@openai",
      packageName,
      "package.json",
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "app.asar",
      "node_modules",
      "@openai",
      packageName,
      "package.json",
    ),
  ];
  try {
    const codexPackageRoot = path.dirname(requireFromHere.resolve("@openai/codex/package.json"));
    candidates.push(path.join(path.dirname(codexPackageRoot), packageName, "package.json"));
  } catch {
    // Bundled Next server code may not expose package.json through require.resolve.
  }
  return candidates.find((candidate) => isFile(unpackedAsarPath(candidate))) ?? null;
}

function resolveCodexRuntime(): RuntimeResolution {
  const triple = targetTriple();
  if (!triple) {
    throw new Error(`Unsupported Codex platform: ${process.platform} (${process.arch})`);
  }
  const platformPackage = PLATFORM_PACKAGE_BY_TARGET[triple];
  if (!platformPackage) {
    throw new Error(`Unsupported Codex target: ${triple}`);
  }

  const packageJsonPath = resolveCodexPackageJson(platformPackage);
  if (!packageJsonPath) {
    throw new Error(`Bundled Codex package was not found: ${platformPackage}.`);
  }
  const vendorRoot = path.join(path.dirname(packageJsonPath), "vendor");
  const packageRoot = path.join(vendorRoot, triple);
  const binary = process.platform === "win32" ? "codex.exe" : "codex";
  const binPath = unpackedAsarPath(path.join(packageRoot, "bin", binary));
  const packageMarker = unpackedAsarPath(path.join(packageRoot, "codex-package.json"));
  if (!isFile(binPath) || !isFile(packageMarker)) {
    throw new Error(`Bundled Codex executable was not found for ${triple}.`);
  }
  return {
    binPath,
    pathDirs: existingDirs(path.join(packageRoot, "codex-path")),
  };
}

export function checkCodexRuntime(): CodexRuntimeStatus {
  try {
    const resolved = resolveCodexRuntime();
    return {
      available: true,
      error: null,
      downloadUrl: CODEX_DOWNLOAD_URL,
      codexBinPath: resolved.binPath,
      pathDirs: resolved.pathDirs,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : String(err),
      downloadUrl: CODEX_DOWNLOAD_URL,
      codexBinPath: null,
      pathDirs: [],
    };
  }
}

export function codexHomePath(): string {
  const home = path.join(resolveDataDir(), "codex-home");
  fs.mkdirSync(home, { recursive: true });
  return home;
}

export function codexWorkspacePath(): string {
  const workspace = path.join(resolveDataDir(), "codex-workspace");
  fs.mkdirSync(workspace, { recursive: true });
  return workspace;
}

export function codexAuthJsonPath(): string {
  return path.join(codexHomePath(), "auth.json");
}

export function hasCodexAuthCache(): boolean {
  try {
    return fs.statSync(codexAuthJsonPath()).size > 0;
  } catch {
    return false;
  }
}

export function codexEnv(runtime = checkCodexRuntime()): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.CODEX_HOME = codexHomePath();
  if (runtime.pathDirs.length > 0) {
    const pathKey = process.platform === "win32"
      ? Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path"
      : "PATH";
    const current = env[pathKey] ?? "";
    const existing = current.split(path.delimiter).filter(Boolean);
    env[pathKey] = [
      ...runtime.pathDirs,
      ...existing.filter((entry) => !runtime.pathDirs.includes(entry)),
    ].join(path.delimiter);
  }
  return env;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function runCodexCommand(args: string[], opts?: { input?: string; timeoutMs?: number }): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  const runtime = checkCodexRuntime();
  if (!runtime.available || !runtime.codexBinPath) {
    throw new Error(runtime.error ?? "Bundled Codex runtime is unavailable.");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(runtime.codexBinPath!, args, {
      env: codexEnv(runtime) as NodeJS.ProcessEnv,
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Codex command timed out."));
    }, opts?.timeoutMs ?? 15_000);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: stripAnsi(stdout).trim(), stderr: stripAnsi(stderr).trim() });
    });
    if (opts?.input) child.stdin?.end(opts.input);
    else child.stdin?.end();
  });
}

export async function getCodexAuthStatus(opts?: { refresh?: boolean }): Promise<CodexAuthStatus> {
  const runtime = checkCodexRuntime();
  const home = codexHomePath();
  const authPath = path.join(home, "auth.json");
  const cached = hasCodexAuthCache();
  if (!runtime.available) {
    return {
      configured: cached,
      detail: cached ? "Cached Codex auth is present, but the bundled runtime is unavailable." : null,
      error: runtime.error,
      runtimeAvailable: false,
      runtimeError: runtime.error,
      runtimeDownloadUrl: runtime.downloadUrl,
      codexHomePath: home,
      authJsonPath: authPath,
    };
  }
  if (cached && !opts?.refresh) {
    return {
      configured: true,
      detail: "Codex ChatGPT auth is configured.",
      error: null,
      runtimeAvailable: true,
      runtimeError: null,
      runtimeDownloadUrl: runtime.downloadUrl,
      codexHomePath: home,
      authJsonPath: authPath,
    };
  }

  const result = await runCodexCommand(["-c", CODEX_AUTH_CONFIG, "login", "status"]);
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return {
    configured: result.code === 0 || cached,
    detail: result.code === 0 ? output || "Codex ChatGPT auth is configured." : null,
    error: result.code === 0 ? null : output || "Not logged in",
    runtimeAvailable: true,
    runtimeError: null,
    runtimeDownloadUrl: runtime.downloadUrl,
    codexHomePath: home,
    authJsonPath: authPath,
  };
}

function publicLoginStatus(session: CodexLoginSession): CodexLoginStatus {
  return {
    id: session.id,
    status: session.status,
    mode: session.mode,
    verificationUrl: session.verificationUrl,
    userCode: session.userCode,
    message: session.message,
    error: session.error,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
  };
}

function parseLoginOutput(session: CodexLoginSession, chunk: string): void {
  session.output += stripAnsi(chunk);
  const url = session.output.match(
    /https:\/\/auth\.openai\.com\/(?:oauth\/authorize\?\S+|codex\/device)/i,
  )?.[0] ?? null;
  const code = session.output.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/)?.[0] ?? null;
  if (url) session.verificationUrl = url;
  if (code) session.userCode = code;
  if (session.mode === "browser" && url && session.status === "starting") {
    session.status = "pending";
    session.message = "Open the sign-in link and complete ChatGPT login in your browser.";
  } else if (session.mode === "device" && url && code && session.status === "starting") {
    session.status = "pending";
    session.message = "Open the verification URL and enter the one-time code.";
  }
}

export function startCodexLogin(mode: CodexLoginMode = "browser"): CodexLoginStatus {
  const active = g.__RESEARCHDESK_CODEX_LOGIN__;
  if (active && (active.status === "starting" || active.status === "pending")) {
    return publicLoginStatus(active);
  }

  const runtime = checkCodexRuntime();
  if (!runtime.available || !runtime.codexBinPath) {
    throw new Error(runtime.error ?? "Bundled Codex runtime is unavailable.");
  }

  const session: CodexLoginSession = {
    id: nanoid(),
    status: "starting",
    mode,
    verificationUrl: null,
    userCode: null,
    message: mode === "browser"
      ? "Starting Codex browser sign-in."
      : "Starting Codex device-code login.",
    error: null,
    startedAt: Math.floor(Date.now() / 1000),
    completedAt: null,
    child: null,
    timer: null,
    output: "",
  };
  const args = mode === "device"
    ? ["-c", CODEX_AUTH_CONFIG, "login", "--device-auth"]
    : ["-c", CODEX_AUTH_CONFIG, "login"];
  const child = spawn(
    runtime.codexBinPath,
    args,
    {
      env: codexEnv(runtime) as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  session.child = child;
  session.timer = setTimeout(() => {
    if (session.status === "starting" || session.status === "pending") {
      session.status = "failed";
      session.error = "Codex ChatGPT login timed out.";
      session.completedAt = Math.floor(Date.now() / 1000);
      child.kill("SIGTERM");
    }
  }, CODEX_LOGIN_TIMEOUT_MS);

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => parseLoginOutput(session, chunk));
  child.stderr?.on("data", (chunk: string) => parseLoginOutput(session, chunk));
  child.once("error", (err) => {
    session.status = "failed";
    session.error = err.message;
    session.completedAt = Math.floor(Date.now() / 1000);
  });
  child.once("exit", (code, signal) => {
    if (session.timer) clearTimeout(session.timer);
    session.child = null;
    session.completedAt = Math.floor(Date.now() / 1000);
    if (session.status === "cancelled" || session.status === "failed") return;
    if (code === 0) {
      session.status = "completed";
      session.message = "Codex ChatGPT login completed.";
      return;
    }
    session.status = "failed";
    session.error = signal
      ? `Codex login exited via ${signal}.`
      : stripAnsi(session.output).trim() || `Codex login exited with code ${code ?? 1}.`;
  });

  g.__RESEARCHDESK_CODEX_LOGIN__ = session;
  return publicLoginStatus(session);
}

export function getCodexLogin(id?: string | null): CodexLoginStatus | null {
  const session = g.__RESEARCHDESK_CODEX_LOGIN__;
  if (!session || (id && session.id !== id)) return null;
  return publicLoginStatus(session);
}

export function cancelCodexLogin(id?: string | null): CodexLoginStatus | null {
  const session = g.__RESEARCHDESK_CODEX_LOGIN__;
  if (!session || (id && session.id !== id)) return null;
  if (session.status === "starting" || session.status === "pending") {
    session.status = "cancelled";
    session.error = null;
    session.message = "Codex login cancelled.";
    session.completedAt = Math.floor(Date.now() / 1000);
    if (session.timer) clearTimeout(session.timer);
    session.child?.kill("SIGTERM");
    session.child = null;
  }
  return publicLoginStatus(session);
}

export async function logoutCodex(): Promise<CodexAuthStatus> {
  const result = await runCodexCommand(["-c", CODEX_AUTH_CONFIG, "logout"], {
    timeoutMs: 30_000,
  });
  if (result.code !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(output || `Codex logout failed with code ${result.code ?? 1}.`);
  }
  return getCodexAuthStatus({ refresh: true });
}
