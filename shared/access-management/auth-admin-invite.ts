export type InvitationEmailFailureStage =
  | "service_config_missing"
  | "redirect_not_allowed"
  | "invalid_redirect_url"
  | "invalid_email"
  | "user_already_exists"
  | "email_rate_limited"
  | "smtp_failure"
  | "auth_provider_failure"
  | "auth_admin_error"
  | "none";

export type AuthAdminInviteErrorInput = {
  message?: string | null;
  status?: number | null;
  name?: string | null;
  code?: string | null;
};

export type ClassifiedAuthAdminInviteFailure = {
  authAdminInviteAttempted: true;
  authAdminInviteSucceeded: false;
  authAdminInviteHttpStatus: number | null;
  authAdminInviteErrorCode: string | null;
  authAdminInviteErrorName: string | null;
  authAdminInviteSafeMessage: string;
  firstInvitationEmailFailureStage: InvitationEmailFailureStage;
  authAdminInviteErrorCategory: InvitationEmailFailureStage;
  targetUserAlreadyExists: boolean | null;
};

export type AuthAdminInviteSuccessDiagnostics = {
  authAdminInviteAttempted: true;
  authAdminInviteSucceeded: true;
  authAdminInviteHttpStatus: number;
  authAdminInviteErrorCode: null;
  authAdminInviteErrorName: null;
  authAdminInviteSafeMessage: null;
  firstInvitationEmailFailureStage: "none";
  authAdminInviteErrorCategory: "none";
  targetUserAlreadyExists: false;
};

export function parseRedirectDiagnostics(redirectTo: string): {
  redirectHost: string | null;
  redirectProtocol: string | null;
  authAdminInviteRedirectCategory: "localhost_dev" | "vercel_preview" | "production" | "unknown";
} {
  try {
    const url = new URL(redirectTo);
    const host = url.hostname.toLowerCase();
    let authAdminInviteRedirectCategory: "localhost_dev" | "vercel_preview" | "production" | "unknown" =
      "unknown";
    if (host === "127.0.0.1" || host === "localhost") {
      authAdminInviteRedirectCategory = "localhost_dev";
    } else if (host.includes("vercel.app")) {
      authAdminInviteRedirectCategory = "vercel_preview";
    } else if (host === "neud.io" || host.endsWith(".neud.io")) {
      authAdminInviteRedirectCategory = "production";
    }
    return {
      redirectHost: url.host,
      redirectProtocol: url.protocol.replace(":", ""),
      authAdminInviteRedirectCategory,
    };
  } catch {
    return {
      redirectHost: null,
      redirectProtocol: null,
      authAdminInviteRedirectCategory: "unknown",
    };
  }
}

function normalizedMessage(error: AuthAdminInviteErrorInput): string {
  return (error.message ?? "").toLowerCase();
}

export function classifyAuthAdminInviteFailure(
  error: AuthAdminInviteErrorInput,
): ClassifiedAuthAdminInviteFailure {
  const message = normalizedMessage(error);
  const errorCode = error.code?.trim() || null;
  const errorName = error.name?.trim() || null;
  const httpStatus = typeof error.status === "number" ? error.status : null;

  let stage: InvitationEmailFailureStage = "auth_admin_error";
  let targetUserAlreadyExists: boolean | null = null;

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
  } else if (
    message.includes("rate limit") ||
    message.includes("too many") ||
    httpStatus === 429
  ) {
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
    authAdminInviteAttempted: true,
    authAdminInviteSucceeded: false,
    authAdminInviteHttpStatus: httpStatus,
    authAdminInviteErrorCode: errorCode,
    authAdminInviteErrorName: errorName,
    authAdminInviteSafeMessage: mapInvitationEmailFailureMessage(stage),
    firstInvitationEmailFailureStage: stage,
    authAdminInviteErrorCategory: stage,
    targetUserAlreadyExists,
  };
}

export function mapInvitationEmailFailureMessage(
  stage: InvitationEmailFailureStage,
): string {
  switch (stage) {
    case "redirect_not_allowed":
    case "invalid_redirect_url":
      return "Invitation link configuration needs attention.";
    case "invalid_email":
      return "Enter a valid email address.";
    case "user_already_exists":
      return "This email already has an account.";
    case "email_rate_limited":
      return "Too many invitation emails were sent. Try again later.";
    case "smtp_failure":
    case "auth_provider_failure":
      return "The invitation email service is unavailable.";
    case "service_config_missing":
      return "The invitation service is temporarily unavailable.";
    case "none":
      return "The invitation email could not be sent.";
    default:
      return "The invitation email could not be sent.";
  }
}

export function mapInvitationEmailFailureToResponseCode(
  stage: InvitationEmailFailureStage,
): string {
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

export function createAuthAdminInviteSuccessDiagnostics(): AuthAdminInviteSuccessDiagnostics {
  return {
    authAdminInviteAttempted: true,
    authAdminInviteSucceeded: true,
    authAdminInviteHttpStatus: 200,
    authAdminInviteErrorCode: null,
    authAdminInviteErrorName: null,
    authAdminInviteSafeMessage: null,
    firstInvitationEmailFailureStage: "none",
    authAdminInviteErrorCategory: "none",
    targetUserAlreadyExists: false,
  };
}
