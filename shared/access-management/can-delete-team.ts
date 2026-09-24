import { canDeleteUserInDirectory } from "./can-delete-user";
import { hasSiteWideDirectoryAccess, type UserDetailsDirectory } from "./can-view-user-details";
import { isProtectedNeudTeamId } from "./is-protected-neud-team";

function actorAdminTeamIds(
  actorUserId: string,
  directory: Pick<UserDetailsDirectory, "teamMemberships">,
): Set<string> {
  return new Set(
    directory.teamMemberships
      .filter(
        (membership) =>
          membership.userId === actorUserId && membership.role === "admin",
      )
      .map((membership) => membership.teamId),
  );
}

export function canDeleteTeamInDirectory(
  actorUserId: string,
  teamId: string,
  directory: UserDetailsDirectory,
): boolean {
  if (!actorUserId?.trim() || !teamId?.trim()) {
    return false;
  }
  if (!directory.teams.some((team) => team.id === teamId)) {
    return false;
  }
  if (isProtectedNeudTeamId(teamId, directory)) {
    return false;
  }
  if (hasSiteWideDirectoryAccess(actorUserId, directory)) {
    return true;
  }
  return actorAdminTeamIds(actorUserId, directory).has(teamId);
}

export function listTeamMemberUserIds(
  teamId: string,
  directory: Pick<UserDetailsDirectory, "teamMemberships">,
): string[] {
  return [
    ...new Set(
      directory.teamMemberships
        .filter((membership) => membership.teamId === teamId)
        .map((membership) => membership.userId),
    ),
  ];
}

export function validateTeamDeletionTargets(
  actorUserId: string,
  teamId: string,
  directory: UserDetailsDirectory,
):
  | { ok: true }
  | {
      ok: false;
      code:
        | "team_contains_protected_users"
        | "permission_denied"
        | "neud_team_protected";
    } {
  if (isProtectedNeudTeamId(teamId, directory)) {
    return { ok: false, code: "neud_team_protected" };
  }
  if (!canDeleteTeamInDirectory(actorUserId, teamId, directory)) {
    return { ok: false, code: "permission_denied" };
  }
  const memberIds = listTeamMemberUserIds(teamId, directory);
  for (const memberId of memberIds) {
    if (!canDeleteUserInDirectory(actorUserId, memberId, directory)) {
      return { ok: false, code: "team_contains_protected_users" };
    }
  }
  return { ok: true };
}
