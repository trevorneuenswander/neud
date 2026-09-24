#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  canViewUserDetailsInDirectory,
  hasSiteWideDirectoryAccess,
} from "../../scripts/live-validation/lib/can-view-user-details.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("Users table has no Details/Open column", () => {
  const panel = read("src/components/access-management/UsersPanel.tsx");
  assert.doesNotMatch(panel, />\s*Open\s*</);
  assert.doesNotMatch(panel, /USER_COLUMN_WIDTHS_WITH_DETAILS/);
  assert.match(panel, /USER_COLUMN_WIDTHS/);
  assert.doesNotMatch(panel, /"Details"/);
});

test("user name is a link with returnTo users tab", () => {
  const panel = read("src/components/access-management/UsersPanel.tsx");
  assert.match(panel, /getAccessManagementUserDetailsHref/);
  assert.match(panel, /returnTab: "users"/);
  assert.match(panel, /<Link/);
  assert.match(panel, /aria-label=\{`View \$\{displayName\} user details`\}/);
});

test("desktop and portal details routes use shared authorization", () => {
  const portal = read("src/app/portal/users/[userId]/page.tsx");
  const authz = read("desktop/src/services/access-authorization-service.ts");
  assert.match(portal, /canViewUserDetails/);
  assert.match(authz, /canViewUserDetailsInDirectory/);
});

test("owner site-wide can view any directory user", () => {
  const ownerId = "owner-uuid";
  const invitedId = "invited-uuid";
  const directory = {
    users: [
      {
        id: ownerId,
        email: "trevorneuenswander@gmail.com",
        platformRole: "owner",
        fullName: "Trevor Neuenswander",
      },
      {
        id: invitedId,
        email: "new@example.com",
        platformRole: "user",
        fullName: "New invited user",
      },
    ],
    teams: [{ id: "team-1", name: "Hildreth Media Group", slug: "hmg" }],
    teamMemberships: [
      { teamId: "team-1", userId: invitedId, role: "member" },
    ],
    projectMembers: [],
    projectTeams: [],
  };
  assert.equal(hasSiteWideDirectoryAccess(ownerId, directory), true);
  assert.equal(canViewUserDetailsInDirectory(ownerId, invitedId, directory), true);
});

test("team admin cannot view unrelated out-of-scope user", () => {
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
  assert.equal(canViewUserDetailsInDirectory(adminId, otherId, directory), false);
});

test("team admin can view in-scope team member", () => {
  const adminId = "admin-uuid";
  const memberId = "member-uuid";
  const directory = {
    users: [
      { id: adminId, email: "admin@example.com", platformRole: "user" },
      { id: memberId, email: "member@example.com", platformRole: "user" },
    ],
    teams: [{ id: "team-a", name: "Team A", slug: "team-a" }],
    teamMemberships: [
      { teamId: "team-a", userId: adminId, role: "admin" },
      { teamId: "team-a", userId: memberId, role: "member" },
    ],
    projectMembers: [],
    projectTeams: [],
  };
  assert.equal(canViewUserDetailsInDirectory(adminId, memberId, directory), true);
});

test("cloud-only user details path uses cached directory", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  const access = read("desktop/src/services/access-management-service.ts");
  assert.match(localData, /readCloudDirectoryForAuthorization/);
  assert.match(access, /buildUserDetailsFromCloudDirectory/);
});

test("local dev ignores production trusted portal origin when fallback enabled", () => {
  const resolver = read("desktop/src/services/trusted-portal-origin.ts");
  assert.match(resolver, /classifyTrustedPortalOriginCategory\(origin\) === "production"/);
  assert.match(resolver, /allowLocalDevFallback/);
});
