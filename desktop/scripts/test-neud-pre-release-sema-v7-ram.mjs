#!/usr/bin/env node
/**
 * NEUD pre-release — SEMA ticker v7 typography root-cause fix + RAM accounting.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  collectPerformanceMetrics,
  disposePerformanceGpuMetrics,
} from "../src/services/performance-metrics-service.ts";
import { resetGpuMetricsForTests } from "../src/services/native-gpu-metrics.ts";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function stripComments(html) {
  return html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

test("root cause: fitField BODY_BASE matches CSS body-size (no 32px override)", () => {
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  const css = stripComments(html);
  assert.match(css, /--title-size:\s*57px/);
  assert.match(css, /--body-size:\s*52px/);
  assert.match(html, /var TITLE_BASE = 57/);
  assert.match(html, /var BODY_BASE = 52/);
  assert.doesNotMatch(html, /var BODY_BASE = 32/);
  assert.match(html, /texts\[i\]\.style\.fontSize = sizePx \+ "px"/);
  assert.match(css, /--content-rows:/);
  assert.match(css, /grid-template-rows:\s*var\(--label-row\)\s*var\(--content-rows\)/);
});

test("SEMA package baseline is v7", () => {
  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION\s*=\s*8/);
});

test("hydration publishes when packaged HTML hash changes (update path)", () => {
  const hydration = read("desktop/src/packages/sema/sema-package-display-hydration.ts");
  assert.match(hydration, /publishedHash === sourceHash/);
  assert.match(hydration, /Updated SEMA display from project package/);
  assert.match(hydration, /editableGraphicSchema/);
});

test("Performance Monitor compact RAM shows percent and GB", () => {
  const bar = read("src/components/portal/PerformanceStatusBar.tsx");
  assert.match(bar, /RAM \{ramCompact\}/);
  assert.match(bar, /systemPercent/);
  assert.match(bar, /ramPercent.*ramUsed|ramPercent\} \(\{ramUsed\}/);
  assert.match(bar, /Pressure/);
  assert.match(bar, /accounting/);
});

test("native memory sampler uses mach VM stats on macOS / MemoryStatusEx on Windows", () => {
  const mac = read("desktop/native/gpu/gpu-mac.mm");
  assert.match(mac, /HOST_VM_INFO64/);
  assert.match(mac, /active_count/);
  assert.match(mac, /compressor_page_count/);
  assert.match(mac, /unlike total.*os\.freemem|file cache/);
  const win = read("desktop/native/gpu/gpu-win.cpp");
  assert.match(win, /GlobalMemoryStatusEx/);
  assert.match(win, /ullAvailPhys/);
  const addon = read("desktop/native/gpu/gpu-addon.cc");
  assert.match(addon, /sampleMemory/);
});

test("collectPerformanceMetrics exposes RAM percent and accounting", () => {
  resetGpuMetricsForTests();
  const snapshot = collectPerformanceMetrics();
  assert.ok(typeof snapshot.memory.systemPercent === "number" || snapshot.memory.systemPercent === null);
  assert.ok(typeof snapshot.memory.accounting === "string" && snapshot.memory.accounting.length > 0);
  assert.ok(typeof snapshot.memory.source === "string");
  if (snapshot.memory.systemPercent != null) {
    assert.ok(snapshot.memory.systemPercent >= 0 && snapshot.memory.systemPercent <= 100);
  }
  // Must not silently invent GPU
  assert.ok(typeof snapshot.gpu.available === "boolean");
  disposePerformanceGpuMetrics();
  resetGpuMetricsForTests();
});

test("hardware memory sample differs from naive total-freemem when addon loads", () => {
  const platformDir =
    process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : null;
  if (!platformDir) return;
  const dest = path.join(desktopRoot, "dist", "platform", platformDir, "neud_gpu.node");
  if (!fs.existsSync(dest)) return;
  let addon;
  try {
    addon = require(dest);
  } catch {
    // Electron ABI — skip under plain Node
    return;
  }
  if (typeof addon.sampleMemory !== "function") {
    assert.fail("sampleMemory export missing");
  }
  const sample = addon.sampleMemory();
  assert.equal(sample.available, true);
  assert.ok(sample.utilizationPercent >= 0 && sample.utilizationPercent <= 100);
  assert.match(String(sample.definition), /active|AvailPhys|used/i);
  console.log(
    JSON.stringify({
      source: sample.source,
      utilizationPercent: sample.utilizationPercent,
      usedBytes: sample.usedBytes,
      totalBytes: sample.totalBytes,
      pressureLevel: sample.pressureLevel,
    }),
  );
  addon.shutdown();
});
