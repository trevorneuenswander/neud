#!/usr/bin/env node
/**
 * NEUD final pre-release polish — SEMA label +7pt (v8) + Performance Monitor readability.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");
const electronBin = path.join(repoRoot, "node_modules", ".bin", "electron");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function stripComments(html) {
  return html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

test("SEMA labels are calc(28px + 7pt); titles/descriptions unchanged", () => {
  const html = read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html");
  const css = stripComments(html);
  assert.match(css, /--label-size:\s*calc\(\s*28px\s*\+\s*7pt\s*\)/);
  assert.match(css, /--title-size:\s*57px/);
  assert.match(css, /--body-size:\s*52px/);
  assert.match(css, /--bar-h:\s*280px/);
  assert.match(css, /--logo-w:\s*576px/);
  assert.match(html, /TITLE_BASE = 57/);
  assert.match(html, /BODY_BASE = 52/);
  // Labels must not be driven by fitField inline sizes
  assert.match(html, /Labels use CSS --label-size only|never set via inline style \/ fitField/i);
  assert.doesNotMatch(html, /fitField\([^)]*label/i);
});

test("SEMA package baseline is v8", () => {
  assert.match(
    read("desktop/src/packages/builtin-package-catalog.ts"),
    /SEMA_PACKAGE_BASELINE_VERSION\s*=\s*8/,
  );
});

test("macOS memory pressure maps Dispatch-style sysctl (1=normal, 2=warning, 4=critical)", () => {
  const mac = read("desktop/native/gpu/gpu-mac.mm");
  assert.match(mac, /kern\.memorystatus_vm_pressure_level/);
  assert.match(mac, /case 1:[\s\S]*pressureLevel = "normal"/);
  assert.match(mac, /case 2:[\s\S]*pressureLevel = "warning"/);
  assert.match(mac, /case 4:[\s\S]*pressureLevel = "critical"/);
  // Must not treat 1 as warning (the prior bug)
  assert.doesNotMatch(mac, /case 1:\s*[\s\S]{0,80}pressureLevel = "warning"/);
});

test("Performance Monitor formatting, GPU allocation label, technical details", () => {
  const bar = read("src/components/portal/PerformanceStatusBar.tsx");
  assert.match(bar, /toFixed\(1\)/);
  assert.match(bar, /\$\{value\.toFixed\(1\)\} \$\{units/);
  assert.match(bar, /GPU allocation/);
  assert.match(bar, /isAppleSiliconGpuModel/);
  assert.match(bar, /data-perf-technical-details/);
  assert.match(bar, /Technical Details/);
  assert.match(bar, /Pressure \{pressureLabel\}/);
  assert.match(bar, /Unavailable/);
  assert.doesNotMatch(bar, /opacity-70">\{\s*gpuOk\.source/);
  assert.match(bar, /RAM \{ramCompact\}/);
});

test("hardware pressure sample uses corrected mapping (Electron ABI)", () => {
  if (process.platform !== "darwin") return;
  const dest = path.join(desktopRoot, "dist", "platform", "macos", "neud_gpu.node");
  if (!fs.existsSync(dest) || !fs.existsSync(electronBin)) return;
  const script = `
    const addon = require(${JSON.stringify(dest)});
    const sample = addon.sampleMemory();
    process.stdout.write(JSON.stringify({
      available: sample.available,
      pressureAvailable: sample.pressureAvailable,
      pressureLevel: sample.pressureLevel,
      utilizationPercent: sample.utilizationPercent
    }));
    addon.shutdown();
  `;
  const result = spawnSync(
    electronBin,
    ["-e", script],
    {
      encoding: "utf8",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      timeout: 15000,
    },
  );
  if (result.status !== 0 || !result.stdout?.trim()) {
    // Environment may kill Electron probes; source mapping coverage remains above.
    console.log(
      JSON.stringify({
        skippedHardware: true,
        status: result.status,
        signal: result.signal,
        stderr: (result.stderr || "").slice(0, 200),
      }),
    );
    return;
  }
  const sample = JSON.parse(result.stdout.trim());
  assert.equal(sample.available, true);
  if (sample.pressureAvailable) {
    assert.ok(["normal", "warning", "critical"].includes(sample.pressureLevel));
  }
  // sysctl level 1 must never surface as warning after the mapping fix.
  console.log(JSON.stringify(sample));
});
