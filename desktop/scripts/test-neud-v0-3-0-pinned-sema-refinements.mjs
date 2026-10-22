#!/usr/bin/env node
/**
 * NEUD v0.3.0 — pinned display alignment, REC indicator, SEMA ticker refinements.
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

function stripComments(html) {
  return html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

test("pinned title row is a fixed 18px budget for video and HTML", () => {
  const live = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  const stack = read("src/components/displays/PinnedDisplayStackSlot.tsx");
  assert.match(live, /NAME_ROW_PX = 18/);
  assert.match(stack, /NAME_ROW_PX = 18/);
  assert.match(live, /h-\[18px\]|height: NAME_ROW_PX/);
  assert.match(stack, /h-\[18px\]|height: NAME_ROW_PX/);
  assert.match(live, /overflow-hidden/);
  assert.match(live, /data-pinned-video-controls/);
  assert.match(live, /flex-1/);
});

test("pinned playback buttons are square and override Button sm height", () => {
  const controls = read("src/components/displays/VideoPlaybackControls.tsx");
  assert.match(controls, /!h-4 !w-4/);
  assert.match(controls, /!min-h-4 !min-w-4/);
  assert.doesNotMatch(controls, /PINNED_ICON_BUTTON_CLASS = "h-5 w-5/);
  assert.doesNotMatch(controls, /PINNED_ICON_BUTTON_CLASS = "h-6 w-6/);
});

test("recording Output cards do not show name-row REC", () => {
  const manager = read("src/components/output/OutputManager.tsx");
  assert.doesNotMatch(manager, /data-output-name-rec/);
  assert.match(manager, /data-testid="output-live-status"/);
  assert.match(manager, /STATUS_LABEL/);
  // Global tally still owns title-bar REC
  const tally = read("src/components/output/GlobalOutputTally.tsx");
  assert.match(tally, /label="REC"|label=\{\"REC\"\}|>REC</);
});

test("SEMA ticker background opacity reduced modestly", () => {
  const css = stripComments(read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html"));
  assert.match(css, /--bar-bg:\s*rgba\(\s*8\s*,\s*8\s*,\s*10\s*,\s*0\.85\s*\)/);
  assert.doesNotMatch(css, /--bar-bg:\s*rgba\(\s*8\s*,\s*8\s*,\s*10\s*,\s*0\.92\s*\)/);
  assert.doesNotMatch(css, /--bar-bg:\s*transparent/);
});

test("SEMA logo column is 120% of prior width", () => {
  const css = stripComments(read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html"));
  assert.match(css, /--logo-w:\s*576px/);
  assert.doesNotMatch(css, /--logo-w:\s*480px/);
  assert.match(css, /object-fit:\s*contain/);
});

test("SEMA fonts increased by requested point deltas", () => {
  const css = stripComments(read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html"));
  assert.match(css, /--label-size:\s*calc\(\s*28px\s*\+\s*7pt\s*\)/);
  assert.match(css, /--title-size:\s*57px/);
  assert.match(css, /--body-size:\s*52px/);
  assert.match(css, /var TITLE_BASE = 57|TITLE_BASE = 57/);
  assert.match(css, /var BODY_BASE = 52|BODY_BASE = 52/);
});

test("SEMA NOW/NEXT/LATER share a vertical grid rhythm", () => {
  const css = stripComments(read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html"));
  assert.match(css, /--label-row:/);
  assert.match(css, /--title-row:/);
  assert.match(css, /--desc-row:/);
  assert.match(css, /--content-rows:/);
  assert.match(css, /\.section\s*\{[^}]*grid-template-rows:\s*var\(--label-row\)\s+var\(--content-rows\)/s);
  assert.match(css, /\.content\s*\{[^}]*grid-template-rows:\s*var\(--title-row\)\s+var\(--desc-row\)/s);
  assert.match(css, /grid-template-columns:\s*var\(--logo-w\)\s+1fr\s+1fr\s+1fr/);
});

test("SEMA package baseline bumped for ticker template delivery", () => {
  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION\s*=\s*8/);
});

test("ticker overflow/marquee behavior preserved", () => {
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  assert.match(html, /startMarquee/);
  assert.match(html, /stopMarquee/);
  assert.match(html, /scrollWidth/);
  assert.match(html, /--frame-w:\s*3840px/);
  assert.match(html, /--frame-h:\s*2160px/);
  assert.match(html, /--bar-h:\s*280px/);
});
