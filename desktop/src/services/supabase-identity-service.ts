import type { AuthLicenseManager } from "./auth-license-manager";
import type { LocalUsersRepository } from "../repositories/local-users-repository";
import type { AccessAuthorizationService } from "./access-authorization-service";
import type { AuthenticatedCloudCoordinator } from "./authenticated-cloud-coordinator";
import type { SupabasePublicConfig } from "./supabase-public-config";
import { normalizeEmail } from "../auth/normalize-email";
import { mapSupabaseProfileRoleToAuthCacheRole } from "../auth/supabase-role-mapping";
import {
  fetchSupabaseProfileByUserId,
  type SupabaseProfileRow,
} from "./fetch-supabase-profile";
import {
  extractSupabaseProjectRef,
  logSupabaseProjectDiagnostics,
} from "./supabase-project-ref";
import { mapSupabaseProfileRoleToPlatformRole } from "./user-identity-reconciliation-service";
import {
  getLocalUserConflictDiagnostics,
  getLocalIdentitySyncDiagnostics,
  reconcileLocalUserIdentity,
} from "./local-user-identity-reconciliation";
import { getCachedProfileTeamColumn } from "./supabase-profile-schema";
import type { LocalDatabase } from "../database/connection";
import type { TeamsRepository } from "../repositories/teams-repository";
import type { TeamMembershipsRepository } from "../repositories/team-memberships-repository";
import { TimeoutError, withTimeout } from "../utils/with-timeout";

export const IDENTITY_TOTAL_TIMEOUT_MS = 15_000;
export const AUTH_VALIDATION_TIMEOUT_MS = 8_000;
export const PROFILE_QUERY_TIMEOUT_MS = 8_000;

function isNetworkError(error: unknown): boolean {
  if (error instanceof TimeoutError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return true;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("socket") ||
    message.includes("offline")
  );
}

export type IdentityStatus =
  | "idle"
  | "loading"
  | "online-ready"
  | "offline-ready"
  | "stale-session"
  | "missing-profile"
  | "identity-conflict"
  | "error";

export type CacheSyncStatus = "idle" | "pending" | "synced" | "error";

export type ResolvedIdentity = {
  status: IdentityStatus;
  source: "supabase" | "local-cache" | "none";
  authUserId: string | null;
  email: string | null;
  profile: {
    fullName: string | null;
    teamName: string | null;
    role: string | null;
  };
  supabaseProjectRef: string | null;
  localUserId: string | null;
  errorMessage: string | null;
  profileQueryError: string | null;
  profileRowFound: boolean;
  authUserIdRepaired: boolean;
  retryCount: number;
  lastErrorAt: string | null;
  authSessionPresent: boolean;
  supabaseUserValidation: "pending" | "valid" | "invalid" | "skipped";
  profileQueryStatus: "pending" | "found" | "missing" | "error" | "skipped";
  supabaseProfileResolved: boolean;
  cacheSync: {
    status: CacheSyncStatus;
    message: string | null;
    errorCode: string | null;
  };
  identityAttemptId: number | null;
  identityAttemptDurationMs: number | null;
  localCacheSyncErrorCode: string | null;
  conflictingLocalUserId: string | null;
};

const EMPTY_IDENTITY: ResolvedIdentity = {
  status: "idle",
  source: "none",
  authUserId: null,
  email: null,
  profile: {
    fullName: null,
    teamName: null,
    role: null,
  },
  supabaseProjectRef: null,
  localUserId: null,
  errorMessage: null,
  profileQueryError: null,
  profileRowFound: false,
  authUserIdRepaired: false,
  retryCount: 0,
  lastErrorAt: null,
  authSessionPresent: false,
  supabaseUserValidation: "pending",
  profileQueryStatus: "pending",
  supabaseProfileResolved: false,
  cacheSync: {
    status: "idle",
    message: null,
    errorCode: null,
  },
  identityAttemptId: null,
  identityAttemptDurationMs: null,
  localCacheSyncErrorCode: null,
  conflictingLocalUserId: null,
};

export class SupabaseIdentityService {
  private resolved: ResolvedIdentity = { ...EMPTY_IDENTITY };
  private loadingPromise: Promise<ResolvedIdentity> | null = null;
  private attemptCounter = 0;
  private readonly projectRef: string | null;

