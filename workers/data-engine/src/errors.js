const SECRET_PATTERNS = [
  /password/i,
  /cookie/i,
  /token/i,
  /authorization/i,
  /bearer/i,
  /api[_-]?key/i,
];

const PROTOCOL_TIMEOUT_PATTERNS = [
  /Runtime\.callFunctionOn timed out/i,
  /protocolTimeout/i,
  /Protocol error.*timed out/i,
  /Target\.closeTarget timed out/i,
  /Page\.evaluate timed out/i,
];

export class StepError extends Error {
  constructor(step, cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(message);
    this.name = "StepError";
    this.step = step;
    if (cause instanceof Error && cause.stack) {
      this.stack = cause.stack;
    }
  }
}

const SAFE_PASSWORD_DIAGNOSTIC_PATTERNS = [
  /password field/i,
  /password character/i,
  /auction password/i,
  /password is required/i,
  /password was empty/i,
  /password did not retain/i,
  /password remained empty/i,
  /loading secure credentials/i,
];

export function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const trimmed = message.slice(0, 500);

  for (const safePattern of SAFE_PASSWORD_DIAGNOSTIC_PATTERNS) {
    if (safePattern.test(trimmed)) {
      return trimmed;
    }
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "An operational error occurred.";
    }
  }

  return trimmed;
}

export function isProtocolTimeout(error) {
  const message = error instanceof Error ? error.message : String(error);

  return PROTOCOL_TIMEOUT_PATTERNS.some((pattern) => pattern.test(message));
}

export function getErrorStep(error) {
  if (error instanceof StepError) {
    return error.step;
  }

  if (error && typeof error === "object" && typeof error.step === "string") {
    return error.step;
  }

  return null;
}
