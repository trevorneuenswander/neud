import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/auth/site-origin";
import { getPasswordResetTokenTtlMs } from "@/lib/auth/password-reset/config";
import {
  recordPasswordResetAuditEvent,
} from "@/lib/auth/password-reset/audit";
import { getPasswordResetEmailProvider } from "@/lib/auth/password-reset/email";
import { PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE } from "@/lib/auth/password-reset/messages";
import {
  getPasswordResetRequestContext,
  isPasswordResetRateLimited,
} from "@/lib/auth/password-reset/rate-limit";
import {
  cleanupExpiredPasswordResetTokens,
  createPasswordResetTokenRecord,
  findPasswordResetTokenByHash,
  consumePasswordResetToken,
} from "@/lib/auth/password-reset/storage";
import {
  generatePasswordResetToken,
  hashPasswordResetIdentifier,
  hashPasswordResetToken,
} from "@/lib/auth/password-reset/token";
import { findAuthUserIdByEmail } from "@/lib/auth/password-reset/user-lookup";

export type PasswordResetTokenValidation =
  | { status: "valid"; tokenId: string; userId: string }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "used" };

export async function requestPasswordReset(input: {
  email: string;
}): Promise<{ success: string; error: null } | { success: null; error: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const emailHash = hashPasswordResetIdentifier(normalizedEmail);
  const { ipHash, userAgent } = await getPasswordResetRequestContext();

  await cleanupExpiredPasswordResetTokens();

  if (await isPasswordResetRateLimited(normalizedEmail)) {
    return {
      success: PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE,
      error: null,
    };
  }

  const userId = await findAuthUserIdByEmail(normalizedEmail);

  if (!userId) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.request",
      outcome: "no_user",
      metadata: { emailHash, ipHash, userAgent },
    });

    return {
      success: PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE,
      error: null,
    };
  }

  const token = generatePasswordResetToken();
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = new Date(Date.now() + getPasswordResetTokenTtlMs());

  try {
    await createPasswordResetTokenRecord({
      userId,
      tokenHash,
      expiresAt,
      requestIpHash: ipHash,
    });
  } catch {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.request",
      userId,
      outcome: "email_failed",
      metadata: { emailHash, ipHash, reason: "token_create_failed" },
    });

    return {
      success: PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE,
      error: null,
    };
  }

  const origin = await getSiteOrigin();
  const resetUrl = `${origin}/auth/reset-password?token=${encodeURIComponent(token)}`;
  const emailProvider = getPasswordResetEmailProvider();
  const emailResult = await emailProvider.sendPasswordResetEmail({
    to: normalizedEmail,
    resetUrl,
  });

  if (!emailResult.ok) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.request",
      userId,
      outcome: emailProvider.isConfigured ? "email_failed" : "email_unconfigured",
      metadata: {
        emailHash,
        ipHash,
        userAgent,
        provider: emailProvider.name,
        error: emailResult.error ?? null,
      },
    });

    return {
      success: PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE,
      error: null,
    };
  }

  await recordPasswordResetAuditEvent({
    eventType: "password_reset.request",
    userId,
    outcome: "sent",
    metadata: {
      emailHash,
      ipHash,
      userAgent,
      provider: emailProvider.name,
    },
  });

  return {
    success: PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE,
    error: null,
  };
}

export async function validatePasswordResetToken(
  token: string,
): Promise<PasswordResetTokenValidation> {
  const trimmedToken = token.trim();

  if (!trimmedToken) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.validate",
      outcome: "invalid",
    });
    return { status: "invalid" };
  }

  await cleanupExpiredPasswordResetTokens();

  const tokenHash = hashPasswordResetToken(trimmedToken);
  const storedToken = await findPasswordResetTokenByHash(tokenHash);

  if (!storedToken) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.validate",
      outcome: "invalid",
    });
    return { status: "invalid" };
  }

  if (storedToken.usedAt) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.validate",
      userId: storedToken.userId,
      outcome: "used",
    });
    return { status: "used" };
  }

  if (new Date(storedToken.expiresAt).getTime() <= Date.now()) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.validate",
      userId: storedToken.userId,
      outcome: "expired",
    });
    return { status: "expired" };
  }

  await recordPasswordResetAuditEvent({
    eventType: "password_reset.validate",
    userId: storedToken.userId,
    outcome: "validated",
  });

  return {
    status: "valid",
    tokenId: storedToken.id,
    userId: storedToken.userId,
  };
}

export async function completePasswordReset(input: {
  token: string;
  password: string;
}): Promise<
  | { ok: true; message: string }
  | { ok: false; error: string }
> {
  const trimmedToken = input.token.trim();

  if (!trimmedToken) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.complete",
      outcome: "invalid",
    });
    return {
      ok: false,
      error:
        "This password reset link is invalid or has expired. Request a new reset email.",
    };
  }

  await cleanupExpiredPasswordResetTokens();

  const tokenHash = hashPasswordResetToken(trimmedToken);
  const storedToken = await findPasswordResetTokenByHash(tokenHash);

  if (!storedToken) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.complete",
      outcome: "invalid",
    });
    return {
      ok: false,
      error:
        "This password reset link is invalid or has expired. Request a new reset email.",
    };
  }

  if (storedToken.usedAt) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.complete",
      userId: storedToken.userId,
      outcome: "used",
    });
    return {
      ok: false,
      error:
        "This password reset link is invalid or has expired. Request a new reset email.",
    };
  }

  if (new Date(storedToken.expiresAt).getTime() <= Date.now()) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.complete",
      userId: storedToken.userId,
      outcome: "expired",
    });
    return {
      ok: false,
      error:
        "This password reset link is invalid or has expired. Request a new reset email.",
    };
  }

  const consumed = await consumePasswordResetToken(storedToken.id);
  if (!consumed) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.complete",
      userId: storedToken.userId,
      outcome: "used",
    });
    return {
      ok: false,
      error:
        "This password reset link is invalid or has expired. Request a new reset email.",
    };
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(
    storedToken.userId,
    { password: input.password },
  );

  if (updateError) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.complete",
      userId: storedToken.userId,
      outcome: "complete_failed",
      metadata: { reason: updateError.message },
    });

    return {
      ok: false,
      error: "Unable to update your password. Request a new reset email.",
    };
  }

  const { error: signOutError } = await admin.auth.admin.signOut(
    storedToken.userId,
    "global",
  );

  if (signOutError && process.env.NODE_ENV === "development") {
    console.error("[completePasswordReset] signOut", signOutError.message);
  }

  await recordPasswordResetAuditEvent({
    eventType: "password_reset.complete",
    userId: storedToken.userId,
    outcome: "completed",
  });

  return {
    ok: true,
    message: "Password successfully updated.",
  };
}
