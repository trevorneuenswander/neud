/** Mirror of shared/access-management/can-delete-user.ts */

import {
  canViewUserDetailsInDirectory,
  hasSiteWideDirectoryAccess,
} from "./can-view-user-details.mjs";

const DEFAULT_OWNER_EMAIL = "trevorneuenswander@gmail.com";

function normalize(value) {
  return value.trim().toLowerCase();
}

function isSoleOwnerProfile(user) {
  return (
    normalize(user.email) === normalize(DEFAULT_OWNER_EMAIL) &&
    (user.platformRole ?? "").toLowerCase() === "owner"
  );
}

function actorManagedTeamIds(actorUserId, directory) {
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

function countActiveOwners(directory) {
  return directory.users.filter(
    (user) => (user.platformRole ?? "").toLowerCase() === "owner",
  ).length;
}

export function canDeleteUserInDirectory(actorUserId, targetUserId, directory) {
  if (!actorUserId?.trim() || !targetUserId?.trim()) {
    return false;
  }
  if (actorUserId === targetUserId) {
    return false;
  }

  const target = directory.users.find((entry) => entry.id === targetUserId);
  const actor = directory.users.find((entry) => entry.id === actorUserId);
  if (!target || !actor) {
    return false;
  }

  if (isSoleOwnerProfile(target)) {
    return false;
  }

  const targetRole = (target.platformRole ?? "user").toLowerCase();
  const actorIsPlatformOwner = (actor.platformRole ?? "").toLowerCase() === "owner";

  if (actorIsPlatformOwner) {
    if (targetRole === "owner") {
      return countActiveOwners(directory) > 1;
    }
    return true;
  }

  if (!canViewUserDetailsInDirectory(actorUserId, targetUserId, directory)) {
    return false;
  }

  const siteWide = hasSiteWideDirectoryAccess(actorUserId, directory);

  if (targetRole === "owner") {
    if (!siteWide) {
      return false;
    }
    return countActiveOwners(directory) > 1;
  }

  if (targetRole === "admin") {
    return siteWide;
  }

  if (siteWide) {
    return true;
  }

  const managedTeamIds = actorManagedTeamIds(actorUserId, directory);
  if (
    managedTeamIds.size > 0 &&
    targetSharesManagedTeam(targetUserId, managedTeamIds, directory)
  ) {
    return true;
  }

  return false;
}
