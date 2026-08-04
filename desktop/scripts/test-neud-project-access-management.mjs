#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OWNER_EMAIL = "trevorneuenswander@gmail.com";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function createDirectory(overrides = {}) {
  return {
    ok: true,
    teams: [],
    teamMemberships: [],
    users: [],
    projects: [],
    projectMembers: [],
    projectTeams: [],
    invitations: [],
    ...overrides,
  };
}

function isTeamAdminMembership(role) {
  return role === "admin" || role === "owner";
}

function isSoleOwnerProfile(user) {
  return (
    user.email.trim().toLowerCase() === OWNER_EMAIL &&
    (user.platformRole ?? "").toLowerCase() === "owner"
  );
}

function isNeudTeam(team) {
  return team.name.toLowerCase() === "neud" || team.slug?.toLowerCase() === "neud";
}

function isNeudTeamAdminUser(userId, directory) {
  const neudTeam = directory.teams.find(isNeudTeam);
  if (!neudTeam) {
    return false;
  }
  return directory.teamMemberships.some(
    (membership) =>
      membership.userId === userId &&
      membership.teamId === neudTeam.id &&
      membership.role === "admin",
  );
}

function hasSiteWideAccess(userId, directory) {
  const user = directory.users.find((entry) => entry.id === userId);
  return Boolean(user && (isSoleOwnerProfile(user) || isNeudTeamAdminUser(userId, directory)));
}

function hasTeamAssignedManagerAccess(userId, projectId, directory) {
  const assignedTeamIds = new Set(
    directory.projectTeams
      .filter((assignment) => assignment.projectId === projectId)
      .map((assignment) => assignment.teamId),
  );

  return directory.teamMemberships.some(
    (membership) =>
      membership.userId === userId &&
      assignedTeamIds.has(membership.teamId) &&
      isTeamAdminMembership(membership.role),
  );
}

function canManageProjectAccess(currentUserId, projectId, directory) {
  if (hasSiteWideAccess(currentUserId, directory)) {
    return true;
  }
  if (hasTeamAssignedManagerAccess(currentUserId, projectId, directory)) {
    return true;
  }
  const membership = directory.projectMembers.find(
    (entry) => entry.projectId === projectId && entry.userId === currentUserId,
  );
  return membership?.role === "manager";
}

function buildProjectAccessRows(projectId, directory) {
  const userIds = new Set();
  for (const member of directory.projectMembers.filter(
    (entry) => entry.projectId === projectId,
  )) {
    userIds.add(member.userId);
  }
  for (const assignment of directory.projectTeams.filter(
    (entry) => entry.projectId === projectId,
  )) {
    for (const membership of directory.teamMemberships.filter(
      (entry) => entry.teamId === assignment.teamId && isTeamAdminMembership(entry.role),
    )) {
      userIds.add(membership.userId);
    }
  }
  for (const user of directory.users) {
    if (isSoleOwnerProfile(user) || isNeudTeamAdminUser(user.id, directory)) {
      userIds.add(user.id);
    }
  }

  return [...userIds].map((userId) => {
    const hasDirectMembership = directory.projectMembers.some(
      (entry) => entry.projectId === projectId && entry.userId === userId,
    );
    return { userId, isMutable: hasDirectMembership };
  });
}

const projectId = "project-1";
const otherProjectId = "project-2";
const hmgTeamId = "team-hmg";
const neudTeamId = "team-neud";
const hmgAdminId = "user-hmg-admin";
const hmgMemberId = "user-hmg-member";
const directManagerId = "user-direct-manager";
const operatorId = "user-operator";
const viewerId = "user-viewer";
const ownerUserId = "user-owner";
const neudAdminUserId = "user-neud-admin";

