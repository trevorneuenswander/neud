#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { canDeleteUserInDirectory } from "../../scripts/live-validation/lib/can-delete-user.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("trusted user delete route uses bearer auth and does not expose service role to desktop", () => {
  const route = read("src/app/api/access/users/[userId]/delete/route.ts");
  const client = read("desktop/src/services/desktop-trusted-access-api-client.ts");
  assert.match(route, /resolveTrustedAccessCallerWithAuthDiagnostics/);
  assert.match(route, /deletePlatformUserWithTrustedAuth/);
  assert.doesNotMatch(client, /SERVICE_ROLE|service_role|createAdminClient/);
  assert.match(client, /deleteUser\(userId/);
  assert.match(client, /buildAccessUserDeleteRoute/);
});

test("delete sequence records activity before auth admin delete", () => {
  const helper = read("src/lib/access-management/delete-platform-user.ts");
  const activityIndex = helper.indexOf('event_type: "user.deleted"');
  const authDeleteIndex = helper.indexOf("auth.admin.deleteUser");
  assert.ok(activityIndex >= 0 && authDeleteIndex > activityIndex);
  assert.match(helper, /team_memberships/);
  assert.match(helper, /is_sole_owner_user/);
});

test("delete user lives in Users table Actions column, not user details page", () => {
  const panel = read("src/components/access-management/UsersPanel.tsx");
  const deleteButton = read("src/components/access-management/AccessUserDeleteButton.tsx");
  const detailsView = read("src/components/users/UserDetailsView.tsx");
  assert.match(panel, /"Actions"/);
  assert.match(panel, /AccessUserDeleteButton/);
  assert.doesNotMatch(detailsView, /UserDeleteSection/);
  assert.doesNotMatch(detailsView, /Delete User/);
  assert.doesNotMatch(detailsView, /AccessUserDeleteButton/);
  assert.match(deleteButton, /ConfirmDialog/);
  assert.match(deleteButton, /Delete User/);
  assert.match(deleteButton, /historical activity records will remain/i);
  assert.match(deleteButton, /canDeleteUserInDirectory/);
  assert.match(deleteButton, /if \(!canDelete\)/);
});

test("owner can delete regular in-scope user", () => {
  const ownerId = "owner-uuid";
  const memberId = "member-uuid";
  const directory = {
    users: [
      { id: ownerId, email: "owner@example.com", platformRole: "owner" },
      { id: memberId, email: "member@example.com", platformRole: "user" },
    ],
    teams: [{ id: "team-1", name: "HMG", slug: "hmg" }],
    teamMemberships: [{ teamId: "team-1", userId: memberId, role: "member" }],
    projectMembers: [],
    projectTeams: [],
  };
  assert.equal(canDeleteUserInDirectory(ownerId, memberId, directory), true);
});

test("owner cannot delete self", () => {
  const ownerId = "owner-uuid";
  const directory = {
    users: [{ id: ownerId, email: "owner@example.com", platformRole: "owner" }],
    teams: [],
    teamMemberships: [],
    projectMembers: [],
    projectTeams: [],
  };
  assert.equal(canDeleteUserInDirectory(ownerId, ownerId, directory), false);
});

test("team admin can delete in-scope member but not owner", () => {
  const adminId = "admin-uuid";
  const memberId = "member-uuid";
  const ownerId = "owner-uuid";
  const directory = {
    users: [
      { id: adminId, email: "admin@example.com", platformRole: "user" },
      { id: memberId, email: "member@example.com", platformRole: "user" },
      { id: ownerId, email: "trevorneuenswander@gmail.com", platformRole: "owner" },
    ],
    teams: [{ id: "team-a", name: "Team A", slug: "team-a" }],
    teamMemberships: [
      { teamId: "team-a", userId: adminId, role: "admin" },
      { teamId: "team-a", userId: memberId, role: "member" },
    ],
    projectMembers: [],
    projectTeams: [],
  };
  assert.equal(canDeleteUserInDirectory(adminId, memberId, directory), true);
  assert.equal(canDeleteUserInDirectory(adminId, ownerId, directory), false);
});

test("team admin cannot delete out-of-scope user", () => {
  const adminId = "admin-uuid";
  const otherId = "other-uuid";
  const directory = {
    users: [
      { id: adminId, email: "admin@example.com", platformRole: "user" },
      { id: otherId, email: "other@example.com", platformRole: "user" },
    ],
    teams: [
      { id: "team-a", name: "Team A", slug: "team-a" },
      { id: "team-b", name: "Team B", slug: "team-b" },
    ],
    teamMemberships: [
      { teamId: "team-a", userId: adminId, role: "admin" },
      { teamId: "team-b", userId: otherId, role: "member" },
    ],
    projectMembers: [],
    projectTeams: [],
  };
  assert.equal(canDeleteUserInDirectory(adminId, otherId, directory), false);
});

test("project manager alone cannot delete user visible only via managed project", () => {
  const managerId = "manager-uuid";
  const viewerId = "viewer-uuid";
  const directory = {
    users: [
      { id: managerId, email: "manager@example.com", platformRole: "user" },
      { id: viewerId, email: "viewer@example.com", platformRole: "user" },
    ],
    teams: [],
    teamMemberships: [],
    projectMembers: [
      { projectId: "project-1", userId: managerId, role: "manager" },
      { projectId: "project-1", userId: viewerId, role: "viewer" },
    ],
    projectTeams: [],
  };
  assert.equal(canDeleteUserInDirectory(managerId, viewerId, directory), false);
});

test("local delete refreshes cloud directory cache and purges local rows", () => {
  const data = read("desktop/src/services/local-data-service.ts");
  const access = read("desktop/src/services/access-management-service.ts");
  assert.match(data, /deletePlatformUser/);
  assert.match(data, /getCloudAccessDirectory\(\{ forceRefresh: true \}\)/);
  assert.match(access, /teamMemberships\.removeAllForUser/);
  assert.match(access, /users\.deleteById/);
});
