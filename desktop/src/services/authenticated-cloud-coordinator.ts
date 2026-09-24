import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CloudRuntimeConfigSource } from "./cloud-runtime-config";
import type { SupabasePublicConfig } from "./supabase-public-config";
import { SupabaseUserSessionService } from "./supabase-user-session";
import {
  logCloudAccessLifecycle,
  recordCloudAccessSessionRefreshAttempt,
  type AuthenticatedClientAcquisitionResult,
  type AuthenticatedClientProvider,
  type CloudAccessSessionState,
} from "./authenticated-client-provider";
import {
  buildSharedCloudAuthSnapshot,
  type SharedCloudAuthSnapshot,
} from "./shared-cloud-auth-snapshot";

export type CloudSessionStoredListener = (reason: string) => void;
export type CloudSessionClearedListener = () => void;

const SESSION_RESTORE_WAIT_MS = 8_000;

export class AuthenticatedCloudCoordinator implements AuthenticatedClientProvider {
  private static nextInstanceSerial = 1;
  readonly instanceIdHash: string;
  private readonly sessionClearListeners = new Set<CloudSessionClearedListener>();
  private readonly sessionStoredListeners = new Set<CloudSessionStoredListener>();
  private sessionRestorePromise: Promise<void> | null = null;
  private sessionRestoreCompleted = false;

  constructor(
    private readonly session: SupabaseUserSessionService,
    private readonly publicConfig: SupabasePublicConfig | null,
    private readonly publicConfigSource: CloudRuntimeConfigSource = "missing",
  ) {
    const serial = AuthenticatedCloudCoordinator.nextInstanceSerial++;
    this.instanceIdHash = createHash("sha256")
      .update(`AuthenticatedCloudCoordinator:${serial}`)
      .digest("hex")
      .slice(0, 12);
  }

  getInstanceIdHash(): string {
    return this.session.instanceIdHash;
  }

  setSessionRestorePromise(promise: Promise<void>): void {
    this.sessionRestorePromise = promise.finally(() => {
      this.sessionRestoreCompleted = true;
    });
  }

  isCloudConfigured(): boolean {
    return Boolean(this.publicConfig);
  }

  isSessionRestorePending(): boolean {
    return Boolean(this.sessionRestorePromise && !this.sessionRestoreCompleted);
  }

  getPublicConfig(): SupabasePublicConfig | null {
    return this.publicConfig;
  }

  hasCloudSession(): boolean {
    return this.session.hasCloudSession();
  }

  hasPersistedTokens(): boolean {
    return this.session.hasPersistedTokens();
  }

  requiresReauthentication(): boolean {
    return this.session.requiresReauthentication();
  }

  hasRestorableSession(): boolean {
    return this.session.hasPersistedTokens();
  }

  hasRestorableCloudSession(): boolean {
    return this.session.hasPersistedTokens();
  }

  isAuthenticatedCloudSessionAvailable(): boolean {
    return this.getAuthSnapshot().authenticatedCloudSessionAvailable;
  }

  isAuthenticatedClientReady(): boolean {
    return this.session.isAuthenticatedClientReady();
  }

  getAuthSnapshot(): SharedCloudAuthSnapshot {
    return buildSharedCloudAuthSnapshot({
      diagnostics: this.session.getSharedAuthDiagnostics(),
      hasCloudSession: this.session.hasCloudSession(),
      hasRestorableCloudSession: this.session.hasPersistedTokens(),
    });
  }

  getUserId(): string | null {
    return this.session.getUserId();
  }

  getSharedAuthDiagnostics(): import("./shared-cloud-auth-diagnostics").SharedCloudAuthDiagnostics {
    return this.session.getSharedAuthDiagnostics();
  }

  attachSharedDiagnosticsWriter(
    writer: (patch: Partial<import("./shared-cloud-auth-diagnostics").SharedCloudAuthDiagnostics>) => void,
  ): void {
    this.session.attachSharedDiagnosticsWriter(writer);
  }

  onReauthenticationRequired(listener: () => void): () => void {
    return this.session.onReauthenticationRequired(listener);
  }

  getSessionState(): CloudAccessSessionState {
    if (!this.publicConfig) {
      return "cloud_config_missing";
    }
    if (this.session.requiresReauthentication()) {
      return "invalid_refresh_token";
    }
    if (!this.session.hasCloudSession() && !this.session.hasPersistedTokens()) {
      return "no_persisted_session";
    }
    if (this.sessionRestorePromise && !this.sessionRestoreCompleted) {
      return "session_restoring";
    }
    const refreshCode = this.session.getRefreshDiagnostics().lastRefreshErrorCode;
    if (refreshCode === "invalid_refresh_token") {
      return "invalid_refresh_token";
    }
    if (
      refreshCode === "network_error" ||
      refreshCode === "refresh_failed" ||
      refreshCode === "set_session_failed"
    ) {
      return "session_refresh_failed_transient";
    }
    return "session_ready";
  }