const baseDirectory = createDirectory({
  teams: [
    { id: hmgTeamId, name: "Hildreth Media Group", slug: "hmg", description: null, isActive: true, memberCount: 2 },
    { id: neudTeamId, name: "NEUD", slug: "neud", description: null, isActive: true, memberCount: 2 },
  ],
  users: [
    { id: hmgAdminId, fullName: "HMG Admin", email: "trevor@hildrethmedia.com", platformRole: "admin", team: "", accountStatus: "active" },
    { id: hmgMemberId, fullName: "HMG Member", email: "member@example.com", platformRole: "user", team: "", accountStatus: "active" },
    { id: directManagerId, fullName: "Direct Manager", email: "manager@example.com", platformRole: "user", team: "", accountStatus: "active" },
    { id: operatorId, fullName: "Operator", email: "operator@example.com", platformRole: "user", team: "", accountStatus: "active" },
    { id: viewerId, fullName: "Viewer", email: "viewer@example.com", platformRole: "user", team: "", accountStatus: "active" },
    { id: ownerUserId, fullName: "Trevor Owner", email: OWNER_EMAIL, platformRole: "owner", team: "", accountStatus: "active" },
    { id: neudAdminUserId, fullName: "NEUD Admin", email: "neud-admin@example.com", platformRole: "user", team: "", accountStatus: "active" },
  ],
  projects: [
    { id: projectId, name: "Broad Arrow Auctions", slug: "broad-arrow-auctions" },
    { id: otherProjectId, name: "Other Project", slug: "other-project" },
  ],
  teamMemberships: [
    { teamId: hmgTeamId, userId: hmgAdminId, role: "admin", userName: "HMG Admin", userEmail: "trevor@hildrethmedia.com" },
    { teamId: hmgTeamId, userId: hmgMemberId, role: "member", userName: "HMG Member", userEmail: "member@example.com" },
    { teamId: neudTeamId, userId: neudAdminUserId, role: "admin", userName: "NEUD Admin", userEmail: "neud-admin@example.com" },
  ],
  projectTeams: [{ projectId, teamId: hmgTeamId }],
  projectMembers: [
    { projectId, userId: directManagerId, role: "manager" },
    { projectId, userId: operatorId, role: "operator" },
    { projectId, userId: viewerId, role: "viewer" },
  ],
});

test("migration 047 centralizes can_manage_project_access for member and team RPCs", () => {
  const migration = read("supabase/migrations/047_centralize_project_access_management.sql");
  assert.match(migration, /create or replace function public\.can_manage_project_access/);
  assert.match(migration, /has_site_wide_access\(\)/);
  assert.match(migration, /is_project_manager\(p_project_id\)/);
  assert.match(migration, /assign_project_team/);
  assert.match(migration, /remove_project_team/);
  assert.match(migration, /upsert_project_member/);
  assert.match(migration, /remove_project_member/);
  assert.doesNotMatch(migration, /can_operate_project/);
});

test("shared role model excludes operators from canManageProjectAccess", () => {
  const roleModel = read("src/lib/access-management/role-model.ts");
  assert.match(roleModel, /hasEffectiveProjectManagerAccess/);
  assert.match(roleModel, /membership\?\.role === "manager"/);
  assert.doesNotMatch(roleModel, /membership\?\.role === "operator"/);
});

test("1 team admin can manage direct users for assigned project", () => {
  assert.equal(canManageProjectAccess(hmgAdminId, projectId, baseDirectory), true);
});

test("2 team admin cannot manage users for unrelated project", () => {
  assert.equal(canManageProjectAccess(hmgAdminId, otherProjectId, baseDirectory), false);
});

test("3 direct project manager can add users", () => {
  assert.equal(canManageProjectAccess(directManagerId, projectId, baseDirectory), true);
});

test("4 direct project manager can remove users", () => {
  assert.equal(canManageProjectAccess(directManagerId, projectId, baseDirectory), true);
});

test("5 direct project manager can change roles", () => {
  assert.equal(canManageProjectAccess(directManagerId, projectId, baseDirectory), true);
});

test("6 operator cannot manage users", () => {
  assert.equal(canManageProjectAccess(operatorId, projectId, baseDirectory), false);
});

test("7 viewer cannot manage users", () => {
  assert.equal(canManageProjectAccess(viewerId, projectId, baseDirectory), false);
});

test("8 removing team assignment removes team admin management capability", () => {
  const withoutAssignment = createDirectory({
    ...baseDirectory,
    projectTeams: [],
  });
  assert.equal(canManageProjectAccess(hmgAdminId, projectId, withoutAssignment), false);
});

test("9 demoting team admin removes inherited management capability", () => {
  const demoted = createDirectory({
    ...baseDirectory,
    teamMemberships: baseDirectory.teamMemberships.map((membership) =>
      membership.userId === hmgAdminId ? { ...membership, role: "member" } : membership,
    ),
  });
  assert.equal(canManageProjectAccess(hmgAdminId, projectId, demoted), false);
});

test("10 owner and NEUD admin retain global access-management capability", () => {
  assert.equal(canManageProjectAccess(ownerUserId, projectId, baseDirectory), true);
  assert.equal(canManageProjectAccess(neudAdminUserId, otherProjectId, baseDirectory), true);
});

test("11 no redundant direct membership rows are created for team admins", () => {
  const migration046 = read("supabase/migrations/046_team_assigned_project_access.sql");
  assert.doesNotMatch(migration046, /insert into public\.project_members/);
  assert.equal(
    baseDirectory.projectMembers.some(
      (member) => member.projectId === projectId && member.userId === hmgAdminId,
    ),
    false,
  );
});

