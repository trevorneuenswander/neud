#!/usr/bin/env node
/**
 * v0.3.3 Mic Tally color mapping, left/right visual layout swap, and safe upgrade.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PREVIOUS_V032_COLORS =
  "2dc02a2639ed35f08912e4f7f4f6f0c668cea4eaad86b136b75a92401d147f7d";
const PREVIOUS_V033_RC_COLORS_PRE_SWAP =
  "40597dd3ec774457912318928f08db09c36471235c2a1e2bf552a3806a996a93";

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

test("left and right mic boxes swap visually while slot identities stay mapped by data-slot", () => {
  const html = read("desktop/src/displays/bundled/mic-tally-three-mics-uhd-v1.html");
  // Visual positions: 3 on left, 2 center, 1 on right.
  assert.match(html, /\.card\[data-slot="3"\]\s*\{\s*left:\s*215px/);
  assert.match(html, /\.card\[data-slot="2"\]\s*\{\s*left:\s*1495px/);
  assert.match(html, /\.card\[data-slot="1"\]\s*\{\s*left:\s*2775px/);
  // Payload still binds by slot number, not by DOM order / visual side.
  assert.match(
    html,
    /document\.querySelector\('\.card\[data-slot="' \+ slot\.slot \+ '"\]'\)/,
  );
  // Default labels remain Input 1/2/3 on their respective data-slot cards.
  assert.match(
    html,
    /data-slot="1"[\s\S]*?>[\s\S]*?Input 1[\s\S]*?data-slot="2"[\s\S]*?>[\s\S]*?Input 2[\s\S]*?data-slot="3"[\s\S]*?>[\s\S]*?Input 3/,
  );
  // Card geometry unchanged.
  assert.match(html, /width:\s*850px/);
  assert.match(html, /height:\s*250px/);
  assert.match(html, /top:\s*60px/);
});

test("Mic Tally safe-upgrade registers prior packaged hashes including v0.3.3 RC pre-swap", () => {
  const hydration = read("desktop/src/packages/mic-tally/mic-tally-package-display-hydration.ts");
  assert.match(hydration, /MIC_TALLY_UHD_PREVIOUS_PACKAGED_SOURCE_HASHES/);
  assert.match(hydration, new RegExp(PREVIOUS_V032_COLORS));
  assert.match(hydration, new RegExp(PREVIOUS_V033_RC_COLORS_PRE_SWAP));
  const html = read("desktop/src/displays/bundled/mic-tally-three-mics-uhd-v1.html");
  const current = hashRuntimeDisplayBundle(html);
  assert.notEqual(current, PREVIOUS_V032_COLORS);
  assert.notEqual(current, PREVIOUS_V033_RC_COLORS_PRE_SWAP);
  assert.equal(current, "e3cc1c9654ababbb50cd0f04023ea5e032ed73a54e7af29f4c949bae46abd1d3");
});
