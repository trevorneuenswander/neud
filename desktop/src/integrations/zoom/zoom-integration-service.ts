import http from "http";
import type { AddressInfo } from "net";
import { shell } from "electron";
import type { AppPaths } from "../../services/app-paths";
import { renderZoomLoopbackPage } from "./zoom-oauth-callback-page";
import { ZoomCredentialStore } from "./zoom-credential-store";
import { ZoomTokenStore } from "./zoom-token-store";
import type {
  ZoomAppCredentials,
  ZoomAuthState,
  ZoomFriendlyErrorCode,
  ZoomOAuthTokens,
  ZoomPublicConfigStatus,
  ZoomSourceMode,
  ZoomUserProfile,
} from "./zoom-types";
import {
  ZOOM_AUTH_STATE_LABELS,
  ZOOM_OAUTH_CALLBACK_PATH,
  ZOOM_OAUTH_TIMEOUT_MS,
  ZOOM_OAUTH_TOKEN_URL,
  friendlyZoomMessage,
  getZoomOAuthMarketplaceRedirectUri,
  getZoomOAuthRedirectUri,
  mapZoomErrorCode,
} from "./zoom-types";
import type { ZoomOAuthMode } from "./zoom-types";
import {
  buildZoomAuthorizationCodeTokenBody,
  buildZoomAuthorizeUrl,
  buildZoomRefreshTokenBody,
  createCodeChallengeS256,
  evaluateZoomOAuthCallback,
  generateCodeVerifier,
  generateOAuthState,
} from "./zoom-pkce";
import { parseZoomOAuthDeepLink } from "./zoom-deep-link";

export type ZoomMeetingLookupResult =
  | { ok: true; id: string; topic: string; sourceMode: ZoomSourceMode }
  | {
      ok: false;
      errorCode: ZoomFriendlyErrorCode;
      technical: string;
    };

type PendingOAuthSession = {
  state: string;
  codeVerifier: string;
  /** Exact redirect_uri used for authorize + token exchange. */
  redirectUri: string;
  mode: ZoomOAuthMode;
  port: number | null;
};

/**
 * App-level Zoom connector for Live Chat RTMS.
 * General App credentials + user OAuth (Authorization Code + PKCE) via Electron safeStorage.
 */
export class ZoomIntegrationService {
  private readonly credentials: ZoomCredentialStore;
  private readonly tokens: ZoomTokenStore;
  private lastError: string | null = null;
  private lastErrorCode: ZoomFriendlyErrorCode | null = null;
  private pendingOAuth: PendingOAuthSession | null = null;
  private oauthServer: http.Server | null = null;
  private oauthTimeout: NodeJS.Timeout | null = null;
  private oauthInProgress = false;

  constructor(private readonly paths: AppPaths) {
    this.credentials = new ZoomCredentialStore(paths);
    this.tokens = new ZoomTokenStore(paths);
  }

  getCredentialStore(): ZoomCredentialStore {
    return this.credentials;
  }

  getPublicStatus(): ZoomPublicConfigStatus {
    const appMeta = this.credentials.getPublicMeta();
    const userMeta = this.tokens.getPublicMeta();
    const authState = this.resolveAuthState(appMeta.configured, userMeta);
    const friendly = this.friendlyForState(authState);

    return {
      appConfigured: appMeta.configured,
      userConnected: userMeta.userConnected,
      configured: userMeta.userConnected,
      authState,
      connectedAs: userMeta.connectedAs,
      publicClientIdMasked: appMeta.publicClientIdMasked,
      clientIdMasked: appMeta.clientIdMasked,
      oauthMode: appMeta.oauthMode,
      developmentConfigured: appMeta.developmentConfigured,
      productionConfigured: appMeta.productionConfigured,
      accountIdMasked: null,
      lastValidatedAt: appMeta.lastValidatedAt ?? userMeta.connectedAt,
      lastErrorCode: this.lastErrorCode,
      lastError: this.lastError,
      friendlyMessage: friendly,
      mechanism: "zoom-rtms-general-oauth-pkce",
      oauthRedirectUri: getZoomOAuthMarketplaceRedirectUri(appMeta.oauthMode),
    };
  }

