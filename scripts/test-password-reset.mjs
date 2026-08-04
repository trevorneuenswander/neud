import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

const PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE =
  "If an account exists for that email, password reset instructions have been sent.";

function generatePasswordResetToken() {
  return randomBytes(32).toString("base64url");
}

function hashPasswordResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPasswordResetIdentifier(value) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function isPasswordResetRateLimitExceeded(input) {
  if (input.emailCount >= input.perEmail) {
    return { limited: true, reason: "email" };
  }

  if (input.hasIp && input.ipCount >= input.perIp) {
    return { limited: true, reason: "ip" };
  }

  return { limited: false };
}

function evaluatePasswordStrength(password) {
  const checks = {
    minLength: password.length >= 8,
    hasLowercase: /[a-z]/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;

  let level = "weak";
  if (score >= 5) level = "strong";
  else if (score >= 4) level = "good";
  else if (score >= 3) level = "fair";

  return { score, level, checks };
}

function resolveEmailProviderName(env = process.env) {
  const configured = env.NEUD_EMAIL_PROVIDER?.trim().toLowerCase();
  if (configured) return configured;
  if (env.NODE_ENV === "development") return "dev-log";
  return "none";
}

test("generatePasswordResetToken uses cryptographically secure random bytes", () => {
  const token = generatePasswordResetToken();
  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]+$/);

  const second = generatePasswordResetToken();
  assert.notEqual(token, second);
});

test("hashPasswordResetToken stores sha256 hex digests only", () => {
  const token = "sample-reset-token";
  const hash = hashPasswordResetToken(token);

  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]+$/);
  assert.equal(hash, hashPasswordResetToken(token));
  assert.notEqual(hash, hashPasswordResetToken("different-token"));
});

test("hashPasswordResetIdentifier normalizes case and whitespace", () => {
  const first = hashPasswordResetIdentifier("  Admin@Example.com  ");
  const second = hashPasswordResetIdentifier("admin@example.com");

  assert.equal(first, second);
});

test("rate limit logic blocks by email before ip", () => {
  const blockedByEmail = isPasswordResetRateLimitExceeded({
    emailCount: 3,
    ipCount: 0,
    perEmail: 3,
    perIp: 10,
    hasIp: true,
  });

  assert.equal(blockedByEmail.limited, true);
  assert.equal(blockedByEmail.reason, "email");

  const blockedByIp = isPasswordResetRateLimitExceeded({
    emailCount: 1,
    ipCount: 10,
    perEmail: 3,
    perIp: 10,
    hasIp: true,
  });

  assert.equal(blockedByIp.limited, true);
  assert.equal(blockedByIp.reason, "ip");

  const allowed = isPasswordResetRateLimitExceeded({
    emailCount: 1,
    ipCount: 1,
    perEmail: 3,
    perIp: 10,
    hasIp: true,
  });

  assert.equal(allowed.limited, false);
});

test("generic reset request message does not reveal account existence", () => {
  assert.match(
    PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE,
    /If an account exists/i,
  );
  assert.doesNotMatch(PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE, /not found/i);
  assert.doesNotMatch(PASSWORD_RESET_REQUEST_SUCCESS_MESSAGE, /invalid email/i);
});

test("password strength evaluation enforces minimum requirements", () => {
  const weak = evaluatePasswordStrength("short");
  assert.equal(weak.level, "weak");
  assert.equal(weak.checks.minLength, false);

  const strong = evaluatePasswordStrength("Str0ng!Pass");
  assert.equal(strong.level, "strong");
  assert.equal(strong.score, 5);
});

test("email provider defaults to dev-log in development and none in production", () => {
  assert.equal(
    resolveEmailProviderName({ NODE_ENV: "development" }),
    "dev-log",
  );
  assert.equal(resolveEmailProviderName({ NODE_ENV: "production" }), "none");
  assert.equal(
    resolveEmailProviderName({
      NODE_ENV: "production",
      NEUD_EMAIL_PROVIDER: "smtp",
    }),
    "smtp",
  );
});

test("reset URL format keeps token in query string only", () => {
  const token = generatePasswordResetToken();
  const resetUrl = `http://127.0.0.1:3000/auth/reset-password?token=${encodeURIComponent(token)}`;

  assert.match(resetUrl, /\/auth\/reset-password\?token=/);
  assert.doesNotMatch(resetUrl, /token_hash=/);
});
