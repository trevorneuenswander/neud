import type { AuthenticatedCloudCoordinator } from "../authenticated-cloud-coordinator";
import type { AppSettingsRepository } from "../../repositories/app-settings-repository";
import type { LocalUsersRepository } from "../../repositories/local-users-repository";
import type { TeamsRepository } from "../../repositories/teams-repository";
import type { TeamMembershipsRepository } from "../../repositories/team-memberships-repository";
import type { AuthLicenseManager } from "../auth-license-manager";
import { normalizeEmail } from "../../auth/normalize-email";
import { repairCanonicalAccounts } from "../canonical-user-repair-service";
import {
  USER_DIRECTORY_SYNC_BACKOFF_MS,
  USER_DIRECTORY_SYNC_INTERVAL_MS,
  USER_DIRECTORY_SYNC_LAST_RESULT_KEY,
  USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY,
  USER_DIRECTORY_SYNC_MAX_IN_FLIGHT_MS,
  USER_DIRECTORY_SYNC_STALE_MS,
  type UserDirectorySyncResult,
  type UserDirectorySyncState,
} from "./types";

type SyncListener = (state: UserDirectorySyncState) => void;

type DirectoryUser = {
  id: string;
  email: string | null;
  fullName: string;
};

function deriveDisplayNameFromEmail(email: string | null): string {
  const normalized = normalizeEmail(email ?? "");
  const localPart = normalized.split("@")[0]?.trim();
  return localPart || "NEUD User";
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  );
}

export class SupabaseUserDirectorySyncService {
  private syncInProgress = false;
  private syncStartedAt: string | null = null;
  private syncWatchdogTimer: NodeJS.Timeout | null = null;
  private connectionOnline = false;
  private periodicTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryAttempt = 0;
  private lastResult: UserDirectorySyncResult | null = null;
  private readonly listeners = new Set<SyncListener>();

  constructor(
    private readonly cloud: AuthenticatedCloudCoordinator,
    private readonly settings: AppSettingsRepository,
    private readonly users: LocalUsersRepository,
    private readonly teams: TeamsRepository,
    private readonly teamMemberships: TeamMembershipsRepository,
    private readonly auth: AuthLicenseManager,
  ) {
    this.lastResult = this.settings.get<UserDirectorySyncResult | null>(
      USER_DIRECTORY_SYNC_LAST_RESULT_KEY,
      null,
    );
  }

  start(): void {
    if (this.periodicTimer) {
      return;
    }
    this.periodicTimer = setInterval(() => {
      void this.syncNow("periodic");
    }, USER_DIRECTORY_SYNC_INTERVAL_MS);
    void this.syncNow("startup");
  }

  stop(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.clearSyncWatchdog();
    this.retryAttempt = 0;
  }

  private clearSyncWatchdog(): void {
    if (this.syncWatchdogTimer) {
      clearTimeout(this.syncWatchdogTimer);
      this.syncWatchdogTimer = null;
    }
  }

  private armSyncWatchdog(): void {
    this.clearSyncWatchdog();
    this.syncWatchdogTimer = setTimeout(() => {
      if (!this.syncInProgress) {
        return;
      }
      this.syncInProgress = false;
      this.syncStartedAt = null;
      this.notifyListeners();
    }, USER_DIRECTORY_SYNC_MAX_IN_FLIGHT_MS);
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): UserDirectorySyncState {
    const lastSuccessfulSyncAt = this.settings.get<string | null>(
      USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY,
      null,
    );

    if (this.syncInProgress) {
      return {
        status: "syncing",
        message: "Syncing user directory…",
        lastSuccessfulSyncAt,
        lastResult: this.lastResult,
        syncInProgress: true,
        syncStartedAt: this.syncStartedAt,
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
        syncStartedAt: null,
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
        syncStartedAt: null,
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
        syncStartedAt: null,
        connectionOnline: true,
      };
    }

    return {
      status: lastSuccessfulSyncAt ? "success" : "idle",
      message: lastSuccessfulSyncAt ? "Synced" : "User directory not synced yet.",
      lastSuccessfulSyncAt,
      lastResult: this.lastResult,
      syncInProgress: false,
      syncStartedAt: null,
      connectionOnline: true,
    };
  }

  isStale(): boolean {
    const lastSuccessfulSyncAt = this.settings.get<string | null>(
      USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY,
      null,
    );
    if (!lastSuccessfulSyncAt) {
      return true;
    }
    const elapsed = Date.now() - Date.parse(lastSuccessfulSyncAt);
    return !Number.isFinite(elapsed) || elapsed >= USER_DIRECTORY_SYNC_STALE_MS;
  }

