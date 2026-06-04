import { spawn, type SpawnOptions } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface PythonRunInput {
  code: string;
  stdin?: string;
  timeoutMs?: number;
}

export interface PythonRunResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  duration_ms: number;
}

const MAX_OUTPUT_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_CODE_LENGTH = 64 * 1024;

function clipOutput(buf: Buffer[]): string {
  const joined = Buffer.concat(buf);
  if (joined.length <= MAX_OUTPUT_BYTES) return joined.toString("utf8");
  return (
    joined.subarray(0, MAX_OUTPUT_BYTES).toString("utf8") +
    `\n…[truncated ${joined.length - MAX_OUTPUT_BYTES} bytes]`
  );
}

export async function runPython(input: PythonRunInput): Promise<PythonRunResult> {
  if (typeof input.code !== "string" || !input.code.length) {
    throw new Error("code is required");
  }
  if (input.code.length > MAX_CODE_LENGTH) {
    throw new Error(`code exceeds ${MAX_CODE_LENGTH} bytes`);
  }
  const timeoutMs = Math.min(
    Math.max(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 500),
    30_000,
  );

  const dataDir = process.env.REVIEWER_DATA_DIR
    ? path.join(process.env.REVIEWER_DATA_DIR, "sandbox")
    : tmpdir();
  const workdir = await mkdtemp(path.join(dataDir, "python-"));

  const start = Date.now();

  const usePrlimit = process.platform === "linux";
  const cmd = usePrlimit ? "prlimit" : "python3";
  const args = usePrlimit
    ? [
        "--as=536870912",
        "--cpu=10",
        "--nofile=64",
        "--",
        "python3",
        "-I",
        "-c",
        input.code,
      ]
    : ["-I", "-c", input.code];

  return await new Promise<PythonRunResult>((resolve) => {
    let stdout: Buffer[] = [];
    let stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let settled = false;

    const env = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      LANG: process.env.LANG ?? "C.UTF-8",
      HOME: workdir,
      TMPDIR: workdir,
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONUNBUFFERED: "1",
      HTTP_PROXY: "http://127.0.0.1:1",
      HTTPS_PROXY: "http://127.0.0.1:1",
      NO_PROXY: "",
      NO_NETWORK: "1",
    } as unknown as NodeJS.ProcessEnv;
    const spawnOptions: SpawnOptions = {
      cwd: workdir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    };
    const child = spawn(cmd, args, spawnOptions);
    const childStdout = child.stdout;
    const childStderr = child.stderr;
    const childStdin = child.stdin;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);

    childStdout?.on("data", (chunk: Buffer) => {
      if (stdoutBytes >= MAX_OUTPUT_BYTES) return;
      stdout.push(chunk);
      stdoutBytes += chunk.length;
    });
    childStderr?.on("data", (chunk: Buffer) => {
      if (stderrBytes >= MAX_OUTPUT_BYTES) return;
      stderr.push(chunk);
      stderrBytes += chunk.length;
    });

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result: PythonRunResult = {
        exit_code: exitCode,
        stdout: clipOutput(stdout),
        stderr: clipOutput(stderr),
        timed_out: timedOut,
        duration_ms: Date.now() - start,
      };
      rm(workdir, { recursive: true, force: true }).catch(() => undefined);
      resolve(result);
    };

    child.on("error", (err: Error) => {
      stderr.push(Buffer.from(`spawn error: ${err.message}\n`));
      finish(null);
    });
    child.on("close", (code: number | null) => {
      finish(code);
    });

    if (childStdin) {
      if (input.stdin) {
        try {
          childStdin.write(input.stdin);
        } catch {
          // ignore
        }
      }
      try {
        childStdin.end();
      } catch {
        // ignore
      }
    }
  });
}
