#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rcedit } from "rcedit";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..");
const iconPath = path.join(desktopRoot, "build", "icon.ico");
const unpackedExe = path.join(desktopRoot, "release", "win-unpacked", "NEUD.exe");
const packageJsonPath = path.join(repoRoot, "package.json");

function readReleaseVersion() {
  const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const version = typeof parsed.version === "string" ? parsed.version.trim() : "";
  if (!version) {
    throw new Error("Root package.json is missing a release version.");
  }
  return version;
}

if (!fs.existsSync(iconPath)) {
  console.error(`Missing icon: ${iconPath}. Run node scripts/ensure-windows-icon.mjs first.`);
  process.exit(1);
}

if (!fs.existsSync(unpackedExe)) {
  console.error(`Missing unpacked executable: ${unpackedExe}. Run electron-builder --win dir first.`);
  process.exit(1);
}

const releaseVersion = readReleaseVersion();
const dottedVersion = releaseVersion.includes(".")
  ? `${releaseVersion}.0`.replace(/(\.\d+)\.0$/, "$1.0")
  : `${releaseVersion}.0.0.0`;

await rcedit(unpackedExe, {
  icon: iconPath,
  "file-version": dottedVersion,
  "product-version": dottedVersion,
  "version-string": {
    CompanyName: "NEUD",
    FileDescription: "NEUD",
    ProductName: "NEUD",
    InternalName: "NEUD",
    OriginalFilename: "NEUD.exe",
    LegalCopyright: "© 2026 NEUD",
  },
});

console.log(
  JSON.stringify(
    {
      ok: true,
      executable: unpackedExe,
      icon: iconPath,
      version: releaseVersion,
      dottedVersion,
    },
    null,
    2,
  ),
);
