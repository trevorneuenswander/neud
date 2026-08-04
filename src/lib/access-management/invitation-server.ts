import { createHash, randomBytes } from "node:crypto";

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString("hex");
}

export function invitationExpiresAt(days = 7): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

const inviteRateLimit = new Map<string, { count: number; resetAt: number }>();

export function checkInvitationRateLimit(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = inviteRateLimit.get(key);
  if (!entry || entry.resetAt <= now) {
    inviteRateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) {
    return false;
  }
  entry.count += 1;
  return true;
}
