import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { requireAuth } from "@/lib/auth/session";

export const RECOVERY_SESSION_COOKIE = "hmg-recovery-session";

export async function requireRecoverySession() {
  await requireAuth("/login?error=recovery-required");

  const cookieStore = await cookies();
  const recoveryCookie = cookieStore.get(RECOVERY_SESSION_COOKIE);

  if (!recoveryCookie?.value) {
    redirect("/forgot-password?error=recovery-required");
  }
}

export async function clearRecoverySessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(RECOVERY_SESSION_COOKIE);
}

export function getConfirmRedirectPath(
  type: string | null,
  next: string | null,
): string {
  if (type === "recovery") {
    return "/update-password";
  }

  return getSafeRedirectPath(next, "/dashboard");
}