  onSessionStored(listener: CloudSessionStoredListener): () => void {
    this.sessionStoredListeners.add(listener);
    return () => this.sessionStoredListeners.delete(listener);
  }

  onSessionCleared(listener: CloudSessionClearedListener): () => void {
    this.sessionClearListeners.add(listener);
    return () => this.sessionClearListeners.delete(listener);
  }

  notifySessionStored(reason = "cloud-session"): void {
    for (const listener of this.sessionStoredListeners) {
      listener(reason);
    }
  }

  notifySessionCleared(): void {
    for (const listener of this.sessionClearListeners) {
      listener();
    }
  }

  async getClient(): Promise<SupabaseClient | null> {
    const result = await this.acquireAuthenticatedClient("getClient");
    return result.client;
  }

  async acquireAuthenticatedClient(
    reason: string,
    options?: { forceRefresh?: boolean },
  ): Promise<AuthenticatedClientAcquisitionResult> {
    logCloudAccessLifecycle("client_request", {
      reason,
      forceRefresh: Boolean(options?.forceRefresh),
      configured: this.isCloudConfigured(),
      hasSession: this.hasCloudSession(),
    });

    if (!this.publicConfig) {
      logCloudAccessLifecycle("client_unavailable", {
        reasonCode: "cloud_config_missing",
      });
      return {
        client: null,
        sessionState: "cloud_config_missing",
        errorCode: "cloud_config_missing",
        clientCreationAttempted: false,
        clientCreationSucceeded: false,
        sessionRefreshAttempted: false,
        sessionRefreshResult: "not_attempted",
      };
    }

    if (!this.session.hasCloudSession()) {
      logCloudAccessLifecycle("client_unavailable", {
        reasonCode: "no_persisted_session",
      });
      return {
        client: null,
        sessionState: "no_persisted_session",
        errorCode: "no_session",
        clientCreationAttempted: false,
        clientCreationSucceeded: false,
        sessionRefreshAttempted: false,
        sessionRefreshResult: "not_attempted",
      };
    }

    if (!options?.forceRefresh) {
      const cachedClient = this.session.peekAuthenticatedClient();
      if (cachedClient) {
        logCloudAccessLifecycle("client_available", {
          sessionRefreshResult: "cache_hit",
        });
        return {
          client: cachedClient,
          sessionState: "session_ready",
          errorCode: null,
          clientCreationAttempted: false,
          clientCreationSucceeded: true,
          sessionRefreshAttempted: false,
          sessionRefreshResult: "not_attempted",
        };
      }
    }

    if (this.sessionRestorePromise && !this.sessionRestoreCompleted && !options?.forceRefresh) {
      logCloudAccessLifecycle("session_restore_observed", {
        waiting: true,
      });
      try {
        await Promise.race([
          this.sessionRestorePromise,
          new Promise<void>((resolve) => setTimeout(resolve, SESSION_RESTORE_WAIT_MS)),
        ]);
      } catch {
        // Restore failure is handled by subsequent client acquisition.
      }
    }

    let sessionRefreshAttempted = false;
    let sessionRefreshResult: AuthenticatedClientAcquisitionResult["sessionRefreshResult"] =
      "not_attempted";

    const finalizeAcquisition = (
      result: AuthenticatedClientAcquisitionResult,
    ): AuthenticatedClientAcquisitionResult => {
      if (result.sessionRefreshAttempted) {
        recordCloudAccessSessionRefreshAttempt();
      }
      return result;
    };

    const attemptClient = async (): Promise<SupabaseClient | null> => {
      if (options?.forceRefresh) {
        sessionRefreshAttempted = true;
        const refresh = await this.session.refreshCloudSessionIfNeeded(this.publicConfig!, {
          configSource: this.publicConfigSource,
        });
        sessionRefreshResult = refresh.ok
          ? refresh.code === "still_fresh"
            ? "still_fresh"
            : "success"
          : "failure";
        return this.session.reacquireAuthenticatedClient(this.publicConfig!, {
          forceRefresh: true,
        });
      }

      sessionRefreshAttempted = true;
      const refresh = await this.session.refreshCloudSessionIfNeeded(this.publicConfig!, {
        configSource: this.publicConfigSource,
      });
      sessionRefreshResult = refresh.ok
        ? refresh.code === "still_fresh"
          ? "still_fresh"
          : "success"
        : "failure";
      return this.session.getAuthenticatedClient(this.publicConfig!);
    };

    let client = await attemptClient();
    if (client) {
      logCloudAccessLifecycle("client_available", {
        sessionRefreshResult,
      });
      return finalizeAcquisition({
        client,
        sessionState: "session_ready",
        errorCode: null,
        clientCreationAttempted: true,
        clientCreationSucceeded: true,
        sessionRefreshAttempted,
        sessionRefreshResult,
      });
    }

    if (!options?.forceRefresh) {
      logCloudAccessLifecycle("client_unavailable", {
        reasonCode: "retry_after_restore",
      });
      client = await this.session.reacquireAuthenticatedClient(this.publicConfig, {
        forceRefresh: true,
      });
      sessionRefreshAttempted = true;
      sessionRefreshResult = client ? "success" : "failure";
    }

    if (client) {
      logCloudAccessLifecycle("client_available", {
        sessionRefreshResult,
        recovered: true,
      });
      return finalizeAcquisition({
        client,
        sessionState: "session_ready",
        errorCode: null,
        clientCreationAttempted: true,
        clientCreationSucceeded: true,
        sessionRefreshAttempted,
        sessionRefreshResult,
      });
    }

    const refreshCode = this.session.getRefreshDiagnostics().lastRefreshErrorCode;
    if (refreshCode === "invalid_refresh_token") {
      logCloudAccessLifecycle("client_unavailable", {
        reasonCode: "invalid_refresh_token",
      });
      return finalizeAcquisition({
        client: null,
        sessionState: "invalid_refresh_token",
        errorCode: "invalid_refresh_token",
        clientCreationAttempted: true,
        clientCreationSucceeded: false,
        sessionRefreshAttempted,
        sessionRefreshResult,
      });
    }

    if (
      refreshCode === "network_error" ||
      refreshCode === "refresh_failed" ||
      refreshCode === "set_session_failed"
    ) {
      logCloudAccessLifecycle("client_unavailable", {
        reasonCode: "session_refresh_failed_transient",
        refreshCode,
      });
      return finalizeAcquisition({
        client: null,
        sessionState: "session_refresh_failed_transient",
        errorCode: "token_refresh_failed",
        clientCreationAttempted: true,
        clientCreationSucceeded: false,
        sessionRefreshAttempted,
        sessionRefreshResult: "failure",
      });
    }

    logCloudAccessLifecycle("client_unavailable", {
      reasonCode: "authenticated_client_initialization_failed",
      refreshCode: refreshCode ?? "unknown",
    });

    return finalizeAcquisition({
      client: null,
      sessionState: "authenticated_client_initialization_failed",
      errorCode: "client_creation_failed",
      clientCreationAttempted: true,
      clientCreationSucceeded: false,
      sessionRefreshAttempted,
      sessionRefreshResult,
    });
  }

