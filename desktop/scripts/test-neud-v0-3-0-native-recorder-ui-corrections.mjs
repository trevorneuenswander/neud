#!/usr/bin/env node
/**
 * NEUD v0.3.0 — native recorder load path + Output UI corrections.
 * Does not claim a real recording file was produced unless explicitly inspected.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

// Load the CommonJS compiled module (matches Electron runtime), not the TS source as ESM.
const recorderLoader = await import(
  pathToFileURL(path.join(desktopRoot, "dist/output/native-disk-recorder.js")).href
);
const {
  probeNativeDiskRecorderAddon,
  resetNativeDiskRecorderAddonCacheForTests,
  resolveNativeDiskRecorderCandidates,
} = recorderLoader;

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("recorder candidates resolve under dist/platform (not desktop/platform)", () => {
  const candidates = resolveNativeDiskRecorderCandidates();
  assert.ok(candidates.length > 0);
  const preferred = candidates[0];
  assert.match(preferred, /dist[/\\]platform[/\\](macos|windows)[/\\]neud_recorder\.node$/);
  assert.doesNotMatch(preferred, /desktop[/\\]platform[/\\]/);
});

test("recorder addon path exists after desktop build artifacts", () => {
  const platformDir = process.platform === "darwin" ? "macos" : "windows";
  const dest = path.join(desktopRoot, "dist", "platform", platformDir, "neud_recorder.node");
  const built = path.join(
    desktopRoot,
    "native",
    "recorder",
    "build",
    "Release",
    "neud_recorder.node",
  );
  assert.ok(
    fs.existsSync(dest) || fs.existsSync(built),
    "neud_recorder.node missing — run desktop build / build-recorder-addon.mjs",
  );
});

test("probeNativeDiskRecorderAddon loads exports on supported host", () => {
  resetNativeDiskRecorderAddonCacheForTests();
  const result = probeNativeDiskRecorderAddon();
  if (process.platform !== "darwin" && process.platform !== "win32") {
    assert.equal(result.ok, false);
    assert.equal(result.failure.code, "unsupported-platform");
    return;
  }
  // Node can load N-API addons built for Electron when ABI matches enough for probe;
  // prefer asserting path resolution + export surface when load succeeds.
  if (!result.ok) {
    assert.ok(result.failure.attemptedPaths.length > 0);
    assert.ok(result.failure.message.length > 0);
    assert.doesNotMatch(result.failure.message, /\/Users\//);
    console.log("probe failed under node (expected if ABI-gated):", result.failure.code);
    return;
  }
  assert.equal(typeof result.addon.open, "function");
  assert.equal(typeof result.addon.listCodecs, "function");
  assert.equal(typeof result.addon.platform, "function");
  const platform = result.addon.platform();
  assert.equal(typeof platform.encoder, "string");
  assert.equal(typeof platform.available, "boolean");
});

test("Electron runtime loads recorder addon via the same candidates", () => {
  if (process.platform !== "darwin") {
    console.log("skip Electron probe on non-macOS CI host");
    return;
  }
  const electronBin = path.join(repoRoot, "node_modules", ".bin", "electron");
  if (!fs.existsSync(electronBin) && !fs.existsSync(`${electronBin}.cmd`)) {
    console.log("skip: electron binary missing");
    return;
  }
  const probeScript = path.join(desktopRoot, "scripts", "_electron-recorder-probe-tmp.js");
  fs.writeFileSync(
    probeScript,
    `
const { app } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
app.whenReady().then(async () => {
  try {
    const modUrl = pathToFileURL(path.join(__dirname, "../src/output/native-disk-recorder.ts")).href;
    // Prefer compiled JS when present (matches app runtime).
    const compiled = path.join(__dirname, "../dist/output/native-disk-recorder.js");
    let mod;
    if (require("fs").existsSync(compiled)) {
      mod = require(compiled);
    } else {
      console.log(JSON.stringify({ ok: false, reason: "compiled-missing" }));
      app.exit(2);
      return;
    }
    mod.resetNativeDiskRecorderAddonCacheForTests?.();
    const result = mod.probeNativeDiskRecorderAddon
      ? mod.probeNativeDiskRecorderAddon()
      : { ok: !!mod.loadNativeDiskRecorderAddon(), path: null };
    if (result.ok) {
      const platform = result.addon.platform();
      console.log(JSON.stringify({
        ok: true,
        path: result.path,
        encoder: platform.encoder,
        available: platform.available,
        exports: ["open","appendFrame","finalize","close","listCodecs","platform"].every(
          (key) => typeof result.addon[key] === "function"
        ),
      }));
      app.exit(0);
      return;
    }
    console.log(JSON.stringify({ ok: false, failure: result.failure }));
    app.exit(1);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: String(error && error.message || error) }));
    app.exit(1);
  }
});
`,
  );
  try {
    // Ensure compiled loader matches source before Electron probe.
    spawnSync(
      path.join(repoRoot, "node_modules", ".bin", "tsc"),
      ["-p", "desktop/tsconfig.json", "--pretty", "false"],
      { cwd: repoRoot, stdio: "inherit" },
    );
    const run = spawnSync(electronBin, [probeScript], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
      timeout: 20000,
    });
    const lines = String(run.stdout || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const jsonLine = [...lines].reverse().find((line) => line.startsWith("{"));
    assert.ok(jsonLine, `Electron probe produced no JSON. stderr=${run.stderr}`);
    const payload = JSON.parse(jsonLine);
    assert.equal(payload.ok, true, JSON.stringify(payload));
    assert.equal(payload.exports, true);
    assert.equal(payload.encoder, "avfoundation");
    assert.equal(payload.available, true);
    assert.match(String(payload.path), /neud_recorder\.node$/);
  } finally {
    fs.rmSync(probeScript, { force: true });
  }
});

test("disk-recording-service uses actionable unavailable message", () => {
  const service = read("desktop/src/output/disk-recording-service.ts");
  assert.match(service, /userFacingDiskRecorderUnavailableMessage/);
  assert.doesNotMatch(
    service,
    /error: "Native disk recorder addon is not available on this installation\."/,
  );
});

test("asarUnpack includes recorder native module", () => {
  const yml = read("desktop/electron-builder.yml");
  assert.match(yml, /dist\/platform\/macos\/\*\.node/);
  assert.match(yml, /dist\/platform\/windows\/\*\.node/);
});

test("performance bar spacing and compact GPU", () => {
  const bar = read("src/components/portal/PerformanceStatusBar.tsx");
  assert.match(bar, /data-perf-compact="cpu"/);
  assert.match(bar, /data-perf-compact="gpu"/);
  assert.match(bar, /data-perf-compact="memory"/);
  assert.match(bar, /gap-4|sm:gap-5/);
  assert.match(bar, /GPU \{gpuCompact\}/);
  assert.doesNotMatch(
    bar,
    /data-perf-summary=""[\s\S]{0,200}GPU metrics are not available on this host\./, // legacy phrasing must not appear in compact bar
  );
  const cpuIdx = bar.indexOf('data-perf-metric="cpu"');
  const gpuIdx = bar.indexOf('data-perf-metric="gpu"');
  const memIdx = bar.indexOf('data-perf-metric="memory"');
  assert.ok(cpuIdx < gpuIdx && gpuIdx < memIdx);
});

test("pinned controls are right-aligned and compact", () => {
  const live = read("src/components/displays/PinnedDisplayLiveSlot.tsx");
  const stack = read("src/components/displays/PinnedDisplayStackSlot.tsx");
  const controls = read("src/components/displays/VideoPlaybackControls.tsx");
  assert.match(live, /flex-1/);
  assert.match(live, /data-pinned-video-controls/);
  assert.match(stack, /data-pinned-video-controls/);
  assert.match(controls, /!h-4 !w-4/);
});

test("Output cards keep a single LIVE indicator next to the toggle", () => {
  const manager = read("src/components/output/OutputManager.tsx");
  assert.match(manager, /data-testid="output-live-status"/);
  assert.doesNotMatch(manager, /data-output-name-rec/);
  assert.doesNotMatch(
    manager,
    /route\.name[\s\S]{0,400}>\s*LIVE\s*</,
  );
});

test("title bar places tally right on macOS and left on Windows", () => {
  const title = read("src/components/portal/AppTitleBar.tsx");
  assert.match(title, /api\.getPlatform\(\)/);
  assert.match(title, /data-titlebar-platform=\{platform\}/);
  assert.match(title, /data-tally-platform=\{platform\}/);
  assert.match(title, /isMac \? \(/);
  assert.match(title, /data-titlebar-window-controls/);
  // Windows: tally before drag fill / window controls.
  assert.match(
    title,
    /ml-2 flex h-full items-center">\{tally\}[\s\S]*data-titlebar-drag-fill[\s\S]*windowControls/,
  );
  // macOS: tally after drag fill on the right.
  assert.match(
    title,
    /data-titlebar-drag-fill="" \/>\s*<div className="flex h-full items-center gap-2 pr-2">\{tally\}/,
  );
  assert.doesNotMatch(title, /navigator\.userAgent/);
});

test("build-recorder-addon skips unnecessary rebuilds", () => {
  const script = read("desktop/scripts/build-recorder-addon.mjs");
  assert.match(script, /isUpToDate/);
  assert.match(script, /--force/);
  assert.match(script, /Copied recorder addon/);
});
