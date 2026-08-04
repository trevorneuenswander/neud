import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCloudCoordinator } from "../authenticated-cloud-coordinator";
import type { AppSettingsRepository } from "../../repositories/app-settings-repository";
import type {
  ActivityEventsRepository,
  ActivityEventRecord,
} from "../../repositories/activity-events-repository";
import type { ActivitySessionStore } from "../activity-session-store";
import type { AccessAuthorizationService } from "../access-authorization-service";
import type { AuthLicenseManager } from "../auth-license-manager";
import type { ProjectsRepository } from "../../repositories/projects-repository";
import { getOrCreateNeudInstanceId } from "../neud-instance-id";
import { CloudActivityClient } from "./cloud-activity-client";
import {
  deterministicActivityCloudId,
  fromCloudActivityRow,
  toCloudActivityRow,
} from "./cloud-activity-mapper";
import {
  ACTIVITY_SYNC_BACKOFF_MS,
  ACTIVITY_SYNC_CURSOR_KEY,
  ACTIVITY_SYNC_LAST_PULL_KEY,
  ACTIVITY_SYNC_LAST_PUSH_KEY,
  type ActivitySyncCursor,
  type ActivitySyncDiagnostics,
  type ActivitySyncState,
} from "./types";
import {
  ACTIVITY_SYNC_ALLOWED_EVENT_TYPES,
  isActivitySyncAllowedEventType,
  isRecoverableAllowlistSyncError,
} from "../../lib/activity/sync-allowlist";

type ActivitySyncListener = (state: ActivitySyncState) => void;

export class ActivitySyncService {
  private online = false;
  private syncInProgress = false;
  private lastSyncError: string | null = null;
  private lastPushUploaded = 0;
  private lastPullDownloaded = 0;
  private lastRequeuedCount = 0;
  private duplicatePreventedCount = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private uploadDebounceTimer: NodeJS.Timeout | null = null;
  private realtimeChannel: ReturnType<SupabaseClient["channel"]> | null = null;
  private readonly listeners = new Set<ActivitySyncListener>();
  private readonly instanceId: string;
  private readonly cloudClient: CloudActivityClient;

  constructor(
    private readonly cloud: AuthenticatedCloudCoordinator,
    private readonly settings: AppSettingsRepository,
    private readonly repository: ActivityEventsRepository,
    private readonly sessionStore: ActivitySessionStore,
    private readonly auth: AuthLicenseManager,
    private readonly access: AccessAuthorizationService,
    private readonly projects: ProjectsRepository,
    private readonly onEntriesChanged: () => void,
  ) {
    this.instanceId = getOrCreateNeudInstanceId(settings);
    this.cloudClient = new CloudActivityClient(cloud);
    this.repository.assignCloudIdsForLegacyRows({
      instanceId: this.instanceId,
      resolveCloudId: (localId: string) =>
        deterministicActivityCloudId(this.instanceId, localId),
    });
  }

  start(): void {
    void this.refreshOnlineState();
    this.periodicTimer = setInterval(() => {
      void this.syncNow("periodic");
    }, 45_000);
    void this.setupRealtimeSubscription();
    void this.syncNow("startup");
  }

