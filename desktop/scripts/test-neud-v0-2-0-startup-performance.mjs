#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("CloudAccess lifecycle logs are debug-gated", () => {
  const provider = read("desktop/src/services/authenticated-client-provider.ts");
  assert.match(provider, /isCloudAccessDebugEnabled/);
  assert.match(provider, /NEUD_DEBUG_CLOUD_ACCESS === "1"/);
  assert.doesNotMatch(provider, /NEUD_DEBUG_STARTUP === "1"[\s\S]*isCloudAccessDebugEnabled/);
  assert.match(provider, /getCloudAccessStartupMetrics/);
});

test("NEUD_DEBUG_STARTUP alone does not enable CloudAccess per-request logs", () => {
  const provider = read("desktop/src/services/authenticated-client-provider.ts");
  const debugGate = provider.match(/function isCloudAccessDebugEnabled\(\)[\s\S]*?^\}/m)?.[0];
  assert.ok(debugGate);
  assert.doesNotMatch(debugGate, /NEUD_DEBUG_STARTUP/);
  assert.doesNotMatch(debugGate, /NEUD_DEBUG === "1"/);
});

test("startup auth recovery defers service kickoff to cloud bootstrap owner", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  const startupRecovery = service.match(
    /executePostCloudAuthRecovery[\s\S]*?private async executePostCloudAuthRecovery[\s\S]*?^\  \}/m,
  )?.[0];
  assert.ok(startupRecovery);
  assert.match(startupRecovery, /if \(reason === "startup"\)/);
  assert.match(startupRecovery, /getCloudAccessDirectory\(\{ forceRefresh: false \}\)/);
  assert.match(startupRecovery, /return;\s*\n\s*\}\s*\n\s*this\.publishingManager/);
});

test("startup session restore avoids force refresh on cold start", () => {
  const service = read("desktop/src/services/local-data-service.ts");
  assert.match(service, /forceRefresh: reason === "reconnect"/);
  assert.doesNotMatch(service, /forceRefresh: reason === "startup"/);
});

test("cloud bootstrap does not duplicate startup-restore sync passes", () => {
  const main = read("desktop/src/main.ts");
  assert.doesNotMatch(main, /syncNow\("startup-restore"\)/);
  assert.match(main, /startCloudSyncServices\("startup_restore"\)/);
});

test("DisplaySync starts once from cloud bootstrap owner", () => {
  const main = read("desktop/src/main.ts");
  assert.doesNotMatch(main, /localDataService\.setDisplaySync\(displaySyncService\);\s*\n\s*displaySyncService\.start\(\)/);
  assert.match(main, /startCloudSyncServices\("startup_restore"\)/);
});

test("ActivitySync start is idempotent", () => {
  const activity = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(activity, /serviceStarted/);
  assert.match(activity, /if \(this\.serviceStarted\)/);
});

test("DisplaySync coalesces duplicate startup sync requests", () => {
  const display = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(display, /STARTUP_COALESCE_SYNC_REASONS/);
  assert.match(display, /syncFollowUpHadWork/);
});

test("DisplaySync skips empty follow-up when no concurrent work arrived", () => {
  const display = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(display, /shouldRunFollowUpPass/);
  assert.match(display, /follow_up_suppressed_no_eligible_work/);
});

test("User Directory coalesces duplicate startup/login sync", () => {
  const directory = read(
    "desktop/src/services/supabase-user-directory-sync/supabase-user-directory-sync-service.ts",
  );
  assert.match(directory, /reason === "startup" \|\| reason === "login"/);
});

test("Hosted viewer URL diagnostics require explicit debug flag", () => {
  const viewerUrl = read("src/lib/hosted/viewer-url.ts");
  assert.match(viewerUrl, /NEUD_DEBUG_VIEWER/);
  assert.match(viewerUrl, /NEXT_PUBLIC_NEUD_DEBUG_VIEWER/);
});

test("startup performance instrumentation is available", () => {
  const perf = read("desktop/src/services/startup-performance.ts");
  assert.match(perf, /NEUD_DEBUG_STARTUP/);
  assert.match(perf, /markStartupPhase/);
  assert.match(perf, /printStartupPerformanceSummary/);
});

test("app settings skip unchanged values during startup writes", () => {
  const settings = read("desktop/src/repositories/app-settings-repository.ts");
  assert.match(settings, /skippedUnchanged/);
  assert.match(settings, /existing\?\.value_json === nextJson/);
  assert.match(settings, /categorizeAppSettingsKey/);
  assert.match(settings, /byCategory/);
});

test("dev asset copy supports skip when unchanged", () => {
  const copy = read("desktop/scripts/copy-runtime-assets.mjs");
  assert.match(copy, /copyIfChanged/);
  assert.match(copy, /up to date/);
});
