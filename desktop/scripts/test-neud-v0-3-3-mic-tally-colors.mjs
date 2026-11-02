#!/usr/bin/env node
/**
 * v0.3.3 Mic Tally color mapping + safe bundled HTML upgrade coverage.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function hashRuntimeDisplayBundle(html) {
  const normalized = html.replace(/\r\n/g, "\n").trimEnd();
  return crypto.createHash("sha256").update(`${normalized}\n\n\n`).digest("hex");
}

test("Mic Tally UHD uses bright red LIVE and muted green not-live colors", () => {
  const html = read("desktop/src/displays/bundled/mic-tally-three-mics-uhd-v1.html");
  assert.match(html, /data-status="LIVE"[\s\S]*#ff2020/i);
  assert.match(html, /data-status="MUTED"[\s\S]*#527d65/i);
  assert.match(html, /data-status="FADER_DOWN"[\s\S]*#527d65/i);
  assert.match(html, /data-status="UNKNOWN"[\s\S]*#777777/i);
  // Former inverted palette must not remain.
  assert.doesNotMatch(html, /data-status="LIVE"[\s\S]*#22c55e/);
  assert.doesNotMatch(html, /data-status="MUTED"[\s\S]*#ef4444/);
  assert.match(html, /width:\s*3840px/);
  assert.match(html, /height:\s*2160px/);
  assert.match(html, /background:\s*transparent/);
});

test("v0.3.2 Mic Tally HTML hash is registered for safe upgrade", () => {
  const hydration = read("desktop/src/packages/mic-tally/mic-tally-package-display-hydration.ts");
  assert.match(
    hydration,
    /2dc02a2639ed35f08912e4f7f4f6f0c668cea4eaad86b136b75a92401d147f7d/,
  );
  assert.match(hydration, /MIC_TALLY_UHD_PREVIOUS_PACKAGED_SOURCE_HASHES/);
  const html = read("desktop/src/displays/bundled/mic-tally-three-mics-uhd-v1.html");
  const current = hashRuntimeDisplayBundle(html);
  assert.notEqual(current, "2dc02a2639ed35f08912e4f7f4f6f0c668cea4eaad86b136b75a92401d147f7d");
  assert.equal(current, "40597dd3ec774457912318928f08db09c36471235c2a1e2bf552a3806a996a93");
});
