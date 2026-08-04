"use server";

import { revalidatePath } from "next/cache";
import {
  getApplicationRole,
  normalizeApplicationRole,
  toPersistedApplicationRole,
  type ApplicationRole,
} from "@/lib/auth/application-roles";
import {
  canAssignRole,
  canAssignUserToProject,
  canCreateUser,
  canDeleteUser,
  canEditUser,
  canInviteUser,
  canRemoveUserFromProject,
  requireUser,
} from "@/lib/auth/authorization";
import { getSiteOrigin } from "@/lib/auth/site-origin";
import { recordUserAuditEvent } from "@/lib/users/audit";
import { AUTH_ERROR_CODES, mapMutationError, toUserFacingError } from "@/lib/users/errors";
import {
  countActiveOwners,
  getAssignableProjectsForUserManagement,
  getProfileById,
} from "@/lib/users/queries";
import type { UserActionState } from "@/lib/users/types";
import { shouldUseLocalData } from "@/lib/local/mode";
import {
  isValidUuid,
  validateProjectAccessLevel,
} from "@/lib/projects/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireUserManagementAccess() {
  const session = await requireUser();
  if (!canCreateUser(session.profile)) {
    throw new Error(AUTH_ERROR_CODES.forbidden);
  }
  return session;
}

function parseRequestedRole(raw: string): ApplicationRole | null {
  const role = normalizeApplicationRole(raw);
  if (
    role === "owner" ||
    role === "admin" ||
    role === "operator" ||
    role === "viewer"
  ) {
    return role;
  }
  return null;
}

function toInviteErrorMessage(error: { message?: string } | null): string {
  if (!error?.message) {
    return "Unable to invite this user. Please try again.";
  }

  const message = error.message.toLowerCase();
  if (message.includes("already been registered") || message.includes("already exists")) {
    return "A user with this email address already exists.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts. Please wait and try again.";
  }
  return "Unable to invite this user. Please try again.";
}

