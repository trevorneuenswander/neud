/** Synced from shared/access-management/can-view-user-details.ts — keep in sync manually or via repo tooling. */

export type UserDetailsDirectory = {
  users: Array<{
    id: string;
    email: string;
    platformRole?: string;
    team?: string;
    fullName?: string;
    accountStatus?: string;
  }>;
  teams: Array<{ id: string; name: string; slug: string }>;
  teamMemberships: Array<{ teamId: string; userId: string; role: string }>;
  projectMembers: Array<{ projectId: string; userId: string; role: string }>;
  projectTeams: Array<{ projectId: string; teamId: string }>;
  projects?: Array<{ id: string; name: string; slug: string }>;
};

const NEUD_TEAM_IDENTIFIERS = ["neud"] as const;
const DEFAULT_OWNER_EMAIL = "trevorneuenswander@gmail.com";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function findNeudTeam(directory: Pick<UserDetailsDirectory, "teams">) {
  return (
    directory.teams.find((team) => {
      const name = normalize(team.name);
      const slug = normalize(team.slug);
      return NEUD_TEAM_IDENTIFIERS.some(
        (identifier) => name === identifier || slug === identifier,
      );
    }) ?? null
  );
}

function isSoleOwnerProfile(user: {
  email: string;
  platformRole?: string;
}): boolean {
  return (
    normalize(user.email) === normalize(DEFAULT_OWNER_EMAIL) &&
    (user.platformRole ?? "").toLowerCase() === "owner"
  );
}

function isNeudTeamAdminUser(
  userId: string,
  directory: Pick<UserDetailsDirectory, "teams" | "teamMemberships">,
): boolean {
  const neudTeam = findNeudTeam(directory);
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

export function hasSiteWideDirectoryAccess(
  actorUserId: string,
  directory: Pick<UserDetailsDirectory, "users" | "teams" | "teamMemberships">,
): boolean {
  const actor = directory.users.find((entry) => entry.id === actorUserId);
  if (actor && isSoleOwnerProfile(actor)) {
    return true;
  }
  return isNeudTeamAdminUser(actorUserId, directory);
}

function actorManagedTeamIds(
  actorUserId: string,
  directory: Pick<UserDetailsDirectory, "teams" | "teamMemberships">,
  siteWide: boolean,
): Set<string> {
  if (siteWide) {
    return new Set(directory.teams.map((team) => team.id));
  }
  return new Set(
    directory.teamMemberships
      .filter(
        (membership) =>
          membership.userId === actorUserId && membership.role === "admin",
      )
      .map((membership) => membership.teamId),
  );
}

function targetSharesManagedTeam(
  targetUserId: string,
  managedTeamIds: Set<string>,
  directory: Pick<UserDetailsDirectory, "teamMemberships">,
): boolean {
  return directory.teamMemberships.some(
    (membership) =>
      membership.userId === targetUserId && managedTeamIds.has(membership.teamId),
  );
}

function actorManagedProjectIds(
  actorUserId: string,
  directory: UserDetailsDirectory,
  siteWide: boolean,
): Set<string> {
  if (siteWide) {
    return new Set(directory.projectMembers.map((entry) => entry.projectId));
  }

  const managedTeamIds = actorManagedTeamIds(actorUserId, directory, false);
  const projectIds = new Set<string>();

  for (const assignment of directory.projectTeams) {
    if (managedTeamIds.has(assignment.teamId)) {
      projectIds.add(assignment.projectId);
    }
  }

  for (const membership of directory.projectMembers) {
    if (membership.userId === actorUserId && membership.role === "manager") {
      projectIds.add(membership.projectId);
    }
  }

  return projectIds;
}

function targetVisibleViaManagedProjects(
  targetUserId: string,
  managedProjectIds: Set<string>,
  directory: Pick<UserDetailsDirectory, "projectMembers" | "projectTeams" | "teamMemberships">,
): boolean {
  for (const projectId of managedProjectIds) {
    const direct = directory.projectMembers.some(
      (entry) => entry.projectId === projectId && entry.userId === targetUserId,
    );
    if (direct) {
      return true;
    }

    const teamIds = directory.projectTeams
      .filter((entry) => entry.projectId === projectId)
      .map((entry) => entry.teamId);
    if (
      directory.teamMemberships.some(
        (membership) =>
          membership.userId === targetUserId && teamIds.includes(membership.teamId),
      )
    ) {
      return true;
    }
  }
  return false;
}

export function canViewUserDetailsInDirectory(
  actorUserId: string,
  targetUserId: string,
  directory: UserDetailsDirectory,
): boolean {
  if (!actorUserId?.trim() || !targetUserId?.trim()) {
    return false;
  }
  if (actorUserId === targetUserId) {
    return directory.users.some((entry) => entry.id === actorUserId);
  }

  const targetPresent = directory.users.some((entry) => entry.id === targetUserId);
  if (!targetPresent) {
    return false;
  }

  const siteWide = hasSiteWideDirectoryAccess(actorUserId, directory);
  if (siteWide) {
    return true;
  }

  const managedTeamIds = actorManagedTeamIds(actorUserId, directory, false);
  if (
    managedTeamIds.size > 0 &&
    targetSharesManagedTeam(targetUserId, managedTeamIds, directory)
  ) {
    return true;
  }

  const managedProjectIds = actorManagedProjectIds(actorUserId, directory, false);
  if (
    managedProjectIds.size > 0 &&
    targetVisibleViaManagedProjects(targetUserId, managedProjectIds, directory)
  ) {
    return true;
  }

  return false;
}
