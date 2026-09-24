export type CloudSessionRefreshCode =
  | "no_tokens"
  | "no_refresh_token"
  | "still_fresh"
  | "refreshed"
  | "network_error"
  | "invalid_refresh_token"
  | "refresh_token_not_found"
  | "refresh_token_reused"
  | "refresh_token_expired"
  | "refresh_rate_limited"
  | "refresh_server_failed"
  | "refresh_failed"
  | "set_session_failed"
  | "refresh_response_invalid"
  | "bad_supabase_config"
  | "project_ref_mismatch";

export type RefreshErrorCategory =
  | "refresh_token_invalid"
  | "refresh_token_reused"
  | "refresh_token_expired"
  | "refresh_network_failed"
  | "refresh_rate_limited"
  | "refresh_server_failed"
  | "refresh_response_invalid"
  | "refresh_persist_failed"
  | "refresh_client_init_failed"
  | "project_ref_mismatch"
  | "bad_supabase_config"
  | "unknown_refresh_failure";

export type FirstRefreshFailureStage =
  | "no_refresh_token"
  | "refresh_request_not_sent"
  | "dns_failure"
  | "network_failure"
  | "tls_failure"
  | "http_400"
  | "http_401"
  | "http_403"
  | "http_429"
  | "http_5xx"
  | "auth_invalid_refresh_token"
  | "auth_session_missing"
  | "response_parse_failed"
  | "session_persist_failed"
  | "authenticated_client_creation_failed"
  | "project_ref_mismatch"
  | "none";

export type CloudSessionRefreshResult = {
  ok: boolean;
  code: CloudSessionRefreshCode;
  message?: string;
  errorCategory?: RefreshErrorCategory;
  httpStatus?: number | null;
  supabaseErrorCode?: string | null;
  supabaseErrorName?: string | null;
  safeMessage?: string | null;
  firstFailureStage?: FirstRefreshFailureStage;
};

export type ExtractedSupabaseAuthError = {
  message: string;
  status: number | null;
  code: string | null;
  name: string | null;
};

export function extractSupabaseAuthError(error: unknown): ExtractedSupabaseAuthError {
  if (!error || typeof error !== "object") {
    return {
      message: error == null ? "" : String(error),
      status: null,
      code: null,
      name: null,
    };
  }

  const record = error as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : String(error);
  const status =
    typeof record.status === "number"
      ? record.status
      : typeof record.statusCode === "number"
        ? record.statusCode
        : null;
  const code = typeof record.code === "string" ? record.code : null;
  const name = typeof record.name === "string" ? record.name : null;
  return { message, status, code, name };
}

export function sanitizeRefreshSafeMessage(message: string): string {
  return message
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[jwt]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 240);
}

export function classifyRefreshFailure(error: unknown): CloudSessionRefreshCode {
  const extracted = extractSupabaseAuthError(error);
  const message = extracted.message.toLowerCase();
  const status = extracted.status ?? 0;
  const code = (extracted.code ?? "").toLowerCase();

  if (
    code === "invalid_refresh_token" ||
    code === "refresh_token_not_found" ||
    code === "session_not_found" ||
    code === "invalid_grant" ||
    status === 401 ||
    status === 403 ||
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    message.includes("session not found") ||
    (message.includes("jwt expired") && message.includes("refresh"))
  ) {
    return "invalid_refresh_token";
  }

  if (code === "refresh_token_already_used" || message.includes("refresh token already used")) {
    return "refresh_token_reused";
  }

  if (code === "refresh_token_expired" || message.includes("refresh token expired")) {
    return "refresh_token_expired";
  }

  if (status === 429 || code === "over_request_rate_limit") {
    return "refresh_rate_limited";
  }

  if (status >= 500) {
    return "refresh_server_failed";
  }

  if (status === 400) {
    return "refresh_failed";
  }

  if (
    message.includes("native websocket not found") ||
    message.includes("websocket not supported")
  ) {
    return "refresh_failed";
  }

  if (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("cert") ||
    message.includes("tls") ||
    extracted.name === "AuthRetryableFetchError"
  ) {
    if (message.includes("enotfound") || message.includes("getaddrinfo")) {
      return "network_error";
    }
    return "network_error";
  }

  return "refresh_failed";
}

export function refreshCodeToErrorCategory(
  code: CloudSessionRefreshCode,
): RefreshErrorCategory {
  switch (code) {
    case "invalid_refresh_token":
    case "refresh_token_not_found":
      return "refresh_token_invalid";
    case "refresh_token_reused":
      return "refresh_token_reused";
    case "refresh_token_expired":
      return "refresh_token_expired";
    case "network_error":
      return "refresh_network_failed";
    case "refresh_rate_limited":
      return "refresh_rate_limited";
    case "refresh_server_failed":
      return "refresh_server_failed";
    case "set_session_failed":
      return "refresh_client_init_failed";
    case "refresh_response_invalid":
      return "refresh_response_invalid";
    case "bad_supabase_config":
      return "bad_supabase_config";
    case "project_ref_mismatch":
      return "project_ref_mismatch";
    case "no_refresh_token":
    case "no_tokens":
      return "refresh_token_invalid";
    default:
      return "unknown_refresh_failure";
  }
}

export function isTransientRefreshCode(code: CloudSessionRefreshCode): boolean {
  return (
    code === "network_error" ||
    code === "refresh_rate_limited" ||
    code === "refresh_server_failed" ||
    code === "refresh_failed"
  );
}

export function resolveFirstRefreshFailureStage(input: {
  refreshTokenPresent: boolean;
  refreshHttpAttempted: boolean;
  httpStatus: number | null;
  refreshCode: CloudSessionRefreshCode;
  responseContainedSession: boolean;
  sessionPersisted: boolean;
  authenticatedClientReady: boolean;
  projectRefMismatch: boolean;
}): FirstRefreshFailureStage {
  if (input.projectRefMismatch) {
    return "project_ref_mismatch";
  }
  if (!input.refreshTokenPresent) {
    return "no_refresh_token";
  }
  if (!input.refreshHttpAttempted) {
    return "refresh_request_not_sent";
  }
  if (input.httpStatus === 429) {
    return "http_429";
  }
  if (input.httpStatus != null && input.httpStatus >= 500) {
    return "http_5xx";
  }
  if (input.httpStatus === 401) {
    return "http_401";
  }
  if (input.httpStatus === 403) {
    return "http_403";
  }
  if (input.httpStatus === 400) {
    return "http_400";
  }
  switch (input.refreshCode) {
    case "network_error":
      return "network_failure";
    case "invalid_refresh_token":
    case "refresh_token_not_found":
    case "refresh_token_reused":
    case "refresh_token_expired":
      return "auth_invalid_refresh_token";
    case "refresh_response_invalid":
      return input.responseContainedSession ? "response_parse_failed" : "auth_session_missing";
    case "bad_supabase_config":
      return "refresh_request_not_sent";
    case "set_session_failed":
      return "authenticated_client_creation_failed";
    default:
      break;
  }
  if (!input.sessionPersisted && input.refreshCode === "refreshed") {
    return "session_persist_failed";
  }
  if (!input.authenticatedClientReady && input.refreshCode === "refreshed") {
    return "authenticated_client_creation_failed";
  }
  return input.refreshCode === "refreshed" || input.refreshCode === "still_fresh"
    ? "none"
    : "network_failure";
}
