#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const forbiddenPatterns = [
  /HMG Graphics Server/i,
  /hmg-graphics-server/i,
  /auction-ticker-BACKUP/i,
];

const allowedHmgPatterns = [
  /Hildreth Media Group/i,
  /hildreths\.neud/i,
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("root README uses NEUD branding and current packaging guidance", () => {
  const readme = read("README.md");
  assert.match(readme, /^# NEUD/m);
  assert.match(readme, /npm run dev:desktop/);
  assert.match(readme, /npm run package:win/);
  assert.match(readme, /Alpha v0\.1\.1/);
  assert.match(readme, /bundled/i);
  assert.doesNotMatch(readme, /HMG Graphics Server/i);
});

test("README does not contain obsolete HMG executable or env naming", () => {
  const readme = read("README.md");
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(readme, pattern);
  }
});

test("README may reference Hildreth Media Group as a NEUD team", () => {
  const readme = read("README.md");
  assert.match(readme, allowedHmgPatterns[0]);
});

test("package descriptions use NEUD branding", () => {
  const rootPkg = JSON.parse(read("package.json"));
  const desktopPkg = JSON.parse(read("desktop/package.json"));
  assert.match(rootPkg.description, /NEUD/);
  assert.match(desktopPkg.description, /NEUD/);
});
