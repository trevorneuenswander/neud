export type CloudSessionRefreshCode =
  | "no_tokens"
  | "still_fresh"
  | "refreshed"
  | "network_error"
  | "invalid_refresh_token"
  | "refresh_token_not_found"
  | "refresh_failed"
  | "set_session_failed"
  | "refresh_response_invalid"
  | "bad_supabase_config";

export type CloudSessionRefreshErrorCategory =
  | "invalid_refresh_token"
  | "refresh_token_not_found"
  | "access_token_expired"
  | "network_error"
  | "bad_supabase_config"
  | "set_session_failed"
  | "malformed_persisted_session"
  | "token_expiry_parse_error"
  | "refresh_response_invalid"
  | "concurrent_refresh_conflict"
  | "stale_refresh_token_overwrite"
  | "unknown";

export type CloudSessionRefreshResult = {
  ok: boolean;
  code: CloudSessionRefreshCode;
  message?: string;
  errorCategory?: CloudSessionRefreshErrorCategory;
};

export function classifyRefreshFailure(error: {
  message?: string;
  status?: number;
  name?: string;
}): CloudSessionRefreshCode {
  const message = (error.message ?? "").toLowerCase();
  const status = error.status ?? 0;

  if (
    status === 401 ||
    status === 403 ||
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    message.includes("session not found") ||
    (message.includes("jwt expired") && message.includes("refresh"))
  ) {
    return "invalid_refresh_token";
  }

  if (message.includes("refresh token not found")) {
    return "refresh_token_not_found";
  }

  if (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    error.name === "AuthRetryableFetchError"
  ) {
    return "network_error";
  }

  return "refresh_failed";
}

export function refreshCodeToErrorCategory(
  code: CloudSessionRefreshCode,
): CloudSessionRefreshErrorCategory {
  switch (code) {
    case "invalid_refresh_token":
      return "invalid_refresh_token";
    case "refresh_token_not_found":
      return "refresh_token_not_found";
    case "network_error":
      return "network_error";
    case "set_session_failed":
      return "set_session_failed";
    case "refresh_response_invalid":
      return "refresh_response_invalid";
    case "bad_supabase_config":
      return "bad_supabase_config";
    default:
      return "unknown";
  }
}
