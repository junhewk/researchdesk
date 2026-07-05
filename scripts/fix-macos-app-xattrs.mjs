#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const macDir = path.join(root, "dist", "mac-arm64");

if (process.platform !== "darwin" || !fs.existsSync(macDir)) {
  process.exit(0);
}

const apps = fs
  .readdirSync(macDir)
  .filter((name) => name.endsWith(".app"))
  .map((name) => path.join(macDir, name));

for (const appPath of apps) {
  const result = spawnSync("xattr", ["-cr", appPath], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
