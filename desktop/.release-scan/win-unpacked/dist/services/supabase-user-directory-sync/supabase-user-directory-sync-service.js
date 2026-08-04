"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseUserDirectorySyncService = void 0;
const normalize_email_1 = require("../../auth/normalize-email");
const canonical_user_repair_service_1 = require("../canonical-user-repair-service");
const types_1 = require("./types");
function deriveDisplayNameFromEmail(email) {
    const normalized = (0, normalize_email_1.normalizeEmail)(email ?? "");
    const localPart = normalized.split("@")[0]?.trim();
    return localPart || "NEUD User";
}
function isNetworkError(error) {
    if (!(error instanceof Error)) {
        return true;
    }
    const message = error.message.toLowerCase();
    return (message.includes("fetch failed") ||
        message.includes("network") ||
        message.includes("timeout") ||
        message.includes("econnrefused") ||
        message.includes("enotfound"));
}
class SupabaseUserDirectorySyncService {
    cloud;
    settings;
    users;
    teams;
    teamMemberships;
    auth;
    syncInProgress = false;
    connectionOnline = false;
    periodicTimer = null;
    retryTimer = null;
    retryAttempt = 0;
    lastResult = null;
    listeners = new Set();
    constructor(cloud, settings, users, teams, teamMemberships, auth) {
        this.cloud = cloud;
        this.settings = settings;
        this.users = users;
        this.teams = teams;
        this.teamMemberships = teamMemberships;
        this.auth = auth;
        this.lastResult = this.settings.get(types_1.USER_DIRECTORY_SYNC_LAST_RESULT_KEY, null);
    }
    start() {
        if (this.periodicTimer) {
            return;
        }
        this.periodicTimer = setInterval(() => {
            void this.syncNow("periodic");
        }, types_1.USER_DIRECTORY_SYNC_INTERVAL_MS);
        void this.syncNow("startup");
    }
    stop() {
        if (this.periodicTimer) {
            clearInterval(this.periodicTimer);
            this.periodicTimer = null;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.retryAttempt = 0;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.getState());
        return () => this.listeners.delete(listener);
    }
    getState() {
        const lastSuccessfulSyncAt = this.settings.get(types_1.USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY, null);
        if (this.syncInProgress) {
            return {
                status: "syncing",
                message: "Syncing user directory…",
                lastSuccessfulSyncAt,
                lastResult: this.lastResult,
                syncInProgress: true,
                connectionOnline: this.connectionOnline,
            };
        }
        if (!this.auth.isAccessAllowed()) {
            return {
                status: "idle",
                message: "Sign in to synchronize users.",
                lastSuccessfulSyncAt,
                lastResult: this.lastResult,
                syncInProgress: false,
                connectionOnline: this.connectionOnline,
            };
        }
        if (!this.connectionOnline) {
            return {
                status: "offline",
                message: "Offline — showing cached users.",
                lastSuccessfulSyncAt,
                lastResult: this.lastResult,
                syncInProgress: false,
                connectionOnline: false,
            };
        }
        if (this.lastResult?.status === "failed" || this.lastResult?.status === "partial") {
            return {
                status: this.lastResult.status,
                message: "Sync error — cached users shown.",
                lastSuccessfulSyncAt,
                lastResult: this.lastResult,
                syncInProgress: false,
                connectionOnline: true,
            };
        }
        return {
            status: lastSuccessfulSyncAt ? "success" : "idle",
            message: lastSuccessfulSyncAt ? "Synced" : "User directory not synced yet.",
            lastSuccessfulSyncAt,
            lastResult: this.lastResult,
            syncInProgress: false,
            connectionOnline: true,
        };
    }
    isStale() {
        const lastSuccessfulSyncAt = this.settings.get(types_1.USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY, null);
        if (!lastSuccessfulSyncAt) {
            return true;
        }
        const elapsed = Date.now() - Date.parse(lastSuccessfulSyncAt);
        return !Number.isFinite(elapsed) || elapsed >= types_1.USER_DIRECTORY_SYNC_STALE_MS;
    }
    async syncNow(reason) {
        if (!this.auth.isAccessAllowed()) {
            const result = this.buildResult("offline", {
                startedAt: new Date().toISOString(),
                errors: [{ message: "Authentication required." }],
            });
            this.persistResult(result);
            return result;
        }
        if (!this.cloud.hasCloudSession()) {
            const result = this.buildResult("offline", {
                startedAt: new Date().toISOString(),
                errors: [{ message: "Cloud session required." }],
            });
            this.persistResult(result);
            return result;
        }
        if (this.syncInProgress) {
            return (this.lastResult ?? {
                status: "offline",
                startedAt: new Date().toISOString(),
                usersFetched: 0,
                usersCreated: 0,
                usersUpdated: 0,
                usersLinked: 0,
                usersUnchanged: 0,
                usersMarkedUnavailable: 0,
                errors: [{ message: "Sync already in progress." }],
            });
        }
        this.syncInProgress = true;
        this.notifyListeners();
        const startedAt = new Date().toISOString();
        try {
            const authUsers = await this.fetchAllAuthUsers();
            this.connectionOnline = true;
            this.retryAttempt = 0;
            const syncedAt = new Date().toISOString();
            let usersCreated = 0;
            let usersUpdated = 0;
            let usersLinked = 0;
            let usersUnchanged = 0;
            const errors = [];
            const fetchedSupabaseIds = [];
            for (const authUser of authUsers) {
                if (!authUser.email) {
                    errors.push({
                        userId: authUser.id,
                        message: "Directory user is missing an email address.",
                    });
                    continue;
                }
                fetchedSupabaseIds.push(authUser.id);
                const normalizedEmail = (0, normalize_email_1.normalizeEmail)(authUser.email);
                const emailMatches = this.users.listByEmail(normalizedEmail);
                if (emailMatches.length > 1) {
                    errors.push({
                        userId: authUser.id,
                        message: `Ambiguous local email match for ${normalizedEmail}.`,
                    });
                    continue;
                }
                const applyResult = this.users.applySupabaseSync({
                    supabaseUserId: authUser.id,
                    email: normalizedEmail,
                    fullName: authUser.fullName,
                    syncedAt,
                    linkToExistingId: emailMatches[0]?.id ?? null,
                });
                if (emailMatches.length === 1 && emailMatches[0].id !== applyResult.user.id) {
                    this.users.deactivateDuplicateByEmail(applyResult.user.id, normalizedEmail);
                }
                if (applyResult.created) {
                    usersCreated += 1;
                }
                else if (applyResult.updated) {
                    usersUpdated += 1;
                }
                else {
                    usersUnchanged += 1;
                }
                if (applyResult.linked) {
                    usersLinked += 1;
                }
            }
            const repair = (0, canonical_user_repair_service_1.repairCanonicalAccounts)({
                users: this.users,
                teams: this.teams,
                teamMemberships: this.teamMemberships,
            });
            if (repair.error) {
                errors.push({ message: repair.error });
            }
            const usersMarkedUnavailable = this.users.markSupabaseUnavailableExcept(fetchedSupabaseIds, syncedAt);
            const result = this.buildResult(errors.length > 0 ? "partial" : "success", {
                startedAt,
                completedAt: syncedAt,
                usersFetched: authUsers.length,
                usersCreated,
                usersUpdated,
                usersLinked,
                usersUnchanged,
                usersMarkedUnavailable,
                errors,
            });
            this.persistResult(result);
            if (result.status === "success" || result.status === "partial") {
                this.settings.set(types_1.USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY, syncedAt);
            }
            return result;
        }
        catch (error) {
            if (isNetworkError(error)) {
                this.connectionOnline = false;
                const result = this.buildResult("offline", {
                    startedAt,
                    completedAt: new Date().toISOString(),
                    errors: [{ message: "Supabase is unreachable." }],
                });
                this.persistResult(result);
                this.scheduleRetry();
                return result;
            }
            this.connectionOnline = true;
            const result = this.buildResult("failed", {
                startedAt,
                completedAt: new Date().toISOString(),
                errors: [
                    {
                        message: error instanceof Error ? error.message : "User directory sync failed.",
                    },
                ],
            });
            this.persistResult(result);
            this.scheduleRetry();
            return result;
        }
        finally {
            this.syncInProgress = false;
            this.notifyListeners();
        }
    }
    async fetchAllAuthUsers() {
        const supabase = await this.cloud.getClient();
        if (!supabase) {
            throw new Error("Cloud session unavailable.");
        }
        if (this.auth.isPlatformAdmin()) {
            const { data, error } = await supabase.rpc("get_authorized_users_directory");
            if (error) {
                throw error;
            }
            return (data ?? []).map((row) => ({
                id: row.id,
                email: row.email,
                fullName: row.full_name?.trim() || deriveDisplayNameFromEmail(row.email),
            }));
        }
        const { data, error } = await supabase.rpc("get_accessible_project_users_directory");
        if (error) {
            throw error;
        }
        const byUserId = new Map();
        for (const row of data ?? []) {
            if (byUserId.has(row.user_id)) {
                continue;
            }
            byUserId.set(row.user_id, {
                id: row.user_id,
                email: row.email,
                fullName: row.full_name?.trim() || deriveDisplayNameFromEmail(row.email),
            });
        }
        return [...byUserId.values()];
    }
    buildResult(status, input) {
        return {
            status,
            startedAt: input.startedAt,
            completedAt: input.completedAt,
            usersFetched: input.usersFetched ?? 0,
            usersCreated: input.usersCreated ?? 0,
            usersUpdated: input.usersUpdated ?? 0,
            usersLinked: input.usersLinked ?? 0,
            usersUnchanged: input.usersUnchanged ?? 0,
            usersMarkedUnavailable: input.usersMarkedUnavailable ?? 0,
            errors: input.errors ?? [],
        };
    }
    persistResult(result) {
        this.lastResult = result;
        this.settings.set(types_1.USER_DIRECTORY_SYNC_LAST_RESULT_KEY, result);
        this.notifyListeners();
    }
    scheduleRetry() {
        if (this.retryTimer) {
            return;
        }
        const delay = types_1.USER_DIRECTORY_SYNC_BACKOFF_MS[Math.min(this.retryAttempt, types_1.USER_DIRECTORY_SYNC_BACKOFF_MS.length - 1)];
        this.retryAttempt += 1;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.syncNow("reconnect");
        }, delay);
    }
    notifyListeners() {
        const state = this.getState();
        for (const listener of this.listeners) {
            listener(state);
        }
    }
}
exports.SupabaseUserDirectorySyncService = SupabaseUserDirectorySyncService;
