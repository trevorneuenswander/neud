/** Mirror of shared/access-management/can-view-user-details.ts */

const NEUD_TEAM_IDENTIFIERS = ["neud"];
const DEFAULT_OWNER_EMAIL = "trevorneuenswander@gmail.com";

function normalize(value) {
  return value.trim().toLowerCase();
}

function findNeudTeam(directory) {
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

function isSoleOwnerProfile(user) {
  return (
    normalize(user.email) === normalize(DEFAULT_OWNER_EMAIL) &&
    (user.platformRole ?? "").toLowerCase() === "owner"
  );
}

function isNeudTeamAdminUser(userId, directory) {
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

export function hasSiteWideDirectoryAccess(actorUserId, directory) {
  const actor = directory.users.find((entry) => entry.id === actorUserId);
  if (actor && isSoleOwnerProfile(actor)) {
    return true;
  }
  return isNeudTeamAdminUser(actorUserId, directory);
}

function actorManagedTeamIds(actorUserId, directory, siteWide) {
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

function targetSharesManagedTeam(targetUserId, managedTeamIds, directory) {
  return directory.teamMemberships.some(
    (membership) =>
      membership.userId === targetUserId && managedTeamIds.has(membership.teamId),
  );
}

export function canViewUserDetailsInDirectory(actorUserId, targetUserId, directory) {
  if (!actorUserId?.trim() || !targetUserId?.trim()) {
    return false;
  }
  if (actorUserId === targetUserId) {
    return directory.users.some((entry) => entry.id === actorUserId);
  }
  if (!directory.users.some((entry) => entry.id === targetUserId)) {
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
  return false;
}
