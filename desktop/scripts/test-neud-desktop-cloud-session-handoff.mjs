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

test("desktop login requires main-process cloud session handoff", () => {
  const signIn = read("src/lib/auth/client-sign-in.ts");
  const handoff = read("src/lib/auth/desktop-session-handoff.ts");

  assert.match(signIn, /requiresDesktopMainSessionHandoff/);
  assert.match(signIn, /buildDesktopCloudSessionPayload/);
  assert.match(signIn, /handoffTarget: "desktop"/);
  assert.match(signIn, /Desktop cloud session bridge is unavailable/);
  assert.doesNotMatch(signIn, /if \(api\?\.auth\) \{/);
});

test("desktop session handoff resolves expiry from expires_at or expires_in", () => {
  const handoff = read("src/lib/auth/desktop-session-handoff.ts");
  assert.match(handoff, /session\.expires_at/);
  assert.match(handoff, /session\.expires_in/);
  assert.match(handoff, /3_600_000/);
});

test("IPC storeVerifiedSession requires desktop cloud session and returns safe booleans", () => {
  const authIpc = read("desktop/src/ipc/auth.ts");
  assert.match(authIpc, /handoffTarget === "desktop"/);
  assert.match(authIpc, /cloudSessionSchema/);
  assert.match(authIpc, /mainProcessSessionAvailable/);
  assert.match(authIpc, /getCloudSessionDiagnostics/);
  assert.match(authIpc, /CLOUD_SESSION_DIAGNOSTICS_KEY/);
});

test("SupabaseUserSessionService reports encrypted persistence probe without secrets", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /getPersistedSessionProbe/);
  assert.match(session, /CloudSessionStoreResult/);
  assert.match(session, /decrypt_failed/);
  assert.match(session, /safe_storage_unavailable/);
});

test("login notification starts PublishingManager with login reason", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /onSessionStored: \(\{ startReason \}\)/);
  assert.match(main, /notifySessionStored\(startReason\)/);
  assert.match(main, /startCloudSyncServices\(reason\)/);
  assert.match(main, /lastPublishingManagerStartReason: hasCloudSession \? startReason/);
});

test("startup restore starts cloud services with startup_restore reason", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /startCloudSyncServices\("startup_restore"\)/);
  assert.match(main, /lastPublishingManagerStartReason: postRestoreAuth\.authenticatedCloudSessionAvailable/);
});

test("hosted login does not call Electron IPC storeVerifiedSession", () => {
  const signIn = read("src/lib/auth/client-sign-in.ts");
  const actions = read("src/lib/auth/actions.ts");
  assert.match(signIn, /if \(!requiresDesktopMainSessionHandoff\(\)\)/);
  assert.match(signIn, /return;/);
  assert.doesNotMatch(actions, /storeVerifiedSession/);
});

test("desktop offline authorization does not imply cloud session for publishing start", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  const main = read("desktop/src/main.ts");
  assert.match(manager, /startRejectedReason: "cloud_session_unavailable"/);
  assert.match(manager, /cloud\.hasRestorableCloudSession/);
  assert.match(main, /authenticatedCloud\.hasCloudSession\(\)/);
  assert.match(main, /authenticatedCloud\.hasPersistedTokens\(\)/);
});

test("PublishingManager records start and first heartbeat diagnostics", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  const runtime = read("desktop/src/services/publishing/publishing-runtime-status.ts");
  assert.match(runtime, /startRequestedAt/);
  assert.match(runtime, /firstHeartbeatAttemptAt/);
  assert.match(runtime, /firstHeartbeatResult/);
  assert.match(manager, /startAccepted: true/);
  assert.match(manager, /heartbeatTimerCreatedAt/);
});

test("packaged desktop Next server enables local-data runtime env", () => {
  const nextServer = read("desktop/src/services/next-server.ts");
  const pkg = read("package.json");
  assert.match(nextServer, /NEUD_USE_LOCAL_DATA: "1"/);
  assert.match(nextServer, /NEXT_PUBLIC_NEUD_USE_LOCAL_DATA: "1"/);
  assert.match(pkg, /build:web.*NEUD_USE_LOCAL_DATA=1/);
});

test("desktop cloud session diagnose script reports safe booleans only", () => {
  const diagnose = read("scripts/live-validation/diagnose-desktop-cloud-session.mjs");
  const pkg = read("package.json");
  assert.match(diagnose, /cloudSession\.diagnostics/);
  assert.match(diagnose, /rendererSignInSucceeded/);
  assert.match(diagnose, /accessTokenReceived/);
  assert.match(diagnose, /refreshTokenReceived/);
  assert.doesNotMatch(diagnose, /access_token/);
  assert.match(pkg, /diagnose:desktop-cloud-session/);
});

test("duplicate session events use idempotent PublishingManager ensureStarted", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /const timerAlreadyActive = this\.heartbeatTimer !== null/);
});
