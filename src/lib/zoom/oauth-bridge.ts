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

export function zoomBridgeOutcome(
  params: ZoomBridgeOAuthParams,
): "success" | "error" | "empty" {
  if (params.error) return "error";
  if (params.code && params.state) return "success";
  if (params.code || params.state) return "error";
  return "empty";
}

export { ALLOWED_KEYS as ZOOM_BRIDGE_ALLOWED_QUERY_KEYS };
