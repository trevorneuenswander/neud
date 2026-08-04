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

const PROFILE_TEAM_NOT_SET_LABEL = "Team not set";

function resolveProfileTeamName(input) {
  const profileTeam = input.profileTeam?.trim();
  if (profileTeam) {
    return profileTeam;
  }

  const syncedLocalTeam = input.syncedLocalTeam?.trim();
  if (syncedLocalTeam) {
    return syncedLocalTeam;
  }

  const primaryMembershipTeamName = input.primaryMembershipTeamName?.trim();
  if (primaryMembershipTeamName) {
    return primaryMembershipTeamName;
  }

  const legacyCompany = input.legacyCompany?.trim();
  if (legacyCompany && !profileTeam) {
    return legacyCompany;
  }

  return PROFILE_TEAM_NOT_SET_LABEL;
}

test("sidebar team resolver prefers profile.team over fallbacks", () => {
  const resolver = readSrc("src/lib/profile/resolve-profile-team.ts");
  assert.match(resolver, /profileTeam/);
  assert.match(resolver, /syncedLocalTeam/);
  assert.match(resolver, /primaryMembershipTeamName/);
  assert.match(resolver, /PROFILE_TEAM_NOT_SET_LABEL/);

  assert.equal(
    resolveProfileTeamName({
      profileTeam: "Hildreth Media Group",
      syncedLocalTeam: "Other Team",
      primaryMembershipTeamName: "Another Team",
    }),
    "Hildreth Media Group",
  );
});

test("sidebar team resolver uses synced local cache when profile team is missing", () => {
  assert.equal(
    resolveProfileTeamName({
      profileTeam: null,
      syncedLocalTeam: "Hildreth Media Group",
    }),
    "Hildreth Media Group",
  );
});

test("sidebar team resolver prefers team over deprecated company", () => {
  assert.equal(
    resolveProfileTeamName({
      profileTeam: "Hildreth Media Group",
      legacyCompany: "Legacy Company",
    }),
    "Hildreth Media Group",
  );
});

test("sidebar team resolver falls back to Team not set", () => {
  assert.equal(
    resolveProfileTeamName({
      profileTeam: null,
      syncedLocalTeam: null,
      primaryMembershipTeamName: null,
    }),
    PROFILE_TEAM_NOT_SET_LABEL,
  );
});

test("SidebarUserPanel renders team beneath user name with truncation tooltip", () => {
  const panel = readSrc("src/components/portal/SidebarUserPanel.tsx");
  assert.match(panel, /sidebar-user-identity/);
  assert.match(panel, /sidebar-user-name/);
  assert.match(panel, /sidebar-user-team/);
  assert.match(panel, /resolveSidebarTeamName/);
  assert.match(panel, /title=\{teamName\}/);
  assert.match(panel, /truncate/);
  assert.match(panel, /localGetProjectsMeta/);
});

test("local profile builder uses authenticated user team from projects meta", () => {
  const authServer = readSrc("src/lib/local/auth.server.ts");
  const localDataService = readSrc("desktop/src/services/local-data-service.ts");
  const fetchProfile = readSrc("src/lib/supabase/fetch-profile.ts");

  assert.match(authServer, /authenticatedUserTeam/);
  assert.match(authServer, /primaryMembershipTeamName/);
  assert.match(localDataService, /ensureIdentityLoaded/);
  assert.match(localDataService, /getSupabaseIdentity/);
  assert.match(fetchProfile, /company/);
});

test("auth session verification uses adaptive Supabase profile fetch", () => {
  const verification = readSrc("desktop/src/services/auth-session-verification-service.ts");
  assert.match(verification, /fetchSupabaseProfileByUserId/);
  assert.match(verification, /mergeOptionalProfileString/);
});

test("sidebar profile hydration refreshes without requiring app restart", () => {
  const panel = readSrc("src/components/portal/SidebarUserPanel.tsx");
  assert.match(panel, /Loading account/);
  assert.match(panel, /applyMetaToProfile/);
  assert.match(panel, /identityStatus/);
  assert.match(panel, /visibilitychange/);
});
