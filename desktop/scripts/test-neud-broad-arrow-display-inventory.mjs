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

test("broad arrow display inventory diagnostic script exists", () => {
  const script = read("scripts/live-validation/diagnose-broad-arrow-display-inventory.mjs");
  assert.match(script, /broad-arrow-auctions/);
  assert.match(script, /stream-bid-display/);
  assert.match(script, /legacy-pylon/);
  assert.match(script, /auction-pylon-display/);
  assert.match(script, /classification/);
  assert.doesNotMatch(script, /html_content/);
});

test("broad arrow obsolete display cleanup defaults to dry run", () => {
  const script = read("scripts/live-validation/cleanup-broad-arrow-obsolete-displays.mjs");
  assert.match(script, /dryRun: !confirm/);
  assert.match(script, /stream-bid-display/);
  assert.match(script, /auction-pylon-display/);
  assert.match(script, /is_archived: true/);
  assert.match(script, /Dry run only/);
});

test("package scripts expose inventory diagnostic and cleanup commands", () => {
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:broad-arrow-display-inventory/);
  assert.match(pkg, /cleanup:broad-arrow-obsolete-displays/);
});
