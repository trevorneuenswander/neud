#!/usr/bin/env node
/**
 * NEUD v0.3.0 — account shutdown freeze, SEMA v5 typography, GPU availability truth.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { collectPerformanceMetrics } from "../src/services/performance-metrics-service.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function stripComments(html) {
  return html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

test("graceful shutdown broadcasts lifecycle before tearing down services", () => {
  const main = read("desktop/src/main.ts");
  const shutdownStart = main.indexOf("async function performGracefulShutdown");
  assert.ok(shutdownStart > 0);
  const slice = main.slice(shutdownStart, shutdownStart + 2500);
  const lifecycleIdx = slice.indexOf('broadcastToAllRenderers("neud:app:lifecycle"');
  const apiStopIdx = slice.search(/localApiServer\?\.stop\(/);
  assert.ok(lifecycleIdx >= 0, "must broadcast shutting-down");
  assert.ok(apiStopIdx > lifecycleIdx, "lifecycle must precede local API stop");
  assert.match(slice, /phase:\s*"shutting-down"/);
});

test("preload exposes onLifecycle for renderers", () => {
  const preload = read("desktop/src/preload.ts");
  assert.match(preload, /onLifecycle/);
  assert.match(preload, /neud:app:lifecycle/);
});

test("SidebarUserPanel freezes account UI during shutdown", () => {
  const panel = read("src/components/portal/SidebarUserPanel.tsx");
  const hook = read("src/lib/desktop/use-app-shutdown.ts");
  assert.match(hook, /useAppShutdown/);
  assert.match(hook, /neudShutdown/);
  assert.match(panel, /useAppShutdown/);
  assert.match(panel, /dataset\.neudShutdown/);
  assert.match(panel, /Ignore teardown failures|teardown-induced/);
  // Still surfaces real errors when not shutting down
  assert.match(panel, /setIdentityStatus\("error"\)/);
});

test("SEMA typography preserves label/title tokens (body size owned by v6 suite)", () => {
  const css = stripComments(read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html"));
  // Current SEMA Live branding: labels +7pt, titles 57px (body size owned by later suites).
  assert.match(css, /--label-size:\s*calc\(\s*28px\s*\+\s*7pt\s*\)/);
  assert.match(css, /--title-size:\s*57px/);
  assert.match(css, /--bar-bg:\s*rgba\(\s*8\s*,\s*8\s*,\s*10\s*,\s*0\.85\s*\)/);
  assert.match(css, /--logo-w:\s*576px/);
  assert.match(css, /--bar-h:\s*280px/);
  assert.match(css, /--label-row:/);
});

test("SEMA package baseline is at least v5", () => {
  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION\s*=\s*[5-9]/);
});

test("GPU metrics path is wired (full coverage in sema-v6-system-gpu suite)", () => {
  const service = read("desktop/src/services/performance-metrics-service.ts");
  assert.match(service, /native-gpu-metrics|getCachedGpuSample/);
  const snapshot = collectPerformanceMetrics();
  assert.ok(typeof snapshot.gpu.available === "boolean");
});
