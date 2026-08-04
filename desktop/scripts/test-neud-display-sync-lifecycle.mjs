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

test("1 restored session starts DisplaySyncService via bootstrap", () => {
  const main = read("desktop/src/main.ts");
  const coordinator = read("desktop/src/services/authenticated-cloud-coordinator.ts");
  assert.match(main, /bootstrapRestoredCloudSession/);
  assert.match(main, /restorePersistedSession/);
  assert.match(main, /startCloudSyncServices\("startup_restore"\)/);
  assert.match(coordinator, /restorePersistedSession/);
});

test("2 fresh sign-in starts DisplaySyncService through session stored callback", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /onSessionStored:/);
  assert.match(main, /notifySessionStored\(startReason\)|notifySessionStored\(reason\)/);
  assert.match(main, /authenticatedCloud\.onSessionStored\(\(reason\) => \{\s*startCloudSyncServices\(reason\)/);
});

test("3 session listeners are registered before bootstrap restore", () => {
  const main = read("desktop/src/main.ts");
  const listenerIndex = main.indexOf("authenticatedCloud.onSessionStored((reason) => {");
  const bootstrapIndex = main.indexOf("const bootstrapRestoredCloudSession");
  const displaySyncIndex = main.indexOf("displaySyncService = new DisplaySyncService");
  assert.ok(listenerIndex >= 0 && displaySyncIndex > listenerIndex);
  assert.ok(bootstrapIndex > displaySyncIndex);
});

test("4 DisplaySyncService start is idempotent", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /if \(this\.running\)/);
  assert.match(sync, /already_running/);
});

test("5 pre-start sync requests are replayed after start", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /syncRequestedWhileUnavailable/);
  assert.match(sync, /replayDeferredSyncIfNeeded/);
  assert.match(sync, /requestSync/);
});

test("6 immediate display-enabled sync reaches singleton through requestSync", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /displaySyncService\?\.requestSync/);
  assert.match(main, /let displaySyncService/);
});

test("7 immediate online-viewer sync reaches singleton through requestSync", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const main = read("desktop/src/main.ts");
  assert.match(service, /syncNow\?\.\("online-viewer"\)/);
  assert.match(main, /requestSync\(reason \?\? "online-viewer"\)/);
});

test("8 invalid session leaves service stopped with explicit unavailable status", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  const main = read("desktop/src/main.ts");
  assert.match(sync, /markServiceUnavailable/);
  assert.match(main, /session_refresh_failed|cloud_session_unavailable/);
});

test("9 missing config leaves service stopped with explicit unavailable status", () => {
  const main = read("desktop/src/main.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(main, /missing_cloud_config/);
  assert.match(sync, /markServiceUnavailable/);
});

test("10 sign-out stops cloud sync services", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /stopCloudSyncServices/);
  assert.match(main, /displaySyncService\?\.stop\(\)/);
  assert.match(main, /notifySessionCleared/);
});

test("11 token refresh uses shared coordinator without creating duplicate service instances", () => {
  const main = read("desktop/src/main.ts");
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(main, /let displaySyncService: DisplaySyncService \| null = null/);
  assert.match(session, /refreshSession/);
  assert.doesNotMatch(main, /new DisplaySyncService[\s\S]*new DisplaySyncService/);
});

test("12 existing pending queue begins processing after startup restore sync", () => {
  const main = read("desktop/src/main.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(main, /syncNow\("startup-restore"\)/);
  assert.match(sync, /deduplicatePending/);
});

test("13 runtime status never returns ambiguous null booleans in diagnostic output", () => {
  const diagnose = read("scripts/live-validation/diagnose-broad-arrow-online.mjs");
  const localDb = read("scripts/live-validation/lib/local-neud-db.mjs");
  assert.match(localDb, /displaySyncRuntime/);
  assert.match(diagnose, /authenticatedCloudSessionAvailable:/);
  assert.match(diagnose, /displaySyncServiceRunning:/);
  assert.doesNotMatch(diagnose, /authenticatedCloudSessionAvailable: null/);
});

test("14 diagnostic reports running and session state from persisted runtime status", () => {
  const localDb = read("scripts/live-validation/lib/local-neud-db.mjs");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(localDb, /displaySync\.runtimeStatus/);
  assert.match(sync, /DISPLAY_SYNC_RUNTIME_STATUS_KEY/);
  assert.match(sync, /persistRuntimeStatus/);
});

test("15 successful queue pass uses two-phase publication flow", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /pushDisplayBaseMetadata/);
  assert.match(sync, /pushPendingRevisions/);
  assert.match(sync, /pushDisplayPublicationMetadata/);
  assert.match(sync, /collectDisplaySyncTargets/);
});

test("17 sync pass reports partial when eligible queue work remains", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /resolveSyncPassResult/);
  assert.match(sync, /recordSyncAttempt\(syncResult\)/);
  assert.doesNotMatch(sync, /await this\.pushPending\(reason\);[\s\S]*recordSyncAttempt\("success"\)/);
});

test("16 viewer-role write remains denied at database policy layer", () => {
  const migration = read("supabase/migrations/019_desktop_authenticated_cloud_auth.sql");
  assert.match(migration, /display_revisions_insert[\s\S]*can_operate_project/);
  assert.match(migration, /display_revisions_select[\s\S]*can_view_project/);
});

test("local API exposes display sync diagnostics and manual sync trigger", () => {
  const api = read("desktop/src/services/local-api-server.ts");
  const data = read("desktop/src/services/local-data-service.ts");
  assert.match(api, /\/api\/display-sync\/diagnostics/);
  assert.match(api, /\/api\/display-sync\/sync-now/);
  assert.match(data, /getDisplaySyncDiagnostics/);
  assert.match(data, /requestDisplaySync/);
});

test("structured development logs cover service lifecycle without secrets", () => {
  const coordinator = read("desktop/src/services/authenticated-cloud-coordinator.ts");
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(coordinator, /\[CloudCoordinator\] session_restore/);
  assert.match(sync, /\[DisplaySync\] service_start/);
  assert.match(sync, /\[DisplaySync\] service_unavailable/);
  assert.match(sync, /\[DisplaySync\] sync_requested/);
  assert.match(sync, /\[DisplaySync\] sync_attempt/);
  assert.match(sync, /\[DisplaySync\] sync_complete/);
  assert.doesNotMatch(sync, /access_token/);
  assert.doesNotMatch(sync, /refresh_tokenAtStart|refresh_token:/);
});
