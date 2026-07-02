#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const target =
  process.env.RESEARCHDESK_BUNDLE_TARGET ||
  `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const outRoot = path.join(root, "dist", "headless");
const outDir = path.join(outRoot, `ResearchDesk-Headless-${pkg.version}-${target}`);

const copyEntries = [
  ".next",
  "bin",
  "headless",
  "lib",
  "mcp",
  "src",
  "next.config.ts",
  "package.json",
  "package-lock.json",
];

function rmrf(file) {
  fs.rmSync(file, { recursive: true, force: true });
}

function copyEntry(entry) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) return;
  const dst = path.join(outDir, entry);
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.next${path.sep}cache${path.sep}`),
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: outDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function copyNodeRuntime() {
  const runtimeRoot = path.join(outDir, "runtime", "node");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const sourceBinDir = path.dirname(process.execPath);
  const sourceRoot = path.dirname(sourceBinDir);

  if (process.platform === "win32") {
    const nodeDst = path.join(runtimeRoot, "node.exe");
    fs.copyFileSync(process.execPath, nodeDst);
    for (const entry of fs.readdirSync(sourceBinDir)) {
      if (/^node.*\.dll$/i.test(entry)) {
        fs.copyFileSync(path.join(sourceBinDir, entry), path.join(runtimeRoot, entry));
      }
    }
    return;
  }

  const binDir = path.join(runtimeRoot, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const nodeDst = path.join(binDir, "node");
  fs.copyFileSync(process.execPath, nodeDst);
  fs.chmodSync(nodeDst, 0o755);

  const sourceLibDir = path.join(sourceRoot, "lib");
  if (fs.existsSync(sourceLibDir)) {
    const runtimeLibDir = path.join(runtimeRoot, "lib");
    for (const entry of fs.readdirSync(sourceLibDir)) {
      if (entry.startsWith("libnode.")) {
        fs.mkdirSync(runtimeLibDir, { recursive: true });
        fs.copyFileSync(path.join(sourceLibDir, entry), path.join(runtimeLibDir, entry));
      }
    }
  }
}

function chmodLaunchers() {
  if (process.platform === "win32") return;
  for (const rel of ["bin/researchdesk", "lib/cli.mjs", "mcp/server.mjs"]) {
    const file = path.join(outDir, rel);
    if (fs.existsSync(file)) fs.chmodSync(file, 0o755);
  }
}

function writeManifest() {
  const manifest = {
    name: "ResearchDesk Headless",
    version: pkg.version,
    target,
    node: process.version,
    builtAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
  };
  fs.writeFileSync(
    path.join(outDir, "bundle-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function main() {
  if (!fs.existsSync(path.join(root, ".next"))) {
    throw new Error("missing .next build output; run npm run build first");
  }

  fs.mkdirSync(outRoot, { recursive: true });
  rmrf(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  for (const entry of copyEntries) copyEntry(entry);
  copyNodeRuntime();
  chmodLaunchers();
  writeManifest();

  if (!process.env.RESEARCHDESK_SKIP_BUNDLE_INSTALL) {
    run("npm", ["ci", "--omit=dev"]);
  }

  console.log(outDir);
}

main();
