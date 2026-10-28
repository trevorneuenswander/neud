#!/usr/bin/env node
/**
 * Download + verify the pinned Windows x64 LGPL shared FFmpeg build.
 * Writes vendor/ffmpeg-windows-lgpl/current/{bin,include,lib,...}.
 *
 * See desktop/vendor/ffmpeg-windows-lgpl.lock.json and docs/licensing/ffmpeg-lgpl.md.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = path.join(desktopRoot, "vendor", "ffmpeg-windows-lgpl.lock.json");
const vendorRoot = path.join(desktopRoot, "vendor", "ffmpeg-windows-lgpl");
const currentDir = path.join(vendorRoot, "current");
const cacheDir = path.join(vendorRoot, "cache");

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

if (!String(lock.artifact || "").toLowerCase().includes("lgpl-shared")) {
  console.error("[ffmpeg] Lock artifact must be an lgpl-shared build.");
  process.exit(1);
}
if (String(lock.artifact || "").toLowerCase().includes("-gpl-") &&
    !String(lock.artifact || "").toLowerCase().includes("lgpl")) {
  console.error("[ffmpeg] Refusing GPL FFmpeg artifact.");
  process.exit(1);
}

function fetchToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectsLeft) => {
      https
        .get(currentUrl, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            res.resume();
            follow(res.headers.location, redirectsLeft - 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
            res.resume();
            return;
          }
          const out = createWriteStream(dest);
          pipeline(res, out).then(resolve).catch(reject);
        })
        .on("error", reject);
    };
    follow(url, 8);
  });
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function extractZip(zipPath, destDir) {
  const require = createRequire(import.meta.url);
  // Prefer system tar (Windows 10+ / macOS / Linux) over adding a zip dependency.
  const { spawnSync } = require("node:child_process");
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    const ps = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
    if (ps.status !== 0) {
      throw new Error("Expand-Archive failed for FFmpeg zip");
    }
    return;
  }
  const result = spawnSync("unzip", ["-o", zipPath, "-d", destDir], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error("unzip failed for FFmpeg zip");
  }
}

function findExtractedRoot(extractRoot) {
  const entries = fs.readdirSync(extractRoot, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(extractRoot, e.name));
  for (const dir of dirs) {
    if (fs.existsSync(path.join(dir, "bin")) && fs.existsSync(path.join(dir, "include"))) {
      return dir;
    }
  }
  if (fs.existsSync(path.join(extractRoot, "bin"))) return extractRoot;
  throw new Error(`Could not locate FFmpeg bin/include under ${extractRoot}`);
}

function verifyRequiredDlls(binDir) {
  const dlls = fs.readdirSync(binDir).filter((n) => n.toLowerCase().endsWith(".dll"));
  const missing = [];
  for (const name of lock.requiredLibraries) {
    const found = dlls.some(
      (dll) =>
        dll.toLowerCase().startsWith(name.toLowerCase()) && dll.toLowerCase().endsWith(".dll"),
    );
    if (!found) missing.push(name);
  }
  if (missing.length) {
    throw new Error(`FFmpeg bin missing required DLLs: ${missing.join(", ")}`);
  }
  return dlls;
}

async function main() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const zipPath = path.join(cacheDir, lock.artifact);
  const markerPath = path.join(currentDir, ".neud-ffmpeg-lock-sha256");

  if (
    fs.existsSync(markerPath) &&
    fs.readFileSync(markerPath, "utf8").trim() === lock.sha256 &&
    fs.existsSync(path.join(currentDir, "bin")) &&
    fs.existsSync(path.join(currentDir, "include")) &&
    fs.existsSync(path.join(currentDir, "lib"))
  ) {
    console.log(`[ffmpeg] Using cached LGPL build at ${currentDir}`);
    console.log(`FFMPEG_DIR=${currentDir}`);
    return;
  }

  console.log(`[ffmpeg] Downloading ${lock.artifact}…`);
  await fetchToFile(lock.downloadUrl, zipPath);
  const digest = sha256File(zipPath);
  if (digest.toLowerCase() !== String(lock.sha256).toLowerCase()) {
    console.error(
      `[ffmpeg] SHA-256 mismatch.\n  expected: ${lock.sha256}\n  actual:   ${digest}\n` +
        "Refresh desktop/vendor/ffmpeg-windows-lgpl.lock.json from checksums.sha256.",
    );
    process.exit(1);
  }
  console.log(`[ffmpeg] Checksum OK (${digest.slice(0, 12)}…)`);

  const extractTmp = path.join(cacheDir, `extract-${Date.now()}`);
  fs.rmSync(extractTmp, { recursive: true, force: true });
  extractZip(zipPath, extractTmp);
  const extracted = findExtractedRoot(extractTmp);
  verifyRequiredDlls(path.join(extracted, "bin"));

  fs.rmSync(currentDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(currentDir), { recursive: true });
  fs.renameSync(extracted, currentDir);
  fs.rmSync(extractTmp, { recursive: true, force: true });

  // Licensing + provenance next to the build for packaging.
  const provenance = [
    `NEUD Windows FFmpeg LGPL provenance`,
    `artifact: ${lock.artifact}`,
    `sha256: ${lock.sha256}`,
    `source: ${lock.source}`,
    `download: ${lock.downloadUrl}`,
    `variant: ${lock.variant}`,
    `license: ${lock.license}`,
    ``,
    `Corresponding source: FFmpeg project + BtbN/FFmpeg-Builds recipes for the lgpl-shared variant.`,
    `See docs/licensing/ffmpeg-lgpl.md in the NEUD repository.`,
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(currentDir, "NEUD-FFMPEG-PROVENANCE.txt"), provenance, "utf8");
  fs.writeFileSync(markerPath, `${lock.sha256}\n`, "utf8");

  console.log(`[ffmpeg] Staged LGPL shared build at ${currentDir}`);
  console.log(`FFMPEG_DIR=${currentDir}`);
}

main().catch((err) => {
  console.error("[ffmpeg]", err);
  process.exit(1);
});
