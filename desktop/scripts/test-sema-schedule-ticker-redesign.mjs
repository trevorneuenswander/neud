#!/usr/bin/env node
/**
 * SEMA Schedule Ticker redesign fixture.
 * Asserts SEMA Live branding (near-black, red/magenta accents), no logo column,
 * equal NOW/NEXT/LATER regions, Highlight label support, standardized type sizes,
 * overflow-gated marquee, and 3840×2160 native dimensions.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HTML_REL = "desktop/src/displays/bundled/sema-schedule-ticker-v1.html";

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function stripComments(html) {
  return html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

test("Schedule Ticker is 3840×2160 native with transparent stage", () => {
  const html = read(HTML_REL);
  assert.match(html, /<title>\s*Schedule Ticker\s*<\/title>/i);
  assert.match(html, /name=["']viewport["'][^>]*width=3840/i);
  assert.match(html, /height=2160/i);
  assert.match(html, /--frame-w:\s*3840px/);
  assert.match(html, /--frame-h:\s*2160px/);
  assert.match(html, /data-frame=["']3840x2160["']/);
  assert.match(html, /background:\s*transparent/);
});

test("NOW / NEXT / LATER three equal content regions without logo column", () => {
  const html = read(HTML_REL);
  assert.match(html, />\s*NOW\s*</);
  assert.match(html, />\s*NEXT\s*</);
  assert.match(html, /data-later-label/);
  assert.match(html, /data-slot=["']now["']/);
  assert.match(html, /data-slot=["']next["']/);
  assert.match(html, /data-slot=["']later["']/);
  assert.match(html, /data-field=["']title["']/);
  assert.match(html, /data-field=["']description["']/);
  assert.match(html, /grid-template-columns:\s*1fr\s+1fr\s+1fr/);
  assert.doesNotMatch(html, /--logo-w:/);
  assert.doesNotMatch(html, /logo-mark/);
  assert.doesNotMatch(html, /data:image\/png;base64,/);
  assert.doesNotMatch(html, /grid-template-columns:\s*var\(--logo-w\)/);
});

test("SEMA Live branding — near-black foundation, red + magenta accents", () => {
  const raw = read(HTML_REL);
  const css = stripComments(raw);

  assert.match(css, /--bar-bg:\s*rgba\(\s*[0-1]?[0-9]\s*,\s*[0-1]?[0-9]\s*,\s*[0-2]?[0-9]/i);
  assert.match(css, /--sema-red:\s*#DC1E28/i);
  assert.match(css, /--live-magenta:\s*#E020F0/i);
  assert.match(raw, /SEMA Live schedule ticker/i);

  assert.match(css, /--now-accent:/i);
  assert.match(css, /--next-accent:/i);
  assert.match(css, /--later-accent:/i);
  assert.match(css, /\.section\[data-slot="now"\]\s+\.label\s*\{[^}]*color:\s*var\(--now-accent\)/s);

  assert.doesNotMatch(css, /--bar-bg:\s*#f00\b/i);
  assert.doesNotMatch(css, /--bar-bg:\s*#ff0000\b/i);
  assert.doesNotMatch(css, /--bar-bg:\s*#DC1E28/i);
  assert.doesNotMatch(css, /--bar-bg:\s*rgb\(\s*255\s*,\s*0\s*,\s*0\s*\)/i);
});

test("Highlight keeps audience LATER heading while swapping content", () => {
  const html = read(HTML_REL);
  assert.match(html, /function applyLaterLabel/);
  assert.match(html, /Audience-facing heading is always LATER/);
  assert.match(html, /var text = "LATER"/);
  assert.match(html, /highlightActive/);
  assert.match(html, /data-highlight/);
});

test("standardized type sizes across NOW / NEXT / LATER", () => {
  const css = stripComments(read(HTML_REL));
  assert.match(css, /--label-size:/);
  assert.match(css, /--title-size:/);
  assert.match(css, /--body-size:/);
  assert.doesNotMatch(css, /--title-now:/);
  assert.doesNotMatch(css, /--title-next:/);
  assert.doesNotMatch(css, /--title-later:/);
  assert.doesNotMatch(css, /--body-now:/);
  assert.doesNotMatch(css, /--body-next:/);
  assert.doesNotMatch(css, /--body-later:/);
});

test("overflow-gated marquee helpers remain present", () => {
  const html = read(HTML_REL);
  assert.match(html, /function fitField/);
  assert.match(html, /function startMarquee/);
  assert.match(html, /MARQUEE_PX_PER_SEC/);
  assert.match(html, /TITLE_BASE|BODY_BASE/);
});

test("NEUDDisplay subscribe / message bridge remains wired", () => {
  const html = read(HTML_REL);
  assert.match(html, /NEUDDisplay\.subscribe/);
  assert.match(html, /neud-display-data/);
  assert.match(html, /__SEMA_SCHEDULE_TICKER__/);
});
