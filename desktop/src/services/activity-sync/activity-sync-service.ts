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
import type { AppPaths } from "../app-paths";
import { appendActivitySyncLog } from "../runtime-diagnostics-log";

type ActivitySyncListener = (state: ActivitySyncState) => void;

type EnsureHostedProjectForSyncResult = {
  ok: boolean;
  projectId: string;
  realigned?: boolean;
  error?: string;
};

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
  private ensureHostedProjectForSync:
    | ((projectId: string) => Promise<EnsureHostedProjectForSyncResult>)
    | null = null;
  private serviceStarted = false;

  constructor(
    private readonly cloud: AuthenticatedCloudCoordinator,
    private readonly settings: AppSettingsRepository,
    private readonly repository: ActivityEventsRepository,
    private readonly sessionStore: ActivitySessionStore,
    private readonly auth: AuthLicenseManager,
    private readonly access: AccessAuthorizationService,
    private readonly projects: ProjectsRepository,
    private readonly onEntriesChanged: () => void,
    private readonly paths?: AppPaths,
  ) {
    this.instanceId = getOrCreateNeudInstanceId(settings);
    this.cloudClient = new CloudActivityClient(cloud);
    this.repository.assignCloudIdsForLegacyRows({
      instanceId: this.instanceId,
      resolveCloudId: (localId: string) =>
        deterministicActivityCloudId(this.instanceId, localId),
    });
  }

  setEnsureHostedProjectForSync(
    handler: (projectId: string) => Promise<EnsureHostedProjectForSyncResult>,
  ): void {
    this.ensureHostedProjectForSync = handler;
  }

  start(): void {
    if (this.serviceStarted) {
      return;
    }
    this.serviceStarted = true;
    this.logActivitySync("service.start");
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
    this.serviceStarted = false;
    this.logActivitySync("service.stop");
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

    if (!this.cloud.isCloudConfigured()) {
      return {
        status: "error",
        message:
          "Cloud configuration is missing. Activity sync requires packaged Supabase settings.",
        diagnostics,
      };
    }

    if (!this.auth.getAuthenticatedUser()) {
      return {
        status: "offline",
        message: "Sign in to synchronize activity.",
        diagnostics,
      };
    }

    if (!this.cloud.isAuthenticatedCloudSessionAvailable()) {
      const authSnapshot = this.cloud.getAuthSnapshot();
      if (authSnapshot.reauthenticationRequired) {
        return {
          status: "error",
          message: "Your cloud session has expired. Sign in again to synchronize activity.",
          diagnostics,
        };
      }
      if (
        this.cloud.isSessionRestorePending() ||
        authSnapshot.hasRestorableCloudSession
      ) {
        return {
          status: "syncing",
          message: "Restoring cloud session…",
          diagnostics,
        };
      }
      return {
        status: "error",
        message:
          this.lastSyncError ??
          "Cloud session is not available for activity sync.",
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
    if (this.syncInProgress) {
      if (reason === "startup" || reason === "startup-restore" || reason === "login") {
        return;
      }
    }
    if (this.syncInProgress) {
      return;
    }

    if (!this.cloud.isCloudConfigured()) {
      this.logActivitySync(`sync.skip reason=${reason} stage=cloud_config_missing`);
      return;
    }

    if (!this.auth.getAuthenticatedUser()) {
      this.logActivitySync(`sync.skip reason=${reason} stage=no-auth-user`);
      return;
    }

    const clientResult = await this.cloud.ensureAuthenticatedClient(`activity-sync:${reason}`);
    if (!clientResult.client) {
      this.logActivitySync(
        `sync.skip reason=${reason} stage=no-cloud-session sessionState=${clientResult.sessionState}`,
      );
      return;
    }

    this.syncInProgress = true;
    this.emitState();
    this.logActivitySync(`sync.begin reason=${reason}`);

    try {
      await this.refreshOnlineState();
      if (!this.online) {
        this.logActivitySync(`sync.skip reason=${reason} stage=offline`);
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
      this.logActivitySync(
        `sync.complete reason=${reason} push=${uploadedTotal} pull=${this.lastPullDownloaded} pending=${this.repository.countBySyncStatus("pending")} failed=${this.repository.countBySyncStatus("failed")}`,
      );
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : String(error);
      console.warn("[ActivitySync] failed:", this.lastSyncError);
      this.logActivitySync(`sync.error reason=${reason} message=${this.lastSyncError}`);
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
      let activeRecord = record;
      const metadataProjectId =
        typeof activeRecord.metadata?.projectId === "string"
          ? activeRecord.metadata.projectId
          : null;

      if (metadataProjectId && this.ensureHostedProjectForSync) {
        const ensured = await this.ensureHostedProjectForSync(metadataProjectId);
        if (!ensured.ok) {
          this.repository.markFailed(
            activeRecord.cloudId,
            ensured.error ?? "Hosted project registration failed for Activity upload.",
          );
          this.logActivitySync(
            `push.registration_failed cloudId=${activeRecord.cloudId.slice(0, 8)} localProjectId=${metadataProjectId} error=${ensured.error ?? "unknown"}`,
          );
          continue;
        }
        if (ensured.projectId !== metadataProjectId) {
          this.repository.updateMetadataProjectId(activeRecord.cloudId, ensured.projectId);
          activeRecord = {
            ...activeRecord,
            metadata: {
              ...(activeRecord.metadata ?? {}),
              projectId: ensured.projectId,
            },
          };
          this.logActivitySync(
            `push.project_realigned cloudId=${activeRecord.cloudId.slice(0, 8)} from=${metadataProjectId.slice(0, 8)} to=${ensured.projectId.slice(0, 8)}`,
          );
        }
      }

      if (!this.canUploadRecord(activeRecord)) {
        const deniedProjectId =
          typeof activeRecord.metadata?.projectId === "string"
            ? activeRecord.metadata.projectId
            : "none";
        this.repository.markFailed(activeRecord.cloudId, "Project access denied for Activity upload.");
        this.logActivitySync(
          `push.denied cloudId=${activeRecord.cloudId.slice(0, 8)} projectId=${deniedProjectId}`,
        );
        continue;
      }

      if (!isActivitySyncAllowedEventType(activeRecord.type)) {
        this.repository.markFailed(
          activeRecord.cloudId,
          `Activity event type is not allowed. (event_type=${activeRecord.type})`,
        );
        continue;
      }

      this.repository.markSyncAttempt(activeRecord.cloudId);
      const teamId = this.resolveTeamId(activeRecord);
      const row = toCloudActivityRow({
        event: activeRecord,
        cloudId: activeRecord.cloudId,
        instanceId: this.instanceId,
        teamId,
      });

      const result = await this.cloudClient.upsertEvents([row]);
      if (result.errors.length > 0) {
        this.repository.markFailed(activeRecord.cloudId, result.errors[0] ?? "Upload failed.");
        this.logActivitySync(
          `push.rpc_failed cloudId=${activeRecord.cloudId.slice(0, 8)} projectId=${String(row.project_id ?? "none")} error=${result.errors[0] ?? "unknown"}`,
        );
        continue;
      }

      this.repository.markSynced(activeRecord.cloudId, now);
      uploaded += 1;
    }

    if (uploaded > 0) {
      this.settings.set(ACTIVITY_SYNC_LAST_PUSH_KEY, now);
    }

    return uploaded;
  }

  private async pullRemote(): Promise<void> {
    const context = this.access.getAuthorizationContext();
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
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
    const context = this.access.getAuthorizationContext();
    if (!context) return false;
    if (!projectId) return true;
    return context.accessibleProjectIds.includes(projectId);
  }

  private logActivitySync(message: string): void {
    if (!this.paths) {
      return;
    }
    const userId = this.auth.getAuthenticatedUser()?.userId;
    const suffix = userId ? ` user=${userId.slice(0, 8)}` : "";
    appendActivitySyncLog(this.paths, `${message}${suffix}`);
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
