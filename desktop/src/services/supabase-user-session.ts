import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { safeStorage } from "electron";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import type { AppPaths } from "./app-paths";
import type { SupabasePublicConfig } from "./supabase-public-config";
import {
  classifyRefreshFailure,
  refreshCodeToErrorCategory,
  type CloudSessionRefreshCode,
  type CloudSessionRefreshResult,
} from "./supabase-session-refresh";
import {
  createDefaultSharedCloudAuthDiagnostics,
  type SharedCloudAuthDiagnostics,
  type SharedCloudAuthFailureStage,
} from "./shared-cloud-auth-diagnostics";
import { appendAuthRefreshLog } from "./runtime-diagnostics-log";

export type SupabaseUserSessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type StoredSupabaseSessionPayload = SupabaseUserSessionTokens & {
  userId: string;
  sessionGeneration?: number;
};

type SharedDiagnosticsWriter = (patch: Partial<SharedCloudAuthDiagnostics>) => void;

function sessionFile(paths: AppPaths): string {
  return paths.supabaseUserSessionFile;
}

function canUseSafeStorage(): boolean {
  try {
    return safeStorage?.isEncryptionAvailable?.() === true;
  } catch {
    return false;
  }
}

export type CloudSessionStoreResult = {
  inMemoryAvailable: boolean;
  refreshTokenPersisted: boolean;
  accessTokenPersisted: boolean;
};

export type PersistedCloudSessionProbe = {
  persistedSessionFileExists: boolean;
  encryptedRefreshTokenPresent: boolean;
  encryptedAccessTokenPresent: boolean;
  tokenExpiryAt: string | null;
  sessionDecryptable: boolean;
  mainProcessSessionAvailable: boolean;
  safeStorageAvailable: boolean;
  lastRestoreErrorCode: string | null;
};

export class SupabaseUserSessionService {
  private static nextInstanceSerial = 1;
  readonly instanceIdHash: string;
  private tokens: SupabaseUserSessionTokens | null = null;
  private userId: string | null = null;
  private client: SupabaseClient | null = null;
  private sessionGeneration = 0;
  private reauthenticationRequired = false;
  private refreshInFlight: Promise<CloudSessionRefreshResult> | null = null;
  private lastRefreshAttemptAt: string | null = null;
  private lastRefreshSuccessAt: string | null = null;
  private lastRefreshErrorCode: CloudSessionRefreshCode | null = null;
  private lastRefreshResult: SharedCloudAuthDiagnostics["lastRefreshResult"] = "not_attempted";
  private lastStoreAt: string | null = null;
  private lastRestoreAt: string | null = null;
  private lastRestoreErrorCode: string | null = null;
  private sessionUpdatedAt: string | null = null;
  private sharedDiagnostics = createDefaultSharedCloudAuthDiagnostics();
  private writeSharedDiagnostics: SharedDiagnosticsWriter | null = null;
  private readonly reauthenticationListeners = new Set<() => void>();
  private readonly sessionStoredListeners = new Set<(reason: string) => void>();

  constructor(private readonly paths: AppPaths) {
    const serial = SupabaseUserSessionService.nextInstanceSerial++;
    this.instanceIdHash = createHash("sha256")
      .update(`SupabaseUserSessionService:${serial}`)
      .digest("hex")
      .slice(0, 12);
    this.sharedDiagnostics.sessionServiceInstanceIdHash = this.instanceIdHash;
    this.loadFromDisk();
    this.syncSharedDiagnostics();
  }

  attachSharedDiagnosticsWriter(writer: SharedDiagnosticsWriter): void {
    this.writeSharedDiagnostics = writer;
    this.syncSharedDiagnostics();
  }

  onReauthenticationRequired(listener: () => void): () => void {
    this.reauthenticationListeners.add(listener);
    return () => this.reauthenticationListeners.delete(listener);
  }

  onSessionStored(listener: (reason: string) => void): () => void {
    this.sessionStoredListeners.add(listener);
    return () => this.sessionStoredListeners.delete(listener);
  }

  private notifySessionStored(reason: string): void {
    this.sharedDiagnostics.sessionNotificationFired = true;
    this.syncSharedDiagnostics();
    for (const listener of this.sessionStoredListeners) {
      listener(reason);
    }
  }

