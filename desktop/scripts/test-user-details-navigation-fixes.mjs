#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function extractNavLabels(source) {
  return [...source.matchAll(/label:\s*"([^"]+)"/g)].map((match) => match[1]);
}

test("portal navigation exposes Users and removes Profile", () => {
  const navigation = read("src/lib/portal/navigation.ts");
  const labels = extractNavLabels(navigation);

  assert.ok(labels.includes("Users"));
  assert.ok(!labels.includes("Users and Access"));
  assert.ok(!labels.includes("Profile"));
  assert.equal(navigation.includes('"/profile"'), false);
  assert.match(navigation, /"\/users": "Users"/);
});

test("local nav filtering keeps Users for authorized managers", () => {
  const navItems = read("src/lib/portal/nav-items.server.ts");
  assert.match(navItems, /canManageUsersAndAccess/);
  assert.match(navItems, /localGetProjectsMeta/);
});

test("profile route redirects to user details", () => {
  const profilePage = read("src/app/(portal)/profile/page.tsx");
  assert.match(profilePage, /redirect\(/);
  assert.match(profilePage, /authenticatedLocalUserId/);
  assert.doesNotMatch(profilePage, /ProfileForm/);
});

test("sidebar account name links to authenticated local user details", () => {
  const sidebar = read("src/components/portal/SidebarUserPanel.tsx");
  assert.match(sidebar, /getUserDetailsHref/);
  assert.match(sidebar, /authenticatedLocalUserId/);
  assert.match(sidebar, /focus-visible:ring/);
  assert.doesNotMatch(sidebar, /primaryMembershipTeamName/);
});

test("user details resolves supabase-first profile fields", () => {
  const resolver = read("desktop/src/services/resolve-user-details-profile.ts");
  const localData = read("desktop/src/services/local-data-service.ts");
  const identity = read("desktop/src/services/supabase-identity-service.ts");

  assert.match(resolver, /supabaseFullName, input\.localFullName/);
  assert.match(resolver, /supabaseTeam, input\.localProfileTeam/);
  assert.match(resolver, /supabasePhoneNumber, input\.localPhone/);
  assert.match(localData, /fetchRemoteProfile/);
  assert.match(localData, /syncProfileFieldsToLocalUser/);
  assert.match(localData, /teamName: fields\.teamName/);
  assert.match(identity, /phone: input\.profile\.phone_number/);
  assert.match(identity, /profileTeam: input\.profile\.team/);
  assert.doesNotMatch(identity, /email\.split\("@"/);
});

test("user details view shows profile team and role labels", () => {
  const view = read("src/components/users/UserDetailsView.tsx");
  assert.match(view, /profile\.teamName/);
  assert.match(view, /profile\.roleLabel/);
  assert.match(view, /Back to Users/);
  assert.doesNotMatch(view, /Users and Access/);
});

test("supabase schema already includes phone_number and team", () => {
  const migration = read("supabase/migrations/015_profile_contact_fields.sql");
  assert.match(migration, /phone_number text/);
  assert.match(migration, /rename column company to team/);
});

test("distinct accounts use stable local user ids for details links", () => {
  const sidebar = read("src/components/portal/SidebarUserPanel.tsx");
  const detailsPage = read("src/app/(portal)/users/[userId]/page.tsx");
  assert.match(sidebar, /authenticatedLocalUserId/);
  assert.doesNotMatch(sidebar, /email\.split/);
  assert.match(detailsPage, /UserDetailsClient userId=\{userId\}/);
});

test("offline cache stores profile team and phone during identity sync", () => {
  const reconciliation = read("desktop/src/services/local-user-identity-reconciliation.ts");
  const usersRepo = read("desktop/src/repositories/local-users-repository.ts");
  assert.match(reconciliation, /profile_team/);
  assert.match(reconciliation, /phone = \?/);
  assert.match(usersRepo, /updateSyncedProfileFields/);
  assert.match(read("desktop/src/database/migrations/032_local_users_profile_team.sql"), /profile_team TEXT/);
});

test("unmatched downloaded lot clears properties and blocks stale envelope restore", () => {
  const controller = read("src/components/bag-graphics/BagControllerClient.tsx");
  const navHook = read("src/components/bag-graphics/useDownloadedLotNavigation.ts");

  assert.match(controller, /clearUnmatchedLotProperties/);
  assert.match(controller, /unmatchedLotDraftRef/);
  assert.match(controller, /setPhotoPreviewLotNumber\(null\)/);
  assert.match(controller, /clearSelectedDownloadedLot/);
  assert.match(controller, /unmatchedLotDraftRef\.current \|\|/);
  assert.match(navHook, /clearSelectedDownloadedLot/);
  assert.match(navHook, /current < 0/);
  assert.match(navHook, /selectedDownloadedLotIndex >= 0/);
});
