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
  assert.match(readme, /Alpha 0\.3\.0/);
  assert.match(readme, /Graphics Without Limits\./);
  assert.match(readme, /bundled|Packaged releases include a compatible Chrome/i);
  assert.doesNotMatch(readme, /HMG Graphics Server/i);
  assert.doesNotMatch(readme, /Ultimate Data Stripper/);
});

test("README does not contain obsolete HMG executable or env naming", () => {
  const readme = read("README.md");
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(readme, pattern);
  }
});

test("README keeps public materials free of private org branding requirements", () => {
  // Public README may mention Hildreth Media Group, but must not require client project names.
  const readme = read("README.md");
  assert.doesNotMatch(readme, /Broad Arrow/i);
  assert.doesNotMatch(readme, /bag-graphics/i);
  void allowedHmgPatterns;
});

test("package descriptions use NEUD branding", () => {
  const rootPkg = JSON.parse(read("package.json"));
  const desktopPkg = JSON.parse(read("desktop/package.json"));
  assert.match(rootPkg.description, /NEUD/);
  assert.match(desktopPkg.description, /NEUD/);
  assert.match(rootPkg.description, /Graphics Without Limits\./);
  assert.match(desktopPkg.description, /Graphics Without Limits\./);
  assert.match(read("README.md"), /Graphics Without Limits\./);
});
