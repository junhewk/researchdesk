#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");
const appDir = path.join(root, ".release", "desktop-app");
const EXTRA_RUNTIME_PACKAGES = [
  "baseline-browser-mapping",
  "caniuse-lite",
  "@openai/codex",
  "@openai/codex-darwin-arm64",
  "@openai/codex-darwin-x64",
  "@openai/codex-linux-arm64",
  "@openai/codex-linux-x64",
  "@openai/codex-sdk",
  "@openai/codex-win32-arm64",
  "@openai/codex-win32-x64",
  "picocolors",
  "postcss",
  "scheduler",
  "source-map-js",
  "tslib",
];
const NEXT_SERVER_RUNTIME_FILES = [
  "app-page-turbo.runtime.prod.js",
  "app-route-turbo.runtime.prod.js",
];

function rmrf(file) {
  fs.rmSync(file, { recursive: true, force: true });
}

function copy(src, dst, opts = {}) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dst, { recursive: true, ...opts });
}

function standaloneFilter(source) {
  const rel = path.relative(standaloneDir, source).split(path.sep).join("/");
  const top = rel.split("/")[0];
  return top !== "dist" && top !== ".release" && top !== ".git";
}

function copyPackage(name) {
  const src = path.join(root, "node_modules", name);
  if (!fs.existsSync(src)) return;
  const dst = path.join(appDir, "node_modules", name);
  copy(src, dst, {
    filter: (source) => {
      const rel = path.relative(src, source).split(path.sep).join("/");
      return !rel.endsWith(".map") &&
        !rel.startsWith("test/") &&
        !rel.startsWith("tests/") &&
        !rel.startsWith("docs/") &&
        !rel.startsWith("example/") &&
        !rel.startsWith("examples/");
    },
  });
}

function copyNextServerRuntimeFiles() {
  const srcDir = path.join(root, "node_modules", "next", "dist", "compiled", "next-server");
  const dstDir = path.join(appDir, "node_modules", "next", "dist", "compiled", "next-server");
  fs.mkdirSync(dstDir, { recursive: true });
  for (const file of NEXT_SERVER_RUNTIME_FILES) {
    copy(path.join(srcDir, file), path.join(dstDir, file));
  }
}

function readPackage() {
  return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
}

function runtimeDependencies() {
  const nodeModules = path.join(appDir, "node_modules");
  if (!fs.existsSync(nodeModules)) return {};
  const deps = {};
  for (const entry of fs.readdirSync(nodeModules)) {
    if (entry.startsWith(".")) continue;
    if (entry.startsWith("@")) {
      const scopeDir = path.join(nodeModules, entry);
      for (const scoped of fs.readdirSync(scopeDir)) {
        const packageFile = path.join(scopeDir, scoped, "package.json");
        if (!fs.existsSync(packageFile)) continue;
        const pkg = JSON.parse(fs.readFileSync(packageFile, "utf-8"));
        deps[`${entry}/${scoped}`] = pkg.version || "*";
      }
      continue;
    }
    const packageFile = path.join(nodeModules, entry, "package.json");
    if (!fs.existsSync(packageFile)) continue;
    const pkg = JSON.parse(fs.readFileSync(packageFile, "utf-8"));
    deps[entry] = pkg.version || "*";
  }
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
}

function writeRuntimePackage(pkg) {
  const runtimePackage = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    license: pkg.license,
    private: true,
    type: "module",
    main: "electron/main.cjs",
    dependencies: runtimeDependencies(),
  };
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    `${JSON.stringify(runtimePackage, null, 2)}\n`,
  );
}

function main() {
  if (!fs.existsSync(standaloneDir)) {
    throw new Error("missing .next/standalone; run npm run build first");
  }

  rmrf(appDir);
  fs.mkdirSync(appDir, { recursive: true });

  copy(standaloneDir, appDir, { filter: standaloneFilter });
  copyNextServerRuntimeFiles();
  for (const name of EXTRA_RUNTIME_PACKAGES) copyPackage(name);
  copy(path.join(root, ".next", "static"), path.join(appDir, ".next", "static"));
  copy(path.join(root, "public"), path.join(appDir, "public"));
  copy(path.join(root, "electron"), path.join(appDir, "electron"));

  writeRuntimePackage(readPackage());
  console.log(appDir);
}

main();
