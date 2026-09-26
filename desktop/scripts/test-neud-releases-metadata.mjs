#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

test("current v0.2.2 is marked current and matches package.json", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  const rootPkg = readJson("package.json");
  assert.match(catalog, /version: "0\.2\.2"/);
  assert.match(catalog, /current: true/);
  assert.equal(rootPkg.version, "0.2.2");
});

test("v0.2.2 highlights include Faye and macOS support", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /Apple Silicon macOS support/);
  assert.match(catalog, /Faye\/event-driven Broad Arrow transport/);
  assert.match(catalog, /LED Display \(Quail\)/);
});

test("download page renders from shared release metadata", () => {
  const page = read("src/app/(public)/download/page.tsx");
  assert.match(page, /getCurrentNeudRelease/);
  assert.match(page, /getPreviousNeudReleases/);
  assert.match(page, /ReleaseDownloadSection/);
  assert.match(page, /Previous versions/);
  assert.doesNotMatch(page, /getVersionedWindowsInstallerFilename/);
});

test("Windows and macOS downloads visible for current release", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /version: "0\.2\.2"[\s\S]*platforms:[\s\S]*windows:[\s\S]*supported: true/);
  assert.match(catalog, /version: "0\.2\.2"[\s\S]*macos:[\s\S]*supported: true/);
  assert.match(catalog, /getWindowsInstallerDownloadUrl\(\)/);
  assert.match(catalog, /getMacDmgDownloadUrl\("0\.2\.2"\)/);
});

test("previous versions are listed and only one release is current", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /version: "0\.2\.1"/);
  assert.match(catalog, /version: "0\.2\.0"/);
  const currentFlags = [...catalog.matchAll(/current: (true|false)/g)].map((m) => m[1]);
  assert.equal(currentFlags.filter((v) => v === "true").length, 1);
});

test("v0.2.1 remains downloadable on Windows without macOS download", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  const block = catalog.match(/version: "0\.2\.1"[\s\S]*?},\s*\{/)?.[0] ?? "";
  assert.match(block, /getVersionedWindowsDownloadUrl\("0\.2\.1"\)/);
  assert.match(block, /macos:[\s\S]*supported: false/);
  assert.match(block, /downloadUrl: null/);
});

test("v0.2.0 Windows download uses immutable GitHub release asset URL", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /getVersionedWindowsDownloadUrl\("0\.2\.0"\)/);
  assert.match(catalog, /releases\/download\/v\$\{version\}/);
});

test("GitHub release links match version tags", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /getGitHubReleaseTagUrl\("0\.2\.2"\)/);
  assert.match(catalog, /releases\/tag\/v\$\{version\}/);
});

test("GitHub release body formatter shares highlights with website catalog", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /formatGitHubReleaseBody/);
  assert.match(catalog, /V022_HIGHLIGHTS/);
  assert.match(catalog, /highlights: \[\.\.\.V022_HIGHLIGHTS\]/);
});

test("release notes doc points to authoritative catalog", () => {
  const notes = read("docs/release-notes-v0.2.2.md");
  assert.match(notes, /Apple Silicon macOS/);
  assert.match(notes, /Faye/);
});
