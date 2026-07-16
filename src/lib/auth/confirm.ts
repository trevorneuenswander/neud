import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  logAuthConfirmDev,
} from "@/lib/auth/confirm-shared";
import { getAuthClaims } from "@/lib/auth/session";

export {
  type ConfirmSearchParams,
  getConfirmParamDiagnostics,
  getConfirmRedirectPath,
  getConfirmationErrorRedirect,
  getSupabaseErrorDetails,
  isEmailOtpType,
  isInviteDestination,
  isRecoveryDestination,
  logAuthConfirmDev,
  logConfirmationError,
} from "@/lib/auth/confirm-shared";

export const RECOVERY_SESSION_COOKIE = "hmg-recovery-session";
export const INVITE_SESSION_COOKIE = "hmg-invite-session";

export const FLOW_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 15,
  path: "/",
};

export async function requireRecoverySession() {
  const claims = await getAuthClaims();

  if (!claims) {
    logAuthConfirmDev("recovery-session-check-failed", {
      reason: "missing-auth-session",
    });
    redirect("/login?error=recovery-required");
  }

  const cookieStore = await cookies();
  const recoveryCookie = cookieStore.get(RECOVERY_SESSION_COOKIE);

  if (!recoveryCookie?.value) {
    logAuthConfirmDev("recovery-session-check-failed", {
      reason: "missing-recovery-cookie",
    });
    redirect("/forgot-password?error=recovery-required");
  }
}

export async function requireInviteSession() {
  const claims = await getAuthClaims();

  if (!claims) {
    logAuthConfirmDev("invite-session-check-failed", {
      reason: "missing-auth-session",
    });
    redirect("/login?error=invite-required");
  }

  const cookieStore = await cookies();
  const inviteCookie = cookieStore.get(INVITE_SESSION_COOKIE);

  if (!inviteCookie?.value) {
    logAuthConfirmDev("invite-session-check-failed", {
      reason: "missing-invite-cookie",
    });
    redirect("/login?error=invite-required");
  }
}

export async function clearRecoverySessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(RECOVERY_SESSION_COOKIE);
}

export async function clearInviteSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(INVITE_SESSION_COOKIE);
}

export async function setFlowSessionCookie(type: EmailOtpType) {
  const cookieStore = await cookies();

  if (type === "invite") {
    cookieStore.set(INVITE_SESSION_COOKIE, "1", FLOW_SESSION_COOKIE_OPTIONS);
    logAuthConfirmDev("invite-cookie-created", {
      path: FLOW_SESSION_COOKIE_OPTIONS.path,
    });
    return;
  }

  if (type === "recovery") {
    cookieStore.set(RECOVERY_SESSION_COOKIE, "1", FLOW_SESSION_COOKIE_OPTIONS);
    logAuthConfirmDev("recovery-cookie-created", {
      path: FLOW_SESSION_COOKIE_OPTIONS.path,
    });
  }
}
