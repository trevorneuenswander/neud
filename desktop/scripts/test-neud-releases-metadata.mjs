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

test("current v0.2.4 is marked current and matches package.json", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  const rootPkg = readJson("package.json");
  assert.match(catalog, /version: "0\.2\.4"/);
  assert.match(catalog, /current: true/);
  assert.equal(rootPkg.version, "0.2.4");
  assert.equal([...catalog.matchAll(/current: true/g)].length, 1);
});

test("v0.2.3 summary covers fresh-install display recovery", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /Fresh-install display recovery and cross-device published-display synchronization/);
  assert.match(catalog, /Stream Bid, Stream Ticker, and LED Display \(Quail\)/);
});

test("v0.2.2 remains a previous cross-platform release", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /Improved Faye live-data support in packaged apps/);
  assert.match(catalog, /LED Display \(Quail\)/);
  assert.match(catalog, /version: "0\.2\.2"/);
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
  assert.match(catalog, /version: "0\.2\.4"[\s\S]*?platforms:[\s\S]*?windows:[\s\S]*?supported: true/);
  assert.match(catalog, /version: "0\.2\.4"[\s\S]*?macos:[\s\S]*?supported: true/);
  assert.match(catalog, /Apple Silicon \(arm64\)/);
  assert.match(catalog, /Intel Macs are not supported/);
  assert.match(catalog, /getVersionedWindowsDownloadUrl\("0\.2\.4"\)/);
  assert.match(catalog, /getMacDmgDownloadUrl\("0\.2\.4"\)/);
});

test("previous versions are listed and only one release is current", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /version: "0\.2\.3"/);
  assert.match(catalog, /version: "0\.2\.2"/);
  assert.match(catalog, /version: "0\.2\.1"/);
  assert.match(catalog, /version: "0\.2\.0"/);
  assert.match(catalog, /getVersionedWindowsDownloadUrl\("0\.2\.3"\)/);
  assert.match(catalog, /getVersionedWindowsDownloadUrl\("0\.2\.2"\)/);
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
  assert.match(catalog, /getGitHubReleaseTagUrl\("0\.2\.4"\)/);
  assert.match(catalog, /getGitHubReleaseTagUrl\("0\.2\.3"\)/);
  assert.match(catalog, /getGitHubReleaseTagUrl\("0\.2\.2"\)/);
  assert.match(catalog, /releases\/tag\/v\$\{version\}/);
});

test("GitHub release body formatter shares highlights with website catalog", () => {
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /formatGitHubReleaseBody/);
  assert.match(catalog, /V024_HIGHLIGHTS/);
  assert.match(catalog, /highlights: \[\.\.\.V024_HIGHLIGHTS\]/);
  assert.match(catalog, /V022_HIGHLIGHTS/);
  assert.match(catalog, /highlights: \[\.\.\.V022_HIGHLIGHTS\]/);
});

test("release notes doc points to authoritative catalog", () => {
  const current = read("docs/releases/v0.2.4-github-release-notes.md");
  assert.match(current, /NEUD v0\.2\.4/);
  assert.match(current, /Apple Silicon/);
  assert.match(current, /Intel Macs are not supported/);
  const notes = read("docs/releases/v0.2.3-github-release-notes.md");
  assert.match(notes, /fresh installations/);
  assert.match(notes, /Stream Bid, Stream Ticker, and LED Display \(Quail\)/);
  const prior = read("docs/release-notes-v0.2.2.md");
  assert.match(prior, /Apple Silicon macOS/);
  assert.match(prior, /Faye/);
});
