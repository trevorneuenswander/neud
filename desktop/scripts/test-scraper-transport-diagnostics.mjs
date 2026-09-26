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

test("transport formatter maps faye dom and legacy labels", () => {
  const source = read("src/lib/data-engines/scraper-transport-diagnostics.ts");
  assert.match(source, /return "Faye"/);
  assert.match(source, /return "DOM"/);
  assert.match(source, /return "Legacy Polling"/);
  assert.match(source, /Fallback from/);
});
