import "server-only";

const DEFAULT_TOKEN_TTL_MINUTES = 30;
const DEFAULT_RATE_LIMIT_PER_EMAIL = 3;
const DEFAULT_RATE_LIMIT_PER_IP = 10;
const DEFAULT_RATE_LIMIT_WINDOW_MINUTES = 60;

function readPositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function getPasswordResetTokenTtlMs(): number {
  const minutes = readPositiveInt(
    process.env.NEUD_PASSWORD_RESET_TOKEN_TTL_MINUTES,
    DEFAULT_TOKEN_TTL_MINUTES,
  );

  return minutes * 60 * 1000;
}

export function getPasswordResetRateLimitConfig() {
  const windowMinutes = readPositiveInt(
    process.env.NEUD_PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES,
    DEFAULT_RATE_LIMIT_WINDOW_MINUTES,
  );

  return {
    perEmail: readPositiveInt(
      process.env.NEUD_PASSWORD_RESET_RATE_LIMIT_PER_EMAIL,
      DEFAULT_RATE_LIMIT_PER_EMAIL,
    ),
    perIp: readPositiveInt(
      process.env.NEUD_PASSWORD_RESET_RATE_LIMIT_PER_IP,
      DEFAULT_RATE_LIMIT_PER_IP,
    ),
    windowMs: windowMinutes * 60 * 1000,
  };
}
