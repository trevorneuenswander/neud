#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 9 contracts.
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

test("Computer Display output loads display-html directly (no nested /display Next.js page)", () => {
  const engine = read("desktop/src/output/output-engine-core.ts");
  assert.match(engine, /api\/display-html/);
  assert.match(engine, /Do NOT nest \/display/);
  const exactMatch = engine.match(/export function buildOutputRenderUrl[\s\S]*?return `\$\{origin\}\/display\/window-fit/);
  assert.ok(exactMatch);
  assert.match(exactMatch[0], /api\/display-html/);
  assert.doesNotMatch(exactMatch[0], /\/display\/\$\{encodeURIComponent\(input\.projectId\)\}/);
});

test("stack-fit layers use display-html and stable iframe keys", () => {
  const stack = read("src/components/displays/DisplayStackFitClient.tsx");
  assert.match(stack, /api\/display-html/);
  assert.match(stack, /key=\{layer\.displayId\}/);
  assert.doesNotMatch(stack, /\/display\/\$\{encodeURIComponent\(projectId\)\}/);
});

test("HtmlDisplayOutputView does not poll cursor injection on an interval", () => {
  const view = read("src/components/displays/broad-arrow/HtmlDisplayOutputView.tsx");
  assert.doesNotMatch(view, /setInterval\(apply,\s*500\)/);
  assert.match(view, /addEventListener\("load"/);
});

test("mac output mouse monitor early-exits for non-output windows", () => {
  const mac = read("desktop/native/mac-output/mac-output.mm");
  assert.match(mac, /event\.window != target/);
  assert.match(mac, /!current\.hideCursor/);
});

test("DisplayViewerScaledCanvas skips redundant scale state updates", () => {
  const canvas = read("src/components/displays/DisplayViewerScaledCanvas.tsx");
  assert.match(canvas, /prev\.width === viewportWidth/);
  assert.match(canvas, /prev === measurements\.scale/);
});

test("Stream Bid title uses current pass22 layout (supersedes Pass 15 renderer)", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /data-title-layout="pass22"/);
  assert.match(html, /applyTitleFontMetrics/);
  assert.match(html, /--title-bottom-safety/);
  assert.match(html, /__streamBidCaptureTitleGeometry/);
  assert.doesNotMatch(html, /transform-box\s*:\s*fill-box/);
  assert.doesNotMatch(html, /data-title-layout="pass14"/);
});

test("Schedule Pylon carries SEMA Live brand identity", () => {
  const html = read("desktop/src/displays/bundled/sema-schedule-pylon-v1.html");
  assert.match(html, /SEMA/i);
  assert.match(html, /LIVE/i);
  assert.match(html, /#DC1E28|#E020F0|magenta|neon/i);
  assert.match(html, /left:\s*0/);
  assert.match(html, /3840/);
  assert.match(html, /2160/);
  assert.match(html, /background:\s*transparent/);
  assert.match(html, />\s*NOW\s*</);
  assert.match(html, />\s*NEXT\s*</);
  assert.match(html, />\s*LATER\s*</);
});
