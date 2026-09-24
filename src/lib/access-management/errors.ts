import type { AccessManagementErrorCode } from "./types";

export class AccessManagementError extends Error {
  readonly code: AccessManagementErrorCode;

  constructor(code: AccessManagementErrorCode, message: string) {
    super(message);
    this.name = "AccessManagementError";
    this.code = code;
  }
}

const ERROR_MESSAGES: Record<AccessManagementErrorCode, string> = {
  authentication_required: "Sign in to manage access.",
  forbidden: "You do not have permission to perform this action.",
  insufficient_permissions: "You do not have permission to perform this action.",
  insufficient_access: "You do not have permission to perform this action.",
  outside_team_scope: "This team is outside your management scope.",
  cannot_modify_owner: "The NEUD owner account cannot be modified here.",
  owner_role_not_assignable: "Owner is reserved for the sole NEUD owner account.",
  sole_owner_protected: "The sole NEUD owner account cannot be changed or removed.",
  owner_team_protected: "The NEUD team cannot be archived or removed.",
  neud_team_protected: "The NEUD team cannot be deleted.",
  invalid_team_role: "Team role must be Admin or Member.",
  last_owner: "At least one NEUD owner must remain.",
  invitation_expired: "This invitation has expired.",
  invitation_revoked: "This invitation was revoked.",
  duplicate_invitation: "A pending invitation already exists for this email.",
  offline_required: "Access management requires an internet connection.",
  conflict: "This change conflicted with newer access data. Refresh and try again.",
  invalid_request: "The request was invalid. Check the form and try again.",
  invitation_service_unavailable:
    "Invitation service is temporarily unavailable.",
  auth_admin_invite_failed: "Auth invite email could not be sent.",
};

export function parseAccessManagementError(
  code: string | null | undefined,
  fallback: AccessManagementErrorCode = "forbidden",
): AccessManagementError {
  const normalized = (code ?? fallback).trim() as AccessManagementErrorCode;
  const message = ERROR_MESSAGES[normalized] ?? ERROR_MESSAGES[fallback];
  return new AccessManagementError(normalized in ERROR_MESSAGES ? normalized : fallback, message);
}

export function accessManagementErrorMessage(error: unknown): string {
  if (error instanceof AccessManagementError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to complete this access action.";
}