  constructor(
    private readonly cloud: AuthenticatedCloudCoordinator,
    private readonly publicConfig: SupabasePublicConfig | null,
    private readonly auth: AuthLicenseManager,
    private readonly users: LocalUsersRepository,
    private readonly accessAuthorization: AccessAuthorizationService | null,
    private readonly db: LocalDatabase,
    private readonly teams: TeamsRepository,
    private readonly teamMemberships: TeamMembershipsRepository,
  ) {
    this.projectRef = publicConfig
      ? extractSupabaseProjectRef(publicConfig.supabaseUrl)
      : null;
  }

  private async getSupabase() {
    return this.cloud.getClient();
  }

  getProjectRef(): string | null {
    return this.projectRef;
  }

  getResolvedIdentity(): ResolvedIdentity {
    return this.resolved;
  }

  isOnlineReady(): boolean {
    return this.resolved.status === "online-ready";
  }

  async fetchRemoteProfile(supabaseUserId: string) {
    const supabase = await this.getSupabase();
    if (!supabase) {
      return null;
    }

    const result = await fetchSupabaseProfileByUserId(supabase, supabaseUserId);
    if (result.status === "found") {
      return result.profile;
    }
    return null;
  }

  syncProfileFieldsToLocalUser(input: {
    localUserId: string;
    fullName?: string | null;
    phone?: string | null;
    profileTeam?: string | null;
  }) {
    const syncedAt = new Date().toISOString();
    this.users.updateSyncedProfileFields({
      userId: input.localUserId,
      fullName: input.fullName,
      phone: input.phone,
      profileTeam: input.profileTeam,
      syncedAt,
    });
  }

  reset(): void {
    this.loadingPromise = null;
    this.resolved = { ...EMPTY_IDENTITY };
  }

  async retry(reason = "manual"): Promise<ResolvedIdentity> {
    this.loadingPromise = null;
    return this.resolve({ force: true, reason });
  }

  async ensureLoaded(reason = "startup"): Promise<ResolvedIdentity> {
    return this.resolve({ reason });
  }

  async refresh(reason = "manual"): Promise<ResolvedIdentity> {
    return this.resolve({ force: true, reason });
  }

