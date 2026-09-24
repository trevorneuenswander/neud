import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canDeleteUserInDirectory } from "../../../shared/access-management/can-delete-user";
import type { UserDetailsDirectory } from "../../../shared/access-management/can-view-user-details";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordUserAuditEvent } from "@/lib/users/audit";
import { getApplicationRole } from "@/lib/auth/application-roles";
import type { AccessManagementDirectory } from "@/lib/access-management/types";

export type DeletePlatformUserResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "permission_denied"
        | "owner_protected"
        | "user_not_found"
        | "auth_admin_delete_failed"
        | "database_cleanup_failed"
        | "invalid_user";
    };

function mapDirectoryForDeleteAuth(
  directory: AccessManagementDirectory,
): UserDetailsDirectory {
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

export async function deletePlatformUserWithTrustedAuth(input: {
  actorUserId: string;
  targetUserId: string;
  directory: AccessManagementDirectory;
}): Promise<DeletePlatformUserResult> {
  const targetUserId = input.targetUserId.trim();
  if (!targetUserId) {
    return { ok: false, code: "invalid_user" };
  }

  if (input.actorUserId === targetUserId) {
    return { ok: false, code: "permission_denied" };
  }

  const authDirectory = mapDirectoryForDeleteAuth(input.directory);
  const targetUser = authDirectory.users.find((entry) => entry.id === targetUserId);
  if (!targetUser) {
    return { ok: false, code: "user_not_found" };
  }

  if (!canDeleteUserInDirectory(input.actorUserId, targetUserId, authDirectory)) {
    if ((targetUser.platformRole ?? "").toLowerCase() === "owner") {
      return { ok: false, code: "owner_protected" };
    }
    return { ok: false, code: "permission_denied" };
  }

  const admin = createAdminClient();
  const { data: soleOwnerRow, error: soleOwnerError } = await admin.rpc(
    "is_sole_owner_user",
    { p_user_id: targetUserId },
  );
  if (soleOwnerError) {
    return { ok: false, code: "database_cleanup_failed" };
  }
  if (soleOwnerRow === true) {
    return { ok: false, code: "owner_protected" };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", targetUserId)
    .maybeSingle();

  if (profileError) {
    return { ok: false, code: "database_cleanup_failed" };
  }
  if (!profile) {
    return { ok: false, code: "user_not_found" };
  }

  const targetRole = getApplicationRole({ role: profile.role });
  const deletedUserEmail = profile.email ?? targetUser.email;
  const deletedUserName =
    profile.full_name?.trim() || targetUser.fullName?.trim() || deletedUserEmail;

  const activityId = randomUUID();
  const occurredAt = new Date().toISOString();
  const { error: activityError } = await admin.from("activity_events").insert({
    id: activityId,
    user_id: input.actorUserId,
    event_type: "user.deleted",
    description: `Deleted user ${deletedUserName}.`,
    metadata: {
      deletedUserId: targetUserId,
      deletedUserEmail,
      deletedUserName,
      deletedUserPlatformRole: targetRole,
    },
    source: "access-management",
    severity: "info",
    source_instance_id: randomUUID(),
    occurred_at: occurredAt,
  });

  if (activityError) {
    return { ok: false, code: "database_cleanup_failed" };
  }

  const normalizedEmail = deletedUserEmail.trim().toLowerCase();
  const { error: invitationByEmailError } = await admin
    .from("cloud_invitations")
    .delete()
    .eq("email_normalized", normalizedEmail);
  if (invitationByEmailError) {
    return { ok: false, code: "database_cleanup_failed" };
  }
  const { error: invitationByAcceptError } = await admin
    .from("cloud_invitations")
    .delete()
    .eq("accepted_by", targetUserId);
  if (invitationByAcceptError) {
    return { ok: false, code: "database_cleanup_failed" };
  }

  const { error: teamMembershipDeleteError } = await admin
    .from("team_memberships")
    .delete()
    .eq("user_id", targetUserId);
  if (teamMembershipDeleteError) {
    return { ok: false, code: "database_cleanup_failed" };
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(targetUserId);
  if (authDeleteError) {
    return { ok: false, code: "auth_admin_delete_failed" };
  }

  await recordUserAuditEvent({
    actorUserId: input.actorUserId,
    targetUserId,
    eventType: "user.deleted",
    metadata: {
      deletedUserEmail,
      deletedUserName,
      previousRole: targetRole,
      activityEventId: activityId,
    },
  });

  return { ok: true };
}

export async function loadDirectoryForTrustedDelete(
  supabase: SupabaseClient,
): Promise<AccessManagementDirectory | null> {
  const { fetchAccessManagementDirectory } = await import("./directory-client");
  try {
    return await fetchAccessManagementDirectory(supabase);
  } catch {
    return null;
  }
}
