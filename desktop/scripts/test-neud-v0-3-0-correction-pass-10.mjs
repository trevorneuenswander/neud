#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 10 contracts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("STACK: one BrowserWindow host; Stop closes it; ignore-mouse when hideCursor", () => {
  const host = read("desktop/src/output/output-window-host.ts");
  assert.match(host, /private readonly windows = new Map/);
  assert.match(host, /this\.windows\.set\(input\.routeId/);
  assert.match(host, /close\(routeId/);
  assert.match(host, /setIgnoreMouseEvents\(true/);
});

test("STACK: stack-fit uses memoized layers, display-html, stackLayer=1, authored-stage scale", () => {
  const client = read("src/components/displays/DisplayStackFitClient.tsx");
  assert.match(client, /StackLayerIframe/);
  assert.match(client, /memo\(/);
  assert.match(client, /api\/display-html/);
  assert.match(client, /stackLayer:\s*"1"/);
  assert.match(client, /key=\{layer\.displayId\}/);
  assert.match(client, /paintScaleWithZoom/);
  // Program outputs stretch; preview/contain uses fillMode "contain" (not CSS contain:strict).
  assert.match(client, /fillMode:\s*"stretch"\s*\|\s*"contain"/);
  assert.match(client, /data-output-stack-geometry="authored-stage-scale"/);
  assert.match(client, /data-output-stack-layer-count/);
  assert.match(client, /computeStackLayerGeometry/);
  // Geometry probe uses setTimeout, not a polling setInterval.
  assert.doesNotMatch(client, /setInterval\(/);
  assert.doesNotMatch(client, /\/display\/\$\{encodeURIComponent\(projectId\)\}/);
});

test("STACK: runtime sparse recovery for stackLayer mode", () => {
  const runtime = read("public/neud-display-runtime.js");
  assert.match(runtime, /stackLayer/);
  assert.match(runtime, /RECOVERY_POLL_MS = 180000/);
  assert.match(runtime, /if \(!stackLayerMode\) \{\s*startRecoveryWatchdog\(\)/);
});

test("STACK: engine stack URL still one stack-fit compositor", () => {
  const engine = read("desktop/src/output/output-engine-core.ts");
  assert.match(engine, /buildOutputStackRenderUrl/);
  assert.match(engine, /\/display\/stack-fit\?/);
});

test("TICKER: SEMA Live branding tokens + logo + standardized type (v7)", () => {
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  assert.match(html, /#DC1E28|--sema-red/);
  assert.match(html, /#E020F0|--live-magenta/);
  assert.match(html, /data-logo="sema-live-autozone"|sema-live-presented-by-autozone/i);
  assert.match(html, /--label-size:\s*calc\(\s*28px\s*\+\s*7pt\s*\)/);
  assert.match(html, /--title-size:\s*57px/);
  assert.match(html, /--body-size:\s*52px/);
  assert.match(html, /BODY_BASE = 52/);
  assert.match(html, /TITLE_BASE = 57/);
  assert.match(html, /--bar-h:\s*280px/);
  assert.match(html, /--logo-w:\s*576px/);
  assert.match(html, /bottom:\s*0/);
  assert.match(html, /background:\s*transparent/);
  assert.doesNotMatch(html, /--title-now:/);
  assert.doesNotMatch(html, /--title-later:/);
});

test("CONTROLLER: Manual Now/Next/Later editor without schedule jump NOW control", () => {
  const ui = read("src/components/sema/SemaLocalControllerClient.tsx");
  // No discrete schedule-advance NOW action (manual slot editor instead).
  assert.doesNotMatch(ui, /onClick=\{\(\) => void run\("now"\)\}/);
  assert.match(ui, /Manual Controller/);
  assert.match(ui, /SLOT_FIELDS/);
  assert.match(ui, /titleKey/);
  assert.match(ui, /descriptionKey/);
  assert.match(ui, /saveManual/);
  assert.match(ui, /Take on air|takeOnAir/);
  // Slot labels remain as field headers (Now / Next / Later), not PREV/NEXT jump buttons.
  assert.match(ui, /label:\s*"Now"/);
  assert.match(ui, /label:\s*"Next"/);
  assert.match(ui, /label:\s*"Later"/);
});
