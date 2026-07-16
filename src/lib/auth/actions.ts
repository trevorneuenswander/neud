"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearRecoverySessionCookie,
  RECOVERY_SESSION_COOKIE,
} from "@/lib/auth/confirm";
import { toAuthErrorMessage } from "@/lib/auth/errors";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import type { AuthActionState } from "@/lib/auth/state";
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from "@/lib/auth/validation";

async function getSiteOrigin(): Promise<string> {
  const headersList = await headers();
  const origin = headersList.get("origin");

  if (origin) {
    return origin;
  }

  const host =
    headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return "http://localhost:3000";
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError, success: null };
  }

  const passwordError = validatePasswordConfirmation(password, confirmPassword);
  if (passwordError) {
    return { error: passwordError, success: null };
  }

  const supabase = await createClient();
  const origin = await getSiteOrigin();
  const emailRedirectTo = `${origin}/auth/confirm`;

  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    return { error: toAuthErrorMessage(error), success: null };
  }

  return {
    error: null,
    success:
      "Check your email for a confirmation link before logging in.",
  };
}

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
  redirect("/login");
}

export async function requestPasswordReset(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");

  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError, success: null };
  }

  const supabase = await createClient();
  const origin = await getSiteOrigin();
  const redirectTo = `${origin}/auth/confirm?next=/update-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim(),
    { redirectTo },
  );

  if (error) {
    return { error: toAuthErrorMessage(error), success: null };
  }

  return {
    error: null,
    success:
      "If an account exists for that email, a password reset link has been sent.",
  };
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
