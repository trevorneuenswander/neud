/**
 * Canonical Zoom OAuth redirect URI resolver.
 * Authorize URL and token exchange MUST use the same resolved value.
 */

export type ZoomOAuthMode = "development" | "production";

export const ZOOM_OAUTH_CALLBACK_PATH = "/oauth/zoom/callback";
export const ZOOM_OAUTH_LOOPBACK_HOST = "127.0.0.1";
export const ZOOM_OAUTH_PRODUCTION_ORIGIN = "https://neud.io";
export const ZOOM_OAUTH_PRODUCTION_REDIRECT_URI = `${ZOOM_OAUTH_PRODUCTION_ORIGIN}${ZOOM_OAUTH_CALLBACK_PATH}`;
/** Marketplace registration pattern for Development (Zoom ignores port for loopback). */
export const ZOOM_OAUTH_DEVELOPMENT_MARKETPLACE_REDIRECT_URI = `http://${ZOOM_OAUTH_LOOPBACK_HOST}${ZOOM_OAUTH_CALLBACK_PATH}`;
export const ZOOM_OAUTH_DESKTOP_PROTOCOL = "neud";
export const ZOOM_OAUTH_DESKTOP_CALLBACK_URL = `${ZOOM_OAUTH_DESKTOP_PROTOCOL}://oauth${ZOOM_OAUTH_CALLBACK_PATH}`;

export function normalizeZoomOAuthMode(
  value: string | null | undefined,
): ZoomOAuthMode {
  return value === "production" ? "production" : "development";
}

export function zoomLoopbackRedirectUri(port: number): string {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("Invalid OAuth loopback port.");
  }
  return `http://${ZOOM_OAUTH_LOOPBACK_HOST}:${port}${ZOOM_OAUTH_CALLBACK_PATH}`;
}

/**
 * Resolve the OAuth redirect_uri for authorize + token exchange.
 * Development requires the actual ephemeral loopback port.
 * Production always uses the HTTPS bridge on neud.io.
 */
export function getZoomOAuthRedirectUri(input: {
  mode: ZoomOAuthMode;
  loopbackPort?: number | null;
}): string {
  if (input.mode === "production") {
    return ZOOM_OAUTH_PRODUCTION_REDIRECT_URI;
  }
  if (input.loopbackPort == null) {
    throw new Error(
      "Development Zoom OAuth requires an ephemeral loopback port.",
    );
  }
  return zoomLoopbackRedirectUri(input.loopbackPort);
}

/** Value shown in Developer Setup / Marketplace guidance (no ephemeral port). */
export function getZoomOAuthMarketplaceRedirectUri(mode: ZoomOAuthMode): string {
  return mode === "production"
    ? ZOOM_OAUTH_PRODUCTION_REDIRECT_URI
    : ZOOM_OAUTH_DEVELOPMENT_MARKETPLACE_REDIRECT_URI;
}
