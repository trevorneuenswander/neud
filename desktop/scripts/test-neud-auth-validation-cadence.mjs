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

test("startup performs primary auth validation once", () => {
  const main = read("desktop/src/main.ts");
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(main, /performStartupAuthValidation/);
  assert.match(localData, /startupAuthValidationStarted/);
  assert.match(localData, /verifyOnlineSession\(\{ reason: "startup" \}\)/);
});

test("connectivity polling does not invoke authentication validation", () => {
  const hook = read("src/lib/connectivity/use-internet-connection.ts");
  assert.doesNotMatch(hook, /verify-online/);
});

test("profile directory sync is not triggered by reconnect-only validation", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /recoverSessionAfterInternetRestore/);
  assert.match(localData, /shouldSyncDirectory/);
  assert.match(localData, /shouldRefreshIdentity/);
  assert.match(localData, /reason: "reconnect"/);
});

test("successful startup validation updates last-success timestamp via auth manager", () => {
  const verify = read("desktop/src/services/auth-session-verification-service.ts");
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.match(verify, /refreshOnlineVerification/);
  assert.match(auth, /lastVerifiedAt/);
  assert.match(auth, /offlineExpiresAt/);
});

test("offline startup within 7 days allows offline access", () => {
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.match(auth, /OFFLINE_WINDOW_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(auth, /withinWindow/);
});

test("offline startup after 7 days requires login", () => {
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.match(auth, /Online account verification is required/);
});

test("explicit login validates immediately", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /refreshIdentity\("login"\)/);
});

test("reconnect events are cooldown-protected", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(localData, /SESSION_RECOVERY_COOLDOWN_MS/);
  assert.match(localData, /recoverSessionAfterInternetRestore/);
  assert.match(api, /\/api\/auth\/recover-session/);
});

test("manual verify-online remains explicit and separate from connectivity probes", () => {
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /verifyOnlineSession\(\{ reason: "manual" \}\)/);
});

test("startup auth path does not depend on connectivity footer hook", () => {
  const hook = read("src/lib/connectivity/use-internet-connection.ts");
  assert.doesNotMatch(hook, /performStartupAuthValidation/);
});

test("offline startup does not move lastVerifiedAt", () => {
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.match(auth, /loadFromDatabase/);
  assert.doesNotMatch(
    auth.slice(auth.indexOf("loadFromDatabase"), auth.indexOf("loadFromDatabase") + 1200),
    /refreshOnlineVerification/,
  );
});

test("failed online validation does not extend offlineExpiresAt", () => {
  const verify = read("desktop/src/services/auth-session-verification-service.ts");
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(verify, /status: "offline"/);
  assert.match(verify, /status: "revoked"/);
  assert.doesNotMatch(
    verify.slice(verify.indexOf('status: "offline"'), verify.indexOf('status: "offline"') + 400),
    /refreshOnlineVerification/,
  );
  assert.match(localData, /verification\.status === "revoked"/);
});

test("connectivity probe success does not extend the seven-day window", () => {
  const internet = read("src/lib/connectivity/internet-connection.ts");
  const hook = read("src/lib/connectivity/use-internet-connection.ts");
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.doesNotMatch(internet, /refreshOnlineVerification/);
  assert.doesNotMatch(hook, /refreshOnlineVerification/);
  assert.doesNotMatch(hook, /offlineExpiresAt/);
  assert.match(auth, /refreshOnlineVerification\(\)/);
});

test("successful online session validation sets offlineExpiresAt to validation plus seven days", () => {
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.match(auth, /offlineExpiresAt: new Date\(nowMs \+ OFFLINE_WINDOW_MS\)/);
  assert.match(auth, /OFFLINE_WINDOW_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
});

test("cached session remains usable offline only until persisted expiration", () => {
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.match(auth, /withinWindow/);
  assert.match(auth, /Online account verification is required/);
});
