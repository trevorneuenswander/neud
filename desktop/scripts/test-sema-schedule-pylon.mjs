#!/usr/bin/env node
/**
 * SEMA Schedule Pylon (Pass 9 Item 3).
 * Asserts left-anchored vertical pylon, SEMA Live branding, NOW/NEXT/LATER,
 * overflow-gated marquee, package wiring, integrity, and ticker still present.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HTML_REL = "desktop/src/displays/bundled/sema-schedule-pylon-v1.html";
const TICKER_HTML_REL = "desktop/src/displays/bundled/sema-schedule-ticker-v1.html";
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function stripComments(html) {
  return html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

test("Schedule Pylon is 3840×2160 native with transparent stage", () => {
  const html = read(HTML_REL);
  assert.match(html, /<title>\s*Schedule Pylon\s*<\/title>/i);
  assert.match(html, /name=["']viewport["'][^>]*width=3840/i);
  assert.match(html, /height=2160/i);
  assert.match(html, /--frame-w:\s*3840px/);
  assert.match(html, /--frame-h:\s*2160px/);
  assert.match(html, /data-frame=["']3840x2160["']/);
  assert.match(html, /data-display=["']schedule-pylon["']/);
  assert.match(html, /background:\s*transparent/);
});

test("left-anchored vertical pylon with NOW / NEXT / LATER", () => {
  const html = read(HTML_REL);
  const css = stripComments(html);
  assert.match(css, /\.pylon\s*\{[^}]*left:\s*0/s);
  assert.match(css, /flex-direction:\s*column/);
  assert.match(html, />\s*NOW\s*</);
  assert.match(html, />\s*NEXT\s*</);
  assert.match(html, />\s*LATER\s*</);
  assert.match(html, /data-slot=["']now["']/);
  assert.match(html, /data-slot=["']next["']/);
  assert.match(html, /data-slot=["']later["']/);
  assert.match(html, /data-field=["']title["']/);
  assert.match(html, /data-field=["']description["']/);
  // No logo
  assert.doesNotMatch(html, /<img[^>]+logo|class=["'][^"']*logo/i);
  // No date/time fields
  assert.doesNotMatch(html, /data-field=["']date["']/);
  assert.doesNotMatch(html, /data-field=["']time["']/);
});

test("SEMA Live branding — near-black foundation, red wordmark, neon LIVE", () => {
  const raw = read(HTML_REL);
  const css = stripComments(raw);
  // Near-black foundation (not charcoal-grey panel)
  assert.match(css, /--pylon-bg:\s*rgba\(\s*[0-1]?[0-9]\s*,\s*[0-1]?[0-9]\s*,\s*[0-2]?[0-9]/i);
  assert.match(css, /--sema-red:\s*#DC1E28/i);
  assert.match(css, /--live-magenta:\s*#E020F0/i);
  assert.match(raw, /brand-sema|SEMA Live/i);
  assert.match(raw, /class=["']brand-sema["'][^>]*>\s*SEMA\s*</i);
  assert.match(raw, /class=["']brand-live["'][^>]*>\s*LIVE\s*</i);
  // Static brand header — no pulsing Live animation
  assert.doesNotMatch(css, /@keyframes\s+\w*pulse|animation:\s*[^;]*pulse/i);
  // Schedule accents remain on labels
  assert.match(css, /--now-accent:/i);
  assert.match(css, /--next-accent:/i);
  assert.match(css, /--later-accent:/i);
  assert.match(css, /\.section\[data-slot="now"\]\s+\.label\s*\{[^}]*color:\s*var\(--now-accent\)/s);
  // Pylon fill is not solid brand red
  assert.doesNotMatch(css, /--pylon-bg:\s*#f00\b/i);
  assert.doesNotMatch(css, /--pylon-bg:\s*#ff0000\b/i);
  assert.doesNotMatch(css, /--pylon-bg:\s*#DC1E28/i);
});

test("marquee gated on overflow; shrink-to-fit precedes scroll", () => {
  const html = read(HTML_REL);
  assert.match(html, /shrink-to-fit|Shrink-to-fit|while\s*\(.*scrollWidth/i);
  assert.match(html, /Still overflowing|startMarquee/);
  assert.match(html, /stopMarquee/);
  assert.match(html, /cancelAnimationFrame/);
  assert.match(html, /marqueeLoops|WeakMap/);
  assert.doesNotMatch(html, /animation:\s*marquee\s+\d+s\s+linear\s+infinite/);
  assert.match(html, /scrollWidth\s*>\s*viewport|scrollWidth\s*>\s*.*OVERFLOW/);
  assert.match(html, /Fits after shrink|stay static|completely still/i);
});

test("advance slide/crossfade + data bridge contract", () => {
  const html = read(HTML_REL);
  assert.match(html, /is-exit|is-enter/);
  assert.match(html, /is-crossfade|crossfade/i);
  assert.match(html, /currentRowId|currentIndex|selectedIndex/);
  assert.match(html, /neud-display-data/);
  assert.match(html, /NEUDDisplay\.subscribe|window\.NEUDDisplay/);
  assert.match(html, /schedule\.now|schedule\.NOW/);
  assert.match(html, /schedule\.next|schedule\.NEXT/);
  assert.match(html, /schedule\.later|schedule\.LATER/);
  assert.match(html, /__SEMA_SCHEDULE_PYLON__/);
});

test("safe line-height for descenders", () => {
  const html = read(HTML_REL);
  assert.match(html, /--line-title:\s*1\.(2[5-9]|[3-9])/);
  assert.match(html, /--line-body:\s*1\.(3|[4-9])/);
  assert.match(html, /descender/i);
});

test("manifest + bundled allowlist + package builder include pylon; ticker still present", () => {
  const bundled = read("desktop/src/lib/bundled-display-sources.ts");
  const builder = read("desktop/src/packages/sema-package-builder.ts");
  const manifest = read("desktop/runtime-asset-manifest.json");
  const hydration = read("desktop/src/packages/sema/sema-package-display-hydration.ts");
  const service = read("desktop/src/packages/project-package-service.ts");

  assert.match(bundled, /sema-schedule-pylon-v1\.html/);
  assert.match(bundled, /sema-schedule-ticker-v1\.html/);
  assert.match(manifest, /sema-schedule-pylon-v1\.html/);
  assert.match(manifest, /sema-schedule-ticker-v1\.html/);
  assert.match(builder, /SEMA_SCHEDULE_PYLON_BUNDLED_FILE\s*=\s*"sema-schedule-pylon-v1\.html"/);
  assert.match(builder, /SEMA_SCHEDULE_PYLON_HTML_PATH\s*=\s*"displays\/schedule-pylon-v1\.html"/);
  assert.match(builder, /slug:\s*"schedule-pylon"/);
  assert.match(builder, /name:\s*"Schedule Pylon"/);
  assert.match(builder, /runtimeAdapterKey:\s*"sema-schedule-pylon"/);
  assert.match(builder, /width:\s*3840/);
  assert.match(builder, /height:\s*2160/);
  // Ticker unchanged in package
  assert.match(builder, /slug:\s*"schedule-ticker"/);
  assert.match(builder, /name:\s*"Schedule Ticker"/);
  assert.ok(fs.existsSync(path.join(repoRoot, HTML_REL)));
  assert.ok(fs.existsSync(path.join(repoRoot, TICKER_HTML_REL)));

  // Hydration uses per-display identity (not hardcoded ticker for all)
  assert.match(hydration, /resolveDisplayIdentity|importKey:\s*identity\.importKey|importKey:\s*`\$\{.*\}-v1`/);
  assert.match(hydration, /sema-schedule-pylon/);
  assert.match(hydration, /SEMA_DISPLAY_IMPORT_KEY/); // ticker compat export kept

  // Rebuild/install validation covers both displays
  assert.match(service, /schedule-pylon-v1\.html/);
  assert.match(service, /schedule-ticker-v1\.html/);
  assert.match(service, /Schedule Pylon/);
});

test("Runtime: buildSemaPackageV1 writes pylon + ticker HTML with integrity", () => {
  const distBuilder = path.join(repoRoot, "desktop", "dist", "packages", "sema-package-builder.js");
  const srcBuilder = path.join(
    repoRoot,
    "desktop",
    "src",
    "packages",
    "sema-package-builder.ts",
  );
  if (!fs.existsSync(distBuilder)) {
    // Source-level assertions above still cover wiring when dist is not built.
    assert.ok(fs.existsSync(srcBuilder));
    assert.match(read("desktop/src/packages/sema-package-builder.ts"), /SEMA_SCHEDULE_PYLON_HTML_PATH/);
    return;
  }

  const {
    buildSemaPackageV1,
    SEMA_SCHEDULE_TICKER_HTML_PATH,
    SEMA_SCHEDULE_PYLON_HTML_PATH,
  } = require(distBuilder);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-pylon-"));
  try {
    const packageManifest = buildSemaPackageV1(tmp);
    assert.equal(packageManifest.packageVersion, 8);
    const slugs = packageManifest.displays.map((d) => d.slug);
    assert.ok(slugs.includes("schedule-ticker"));
    assert.ok(slugs.includes("schedule-pylon"));
    const pylon = packageManifest.displays.find((d) => d.slug === "schedule-pylon");
    assert.equal(pylon.name, "Schedule Pylon");
    assert.equal(pylon.width, 3840);
    assert.equal(pylon.height, 2160);
    assert.equal(pylon.runtimeAdapterKey, "sema-schedule-pylon");
    assert.equal(pylon.htmlPath, SEMA_SCHEDULE_PYLON_HTML_PATH);
    assert.ok(fs.existsSync(path.join(tmp, SEMA_SCHEDULE_TICKER_HTML_PATH)));
    assert.ok(fs.existsSync(path.join(tmp, SEMA_SCHEDULE_PYLON_HTML_PATH)));
    assert.ok(packageManifest.integrity?.files?.[SEMA_SCHEDULE_TICKER_HTML_PATH]);
    assert.ok(packageManifest.integrity?.files?.[SEMA_SCHEDULE_PYLON_HTML_PATH]);
    const pylonHtml = fs.readFileSync(path.join(tmp, SEMA_SCHEDULE_PYLON_HTML_PATH), "utf8");
    assert.match(pylonHtml, /Schedule Pylon/);
    assert.match(pylonHtml, /left:\s*0/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