  async syncNow(
    reason: "startup" | "periodic" | "login" | "users-page" | "manual" | "reconnect",
  ): Promise<UserDirectorySyncResult> {
    if (!this.auth.isAccessAllowed()) {
      const result = this.buildResult("offline", {
        startedAt: new Date().toISOString(),
        errors: [{ message: "Authentication required." }],
      });
      this.persistResult(result);
      return result;
    }

    if (!this.cloud.hasCloudSession() && !this.cloud.hasPersistedTokens()) {
      const result = this.buildResult("offline", {
        startedAt: new Date().toISOString(),
        errors: [{ message: "Cloud session required." }],
      });
      this.persistResult(result);
      return result;
    }

    const clientResult = await this.cloud.ensureAuthenticatedClient(
      `user-directory-sync:${reason}`,
    );
    if (!clientResult.client) {
      const result = this.buildResult("offline", {
        startedAt: new Date().toISOString(),
        errors: [{ message: "Cloud session unavailable." }],
      });
      this.persistResult(result);
      return result;
    }

    if (this.syncInProgress) {
      return (
        this.lastResult ?? {
          status: "offline",
          startedAt: new Date().toISOString(),
          usersFetched: 0,
          usersCreated: 0,
          usersUpdated: 0,
          usersLinked: 0,
          usersUnchanged: 0,
          usersMarkedUnavailable: 0,
          errors: [{ message: "Sync already in progress." }],
        }
      );
    }

    this.syncInProgress = true;
    this.syncStartedAt = new Date().toISOString();
    this.armSyncWatchdog();
    this.notifyListeners();
    const startedAt = this.syncStartedAt;

    try {
      const authUsers = await this.fetchAllAuthUsers();
      this.connectionOnline = true;
      this.retryAttempt = 0;

      const syncedAt = new Date().toISOString();
      let usersCreated = 0;
      let usersUpdated = 0;
      let usersLinked = 0;
      let usersUnchanged = 0;
      const errors: UserDirectorySyncResult["errors"] = [];
      const fetchedSupabaseIds: string[] = [];

      for (const authUser of authUsers) {
        if (!authUser.email) {
          errors.push({
            userId: authUser.id,
            message: "Directory user is missing an email address.",
          });
          continue;
        }

        fetchedSupabaseIds.push(authUser.id);
        const normalizedEmail = normalizeEmail(authUser.email);
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

        if (emailMatches.length === 1 && emailMatches[0]!.id !== applyResult.user.id) {
          this.users.deactivateDuplicateByEmail(applyResult.user.id, normalizedEmail);
        }

        if (applyResult.created) {
          usersCreated += 1;
        } else if (applyResult.updated) {
          usersUpdated += 1;
        } else {
          usersUnchanged += 1;
        }
        if (applyResult.linked) {
          usersLinked += 1;
        }
      }

      const repair = repairCanonicalAccounts({
        users: this.users,
        teams: this.teams,
        teamMemberships: this.teamMemberships,
      });
      if (repair.error) {
        errors.push({ message: repair.error });
      }

      const usersMarkedUnavailable = this.users.markSupabaseUnavailableExcept(
        fetchedSupabaseIds,
        syncedAt,
      );

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
        this.settings.set(USER_DIRECTORY_SYNC_LAST_SUCCESS_KEY, syncedAt);
      }
      return result;
    } catch (error) {
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
    } finally {
      this.clearSyncWatchdog();
      this.syncInProgress = false;
      this.syncStartedAt = null;
      this.notifyListeners();
    }
  }

  private async fetchAllAuthUsers(): Promise<DirectoryUser[]> {
    const supabase = await this.cloud.getClient();
    if (!supabase) {
      throw new Error("Cloud session unavailable.");
    }

    if (this.auth.isPlatformAdmin()) {
      const { data, error } = await supabase.rpc("get_authorized_users_directory");
      if (error) {
        throw error;
      }
      return (data ?? []).map(
        (row: {
          id: string;
          email: string | null;
          full_name: string | null;
        }) => ({
          id: row.id,
          email: row.email,
          fullName: row.full_name?.trim() || deriveDisplayNameFromEmail(row.email),
        }),
      );
    }

    const { data, error } = await supabase.rpc("get_accessible_project_users_directory");
    if (error) {
      throw error;
    }

    const byUserId = new Map<string, DirectoryUser>();
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

  private buildResult(
    status: UserDirectorySyncResult["status"],
    input: Partial<UserDirectorySyncResult> & { startedAt: string },
  ): UserDirectorySyncResult {
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

  private persistResult(result: UserDirectorySyncResult): void {
    this.lastResult = result;
    this.settings.set(USER_DIRECTORY_SYNC_LAST_RESULT_KEY, result);
    this.notifyListeners();
  }

  private scheduleRetry(): void {
    if (this.retryTimer) {
      return;
    }
    const delay =
      USER_DIRECTORY_SYNC_BACKOFF_MS[
        Math.min(this.retryAttempt, USER_DIRECTORY_SYNC_BACKOFF_MS.length - 1)
      ]!;
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow("reconnect");
    }, delay);
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
