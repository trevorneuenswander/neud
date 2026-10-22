import crypto from "crypto";
import http from "http";
import type { AddressInfo } from "net";
import type { ServerResponse } from "http";
import { YOUTUBE_LIVE_CHAT_SCOPE } from "../../live-chat/providers/youtube-live-api.ts";
import {
  renderYouTubeCallbackPage,
  type YouTubeCallbackPage,
} from "./youtube-oauth-callback-page.ts";

export const YOUTUBE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const YOUTUBE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Abandoned browser flows are not detectable. This is the recovery deadline. */
export const YOUTUBE_OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

export type YouTubeOAuthFailureCode =
  | "cancelled"
  | "timed_out"
  | "denied"
  | "invalid"
  | "exchange_failed"
  | "revoked"
  | "invalid_client"
  | "redirect_mismatch"
  | "pkce_mismatch"
  | "code_reused"
  | "network";

/** Safe token-exchange report. Values of secrets and codes are never included. */
export type YouTubeOAuthDiagnostic = {
  oauthClientType: null;
  redirectUri: string | null;
  tokenEndpoint: string;
  httpStatus: number | null;
  googleError: string | null;
  googleErrorDescription: string | null;
  parameterNames: string[];
  pkceMethod: "S256";
};

export class YouTubeOAuthFlowError extends Error {
  readonly code: YouTubeOAuthFailureCode;
  readonly googleError: string | null;
  readonly httpStatus: number | null;
  readonly googleErrorDescription: string | null;
  readonly diagnostic: YouTubeOAuthDiagnostic | null;

  constructor(
    code: YouTubeOAuthFailureCode,
    message: string,
    googleError: string | null = null,
    diagnostic: YouTubeOAuthDiagnostic | null = null,
  ) {
    super(message);
    this.name = "YouTubeOAuthFlowError";
    this.code = code;
    this.googleError = googleError;
    this.httpStatus = diagnostic?.httpStatus ?? null;
    this.googleErrorDescription = diagnostic?.googleErrorDescription ?? null;
    this.diagnostic = diagnostic;
  }
}

export function sanitizeGoogleOAuthText(value: string, redactions: string[]): string {
  let text = value.replace(/[\r\n\t]+/g, " ").trim();
  if (text.length > 240) text = text.slice(0, 240);
  const secrets = redactions
    .map((item) => item.trim())
    .filter((item) => item.length >= 8)
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) {
    text = text.split(secret).join("[redacted]");
  }
  return text;
}

export function createYouTubePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createYouTubeOAuthState(): string {
  return crypto.randomBytes(16).toString("base64url");
}

