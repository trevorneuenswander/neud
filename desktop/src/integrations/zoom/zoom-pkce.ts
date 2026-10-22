import { createHash, randomBytes } from "crypto";
import {
  getZoomOAuthMarketplaceRedirectUri,
  ZOOM_OAUTH_DEVELOPMENT_MARKETPLACE_REDIRECT_URI,
} from "./zoom-oauth-redirect";

export {
  getZoomOAuthMarketplaceRedirectUri,
  getZoomOAuthRedirectUri,
  zoomLoopbackRedirectUri,
  ZOOM_OAUTH_CALLBACK_PATH,
  ZOOM_OAUTH_DEVELOPMENT_MARKETPLACE_REDIRECT_URI,
  ZOOM_OAUTH_LOOPBACK_HOST,
  ZOOM_OAUTH_PRODUCTION_REDIRECT_URI,
} from "./zoom-oauth-redirect";

/** @deprecated Prefer ephemeral bind; kept only as a documentation example. */
export const ZOOM_OAUTH_LOOPBACK_PORT = 18765;

/** @deprecated Use ZOOM_OAUTH_DEVELOPMENT_MARKETPLACE_REDIRECT_URI. */
export const ZOOM_OAUTH_MARKETPLACE_REDIRECT_URI =
  ZOOM_OAUTH_DEVELOPMENT_MARKETPLACE_REDIRECT_URI;

export const ZOOM_OAUTH_AUTHORIZE_URL = "https://zoom.us/oauth/authorize";
export const ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token";
export const ZOOM_OAUTH_TIMEOUT_MS = 5 * 60_000;

/** @deprecated Use getZoomOAuthMarketplaceRedirectUri(mode). */
export function zoomOAuthRedirectUri(): string {
  return getZoomOAuthMarketplaceRedirectUri("development");
}

/** RFC 7636: 43–128 characters from unreserved charset. */
export function generateCodeVerifier(byteLength = 32): string {
  const size = Math.max(32, Math.min(96, byteLength));
  return base64UrlEncode(randomBytes(size));
}

export function createCodeChallengeS256(codeVerifier: string): string {
  const digest = createHash("sha256").update(codeVerifier, "ascii").digest();
  return base64UrlEncode(digest);
}

export function generateOAuthState(): string {
  return randomBytes(16).toString("hex");
}

export function buildZoomAuthorizeUrl(input: {
  publicClientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const authorize = new URL(ZOOM_OAUTH_AUTHORIZE_URL);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", input.publicClientId);
  authorize.searchParams.set("redirect_uri", input.redirectUri);
  authorize.searchParams.set("state", input.state);
  authorize.searchParams.set("code_challenge", input.codeChallenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  return authorize.toString();
}

/** Public Client token exchange — body only, no Authorization header / secret. */
export function buildZoomAuthorizationCodeTokenBody(input: {
  code: string;
  redirectUri: string;
  publicClientId: string;
  codeVerifier: string;
}): URLSearchParams {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.publicClientId,
    code_verifier: input.codeVerifier,
  });
}

/** Public Client refresh — body only with client_id, no Authorization header / secret. */
export function buildZoomRefreshTokenBody(input: {
  refreshToken: string;
  publicClientId: string;
}): URLSearchParams {
  return new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.publicClientId,
  });
}

export type ZoomOAuthCallbackEvaluation =
  | { ok: true; code: string }
  | {
      ok: false;
      reason:
        | "denied"
        | "state_mismatch"
        | "missing_code"
        | "missing_state"
        | "no_pending";
      error?: string | null;
    };

export function evaluateZoomOAuthCallback(input: {
  expectedState: string | null;
  code: string | null;
  state: string | null;
  error: string | null;
}): ZoomOAuthCallbackEvaluation {
  if (!input.expectedState) {
    return { ok: false, reason: "no_pending" };
  }
  if (input.error) {
    return { ok: false, reason: "denied", error: input.error };
  }
  if (!input.state) {
    return { ok: false, reason: "missing_state" };
  }
  if (input.state !== input.expectedState) {
    return { ok: false, reason: "state_mismatch" };
  }
  if (!input.code) {
    return { ok: false, reason: "missing_code" };
  }
  return { ok: true, code: input.code };
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
