/**
 * Parse and validate Zoom OAuth deep links: neud://oauth/zoom/callback
 */

import {
  ZOOM_OAUTH_CALLBACK_PATH,
  ZOOM_OAUTH_DESKTOP_PROTOCOL,
} from "./zoom-oauth-redirect";

export type ZoomDeepLinkParseResult =
  | {
      ok: true;
      code: string | null;
      state: string | null;
      error: string | null;
      errorDescription: string | null;
    }
  | { ok: false; reason: "invalid_scheme" | "invalid_host_path" | "malformed" };

const ALLOWED_QUERY_KEYS = new Set([
  "code",
  "state",
  "error",
  "error_description",
]);

export function isNeudProtocolUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith(`${ZOOM_OAUTH_DESKTOP_PROTOCOL}:`);
}

export function parseZoomOAuthDeepLink(url: string): ZoomDeepLinkParseResult {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (protocol !== ZOOM_OAUTH_DESKTOP_PROTOCOL) {
    return { ok: false, reason: "invalid_scheme" };
  }

  // neud://oauth/zoom/callback → host=oauth, pathname=/zoom/callback
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  if (host !== "oauth" || path !== "/zoom/callback") {
    // Also accept pathname that equals full callback path if host empty (some parsers).
    if (!(host === "" && path === ZOOM_OAUTH_CALLBACK_PATH)) {
      return { ok: false, reason: "invalid_host_path" };
    }
  }

  const code = parsed.searchParams.get("code");
  const state = parsed.searchParams.get("state");
  const error = parsed.searchParams.get("error");
  const errorDescription = parsed.searchParams.get("error_description");

  // Only forward allow-listed fields (ignore unexpected params).
  void ALLOWED_QUERY_KEYS;

  return {
    ok: true,
    code,
    state,
    error,
    errorDescription,
  };
}

/** Build deep-link URL from allow-listed OAuth fields only. */
export function buildZoomOAuthDeepLink(input: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  errorDescription?: string | null;
}): string {
  const url = new URL(`neud://oauth${ZOOM_OAUTH_CALLBACK_PATH}`);
  if (input.code) url.searchParams.set("code", input.code);
  if (input.state) url.searchParams.set("state", input.state);
  if (input.error) url.searchParams.set("error", input.error);
  if (input.errorDescription) {
    url.searchParams.set("error_description", input.errorDescription);
  }
  return url.toString();
}
