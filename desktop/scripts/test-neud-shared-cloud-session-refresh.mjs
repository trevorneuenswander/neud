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

test("refresh uses refresh_token directly without requiring setSession first", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /refreshSession\(\{\s*refresh_token:/);
  assert.doesNotMatch(session, /await this\.ensureClient\(config\);[\s\S]{0,80}refreshSession/s);
});

test("single-flight refresh mutex prevents concurrent refresh calls", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /refreshInFlight/);
  assert.match(session, /if \(this\.refreshInFlight\)/);
});

test("rotated refresh token is persisted atomically", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /refreshTokenRotated/);
  assert.match(session, /fs\.renameSync\(tempPath, filePath\)/);
  assert.match(session, /data\.session\.refresh_token/);
});

test("invalid refresh token marks reauthentication without deleting encrypted session file", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /markReauthenticationRequired/);
  assert.match(session, /reauthenticationRequired = true/);
  assert.doesNotMatch(session, /markReauthenticationRequired[\s\S]{0,250}unlinkSync/);
});

test("hasCloudSession is false when reauthentication is required", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  assert.match(session, /!this\.reauthenticationRequired/);
});

test("PublishingManager and CloudAccessBridge share AuthenticatedCloudCoordinator", () => {
  const main = read("desktop/src/main.ts");
  const publishing = read("desktop/src/services/publishing/publishing-manager.ts");
  const bridge = read("desktop/src/services/cloud-access-bridge.ts");
  assert.match(main, /new PublishingManager\(\s*\n\s*authenticatedCloud,/);
  assert.match(publishing, /acquireAuthenticatedClient/);
  assert.match(bridge, /acquireAuthenticatedClient/);
});

test("PublishingManager stops heartbeat when reauthentication is required", () => {
  const manager = read("desktop/src/services/publishing/publishing-manager.ts");
  assert.match(manager, /requiresReauthentication/);
  assert.match(manager, /stop\("invalid_refresh_token"\)/);
});

test("fresh login recovery restarts publishing and reloads access directory", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /getCloudAccessDirectory\(\{ forceRefresh: true \}\)/);
  assert.match(main, /publishingManager\?\.ensureStarted\(startReason\)/);
});

test("shared cloud auth diagnostics are persisted for all diagnostic scripts", () => {
  const sessionDiag = read("scripts/live-validation/diagnose-desktop-cloud-session.mjs");
  const cacheDiag = read("scripts/live-validation/diagnose-desktop-cloud-access-cache.mjs");
  const publishingDiag = read("scripts/live-validation/diagnose-broad-arrow-publishing.mjs");
  assert.match(sessionDiag, /sharedCloudAuth/);
  assert.match(cacheDiag, /sharedCloudAuth/);
  assert.match(publishingDiag, /sharedCloudAuth/);
  assert.match(read("desktop/src/main.ts"), /SHARED_CLOUD_AUTH_DIAGNOSTICS_KEY/);
});

test("diagnostics do not expose token values", () => {
  const session = read("desktop/src/services/supabase-user-session.ts");
  const shared = read("desktop/src/services/shared-cloud-auth-diagnostics.ts");
  assert.doesNotMatch(shared, /accessToken:/);
  assert.doesNotMatch(shared, /refreshToken:/);
  assert.doesNotMatch(session, /console\.(log|info).*accessToken/);
});
