import test from "node:test";
import assert from "node:assert/strict";

const LOCAL_API_ERROR_CODES = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  LOCAL_IDENTITY_UNAVAILABLE: "LOCAL_IDENTITY_UNAVAILABLE",
  ENGINE_INITIALIZATION_FAILED: "ENGINE_INITIALIZATION_FAILED",
};

class LocalApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "LocalApiError";
    this.status = status;
    this.code = code;
  }
}

function isLocalApiError(error) {
  return error instanceof LocalApiError;
}

test("LocalApiError carries status and code", () => {
  const error = new LocalApiError(
    "Sign in to your NEUD account to continue.",
    401,
    LOCAL_API_ERROR_CODES.AUTH_REQUIRED,
  );

  assert.equal(error.status, 401);
  assert.equal(error.code, LOCAL_API_ERROR_CODES.AUTH_REQUIRED);
  assert.equal(isLocalApiError(error), true);
  assert.equal(isLocalApiError(new Error("nope")), false);
});

test("local API error codes include expected auth states", () => {
  assert.equal(
    LOCAL_API_ERROR_CODES.LOCAL_IDENTITY_UNAVAILABLE,
    "LOCAL_IDENTITY_UNAVAILABLE",
  );
  assert.equal(
    LOCAL_API_ERROR_CODES.ENGINE_INITIALIZATION_FAILED,
    "ENGINE_INITIALIZATION_FAILED",
  );
});
