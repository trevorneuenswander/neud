import "server-only";

import { headers } from "next/headers";
import { getPasswordResetRateLimitConfig } from "@/lib/auth/password-reset/config";
import {
  countPasswordResetRequests,
  recordPasswordResetAuditEvent,
} from "@/lib/auth/password-reset/audit";
import { isPasswordResetRateLimitExceeded } from "@/lib/auth/password-reset/rate-limit-logic";
import { hashPasswordResetIdentifier } from "@/lib/auth/password-reset/token";

export async function getPasswordResetRequestContext() {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? headersList.get("x-real-ip");
  const userAgent = headersList.get("user-agent");

  return {
    ipHash: ip ? hashPasswordResetIdentifier(ip) : null,
    userAgent: userAgent ?? null,
  };
}

export async function isPasswordResetRateLimited(email: string): Promise<boolean> {
  const { perEmail, perIp, windowMs } = getPasswordResetRateLimitConfig();
  const sinceIso = new Date(Date.now() - windowMs).toISOString();
  const emailHash = hashPasswordResetIdentifier(email);
  const { ipHash } = await getPasswordResetRequestContext();

  const counts = await countPasswordResetRequests({
    emailHash,
    ipHash: ipHash ?? undefined,
    sinceIso,
  });

  const limit = isPasswordResetRateLimitExceeded({
    emailCount: counts.emailCount,
    ipCount: counts.ipCount,
    perEmail,
    perIp,
    hasIp: Boolean(ipHash),
  });

  if (limit.limited) {
    await recordPasswordResetAuditEvent({
      eventType: "password_reset.request",
      outcome: "rate_limited",
      metadata: { emailHash, ipHash, reason: limit.reason ?? "email" },
    });
    return true;
  }

  return false;
}
