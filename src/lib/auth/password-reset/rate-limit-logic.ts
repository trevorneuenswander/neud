export function isPasswordResetRateLimitExceeded(input: {
  emailCount: number;
  ipCount: number;
  perEmail: number;
  perIp: number;
  hasIp: boolean;
}): { limited: boolean; reason?: "email" | "ip" } {
  if (input.emailCount >= input.perEmail) {
    return { limited: true, reason: "email" };
  }

  if (input.hasIp && input.ipCount >= input.perIp) {
    return { limited: true, reason: "ip" };
  }

  return { limited: false };
}
