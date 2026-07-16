import type { EmailOtpType } from "@supabase/supabase-js";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export type ConfirmSearchParams = {
  token_hash?: string;
  type?: string;
  code?: string;
  next?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
};

export function isEmailOtpType(type: string): type is EmailOtpType {
  return EMAIL_OTP_TYPES.includes(type as EmailOtpType);
}

export function isInviteDestination(next: string | null | undefined): boolean {
  return getSafeRedirectPath(next, "") === "/accept-invitation";
}

export function isRecoveryDestination(next: string | null | undefined): boolean {
  return getSafeRedirectPath(next, "") === "/update-password";
}

export function getConfirmationErrorRedirect(
  context: "invite" | "recovery" | "confirmation",
): string {
  if (context === "invite") {
    return "/login?error=invitation-invalid";
  }

  return "/login?error=confirmation-failed";
}

export function getConfirmParamDiagnostics(params: ConfirmSearchParams) {
  return {
    hasTokenHash: Boolean(params.token_hash),
    hasType: Boolean(params.type),
    hasCode: Boolean(params.code),
    hasError: Boolean(params.error),
    hasErrorCode: Boolean(params.error_code),
    hasErrorDescription: Boolean(params.error_description),
    hasNext: Boolean(params.next),
    type: params.type ?? null,
    next: params.next ?? null,
  };
}

export function getSupabaseErrorDetails(error: {
  message?: string;
  code?: string;
  status?: number;
}) {
  return {
    code: error.code ?? (error.status ? String(error.status) : "unknown"),
    message: error.message ?? "unknown",
  };
}

export function getConfirmRedirectPath(
  type: EmailOtpType | string | null,
  next: string | null,
): string {
  if (type === "recovery") {
    return getSafeRedirectPath(next, "/update-password");
  }

  if (type === "invite") {
    return getSafeRedirectPath(next, "/accept-invitation");
  }

  return getSafeRedirectPath(next, "/dashboard");
}

export function logConfirmationError(error: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.error("[auth/confirm]", error);
  }
}

export function logAuthConfirmDev(
  message: string,
  details?: Record<string, string | boolean | null>,
) {
  if (process.env.NODE_ENV === "development") {
    console.log("[auth/confirm]", message, details ?? "");
  }
}