  private notifyReauthenticationRequired(): void {
    for (const listener of this.reauthenticationListeners) {
      listener();
    }
  }

  storeSession(input: {
    userId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }): CloudSessionStoreResult {
    this.reauthenticationRequired = false;
    this.sessionGeneration += 1;
    this.userId = input.userId;
    this.tokens = {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
    };
    this.client = null;
    this.lastStoreAt = new Date().toISOString();
    this.sessionUpdatedAt = this.lastStoreAt;
    this.lastRestoreErrorCode = null;
    this.lastRefreshErrorCode = null;
    this.lastRefreshResult = "not_attempted";
    const persisted = this.persist();
    this.syncSharedDiagnostics({
      reauthenticationRequired: false,
      firstSharedCloudFailureStage: "none",
      refreshResult: "not_attempted",
      refreshErrorCode: null,
      refreshErrorCategory: null,
    });
    this.notifySessionStored("login");
    return {
      inMemoryAvailable: this.hasCloudSession(),
      refreshTokenPersisted: persisted.refreshTokenPersisted,
      accessTokenPersisted: persisted.accessTokenPersisted,
    };
  }

  getPersistedSessionProbe(): PersistedCloudSessionProbe {
    const filePath = sessionFile(this.paths);
    const persistedSessionFileExists = fs.existsSync(filePath);
    const safeStorageAvailable = canUseSafeStorage();
    let encryptedRefreshTokenPresent = false;
    let encryptedAccessTokenPresent = false;
    let sessionDecryptable = false;
    let tokenExpiryAt: string | null =
      this.tokens?.expiresAt && this.tokens.expiresAt > 0
        ? new Date(this.tokens.expiresAt).toISOString()
        : null;

    if (persistedSessionFileExists && safeStorageAvailable) {
      try {
        const decrypted = safeStorage.decryptString(fs.readFileSync(filePath));
        const parsed = JSON.parse(decrypted) as StoredSupabaseSessionPayload;
        encryptedRefreshTokenPresent = Boolean(parsed.refreshToken);
        encryptedAccessTokenPresent = Boolean(parsed.accessToken);
        sessionDecryptable =
          Boolean(parsed.userId && parsed.accessToken && parsed.refreshToken) &&
          typeof parsed.expiresAt === "number";
        if (sessionDecryptable) {
          tokenExpiryAt = new Date(parsed.expiresAt).toISOString();
        }
      } catch {
        sessionDecryptable = false;
      }
    }

    return {
      persistedSessionFileExists,
      encryptedRefreshTokenPresent,
      encryptedAccessTokenPresent,
      tokenExpiryAt,
      sessionDecryptable,
      mainProcessSessionAvailable: this.hasCloudSession(),
      safeStorageAvailable,
      lastRestoreErrorCode: this.lastRestoreErrorCode,
    };
  }

  getSessionLifecycleDiagnostics(): {
    lastSessionStoreAt: string | null;
    lastSessionRestoreAt: string | null;
    lastSessionErrorCode: string | null;
  } {
    return {
      lastSessionStoreAt: this.lastStoreAt,
      lastSessionRestoreAt: this.lastRestoreAt,
      lastSessionErrorCode: this.reauthenticationRequired
        ? (this.lastRefreshErrorCode ?? "reauthentication_required")
        : this.lastRestoreErrorCode,
    };
  }

  getSharedAuthDiagnostics(): SharedCloudAuthDiagnostics {
    return { ...this.sharedDiagnostics };
  }

