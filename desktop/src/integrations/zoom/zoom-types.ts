/**
 * Zoom Live Chat integration — General App / user-managed OAuth + RTMS.
 *
 * Auth model:
 * - Development: Public Client ID + PKCE + ephemeral 127.0.0.1 loopback
 * - Production/Beta: Public Client ID + PKCE + https://neud.io/oauth/zoom/callback → neud://
 * - No Client Secret; token exchange stays on the desktop
 * - Chat path: Zoom RTMS MEDIA_DATA_CHAT for public/everyone meeting & webinar chat
 *
 * Tokens never enter project packages, display HTML, localStorage, or logs.
 */

export type { ZoomOAuthMode } from "./zoom-oauth-redirect";

export {
  ZOOM_OAUTH_AUTHORIZE_URL,
  ZOOM_OAUTH_CALLBACK_PATH,
  ZOOM_OAUTH_LOOPBACK_HOST,
  ZOOM_OAUTH_LOOPBACK_PORT,
  ZOOM_OAUTH_MARKETPLACE_REDIRECT_URI,
  ZOOM_OAUTH_PRODUCTION_REDIRECT_URI,
  ZOOM_OAUTH_TIMEOUT_MS,
  ZOOM_OAUTH_TOKEN_URL,
  getZoomOAuthMarketplaceRedirectUri,
  getZoomOAuthRedirectUri,
  zoomLoopbackRedirectUri,
  zoomOAuthRedirectUri,
} from "./zoom-pkce";

export type ZoomSourceMode = "meeting" | "webinar";

/** Operator-facing / public auth state for Live Chat Zoom. */
export type ZoomAuthState =
  | "not_configured"
  | "app_configured"
  | "connecting"
  | "connected"
  | "expired"
  | "error"
  | "rtms_unavailable";

/** Machine-level Zoom Public Client OAuth configuration. */
export type ZoomAppCredentials = {
  oauthMode: import("./zoom-oauth-redirect").ZoomOAuthMode;
  developmentPublicClientId: string;
  productionPublicClientId: string;
};

export type ZoomOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  scope?: string | null;
  tokenType?: string | null;
};

export type ZoomUserProfile = {
  id: string;
  displayName: string;
  email?: string | null;
  accountId?: string | null;
};

export type ZoomPublicConfigStatus = {
  /** Active-mode Public Client ID present on this machine. */
  appConfigured: boolean;
  /** User OAuth session present (may still be expired). */
  userConnected: boolean;
  authState: ZoomAuthState;
  connectedAs: string | null;
  publicClientIdMasked: string | null;
  /** @deprecated Alias of publicClientIdMasked. */
  clientIdMasked: string | null;
  oauthMode: import("./zoom-oauth-redirect").ZoomOAuthMode;
  developmentConfigured: boolean;
  productionConfigured: boolean;
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
  friendlyMessage: string;
  mechanism: "zoom-rtms-general-oauth-pkce";
  /**
   * Canonical redirect URI for the active mode (Marketplace / authorize guidance).
   * Development shows loopback pattern; Production shows https://neud.io/... .
   */
  oauthRedirectUri: string;
  /** @deprecated Always null — Account ID removed from RTMS auth model. */
  accountIdMasked: null;
  /** Compatibility alias: true when userConnected. */
  configured: boolean;
};

export type ZoomFriendlyErrorCode =
  | "AUTH_NOT_CONFIGURED"
  | "APP_CREDENTIALS_REQUIRED"
  | "AUTH_EXPIRED"
  | "AUTH_INVALID"
  | "AUTH_TIMEOUT"
  | "AUTH_DENIED"
  | "MEETING_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "RTMS_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export const ZOOM_FRIENDLY_MESSAGES: Record<ZoomFriendlyErrorCode, string> = {
  AUTH_NOT_CONFIGURED: "Zoom is not connected",
  APP_CREDENTIALS_REQUIRED: "Zoom Public Client ID required",
  AUTH_EXPIRED: "Zoom authentication expired",
  AUTH_INVALID: "Zoom authorization failure",
  AUTH_TIMEOUT: "Zoom authorization timed out",
  AUTH_DENIED: "Zoom authorization was denied",
  MEETING_NOT_FOUND: "The Zoom meeting could not be found.",
  PERMISSION_DENIED:
    "This Zoom account does not have permission to access that meeting.",
  RTMS_UNAVAILABLE: "RTMS unavailable for this account",
  NETWORK_ERROR: "Connection error",
  UNKNOWN: "Connection error",
};

/** Operator-facing labels for ZoomAuthState (primary Live Chat UX). */
export const ZOOM_AUTH_STATE_LABELS: Record<ZoomAuthState, string> = {
  not_configured: "Zoom is not connected",
  app_configured: "Zoom is not connected",
  connecting: "Connecting to Zoom",
  connected: "Zoom connected",
  expired: "Zoom authentication expired",
  error: "Connection error",
  rtms_unavailable: "RTMS unavailable for this account",
};

export function mapZoomErrorCode(input: {
  httpStatus?: number | null;
  code?: string | null;
  message?: string | null;
}): ZoomFriendlyErrorCode {
  const code = (input.code ?? "").toLowerCase();
  const message = (input.message ?? "").toLowerCase();
  if (
    code.includes("app_credentials") ||
    message.includes("public client id") ||
    message.includes("developer setup")
  ) {
    return "APP_CREDENTIALS_REQUIRED";
  }
  if (
    message.includes("token exchange") ||
    message.includes("token refresh") ||
    message.includes("refresh failed")
  ) {
    return message.includes("refresh") ? "AUTH_EXPIRED" : "AUTH_INVALID";
  }
  if (
    code.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("authorization timed out")
  ) {
    return "AUTH_TIMEOUT";
  }
  if (
    code.includes("not_configured") ||
    message.includes("not configured") ||
    message.includes("not connected")
  ) {
    return "AUTH_NOT_CONFIGURED";
  }
  if (
    input.httpStatus === 401 ||
    code.includes("expired") ||
    message.includes("expired")
  ) {
    return "AUTH_EXPIRED";
  }
  if (
    input.httpStatus === 403 ||
    code.includes("permission") ||
    message.includes("permission") ||
    message.includes("forbidden")
  ) {
    return "PERMISSION_DENIED";
  }
  if (
    code === "access_denied" ||
    code.includes("auth_denied") ||
    message.includes("access_denied") ||
    message.includes("authorization was denied") ||
    message.includes("authorization denied")
  ) {
    return "AUTH_DENIED";
  }
  if (
    input.httpStatus === 404 ||
    code.includes("not_found") ||
    message.includes("not found") ||
    message.includes("does not exist")
  ) {
    return "MEETING_NOT_FOUND";
  }
  if (
    code.includes("rtms") ||
    message.includes("rtms") ||
    message.includes("realtime media")
  ) {
    return "RTMS_UNAVAILABLE";
  }
  if (
    code.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("enotfound") ||
    message.includes("econnrefused")
  ) {
    return "NETWORK_ERROR";
  }
  if (
    input.httpStatus === 400 ||
    code.includes("invalid") ||
    message.includes("invalid client")
  ) {
    return "AUTH_INVALID";
  }
  return "UNKNOWN";
}

export function friendlyZoomMessage(code: ZoomFriendlyErrorCode): string {
  return ZOOM_FRIENDLY_MESSAGES[code];
}

export function maskSecret(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}