export function buildYouTubeAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: YOUTUBE_LIVE_CHAT_SCOPE,
    access_type: "offline",
    prompt: "consent",
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    state: input.state,
  });
  return `${YOUTUBE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

/** Google Desktop loopback form is the origin only. A path is not an authorized redirect. */
export function youtubeLoopbackRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/** Query values keep "+" so an authorization code is not turned into a space. */
export function readOAuthQueryParam(url: URL, name: string): string {
  const raw = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (!raw) return "";
  for (const pair of raw.split("&")) {
    const index = pair.indexOf("=");
    const rawKey = index === -1 ? pair : pair.slice(0, index);
    const rawValue = index === -1 ? "" : pair.slice(index + 1);
    let key = rawKey;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, "%2B"));
    } catch {
      key = rawKey;
    }
    if (key !== name) continue;
    try {
      return decodeURIComponent(rawValue.replace(/\+/g, "%2B"));
    } catch {
      return rawValue;
    }
  }
  return "";
}

export function buildYouTubeAuthorizationCodeTokenBody(input: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientSecret?: string | null;
}): URLSearchParams {
  const body = new URLSearchParams({
    client_id: input.clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });
  const secret = input.clientSecret?.trim() ?? "";
  if (secret) body.set("client_secret", secret);
  return body;
}

export function youTubeTokenFailure(input: {
  status: number;
  body: unknown;
  grantType?: string;
  redirectUri?: string | null;
  parameterNames?: string[];
  redactions?: string[];
}): YouTubeOAuthFlowError | null {
  const record =
    input.body && typeof input.body === "object"
      ? (input.body as { error?: unknown; error_description?: unknown; access_token?: unknown })
      : null;
  const accessToken = typeof record?.access_token === "string" ? record.access_token : "";
  if (input.status >= 200 && input.status < 300 && accessToken) return null;
  const googleError = typeof record?.error === "string" ? record.error.trim() : "";
  const description =
    typeof record?.error_description === "string" ? record.error_description : "";
  return classifyGoogleTokenError(
    googleError || `http_${input.status || 0}`,
    description,
    {
      status: input.status,
      grantType: input.grantType ?? "authorization_code",
      redirectUri: input.redirectUri ?? null,
      parameterNames: input.parameterNames ?? [],
      redactions: input.redactions ?? [],
    },
  );
}

function classifyGoogleTokenError(
  googleError: string,
  description: string,
  context: {
    status: number;
    grantType: string;
    redirectUri: string | null;
    parameterNames: string[];
    redactions: string[];
  },
): YouTubeOAuthFlowError {
  const safeDescription = sanitizeGoogleOAuthText(description, context.redactions);
  const reportedError = googleError.startsWith("http_")
    ? null
    : googleError.replace(/[^a-z0-9_]/gi, "").slice(0, 40) || null;
  const diagnostic: YouTubeOAuthDiagnostic = {
    oauthClientType: null,
    redirectUri: context.redirectUri,
    tokenEndpoint: YOUTUBE_OAUTH_TOKEN_URL,
    httpStatus: context.status || null,
    googleError: reportedError,
    googleErrorDescription: safeDescription || null,
    parameterNames: context.parameterNames,
    pkceMethod: "S256",
  };
  const detail = `${googleError} ${safeDescription}`.toLowerCase();
  const fail = (
    code: YouTubeOAuthFailureCode,
    message: string,
    errorCode: string | null,
  ) =>
    new YouTubeOAuthFlowError(
      code,
      presentGoogleTokenFailure(message, diagnostic),
      errorCode,
      diagnostic,
    );
  if (googleError === "redirect_uri_mismatch" || /redirect_uri/.test(detail)) {
    return fail(
      "redirect_mismatch",
      "Google rejected the YouTube sign-in redirect (redirect_uri_mismatch).",
      "redirect_uri_mismatch",
    );
  }
  if (googleError === "invalid_client") {
    return fail(
      "invalid_client",
      "Google did not accept the OAuth client ID (invalid_client).",
      "invalid_client",
    );
  }
  if (context.grantType === "refresh_token" && googleError === "invalid_grant") {
    return fail(
      "revoked",
      "YouTube authorization was revoked. Connect the account again.",
      "invalid_grant",
    );
  }
  if (googleError === "invalid_grant" && /verifier|pkce|code_challenge|challenge/.test(detail)) {
    return fail(
      "pkce_mismatch",
      "The YouTube sign-in check did not match. Connect the account again.",
      "invalid_grant",
    );
  }
  if (googleError === "invalid_grant" && /revok/.test(detail)) {
    return fail(
      "revoked",
      "YouTube authorization was revoked. Connect the account again.",
      "invalid_grant",
    );
  }
  if (
    googleError === "invalid_grant" &&
    /expired|already|reused|redeemed|malformed|invalid code/.test(detail)
  ) {
    return fail(
      "code_reused",
      "That YouTube authorization code expired or was already used. Connect the account again.",
      "invalid_grant",
    );
  }
  if (googleError === "invalid_grant") {
    return fail(
      "code_reused",
      "Google rejected the YouTube authorization code. Connect the account again.",
      "invalid_grant",
    );
  }
  if (googleError === "invalid_request") {
    return fail(
      "exchange_failed",
      "Google rejected the YouTube token request (invalid_request).",
      "invalid_request",
    );
  }
  if (googleError.startsWith("http_")) {
    return fail("exchange_failed", "YouTube token exchange failed.", null);
  }
  return fail(
    "exchange_failed",
    `YouTube token exchange failed (${reportedError || "error"}).`,
    reportedError,
  );
}

function presentGoogleTokenFailure(message: string, diagnostic: YouTubeOAuthDiagnostic): string {
  const parts = [message];
  if (
    diagnostic.googleErrorDescription &&
    !message.includes(diagnostic.googleErrorDescription)
  ) {
    parts.push(diagnostic.googleErrorDescription);
  }
  if (diagnostic.httpStatus) parts.push(`HTTP ${diagnostic.httpStatus}.`);
  return parts.join(" ");
}

export type YouTubeTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAtMs: number;
};

export async function exchangeYouTubeAuthorizationCode(input: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientSecret?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<YouTubeTokenSet> {
  const body = buildYouTubeAuthorizationCodeTokenBody(input);
  return requestYouTubeToken(body, input.fetchImpl);
}

export async function refreshYouTubeAccessToken(input: {
  clientId: string;
  refreshToken: string;
  clientSecret?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<YouTubeTokenSet> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  });
  const secret = input.clientSecret?.trim() ?? "";
  if (secret) body.set("client_secret", secret);
  const tokens = await requestYouTubeToken(body, input.fetchImpl);
  return {
    ...tokens,
    refreshToken: tokens.refreshToken ?? input.refreshToken,
  };
}

async function requestYouTubeToken(
  body: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<YouTubeTokenSet> {
  let response: Response;
  try {
    response = await fetchImpl(YOUTUBE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    throw new YouTubeOAuthFlowError(
      "network",
      "NEUD could not reach Google to finish connecting YouTube.",
    );
  }
  const payload = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
      }
    | null;
  const redactions = [
    body.get("client_id"),
    body.get("code"),
    body.get("code_verifier"),
    body.get("client_secret"),
    body.get("refresh_token"),
  ].filter((value): value is string => Boolean(value));
  const failure = youTubeTokenFailure({
    status: response.status,
    body: payload,
    grantType: body.get("grant_type") ?? "",
    redirectUri: body.get("redirect_uri"),
    parameterNames: [...body.keys()],
    redactions,
  });
  if (failure || !payload?.access_token) {
    throw (
      failure ??
      new YouTubeOAuthFlowError("exchange_failed", "YouTube token exchange failed.")
    );
  }
  const expiresIn = Number(payload.expires_in);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAtMs: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
  };
}

export async function startYouTubeOAuthLoopback(input: {
  expectedState: string;
  timeoutMs?: number;
}): Promise<{
  redirectUri: string;
  result: Promise<{ code: string; finish(page: YouTubeCallbackPage): void }>;
  close(): void;
}> {
  const timeoutMs = input.timeoutMs ?? YOUTUBE_OAUTH_TIMEOUT_MS;
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const redirectUri = youtubeLoopbackRedirectUri(port);
  let resultSettled = false;
  let pageSent = false;
  const waiting: ServerResponse[] = [];
  let rejectResult: ((error: Error) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function sendPage(page: YouTubeCallbackPage) {
    if (pageSent) return;
    pageSent = true;
    if (timer) clearTimeout(timer);
    timer = null;
    const html = renderYouTubeCallbackPage(page);
    for (const response of waiting) {
      if (!response.writableEnded) {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end(html);
      }
    }
    waiting.length = 0;
    server.close();
  }

  function fail(error: YouTubeOAuthFlowError, page: YouTubeCallbackPage) {
    if (resultSettled) {
      sendPage(page);
      return;
    }
    resultSettled = true;
    sendPage(page);
    rejectResult?.(error);
  }

  const result = new Promise<{ code: string; finish(page: YouTubeCallbackPage): void }>(
    (resolve, reject) => {
      rejectResult = reject;
      timer = setTimeout(() => {
        fail(
          new YouTubeOAuthFlowError("timed_out", "YouTube authorization timed out."),
          { kind: "failed", message: "YouTube authorization timed out." },
        );
      }, timeoutMs);

      server.on("request", (request, response) => {
        const host = request.headers.host ?? "127.0.0.1";
        const url = new URL(request.url ?? "/", `http://${host}`);
        if (url.pathname !== "/" && url.pathname !== "") {
          response.writeHead(404, { "Cache-Control": "no-store" });
          response.end("Not found");
          return;
        }
        const state = readOAuthQueryParam(url, "state");
        const code = readOAuthQueryParam(url, "code");
        const oauthError = readOAuthQueryParam(url, "error");
        if (!code && !oauthError) {
          response.writeHead(404, { "Cache-Control": "no-store" });
          response.end("Not found");
          return;
        }
        waiting.push(response);
        if (resultSettled) return;
        resultSettled = true;
        if (oauthError === "access_denied") {
          sendPage({ kind: "cancelled" });
          reject(new YouTubeOAuthFlowError("denied", "YouTube authorization was denied."));
          return;
        }
        if (oauthError) {
          sendPage({ kind: "cancelled" });
          reject(new YouTubeOAuthFlowError("cancelled", "YouTube authorization was cancelled."));
          return;
        }
        if (!code || state !== input.expectedState) {
          sendPage({
            kind: "failed",
            message: "YouTube authorization response was invalid.",
          });
          reject(
            new YouTubeOAuthFlowError("invalid", "YouTube authorization response was invalid."),
          );
          return;
        }
        if (timer) clearTimeout(timer);
        timer = null;
        resolve({
          code,
          finish(page) {
            sendPage(page);
          },
        });
      });
    },
  );

  return {
    redirectUri,
    result,
    close() {
      fail(
        new YouTubeOAuthFlowError("cancelled", "YouTube authorization was cancelled."),
        { kind: "cancelled" },
      );
    },
  };
}
