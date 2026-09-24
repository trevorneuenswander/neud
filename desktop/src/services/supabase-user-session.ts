import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { safeStorage } from "electron";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDesktopSupabaseClient,
  getDesktopSupabaseRuntimeDiagnostics,
} from "./supabase-desktop-client";
import type { AppPaths } from "./app-paths";
import {
  extractSupabaseProjectRef,
  type SupabasePublicConfig,
} from "./supabase-public-config";
import {
  classifyRefreshFailure,
  extractSupabaseAuthError,
  isTransientRefreshCode,
  refreshCodeToErrorCategory,
  resolveFirstRefreshFailureStage,
  sanitizeRefreshSafeMessage,
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
  issuerProjectRef?: string | null;
};

type LegacyStoredSupabaseSessionPayload = {
  userId?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expiresAt?: number;
  accessToken?: string;
  refreshToken?: string;
  sessionGeneration?: number;
  issuerProjectRef?: string | null;
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
  private refreshQueueTail: Promise<CloudSessionRefreshResult> = Promise.resolve({
    ok: true,
    code: "still_fresh",
  });
  private lastRefreshAttemptAt: string | null = null;
  private lastRefreshSuccessAt: string | null = null;
  private lastRefreshErrorCode: CloudSessionRefreshCode | null = null;
  private lastRefreshResult: SharedCloudAuthDiagnostics["lastRefreshResult"] = "not_attempted";
  private lastStoreAt: string | null = null;
  private lastRestoreAt: string | null = null;
  private lastRestoreErrorCode: string | null = null;
  private sessionUpdatedAt: string | null = null;
  private sharedDiagnostics = createDefaultSharedCloudAuthDiagnostics();
  private lastPersistedSharedDiagnosticsJson: string | null = null;
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
    issuerProjectRef?: string | null;
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
    this.sharedDiagnostics.storedSessionIssuerProjectRef = input.issuerProjectRef ?? null;
    const persisted = this.persist(input.issuerProjectRef ?? null);
    this.syncSharedDiagnostics({
      reauthenticationRequired: false,
      firstSharedCloudFailureStage: "none",
      firstRefreshFailureStage: "none",
      refreshResult: "not_attempted",
      refreshErrorCode: null,
      refreshErrorCategory: null,
      refreshHttpAttempted: false,
      refreshHttpStatus: null,
      refreshSupabaseErrorCode: null,
      refreshSupabaseErrorName: null,
      refreshSafeMessage: null,
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

  setStoredIssuerProjectRef(projectRef: string | null): void {
    if (!projectRef?.trim()) {
      return;
    }
    if (!this.sharedDiagnostics.storedSessionIssuerProjectRef) {
      this.sharedDiagnostics.storedSessionIssuerProjectRef = projectRef.trim();
      this.syncSharedDiagnostics();
    }
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
    options?: { configSource?: string | null },
  ): Promise<CloudSessionRefreshResult> {
    const job = this.refreshQueueTail.then(() =>
      this.performRefresh(config, options?.configSource ?? null),
    );
    this.refreshQueueTail = job.catch(() => ({
      ok: false,
      code: "refresh_failed" as const,
    }));
    return job;
  }

  private async performRefresh(
    config: SupabasePublicConfig,
    configSource: string | null,
  ): Promise<CloudSessionRefreshResult> {
    const attemptedAt = new Date().toISOString();
    this.lastRefreshAttemptAt = attemptedAt;
    this.sharedDiagnostics.refreshAttemptedAt = attemptedAt;
    this.sharedDiagnostics.lastRefreshAttemptAt = attemptedAt;
    this.sharedDiagnostics.publicConfigPresent = Boolean(
      config.supabaseUrl && config.supabasePublishableKey,
    );
    this.sharedDiagnostics.configSource = configSource;
    const configuredRef = extractSupabaseProjectRef(config.supabaseUrl ?? "");
    this.sharedDiagnostics.configuredSupabaseProjectRef = configuredRef;
    const storedIssuerRef = this.sharedDiagnostics.storedSessionIssuerProjectRef;
    const projectRefMismatch = Boolean(
      configuredRef && storedIssuerRef && configuredRef !== storedIssuerRef,
    );
    this.sharedDiagnostics.projectRefsMatch = projectRefMismatch
      ? false
      : configuredRef && storedIssuerRef
        ? configuredRef === storedIssuerRef
        : null;
    appendAuthRefreshLog(this.paths, "auth.refresh.begin");

    if (!this.tokens?.refreshToken) {
      this.lastRefreshErrorCode = "no_refresh_token";
      this.lastRefreshResult = "failure";
      this.recordRefreshFailure("no_refresh_token", {
        httpStatus: null,
        supabaseErrorCode: null,
        supabaseErrorName: null,
        safeMessage: "Missing refresh token in persisted session.",
        responseContainedSession: false,
      });
      return {
        ok: false,
        code: "no_refresh_token",
        errorCategory: refreshCodeToErrorCategory("no_refresh_token"),
        firstFailureStage: "no_refresh_token",
      };
    }

    if (this.isCloudSessionFresh()) {
      this.lastRefreshErrorCode = null;
      this.lastRefreshResult = "still_fresh";
      this.sharedDiagnostics.refreshResult = "still_fresh";
      this.sharedDiagnostics.lastRefreshResult = "still_fresh";
      this.sharedDiagnostics.firstRefreshFailureStage = "none";
      return { ok: true, code: "still_fresh", firstFailureStage: "none" };
    }

    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      this.lastRefreshErrorCode = "bad_supabase_config";
      this.lastRefreshResult = "failure";
      this.recordRefreshFailure("bad_supabase_config", {
        httpStatus: null,
        supabaseErrorCode: null,
        supabaseErrorName: null,
        safeMessage: "Supabase public config is missing.",
        responseContainedSession: false,
      });
      return {
        ok: false,
        code: "bad_supabase_config",
        errorCategory: "bad_supabase_config",
        firstFailureStage: "refresh_request_not_sent",
      };
    }

    if (projectRefMismatch) {
      this.lastRefreshErrorCode = "project_ref_mismatch";
      this.lastRefreshResult = "failure";
      this.recordRefreshFailure("project_ref_mismatch", {
        httpStatus: null,
        supabaseErrorCode: "project_ref_mismatch",
        supabaseErrorName: null,
        safeMessage: "Configured Supabase project does not match stored session issuer.",
        responseContainedSession: false,
      });
      return {
        ok: false,
        code: "project_ref_mismatch",
        errorCategory: "project_ref_mismatch",
        firstFailureStage: "project_ref_mismatch",
      };
    }

    const refreshTokenAtStart = this.tokens.refreshToken;
    const generationAtStart = this.sessionGeneration;
    this.sharedDiagnostics.refreshHttpAttempted = true;
    this.sharedDiagnostics.accessTokenExpired = !this.isCloudSessionFresh();
    Object.assign(this.sharedDiagnostics, getDesktopSupabaseRuntimeDiagnostics());

    const maxAttempts = 2;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let refreshHttpStatus: number | null = null;
      try {
        const refreshClient = createDesktopSupabaseClient(config, {
          global: {
            fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
              const response = await fetch(input, init);
              refreshHttpStatus = response.status;
              return response;
            },
          },
        });

        const { data, error } = await refreshClient.auth.refreshSession({
          refresh_token: refreshTokenAtStart,
        });

        const extracted = error ? extractSupabaseAuthError(error) : null;
        const responseContainedSession = Boolean(data?.session);
        const responseContainedAccessToken = Boolean(data?.session?.access_token);
        const responseContainedRefreshToken = Boolean(data?.session?.refresh_token);

        this.sharedDiagnostics.refreshHttpStatus = refreshHttpStatus ?? extracted?.status ?? null;
        this.sharedDiagnostics.refreshSupabaseErrorCode = extracted?.code ?? null;
        this.sharedDiagnostics.refreshSupabaseErrorName = extracted?.name ?? null;
        this.sharedDiagnostics.refreshSafeMessage = extracted
          ? sanitizeRefreshSafeMessage(extracted.message)
          : null;
        this.sharedDiagnostics.responseContainedSession = responseContainedSession;
        this.sharedDiagnostics.responseContainedAccessToken = responseContainedAccessToken;
        this.sharedDiagnostics.responseContainedRefreshToken = responseContainedRefreshToken;

        if (error || !responseContainedAccessToken || !responseContainedRefreshToken) {
          const code = error ? classifyRefreshFailure(error) : "refresh_response_invalid";
          const safeMessage =
            extracted?.message != null
              ? sanitizeRefreshSafeMessage(extracted.message)
              : "Session refresh returned no session.";
          appendAuthRefreshLog(
            this.paths,
            `auth.refresh.http status=${this.sharedDiagnostics.refreshHttpStatus ?? "none"} code=${code} supabaseCode=${this.sharedDiagnostics.refreshSupabaseErrorCode ?? "none"}`,
          );

          if (
            code === "invalid_refresh_token" ||
            code === "refresh_token_not_found" ||
            code === "refresh_token_reused" ||
            code === "refresh_token_expired"
          ) {
            appendAuthRefreshLog(this.paths, `auth.refresh.failed code=${code}`);
            this.markReauthenticationRequired(code, {
              httpStatus: this.sharedDiagnostics.refreshHttpStatus,
              supabaseErrorCode: this.sharedDiagnostics.refreshSupabaseErrorCode,
              supabaseErrorName: this.sharedDiagnostics.refreshSupabaseErrorName,
              safeMessage,
              responseContainedSession,
            });
          } else if (isTransientRefreshCode(code) && attempt + 1 < maxAttempts) {
            await sleepMs(400 * (attempt + 1));
            continue;
          } else {
            this.lastRefreshErrorCode = code;
            this.lastRefreshResult = "failure";
            this.recordRefreshFailure(code, {
              httpStatus: this.sharedDiagnostics.refreshHttpStatus,
              supabaseErrorCode: this.sharedDiagnostics.refreshSupabaseErrorCode,
              supabaseErrorName: this.sharedDiagnostics.refreshSupabaseErrorName,
              safeMessage,
              responseContainedSession,
            });
            appendAuthRefreshLog(this.paths, `auth.refresh.retry code=${code}`);
          }
          return {
            ok: false,
            code,
            message: safeMessage,
            errorCategory: refreshCodeToErrorCategory(code),
            httpStatus: this.sharedDiagnostics.refreshHttpStatus,
            supabaseErrorCode: this.sharedDiagnostics.refreshSupabaseErrorCode,
            supabaseErrorName: this.sharedDiagnostics.refreshSupabaseErrorName,
            safeMessage,
            firstFailureStage: resolveFirstRefreshFailureStage({
              refreshTokenPresent: true,
              refreshHttpAttempted: true,
              httpStatus: this.sharedDiagnostics.refreshHttpStatus,
              refreshCode: code,
              responseContainedSession,
              sessionPersisted: false,
              authenticatedClientReady: false,
              projectRefMismatch: false,
            }),
          };
        }

        if (
          this.sessionGeneration !== generationAtStart ||
          this.tokens?.refreshToken !== refreshTokenAtStart
        ) {
          this.lastRefreshResult = "still_fresh";
          this.sharedDiagnostics.refreshResult = "still_fresh";
          this.sharedDiagnostics.lastRefreshResult = "still_fresh";
          this.sharedDiagnostics.firstRefreshFailureStage = "none";
          this.sharedDiagnostics.refreshSupabaseErrorCode = null;
          this.sharedDiagnostics.refreshSupabaseErrorName = null;
          this.sharedDiagnostics.refreshSafeMessage = null;
          this.syncSharedDiagnostics({
            refreshHttpStatus:
              this.hasCloudSession() && !this.reauthenticationRequired
                ? null
                : this.sharedDiagnostics.refreshHttpStatus,
          });
          return { ok: true, code: "still_fresh", firstFailureStage: "none" };
        }

        const rotated = data.session!.refresh_token !== refreshTokenAtStart;
        this.tokens = {
          accessToken: data.session!.access_token,
          refreshToken: data.session!.refresh_token,
          expiresAt: resolveSessionExpiresAtMs(data.session!),
        };
        this.client = null;
        this.sessionUpdatedAt = new Date().toISOString();
        const persisted = this.persist(storedIssuerRef ?? configuredRef);
        this.lastRefreshSuccessAt = new Date().toISOString();
        this.lastRefreshErrorCode = null;
        this.lastRefreshResult = "success";
        this.sharedDiagnostics.refreshTokenRotated = rotated;
        this.sharedDiagnostics.refreshTokenChangedAfterSuccess = rotated;
        this.sharedDiagnostics.refreshedSessionPersisted =
          persisted.refreshTokenPersisted && persisted.accessTokenPersisted;
        this.sharedDiagnostics.refreshResult = "success";
        this.sharedDiagnostics.lastRefreshResult = "success";
        this.sharedDiagnostics.refreshErrorCode = null;
        this.sharedDiagnostics.refreshErrorCategory = null;
        this.sharedDiagnostics.firstSharedCloudFailureStage = "none";
        this.sharedDiagnostics.firstRefreshFailureStage = "none";
        this.sharedDiagnostics.refreshHttpAttempted = true;
        this.sharedDiagnostics.refreshHttpStatus = refreshHttpStatus ?? null;
        this.sharedDiagnostics.refreshSupabaseErrorCode = null;
        this.sharedDiagnostics.refreshSupabaseErrorName = null;
        this.sharedDiagnostics.refreshSafeMessage = null;
        this.syncSharedDiagnostics();
        appendAuthRefreshLog(
          this.paths,
          `auth.refresh.complete rotated=${rotated ? "true" : "false"} status=${refreshHttpStatus ?? "none"}`,
        );
        appendAuthRefreshLog(this.paths, "session.updated reason=token-refresh");
        this.notifySessionStored("token-refresh");
        return { ok: true, code: "refreshed", firstFailureStage: "none" };
      } catch (error) {
        const extracted = extractSupabaseAuthError(error);
        const code = classifyRefreshFailure(error);
        const safeMessage = sanitizeRefreshSafeMessage(extracted.message);
        this.sharedDiagnostics.refreshHttpStatus = refreshHttpStatus ?? extracted.status;
        this.sharedDiagnostics.refreshSupabaseErrorCode = extracted.code;
        this.sharedDiagnostics.refreshSupabaseErrorName = extracted.name;
        this.sharedDiagnostics.refreshSafeMessage = safeMessage;
        appendAuthRefreshLog(
          this.paths,
          `auth.refresh.http status=${this.sharedDiagnostics.refreshHttpStatus ?? "none"} code=${code} supabaseCode=${extracted.code ?? "none"}`,
        );

        if (
          code === "invalid_refresh_token" ||
          code === "refresh_token_not_found" ||
          code === "refresh_token_reused" ||
          code === "refresh_token_expired"
        ) {
          this.markReauthenticationRequired(code, {
            httpStatus: this.sharedDiagnostics.refreshHttpStatus,
            supabaseErrorCode: extracted.code,
            supabaseErrorName: extracted.name,
            safeMessage,
            responseContainedSession: false,
          });
        } else if (isTransientRefreshCode(code) && attempt + 1 < maxAttempts) {
          await sleepMs(400 * (attempt + 1));
          continue;
        } else {
          this.lastRefreshErrorCode = code;
          this.lastRefreshResult = "failure";
          this.recordRefreshFailure(code, {
            httpStatus: this.sharedDiagnostics.refreshHttpStatus,
            supabaseErrorCode: extracted.code,
            supabaseErrorName: extracted.name,
            safeMessage,
            responseContainedSession: false,
          });
          appendAuthRefreshLog(this.paths, `auth.refresh.retry code=${code}`);
        }
        return {
          ok: false,
          code,
          message: safeMessage,
          errorCategory: refreshCodeToErrorCategory(code),
          httpStatus: this.sharedDiagnostics.refreshHttpStatus,
          supabaseErrorCode: extracted.code,
          supabaseErrorName: extracted.name,
          safeMessage,
          firstFailureStage: resolveFirstRefreshFailureStage({
            refreshTokenPresent: true,
            refreshHttpAttempted: true,
            httpStatus: this.sharedDiagnostics.refreshHttpStatus,
            refreshCode: code,
            responseContainedSession: false,
            sessionPersisted: false,
            authenticatedClientReady: false,
            projectRefMismatch: false,
          }),
        };
      }
    }

    return {
      ok: false,
      code: "refresh_failed",
      errorCategory: "unknown_refresh_failure",
      firstFailureStage: "network_failure",
    };
  }

  private recordRefreshFailure(
    code: CloudSessionRefreshCode,
    input: {
      httpStatus: number | null;
      supabaseErrorCode: string | null;
      supabaseErrorName: string | null;
      safeMessage: string | null;
      responseContainedSession: boolean;
    },
  ): void {
    this.sharedDiagnostics.refreshResult = "failure";
    this.sharedDiagnostics.lastRefreshResult = "failure";
    this.sharedDiagnostics.refreshErrorCode = code;
    this.sharedDiagnostics.refreshErrorCategory = refreshCodeToErrorCategory(code);
    this.sharedDiagnostics.refreshHttpStatus = input.httpStatus;
    this.sharedDiagnostics.refreshSupabaseErrorCode = input.supabaseErrorCode;
    this.sharedDiagnostics.refreshSupabaseErrorName = input.supabaseErrorName;
    this.sharedDiagnostics.refreshSafeMessage = input.safeMessage;
    this.sharedDiagnostics.responseContainedSession = input.responseContainedSession;
    this.sharedDiagnostics.firstSharedCloudFailureStage = failureStageForRefreshCode(code);
    this.sharedDiagnostics.firstRefreshFailureStage = resolveFirstRefreshFailureStage({
      refreshTokenPresent: Boolean(this.tokens?.refreshToken),
      refreshHttpAttempted: this.sharedDiagnostics.refreshHttpAttempted,
      httpStatus: input.httpStatus,
      refreshCode: code,
      responseContainedSession: input.responseContainedSession,
      sessionPersisted: false,
      authenticatedClientReady: false,
      projectRefMismatch: code === "project_ref_mismatch",
    });
    this.syncSharedDiagnostics();
  }

  private markReauthenticationRequired(
    code: CloudSessionRefreshCode,
    input: {
      httpStatus: number | null;
      supabaseErrorCode: string | null;
      supabaseErrorName: string | null;
      safeMessage: string | null;
      responseContainedSession: boolean;
    },
  ): void {
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
    this.recordRefreshFailure(code, input);
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

  async getCloudAccessToken(
    config: SupabasePublicConfig,
    options?: { forceRefresh?: boolean },
  ): Promise<{
    accessToken: string | null;
    expired: boolean;
    errorCode: string | null;
  }> {
    if (!this.hasCloudSession()) {
      return { accessToken: null, expired: true, errorCode: "no_session" };
    }

    if (options?.forceRefresh || this.isAccessTokenExpired()) {
      const refresh = await this.refreshCloudSessionIfNeeded(config);
      if (!refresh.ok && !this.isCloudSessionFresh()) {
        return {
          accessToken: null,
          expired: true,
          errorCode: refresh.code ?? "refresh_failed",
        };
      }
    }

    const accessToken = this.tokens?.accessToken?.trim() ?? null;
    if (!accessToken) {
      return { accessToken: null, expired: true, errorCode: "no_access_token" };
    }

    return {
      accessToken,
      expired: this.isAccessTokenExpired(),
      errorCode: null,
    };
  }

  peekAuthenticatedClient(): SupabaseClient | null {
    if (!this.client || !this.hasCloudSession() || this.reauthenticationRequired) {
      return null;
    }
    if (!this.isCloudSessionFresh()) {
      return null;
    }
    return this.client;
  }

  async getAuthenticatedClient(config: SupabasePublicConfig): Promise<SupabaseClient | null> {
    if (!this.hasCloudSession()) {
      return null;
    }

    const cached = this.peekAuthenticatedClient();
    if (cached) {
      return cached;
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
    if (
      this.sharedDiagnostics.authenticatedClientReady !== ready ||
      this.sharedDiagnostics.authenticatedClientCreated !== ready
    ) {
      this.sharedDiagnostics.authenticatedClientReady = ready;
      this.sharedDiagnostics.authenticatedClientCreated = ready;
      this.syncSharedDiagnostics();
    }
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
        this.client = createDesktopSupabaseClient(config, {
          global: {
            headers: {
              Authorization: `Bearer ${this.tokens.accessToken}`,
            },
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

    const created = Boolean(this.client);
    if (this.sharedDiagnostics.authenticatedClientCreated !== created) {
      this.sharedDiagnostics.authenticatedClientCreated = created;
      this.syncSharedDiagnostics();
    }
    return created;
  }

  private persist(
    issuerProjectRef: string | null = null,
  ): { refreshTokenPersisted: boolean; accessTokenPersisted: boolean } {
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

    const resolvedIssuerRef =
      issuerProjectRef ?? this.sharedDiagnostics.storedSessionIssuerProjectRef ?? null;
    if (resolvedIssuerRef) {
      this.sharedDiagnostics.storedSessionIssuerProjectRef = resolvedIssuerRef;
    }

    const payload: StoredSupabaseSessionPayload = {
      userId: this.userId,
      sessionGeneration: this.sessionGeneration,
      issuerProjectRef: resolvedIssuerRef,
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
      const parsed = normalizePersistedSessionPayload(
        JSON.parse(decrypted) as LegacyStoredSupabaseSessionPayload,
      );
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
      this.sharedDiagnostics.storedSessionIssuerProjectRef = parsed.issuerProjectRef ?? null;
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
    const { updatedAt: _updatedAt, ...forCompare } = this.sharedDiagnostics;
    const serialized = JSON.stringify(forCompare);
    if (serialized === this.lastPersistedSharedDiagnosticsJson) {
      return;
    }
    this.lastPersistedSharedDiagnosticsJson = serialized;
    this.writeSharedDiagnostics?.(this.sharedDiagnostics);
  }
}

function failureStageForRefreshCode(code: CloudSessionRefreshCode): SharedCloudAuthFailureStage {
  switch (code) {
    case "network_error":
      return "refresh_network_failed";
    case "invalid_refresh_token":
    case "refresh_token_not_found":
    case "refresh_token_reused":
    case "refresh_token_expired":
      return "refresh_token_invalid";
    case "refresh_response_invalid":
      return "refresh_response_invalid";
    case "set_session_failed":
      return "set_session_failed";
    case "project_ref_mismatch":
      return "project_ref_mismatch";
    case "bad_supabase_config":
      return "none";
    default:
      return "none";
  }
}

function normalizePersistedSessionPayload(
  parsed: LegacyStoredSupabaseSessionPayload,
): StoredSupabaseSessionPayload {
  const accessToken = parsed.accessToken ?? parsed.access_token ?? "";
  const refreshToken = parsed.refreshToken ?? parsed.refresh_token ?? "";
  let expiresAt = parsed.expiresAt;
  if (typeof expiresAt !== "number") {
    if (typeof parsed.expires_at === "number" && parsed.expires_at > 0) {
      expiresAt = parsed.expires_at > 1_000_000_000_000 ? parsed.expires_at : parsed.expires_at * 1000;
    } else {
      expiresAt = 0;
    }
  }
  return {
    userId: parsed.userId ?? "",
    accessToken,
    refreshToken,
    expiresAt,
    sessionGeneration: parsed.sessionGeneration,
    issuerProjectRef: parsed.issuerProjectRef ?? null,
  };
}

function resolveSessionExpiresAtMs(session: {
  expires_at?: number | null;
  expires_in?: number | null;
}): number {
  if (typeof session.expires_at === "number" && session.expires_at > 0) {
    return session.expires_at * 1000;
  }
  if (typeof session.expires_in === "number" && session.expires_in > 0) {
    return Date.now() + session.expires_in * 1000;
  }
  return Date.now() + 3_600_000;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
