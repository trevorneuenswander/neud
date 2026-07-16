"use server";

import { redirect } from "next/navigation";
import {
  getConfirmRedirectPath,
  getConfirmationErrorRedirect,
  isEmailOtpType,
  isInviteDestination,
  isRecoveryDestination,
  logAuthConfirmDev,
} from "@/lib/auth/confirm-shared";
import { setFlowSessionCookie } from "@/lib/auth/confirm";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function completeConfirmFlow(
  next: string,
  type: string | null,
) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    const context = isInviteDestination(next) ? "invite" : "confirmation";

    logAuthConfirmDev("client-hash-complete-failed", {
      reason: "missing-auth-session",
      redirect: getConfirmationErrorRedirect(context),
    });

    redirect(getConfirmationErrorRedirect(context));
  }

  const resolvedType: EmailOtpType | null =
    type && isEmailOtpType(type)
      ? type
      : isInviteDestination(next)
        ? "invite"
        : isRecoveryDestination(next)
          ? "recovery"
          : null;

  if (!resolvedType) {
    logAuthConfirmDev("client-hash-complete-failed", {
      reason: "unknown-flow",
      redirect: "/login?error=confirmation-failed",
    });
    redirect("/login?error=confirmation-failed");
  }

  if (resolvedType === "invite" || resolvedType === "recovery") {
    await setFlowSessionCookie(resolvedType);
  }

  const redirectPath = getConfirmRedirectPath(resolvedType, next);

  logAuthConfirmDev("verification-success", {
    method: "client-hash",
    resolvedFlowType: resolvedType,
  });

  logAuthConfirmDev("redirect", {
    destination: redirectPath,
    resolvedFlowType: resolvedType,
  });

  redirect(redirectPath);
}
