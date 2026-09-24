/** Mirror of shared/access-management/auth-admin-invite.ts */

export function classifyAuthAdminInviteFailure(error) {
  const message = (error.message ?? "").toLowerCase();
  const errorCode = error.code?.trim() || null;
  const errorName = error.name?.trim() || null;
  const httpStatus = typeof error.status === "number" ? error.status : null;

  let stage = "auth_admin_error";
  let targetUserAlreadyExists = null;

  if (
    message.includes("redirect") &&
    (message.includes("not allowed") ||
      message.includes("invalid") ||
      message.includes("not permitted") ||
      message.includes("url is not allowed"))
  ) {
    stage = "redirect_not_allowed";
  } else if (message.includes("invalid redirect") || message.includes("redirect url")) {
    stage = "invalid_redirect_url";
  } else if (
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("user already") ||
    errorCode === "email_exists" ||
    errorCode === "user_already_exists"
  ) {
    stage = "user_already_exists";
    targetUserAlreadyExists = true;
  } else if (message.includes("invalid email") || errorCode === "validation_failed") {
    stage = "invalid_email";
  } else if (message.includes("rate limit") || message.includes("too many") || httpStatus === 429) {
    stage = "email_rate_limited";
  } else if (
    message.includes("smtp") ||
    message.includes("email provider") ||
    message.includes("send email") ||
    message.includes("mail")
  ) {
    stage = "smtp_failure";
  } else if (
    message.includes("service role") ||
    message.includes("not authorized") ||
    message.includes("api key")
  ) {
    stage = "service_config_missing";
  } else if (message.includes("provider") || message.includes("oauth")) {
    stage = "auth_provider_failure";
  }

  return {
    firstInvitationEmailFailureStage: stage,
    targetUserAlreadyExists,
    authAdminInviteErrorCode: errorCode,
    authAdminInviteHttpStatus: httpStatus,
    authAdminInviteErrorName: errorName,
  };
}

export function mapInvitationEmailFailureToResponseCode(stage) {
  switch (stage) {
    case "redirect_not_allowed":
    case "invalid_redirect_url":
      return "invitation_redirect_not_allowed";
    case "invalid_email":
      return "invalid_email";
    case "user_already_exists":
      return "user_already_exists";
    case "email_rate_limited":
      return "email_rate_limited";
    case "smtp_failure":
      return "smtp_failure";
    case "service_config_missing":
      return "invitation_service_unavailable";
    case "auth_provider_failure":
      return "auth_provider_failure";
    default:
      return "auth_admin_invite_failed";
  }
}
