#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = process.env.DESKTOP_DIST_DIR
  ? path.resolve(process.env.DESKTOP_DIST_DIR)
  : path.join(root, "dist");
const require = createRequire(import.meta.url);
const { readArchiveHeaderSync } = require("@electron/asar/lib/disk");

const maxPayloadMb = Number(process.env.DESKTOP_APP_PAYLOAD_MAX_MB || 250);
const MB = 1024 * 1024;

function sizeOf(file) {
  const stat = fs.statSync(file);
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of fs.readdirSync(file)) {
    total += sizeOf(path.join(file, entry));
  }
  return total;
}

function walkDir(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    const file = path.join(dir, entry);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) walkDir(file, out);
    else out.push(file);
  }
  return out;
}

function walkAsarNode(prefix, node, out) {
  if (node.size) out.push(prefix);
  if (!node.files) return;
  for (const [name, child] of Object.entries(node.files)) {
    walkAsarNode(`${prefix}/${name}`, child, out);
  }
}

function asarFiles(asarPath) {
  const header = readArchiveHeaderSync(asarPath).header;
  const files = [];
  walkAsarNode("", header, files);
  return files;
}

function targetPlatform(bundleDir) {
  const name = path.basename(bundleDir).toLowerCase();
  if (name.includes("win")) return "win";
  if (name.includes("mac") || name.endsWith(".app")) return "darwin";
  if (name.includes("linux")) return "linux";
  return process.platform === "win32" ? "win" : process.platform;
}

function wrongPlatformPatterns(platform) {
  if (platform === "win") return [/darwin/i, /linux-(x64|arm64)/i];
  if (platform === "darwin") return [/win32/i, /linux-(x64|arm64)/i];
  if (platform === "linux") return [/darwin/i, /win32/i];
  return [];
}

function findAppAsars() {
  return walkDir(distDir)
    .filter((file) => path.basename(file) === "app.asar")
    .filter((file) => !file.includes(`${path.sep}app.asar.unpacked${path.sep}`));
}

function main() {
  if (!fs.existsSync(distDir)) {
    console.log("No dist directory; skipping desktop bundle audit.");
    return;
  }
  const asars = findAppAsars();
  if (asars.length === 0) {
    console.log("No app.asar found; skipping desktop bundle audit.");
    return;
  }

  const failures = [];
  for (const asarPath of asars) {
    const bundleDir = path.dirname(path.dirname(asarPath));
    const unpacked = `${asarPath}.unpacked`;
    const payloadBytes = sizeOf(asarPath) + (fs.existsSync(unpacked) ? sizeOf(unpacked) : 0);
    const payloadMb = payloadBytes / MB;
    const rel = path.relative(root, asarPath);
    console.log(`${rel}: ${payloadMb.toFixed(1)} MB app payload`);
    if (payloadMb > maxPayloadMb) {
      failures.push(`${rel} is ${payloadMb.toFixed(1)} MB; limit is ${maxPayloadMb} MB`);
    }

    const platform = targetPlatform(bundleDir);
    const patterns = wrongPlatformPatterns(platform);
    const files = [
      ...asarFiles(asarPath),
      ...walkDir(unpacked).map((file) => path.relative(unpacked, file)),
    ];
    for (const pattern of patterns) {
      const offender = files.find((file) => pattern.test(file));
      if (offender) {
        failures.push(`${rel} contains wrong-platform file for ${platform}: ${offender}`);
      }
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`Bundle audit failed: ${failure}`);
    process.exit(1);
  }
}

main();
