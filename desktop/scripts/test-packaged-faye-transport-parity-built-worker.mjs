#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const distLocalSession = path.join(
  repoRoot,
  "workers",
  "data-engine",
  "dist-local",
  "adapters",
  "bag-event-driven-session.js",
);

test("built dist-local worker includes event-driven Faye session module", () => {
  assert.equal(
    fs.existsSync(distLocalSession),
    true,
    `Missing ${path.relative(repoRoot, distLocalSession)} — run npm run build -w @neud/desktop`,
  );
  const source = fs.readFileSync(distLocalSession, "utf8");
  assert.match(source, /installLiveFeedBridgeOnPage/);
  assert.match(source, /fallbackToLegacy/);
});
