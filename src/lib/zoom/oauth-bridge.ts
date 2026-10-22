/**
 * HTTPS → neud:// Zoom OAuth callback bridge helpers (web only).
 * Never performs token exchange. Never logs codes/tokens.
 */

export const ZOOM_OAUTH_HTTPS_CALLBACK_PATH = "/oauth/zoom/callback";
export const ZOOM_OAUTH_DESKTOP_DEEP_LINK_BASE = "neud://oauth/zoom/callback";

const ALLOWED_KEYS = ["code", "state", "error", "error_description"] as const;

export type ZoomBridgeOAuthParams = {
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
};

export function extractZoomBridgeParams(
  searchParams: URLSearchParams | { get(name: string): string | null },
): ZoomBridgeOAuthParams {
  return {
    code: searchParams.get("code"),
    state: searchParams.get("state"),
    error: searchParams.get("error"),
    errorDescription: searchParams.get("error_description"),
  };
}

/** Build neud:// deep link from allow-listed OAuth fields only. */
export function buildNeudZoomDeepLink(params: ZoomBridgeOAuthParams): string {
  const url = new URL(ZOOM_OAUTH_DESKTOP_DEEP_LINK_BASE);
  if (params.code) url.searchParams.set("code", params.code);
  if (params.state) url.searchParams.set("state", params.state);
  if (params.error) url.searchParams.set("error", params.error);
  if (params.errorDescription) {
    url.searchParams.set("error_description", params.errorDescription);
  }
  return url.toString();
}

const OAUTH_VALUE_MAX = 2048;

function safeOAuthValue(value: string | null): value is string {
  if (!value) return false;
  if (value.length > OAUTH_VALUE_MAX) return false;
  return !/[\u0000-\u001f\u007f]/.test(value);
}

/**
 * Deep link only for a complete Zoom callback: code+state, or error+state.
 * Incomplete callbacks return null so the page cannot open an arbitrary link.
 */
export function zoomBridgeLaunchLink(params: ZoomBridgeOAuthParams): string | null {
  if (!safeOAuthValue(params.state)) return null;
  const code = safeOAuthValue(params.code) ? params.code : null;
  const error = safeOAuthValue(params.error) ? params.error : null;
  if (code && error) return null;
  if (!code && !error) return null;
  const description =
    error && safeOAuthValue(params.errorDescription) && params.errorDescription.length <= 300
      ? params.errorDescription
      : null;
  const link = buildNeudZoomDeepLink({
    code,
    state: params.state,
    error,
    errorDescription: description,
  });
  if (!link.startsWith(`${ZOOM_OAUTH_DESKTOP_DEEP_LINK_BASE}?`)) return null;
  return link;
}

export type ZoomBridgePageState = "received" | "denied" | "invalid";

export function zoomBridgeOutcome(params: ZoomBridgeOAuthParams): ZoomBridgePageState {
  if (params.error === "access_denied") return "denied";
  if (params.code && params.state && !params.error) return "received";
  return "invalid";
}

export { ALLOWED_KEYS as ZOOM_BRIDGE_ALLOWED_QUERY_KEYS };
