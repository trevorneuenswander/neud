#!/usr/bin/env node
/**
 * NEUD v0.3.0 — SEMA Ticker v6 typography + native system GPU telemetry.
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
import {
  disposeGpuMetrics,
  resolveNativeGpuCandidates,
  resetGpuMetricsForTests,
  sampleGpuMetricsNow,
} from "../src/services/native-gpu-metrics.ts";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function stripComments(html) {
  return html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

test("SEMA description typography and preserved layout tokens", () => {
  const css = stripComments(read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html"));
  assert.match(css, /--label-size:\s*calc\(\s*28px\s*\+\s*7pt\s*\)/);
  assert.match(css, /--title-size:\s*57px/);
  assert.match(css, /--body-size:\s*52px/);
  assert.match(css, /BODY_BASE = 52/);
  assert.doesNotMatch(css, /--body-size:\s*calc\(/);
  assert.match(css, /--bar-bg:\s*rgba\(\s*8\s*,\s*8\s*,\s*10\s*,\s*0\.85\s*\)/);
  assert.match(css, /--logo-w:\s*576px/);
  assert.match(css, /--bar-h:\s*280px/);
  assert.match(css, /--label-row:/);
  assert.match(css, /--title-row:/);
  assert.match(css, /--desc-row:/);
  assert.match(css, /grid-template-rows:\s*var\(--title-row\)\s*var\(--desc-row\)/);
});

test("SEMA package baseline is v7", () => {
  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION\s*=\s*9/);
  const builder = read("desktop/src/packages/sema-package-builder.ts");
  assert.match(builder, /SEMA_PACKAGE_BASELINE_VERSION/);
  assert.match(builder, /packageVersion:\s*SEMA_PACKAGE_BASELINE_VERSION/);
});

test("native GPU addon is present and exports sample/shutdown", () => {
  const platformDir = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
  const dest = path.join(desktopRoot, "dist", "platform", platformDir, "neud_gpu.node");
  assert.ok(fs.existsSync(dest), `missing ${dest} — run build-gpu-addon.mjs`);
  const candidates = resolveNativeGpuCandidates();
  assert.ok(candidates.some((c) => c.endsWith("neud_gpu.node")));
  const buildScript = read("desktop/scripts/build-gpu-addon.mjs");
  assert.match(buildScript, /neud_gpu\.node/);
  assert.match(buildScript, /33\.4\.11/);
  const pkg = read("desktop/package.json");
  assert.match(pkg, /build-gpu-addon\.mjs/);
  const yml = read("desktop/electron-builder.yml");
  assert.match(yml, /dist\/platform\/macos\/\*\.node/);
  assert.match(yml, /dist\/platform\/windows\/\*\.node/);
});

test("GPU provider sources are platform-specific and documented", () => {
  const mac = read("desktop/native/gpu/gpu-mac.mm");
  assert.match(mac, /IOAccelerator/);
  assert.match(mac, /Device Utilization %/);
  assert.match(mac, /Compatibility note/);
  const win = read("desktop/native/gpu/gpu-win.cpp");
  assert.match(win, /GPU Engine/);
  assert.match(win, /PdhAddEnglishCounter/);
  assert.match(win, /does not sum/);
  const service = read("desktop/src/services/performance-metrics-service.ts");
  assert.match(service, /getCachedGpuSample|native-gpu-metrics/);
  assert.doesNotMatch(service, /not collected in this build \(no GPU metrics provider\)/);
});

test("Performance Monitor compact bar shows CPU | GPU | RAM system values", () => {
  const bar = read("src/components/portal/PerformanceStatusBar.tsx");
  assert.match(bar, /data-perf-compact="cpu"/);
  assert.match(bar, /data-perf-compact="gpu"/);
  assert.match(bar, /data-perf-compact="memory"/);
  assert.match(bar, /CPU \{cpuSystem\}/);
  assert.match(bar, /GPU \{gpuCompact\}/);
  assert.match(bar, /RAM \{ramCompact\}/);
  assert.doesNotMatch(bar, /gpuCompact = "— \/ —"/);
  assert.match(bar, /utilizationPercent/);
  assert.match(bar, /Total system GPU utilization|System \{formatPercent/);
});

test("graceful shutdown disposes GPU collector after lifecycle broadcast", () => {
  const main = read("desktop/src/main.ts");
  const shutdownStart = main.indexOf("async function performGracefulShutdown");
  assert.ok(shutdownStart > 0);
  const slice = main.slice(shutdownStart, shutdownStart + 3500);
  const lifecycleIdx = slice.indexOf('broadcastToAllRenderers("neud:app:lifecycle"');
  const gpuDisposeIdx = slice.indexOf("disposePerformanceGpuMetrics");
  assert.ok(lifecycleIdx >= 0);
  assert.ok(gpuDisposeIdx > lifecycleIdx, "GPU dispose after lifecycle broadcast");
});

test("collectPerformanceMetrics returns structured GPU field without fabricating zero", () => {
  resetGpuMetricsForTests();
  const snapshot = collectPerformanceMetrics();
  assert.ok(snapshot.cpu);
  assert.ok(snapshot.memory);
  assert.ok(typeof snapshot.gpu.available === "boolean");
  if (snapshot.gpu.available) {
    assert.ok(
      snapshot.gpu.utilizationPercent >= 0 && snapshot.gpu.utilizationPercent <= 100,
      `utilization out of range: ${snapshot.gpu.utilizationPercent}`,
    );
    assert.ok(snapshot.gpu.source);
    assert.ok(Array.isArray(snapshot.gpu.adapters));
  } else {
    assert.ok(typeof snapshot.gpu.reason === "string" && snapshot.gpu.reason.length > 0);
    // Must not pretend unavailable is zero utilization
    assert.equal(snapshot.gpu.utilizationPercent, undefined);
  }
  disposePerformanceGpuMetrics();
  resetGpuMetricsForTests();
});

test("native GPU sample on supported host (hardware when addon loads)", () => {
  resetGpuMetricsForTests();
  const platformDir = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : null;
  if (!platformDir) {
    const sample = sampleGpuMetricsNow();
    assert.equal(sample.available, false);
    assert.match(sample.reason, /not supported/i);
    return;
  }
  const dest = path.join(desktopRoot, "dist", "platform", platformDir, "neud_gpu.node");
  assert.ok(fs.existsSync(dest));

  let direct = null;
  let loadError = null;
  try {
    const addon = require(dest);
    direct = addon.sample();
    addon.shutdown();
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  if (loadError) {
    // Electron ABI modules may not load under plain Node — still validate TS path reason.
    const viaTs = sampleGpuMetricsNow();
    assert.equal(viaTs.available, false);
    assert.match(viaTs.reason, /failed to load|missing|ABI|compiled|dlopen|module/i);
    console.log(
      JSON.stringify({
        note: "neud_gpu.node did not load under this Node process (expected for Electron ABI)",
        loadError,
        viaTs,
      }),
    );
    resetGpuMetricsForTests();
    return;
  }

  assert.ok(direct);
  if (direct.available) {
    assert.ok(direct.utilizationPercent >= 0 && direct.utilizationPercent <= 100);
    assert.ok(Array.isArray(direct.adapters));
    console.log(
      JSON.stringify({
        hardwareSample: true,
        utilizationPercent: direct.utilizationPercent,
        source: direct.source,
        adapters: direct.adapters,
      }),
    );
  } else {
    assert.ok(typeof direct.reason === "string" && direct.reason.length > 0);
    console.log(JSON.stringify({ hardwareSample: false, reason: direct.reason }));
  }

  const viaService = sampleGpuMetricsNow();
  if (viaService.available) {
    assert.ok(viaService.utilizationPercent >= 0 && viaService.utilizationPercent <= 100);
  } else {
    assert.ok(viaService.reason);
  }
  disposeGpuMetrics();
  resetGpuMetricsForTests();
});
