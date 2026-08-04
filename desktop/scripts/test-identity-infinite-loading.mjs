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

test("Supabase ready despite local cache conflict path publishes online-ready before cache sync", () => {
  const identity = readSrc("desktop/src/services/supabase-identity-service.ts");
  const reconciliation = readSrc("desktop/src/services/local-user-identity-reconciliation.ts");

  assert.match(identity, /publishOnlineIdentity/);
  assert.match(identity, /syncLocalCache/);
  assert.match(identity, /status: "online-ready"/);
  assert.match(identity, /cacheSync/);
  assert.match(reconciliation, /UNSAFE_IDENTITY_CONFLICT/);
});

test("safe stale-user reconciliation migrates references before deleting obsolete row", () => {
  const reconciliation = readSrc("desktop/src/services/local-user-identity-reconciliation.ts");

  assert.match(reconciliation, /migrateLocalUserReferences/);
  assert.match(reconciliation, /DELETE FROM local_users WHERE id = \?/);
  assert.match(reconciliation, /upsertCanonicalLocalUser/);
  assert.doesNotMatch(
    reconciliation,
    /insertLocalUserFromStale[\s\S]*migrateLocalUserReferences[\s\S]*DELETE FROM local_users/,
  );
});

test("unsafe duplicate conflict returns explicit conflict without blocking online identity", () => {
  const identity = readSrc("desktop/src/services/supabase-identity-service.ts");
  const reconciliation = readSrc("desktop/src/services/local-user-identity-reconciliation.ts");
  const panel = readSrc("src/components/portal/SidebarUserPanel.tsx");

  assert.match(reconciliation, /UNSAFE_IDENTITY_CONFLICT/);
  assert.match(identity, /reconciliation\.status === "conflict"/);
  assert.match(panel, /Account could not be loaded/);
});

test("identity timeout clears loading promise in finally", () => {
  const identity = readSrc("desktop/src/services/supabase-identity-service.ts");

  assert.match(identity, /IDENTITY_TOTAL_TIMEOUT_MS/);
  assert.match(identity, /finally/);
  assert.match(identity, /this\.loadingPromise = null/);
  assert.match(identity, /status: "error"/);
});

test("projects page reaches server-error instead of perpetual loading", () => {
  const projectsPage = readSrc("src/components/projects/ProjectsPageClient.tsx");

  assert.match(projectsPage, /projectsStatus/);
  assert.match(projectsPage, /"server-error"/);
  assert.match(projectsPage, /Projects could not be loaded/);
  assert.match(projectsPage, /finally/);
});

test("no recursive identity resolution from background meta polling", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const identity = readSrc("desktop/src/services/supabase-identity-service.ts");

  assert.match(localData, /kickIdentityResolution/);
  assert.match(localData, /online-ready/);
  assert.match(localData, /offline-ready/);
  assert.match(identity, /Joining in-flight identity attempt/);
  assert.match(identity, /Identity already/);
});

test("owner access before local cache sync uses verified Supabase auth cache", () => {
  const authz = readSrc("desktop/src/services/access-authorization-service.ts");

  assert.match(authz, /buildSupabaseVerifiedOwnerContext/);
  assert.match(authz, /profileSyncedAt/);
  assert.match(authz, /accessibleProjectIds: allProjects\.map/);
});

test("profile schema mode is cached for process lifetime", () => {
  const schema = readSrc("desktop/src/services/supabase-profile-schema.ts");
  const fetchProfile = readSrc("desktop/src/services/fetch-supabase-profile.ts");

  assert.match(schema, /cachedProfileTeamColumn/);
  assert.match(schema, /legacy-company/);
  assert.match(fetchProfile, /getCachedProfileTeamColumn/);
  assert.match(fetchProfile, /isMissingTeamColumnError/);
});

test("loadFromLocalCache never returns permanent loading while online", () => {
  const identity = readSrc("desktop/src/services/supabase-identity-service.ts");

  assert.match(identity, /status: offline \? "offline-ready" : "error"/);
  assert.doesNotMatch(identity, /status: offline \? "offline-ready" : "loading"/);
});

test("sidebar and projects use separate identity and projects loading states", () => {
  const panel = readSrc("src/components/portal/SidebarUserPanel.tsx");
  const projectsPage = readSrc("src/components/projects/ProjectsPageClient.tsx");

  assert.match(panel, /identityStatus/);
  assert.match(projectsPage, /identityStatus/);
  assert.match(projectsPage, /projectsStatus/);
  assert.match(projectsPage, /Loading account…/);
  assert.match(projectsPage, /Loading projects…/);
});

test("development identity diagnostics expose cache sync conflict fields", () => {
  const identity = readSrc("desktop/src/services/supabase-identity-service.ts");

  assert.match(identity, /localCacheSyncErrorCode/);
  assert.match(identity, /conflictingLocalUserId/);
  assert.match(identity, /getDebugSnapshot/);
  assert.match(identity, /getLocalIdentitySyncDiagnostics/);
});