  private resolveAuthState(
    appConfigured: boolean,
    userMeta: {
      userConnected: boolean;
      expiresAtMs: number | null;
    },
  ): ZoomAuthState {
    if (this.oauthInProgress) return "connecting";
    if (!appConfigured && !userMeta.userConnected) return "not_configured";
    if (!appConfigured) return "error";
    if (!userMeta.userConnected) return "app_configured";
    if (this.lastAuthIsExpired()) return "expired";
    if (this.lastErrorCode === "RTMS_UNAVAILABLE") return "rtms_unavailable";
    if (this.lastErrorCode && this.lastAuthIsError()) return "error";
    return "connected";
  }

  private lastAuthIsExpired(): boolean {
    return this.lastErrorCode === "AUTH_EXPIRED";
  }

  private lastAuthIsError(): boolean {
    return (
      this.lastErrorCode === "AUTH_INVALID" ||
      this.lastErrorCode === "AUTH_DENIED" ||
      this.lastErrorCode === "AUTH_TIMEOUT" ||
      this.lastErrorCode === "NETWORK_ERROR" ||
      this.lastErrorCode === "UNKNOWN" ||
      this.lastErrorCode === "APP_CREDENTIALS_REQUIRED"
    );
  }

  private friendlyForState(authState: ZoomAuthState): string {
    if (authState === "error" && this.lastErrorCode) {
      return friendlyZoomMessage(this.lastErrorCode);
    }
    return ZOOM_AUTH_STATE_LABELS[authState] ?? "Zoom is not connected";
  }

  /** Developer Setup: save Zoom Public Client ID(s) + OAuth mode. */
  saveAppCredentials(
    input: Partial<ZoomAppCredentials> & {
      publicClientId?: string;
    },
  ): ZoomPublicConfigStatus {
    this.credentials.save(input);
    this.lastError = null;
    this.lastErrorCode = null;
    return this.getPublicStatus();
  }

  /** @deprecated Use saveAppCredentials. */
  saveCredentials(input: {
    publicClientId?: string;
    clientId?: string;
    oauthMode?: ZoomOAuthMode;
  }): ZoomPublicConfigStatus {
    return this.saveAppCredentials({
      oauthMode: input.oauthMode,
      developmentPublicClientId:
        input.publicClientId || String(input.clientId ?? ""),
    });
  }

  clearAppCredentials(): ZoomPublicConfigStatus {
    this.credentials.clear();
    this.lastError = null;
    this.lastErrorCode = null;
    return this.getPublicStatus();
  }

  /** Clears user OAuth session only (keeps General App credentials). */
  async disconnectUser(): Promise<ZoomPublicConfigStatus> {
    this.abortOAuthListener({ clearPending: true });
    this.tokens.clear();
    this.lastError = null;
    this.lastErrorCode = null;
    this.oauthInProgress = false;
    return this.getPublicStatus();
  }

  /** Clears app credentials and user tokens. */
  clearCredentials(): ZoomPublicConfigStatus {
    this.abortOAuthListener({ clearPending: true });
    this.tokens.clear();
    this.credentials.clear();
    this.lastError = null;
    this.lastErrorCode = null;
    this.oauthInProgress = false;
    return this.getPublicStatus();
  }

