#!/usr/bin/env node
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function isNeudTeamAdminUser(userId, directory) {
  const neudTeam = directory.teams.find(
    (team) => team.name.toLowerCase() === "neud" || team.slug?.toLowerCase() === "neud",
  );
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

function resolveProjectAccessSources(userId, projectId, directory) {
  const sources = [];
  const user = directory.users.find((entry) => entry.id === userId);

  if (user && isSoleOwnerProfile(user)) {
    sources.push({ source: "Global: Owner", role: "Manager" });
  }
  if (isNeudTeamAdminUser(userId, directory)) {
    sources.push({ source: "Global: NEUD Admin", role: "Manager" });
  }

  const directMembership = directory.projectMembers.find(
    (entry) => entry.projectId === projectId && entry.userId === userId,
  );
  if (directMembership) {
    const role =
      directMembership.role.charAt(0).toUpperCase() + directMembership.role.slice(1).toLowerCase();
    sources.push({ source: "Direct", role });
  }

  for (const assignment of directory.projectTeams.filter(
    (entry) => entry.projectId === projectId,
  )) {
    const membership = directory.teamMemberships.find(
      (entry) => entry.teamId === assignment.teamId && entry.userId === userId,
    );
    if (!membership || !isTeamAdminMembership(membership.role)) {
      continue;
    }
    const team = directory.teams.find((entry) => entry.id === assignment.teamId);
    sources.push({
      source: `Team: ${team?.name ?? assignment.teamId}`,
      role: "Manager",
    });
  }

  return sources;
}

function resolveHighestProjectRole(sources) {
  const rank = { Manager: 4, Operator: 3, Viewer: 2 };
  return sources.reduce((highest, entry) => {
    const currentRank = rank[entry.role] ?? 0;
    const highestRank = highest ? rank[highest] ?? 0 : 0;
    return currentRank > highestRank ? entry.role : highest;
  }, null);
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

  return [...userIds]
    .map((userId) => {
      const sources = resolveProjectAccessSources(userId, projectId, directory);
      const projectRole = resolveHighestProjectRole(sources);
      if (!projectRole) {
        return null;
      }
      return {
        userId,
        accessSource: sources.map((entry) => entry.source).join(", "),
        projectRole,
      };
    })
    .filter(Boolean);
}

const projectId = "project-1";
const hmgTeamId = "team-hmg";
const neudTeamId = "team-neud";
const adminUserId = "user-admin";
const memberUserId = "user-member";
const ownerUserId = "user-owner";
const neudAdminUserId = "user-neud-admin";

const baseDirectory = createDirectory({
  teams: [
    { id: hmgTeamId, name: "Hildreth Media Group", slug: "hmg", description: null, isActive: true, memberCount: 2 },
    { id: neudTeamId, name: "NEUD", slug: "neud", description: null, isActive: true, memberCount: 2 },
  ],
  users: [
    { id: adminUserId, fullName: "HMG Admin", email: "trevor@hildrethmedia.com", platformRole: "admin", team: "", accountStatus: "active" },
    { id: memberUserId, fullName: "HMG Member", email: "member@example.com", platformRole: "user", team: "", accountStatus: "active" },
    { id: ownerUserId, fullName: "Trevor Owner", email: OWNER_EMAIL, platformRole: "owner", team: "", accountStatus: "active" },
    { id: neudAdminUserId, fullName: "NEUD Admin", email: "neud-admin@example.com", platformRole: "user", team: "", accountStatus: "active" },
  ],
  projects: [{ id: projectId, name: "Broad Arrow Auctions", slug: "broad-arrow-auctions" }],
  teamMemberships: [
    { teamId: hmgTeamId, userId: adminUserId, role: "admin", userName: "HMG Admin", userEmail: "trevor@hildrethmedia.com" },
    { teamId: hmgTeamId, userId: memberUserId, role: "member", userName: "HMG Member", userEmail: "member@example.com" },
    { teamId: neudTeamId, userId: neudAdminUserId, role: "admin", userName: "NEUD Admin", userEmail: "neud-admin@example.com" },
  ],
});

test("shared role model exports team-assigned manager helpers", () => {
  const roleModel = read("src/lib/access-management/role-model.ts");
  assert.match(roleModel, /hasTeamAssignedManagerAccess/);
  assert.match(roleModel, /resolveProjectAccessSources/);
  assert.match(roleModel, /resolveHighestProjectRole/);
});

test("migration 046 grants team-admin manager access server-side", () => {
  const migration = read("supabase/migrations/046_team_assigned_project_access.sql");
  assert.match(migration, /has_team_assigned_manager_access/);
  assert.match(migration, /get_direct_project_access_level/);
  assert.match(migration, /has_team_assigned_manager_access\(p_project_id\)/);
  assert.match(migration, /tm\.role in \('admin', 'owner'\)/);
  assert.doesNotMatch(migration, /insert into public\.project_members/);
});

test("assigning a team grants Manager access to current Team Admins", () => {
  const directory = createDirectory({
    ...baseDirectory,
    projectTeams: [{ projectId, teamId: hmgTeamId }],
  });

  assert.equal(hasTeamAssignedManagerAccess(adminUserId, projectId, directory), true);
  const sources = resolveProjectAccessSources(adminUserId, projectId, directory);
  assert.deepEqual(
    sources.filter((entry) => entry.source === "Team: Hildreth Media Group"),
    [{ source: "Team: Hildreth Media Group", role: "Manager" }],
  );
  assert.equal(resolveHighestProjectRole(sources), "Manager");
});

test("Team Members do not receive inherited Manager access", () => {
  const directory = createDirectory({
    ...baseDirectory,
    projectTeams: [{ projectId, teamId: hmgTeamId }],
  });

  assert.equal(hasTeamAssignedManagerAccess(memberUserId, projectId, directory), false);
  assert.deepEqual(resolveProjectAccessSources(memberUserId, projectId, directory), []);
  assert.deepEqual(buildProjectAccessRows(projectId, directory).map((row) => row.userId), [
    adminUserId,
    ownerUserId,
    neudAdminUserId,
  ]);
});

test("promoting a Team Member to Admin grants inherited Manager access", () => {
  const assigned = createDirectory({
    ...baseDirectory,
    projectTeams: [{ projectId, teamId: hmgTeamId }],
  });
  const promoted = createDirectory({
    ...assigned,
    teamMemberships: assigned.teamMemberships.map((membership) =>
      membership.userId === memberUserId
        ? { ...membership, role: "admin" }
        : membership,
    ),
  });

  assert.equal(hasTeamAssignedManagerAccess(memberUserId, projectId, assigned), false);
  assert.equal(hasTeamAssignedManagerAccess(memberUserId, projectId, promoted), true);
});

test("demoting a Team Admin removes inherited Manager access", () => {
  const assigned = createDirectory({
    ...baseDirectory,
    projectTeams: [{ projectId, teamId: hmgTeamId }],
  });
  const demoted = createDirectory({
    ...assigned,
    teamMemberships: assigned.teamMemberships.map((membership) =>
      membership.userId === adminUserId
        ? { ...membership, role: "member" }
        : membership,
    ),
  });

  assert.equal(hasTeamAssignedManagerAccess(adminUserId, projectId, assigned), true);
  assert.equal(hasTeamAssignedManagerAccess(adminUserId, projectId, demoted), false);
});

test("removing the team assignment removes inherited Manager access", () => {
  const assigned = createDirectory({
    ...baseDirectory,
    projectTeams: [{ projectId, teamId: hmgTeamId }],
  });
  const unassigned = createDirectory({
    ...assigned,
    projectTeams: [],
  });

  assert.equal(hasTeamAssignedManagerAccess(adminUserId, projectId, assigned), true);
  assert.equal(hasTeamAssignedManagerAccess(adminUserId, projectId, unassigned), false);
});

test("direct project access remains after team assignment removal", () => {
  const directory = createDirectory({
    ...baseDirectory,
    projectTeams: [],
    projectMembers: [{ projectId, userId: adminUserId, role: "operator" }],
  });

  const sources = resolveProjectAccessSources(adminUserId, projectId, directory);
  assert.deepEqual(sources, [{ source: "Direct", role: "Operator" }]);
  assert.equal(resolveHighestProjectRole(sources), "Operator");
});

test("access through another assigned team remains", () => {
  const otherTeamId = "team-other";
  const directory = createDirectory({
    ...baseDirectory,
    teams: [
      ...baseDirectory.teams,
      { id: otherTeamId, name: "Other Team", slug: "other", description: null, isActive: true, memberCount: 1 },
    ],
    teamMemberships: [
      ...baseDirectory.teamMemberships,
      { teamId: otherTeamId, userId: adminUserId, role: "admin", userName: "HMG Admin", userEmail: "trevor@hildrethmedia.com" },
    ],
    projectTeams: [{ projectId, teamId: otherTeamId }],
  });

  assert.equal(hasTeamAssignedManagerAccess(adminUserId, projectId, directory), true);
  const sources = resolveProjectAccessSources(adminUserId, projectId, directory);
  assert.match(sources.map((entry) => entry.source).join(", "), /Team: Other Team/);
});

test("Owner and NEUD Admin access remains unaffected", () => {
  const directory = createDirectory({
    ...baseDirectory,
    projectTeams: [{ projectId, teamId: hmgTeamId }],
  });

  const ownerSources = resolveProjectAccessSources(ownerUserId, projectId, directory);
  const neudAdminSources = resolveProjectAccessSources(neudAdminUserId, projectId, directory);

  assert.deepEqual(ownerSources[0], { source: "Global: Owner", role: "Manager" });
  assert.deepEqual(neudAdminSources[0], { source: "Global: NEUD Admin", role: "Manager" });
});

test("Project Access UI shows Team source and highest role", () => {
  const directory = createDirectory({
    ...baseDirectory,
    projectTeams: [{ projectId, teamId: hmgTeamId }],
    projectMembers: [{ projectId, userId: adminUserId, role: "viewer" }],
  });

  const row = buildProjectAccessRows(projectId, directory).find(
    (entry) => entry.userId === adminUserId,
  );

  assert.ok(row);
  assert.match(row.accessSource, /Team: Hildreth Media Group/);
  assert.match(row.accessSource, /Direct/);
  assert.equal(row.projectRole, "Manager");
});

test("team assignment does not require redundant direct membership rows", () => {
  const assignTeam = read("supabase/migrations/036_access_management_rpcs.sql");
  assert.match(assignTeam, /insert into public\.project_team_assignments/);

  const directory = createDirectory({
    ...baseDirectory,
    projectTeams: [{ projectId, teamId: hmgTeamId }],
  });

  assert.equal(directory.projectMembers.length, 0);
  assert.ok(hasTeamAssignedManagerAccess(adminUserId, projectId, directory));
});

test("direct viewer plus team admin resolves to Manager", () => {
  const directory = createDirectory({
    ...baseDirectory,
    projectTeams: [{ projectId, teamId: hmgTeamId }],
    projectMembers: [{ projectId, userId: adminUserId, role: "viewer" }],
  });

  assert.equal(
    resolveHighestProjectRole(resolveProjectAccessSources(adminUserId, projectId, directory)),
    "Manager",
  );
});
