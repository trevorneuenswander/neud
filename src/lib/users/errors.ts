export const AUTH_ERROR_CODES = {
  forbidden: "forbidden",
  cannotAssignRole: "cannot-assign-role",
  cannotDeleteOwner: "cannot-delete-owner",
  cannotDeleteAdmin: "cannot-delete-admin",
  lastOwnerProtected: "last-owner-protected",
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export function toUserFacingError(code: AuthErrorCode | string): string {
  switch (code) {
    case AUTH_ERROR_CODES.cannotAssignRole:
      return "You are not allowed to assign that role.";
    case AUTH_ERROR_CODES.cannotDeleteOwner:
      return "Owner accounts cannot be deleted by an Admin.";
    case AUTH_ERROR_CODES.cannotDeleteAdmin:
      return "Admin accounts cannot be deleted by an Admin.";
    case AUTH_ERROR_CODES.lastOwnerProtected:
      return "The application must retain at least one active Owner.";
    case AUTH_ERROR_CODES.forbidden:
      return "You do not have permission to perform this action.";
    default:
      return "Unable to complete this user action. Please try again.";
  }
}

export function mapMutationError(message: string | undefined): string {
  if (!message) {
    return toUserFacingError(AUTH_ERROR_CODES.forbidden);
  }

  const normalized = message.toLowerCase();

  if (normalized.includes("last-owner-protected")) {
    return toUserFacingError(AUTH_ERROR_CODES.lastOwnerProtected);
  }
  if (normalized.includes("cannot-assign-role")) {
    return toUserFacingError(AUTH_ERROR_CODES.cannotAssignRole);
  }
  if (normalized.includes("cannot-delete-owner")) {
    return toUserFacingError(AUTH_ERROR_CODES.cannotDeleteOwner);
  }
  if (normalized.includes("cannot-delete-admin")) {
    return toUserFacingError(AUTH_ERROR_CODES.cannotDeleteAdmin);
  }

  return toUserFacingError(AUTH_ERROR_CODES.forbidden);
}
