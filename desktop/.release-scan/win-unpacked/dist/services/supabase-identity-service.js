"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseIdentityService = exports.PROFILE_QUERY_TIMEOUT_MS = exports.AUTH_VALIDATION_TIMEOUT_MS = exports.IDENTITY_TOTAL_TIMEOUT_MS = void 0;
const supabase_role_mapping_1 = require("../auth/supabase-role-mapping");
const fetch_supabase_profile_1 = require("./fetch-supabase-profile");
const supabase_project_ref_1 = require("./supabase-project-ref");
const user_identity_reconciliation_service_1 = require("./user-identity-reconciliation-service");
const local_user_identity_reconciliation_1 = require("./local-user-identity-reconciliation");
const supabase_profile_schema_1 = require("./supabase-profile-schema");
const with_timeout_1 = require("../utils/with-timeout");
exports.IDENTITY_TOTAL_TIMEOUT_MS = 15_000;
exports.AUTH_VALIDATION_TIMEOUT_MS = 8_000;
exports.PROFILE_QUERY_TIMEOUT_MS = 8_000;
const EMPTY_IDENTITY = {
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
class SupabaseIdentityService {
    cloud;
    publicConfig;
    auth;
    users;
    accessAuthorization;
    db;
    teams;
    teamMemberships;
    resolved = { ...EMPTY_IDENTITY };
    loadingPromise = null;
    attemptCounter = 0;
    projectRef;
    constructor(cloud, publicConfig, auth, users, accessAuthorization, db, teams, teamMemberships) {
        this.cloud = cloud;
        this.publicConfig = publicConfig;
        this.auth = auth;
        this.users = users;
        this.accessAuthorization = accessAuthorization;
        this.db = db;
        this.teams = teams;
        this.teamMemberships = teamMemberships;
        this.projectRef = publicConfig
            ? (0, supabase_project_ref_1.extractSupabaseProjectRef)(publicConfig.supabaseUrl)
            : null;
    }
    async getSupabase() {
        return this.cloud.getClient();
    }
    getProjectRef() {
        return this.projectRef;
    }
    getResolvedIdentity() {
        return this.resolved;
    }
    isOnlineReady() {
        return this.resolved.status === "online-ready";
    }
    async fetchRemoteProfile(supabaseUserId) {
        const supabase = await this.getSupabase();
        if (!supabase) {
            return null;
        }
        const result = await (0, fetch_supabase_profile_1.fetchSupabaseProfileByUserId)(supabase, supabaseUserId);
        if (result.status === "found") {
            return result.profile;
        }
        return null;
    }
    syncProfileFieldsToLocalUser(input) {
        const syncedAt = new Date().toISOString();
        this.users.updateSyncedProfileFields({
            userId: input.localUserId,
            fullName: input.fullName,
            phone: input.phone,
            profileTeam: input.profileTeam,
            syncedAt,
        });
    }
    reset() {
        this.loadingPromise = null;
        this.resolved = { ...EMPTY_IDENTITY };
    }
    async retry(reason = "manual") {
        this.loadingPromise = null;
        return this.resolve({ force: true, reason });
    }
    async ensureLoaded(reason = "startup") {
        return this.resolve({ reason });
    }
    async refresh(reason = "manual") {
        return this.resolve({ force: true, reason });
    }
    async resolve(options) {
        if (this.loadingPromise && !options?.force) {
            if (process.env.NODE_ENV !== "production") {
                console.info(`[identity-resolution] Joining in-flight identity attempt ${this.resolved.identityAttemptId ?? "unknown"} (${options?.reason ?? "resolve"}).`);
            }
            return this.loadingPromise;
        }
        if (!options?.force &&
            (this.resolved.status === "online-ready" ||
                this.resolved.status === "offline-ready")) {
            if (process.env.NODE_ENV !== "production") {
                console.info(`[identity-resolution] Identity already ${this.resolved.status}; skipping new attempt (${options?.reason ?? "resolve"}).`);
            }
            return this.resolved;
        }
        const attemptId = ++this.attemptCounter;
        const startedAt = Date.now();
        if (process.env.NODE_ENV !== "production") {
            console.info(`[identity-resolution] identity-attempt: ${attemptId} started (${options?.reason ?? "resolve"})`);
        }
        this.loadingPromise = this.loadIdentity(options?.reason ?? "resolve", attemptId, startedAt);
        try {
            return await this.loadingPromise;
        }
        catch (error) {
            const failed = this.mapThrownError(error, attemptId, startedAt);
            this.resolved = failed;
            return failed;
        }
        finally {
            this.loadingPromise = null;
            this.resolved = {
                ...this.resolved,
                identityAttemptDurationMs: Date.now() - startedAt,
            };
        }
    }
    getDebugSnapshot() {
        const authUser = this.auth.getAuthenticatedUser();
        const conflictDiagnostics = authUser && this.resolved.localCacheSyncErrorCode
            ? (0, local_user_identity_reconciliation_1.getLocalIdentitySyncDiagnostics)({
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
            profileSchemaMode: (0, supabase_profile_schema_1.getCachedProfileTeamColumn)(),
            localUserDiagnostics: conflictDiagnostics,
        };
    }
    mapThrownError(error, attemptId, startedAt) {
        const message = error instanceof with_timeout_1.TimeoutError
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
                errorCode: error instanceof with_timeout_1.TimeoutError
                    ? "IDENTITY_RESOLUTION_TIMEOUT"
                    : "IDENTITY_RESOLUTION_FAILED",
            },
        };
    }
    async loadIdentity(reason, attemptId, startedAt) {
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
        (0, supabase_project_ref_1.logSupabaseProjectDiagnostics)({
            authProjectRef: this.projectRef,
            profileProjectRef: this.projectRef,
            accessProjectRef: this.projectRef,
        });
        const isOnlineCandidate = this.publicConfig !== null && this.cloud.hasCloudSession();
        if (isOnlineCandidate) {
            try {
                const online = await (0, with_timeout_1.withTimeout)(this.loadFromSupabase(reason, attemptId, startedAt, authUser.userId), exports.IDENTITY_TOTAL_TIMEOUT_MS, "Supabase identity resolution timed out");
                if (online) {
                    return online;
                }
            }
            catch (error) {
                const message = error instanceof with_timeout_1.TimeoutError
                    ? "NEUD timed out while loading your Supabase account."
                    : error instanceof Error
                        ? error.message
                        : "NEUD could not load your account from Supabase.";
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
                        errorCode: error instanceof with_timeout_1.TimeoutError
                            ? "IDENTITY_RESOLUTION_TIMEOUT"
                            : "IDENTITY_RESOLUTION_FAILED",
                    },
                };
                if (process.env.NODE_ENV !== "production") {
                    console.warn(`[identity-resolution] identity-attempt: ${attemptId} failed (${reason}): ${message}`);
                }
                return this.resolved;
            }
        }
        return this.loadFromLocalCache(authUser.userId, !isOnlineCandidate);
    }
    async loadFromSupabase(reason, attemptId, startedAt, previousAuthUserId) {
        const supabase = await this.getSupabase();
        if (!supabase) {
            return null;
        }
        const authUser = this.auth.getAuthenticatedUser();
        if (!authUser) {
            return null;
        }
        if (process.env.NODE_ENV !== "production") {
            console.info(`[identity-resolution] identity-attempt: ${attemptId} Supabase profile lookup started (${reason}) for ${authUser.userId}.`);
        }
        const effectiveUserId = authUser.userId;
        const verification = await (0, with_timeout_1.withTimeout)(supabase.auth.getUser(), exports.AUTH_VALIDATION_TIMEOUT_MS, "Supabase auth user lookup timed out");
        if (verification.error || !verification.data.user) {
            const message = verification.error?.message ||
                "Your saved Supabase session is no longer valid. Sign in again.";
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
        const profileResult = await (0, with_timeout_1.withTimeout)((0, fetch_supabase_profile_1.fetchSupabaseProfileByUserId)(supabase, effectiveUserId), exports.PROFILE_QUERY_TIMEOUT_MS, "Supabase profile lookup timed out");
        if (profileResult.status === "error") {
            this.resolved = {
                ...EMPTY_IDENTITY,
                status: "error",
                source: "none",
                authUserId: effectiveUserId,
                email: authUser.email,
                errorMessage: "NEUD could not load your account profile from Supabase. Project access cannot be determined.",
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
    publishOnlineIdentity(input) {
        const authUser = this.auth.getAuthenticatedUser();
        if (!authUser) {
            return;
        }
        this.auth.storeVerifiedSession({
            userId: input.authUserId,
            email: input.email,
            displayName: input.profile.full_name,
            team: input.profile.team,
            role: (0, supabase_role_mapping_1.mapSupabaseProfileRoleToAuthCacheRole)(input.profile.role),
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
            console.info(`[identity-resolution] identity-attempt: ${input.attemptId} Supabase identity ready userId=${input.authUserId} fullName=${this.resolved.profile.fullName ? "set" : "missing"} team=${this.resolved.profile.teamName ? "set" : "missing"} role=${this.resolved.profile.role ?? "none"} source=supabase`);
        }
    }
    async syncLocalCache(input) {
        try {
            const reconciliation = await (0, local_user_identity_reconciliation_1.reconcileLocalUserIdentity)({
                db: this.db,
                users: this.users,
                supabaseUserId: input.authUserId,
                email: input.email,
                fullName: input.profile.full_name?.trim() || "NEUD User",
                platformRole: (0, user_identity_reconciliation_service_1.mapSupabaseProfileRoleToPlatformRole)(input.profile.role),
                phone: input.profile.phone_number,
                profileTeam: input.profile.team,
                previousAuthUserId: input.previousAuthUserId,
            });
            if (reconciliation.status === "synced" || reconciliation.status === "reconciled") {
                const context = this.accessAuthorization?.getAuthorizationContext(input.authUserId) ?? null;
                this.resolved = {
                    ...this.resolved,
                    localUserId: reconciliation.userId ?? context?.userId ?? null,
                    errorMessage: null,
                    localCacheSyncErrorCode: null,
                    conflictingLocalUserId: null,
                    cacheSync: {
                        status: reconciliation.status === "reconciled" ? "synced" : "synced",
                        message: reconciliation.status === "reconciled"
                            ? "Local identity cache reconciled."
                            : null,
                        errorCode: null,
                    },
                };
                if (process.env.NODE_ENV !== "production") {
                    console.info(`[identity-resolution] identity-attempt: ${input.attemptId} local cache sync ${reconciliation.status} localUserId=${reconciliation.userId}${reconciliation.status === "reconciled" ? ` migratedFrom=${reconciliation.obsoleteUserId} refs=${reconciliation.migratedReferenceCount}` : ""}`);
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
                    console.warn(`[identity-resolution] identity-attempt: ${input.attemptId} local cache conflict: ${reconciliation.message}`);
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
                console.warn(`[identity-resolution] identity-attempt: ${input.attemptId} local cache sync failed: ${reconciliation.message}`);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Local identity cache could not be updated.";
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
                console.warn(`[identity-resolution] identity-attempt: ${input.attemptId} local cache sync failed: ${message}`);
            }
        }
    }
    loadFromLocalCache(authUserId, offline, fallbackMessage) {
        const authUser = this.auth.getAuthenticatedUser();
        const cachedProjectRef = authUser?.supabaseProjectRef ?? null;
        if (cachedProjectRef &&
            this.projectRef &&
            cachedProjectRef !== this.projectRef) {
            this.resolved = {
                ...EMPTY_IDENTITY,
                status: "error",
                source: "none",
                authUserId,
                email: authUser?.email ?? null,
                errorMessage: "Cached identity belongs to a different Supabase project. Sign in again while online.",
                profileQueryError: "Supabase project reference mismatch",
                authSessionPresent: true,
                supabaseUserValidation: "invalid",
                profileQueryStatus: "skipped",
                lastErrorAt: new Date().toISOString(),
            };
            return this.resolved;
        }
        const context = this.accessAuthorization?.getAuthorizationContext(authUserId) ?? null;
        const localUser = this.users.resolveByAuthUserId(authUserId) ??
            this.users.getById(authUserId) ??
            (authUser?.email ? this.users.getByEmail(authUser.email) : null);
        const fullName = authUser?.displayName?.trim() ||
            localUser?.fullName?.trim() ||
            context?.displayName?.trim() ||
            null;
        const teamName = authUser?.team?.trim() || localUser?.profileTeam?.trim() || null;
        const role = authUser?.role?.trim() || localUser?.platformRole || context?.platformRole || null;
        if (!fullName && !teamName && !role) {
            this.resolved = {
                ...EMPTY_IDENTITY,
                status: offline ? "offline-ready" : "error",
                source: offline ? "local-cache" : "none",
                authUserId,
                email: authUser?.email ?? null,
                localUserId: localUser?.id ?? context?.userId ?? null,
                supabaseProjectRef: cachedProjectRef,
                errorMessage: fallbackMessage ??
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
            errorMessage: fallbackMessage ??
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
exports.SupabaseIdentityService = SupabaseIdentityService;
