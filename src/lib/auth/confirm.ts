import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { requireAuth } from "@/lib/auth/session";

export const RECOVERY_SESSION_COOKIE = "hmg-recovery-session";
export const INVITE_SESSION_COOKIE = "hmg-invite-session";

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export function isEmailOtpType(type: string): type is EmailOtpType {
  return EMAIL_OTP_TYPES.includes(type as EmailOtpType);
}

export async function requireRecoverySession() {
  await requireAuth("/login?error=recovery-required");

  const cookieStore = await cookies();
  const recoveryCookie = cookieStore.get(RECOVERY_SESSION_COOKIE);

  if (!recoveryCookie?.value) {
    redirect("/forgot-password?error=recovery-required");
  }
}

export async function requireInviteSession() {
  await requireAuth("/login?error=invite-required");

  const cookieStore = await cookies();
  const inviteCookie = cookieStore.get(INVITE_SESSION_COOKIE);

  if (!inviteCookie?.value) {
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

export function getConfirmRedirectPath(
  type: EmailOtpType | string | null,
  next: string | null,
): string {
  if (type === "recovery") {
    return "/update-password";
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
