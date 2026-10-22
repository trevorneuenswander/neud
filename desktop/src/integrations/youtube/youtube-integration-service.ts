import { shell } from "electron";
import type { AppPaths } from "../../services/app-paths";
import type { YouTubeLiveChatTransport } from "../../live-chat/providers/youtube-live-api.ts";
import { YOUTUBE_API_ORIGIN } from "../../live-chat/providers/youtube-live-api.ts";
import { YouTubeCredentialStore, type YouTubeStoredCredentials } from "./youtube-credential-store.ts";
import { openYouTubeLiveChatStream } from "./youtube-live-chat-stream.ts";
import { YouTubeOAuthFlow } from "./youtube-oauth-flow.ts";
import {
  exchangeYouTubeAuthorizationCode,
  refreshYouTubeAccessToken,
} from "./youtube-oauth.ts";

export type YouTubePublicStatus = {
  configured: boolean;
  userConnected: boolean;
  authState:
    | YouTubeStoredCredentials["authState"]
    | "expired"
    | "pending"
    | "cancelled"
    | "timed_out"
    | "denied"
    | "exchange_failed";
  connectedAs: string | null;
  clientIdMasked: string | null;
  clientSecretConfigured: boolean;
  lastError: string | null;
  friendlyMessage: string;
  secureStorage: boolean;
};