test("12 inherited access rows are marked non-removable", () => {
  const rows = buildProjectAccessRows(projectId, baseDirectory);
  const teamAdminRow = rows.find((row) => row.userId === hmgAdminId);
  assert.ok(teamAdminRow);
  assert.equal(teamAdminRow.isMutable, false);
  const directRow = rows.find((row) => row.userId === operatorId);
  assert.ok(directRow);
  assert.equal(directRow.isMutable, true);
});

test("13 users Open button uses shared secondary button variant", () => {
  const usersPanel = read("src/components/access-management/UsersPanel.tsx");
  assert.match(usersPanel, /<Button/);
  assert.match(usersPanel, /variant="secondary"/);
  assert.match(usersPanel, /size="sm"/);
  assert.doesNotMatch(usersPanel, /hover:underline/);
});

test("14 desktop Open navigates with tab=users return target", () => {
  const routes = read("src/lib/access-management/routes.ts");
  const usersPanel = read("src/components/access-management/UsersPanel.tsx");
  assert.match(routes, /getAccessManagementUserDetailsHref/);
  assert.match(routes, /returnTab/);
  assert.match(usersPanel, /getAccessManagementUserDetailsHref/);
  assert.match(usersPanel, /returnTab: "users"/);
});

test("15 portal Open navigates with tab=users return target", () => {
  const routes = read("src/lib/access-management/routes.ts");
  const hostedRoutes = read("src/lib/routing/hosted-routes.ts");
  const portalPage = read("src/app/portal/users/[userId]/page.tsx");
  assert.match(routes, /HOSTED_PORTAL_PATHS\.users/);
  assert.match(hostedRoutes, /users: `\$\{HOSTED_PORTAL_PREFIX\}\/users`/);
  assert.match(portalPage, /resolveSafeUsersReturnHref/);
});

test("16 back to Users returns to Users tab", () => {
  const routes = read("src/lib/access-management/routes.ts");
  const userDetails = read("src/components/users/UserDetailsView.tsx");
  assert.match(routes, /resolveSafeUsersReturnHref/);
  assert.match(routes, /getAccessManagementHref\(surface, "users"\)/);
  assert.match(userDetails, /backHref/);
  assert.match(userDetails, /Back to Users/);
});

test("17 unsafe return URLs are rejected", () => {
  const routesSource = read("src/lib/access-management/routes.ts");
  assert.match(routesSource, /isSafeRelativePath/);
  assert.match(routesSource, /includes\(":\/\/"\)/);

  function resolveSafeUsersReturnHref(returnTo, surface) {
    const fallback =
      surface === "portal" ? "/portal/users?tab=users" : "/users?tab=users";
    if (!returnTo?.trim()) {
      return fallback;
    }
    const trimmed = returnTo.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
      return fallback;
    }
    const path = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
    const allowedRoots = ["/users", "/portal/users"];
    if (!allowedRoots.some((rootPath) => path === rootPath || path.startsWith(`${rootPath}/`))) {
      return fallback;
    }
    return trimmed.includes("tab=users") ? trimmed : fallback;
  }

  assert.equal(resolveSafeUsersReturnHref("https://evil.example", "desktop"), "/users?tab=users");
  assert.equal(resolveSafeUsersReturnHref("/dashboard", "portal"), "/portal/users?tab=users");
  assert.equal(resolveSafeUsersReturnHref(undefined, "desktop"), "/users?tab=users");
});

test("18 direct profile navigation defaults back to Users tab", () => {
  const page = read("src/app/(portal)/users/[userId]/page.tsx");
  const portalPage = read("src/app/portal/users/[userId]/page.tsx");
  assert.match(page, /resolveSafeUsersReturnHref/);
  assert.match(portalPage, /resolveSafeUsersReturnHref/);
});

test("19 desktop and portal behavior match through shared route helpers", () => {
  const routes = read("src/lib/access-management/routes.ts");
  assert.match(routes, /getAccessManagementUsersPath/);
  assert.match(routes, /resolveAccessManagementSurface/);
  assert.match(routes, /DESKTOP_USERS_PATH/);
  assert.match(routes, /PORTAL_USERS_PATH/);
});

test("20 access management tabs sync tab query param", () => {
  const tabs = read("src/lib/access-management/use-access-management-tab-state.ts");
  assert.match(tabs, /parseAccessManagementTab/);
  assert.match(tabs, /params\.set\("tab", tab\)/);
});
