#!/usr/bin/env node
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const OWNER_EMAIL = "trevorneuenswander@gmail.com";

test("shared role model defines sole owner and site-wide access helpers", () => {
  const roleModel = read("src/lib/access-management/role-model.ts");
  assert.match(roleModel, /DEFAULT_OWNER_EMAIL/);
  assert.match(roleModel, /hasSiteWideAccessForUser/);
  assert.match(roleModel, /isNeudTeamAdminUser/);
  assert.match(roleModel, /ASSIGNABLE_TEAM_ROLES/);
  assert.match(roleModel, /PROJECT_ROLES/);
  assert.match(roleModel, /buildProjectAccessRows/);
  assert.match(roleModel, /formatUserWithTeams/);
});

test("migration 045 enforces sole owner and NEUD admin site-wide access", () => {
  const migration = read("supabase/migrations/045_access_role_model.sql");
  assert.match(migration, /sole_owner_user_id/);
  assert.match(migration, /has_site_wide_access/);
  assert.match(migration, /owner_role_not_assignable/);
  assert.match(migration, /sole_owner_protected/);
  assert.match(migration, /owner_team_protected/);
  assert.match(migration, new RegExp(OWNER_EMAIL.replace(".", "\\.")));
  assert.match(migration, /get_access_management_directory/);
});

test("capabilities use hasSiteWideAccess instead of platform admin shortcuts", () => {
  const capabilities = read("src/lib/access-management/capabilities.ts");
  assert.match(capabilities, /hasSiteWideAccess/);
  assert.doesNotMatch(capabilities, /isPlatformAdmin/);
  assert.doesNotMatch(capabilities, /isPlatformOwner/);
});

test("teams panel hides create form by default and removes descriptions", () => {
  const teamsPanel = read("src/components/access-management/TeamsPanel.tsx");
  assert.match(teamsPanel, /showCreateForm/);
  assert.match(teamsPanel, /Create Team/);
  assert.match(teamsPanel, /ASSIGNABLE_TEAM_ROLES/);
  assert.match(teamsPanel, /Sole NEUD owner/);
  assert.doesNotMatch(teamsPanel, /team-description/);
  assert.doesNotMatch(teamsPanel, /value="owner"/);
});

test("users panel removes platform role surfaces", () => {
  const usersPanel = read("src/components/access-management/UsersPanel.tsx");
  assert.doesNotMatch(usersPanel, /Platform role/);
  assert.doesNotMatch(usersPanel, /platformRole/);
  assert.match(usersPanel, /Team Role/);
  assert.match(usersPanel, /resolveUserAccessScope/);
});

test("project access panel shows team and access source columns", () => {
  const projectPanel = read("src/components/access-management/ProjectAccessPanel.tsx");
  assert.match(projectPanel, /PROJECT_ACCESS_COLUMN_WIDTHS/);
  assert.match(projectPanel, /Access Source/);
  assert.match(projectPanel, /formatUserWithTeams/);
  assert.match(projectPanel, /buildProjectAccessRows/);
});

test("invitations panel excludes owner and platform invite only", () => {
  const invitationsPanel = read("src/components/access-management/InvitationsPanel.tsx");
  assert.match(invitationsPanel, /ASSIGNABLE_TEAM_ROLES/);
  assert.match(invitationsPanel, /NEUD Admins can manage all teams/);
  assert.doesNotMatch(invitationsPanel, /Platform invite only/);
  assert.doesNotMatch(invitationsPanel, /value="owner"/);
});

test("desktop and portal clients pass currentUserId into shared tabs", () => {
  const desktopClient = read("src/components/access-management/DesktopCloudAccessManagementClient.tsx");
  const portalClient = read("src/components/access-management/CloudAccessManagementClient.tsx");
  const tabs = read("src/components/access-management/AccessManagementTabs.tsx");
  assert.match(desktopClient, /currentUserId/);
  assert.doesNotMatch(desktopClient, /isPlatformOwner/);
  assert.match(portalClient, /currentUserId/);
  assert.match(tabs, /resolveAccessCapabilities/);
});

test("diagnose script and npm command exist", () => {
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:access-role-model/);
  assert.ok(exists("scripts/live-validation/diagnose-access-role-model.mjs"));
});

test("apply migrations includes 045, 046, and 047", () => {
  const applyScript = read("scripts/live-validation/apply-migrations.mjs");
  assert.match(applyScript, /045_access_role_model\.sql/);
  assert.match(applyScript, /046_team_assigned_project_access\.sql/);
  assert.match(applyScript, /047_centralize_project_access_management\.sql/);
});

test("error codes include owner protection codes", () => {
  const errors = read("src/lib/access-management/errors.ts");
  const types = read("src/lib/access-management/types.ts");
  for (const code of [
    "owner_role_not_assignable",
    "sole_owner_protected",
    "owner_team_protected",
    "invalid_team_role",
    "insufficient_access",
  ]) {
    assert.match(errors, new RegExp(code));
    assert.match(types, new RegExp(code));
  }
});

test("mutations omit team descriptions on create", () => {
  const mutations = read("src/lib/access-management/mutations-client.ts");
  assert.match(mutations, /p_description: null/);
});

test("portal users page no longer passes platform role flags", () => {
  const page = read("src/app/portal/users/page.tsx");
  assert.match(page, /currentUserId=\{profile\.id\}/);
  assert.doesNotMatch(page, /isPlatformOwner/);
  assert.doesNotMatch(page, /isPlatformAdmin/);
});
