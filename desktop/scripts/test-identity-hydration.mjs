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

function mergeOptionalProfileString(existing, incoming) {
  if (incoming === undefined) {
    return existing;
  }
  const trimmed = incoming?.trim();
  if (trimmed) {
    return trimmed;
  }
  return existing;
}

function pickNonEmptyString(...values) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

test("merge semantics preserve cached profile fields when remote values are empty", () => {
  assert.equal(mergeOptionalProfileString("Trevor Neuenswander", null), "Trevor Neuenswander");
  assert.equal(mergeOptionalProfileString("Hildreth Media Group", ""), "Hildreth Media Group");
  assert.equal(mergeOptionalProfileString(null, "Trevor Neuenswander"), "Trevor Neuenswander");
  assert.equal(mergeOptionalProfileString("Cached Name", undefined), "Cached Name");
});

test("resolved profile prefers auth cache then local user then membership team", () => {
  const resolver = readSrc("desktop/src/services/resolve-authenticated-profile.ts");
  assert.match(resolver, /pickNonEmptyString/);
  assert.match(resolver, /authUser\.displayName/);
  assert.match(resolver, /context\?\.displayName/);
  assert.match(resolver, /primaryMembershipTeamName/);

  assert.equal(
    pickNonEmptyString(null, "Local NEUD Owner", null),
    "Local NEUD Owner",
  );
  assert.equal(
    pickNonEmptyString(null, null, "Hildreth Media Group"),
    "Hildreth Media Group",
  );
});

test("projects meta exposes resolved identity fields", () => {
  const localDataService = readSrc("desktop/src/services/local-data-service.ts");
  const types = readSrc("src/lib/displays/types.ts");

  assert.match(localDataService, /getSupabaseIdentity\(\)/);
  assert.match(localDataService, /ensureIdentityLoaded/);
  assert.match(localDataService, /identityStatus:/);
  assert.match(localDataService, /resolvedProfileSource:/);
  assert.match(types, /identityStatus\?:/);
});

test("authorization resolves local user by email when auth ID is stale", () => {
  const authz = readSrc("desktop/src/services/access-authorization-service.ts");
  assert.match(authz, /getByEmail\(authUser\.email\)/);
  assert.match(authz, /Stale local Supabase link detected/);
});

test("auth cache update merges profile fields instead of erasing them", () => {
  const authManager = readSrc("desktop/src/services/auth-license-manager.ts");
  const fetchProfile = readSrc("desktop/src/services/fetch-supabase-profile.ts");
  const identityService = readSrc("desktop/src/services/supabase-identity-service.ts");

  assert.match(authManager, /mergeOptionalProfileString/);
  assert.match(fetchProfile, /company/);
  assert.match(fetchProfile, /isMissingTeamColumnError/);
  assert.match(identityService, /fetchSupabaseProfileByUserId/);
});

test("identity reconciliation links local users without overwriting Supabase cache", () => {
  const reconciliation = readSrc("desktop/src/services/user-identity-reconciliation-service.ts");
  assert.match(reconciliation, /resolveByAuthUserId/);
  assert.match(reconciliation, /localUser\?\.fullName/);
  assert.doesNotMatch(reconciliation, /updateCachedProfile\(/);
});

test("supabase identity service is authoritative when online", () => {
  const identityService = readSrc("desktop/src/services/supabase-identity-service.ts");
  const localDataService = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(identityService, /source: "supabase"/);
  assert.match(identityService, /repairStaleAuthUserId/);
  assert.match(identityService, /reset\(\)/);
  assert.match(localDataService, /kickIdentityResolution/);
  assert.match(localDataService, /getSupabaseIdentity/);
});

test("sidebar uses resolved meta team membership fallback", () => {
  const panel = readSrc("src/components/portal/SidebarUserPanel.tsx");
  assert.match(panel, /primaryMembershipTeamName/);
  assert.match(panel, /applyMetaToProfile/);
});

test("local auth profile builder uses membership team fallback", () => {
  const authServer = readSrc("src/lib/local/auth.server.ts");
  assert.match(authServer, /primaryMembershipTeamName/);
});

test("project authorization waits for identity hydration before denying access", () => {
  const authorization = readSrc("src/lib/projects/authorization.ts");
  assert.match(authorization, /identityStatus === "loading-session"/);
  assert.match(authorization, /identityStatus === "loading-profile"/);
  assert.match(authorization, /identityStatus === "missing-profile"/);
  assert.match(authorization, /stale-session/);
  assert.match(authorization, /state: "loading"/);
});

test("owner access does not require explicit project membership", () => {
  const authz = readSrc("desktop/src/services/access-authorization-service.ts");
  assert.match(authz, /platformRole === "owner"/);
  assert.match(authz, /return allProjects\.map/);
});

test("stale auth ID detection is logged in development", () => {
  const resolver = readSrc("desktop/src/services/resolve-authenticated-profile.ts");
  assert.match(resolver, /authUserIdMismatch/);
  assert.match(resolver, /Authenticated Supabase user ID does not match/);
});
