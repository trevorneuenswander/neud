"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearInviteSessionCookie,
  INVITE_SESSION_COOKIE,
  clearRecoverySessionCookie,
  logAuthConfirmDev,
  RECOVERY_SESSION_COOKIE,
} from "@/lib/auth/confirm";
import { toAuthErrorMessage } from "@/lib/auth/errors";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { finalizeCloudInvitationAcceptance } from "@/lib/access-management/finalize-cloud-invitation-acceptance";
import { upsertInvitedUserProfile } from "@/lib/access-management/upsert-invited-user-profile";
import {
  validateInvitedProfileFirstName,
  validateInvitedProfileLastName,
  validateInvitedProfilePhone,
} from "@/lib/auth/invitation-acceptance-profile";
import { createClient } from "@/lib/supabase/server";
import type { AuthActionState } from "@/lib/auth/state";
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from "@/lib/auth/validation";

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = getSafeRedirectPath(
    String(formData.get("next") ?? ""),
    "/dashboard",
  );

  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError, success: null };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError, success: null };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { error: toAuthErrorMessage(error), success: null };
  }

  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const passwordError = validatePasswordConfirmation(password, confirmPassword);
  if (passwordError) {
    return { error: passwordError, success: null };
  }

  const cookieStore = await cookies();
  const recoveryCookie = cookieStore.get(RECOVERY_SESSION_COOKIE);

  if (!recoveryCookie?.value) {
    return {
      error: "Your password reset session has expired. Request a new link.",
      success: null,
    };
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    return {
      error: "Your password reset session has expired. Request a new link.",
      success: null,
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: toAuthErrorMessage(error), success: null };
  }

  await clearRecoverySessionCookie();
  await supabase.auth.signOut();
  redirect("/login?message=password-updated");
}

function isRepeatPasswordError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("same password") ||
    normalized.includes("should be different") ||
    normalized.includes("identical")
  );
}

export async function acceptInvitation(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  const phone = String(formData.get("phoneNumber") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const firstNameError = validateInvitedProfileFirstName(firstName);
  if (firstNameError) {
    return { error: firstNameError, success: null };
  }
  const lastNameError = validateInvitedProfileLastName(lastName);
  if (lastNameError) {
    return { error: lastNameError, success: null };
  }
  const phoneError = validateInvitedProfilePhone(phone);
  if (phoneError) {
    return { error: phoneError, success: null };
  }

  const passwordError = validatePasswordConfirmation(password, confirmPassword);
  if (passwordError) {
    return { error: passwordError, success: null };
  }

  const cookieStore = await cookies();
  const inviteCookie = cookieStore.get(INVITE_SESSION_COOKIE);

  if (!inviteCookie?.value) {
    return {
      error: "Your invitation session has expired.",
      success: null,
    };
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    return {
      error: "Your invitation session has expired.",
      success: null,
    };
  }

  const { error: passwordUpdateError } = await supabase.auth.updateUser({ password });

  if (passwordUpdateError && !isRepeatPasswordError(passwordUpdateError.message)) {
    return { error: toAuthErrorMessage(passwordUpdateError), success: null };
  }

  const profileResult = await upsertInvitedUserProfile(supabase, {
    firstName,
    lastName,
    phone,
  });
  if (!profileResult.ok) {
    logAuthConfirmDev("invitation-profile-update-failed", {
      stage: profileResult.firstInvitationProfileFailureStage,
      profileUpdateAttempted: profileResult.profileUpdateAttempted,
      profileUpsertUsed: profileResult.profileUpsertUsed,
    });
    return { error: profileResult.userMessage, success: null };
  }

  const acceptance = await finalizeCloudInvitationAcceptance(supabase);
  if (!acceptance.ok) {
    logAuthConfirmDev("invitation-acceptance-rpc-failed", {
      code: acceptance.code,
      profileUpdateSucceeded: profileResult.profileUpdateSucceeded,
      acceptInvitationRpcAttempted: true,
      acceptInvitationRpcSucceeded: false,
    });
    if (acceptance.code === "conflict") {
      await clearInviteSessionCookie();
      redirect("/portal");
    }
    return { error: acceptance.userMessage, success: null };
  }

  await clearInviteSessionCookie();
  revalidatePath("/portal");
  revalidatePath("/users");
  logAuthConfirmDev("invitation-acceptance-success", {
    redirect: "/portal",
    invitationId: acceptance.invitationId,
    profileUpdateSucceeded: profileResult.profileUpdateSucceeded,
    acceptInvitationRpcSucceeded: true,
  });
  redirect("/portal");
}
