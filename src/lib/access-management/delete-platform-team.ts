import { randomUUID } from "crypto";
import type { AccessManagementDirectory } from "@/lib/access-management/types";
import {
  listTeamMemberUserIds,
  validateTeamDeletionTargets,
} from "../../../shared/access-management/can-delete-team";
import { isProtectedNeudTeam } from "../../../shared/access-management/is-protected-neud-team";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deletePlatformUserWithTrustedAuth,
  loadDirectoryForTrustedDelete,
  type DeletePlatformUserResult,
} from "@/lib/access-management/delete-platform-user";

export type DeletePlatformTeamResult =
  | { ok: true; deletedUserCount: number }
  | {
      ok: false;
      code:
        | "permission_denied"
        | "team_contains_protected_users"
        | "team_not_found"
        | "neud_team_protected"
        | "database_cleanup_failed"
        | "auth_admin_delete_failed"
        | "user_delete_failed";
    };

function mapDirectoryForTeamDelete(
  directory: AccessManagementDirectory,
): import("../../../shared/access-management/can-view-user-details").UserDetailsDirectory {
  return {
    users: directory.users.map((user) => ({
      id: user.id,
      email: user.email,
      platformRole: user.platformRole,
      fullName: user.fullName,
    })),
    teams: directory.teams.map((team) => ({
      id: team.id,
      name: team.name,
      slug: team.slug,
    })),
    teamMemberships: directory.teamMemberships.map((membership) => ({
      teamId: membership.teamId,
      userId: membership.userId,
      role: membership.role,
    })),
    projectMembers: directory.projectMembers.map((member) => ({
      projectId: member.projectId,
      userId: member.userId,
      role: member.role,
    })),
    projectTeams: directory.projectTeams.map((assignment) => ({
      projectId: assignment.projectId,
      teamId: assignment.teamId,
    })),
    projects: directory.projects,
  };
}

export async function deletePlatformTeamWithTrustedAuth(input: {
  actorUserId: string;
  teamId: string;
  directory: AccessManagementDirectory;
}): Promise<DeletePlatformTeamResult> {
  const team = input.directory.teams.find((entry) => entry.id === input.teamId);
  if (!team) {
    return { ok: false, code: "team_not_found" };
  }
  if (isProtectedNeudTeam(team)) {
    return { ok: false, code: "neud_team_protected" };
  }

  const authDirectory = mapDirectoryForTeamDelete(input.directory);
  const validation = validateTeamDeletionTargets(
    input.actorUserId,
    input.teamId,
    authDirectory,
  );
  if (!validation.ok) {
    return { ok: false, code: validation.code };
  }

  const memberIds = listTeamMemberUserIds(input.teamId, authDirectory);
  const memberSnapshots = memberIds.map((userId) => {
    const user = input.directory.users.find((entry) => entry.id === userId);
    return {
      id: userId,
      email: user?.email ?? null,
      fullName: user?.fullName ?? null,
    };
  });

  const admin = createAdminClient();
  const activityId = randomUUID();
  const { error: activityError } = await admin.from("activity_events").insert({
    id: activityId,
    user_id: input.actorUserId,
    event_type: "team.deleted",
    description: `Deleted team ${team.name}.`,
    metadata: {
      teamId: team.id,
      teamName: team.name,
      deletedUserCount: memberIds.length,
      deletedUsers: memberSnapshots,
    },
    source: "access-management",
    severity: "info",
    source_instance_id: randomUUID(),
    occurred_at: new Date().toISOString(),
  });
  if (activityError) {
    return { ok: false, code: "database_cleanup_failed" };
  }

  for (const userId of memberIds) {
    const userResult: DeletePlatformUserResult = await deletePlatformUserWithTrustedAuth({
      actorUserId: input.actorUserId,
      targetUserId: userId,
      directory: input.directory,
    });
    if (!userResult.ok) {
      return {
        ok: false,
        code:
          userResult.code === "auth_admin_delete_failed"
            ? "auth_admin_delete_failed"
            : "user_delete_failed",
      };
    }
  }

  const { error: projectTeamError } = await admin
    .from("project_team_assignments")
    .delete()
    .eq("team_id", input.teamId);
  if (projectTeamError) {
    return { ok: false, code: "database_cleanup_failed" };
  }

  const { error: invitationError } = await admin
    .from("cloud_invitations")
    .delete()
    .eq("team_id", input.teamId);
  if (invitationError) {
    return { ok: false, code: "database_cleanup_failed" };
  }

  const { error: teamMembershipError } = await admin
    .from("team_memberships")
    .delete()
    .eq("team_id", input.teamId);
  if (teamMembershipError) {
    return { ok: false, code: "database_cleanup_failed" };
  }

  const { error: teamDeleteError } = await admin.from("teams").delete().eq("id", input.teamId);
  if (teamDeleteError) {
    return { ok: false, code: "database_cleanup_failed" };
  }

  return { ok: true, deletedUserCount: memberIds.length };
}

export { loadDirectoryForTrustedDelete };