  /**
   * Start Zoom user OAuth — Authorization Code + PKCE (S256).
   * Development: ephemeral 127.0.0.1 loopback.
   * Production: https://neud.io/oauth/zoom/callback → neud:// deep link.
   */
  async startUserOAuth(): Promise<ZoomPublicConfigStatus> {
    const publicClientId = this.credentials.getActivePublicClientId();
    const mode = this.credentials.getOAuthMode();
    if (!publicClientId) {
      this.lastErrorCode = "APP_CREDENTIALS_REQUIRED";
      this.lastError =
        mode === "production"
          ? "Zoom Production Public Client ID must be saved in Developer Setup first."
          : "Zoom Development Public Client ID must be saved in Developer Setup first.";
      return this.getPublicStatus();
    }

    this.abortOAuthListener({ clearPending: true });
    this.oauthInProgress = true;
    this.lastError = null;
    this.lastErrorCode = null;

    const state = generateOAuthState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = createCodeChallengeS256(codeVerifier);

    try {
      let redirectUri: string;
      let port: number | null = null;

      if (mode === "development") {
        const bound = await this.bindEphemeralLoopback();
        port = bound.port;
        redirectUri = getZoomOAuthRedirectUri({
          mode: "development",
          loopbackPort: port,
        });
        this.oauthServer = bound.server;
        bound.server.on("request", (req, res) => {
          void this.handleOAuthHttp(req, res).catch((error) => {
            this.lastError =
              error instanceof Error ? error.message : "OAuth callback failed.";
            this.lastErrorCode = "UNKNOWN";
            this.oauthInProgress = false;
            this.abortOAuthListener({ clearPending: true });
          });
        });
      } else {
        redirectUri = getZoomOAuthRedirectUri({ mode: "production" });
      }

      this.pendingOAuth = {
        state,
        codeVerifier,
        redirectUri,
        mode,
        port,
      };
      this.scheduleOAuthTimeout();

      const authorizeUrl = buildZoomAuthorizeUrl({
        publicClientId,
        redirectUri,
        state,
        codeChallenge,
      });

      console.info("[neud-zoom-oauth] authorize started", {
        mode,
        redirectUri,
        port,
        pkce: "S256",
        // Never log verifier, codes, tokens, or Public Client ID values.
      });

      await shell.openExternal(authorizeUrl);
    } catch (error) {
      this.oauthInProgress = false;
      this.abortOAuthListener({ clearPending: true });
      const technical =
        error instanceof Error ? error.message : "Unable to start Zoom OAuth.";
      this.lastError = technical;
      if (
        technical.toLowerCase().includes("listen") ||
        technical.toLowerCase().includes("eaddrinuse") ||
        technical.toLowerCase().includes("bind")
      ) {
        this.lastError = "Unable to start local Zoom authorization listener.";
        this.lastErrorCode = "NETWORK_ERROR";
      } else if (
        technical.toLowerCase().includes("openexternal") ||
        technical.toLowerCase().includes("browser")
      ) {
        this.lastError =
          "Unable to open the system browser for Zoom authorization.";
        this.lastErrorCode = "UNKNOWN";
      } else {
        this.lastErrorCode = mapZoomErrorCode({ message: technical });
      }
    }

    return this.getPublicStatus();
  }

  /**
   * Handle neud://oauth/zoom/callback from the Production HTTPS bridge
   * (or cold-start protocol launch).
   */
  async handleProtocolCallback(url: string): Promise<ZoomPublicConfigStatus> {
    const parsed = parseZoomOAuthDeepLink(url);
    if (!parsed.ok) {
      console.info("[neud-zoom-oauth] deep link rejected", {
        reason: parsed.reason,
      });
      if (this.oauthInProgress) {
        this.lastErrorCode = "AUTH_INVALID";
        this.lastError = "Zoom authorization failure (invalid deep link).";
        this.oauthInProgress = false;
        this.abortOAuthListener({ clearPending: true });
      }
      return this.getPublicStatus();
    }

    await this.completeOAuthCallback({
      code: parsed.code,
      state: parsed.state,
      error: parsed.error,
      source: "deep_link",
    });
    return this.getPublicStatus();
  }

