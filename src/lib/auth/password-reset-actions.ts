"use server";

import type { AuthActionState } from "@/lib/auth/state";
import { PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE } from "@/lib/auth/password-reset/messages";
import {
  completePasswordReset,
  requestPasswordReset,
} from "@/lib/auth/password-reset/service";
import {
  validateEmail,
  validatePasswordConfirmation,
} from "@/lib/auth/validation";

export async function requestPasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");

  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError, success: null };
  }

  try {
    const result = await requestPasswordReset({ email });

    if (result.error) {
      return { error: result.error, success: null };
    }

    return {
      error: null,
      success: result.success ?? PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE,
    };
  } catch {
    return {
      error: null,
      success: PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE,
    };
  }
}

export async function completePasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const passwordError = validatePasswordConfirmation(password, confirmPassword);
  if (passwordError) {
    return { error: passwordError, success: null };
  }

  if (!token.trim()) {
    return {
      error:
        "This password reset link is invalid or has expired. Request a new reset email.",
      success: null,
    };
  }

  try {
    const result = await completePasswordReset({ token, password });

    if (!result.ok) {
      return { error: result.error, success: null };
    }

    return { error: null, success: result.message };
  } catch {
    return {
      error: "Unable to update your password. Request a new reset email.",
      success: null,
    };
  }
}