function maskClientId(clientId: string): string | null {
  const trimmed = clientId.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function friendlyMessage(status: YouTubePublicStatus): string {
  if (status.authState === "pending") {
    return status.lastError || "YouTube authorization is pending.";
  }
  if (status.authState === "cancelled") {
    return status.lastError || "YouTube authorization was cancelled.";
  }
  if (status.authState === "timed_out") {
    return status.lastError || "YouTube authorization timed out.";
  }
  if (status.authState === "denied") {
    return status.lastError || "YouTube authorization was denied.";
  }
  if (status.authState === "exchange_failed") {
    return status.lastError || "YouTube token exchange failed.";
  }
  if (!status.secureStorage) {
    return "Secure storage is unavailable. YouTube credentials cannot be saved.";
  }
  if (status.authState === "revoked") {
    return status.lastError || "YouTube authorization was revoked. Connect the account again.";
  }
  if (status.authState === "expired") {
    return "YouTube access expired. NEUD will refresh it on the next request.";
  }
  if (status.authState === "error") {
    return status.lastError || "YouTube authorization failed.";
  }
  if (status.lastError && !status.userConnected) {
    return status.lastError;
  }
  if (!status.configured) {
    return "YouTube OAuth is not configured.";
  }
  if (!status.userConnected) {
    return "YouTube is configured. Connect a YouTube account to read live chat.";
  }
  return status.connectedAs
    ? `Connected as ${status.connectedAs}`
    : "YouTube account connected.";
}

export class YouTubeIntegrationService implements YouTubeLiveChatTransport {
  private readonly oauthFlow: YouTubeOAuthFlow;

  constructor(
    private readonly paths: AppPaths,
    private readonly store = new YouTubeCredentialStore(paths),
  ) {
    this.oauthFlow = new YouTubeOAuthFlow({
      openExternal: (url) => shell.openExternal(url),
      exchangeCode: exchangeYouTubeAuthorizationCode,
      readChannelTitle: (accessToken) => this.readChannelTitle(accessToken),
      readClient: () => {
        const current = this.store.read();
        return {
          clientId: current.clientId,
          clientSecret: current.clientSecret,
          refreshToken: current.refreshToken,
        };
      },
      persistSuccess: (tokens, connectedAs) => {
        const current = this.store.read();
        this.store.save({
          clientId: current.clientId.trim(),
          clientSecret: current.clientSecret,
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
          accessTokenExpiresAtMs: tokens.expiresAtMs,
          connectedAs,
          authState: tokens.refreshToken ? "connected" : "error",
          lastError: tokens.refreshToken
            ? null
            : "YouTube did not return a refresh token. Disconnect and connect again.",
        });
      },
      persistFailure: (outcome) => {
        const current = this.store.read();
        const revoked = outcome.phase === "revoked";
        this.store.save({
          ...current,
          refreshToken: revoked ? null : current.refreshToken,
          accessToken: revoked ? null : current.accessToken,
          accessTokenExpiresAtMs: revoked ? null : current.accessTokenExpiresAtMs,
          connectedAs: revoked ? null : current.connectedAs,
          authState: revoked ? "revoked" : current.refreshToken ? "connected" : "configured",
          lastError: outcome.message,
        });
      },
    });
  }

  isConfigured(): boolean {
    return Boolean(this.store.read().clientId.trim());
  }

  getPublicStatus(): YouTubePublicStatus {
    const stored = this.store.read();
    const accessExpired = Boolean(
      stored.accessToken &&
        stored.accessTokenExpiresAtMs &&
        stored.accessTokenExpiresAtMs <= Date.now() &&
        stored.refreshToken,
    );
    const status: YouTubePublicStatus = {
      configured: Boolean(stored.clientId.trim()),
      userConnected: Boolean(stored.refreshToken) && stored.authState !== "revoked",
      authState:
        stored.authState === "revoked" || stored.authState === "error"
          ? stored.authState
          : accessExpired
            ? "expired"
            : stored.refreshToken
              ? "connected"
              : stored.clientId
                ? "configured"
                : "not_configured",
      connectedAs: stored.connectedAs,
      clientIdMasked: maskClientId(stored.clientId),
      clientSecretConfigured: Boolean(stored.clientSecret.trim()),
      lastError: stored.lastError,
      friendlyMessage: "",
      secureStorage: this.store.isEncryptionAvailable(),
    };
    const oauth = this.oauthFlow.snapshot();
    if (oauth.phase !== "idle") {
      status.authState = oauth.phase === "pending" ? "pending" : oauth.phase;
      status.lastError = oauth.message;
      if (oauth.phase === "revoked") {
        status.userConnected = false;
      }
    }
    status.friendlyMessage = friendlyMessage(status);
    return status;
  }

  getAuthState(): { authState: string; detail: string; lastError: string | null } {
    const status = this.getPublicStatus();
    return {
      authState: status.authState,
      detail: status.friendlyMessage,
      lastError: status.lastError,
    };
  }

  saveClientId(clientId: string, clientSecret?: string): YouTubePublicStatus {
    const trimmed = clientId.trim();
    if (!trimmed) {
      throw new Error("YouTube OAuth client ID is required.");
    }
    const current = this.store.read();
    const nextSecret = clientSecret?.trim() ? clientSecret.trim() : current.clientSecret;
    this.store.save({
      ...current,
      clientId: trimmed,
      clientSecret: nextSecret,
      authState: current.refreshToken ? "connected" : "configured",
      lastError: null,
    });
    return this.getPublicStatus();
  }

  async disconnectUser(): Promise<YouTubePublicStatus> {
    const current = this.store.read();
    this.store.save({
      ...current,
      refreshToken: null,
      accessToken: null,
      accessTokenExpiresAtMs: null,
      connectedAs: null,
      authState: current.clientId ? "configured" : "not_configured",
      lastError: null,
    });
    return this.getPublicStatus();
  }

  async startUserOAuth(): Promise<YouTubePublicStatus> {
    const current = this.store.read();
    if (!current.clientId.trim()) {
      throw new Error("YouTube OAuth is not configured.");
    }
    if (!current.clientSecret.trim()) {
      throw new Error(
        "Google requires the Desktop client secret for this OAuth client. Save the client secret, then connect again.",
      );
    }
    if (!this.store.isEncryptionAvailable()) {
      throw new Error("Secure storage is unavailable on this computer.");
    }
    await this.oauthFlow.start();
    return this.getPublicStatus();
  }

  cancelUserOAuth(): YouTubePublicStatus {
    this.oauthFlow.cancel();
    return this.getPublicStatus();
  }

  /** Close the loopback listener. Safe to call more than once. */
  dispose(): void {
    this.oauthFlow.shutdown();
  }

  async getAccessToken(): Promise<string | null> {
    const stored = this.store.read();
    if (!stored.refreshToken || stored.authState === "revoked") {
      return null;
    }
    const fresh =
      stored.accessToken &&
      stored.accessTokenExpiresAtMs &&
      stored.accessTokenExpiresAtMs > Date.now() + 60_000;
    if (fresh && stored.accessToken) {
      return stored.accessToken;
    }
    return this.refreshAccessToken();
  }

  async refreshAccessToken(): Promise<string | null> {
    const stored = this.store.read();
    if (!stored.clientId || !stored.refreshToken) {
      return null;
    }
    try {
      const tokens = await refreshYouTubeAccessToken({
        clientId: stored.clientId,
        clientSecret: stored.clientSecret,
        refreshToken: stored.refreshToken,
      });
      this.store.save({
        ...stored,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAtMs: tokens.expiresAtMs,
        authState: "connected",
        lastError: null,
      });
      return tokens.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : "YouTube token refresh failed.";
      const revoked = message.includes("revoked") || message.includes("invalid_grant");
      this.store.save({
        ...stored,
        accessToken: null,
        accessTokenExpiresAtMs: null,
        refreshToken: revoked ? null : stored.refreshToken,
        authState: revoked ? "revoked" : "error",
        lastError: revoked
          ? "YouTube authorization was revoked. Connect the account again."
          : message,
      });
      return null;
    }
  }

  async openLiveChatStream(input: {
    liveChatId: string;
    pageToken: string | null;
    accessToken: string;
  }) {
    return openYouTubeLiveChatStream(input);
  }

  async fetchJson(
    url: string,
    accessToken: string,
  ): Promise<{ status: number; body: unknown }> {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    } catch {
      return { status: 0, body: null };
    }
  }

  private async readChannelTitle(accessToken: string): Promise<string | null> {
    const result = await this.fetchJson(
      `${YOUTUBE_API_ORIGIN}/channels?part=snippet&mine=true`,
      accessToken,
    );
    if (result.status !== 200) return null;
    const items = (result.body as { items?: Array<{ snippet?: { title?: string } }> } | null)
      ?.items;
    const title = items?.[0]?.snippet?.title?.trim();
    return title || null;
  }
}