  async restorePersistedSession(): Promise<{
    restored: boolean;
    sessionAvailable: boolean;
    errorCode: string | null;
  }> {
    const configured = this.isCloudConfigured();
    const hasSession = this.hasCloudSession();
    if (!configured) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[CloudCoordinator] session_restore", {
          ok: false,
          configured,
          sessionAvailable: false,
          errorCode: "missing_cloud_config",
        });
      }
      return { restored: false, sessionAvailable: false, errorCode: "missing_cloud_config" };
    }
    if (!hasSession) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[CloudCoordinator] session_restore", {
          ok: false,
          configured,
          sessionAvailable: false,
          errorCode: "no_persisted_session",
        });
      }
      return { restored: false, sessionAvailable: false, errorCode: "no_persisted_session" };
    }

    try {
      const acquisition = await this.acquireAuthenticatedClient("startup_restore");
      const clientReady = Boolean(acquisition.client);
      const errorCode = clientReady ? null : (acquisition.errorCode ?? "session_refresh_failed");
      if (process.env.NODE_ENV !== "production") {
        console.debug("[CloudCoordinator] session_restore", {
          ok: clientReady,
          configured,
          sessionAvailable: hasSession,
          clientReady,
          errorCode,
        });
      }
      return {
        restored: clientReady,
        sessionAvailable: hasSession,
        errorCode: hasSession && clientReady ? null : errorCode,
      };
    } catch (error) {
      const errorCode = "session_restore_failed";
      if (process.env.NODE_ENV !== "production") {
        console.debug("[CloudCoordinator] session_restore", {
          ok: false,
          configured,
          sessionAvailable: false,
          errorCode,
        });
      }
      return { restored: false, sessionAvailable: false, errorCode };
    }
  }

  async waitForSessionRestore(timeoutMs = SESSION_RESTORE_WAIT_MS): Promise<void> {
    if (this.sessionRestoreCompleted) {
      return;
    }
    if (!this.sessionRestorePromise) {
      return;
    }
    await Promise.race([
      this.sessionRestorePromise.catch(() => undefined),
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      }),
    ]);
  }

  async ensureAuthenticatedClient(
    reason: string,
    options?: { forceRefresh?: boolean },
  ): Promise<AuthenticatedClientAcquisitionResult> {
    await this.waitForSessionRestore();
    return this.acquireAuthenticatedClient(reason, options);
  }

  async ping(): Promise<boolean> {
    try {
      const client = await this.getClient();
      if (!client) {
        return false;
      }
      const { error } = await client.from("profiles").select("id").limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  async getCloudAccessToken(options?: { forceRefresh?: boolean }): Promise<{
    accessToken: string | null;
    expired: boolean;
    errorCode: string | null;
  }> {
    if (!this.publicConfig) {
      return { accessToken: null, expired: true, errorCode: "cloud_config_missing" };
    }
    await this.waitForSessionRestore();
    return this.session.getCloudAccessToken(this.publicConfig, options);
  }
}