  async resolve(options?: {
    force?: boolean;
    reason?: string;
  }): Promise<ResolvedIdentity> {
    if (this.loadingPromise && !options?.force) {
      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[identity-resolution] Joining in-flight identity attempt ${this.resolved.identityAttemptId ?? "unknown"} (${options?.reason ?? "resolve"}).`,
        );
      }
      return this.loadingPromise;
    }

    if (
      !options?.force &&
      (this.resolved.status === "online-ready" ||
        this.resolved.status === "offline-ready")
    ) {
      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[identity-resolution] Identity already ${this.resolved.status}; skipping new attempt (${options?.reason ?? "resolve"}).`,
        );
      }
      return this.resolved;
    }

    const attemptId = ++this.attemptCounter;
    const startedAt = Date.now();
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[identity-resolution] identity-attempt: ${attemptId} started (${options?.reason ?? "resolve"})`,
      );
    }

    this.loadingPromise = this.loadIdentity(options?.reason ?? "resolve", attemptId, startedAt);

    try {
      return await this.loadingPromise;
    } catch (error) {
      const failed = this.mapThrownError(error, attemptId, startedAt);
      this.resolved = failed;
      return failed;
    } finally {
      this.loadingPromise = null;
      this.resolved = {
        ...this.resolved,
        identityAttemptDurationMs: Date.now() - startedAt,
      };
    }
  }

  getDebugSnapshot(): Record<string, unknown> {
    const authUser = this.auth.getAuthenticatedUser();
    const conflictDiagnostics =
      authUser && this.resolved.localCacheSyncErrorCode
        ? getLocalIdentitySyncDiagnostics({
            db: this.db,
            users: this.users,
            email: authUser.email,
            supabaseUserId: authUser.userId,
          })
        : null;

    return {
      configuredSupabaseProjectRef: this.projectRef,
      authenticated: Boolean(authUser),
      userId: authUser?.userId ?? null,
      email: authUser?.email ?? null,
      profileFound: this.resolved.profileRowFound,
      fullName: this.resolved.profile.fullName,
      team: this.resolved.profile.teamName,
      role: this.resolved.profile.role,
      identityStatus: this.resolved.status,
      identitySource: this.resolved.source,
      profileQueryError: this.resolved.profileQueryError,
      authUserIdRepaired: this.resolved.authUserIdRepaired,
      localUserId: this.resolved.localUserId,
      errorMessage: this.resolved.errorMessage,
      retryCount: this.resolved.retryCount,
      authSessionPresent: this.resolved.authSessionPresent,
      supabaseUserValidation: this.resolved.supabaseUserValidation,
      profileQueryStatus: this.resolved.profileQueryStatus,
      lastErrorAt: this.resolved.lastErrorAt,
      loadingPromiseActive: this.loadingPromise !== null,
      supabaseProfileResolved: this.resolved.supabaseProfileResolved,
      localCacheSyncStatus: this.resolved.cacheSync.status,
      localCacheSyncErrorCode: this.resolved.localCacheSyncErrorCode,
      currentAuthUserId: this.resolved.authUserId,
      conflictingLocalUserId: this.resolved.conflictingLocalUserId,
      identityAttemptId: this.resolved.identityAttemptId,
      identityAttemptDurationMs: this.resolved.identityAttemptDurationMs,
      profileSchemaMode: getCachedProfileTeamColumn(),
      localUserDiagnostics: conflictDiagnostics,
    };
  }

  private mapThrownError(
    error: unknown,
    attemptId: number,
    startedAt: number,
  ): ResolvedIdentity {
    const message =
      error instanceof TimeoutError
        ? "NEUD timed out while loading your Supabase account."
        : error instanceof Error
          ? error.message
          : "NEUD could not load your account from Supabase.";

    return {
      ...this.resolved,
      status: "error",
      source: this.resolved.source === "supabase" ? "supabase" : "none",
      errorMessage: message,
      profileQueryError: message,
      lastErrorAt: new Date().toISOString(),
      retryCount: this.resolved.retryCount + 1,
      identityAttemptId: attemptId,
      identityAttemptDurationMs: Date.now() - startedAt,
      cacheSync: {
        status: "error",
        message,
        errorCode:
          error instanceof TimeoutError
            ? "IDENTITY_RESOLUTION_TIMEOUT"
            : "IDENTITY_RESOLUTION_FAILED",
      },
    };
  }

  private async loadIdentity(
    reason: string,
    attemptId: number,
    startedAt: number,
  ): Promise<ResolvedIdentity> {
    const authUser = this.auth.getAuthenticatedUser();
    const authStatus = this.auth.getStatus();

    if (!authUser || !authStatus.allowed) {
      this.resolved = {
        ...EMPTY_IDENTITY,
        status: "idle",
        source: "none",
        authSessionPresent: false,
        supabaseUserValidation: "skipped",
        profileQueryStatus: "skipped",
        identityAttemptId: attemptId,
        identityAttemptDurationMs: Date.now() - startedAt,
      };
      return this.resolved;
    }

    this.resolved = {
      ...this.resolved,
      status: "loading",
      authUserId: authUser.userId,
      email: authUser.email,
      authSessionPresent: true,
      supabaseUserValidation: "pending",
      profileQueryStatus: "pending",
      errorMessage: null,
      profileQueryError: null,
      identityAttemptId: attemptId,
      cacheSync: {
        status: "pending",
        message: null,
        errorCode: null,
      },
    };

    logSupabaseProjectDiagnostics({
      authProjectRef: this.projectRef,
      profileProjectRef: this.projectRef,
      accessProjectRef: this.projectRef,
    });

    const isOnlineCandidate =
      this.publicConfig !== null && this.cloud.hasCloudSession();

    if (isOnlineCandidate) {
      try {
        const online = await withTimeout(
          this.loadFromSupabase(reason, attemptId, startedAt, authUser.userId),
          IDENTITY_TOTAL_TIMEOUT_MS,
          "Supabase identity resolution timed out",
        );
        if (online) {
          return online;
        }
      } catch (error) {
        const message =
          error instanceof TimeoutError
            ? "NEUD timed out while loading your Supabase account."
            : error instanceof Error
              ? error.message
              : "NEUD could not load your account from Supabase.";

        if (isNetworkError(error)) {
          return this.loadFromLocalCache(
            authUser.userId,
            true,
            "Your account profile could not be refreshed. NEUD is using cached access.",
          );
        }

        this.resolved = {
          ...this.resolved,
          status: "error",
          source: "none",
          errorMessage: message,
          profileQueryError: message,
          lastErrorAt: new Date().toISOString(),
          retryCount: this.resolved.retryCount + 1,
          identityAttemptDurationMs: Date.now() - startedAt,
          cacheSync: {
            status: "error",
            message,
            errorCode:
              error instanceof TimeoutError
                ? "IDENTITY_RESOLUTION_TIMEOUT"
                : "IDENTITY_RESOLUTION_FAILED",
          },
        };

        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[identity-resolution] identity-attempt: ${attemptId} failed (${reason}): ${message}`,
          );
        }

        return this.resolved;
      }
    }

    return this.loadFromLocalCache(authUser.userId, !isOnlineCandidate);
  }

  private async loadFromSupabase(
    reason: string,
    attemptId: number,
    startedAt: number,
    previousAuthUserId: string,
  ): Promise<ResolvedIdentity | null> {
    const supabase = await this.getSupabase();
    if (!supabase) {
      return null;
    }

    const authUser = this.auth.getAuthenticatedUser();
    if (!authUser) {
      return null;
    }

    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[identity-resolution] identity-attempt: ${attemptId} Supabase profile lookup started (${reason}) for ${authUser.userId}.`,
      );
    }

    const effectiveUserId = authUser.userId;

    const verification = await withTimeout(
      supabase.auth.getUser(),
      AUTH_VALIDATION_TIMEOUT_MS,
      "Supabase auth user lookup timed out",
    );

    if (verification.error || !verification.data.user) {
      const message =
        verification.error?.message ||
        "Your saved Supabase session is no longer valid. Sign in again.";

      if (verification.error && isNetworkError(verification.error)) {
        return this.loadFromLocalCache(
          effectiveUserId,
          true,
          "Your account profile could not be refreshed. NEUD is using cached access.",
        );
      }

      this.resolved = {
        ...EMPTY_IDENTITY,
        status: "stale-session",
        source: "none",
        authUserId: effectiveUserId,
        email: authUser.email,
        errorMessage: message,
        profileQueryError: message,
        authSessionPresent: true,
        supabaseUserValidation: "invalid",
        profileQueryStatus: "skipped",
        lastErrorAt: new Date().toISOString(),
        identityAttemptId: attemptId,
        identityAttemptDurationMs: Date.now() - startedAt,
      };
      return this.resolved;
    }

    const profileResult = await withTimeout(
      fetchSupabaseProfileByUserId(supabase, effectiveUserId),
      PROFILE_QUERY_TIMEOUT_MS,
      "Supabase profile lookup timed out",
    );

    if (profileResult.status === "error") {
      if (isNetworkError(new Error(profileResult.error))) {
        return this.loadFromLocalCache(
          effectiveUserId,
          true,
          "Your account profile could not be refreshed. NEUD is using cached access.",
        );
      }

      this.resolved = {
        ...EMPTY_IDENTITY,
        status: "error",
        source: "none",
        authUserId: effectiveUserId,
        email: authUser.email,
        errorMessage:
          "NEUD could not load your account profile from Supabase. Project access cannot be determined.",
        profileQueryError: profileResult.error,
        authSessionPresent: true,
        supabaseUserValidation: "valid",
        profileQueryStatus: "error",
        lastErrorAt: new Date().toISOString(),
        retryCount: this.resolved.retryCount + 1,
        identityAttemptId: attemptId,
        identityAttemptDurationMs: Date.now() - startedAt,
      };
      return this.resolved;
    }

    if (profileResult.status === "missing") {
      this.resolved = {
        ...EMPTY_IDENTITY,
        status: "missing-profile",
        source: "none",
        authUserId: effectiveUserId,
        email: authUser.email,
        errorMessage: "Your account profile is missing. Contact an Owner.",
        profileQueryError: "Profile row missing",
        authSessionPresent: true,
        supabaseUserValidation: "valid",
        profileQueryStatus: "missing",
        lastErrorAt: new Date().toISOString(),
        identityAttemptId: attemptId,
        identityAttemptDurationMs: Date.now() - startedAt,
      };
      return this.resolved;
    }

    if (profileResult.profile.id !== effectiveUserId) {
      this.resolved = {
        ...EMPTY_IDENTITY,
        status: "error",
        source: "none",
        authUserId: effectiveUserId,
        email: authUser.email,
        errorMessage: "Profile identity mismatch detected for the current session.",
        profileQueryError: "Profile row ID does not match authenticated user ID.",
        profileRowFound: true,
        authSessionPresent: true,
        supabaseUserValidation: "valid",
        profileQueryStatus: "found",
        lastErrorAt: new Date().toISOString(),
        identityAttemptId: attemptId,
        identityAttemptDurationMs: Date.now() - startedAt,
      };
      return this.resolved;
    }

    this.publishOnlineIdentity({
      profile: profileResult.profile,
      authUserId: effectiveUserId,
      email: authUser.email,
      authUserIdRepaired: false,
      attemptId,
      startedAt,
    });

    await this.syncLocalCache({
      profile: profileResult.profile,
      authUserId: effectiveUserId,
      email: authUser.email,
      previousAuthUserId,
      attemptId,
    });

    return this.resolved;
  }

  private publishOnlineIdentity(input: {
    profile: SupabaseProfileRow;
    authUserId: string;
    email: string;
    authUserIdRepaired: boolean;
    attemptId: number;
    startedAt: number;
  }) {
    const authUser = this.auth.getAuthenticatedUser();
    if (!authUser) {
      return;
    }

    this.auth.storeVerifiedSession({
      userId: input.authUserId,
      email: input.email,
      displayName: input.profile.full_name,
      team: input.profile.team,
      role: mapSupabaseProfileRoleToAuthCacheRole(input.profile.role),
      deviceId: authUser.deviceId,
      supabaseProjectRef: this.projectRef,
      profileSyncedAt: new Date().toISOString(),
    });
    this.auth.setConnectionOnline(true);

    this.resolved = {
      status: "online-ready",
      source: "supabase",
      authUserId: input.authUserId,
      email: input.email,
      profile: {
        fullName: input.profile.full_name,
        teamName: input.profile.team,
        role: input.profile.role,
      },
      supabaseProjectRef: this.projectRef,
      localUserId: null,
      errorMessage: null,
      profileQueryError: null,
      profileRowFound: true,
      authUserIdRepaired: input.authUserIdRepaired,
      retryCount: this.resolved.retryCount,
      lastErrorAt: null,
      authSessionPresent: true,
      supabaseUserValidation: "valid",
      profileQueryStatus: "found",
      supabaseProfileResolved: true,
      cacheSync: {
        status: "pending",
        message: null,
        errorCode: null,
      },
      identityAttemptId: input.attemptId,
      identityAttemptDurationMs: Date.now() - input.startedAt,
      localCacheSyncErrorCode: null,
      conflictingLocalUserId: null,
    };

    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[identity-resolution] identity-attempt: ${input.attemptId} Supabase identity ready userId=${input.authUserId} fullName=${this.resolved.profile.fullName ? "set" : "missing"} team=${this.resolved.profile.teamName ? "set" : "missing"} role=${this.resolved.profile.role ?? "none"} source=supabase`,
      );
    }
  }

  private async syncLocalCache(input: {
    profile: SupabaseProfileRow;
    authUserId: string;
    email: string;
    previousAuthUserId: string;
    attemptId: number;
  }) {
    try {
      const reconciliation = await reconcileLocalUserIdentity({
        db: this.db,
        users: this.users,
        supabaseUserId: input.authUserId,
        email: input.email,
        fullName: input.profile.full_name?.trim() || "NEUD User",
        platformRole: mapSupabaseProfileRoleToPlatformRole(input.profile.role),
        phone: input.profile.phone_number,
        profileTeam: input.profile.team,
        previousAuthUserId: input.previousAuthUserId,
      });

      if (reconciliation.status === "synced" || reconciliation.status === "reconciled") {
        const context =
          this.accessAuthorization?.getAuthorizationContext(input.authUserId) ?? null;
        this.resolved = {
          ...this.resolved,
          localUserId: reconciliation.userId ?? context?.userId ?? null,
          errorMessage: null,
          localCacheSyncErrorCode: null,
          conflictingLocalUserId: null,
          cacheSync: {
            status: reconciliation.status === "reconciled" ? "synced" : "synced",
            message:
              reconciliation.status === "reconciled"
                ? "Local identity cache reconciled."
                : null,
            errorCode: null,
          },
        };
        if (process.env.NODE_ENV !== "production") {
          console.info(
            `[identity-resolution] identity-attempt: ${input.attemptId} local cache sync ${reconciliation.status} localUserId=${reconciliation.userId}${reconciliation.status === "reconciled" ? ` migratedFrom=${reconciliation.obsoleteUserId} refs=${reconciliation.migratedReferenceCount}` : ""}`,
          );
        }
        return;
      }

      if (reconciliation.status === "conflict") {
        this.resolved = {
          ...this.resolved,
          localCacheSyncErrorCode: reconciliation.code,
          conflictingLocalUserId: reconciliation.conflictingLocalUserId,
          cacheSync: {
            status: "error",
            message: reconciliation.message,
            errorCode: reconciliation.code,
          },
        };
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[identity-resolution] identity-attempt: ${input.attemptId} local cache conflict: ${reconciliation.message}`,
          );
        }
        return;
      }

      this.resolved = {
        ...this.resolved,
        cacheSync: {
          status: "error",
          message: reconciliation.message,
          errorCode: reconciliation.code,
        },
        localCacheSyncErrorCode: reconciliation.code,
      };
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[identity-resolution] identity-attempt: ${input.attemptId} local cache sync failed: ${reconciliation.message}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Local identity cache could not be updated.";
      this.resolved = {
        ...this.resolved,
        cacheSync: {
          status: "error",
          message,
          errorCode: "LOCAL_RECONCILIATION_FAILED",
        },
        localCacheSyncErrorCode: "LOCAL_RECONCILIATION_FAILED",
      };
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[identity-resolution] identity-attempt: ${input.attemptId} local cache sync failed: ${message}`,
        );
      }
    }
  }

  private loadFromLocalCache(
    authUserId: string,
    offline: boolean,
    fallbackMessage?: string,
  ): ResolvedIdentity {
    const authUser = this.auth.getAuthenticatedUser();
    const cachedProjectRef = authUser?.supabaseProjectRef ?? null;

    if (
      cachedProjectRef &&
      this.projectRef &&
      cachedProjectRef !== this.projectRef
    ) {
      this.resolved = {
        ...EMPTY_IDENTITY,
        status: "error",
        source: "none",
        authUserId,
        email: authUser?.email ?? null,
        errorMessage:
          "Cached identity belongs to a different Supabase project. Sign in again while online.",
        profileQueryError: "Supabase project reference mismatch",
        authSessionPresent: true,
        supabaseUserValidation: "invalid",
        profileQueryStatus: "skipped",
        lastErrorAt: new Date().toISOString(),
      };
      return this.resolved;
    }

    const context = this.accessAuthorization?.getAuthorizationContext(authUserId) ?? null;
    const localUser =
      this.users.resolveByAuthUserId(authUserId) ??
      this.users.getById(authUserId) ??
      (authUser?.email ? this.users.getByEmail(authUser.email) : null);
    const fullName =
      authUser?.displayName?.trim() ||
      localUser?.fullName?.trim() ||
      context?.displayName?.trim() ||
      null;
    const teamName =
      authUser?.team?.trim() || localUser?.profileTeam?.trim() || null;
    const role =
      authUser?.role?.trim() || localUser?.platformRole || context?.platformRole || null;

    if (!fullName && !teamName && !role) {
      this.resolved = {
        ...EMPTY_IDENTITY,
        status: offline ? "offline-ready" : "error",
        source: offline ? "local-cache" : "none",
        authUserId,
        email: authUser?.email ?? null,
        localUserId: localUser?.id ?? context?.userId ?? null,
        supabaseProjectRef: cachedProjectRef,
        errorMessage:
          fallbackMessage ??
          (offline
            ? "Your account profile could not be refreshed. NEUD is using cached access."
            : "Account could not be loaded."),
        authSessionPresent: true,
        supabaseUserValidation: offline ? "skipped" : "invalid",
        profileQueryStatus: offline ? "skipped" : "error",
        lastErrorAt: new Date().toISOString(),
      };
      return this.resolved;
    }

    this.resolved = {
      status: offline ? "offline-ready" : "online-ready",
      source: "local-cache",
      authUserId,
      email: authUser?.email ?? null,
      profile: {
        fullName,
        teamName,
        role,
      },
      supabaseProjectRef: cachedProjectRef,
      localUserId: localUser?.id ?? context?.userId ?? null,
      errorMessage:
        fallbackMessage ??
        (offline
          ? "Your account profile could not be refreshed. NEUD is using cached access."
          : null),
      profileQueryError: null,
      profileRowFound: Boolean(fullName || teamName),
      authUserIdRepaired: false,
      retryCount: this.resolved.retryCount,
      lastErrorAt: fallbackMessage ? new Date().toISOString() : null,
      authSessionPresent: true,
      supabaseUserValidation: offline ? "skipped" : this.resolved.supabaseUserValidation,
      profileQueryStatus: offline ? "skipped" : this.resolved.profileQueryStatus,
      supabaseProfileResolved: this.resolved.supabaseProfileResolved,
      cacheSync: this.resolved.cacheSync,
      identityAttemptId: this.resolved.identityAttemptId,
      identityAttemptDurationMs: this.resolved.identityAttemptDurationMs,
      localCacheSyncErrorCode: this.resolved.localCacheSyncErrorCode,
      conflictingLocalUserId: this.resolved.conflictingLocalUserId,
    };

    return this.resolved;
  }
}