  private bindEphemeralLoopback(): Promise<{
    port: number;
    server: http.Server;
  }> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      server.once("error", (error) => {
        reject(error);
      });
      // Port 0 → OS assigns an ephemeral free port (Zoom ignores port for loopback matching).
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as AddressInfo | null;
        const port = address?.port;
        if (!port) {
          server.close();
          reject(new Error("Unable to bind Zoom OAuth loopback listener."));
          return;
        }
        resolve({ port, server });
      });
    });
  }

  private scheduleOAuthTimeout(): void {
    if (this.oauthTimeout) {
      clearTimeout(this.oauthTimeout);
      this.oauthTimeout = null;
    }
    this.oauthTimeout = setTimeout(() => {
      if (!this.oauthInProgress) return;
      this.oauthInProgress = false;
      this.lastErrorCode = "AUTH_TIMEOUT";
      this.lastError = "Zoom authorization timed out.";
      this.abortOAuthListener({ clearPending: true });
      console.info("[neud-zoom-oauth] authorize timed out");
    }, ZOOM_OAUTH_TIMEOUT_MS);
    this.oauthTimeout.unref?.();
  }

  private async handleOAuthHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const pending = this.pendingOAuth;
    const base =
      pending?.port != null
        ? `http://127.0.0.1:${pending.port}`
        : "http://127.0.0.1";
    const url = new URL(req.url ?? "/", base);
    if (url.pathname !== ZOOM_OAUTH_CALLBACK_PATH) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const outcome = await this.completeOAuthCallback({
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      error: url.searchParams.get("error"),
      source: "loopback",
    });

    if (outcome === "success") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderZoomLoopbackPage({ kind: "connected" }));
      return;
    }

    res.writeHead(outcome === "denied" ? 400 : 500, {
      "Content-Type": "text/html; charset=utf-8",
    });
    res.end(
      renderZoomLoopbackPage({
        kind: outcome === "denied" ? "cancelled" : "failed",
      }),
    );
  }

  private async completeOAuthCallback(input: {
    code: string | null;
    state: string | null;
    error: string | null;
    source: "loopback" | "deep_link";
  }): Promise<"success" | "denied" | "failed"> {
    const pending = this.pendingOAuth;
    const evaluation = evaluateZoomOAuthCallback({
      expectedState: pending?.state ?? null,
      code: input.code,
      state: input.state,
      error: input.error,
    });

    if (!evaluation.ok) {
      this.oauthInProgress = false;
      if (evaluation.reason === "denied") {
        this.lastErrorCode = "AUTH_DENIED";
        this.lastError = `Zoom authorization was denied (${evaluation.error ?? "access_denied"}).`;
      } else if (evaluation.reason === "state_mismatch") {
        this.lastErrorCode = "AUTH_INVALID";
        this.lastError = "Zoom authorization failed (state mismatch).";
      } else if (evaluation.reason === "missing_code") {
        this.lastErrorCode = "AUTH_INVALID";
        this.lastError = "Zoom authorization failed (missing code).";
      } else if (evaluation.reason === "missing_state") {
        this.lastErrorCode = "AUTH_INVALID";
        this.lastError = "Zoom authorization failed (missing state).";
      } else {
        this.lastErrorCode = "AUTH_INVALID";
        this.lastError = "Zoom authorization failed (no pending attempt).";
      }
      console.info("[neud-zoom-oauth] callback rejected", {
        reason: evaluation.reason,
        source: input.source,
      });
      this.abortOAuthListener({ clearPending: true });
      return evaluation.reason === "denied" ? "denied" : "failed";
    }

    const codeVerifier = pending!.codeVerifier;
    const redirectUri = pending!.redirectUri;

    try {
      await this.exchangeAuthorizationCode({
        code: evaluation.code,
        codeVerifier,
        redirectUri,
      });
      this.oauthInProgress = false;
      this.lastError = null;
      this.lastErrorCode = null;
      console.info("[neud-zoom-oauth] connected", { source: input.source });
      this.abortOAuthListener({ clearPending: true });
      return "success";
    } catch (err) {
      this.oauthInProgress = false;
      const technical =
        err instanceof Error ? err.message : "Token exchange failed.";
      this.lastError = technical;
      this.lastErrorCode = mapZoomErrorCode({ message: technical });
      console.info("[neud-zoom-oauth] token exchange failed", {
        statusHint: this.lastErrorCode,
        source: input.source,
      });
      this.abortOAuthListener({ clearPending: true });
      return "failed";
    }
  }

  private abortOAuthListener(options?: { clearPending?: boolean }): void {
    if (this.oauthTimeout) {
      clearTimeout(this.oauthTimeout);
      this.oauthTimeout = null;
    }
    if (options?.clearPending !== false) {
      this.pendingOAuth = null;
    }
    if (this.oauthServer) {
      try {
        this.oauthServer.close();
      } catch {
        // ignore
      }
      this.oauthServer = null;
    }
  }

  private async exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<void> {
    const publicClientId = this.credentials.getActivePublicClientId();
    if (!publicClientId) {
      throw new Error("Zoom Public Client ID is missing.");
    }

    // Public Client OAuth + PKCE: body fields only — no Authorization / Client Secret.
    // redirect_uri MUST match authorize (HTTPS bridge URI in Production, not neud://).
    const body = buildZoomAuthorizationCodeTokenBody({
      code: input.code,
      redirectUri: input.redirectUri,
      publicClientId,
      codeVerifier: input.codeVerifier,
    });

    const response = await fetch(ZOOM_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
      reason?: string;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !payload.access_token || !payload.refresh_token) {
      throw new Error(
        payload.error_description ||
          payload.reason ||
          payload.error ||
          `Zoom token exchange failure (${response.status}).`,
      );
    }
    const tokens: ZoomOAuthTokens = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAtMs:
        Date.now() + Math.max(60, Number(payload.expires_in ?? 3600)) * 1000,
      scope: payload.scope ?? null,
      tokenType: payload.token_type ?? "bearer",
    };
    this.tokens.save({ tokens, user: null });
    this.credentials.markValidated();
    try {
      const user = await this.fetchUserProfile(tokens.accessToken);
      this.tokens.updateUser(user);
    } catch {
      // Profile is optional for connection success.
    }
  }

  private async refreshAccessToken(): Promise<string> {
    const publicClientId = this.credentials.getActivePublicClientId();
    const stored = this.tokens.read();
    if (!publicClientId || !stored) {
      this.lastErrorCode = "AUTH_NOT_CONFIGURED";
      throw new Error("Zoom is not connected.");
    }
    // Public Client refresh: client_id + refresh_token in body — no Basic auth / secret.
    const body = buildZoomRefreshTokenBody({
      refreshToken: stored.tokens.refreshToken,
      publicClientId,
    });
    const response = await fetch(ZOOM_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
      reason?: string;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !payload.access_token) {
      this.lastErrorCode = "AUTH_EXPIRED";
      this.lastError =
        payload.error_description ||
        payload.reason ||
        payload.error ||
        "Zoom token refresh failure";
      throw new Error(this.lastError);
    }
    const tokens: ZoomOAuthTokens = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || stored.tokens.refreshToken,
      expiresAtMs:
        Date.now() + Math.max(60, Number(payload.expires_in ?? 3600)) * 1000,
      scope: payload.scope ?? stored.tokens.scope ?? null,
      tokenType: payload.token_type ?? "bearer",
    };
    this.tokens.save({ tokens, user: stored.user });
    this.lastError = null;
    this.lastErrorCode = null;
    return tokens.accessToken;
  }

  async getAccessToken(options?: {
    forceRefresh?: boolean;
  }): Promise<string> {
    if (!this.credentials.isConfigured()) {
      this.lastErrorCode = "APP_CREDENTIALS_REQUIRED";
      this.lastError = "Zoom Public Client ID is missing";
      throw new Error(this.lastError);
    }
    const stored = this.tokens.read();
    if (!stored) {
      this.lastErrorCode = "AUTH_NOT_CONFIGURED";
      this.lastError = "Zoom is not connected";
      throw new Error(this.lastError);
    }
    const now = Date.now();
    if (
      !options?.forceRefresh &&
      stored.tokens.expiresAtMs > now + 60_000
    ) {
      return stored.tokens.accessToken;
    }
    return this.refreshAccessToken();
  }

  /** Validate by refreshing / fetching the user profile. */
  async validateCredentials(): Promise<ZoomPublicConfigStatus> {
    try {
      const token = await this.getAccessToken({ forceRefresh: true });
      const user = await this.fetchUserProfile(token);
      this.tokens.updateUser(user);
      this.credentials.markValidated();
      this.lastError = null;
      this.lastErrorCode = null;
    } catch (error) {
      const technical =
        error instanceof Error ? error.message : "Zoom authentication failed.";
      this.lastError = technical;
      this.lastErrorCode = mapZoomErrorCode({ message: technical });
    }
    return this.getPublicStatus();
  }

  private async fetchUserProfile(accessToken: string): Promise<ZoomUserProfile> {
    const response = await fetch("https://api.zoom.us/v2/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Unable to load Zoom user profile (${response.status}).`);
    }
    const payload = (await response.json()) as {
      id?: string;
      first_name?: string;
      last_name?: string;
      display_name?: string;
      email?: string;
      account_id?: string;
    };
    const displayName =
      payload.display_name?.trim() ||
      [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim() ||
      payload.email?.trim() ||
      "Zoom user";
    return {
      id: String(payload.id ?? ""),
      displayName,
      email: payload.email ?? null,
      accountId: payload.account_id ?? null,
    };
  }

  async lookupMeetingOrWebinar(input: {
    sourceMode: ZoomSourceMode;
    meetingOrWebinarId: string;
  }): Promise<ZoomMeetingLookupResult> {
    const id = input.meetingOrWebinarId.replace(/\s+/g, "");
    if (!id) {
      return {
        ok: false,
        errorCode: "MEETING_NOT_FOUND",
        technical: "Meeting or Webinar id is required.",
      };
    }

    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (error) {
      const technical =
        error instanceof Error ? error.message : "Zoom authentication failed.";
      return {
        ok: false,
        errorCode: mapZoomErrorCode({ message: technical }),
        technical,
      };
    }

    const apiPath =
      input.sourceMode === "webinar"
        ? `https://api.zoom.us/v2/webinars/${encodeURIComponent(id)}`
        : `https://api.zoom.us/v2/meetings/${encodeURIComponent(id)}`;

    let response: Response;
    try {
      response = await fetch(apiPath, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      const technical =
        error instanceof Error ? error.message : "Network error contacting Zoom.";
      return { ok: false, errorCode: "NETWORK_ERROR", technical };
    }

    if (response.status === 404) {
      return {
        ok: false,
        errorCode: "MEETING_NOT_FOUND",
        technical: `${input.sourceMode} ${id} was not found.`,
      };
    }
    if (response.status === 401) {
      this.lastErrorCode = "AUTH_EXPIRED";
      return {
        ok: false,
        errorCode: "AUTH_EXPIRED",
        technical: "Zoom access token rejected.",
      };
    }
    if (response.status === 403) {
      return {
        ok: false,
        errorCode: "PERMISSION_DENIED",
        technical: "Zoom API returned 403 for this meeting/webinar.",
      };
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        errorCode: mapZoomErrorCode({
          httpStatus: response.status,
          message: text,
        }),
        technical: text || `Zoom API error ${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      id?: string | number;
      topic?: string;
    };
    return {
      ok: true,
      id: String(payload.id ?? id),
      topic: String(payload.topic ?? ""),
      sourceMode: input.sourceMode,
    };
  }

  async startRtmsForLiveMeeting(meetingId: string): Promise<{
    ok: boolean;
    errorCode?: ZoomFriendlyErrorCode;
    technical: string;
  }> {
    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (error) {
      const technical =
        error instanceof Error ? error.message : "Zoom authentication failed.";
      return {
        ok: false,
        errorCode: mapZoomErrorCode({ message: technical }),
        technical,
      };
    }

    const publicClientId = this.credentials.getActivePublicClientId() ?? "";
    const url = `https://api.zoom.us/v2/live_meetings/${encodeURIComponent(meetingId)}/rtms_app/status`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start",
          settings: { client_id: publicClientId },
        }),
      });
    } catch (error) {
      const technical =
        error instanceof Error ? error.message : "Network error starting RTMS.";
      return { ok: false, errorCode: "NETWORK_ERROR", technical };
    }

    if (response.status === 204 || response.ok) {
      return { ok: true, technical: "RTMS start accepted." };
    }

    const text = await response.text().catch(() => "");
    this.lastErrorCode = "RTMS_UNAVAILABLE";
    return {
      ok: false,
      errorCode: "RTMS_UNAVAILABLE",
      technical: text || `RTMS start failed (${response.status}).`,
    };
  }
}
