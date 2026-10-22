export const LOCAL_API_ERROR_CODES = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  LOCAL_IDENTITY_UNAVAILABLE: "LOCAL_IDENTITY_UNAVAILABLE",
  ENGINE_INITIALIZATION_FAILED: "ENGINE_INITIALIZATION_FAILED",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  SAFE_STORAGE_UNAVAILABLE: "SAFE_STORAGE_UNAVAILABLE",
  SECURE_CREDENTIAL_WRITE_FAILED: "SECURE_CREDENTIAL_WRITE_FAILED",
  ZOOM_CREDENTIAL_VALIDATION: "ZOOM_CREDENTIAL_VALIDATION",
  LOCAL_API_UNREACHABLE: "LOCAL_API_UNREACHABLE",
  LOCAL_API_HTTP_ERROR: "LOCAL_API_HTTP_ERROR",
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
