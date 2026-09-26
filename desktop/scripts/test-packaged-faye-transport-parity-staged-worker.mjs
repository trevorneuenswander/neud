#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const stagedSession = path.join(
  repoRoot,
  "desktop",
  "staging",
  "worker",
  "dist",
  "adapters",
  "bag-event-driven-session.js",
);

test("staged packaged worker includes event-driven Faye session module", () => {
  assert.equal(
    fs.existsSync(stagedSession),
    true,
    `Missing ${path.relative(repoRoot, stagedSession)} — run node desktop/scripts/stage-standalone.mjs after desktop build`,
  );
  const source = fs.readFileSync(stagedSession, "utf8");
  assert.match(source, /installLiveFeedBridgeOnPage/);
  assert.match(source, /fallbackToLegacy/);
});