export async function invitePlatformUser(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  if (shouldUseLocalData()) {
    return {
      error:
        "User invitations require hosted authentication. Sign in through the cloud portal to manage users.",
      success: null,
    };
  }

  let actorProfile;
  try {
    ({ profile: actorProfile } = await requireUserManagementAccess());
  } catch {
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  if (!canInviteUser(actorProfile)) {
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const team = String(formData.get("team") ?? formData.get("company") ?? "").trim();
  const requestedRole = parseRequestedRole(String(formData.get("role") ?? "viewer"));

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address.", success: null };
  }
  if (!fullName) {
    return { error: "Enter a display name.", success: null };
  }
  if (!requestedRole) {
    return { error: "Select a valid role.", success: null };
  }
  if (
    !canAssignRole(actorProfile, { role: "viewer" }, requestedRole)
  ) {
    return { error: toUserFacingError(AUTH_ERROR_CODES.cannotAssignRole), success: null };
  }

  const admin = createAdminClient();
  const origin = await getSiteOrigin();
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent("/accept-invitation")}`;

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        full_name: fullName,
        team: team || null,
      },
    });

  if (inviteError) {
    return { error: toInviteErrorMessage(inviteError), success: null };
  }

  const invitedUserId = inviteData.user?.id;
  if (!invitedUserId) {
    return {
      error: "Invitation was sent but the user record could not be confirmed.",
      success: null,
    };
  }

  const persistedRole = toPersistedApplicationRole(requestedRole);
  const { error: profileError } = await admin.from("profiles").upsert({
    id: invitedUserId,
    full_name: fullName,
    email,
    team: team || null,
    role: persistedRole,
  });

  if (profileError) {
    return { error: "Invitation sent but profile setup failed.", success: null };
  }

  const projectIds = formData.getAll("projectIds").map(String).filter(isValidUuid);
  const projectAccessLevel = validateProjectAccessLevel(
    String(formData.get("projectAccessLevel") ?? "viewer"),
  );

  if (projectIds.length > 0 && canAssignUserToProject(actorProfile)) {
    if (!projectAccessLevel) {
      return { error: "Select a valid project access level.", success: null };
    }

    const assignments = projectIds.map((projectId) => ({
      project_id: projectId,
      user_id: invitedUserId,
      access_level: projectAccessLevel,
      assigned_by: actorProfile.id,
    }));

    const { error: assignmentError } = await admin
      .from("project_members")
      .insert(assignments);

    if (assignmentError) {
      return {
        error: "User invited but project assignments could not be saved.",
        success: null,
      };
    }

    for (const projectId of projectIds) {
      await recordUserAuditEvent({
        actorUserId: actorProfile.id,
        targetUserId: invitedUserId,
        eventType: "user.project.assigned",
        metadata: { projectId, accessLevel: projectAccessLevel },
      });
    }
  }

  await recordUserAuditEvent({
    actorUserId: actorProfile.id,
    targetUserId: invitedUserId,
    eventType: "user.invited",
    metadata: { role: persistedRole, email },
  });

  revalidatePath("/users");
  return {
    error: null,
    success: `Invitation sent to ${email}.`,
  };
}

export async function updatePlatformUserRole(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  if (shouldUseLocalData()) {
    return {
      error: "Role changes require hosted authentication.",
      success: null,
    };
  }

  let actorProfile;
  try {
    ({ profile: actorProfile } = await requireUserManagementAccess());
  } catch {
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  const targetUserId = String(formData.get("userId") ?? "").trim();
  const requestedRole = parseRequestedRole(String(formData.get("role") ?? ""));

  if (!isValidUuid(targetUserId) || !requestedRole) {
    return { error: "Invalid role change request.", success: null };
  }

  const targetProfile = await getProfileById(targetUserId);
  if (!targetProfile) {
    return { error: "User not found.", success: null };
  }

  if (!canAssignRole(actorProfile, targetProfile, requestedRole)) {
    return { error: toUserFacingError(AUTH_ERROR_CODES.cannotAssignRole), success: null };
  }

  const previousRole = getApplicationRole(targetProfile);
  const nextRole = toPersistedApplicationRole(requestedRole);

  if (previousRole === "owner" && nextRole !== "owner") {
    const ownerCount = await countActiveOwners();
    if (ownerCount <= 1) {
      return {
        error: toUserFacingError(AUTH_ERROR_CODES.lastOwnerProtected),
        success: null,
      };
    }
  }

  if (
    previousRole === "admin" &&
    actorProfile.id === targetProfile.id &&
    nextRole === "owner"
  ) {
    return { error: toUserFacingError(AUTH_ERROR_CODES.cannotAssignRole), success: null };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: nextRole })
    .eq("id", targetUserId);

  if (error) {
    return { error: mapMutationError(error.message), success: null };
  }

  await recordUserAuditEvent({
    actorUserId: actorProfile.id,
    targetUserId,
    eventType: "user.role.changed",
    metadata: { previousRole, newRole: nextRole },
  });

  revalidatePath("/users");
  return { error: null, success: "User role updated." };
}

export async function updatePlatformUserProfile(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  if (shouldUseLocalData()) {
    return { error: "User edits require hosted authentication.", success: null };
  }

  let actorProfile;
  try {
    ({ profile: actorProfile } = await requireUserManagementAccess());
  } catch {
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  const targetUserId = String(formData.get("userId") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const team = String(formData.get("team") ?? formData.get("company") ?? "").trim();

  if (!isValidUuid(targetUserId)) {
    return { error: "Invalid user.", success: null };
  }

  const targetProfile = await getProfileById(targetUserId);
  if (!targetProfile) {
    return { error: "User not found.", success: null };
  }

  if (!canEditUser(actorProfile, targetProfile)) {
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: fullName || null,
      team: team || null,
    })
    .eq("id", targetUserId);

  if (error) {
    return { error: mapMutationError(error.message), success: null };
  }

  revalidatePath("/users");
  return { error: null, success: "User profile updated." };
}

export async function deletePlatformUser(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  if (shouldUseLocalData()) {
    return { error: "User deletion requires hosted authentication.", success: null };
  }

  let actorProfile;
  try {
    ({ profile: actorProfile } = await requireUserManagementAccess());
  } catch {
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  const targetUserId = String(formData.get("userId") ?? "").trim();
  if (!isValidUuid(targetUserId)) {
    return { error: "Invalid user.", success: null };
  }

  if (targetUserId === actorProfile.id) {
    return {
      error: "Use account settings for self-deletion workflows.",
      success: null,
    };
  }

  const targetProfile = await getProfileById(targetUserId);
  if (!targetProfile) {
    return { error: "User not found.", success: null };
  }

  const ownerCount = await countActiveOwners();
  const targetRole = getApplicationRole(targetProfile);

  if (!canDeleteUser(actorProfile, targetProfile, { activeOwnerCount: ownerCount })) {
    if (targetRole === "owner") {
      return { error: toUserFacingError(AUTH_ERROR_CODES.cannotDeleteOwner), success: null };
    }
    if (targetRole === "admin") {
      return { error: toUserFacingError(AUTH_ERROR_CODES.cannotDeleteAdmin), success: null };
    }
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  if (targetRole === "owner" && ownerCount <= 1) {
    return {
      error: toUserFacingError(AUTH_ERROR_CODES.lastOwnerProtected),
      success: null,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(targetUserId);

  if (error) {
    return { error: mapMutationError(error.message), success: null };
  }

  await recordUserAuditEvent({
    actorUserId: actorProfile.id,
    targetUserId,
    eventType: "user.deleted",
    metadata: { previousRole: targetRole },
  });

  revalidatePath("/users");
  return { error: null, success: "User deleted." };
}

export async function assignUserToProject(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  if (shouldUseLocalData()) {
    return { error: "Project assignments require hosted authentication.", success: null };
  }

  let actorProfile;
  try {
    ({ profile: actorProfile } = await requireUserManagementAccess());
  } catch {
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  if (!canAssignUserToProject(actorProfile)) {
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  const targetUserId = String(formData.get("userId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const accessLevel = validateProjectAccessLevel(
    String(formData.get("accessLevel") ?? "viewer"),
  );

  if (!isValidUuid(targetUserId) || !isValidUuid(projectId) || !accessLevel) {
    return { error: "Invalid project assignment request.", success: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_members").insert({
    project_id: projectId,
    user_id: targetUserId,
    access_level: accessLevel,
    assigned_by: actorProfile.id,
  });

  if (error) {
    return { error: mapMutationError(error.message), success: null };
  }

  await recordUserAuditEvent({
    actorUserId: actorProfile.id,
    targetUserId,
    eventType: "user.project.assigned",
    metadata: { projectId, accessLevel },
  });

  revalidatePath("/users");
  return { error: null, success: "Project assignment added." };
}

export async function removeUserFromProject(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  if (shouldUseLocalData()) {
    return { error: "Project assignments require hosted authentication.", success: null };
  }

  let actorProfile;
  try {
    ({ profile: actorProfile } = await requireUserManagementAccess());
  } catch {
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  if (!canRemoveUserFromProject(actorProfile)) {
    return { error: toUserFacingError(AUTH_ERROR_CODES.forbidden), success: null };
  }

  const targetUserId = String(formData.get("userId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();

  if (!isValidUuid(targetUserId) || !isValidUuid(projectId)) {
    return { error: "Invalid project assignment request.", success: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", targetUserId);

  if (error) {
    return { error: mapMutationError(error.message), success: null };
  }

  await recordUserAuditEvent({
    actorUserId: actorProfile.id,
    targetUserId,
    eventType: "user.project.removed",
    metadata: { projectId },
  });

  revalidatePath("/users");
  return { error: null, success: "Project assignment removed." };
}

export async function getUserManagementContext() {
  if (shouldUseLocalData()) {
    return {
      projects: [],
      localMode: true as const,
    };
  }

  const projects = await getAssignableProjectsForUserManagement();
  return {
    projects,
    localMode: false as const,
  };
}
