#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("duplicate-email repair migrates obsolete rows before authoritative upsert", () => {
  const reconciliation = readSrc("desktop/src/services/local-user-identity-reconciliation.ts");

  assert.match(reconciliation, /authoritativeUserId = input\.supabaseUserId/);
  assert.match(reconciliation, /collectObsoleteLocalUserRows/);
  assert.match(reconciliation, /migrateLocalUserReferences[\s\S]*DELETE FROM local_users/);
  assert.match(reconciliation, /upsertCanonicalLocalUser/);
  assert.doesNotMatch(
    reconciliation,
    /insertLocalUserFromStale/,
  );
});

test("reconciliation handles linked row whose local id differs from Supabase user id", () => {
  const reconciliation = readSrc("desktop/src/services/local-user-identity-reconciliation.ts");

  assert.match(reconciliation, /linkedRow && input\.linkedRow\.id !== input\.authoritativeUserId/);
});

test("reconciliation result types include synced and reconciled", () => {
  const reconciliation = readSrc("desktop/src/services/local-user-identity-reconciliation.ts");
  const identity = readSrc("desktop/src/services/supabase-identity-service.ts");

  assert.match(reconciliation, /status: "reconciled"/);
  assert.match(reconciliation, /status: "synced"/);
  assert.match(reconciliation, /migratedReferenceCount/);
  assert.match(identity, /reconciliation\.status === "reconciled"/);
});

test("cache sync failure does not set sidebar identity error message", () => {
  const identity = readSrc("desktop/src/services/supabase-identity-service.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");

  assert.doesNotMatch(
    identity,
    /Local identity cache could not be updated\. Online access remains available/,
  );
  assert.match(localData, /identity\?\.status === "online-ready"/);
});

test("sidebar successful state is clean", () => {
  const panel = readSrc("src/components/portal/SidebarUserPanel.tsx");

  assert.match(panel, /LogoutButton/);
  assert.doesNotMatch(panel, /identityDiagnostics/);
  assert.doesNotMatch(panel, /Local identity cache could not be updated/);
  assert.doesNotMatch(panel, /formatPlatformRole/);
  assert.doesNotMatch(panel, /Clear Local Session/);
});

test("sidebar only shows clear-session on stale-session error", () => {
  const panel = readSrc("src/components/portal/SidebarUserPanel.tsx");

  assert.match(panel, /showClearLocalSession=\{meta\?\.identityStatus === "stale-session"\}/);
});

test("SessionRecoveryActions hides clear-session by default", () => {
  const recovery = readSrc("src/components/auth/SessionRecoveryActions.tsx");

  assert.match(recovery, /showClearLocalSession = false/);
});

test("activity_events actor_id migration removed because column does not exist", () => {
  const reconciliation = readSrc("desktop/src/services/local-user-identity-reconciliation.ts");

  assert.doesNotMatch(reconciliation, /activity_events/);
  assert.match(reconciliation, /tableHasColumn/);
});

test("startup identity reconciliation uses sync local repair helper", () => {
  const startup = readSrc("desktop/src/services/user-identity-reconciliation-service.ts");

  assert.match(startup, /reconcileLocalUserIdentitySync/);
});

test("reconciliation removes deactivated merged-email obsolete rows", () => {
  const reconciliation = readSrc("desktop/src/services/local-user-identity-reconciliation.ts");

  assert.match(reconciliation, /\.merged\./);
  assert.match(reconciliation, /users\.listAll\(\)/);
});
