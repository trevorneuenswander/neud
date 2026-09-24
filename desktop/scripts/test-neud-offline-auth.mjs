import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("seven-day offline window is defined in auth license manager", () => {
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.match(auth, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(auth, /offlineExpiresAt/);
});

test("online verification extends offline access only after Supabase validation", () => {
  const auth = read("desktop/src/services/auth-license-manager.ts");
  const verify = read("desktop/src/services/auth-session-verification-service.ts");
  assert.match(auth, /refreshOnlineVerification/);
  assert.match(verify, /refreshOnlineVerification/);
  assert.match(auth, /monotonicVerifiedMs/);
});

test("revoked Supabase sessions clear auth instead of using offline fallback", () => {
  const verify = read("desktop/src/services/auth-session-verification-service.ts");
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(verify, /status: "revoked"/);
  assert.match(localData, /verification\.status === "revoked"/);
  assert.match(localData, /this\.auth\.clear\(\)/);
});

test("network failures return offline verification without clearing auth", () => {
  const verify = read("desktop/src/services/auth-session-verification-service.ts");
  assert.match(verify, /status: "offline"/);
  assert.match(verify, /isNetworkError/);
});

test("identity resolution falls back to offline-ready cache when Supabase is unreachable", () => {
  const identity = read("desktop/src/services/supabase-identity-service.ts");
  assert.match(identity, /loadFromLocalCache/);
  assert.match(identity, /offline-ready/);
});

test("dashboard authentication status module displays offline remaining time", () => {
  const dashboard = read("src/components/dashboard/DashboardAuthenticationStatus.tsx");
  const page = read("src/app/(portal)/dashboard/page.tsx");
  assert.match(dashboard, /Account Authentication Status/);
  assert.match(dashboard, /Offline Access Remaining/);
  assert.match(dashboard, /offlineAccessWarning/);
  assert.match(page, /DashboardAuthenticationStatus/);
});

test("offline auth metadata does not store plaintext passwords", () => {
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.doesNotMatch(auth, /password/);
  assert.match(auth, /offline_expires_at/);
});