  clearSession(options?: { deletePersistedFile?: boolean }): void {
    this.tokens = null;
    this.userId = null;
    this.client = null;
    this.reauthenticationRequired = false;
    this.lastRefreshAttemptAt = null;
    this.lastRefreshSuccessAt = null;
    this.lastRefreshErrorCode = null;
    this.lastRefreshResult = "not_attempted";
    if (options?.deletePersistedFile !== false) {
      const filePath = sessionFile(this.paths);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    this.syncSharedDiagnostics();
  }

  hasCloudSession(): boolean {
    return (
      !this.reauthenticationRequired &&
      Boolean(this.tokens?.accessToken && this.tokens.refreshToken)
    );
  }

  hasPersistedTokens(): boolean {
    return fs.existsSync(sessionFile(this.paths)) || Boolean(this.tokens?.refreshToken);
  }

  requiresReauthentication(): boolean {
    return this.reauthenticationRequired;
  }

  isAuthenticatedClientReady(): boolean {
    return Boolean(this.client) && this.hasCloudSession();
  }

  getRefreshDiagnostics(): {
    lastRefreshAttemptAt: string | null;
    lastRefreshSuccessAt: string | null;
    lastRefreshErrorCode: CloudSessionRefreshCode | null;
  } {
    return {
      lastRefreshAttemptAt: this.lastRefreshAttemptAt,
      lastRefreshSuccessAt: this.lastRefreshSuccessAt,
      lastRefreshErrorCode: this.lastRefreshErrorCode,
    };
  }

  async refreshCloudSessionIfNeeded(
    config: SupabasePublicConfig,
  ): Promise<CloudSessionRefreshResult> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.performRefresh(config).finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async performRefresh(
    config: SupabasePublicConfig,
  ): Promise<CloudSessionRefreshResult> {
    const attemptedAt = new Date().toISOString();
    this.lastRefreshAttemptAt = attemptedAt;
    this.sharedDiagnostics.refreshAttemptedAt = attemptedAt;
    this.sharedDiagnostics.lastRefreshAttemptAt = attemptedAt;
    appendAuthRefreshLog(this.paths, "auth.refresh.begin");

    if (!this.tokens?.accessToken || !this.tokens.refreshToken) {
      this.lastRefreshErrorCode = "no_tokens";
      this.lastRefreshResult = "failure";
      this.recordRefreshFailure("no_tokens");
      return { ok: false, code: "no_tokens", errorCategory: "unknown" };
    }

    if (this.isCloudSessionFresh()) {
      this.lastRefreshErrorCode = null;
      this.lastRefreshResult = "still_fresh";
      this.sharedDiagnostics.refreshResult = "still_fresh";
      this.sharedDiagnostics.lastRefreshResult = "still_fresh";
      this.syncSharedDiagnostics();
      return { ok: true, code: "still_fresh" };
    }

    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      this.lastRefreshErrorCode = "bad_supabase_config";
      this.lastRefreshResult = "failure";
      this.recordRefreshFailure("bad_supabase_config");
      return {
        ok: false,
        code: "bad_supabase_config",
        errorCategory: "bad_supabase_config",
      };
    }

    const refreshTokenAtStart = this.tokens.refreshToken;
    const generationAtStart = this.sessionGeneration;
    this.sharedDiagnostics.refreshHttpAttempted = true;
    this.sharedDiagnostics.accessTokenExpired = !this.isCloudSessionFresh();

    try {
      const refreshClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data, error } = await refreshClient.auth.refreshSession({
        refresh_token: refreshTokenAtStart,
      });

      if (error || !data.session?.access_token || !data.session.refresh_token) {
        const code = error ? classifyRefreshFailure(error) : "refresh_response_invalid";
        if (code === "invalid_refresh_token" || code === "refresh_token_not_found") {
          appendAuthRefreshLog(this.paths, `auth.refresh.failed code=${code}`);
          this.markReauthenticationRequired(code);
        } else {
          this.lastRefreshErrorCode = code;
          this.lastRefreshResult = "failure";
          this.recordRefreshFailure(code);
          appendAuthRefreshLog(this.paths, `auth.refresh.retry code=${code}`);
        }
        return {
          ok: false,
          code,
          message: error?.message ?? "Session refresh returned no session.",
          errorCategory: refreshCodeToErrorCategory(code),
        };
      }

      if (
        this.sessionGeneration !== generationAtStart ||
        this.tokens?.refreshToken !== refreshTokenAtStart
      ) {
        this.lastRefreshResult = "still_fresh";
        this.sharedDiagnostics.refreshResult = "still_fresh";
        this.sharedDiagnostics.lastRefreshResult = "still_fresh";
        this.syncSharedDiagnostics();
        return {
          ok: true,
          code: "still_fresh",
          errorCategory: "concurrent_refresh_conflict",
        };
      }

      const rotated = data.session.refresh_token !== refreshTokenAtStart;
      this.tokens = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: (data.session.expires_at ?? 0) * 1000,
      };
      this.client = null;
      this.sessionUpdatedAt = new Date().toISOString();
      const persisted = this.persist();
      this.lastRefreshSuccessAt = new Date().toISOString();
      this.lastRefreshErrorCode = null;
      this.lastRefreshResult = "success";
      this.sharedDiagnostics.refreshTokenRotated = rotated;
      this.sharedDiagnostics.refreshedSessionPersisted =
        persisted.refreshTokenPersisted && persisted.accessTokenPersisted;
      this.sharedDiagnostics.refreshResult = "success";
      this.sharedDiagnostics.lastRefreshResult = "success";
      this.sharedDiagnostics.refreshErrorCode = null;
      this.sharedDiagnostics.refreshErrorCategory = null;
      this.sharedDiagnostics.firstSharedCloudFailureStage = "none";
      this.syncSharedDiagnostics();
      appendAuthRefreshLog(
        this.paths,
        `auth.refresh.complete rotated=${rotated ? "true" : "false"}`,
      );
      appendAuthRefreshLog(this.paths, "session.updated reason=token-refresh");
      this.notifySessionStored("token-refresh");
      return { ok: true, code: "refreshed" };
    } catch (error) {
      const code = classifyRefreshFailure(
        error instanceof Error ? error : { message: String(error) },
      );
      if (code === "invalid_refresh_token" || code === "refresh_token_not_found") {
        appendAuthRefreshLog(this.paths, `auth.refresh.failed code=${code}`);
        this.markReauthenticationRequired(code);
      } else {
        this.lastRefreshErrorCode = code;
        this.lastRefreshResult = "failure";
        this.recordRefreshFailure(code);
        appendAuthRefreshLog(this.paths, `auth.refresh.retry code=${code}`);
      }
      return {
        ok: false,
        code,
        message: error instanceof Error ? error.message : String(error),
        errorCategory: refreshCodeToErrorCategory(code),
      };
    }
  }

  private recordRefreshFailure(code: CloudSessionRefreshCode): void {
    this.sharedDiagnostics.refreshResult = "failure";
    this.sharedDiagnostics.lastRefreshResult = "failure";
    this.sharedDiagnostics.refreshErrorCode = code;
    this.sharedDiagnostics.refreshErrorCategory = refreshCodeToErrorCategory(code);
    this.sharedDiagnostics.firstSharedCloudFailureStage = failureStageForRefreshCode(code);
    this.syncSharedDiagnostics();
  }

  private markReauthenticationRequired(code: CloudSessionRefreshCode): void {
    this.reauthenticationRequired = true;
    this.tokens = null;
    this.userId = null;
    this.client = null;
    this.lastRefreshErrorCode = code;
    this.lastRefreshResult = "failure";
    this.sharedDiagnostics.reauthenticationRequired = true;
    this.sharedDiagnostics.authenticatedClientReady = false;
    this.sharedDiagnostics.authenticatedClientCreated = false;
    this.sharedDiagnostics.setSessionSucceeded = false;
    this.recordRefreshFailure(code);
    this.notifyReauthenticationRequired();
  }

  getUserId(): string | null {
    return this.userId;
  }

  isCloudSessionFresh(): boolean {
    if (!this.tokens) {
      return false;
    }
    return this.tokens.expiresAt > Date.now() + 30_000;
  }

  isAccessTokenExpired(): boolean {
    if (!this.tokens) {
      return true;
    }
    return this.tokens.expiresAt <= Date.now();
  }

  async getAuthenticatedClient(config: SupabasePublicConfig): Promise<SupabaseClient | null> {
    if (!this.hasCloudSession()) {
      return null;
    }

    const refresh = await this.refreshCloudSessionIfNeeded(config);
    if (!refresh.ok && refresh.code === "invalid_refresh_token") {
      return null;
    }
    if (!refresh.ok && refresh.code === "refresh_token_not_found") {
      return null;
    }
    if (!refresh.ok && !this.isCloudSessionFresh()) {
      return null;
    }

    const ready = await this.ensureClient(config);
    this.sharedDiagnostics.authenticatedClientReady = ready;
    this.sharedDiagnostics.authenticatedClientCreated = ready;
    this.syncSharedDiagnostics();
    return ready ? this.client : null;
  }

  async reacquireAuthenticatedClient(
    config: SupabasePublicConfig,
    options?: { forceRefresh?: boolean },
  ): Promise<SupabaseClient | null> {
    if (!this.hasCloudSession()) {
      return null;
    }

    this.client = null;
    this.sharedDiagnostics.authenticatedClientReady = false;

    if (options?.forceRefresh || !this.isCloudSessionFresh()) {
      const refresh = await this.refreshCloudSessionIfNeeded(config);
      if (!refresh.ok && (refresh.code === "invalid_refresh_token" || refresh.code === "refresh_token_not_found")) {
        return null;
      }
      if (!refresh.ok && !this.isCloudSessionFresh()) {
        return null;
      }
    }

    const ready = await this.ensureClient(config);
    this.sharedDiagnostics.authenticatedClientReady = ready;
    this.sharedDiagnostics.authenticatedClientCreated = ready;
    this.syncSharedDiagnostics();
    return ready ? this.client : null;
  }

  private async ensureClient(config: SupabasePublicConfig): Promise<boolean> {
    if (!this.tokens?.accessToken || !this.tokens.refreshToken) {
      this.client = null;
      this.sharedDiagnostics.authenticatedClientCreated = false;
      this.sharedDiagnostics.setSessionSucceeded = false;
      this.syncSharedDiagnostics();
      return false;
    }

    if (!this.client) {
      try {
        this.client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: {
            headers: {
              Authorization: `Bearer ${this.tokens.accessToken}`,
            },
          },
          realtime: {
            transport: WebSocket as unknown as typeof globalThis.WebSocket,
          },
        });

        const { data, error } = await this.client.auth.setSession({
          access_token: this.tokens.accessToken,
          refresh_token: this.tokens.refreshToken,
        });
        if (error || !data.session) {
          this.lastRefreshErrorCode = error
            ? classifyRefreshFailure(error)
            : "set_session_failed";
          this.client = null;
          this.sharedDiagnostics.setSessionSucceeded = false;
          this.sharedDiagnostics.authenticatedClientCreated = false;
          this.sharedDiagnostics.firstSharedCloudFailureStage = "set_session_failed";
          this.syncSharedDiagnostics();
          return false;
        }
        this.sharedDiagnostics.setSessionSucceeded = true;
      } catch (error) {
        this.lastRefreshErrorCode = classifyRefreshFailure(
          error instanceof Error ? error : { message: String(error) },
        );
        this.client = null;
        this.sharedDiagnostics.setSessionSucceeded = false;
        this.sharedDiagnostics.authenticatedClientCreated = false;
        this.sharedDiagnostics.firstSharedCloudFailureStage = "client_creation_failed";
        this.syncSharedDiagnostics();
        return false;
      }
    }

    this.sharedDiagnostics.authenticatedClientCreated = Boolean(this.client);
    this.syncSharedDiagnostics();
    return Boolean(this.client);
  }

  private persist(): { refreshTokenPersisted: boolean; accessTokenPersisted: boolean } {
    if (!this.tokens || !this.userId) {
      return { refreshTokenPersisted: false, accessTokenPersisted: false };
    }

    if (!canUseSafeStorage()) {
      this.sharedDiagnostics.firstSharedCloudFailureStage = "session_persist_failed";
      this.syncSharedDiagnostics();
      return {
        refreshTokenPersisted: false,
        accessTokenPersisted: false,
      };
    }

    const payload: StoredSupabaseSessionPayload = {
      userId: this.userId,
      sessionGeneration: this.sessionGeneration,
      ...this.tokens,
    };

    const filePath = sessionFile(this.paths);
    const tempPath = `${filePath}.tmp`;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(tempPath, safeStorage.encryptString(JSON.stringify(payload)));
      fs.renameSync(tempPath, filePath);
      this.sharedDiagnostics.refreshedSessionPersisted = true;
      this.syncSharedDiagnostics();
    } catch {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      this.sharedDiagnostics.firstSharedCloudFailureStage = "session_persist_failed";
      this.syncSharedDiagnostics();
      return { refreshTokenPersisted: false, accessTokenPersisted: false };
    }

    return {
      refreshTokenPersisted: Boolean(this.tokens.refreshToken),
      accessTokenPersisted: Boolean(this.tokens.accessToken),
    };
  }

  private loadFromDisk(): void {
    if (!canUseSafeStorage()) {
      this.lastRestoreErrorCode = "safe_storage_unavailable";
      this.sharedDiagnostics.firstSharedCloudFailureStage = "session_decrypt_failed";
      this.syncSharedDiagnostics();
      return;
    }

    const filePath = sessionFile(this.paths);
    if (!fs.existsSync(filePath)) {
      this.sharedDiagnostics.firstSharedCloudFailureStage = "session_file_missing";
      this.syncSharedDiagnostics();
      return;
    }

    try {
      const decrypted = safeStorage.decryptString(fs.readFileSync(filePath));
      const parsed = JSON.parse(decrypted) as StoredSupabaseSessionPayload;
      if (
        !parsed.userId ||
        !parsed.accessToken ||
        !parsed.refreshToken ||
        typeof parsed.expiresAt !== "number"
      ) {
        throw new Error("Persisted cloud session payload is incomplete.");
      }
      this.userId = parsed.userId;
      this.tokens = {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt,
      };
      this.sessionGeneration = parsed.sessionGeneration ?? 0;
      this.lastRestoreAt = new Date().toISOString();
      this.lastRestoreErrorCode = null;
      this.sharedDiagnostics.persistedSessionDecryptable = true;
      this.sharedDiagnostics.firstSharedCloudFailureStage = this.isAccessTokenExpired()
        ? "token_expired"
        : "none";
      this.syncSharedDiagnostics();
    } catch {
      this.tokens = null;
      this.userId = null;
      this.lastRestoreErrorCode = "decrypt_failed";
      this.sharedDiagnostics.persistedSessionDecryptable = false;
      this.sharedDiagnostics.firstSharedCloudFailureStage = "session_decrypt_failed";
      this.syncSharedDiagnostics();
    }
  }

  private syncSharedDiagnostics(patch: Partial<SharedCloudAuthDiagnostics> = {}): void {
    const probe = this.getPersistedSessionProbe();
    this.sharedDiagnostics = {
      ...this.sharedDiagnostics,
      persistedSessionPresent: probe.persistedSessionFileExists || this.hasPersistedTokens(),
      persistedSessionDecryptable: probe.sessionDecryptable,
      tokenExpiryAt: probe.tokenExpiryAt,
      tokenExpired: this.isAccessTokenExpired(),
      refreshTokenPresent: probe.encryptedRefreshTokenPresent || Boolean(this.tokens?.refreshToken),
      accessTokenPresent: probe.encryptedAccessTokenPresent || Boolean(this.tokens?.accessToken),
      accessTokenExpired: this.isAccessTokenExpired(),
      authenticatedClientReady: Boolean(this.client) && this.hasCloudSession(),
      reauthenticationRequired: this.reauthenticationRequired,
      sessionGeneration: this.sessionGeneration,
      sessionUpdatedAt: this.sessionUpdatedAt,
      lastRefreshAttemptAt: this.lastRefreshAttemptAt,
      lastRefreshResult: this.lastRefreshResult,
      lastRefreshErrorCode: this.lastRefreshErrorCode,
      sessionServiceInstanceIdHash: this.instanceIdHash,
      updatedAt: new Date().toISOString(),
      ...patch,
    };
    this.writeSharedDiagnostics?.(this.sharedDiagnostics);
  }
}

function failureStageForRefreshCode(code: CloudSessionRefreshCode): SharedCloudAuthFailureStage {
  switch (code) {
    case "network_error":
      return "refresh_network_failed";
    case "invalid_refresh_token":
    case "refresh_token_not_found":
      return "refresh_token_invalid";
    case "refresh_response_invalid":
      return "refresh_response_invalid";
    case "set_session_failed":
      return "set_session_failed";
    case "bad_supabase_config":
      return "none";
    default:
      return "none";
  }
}
