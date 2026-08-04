export const LOCAL_API_ERROR_CODES = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  LOCAL_IDENTITY_UNAVAILABLE: "LOCAL_IDENTITY_UNAVAILABLE",
  ENGINE_INITIALIZATION_FAILED: "ENGINE_INITIALIZATION_FAILED",
} as const;

export type LocalApiErrorCode =
  (typeof LOCAL_API_ERROR_CODES)[keyof typeof LOCAL_API_ERROR_CODES];

export class LocalApiError extends Error {
  readonly status: number;
  readonly code?: LocalApiErrorCode;

  constructor(message: string, status: number, code?: LocalApiErrorCode) {
    super(message);
    this.name = "LocalApiError";
    this.status = status;
    this.code = code;
  }
}

export function isLocalApiError(error: unknown): error is LocalApiError {
  return error instanceof LocalApiError;
}
