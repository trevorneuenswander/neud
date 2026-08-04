#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("session refresh classifies transient network failures separately from invalid refresh tokens", async () => {
  const { classifyRefreshFailure } = await import(
    pathToFileURL(path.join(desktopRoot, "dist/services/supabase-session-refresh.js")).href
  );

  assert.equal(classifyRefreshFailure({ message: "fetch failed" }), "network_error");
  assert.equal(classifyRefreshFailure({ name: "AuthRetryableFetchError" }), "network_error");
  assert.equal(classifyRefreshFailure({ message: "Invalid Refresh Token" }), "invalid_refresh_token");
  assert.equal(classifyRefreshFailure({ status: 401 }), "invalid_refresh_token");
  assert.equal(classifyRefreshFailure({ message: "something else" }), "refresh_failed");
});

test("SupabaseUserSessionService preserves encrypted session file on invalid refresh token", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /refreshInFlight/);
  assert.match(session, /markReauthenticationRequired/);
  assert.match(session, /refreshSession\(\{\s*refresh_token:/);
  assert.doesNotMatch(
    session,
    /markReauthenticationRequired[\s\S]{0,200}unlinkSync\(filePath\)/,
  );
});

test("PublishingManager keeps heartbeat timer and attempts bounded session recovery", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /ensureStarted/);
  assert.match(manager, /attemptCloudSessionRecovery/);
  assert.match(manager, /lastHeartbeatAttemptAt/);
  assert.match(manager, /lastHeartbeatSuccessAt/);
  assert.match(manager, /PUBLISHING_RUNTIME_STATUS_KEY/);
  assert.match(manager, /if \(!timerAlreadyActive\)/);
  assert.match(manager, /session_recovery_failed|lastRefreshErrorCode/);
});

test("token refresh path uses ensureStarted without creating duplicate heartbeat timers", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  const main = read("desktop/src/main.ts");

  assert.match(manager, /const timerAlreadyActive = this\.heartbeatTimer !== null/);
  assert.match(manager, /if \(!this\.started\) \{[\s\S]{0,500}this\.heartbeatTimer = setInterval/);
  assert.match(main, /publishingManager\?\.ensureStarted/);
});

test("restored cloud session resumes publishing after startup restore", () => {
  const main = read("desktop/src/main.ts");
  const coordinator = read("desktop/src/services/authenticated-cloud-coordinator.ts");

  assert.match(main, /if \(!authenticatedCloud\.hasCloudSession\(\)\)/);
  assert.match(main, /startCloudSyncServices\("startup_restore"\)/);
  assert.match(coordinator, /sessionAvailable: hasSession/);
});

test("session loss stops PublishingManager safely on explicit cloud session clear", () => {
  const main = read("desktop/src/main.ts");
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");

  assert.match(main, /onSessionCleared/);
  assert.match(main, /publishingManager\?\.stop/);
  assert.match(manager, /async stop\(reason/);
  assert.match(manager, /clearInterval\(this\.heartbeatTimer\)/);
});

test("successful session recovery restarts publishing via ensureStarted and heartbeat cycle", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /if \(!sessionReady\)/);
  assert.match(manager, /lastHeartbeatErrorCode: null/);
  assert.match(manager, /void this\.runHeartbeatCycle\(\)/);
});

test("offline desktop authorization is not treated as authenticated cloud session", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  const main = read("desktop/src/main.ts");

  assert.match(manager, /getAuthSnapshot/);
  assert.match(manager, /isAuthenticatedCloudSessionAvailable/);
  assert.match(manager, /cloud\.hasRestorableCloudSession/);
  assert.match(manager, /AuthenticatedCloudCoordinator/);
  assert.match(manager, /acquireAuthenticatedClient/);
  assert.match(main, /authenticatedCloud\.hasCloudSession\(\)/);
  assert.match(main, /authenticatedCloud\.hasPersistedTokens\(\)/);
  assert.doesNotMatch(
    manager,
    /isAccessAllowed\(\)[\s\S]{0,80}hasCloudSession/,
  );
});

test("heartbeat continues across multiple intervals while lease maintenance runs", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /PUBLISHING_HEARTBEAT_MS/);
  assert.match(manager, /shouldMaintainPublisherLease/);
  assert.match(manager, /"heartbeat"/);
  assert.match(manager, /ensurePublisherLease/);
});

test("diagnose broad arrow publishing reads persisted PublishingManager runtime status", () => {
  const diagnose = read("scripts/live-validation/diagnose-broad-arrow-publishing.mjs");
  const localDb = read("scripts/live-validation/lib/local-neud-db.mjs");

  assert.match(localDb, /publishing\.runtimeStatus/);
  assert.match(diagnose, /publishingManagerInitialized: publishingRuntime\.initialized/);
  assert.match(diagnose, /publishingManagerRunning: publishingRuntime\.running/);
  assert.doesNotMatch(diagnose, /publishingManagerInitialized: null/);
});
