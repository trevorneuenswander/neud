import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type StoredPasswordResetToken = {
  id: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
};

export async function invalidateExistingPasswordResetTokens(userId: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  await admin
    .from("password_reset_tokens")
    .update({ used_at: now })
    .eq("user_id", userId)
    .is("used_at", null);
}

export async function createPasswordResetTokenRecord(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  requestIpHash?: string | null;
}) {
  const admin = createAdminClient();

  await invalidateExistingPasswordResetTokens(input.userId);

  const { error } = await admin.from("password_reset_tokens").insert({
    user_id: input.userId,
    token_hash: input.tokenHash,
    expires_at: input.expiresAt.toISOString(),
    request_ip_hash: input.requestIpHash ?? null,
  });

  if (error) {
    throw new Error("Unable to create password reset token.");
  }
}

export async function findPasswordResetTokenByHash(
  tokenHash: string,
): Promise<StoredPasswordResetToken | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    expiresAt: data.expires_at,
    usedAt: data.used_at,
  };
}

export async function markPasswordResetTokenUsed(tokenId: string) {
  await consumePasswordResetToken(tokenId);
}

export async function consumePasswordResetToken(
  tokenId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("password_reset_tokens")
    .update({ used_at: now })
    .eq("id", tokenId)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("id")
    .maybeSingle();

  return Boolean(data?.id && !error);
}

export async function cleanupExpiredPasswordResetTokens() {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  await admin
    .from("password_reset_tokens")
    .delete()
    .lt("expires_at", now);
}
