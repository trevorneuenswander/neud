#!/usr/bin/env node
/**
 * SEMA Schedule Ticker redesign fixture (Pass 10 Item 2).
 * Asserts SEMA Live branding (near-black, red/magenta accents), logo placeholder,
 * equal NOW/NEXT/LATER regions, standardized type sizes, overflow-gated marquee,
 * and 3840×2160 native dimensions.
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

test("NOW / NEXT / LATER three equal content regions after logo placeholder", () => {
  const html = read(HTML_REL);
  assert.match(html, />\s*NOW\s*</);
  assert.match(html, />\s*NEXT\s*</);
  assert.match(html, />\s*LATER\s*</);
  assert.match(html, /data-slot=["']now["']/);
  assert.match(html, /data-slot=["']next["']/);
  assert.match(html, /data-slot=["']later["']/);
  assert.match(html, /data-field=["']title["']/);
  assert.match(html, /data-field=["']description["']/);
  // Equal content columns after logo footprint
  assert.match(html, /grid-template-columns:\s*var\(--logo-w\)\s+1fr\s+1fr\s+1fr/);
});

test("SEMA Live branding — near-black foundation, red + magenta accents", () => {
  const raw = read(HTML_REL);
  const css = stripComments(raw);

  // Near-black foundation (match Schedule Pylon)
  assert.match(css, /--bar-bg:\s*rgba\(\s*[0-1]?[0-9]\s*,\s*[0-1]?[0-9]\s*,\s*[0-2]?[0-9]/i);
  assert.match(css, /--sema-red:\s*#DC1E28/i);
  assert.match(css, /--live-magenta:\s*#E020F0/i);
  assert.match(raw, /SEMA Live|logo-mark|sema-live-autozone/i);

  // Schedule accents remain on labels
  assert.match(css, /--now-accent:/i);
  assert.match(css, /--next-accent:/i);
  assert.match(css, /--later-accent:/i);
  assert.match(css, /\.section\[data-slot="now"\]\s+\.label\s*\{[^}]*color:\s*var\(--now-accent\)/s);

  // Bar fill is not solid brand red (accents OK; fill stays near-black)
  assert.doesNotMatch(css, /--bar-bg:\s*#f00\b/i);
  assert.doesNotMatch(css, /--bar-bg:\s*#ff0000\b/i);
  assert.doesNotMatch(css, /--bar-bg:\s*#DC1E28/i);
  assert.doesNotMatch(css, /--bar-bg:\s*rgb\(\s*255\s*,\s*0\s*,\s*0\s*\)/i);
});

test("dedicated SEMA Live Presented by AutoZone logo on the left", () => {
  const html = read(HTML_REL);
  assert.match(html, /data-logo=["']sema-live-autozone["']/i);
  assert.match(html, /SEMA Live Presented by AutoZone/i);
  assert.match(html, /<img[^>]+src=["']data:image\/png;base64,/i);
  assert.match(html, /object-fit:\s*contain/i);
  assert.doesNotMatch(html, /LOGO PLACEHOLDER/i);
  assert.ok(fs.existsSync(path.join(repoRoot, "public/displays/sema/sema-live-autozone-logo.png")));
  assert.ok(
    fs.existsSync(
      path.join(repoRoot, "desktop/src/displays/bundled/assets/sema-live-autozone-logo.png"),
    ),
  );
});

test("standardized type sizes across NOW / NEXT / LATER", () => {
  const css = stripComments(read(HTML_REL));
  assert.match(css, /--label-size:/);
  assert.match(css, /--title-size:/);
  assert.match(css, /--body-size:/);
  // No per-slot title/body size tokens
  assert.doesNotMatch(css, /--title-now:/);
  assert.doesNotMatch(css, /--title-next:/);
  assert.doesNotMatch(css, /--title-later:/);
  assert.doesNotMatch(css, /--body-now:/);
  assert.doesNotMatch(css, /--body-next:/);
  assert.doesNotMatch(css, /--body-later:/);
});

test("bar taller for phone-stream readability and flush to bottom", () => {
  const css = stripComments(read(HTML_REL));
  assert.match(css, /--bar-h:\s*(2[6-9]\d|300)px/);
  assert.match(css, /\.bar\s*\{[^}]*bottom:\s*0/s);
  assert.doesNotMatch(css, /--bar-y:/);
  assert.doesNotMatch(css, /\.bar\s*\{[^}]*top:\s*var\(--bar-y\)/s);
});

test("marquee is gated on overflow; shrink-to-fit precedes scroll", () => {
  const html = read(HTML_REL);
  assert.match(html, /shrink-to-fit|Shrink-to-fit|while\s*\(.*scrollWidth/i);
  assert.match(html, /Still overflowing|startMarquee/);
  assert.match(html, /stopMarquee/);
  assert.match(html, /cancelAnimationFrame/);
  assert.match(html, /marqueeLoops|WeakMap/);
  // Must not use unconditional CSS infinite marquee on all text
  assert.doesNotMatch(html, /\.title\.marquee|\.description\.marquee/);
  assert.doesNotMatch(html, /animation:\s*marquee\s+\d+s\s+linear\s+infinite/);
  // Overflow gate before starting RAF loop
  assert.match(html, /scrollWidth\s*>\s*viewport|scrollWidth\s*>\s*.*OVERFLOW/);
  assert.match(html, /Fits after shrink|stay static|completely still/i);
});

test("advance + same-row edit animation contracts preserved", () => {
  const html = read(HTML_REL);
  assert.match(html, /is-exit|is-enter/);
  assert.match(html, /is-crossfade|crossfade/i);
  assert.match(html, /currentRowId|currentIndex|selectedIndex/);
  assert.match(html, /STAGGER|stagger/i);
});

test("data bridge contract unchanged (neud-display-data / schedule)", () => {
  const html = read(HTML_REL);
  assert.match(html, /neud-display-data/);
  assert.match(html, /NEUDDisplay\.subscribe|window\.NEUDDisplay/);
  assert.match(html, /schedule\.now|schedule\.NOW/);
  assert.match(html, /schedule\.next|schedule\.NEXT/);
  assert.match(html, /schedule\.later|schedule\.LATER/);
  assert.match(html, /__SEMA_SCHEDULE_TICKER__/);
  // Title + description only — no date/time fields rendered
  assert.doesNotMatch(html, /data-field=["']date["']/);
  assert.doesNotMatch(html, /data-field=["']time["']/);
});

test("package builder + bundled allowlist still pick up Schedule Ticker", () => {
  const bundled = read("desktop/src/lib/bundled-display-sources.ts");
  const builder = read("desktop/src/packages/sema-package-builder.ts");
  const manifest = read("desktop/runtime-asset-manifest.json");

  assert.match(bundled, /sema-schedule-ticker-v1\.html/);
  assert.match(builder, /SEMA_SCHEDULE_TICKER_BUNDLED_FILE\s*=\s*"sema-schedule-ticker-v1\.html"/);
  assert.match(builder, /name:\s*"Schedule Ticker"/);
  assert.match(builder, /width:\s*3840/);
  assert.match(builder, /height:\s*2160/);
  assert.match(manifest, /sema-schedule-ticker-v1\.html/);
  assert.ok(fs.existsSync(path.join(repoRoot, HTML_REL)));
});

test("safe line-height for descenders", () => {
  const html = read(HTML_REL);
  assert.match(html, /--line-title:\s*1\.(2[5-9]|[3-9])/);
  assert.match(html, /--line-body:\s*1\.(3|[4-9])/);
  assert.match(html, /descender/i);
});