  private async setupRealtimeSubscription(): Promise<void> {
    const supabase = await this.cloud.getClient();
    if (!supabase) {
      return;
    }
    this.realtimeChannel = supabase
      .channel("neud-activity-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activity_events" },
        () => {
          void this.syncNow("realtime");
        },
      )
      .subscribe();
  }

  stop(): void {
    const channel = this.realtimeChannel;
    this.realtimeChannel = null;

    if (channel) {
      void this.cloud
        .getClient()
        .then((client) => {
          if (!client) {
            return;
          }
          try {
            void client.removeChannel(channel);
          } catch (error) {
            console.debug("[ActivitySync] Failed to remove realtime channel", error);
          }
        })
        .catch((error) => {
          console.debug("[ActivitySync] Failed to resolve cloud client during stop", error);
        });
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.uploadDebounceTimer) {
      clearTimeout(this.uploadDebounceTimer);
      this.uploadDebounceTimer = null;
    }
  }

  subscribe(listener: ActivitySyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getDiagnostics(): ActivitySyncDiagnostics {
    const emittedEventTypes = this.repository.summarizeUnsyncedEventTypes();
    const rejectedEventTypes = this.repository.listRejectedEventTypes();
    const allowlistMismatchCount = rejectedEventTypes.filter(
      (type) => !isActivitySyncAllowedEventType(type),
    ).length;
    const failedCounts = this.repository.countRecoverableFailedEvents({
      isAllowedType: isActivitySyncAllowedEventType,
      isRecoverableError: isRecoverableAllowlistSyncError,
    });

    return {
      instanceId: this.instanceId,
      cloudUserId: this.auth.getAuthenticatedUser()?.userId ?? null,
      online: this.online,
      lastSuccessfulPushAt: this.settings.get<string | null>(ACTIVITY_SYNC_LAST_PUSH_KEY, null),
      lastSuccessfulPullAt: this.settings.get<string | null>(ACTIVITY_SYNC_LAST_PULL_KEY, null),
      cursor: this.getCursor(),
      pendingUploadCount: this.repository.countBySyncStatus("pending"),
      failedUploadCount: this.repository.countBySyncStatus("failed"),
      lastSyncError: this.lastSyncError,
      cloudProvider: "supabase",
      lastPushUploaded: this.lastPushUploaded,
      lastPullDownloaded: this.lastPullDownloaded,
      syncInProgress: this.syncInProgress,
      emittedEventTypeCount: Object.keys(emittedEventTypes).length,
      rejectedEventTypes,
      localAllowedEventTypes: [...ACTIVITY_SYNC_ALLOWED_EVENT_TYPES],
      allowlistMismatchCount,
      recoverableFailedCount: failedCounts.recoverableFailedCount,
      unrecoverableFailedCount: failedCounts.unrecoverableFailedCount,
      requeuedCount: this.lastRequeuedCount,
      duplicatePreventedCount: this.duplicatePreventedCount,
      firstActivitySyncFailureStage: this.resolveFirstActivitySyncFailureStage({
        rejectedEventTypes,
        allowlistMismatchCount,
      }),
    };
  }

  private resolveFirstActivitySyncFailureStage(input: {
    rejectedEventTypes: string[];
    allowlistMismatchCount: number;
  }): ActivitySyncDiagnostics["firstActivitySyncFailureStage"] {
    if (input.allowlistMismatchCount > 0 || input.rejectedEventTypes.length > 0) {
      return "event_not_allowlisted";
    }
    if (this.lastSyncError?.toLowerCase().includes("invalid")) {
      return "payload_invalid";
    }
    if (this.lastSyncError) {
      return "cloud_rpc_failed";
    }
    return "none";
  }

  retryRecoverableActivityEvents(): {
    requeuedCount: number;
    recoverableFailedCount: number;
    unrecoverableFailedCount: number;
  } {
    const result = this.repository.retryRecoverableActivityEvents({
      isAllowedType: isActivitySyncAllowedEventType,
      isRecoverableError: isRecoverableAllowlistSyncError,
    });
    this.lastRequeuedCount = result.requeuedCount;
    return result;
  }

  getState(): ActivitySyncState {
    const diagnostics = this.getDiagnostics();
    if (!this.auth.getAuthenticatedUser()) {
      return {
        status: "offline",
        message: "Sign in to synchronize activity.",
        diagnostics,
      };
    }
    if (this.syncInProgress) {
      return { status: "syncing", message: "Syncing activity…", diagnostics };
    }
    if (!this.online) {
      return {
        status: "offline",
        message: "Activity sync is waiting for an internet connection.",
        diagnostics,
      };
    }
    if (diagnostics.failedUploadCount > 0 || this.lastSyncError) {
      return {
        status: "error",
        message: "Some activity events failed to sync.",
        diagnostics,
      };
    }
    if (diagnostics.pendingUploadCount > 0) {
      return {
        status: "syncing",
        message: "Activity events are waiting to sync.",
        diagnostics,
      };
    }
    return { status: "synced", message: "Activity sync is up to date.", diagnostics };
  }

  queueEventUpload(cloudId: string): void {
    if (this.uploadDebounceTimer) {
      clearTimeout(this.uploadDebounceTimer);
    }
    this.uploadDebounceTimer = setTimeout(() => {
      this.uploadDebounceTimer = null;
      void this.syncNow("event-recorded").catch(() => {
        this.scheduleRetry(cloudId);
      });
    }, 750);
  }

  async syncNow(reason = "manual"): Promise<void> {
    if (this.syncInProgress) return;
    if (!this.auth.getAuthenticatedUser()) return;
    if (!this.cloud.isAuthenticatedCloudSessionAvailable()) return;

    this.syncInProgress = true;
    this.emitState();

    try {
      await this.refreshOnlineState();
      if (!this.online) {
        return;
      }

      this.retryRecoverableActivityEvents();

      let uploadedTotal = 0;
      while (true) {
        const uploadedThisPass = await this.pushPending();
        uploadedTotal += uploadedThisPass;
        if (uploadedThisPass === 0) {
          break;
        }
      }
      this.lastPushUploaded = uploadedTotal;

      await this.pullRemote();
      if (uploadedTotal > 0 && this.repository.countBySyncStatus("failed") === 0) {
        this.lastSyncError = null;
      } else if (this.repository.countBySyncStatus("failed") > 0) {
        const failed = this.repository.listUnsynced(1).find((row) => row.syncStatus === "failed");
        this.lastSyncError = failed?.syncError ?? this.lastSyncError;
      } else {
        this.lastSyncError = null;
      }
      console.debug(`[ActivitySync] completed reason=${reason}`);
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : String(error);
      console.warn("[ActivitySync] failed:", this.lastSyncError);
    } finally {
      this.syncInProgress = false;
      this.emitState();
    }
  }

  createCloudIdForEvent(localId?: string): string {
    if (localId && /^[0-9a-f-]{36}$/i.test(localId)) {
      return localId;
    }
    return deterministicActivityCloudId(
      this.instanceId,
      localId ?? `draft-${Date.now()}`,
    );
  }

  private async refreshOnlineState(): Promise<void> {
    try {
      this.online = await this.cloudClient.ping();
    } catch {
      this.online = false;
    }
  }

  private async pushPending(): Promise<number> {
    const pending = this.repository.listUnsynced(100);
    if (pending.length === 0) {
      return 0;
    }

    const now = new Date().toISOString();
    let uploaded = 0;

    for (const record of pending) {
      if (!this.canUploadRecord(record)) {
        this.repository.markFailed(record.cloudId, "Project access denied for Activity upload.");
        continue;
      }

      if (!isActivitySyncAllowedEventType(record.type)) {
        this.repository.markFailed(
          record.cloudId,
          `Activity event type is not allowed. (event_type=${record.type})`,
        );
        continue;
      }

      this.repository.markSyncAttempt(record.cloudId);
      const teamId = this.resolveTeamId(record);
      const row = toCloudActivityRow({
        event: record,
        cloudId: record.cloudId,
        instanceId: this.instanceId,
        teamId,
      });

      const result = await this.cloudClient.upsertEvents([row]);
      if (result.errors.length > 0) {
        this.repository.markFailed(record.cloudId, result.errors[0] ?? "Upload failed.");
        continue;
      }

      this.repository.markSynced(record.cloudId, now);
      uploaded += 1;
    }

    if (uploaded > 0) {
      this.settings.set(ACTIVITY_SYNC_LAST_PUSH_KEY, now);
    }

    return uploaded;
  }

  private async pullRemote(): Promise<void> {
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    const context = userId ? this.access.getAuthorizationContext(userId) : null;
    const accessibleProjectIds = context?.accessibleProjectIds ?? [];
    let cursor = this.getCursor();
    let downloaded = 0;

    while (true) {
      const rows = await this.cloudClient.fetchChangedSince({
        cursor,
        accessibleProjectIds,
        includeGlobalForUserId: userId,
        limit: 100,
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        const event = fromCloudActivityRow(row);
        const record = this.repository.upsertFromCloud({
          event,
          cloudId: row.id,
          instanceId: row.source_instance_id,
          cloudUpdatedAt: row.updated_at,
        });
        this.sessionStore.upsertFromCloud(record);
        downloaded += 1;
        cursor = { updatedAt: row.updated_at, id: row.id };
      }

      if (rows.length < 100) break;
    }

    if (cursor) {
      this.settings.set(ACTIVITY_SYNC_CURSOR_KEY, cursor);
    }
    if (downloaded > 0) {
      this.onEntriesChanged();
    }
    this.lastPullDownloaded = downloaded;
    this.settings.set(ACTIVITY_SYNC_LAST_PULL_KEY, new Date().toISOString());
  }

  private canUploadRecord(record: ActivityEventRecord): boolean {
    const projectId =
      typeof record.metadata?.projectId === "string"
        ? record.metadata.projectId
        : null;
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId) return false;
    if (!projectId) return true;
    return this.access.getAuthorizationContext(userId)?.accessibleProjectIds.includes(projectId) ?? false;
  }

  private resolveTeamId(record: ActivityEventRecord): string | null {
    const projectId =
      typeof record.metadata?.projectId === "string"
        ? record.metadata.projectId
        : null;
    if (!projectId) return null;
    return this.projects.getById(projectId)?.teamId ?? null;
  }

  private getCursor(): ActivitySyncCursor | null {
    return this.settings.get<ActivitySyncCursor | null>(ACTIVITY_SYNC_CURSOR_KEY, null);
  }

  private scheduleRetry(cloudId: string): void {
    const record = this.repository.getByCloudId(cloudId);
    if (!record) return;
    const attempt = Math.min(record.syncAttemptCount, ACTIVITY_SYNC_BACKOFF_MS.length - 1);
    const delay = ACTIVITY_SYNC_BACKOFF_MS[attempt];
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    this.retryTimer = setTimeout(() => {
      void this.syncNow("retry");
    }, delay);
  }

  private emitState(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
