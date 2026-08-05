import type { AuthenticatedCloudCoordinator } from "../authenticated-cloud-coordinator";
import type { AppSettingsRepository } from "../../repositories/app-settings-repository";
import type { DisplayDeletionTombstonesRepository } from "../../repositories/display-deletion-tombstones-repository";
import type {
  DisplaySyncQueueRepository,
} from "../../repositories/display-sync-queue-repository";
import type { DisplaysRepository, LocalDisplay } from "../../repositories/displays-repository";
import type { ProjectDisplayCodeRepository } from "../../repositories/project-display-code-repository";
import type { ProjectCodeRevisionsRepository } from "../../repositories/project-code-revisions-repository";
import type { ProjectCodeStorageService } from "../project-code-storage-service";
import type { AuthLicenseManager } from "../auth-license-manager";
import type { ProjectsRepository } from "../../repositories/projects-repository";
import { getOrCreateNeudInstanceId } from "../neud-instance-id";
import { CloudDisplayClient } from "./cloud-display-client";
import { reconcileHostedProjectAndDisplayIdentity } from "./hosted-identity-reconciliation";
import {
  inlineStreamTickerLogoForHosted,
  isStreamTickerLogoReference,
} from "../../displays/stream-ticker-hosted-logo";
import {
  toCloudDisplayRevisionRow,
  toCloudDisplayRow,
  toCloudDisplayTombstoneRow,
} from "./cloud-display-mapper";
import {
  DISPLAY_SYNC_RUNTIME_STATUS_KEY,
  createDefaultDisplaySyncRuntimeStatus,
  type DisplaySyncRuntimeStatus,
} from "./display-sync-runtime-status";
import { pullRemoteDisplayHistory } from "./display-sync-pull";
import type { AppPaths } from "../app-paths";
import { appendDisplaySyncLog } from "../runtime-diagnostics-log";
import {
  DISPLAY_SYNC_BACKOFF_MS,
  DISPLAY_SYNC_LAST_ATTEMPT_KEY,
  DISPLAY_SYNC_LAST_CLOUD_ERROR_KEY,
  DISPLAY_SYNC_LAST_PASS_RESULT_KEY,
  DISPLAY_SYNC_LAST_PULL_KEY,
  DISPLAY_SYNC_LAST_PUSH_KEY,
  DISPLAY_SYNC_LAST_RESULT_KEY,
  createEmptyDisplaySyncPassResult,
  type DisplaySyncDiagnostics,
  type DisplaySyncOperationType,
  type DisplaySyncPassResult,
  type DisplaySyncState,
  type DisplaySyncUnavailableReason,
} from "./types";

type DisplaySyncListener = (state: DisplaySyncState) => void;

type OnlineViewerActivityRecorder = (input: {
  type:
    | "display.online_published"
    | "display.online_publish_failed"
    | "display.online_publish_resumed";
  projectId: string;
  displayId: string;
  displayName: string;
  message: string;
  metadata?: Record<string, unknown>;
}) => void;

export class DisplaySyncService {
  private initialized = false;
  private running = false;
  private online = false;
  private syncInProgress = false;
  private syncFollowUpRequested = false;
  private syncRequestedWhileUnavailable = false;
  private lastSyncError: string | null = null;
  private lastCloudErrorCode: string | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private uploadDebounceTimer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<DisplaySyncListener>();
  private readonly instanceId: string;
  private readonly cloudClient: CloudDisplayClient;
  private lastSyncReason: string | null = null;
  private lastStartAt: string | null = null;
  private lastStopAt: string | null = null;
  private lastSyncCompletedAt: string | null = null;
  private lastUnavailableReason: string | null = null;
  private lastPassResult: DisplaySyncPassResult = createEmptyDisplaySyncPassResult();
  private publicCloudConfigAvailable = false;

  constructor(
    private readonly cloud: AuthenticatedCloudCoordinator,
    private readonly settings: AppSettingsRepository,
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly displayCode: ProjectDisplayCodeRepository,
    private readonly revisions: ProjectCodeRevisionsRepository,
    private readonly storage: ProjectCodeStorageService,
    private readonly queue: DisplaySyncQueueRepository,
    private readonly tombstones: DisplayDeletionTombstonesRepository,
    private readonly auth: AuthLicenseManager,
    private readonly paths: AppPaths,
    private readonly onDisplaysChanged: () => void,
    private readonly recordOnlineViewerActivity: OnlineViewerActivityRecorder | null = null,
  ) {
    this.instanceId = getOrCreateNeudInstanceId(settings);
    this.cloudClient = new CloudDisplayClient(cloud);
    this.initialized = true;
    this.publicCloudConfigAvailable = cloud.isCloudConfigured();
    this.persistRuntimeStatus();
    this.logServiceEvent("service.init");
  }

  private logServiceEvent(message: string): void {
    const authSnapshot = this.cloud.getAuthSnapshot();
    appendDisplaySyncLog(
      this.paths,
      [
        message,
        `cloudConfigured=${this.cloud.isCloudConfigured()}`,
        `sessionAvailable=${this.cloud.isAuthenticatedCloudSessionAvailable()}`,
        `sessionRestorePending=${this.cloud.isSessionRestorePending()}`,
        `localAuth=${Boolean(this.auth.getAuthenticatedUser())}`,
        `hasCloudSession=${authSnapshot.hasCloudSession}`,
        `lastUnavailableReason=${this.lastUnavailableReason ?? "none"}`,
      ].join(" "),
    );
  }

  isRunning(): boolean {
    return this.running;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  updateRuntimeContext(input: {
    publicCloudConfigAvailable?: boolean;
    authenticatedSessionAvailable?: boolean;
    lastUnavailableReason?: string | null;
  }): void {
    if (input.publicCloudConfigAvailable !== undefined) {
      this.publicCloudConfigAvailable = input.publicCloudConfigAvailable;
    }
    if (input.lastUnavailableReason !== undefined) {
      this.lastUnavailableReason = input.lastUnavailableReason;
    }
    this.persistRuntimeStatus({
      authenticatedSessionAvailable:
        input.authenticatedSessionAvailable ??
        this.cloud.isAuthenticatedCloudSessionAvailable(),
    });
  }

  private resolveSyncUnavailableReason(): DisplaySyncUnavailableReason {
    if (!this.running) {
      return "service_not_running";
    }
    if (!this.auth.getAuthenticatedUser()) {
      return "auth_required";
    }
    const snapshot = this.cloud.getAuthSnapshot();
    if (snapshot.reauthenticationRequired) {
      return "invalid_refresh_token";
    }
    if (!snapshot.hasRestorableCloudSession) {
      return "cloud_session_unavailable";
    }
    if (!snapshot.authenticatedCloudSessionAvailable) {
      if (snapshot.lastRefreshErrorCode === "network_error") {
        return "network_unreachable";
      }
      if (
        snapshot.lastRefreshErrorCode === "refresh_failed" ||
        snapshot.refreshResult === "failure"
      ) {
        return "refresh_failed";
      }
      if (snapshot.lastRefreshErrorCode === "set_session_failed") {
        return "refresh_failed";
      }
      return "missing_authenticated_client";
    }
    return "unknown";
  }

  markServiceUnavailable(reason: string): void {
    this.lastUnavailableReason = reason;
    if (process.env.NODE_ENV !== "production") {
      console.debug("[DisplaySync] service_unavailable", {
        reason,
        initialized: this.initialized,
        running: this.running,
        pendingCount:
          this.queue.countByState("pending") + this.queue.countByState("failed"),
      });
    }
    this.persistRuntimeStatus();
  }

  getRuntimeStatus(): DisplaySyncRuntimeStatus {
    const persisted = this.settings.get<DisplaySyncRuntimeStatus | null>(
      DISPLAY_SYNC_RUNTIME_STATUS_KEY,
      null,
    );
    return {
      ...(persisted ??
        createDefaultDisplaySyncRuntimeStatus({
          initialized: this.initialized,
        })),
      initialized: this.initialized,
      running: this.running,
      publicCloudConfigAvailable:
        this.publicCloudConfigAvailable || this.cloud.isCloudConfigured(),
      authenticatedSessionAvailable: this.cloud.isAuthenticatedCloudSessionAvailable(),
      syncInProgress: this.syncInProgress,
      pendingFollowUp: this.syncFollowUpRequested,
      syncRequestedWhileUnavailable: this.syncRequestedWhileUnavailable,
      lastStartAt: this.lastStartAt,
      lastStopAt: this.lastStopAt,
      lastSyncAttemptAt: this.settings.get<string | null>(DISPLAY_SYNC_LAST_ATTEMPT_KEY, null),
      lastSyncCompletedAt: this.lastSyncCompletedAt,
      lastSyncResult: this.settings.get<string | null>(DISPLAY_SYNC_LAST_RESULT_KEY, null),
      lastCloudErrorCode:
        this.lastCloudErrorCode ??
        this.settings.get<string | null>(DISPLAY_SYNC_LAST_CLOUD_ERROR_KEY, null),
      lastUnavailableReason: this.lastUnavailableReason,
      pendingQueueCount:
        this.queue.countByState("pending") + this.queue.countByState("failed"),
      lastPassAttempted: this.lastPassResult.attempted,
      lastPassSucceeded: this.lastPassResult.succeeded,
      lastPassFailed: this.lastPassResult.failed,
      lastPassSkipped: this.lastPassResult.skipped,
      lastPassRemainingEligible: this.lastPassResult.remainingEligible,
      lastPassRemainingDelayedRetry: this.lastPassResult.remainingDelayedRetry,
      updatedAt: new Date().toISOString(),
    };
  }

  requestSync(reason = "manual"): void {
    if (!this.running) {
      this.syncRequestedWhileUnavailable = true;
      if (process.env.NODE_ENV !== "production") {
        console.debug("[DisplaySync] sync_requested", {
          reason,
          serviceRunning: false,
          deferred: true,
          pendingCount:
            this.queue.countByState("pending") + this.queue.countByState("failed"),
        });
      }
      this.persistRuntimeStatus();
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      console.debug("[DisplaySync] sync_requested", {
        reason,
        serviceRunning: true,
        deferred: false,
      });
    }
    void this.syncNow(reason);
  }

  start(): void {
    if (this.running) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[DisplaySync] service_start", { reason: "already_running" });
      }
      this.replayDeferredSyncIfNeeded();
      return;
    }

    this.running = true;
    this.lastStartAt = new Date().toISOString();
    this.lastUnavailableReason = null;
    this.logServiceEvent("service.start");
    if (process.env.NODE_ENV !== "production") {
      console.debug("[DisplaySync] service_start", {
        reason: "started",
        sessionAvailable: this.cloud.hasCloudSession(),
        authenticated: Boolean(this.auth.getAuthenticatedUser()),
      });
    }
    this.persistRuntimeStatus();

    void this.refreshOnlineState();
    this.periodicTimer = setInterval(() => {
      void this.syncNow("periodic");
    }, 60_000);
    this.replayDeferredSyncIfNeeded();
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
    if (this.uploadDebounceTimer) {
      clearTimeout(this.uploadDebounceTimer);
      this.uploadDebounceTimer = null;
    }
    if (this.running) {
      this.lastStopAt = new Date().toISOString();
    }
    this.running = false;
    this.persistRuntimeStatus();
  }

  private replayDeferredSyncIfNeeded(): void {
    if (!this.syncRequestedWhileUnavailable) {
      return;
    }
    this.syncRequestedWhileUnavailable = false;
    this.persistRuntimeStatus();
    void this.syncNow("deferred");
  }

  private persistRuntimeStatus(
    overrides: Partial<DisplaySyncRuntimeStatus> = {},
  ): void {
    const status = {
      ...this.getRuntimeStatus(),
      ...overrides,
      updatedAt: new Date().toISOString(),
    };
    this.settings.set(DISPLAY_SYNC_RUNTIME_STATUS_KEY, status);
  }

  subscribe(listener: DisplaySyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  isDeleted(displayId: string): boolean {
    return this.tombstones.isDeleted(displayId);
  }

  queueOperation(input: {
    operationType: DisplaySyncOperationType;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }): void {
    if (input.operationType === "display.active_revision.update") {
      const revisionId =
        typeof input.payload?.revisionId === "string" ? input.payload.revisionId : "unknown";
      appendDisplaySyncLog(
        this.paths,
        `display.active_revision.local displayId=${input.entityId} revisionId=${revisionId}`,
      );
    }
    this.queue.enqueue({
      entityType: input.entityType,
      entityId: input.entityId,
      operationType: input.operationType,
      payload: input.payload,
      sourceInstanceId: this.instanceId,
    });
    this.scheduleUpload();
    this.emitState();
  }

  recordDeletionTombstone(input: {
    displayId: string;
    projectId: string;
    deletedByUserId?: string | null;
  }): void {
    this.tombstones.create({
      displayId: input.displayId,
      projectId: input.projectId,
      deletedByUserId: input.deletedByUserId,
      sourceInstanceId: this.instanceId,
    });
    this.queueOperation({
      operationType: "display.delete",
      entityType: "display",
      entityId: input.displayId,
      payload: { projectId: input.projectId },
    });
  }

  getDiagnostics(): DisplaySyncDiagnostics {
    const queueSummary = this.queue.getSummary();
    return {
      instanceId: this.instanceId,
      online: this.online,
      pendingQueueCount: this.queue.countByState("pending") + this.queue.countByState("failed"),
      pendingDisplayCount: this.displays.listPendingSync(1000).length,
      pendingTombstoneCount: this.tombstones.listPending(1000).length,
      pendingDisplayRows: queueSummary.pendingDisplayRows,
      pendingRevisionRows: queueSummary.pendingRevisionRows,
      failedDisplayRows: queueSummary.failedDisplayRows,
      failedRevisionRows: queueSummary.failedRevisionRows,
      oldestPendingAt: queueSummary.oldestPendingAt,
      lastSyncError: this.lastSyncError,
      lastDisplaySyncAttemptAt:
        this.settings.get<string | null>(DISPLAY_SYNC_LAST_ATTEMPT_KEY, null),
      lastDisplaySyncResult: this.settings.get<string | null>(DISPLAY_SYNC_LAST_RESULT_KEY, null),
      lastCloudErrorCode:
        this.lastCloudErrorCode ??
        this.settings.get<string | null>(DISPLAY_SYNC_LAST_CLOUD_ERROR_KEY, null),
      lastPassAttempted: this.lastPassResult.attempted,
      lastPassSucceeded: this.lastPassResult.succeeded,
      lastPassFailed: this.lastPassResult.failed,
      lastPassSkipped: this.lastPassResult.skipped,
      lastPassRemainingEligible: this.lastPassResult.remainingEligible,
      lastPassRemainingDelayedRetry: this.lastPassResult.remainingDelayedRetry,
      syncInProgress: this.syncInProgress,
      running: this.running,
      cloudSessionAvailable: this.cloud.getAuthSnapshot().hasCloudSession,
      authenticatedCloudSessionAvailable: this.cloud.isAuthenticatedCloudSessionAvailable(),
      displaySyncServiceRunning: this.running,
      authenticated: Boolean(this.auth.getAuthenticatedUser()),
      lastUnavailableReason: this.lastUnavailableReason,
    };
  }

  getState(): DisplaySyncState {
    const diagnostics = this.getDiagnostics();

    if (!this.cloud.isCloudConfigured()) {
      return {
        status: "error",
        message:
          "Cloud configuration is missing. Display sync requires packaged Supabase settings.",
      };
    }

    if (!this.running) {
      return {
        status: "idle",
        message: this.lastUnavailableReason
          ? "Display synchronization service is not running."
          : "Display synchronization is starting…",
      };
    }
    if (!this.auth.getAuthenticatedUser()) {
      return { status: "idle", message: "Sign in to synchronize displays." };
    }
    if (!this.cloud.isAuthenticatedCloudSessionAvailable()) {
      const authSnapshot = this.cloud.getAuthSnapshot();
      if (authSnapshot.reauthenticationRequired) {
        return {
          status: "error",
          message: "Your cloud session has expired. Sign in again to sync displays.",
        };
      }
      if (
        this.cloud.isSessionRestorePending() ||
        authSnapshot.hasRestorableCloudSession
      ) {
        return { status: "syncing", message: "Restoring cloud session…" };
      }
      return {
        status: "error",
        message: this.lastSyncError ?? "Cloud session is not available for display sync.",
      };
    }
    if (this.syncInProgress) {
      return { status: "syncing", message: "Syncing displays…" };
    }
    if (!this.online) {
      return { status: "offline", message: "Saved locally · Waiting to sync" };
    }
    if (diagnostics.pendingQueueCount > 0 || diagnostics.pendingTombstoneCount > 0) {
      if (this.lastSyncError) {
        return { status: "error", message: "Some display changes failed to sync." };
      }
      const lastResult = diagnostics.lastDisplaySyncResult;
      if (lastResult === "partial" || lastResult === "failed") {
        return { status: "syncing", message: "Saved locally · Finishing cloud sync…" };
      }
      return { status: "syncing", message: "Saved locally · Waiting to sync" };
    }
    if (this.lastSyncError) {
      return { status: "error", message: "Display sync error." };
    }
    return { status: "synced", message: "Synced" };
  }

  async syncNow(reason = "manual"): Promise<void> {
    if (!this.running) {
      this.syncRequestedWhileUnavailable = true;
      this.persistRuntimeStatus();
      this.logServiceEvent(`sync.skip reason=${reason} stage=service_not_running`);
      if (process.env.NODE_ENV !== "production") {
        console.debug("[DisplaySync] sync_attempt", {
          reason,
          accepted: false,
          serviceRunning: false,
        });
      }
      return;
    }
    if (this.syncInProgress) {
      this.syncFollowUpRequested = true;
      this.persistRuntimeStatus();
      return;
    }
    if (!this.cloud.isCloudConfigured()) {
      this.syncRequestedWhileUnavailable = true;
      this.markServiceUnavailable("missing_cloud_config");
      this.logServiceEvent(`sync.skip reason=${reason} stage=cloud_config_missing`);
      return;
    }
    if (!this.auth.getAuthenticatedUser()) {
      this.syncRequestedWhileUnavailable = true;
      this.markServiceUnavailable("auth_required");
      if (process.env.NODE_ENV !== "production") {
        console.debug("[DisplaySync] sync_attempt", {
          reason,
          accepted: false,
          sessionAvailable: false,
          errorCode: "auth_required",
        });
      }
      return;
    }
    if (!this.cloud.isAuthenticatedCloudSessionAvailable()) {
      this.syncRequestedWhileUnavailable = true;
      const clientResult = await this.cloud.ensureAuthenticatedClient(`display-sync:${reason}`);
      if (!clientResult.client) {
        const unavailableReason = this.resolveSyncUnavailableReason();
        this.markServiceUnavailable(unavailableReason);
        this.logServiceEvent(
          `sync.skip reason=${reason} stage=no-cloud-session sessionState=${clientResult.sessionState ?? unavailableReason}`,
        );
        if (
          unavailableReason === "refresh_failed" ||
          unavailableReason === "network_unreachable" ||
          clientResult.sessionState === "session_refresh_failed_transient" ||
          clientResult.sessionState === "authenticated_client_initialization_failed"
        ) {
          this.logServiceEvent(`sync.resumed reason=${reason} stage=retry_scheduled`);
          this.scheduleRetry();
        }
        if (process.env.NODE_ENV !== "production") {
          console.debug("[DisplaySync] sync_attempt", {
            reason,
            accepted: false,
            sessionAvailable: false,
            errorCode: unavailableReason,
          });
        }
        return;
      }
    }

    this.syncInProgress = true;
    this.lastSyncReason = reason;
    this.recordSyncAttempt("running");
    this.persistRuntimeStatus();
    this.emitState();
    if (process.env.NODE_ENV !== "production") {
      console.debug("[DisplaySync] sync_attempt", {
        reason,
        accepted: true,
        sessionAvailable: true,
        pendingCount:
          this.queue.countByState("pending") + this.queue.countByState("failed"),
      });
    }

    try {
      await this.refreshOnlineState();
      if (!this.online) {
        const unavailableReason = this.resolveSyncUnavailableReason();
        this.recordSyncAttempt("offline");
        this.markServiceUnavailable(
          unavailableReason === "unknown" ? "network_unreachable" : unavailableReason,
        );
        return;
      }

      await this.pushPending(reason);
      await pullRemoteDisplayHistory(
        {
          cloud: this.cloud,
          cloudClient: this.cloudClient,
          projects: this.projects,
          displays: this.displays,
          displayCode: this.displayCode,
          revisions: this.revisions,
          storage: this.storage,
          auth: this.auth,
          queue: this.queue,
          paths: this.paths,
          onDisplaysChanged: this.onDisplaysChanged,
        },
        reason,
      );
      await this.pullTombstones();
      this.lastSyncError = null;
      this.lastCloudErrorCode = null;
      this.lastUnavailableReason = null;
      this.settings.set(DISPLAY_SYNC_LAST_CLOUD_ERROR_KEY, null);
      const syncResult = this.resolveSyncPassResult(this.lastPassResult);
      this.recordSyncAttempt(syncResult);
      this.lastSyncCompletedAt = new Date().toISOString();
      if (syncResult !== "success" && syncResult !== "no_work") {
        this.lastSyncError =
          syncResult === "partial"
            ? "Display sync completed with remaining pending work."
            : null;
      }
      if (process.env.NODE_ENV !== "production") {
        console.debug("[DisplaySync] sync_complete", {
          reason,
          result: syncResult,
          pass: this.lastPassResult,
          pendingCount:
            this.queue.countByState("pending") + this.queue.countByState("failed"),
        });
      }
      console.debug(`[DisplaySync] completed reason=${reason} result=${syncResult}`);
      if (syncResult === "partial" && this.lastPassResult.remainingEligible > 0) {
        this.scheduleRetry();
      }
    } catch (error) {
      this.lastSyncError = error instanceof Error ? error.message : String(error);
      this.lastCloudErrorCode = extractLeadingErrorCode(this.lastSyncError);
      this.settings.set(DISPLAY_SYNC_LAST_CLOUD_ERROR_KEY, this.lastCloudErrorCode);
      this.recordSyncAttempt("failed");
      this.recordOnlineViewerSyncFailure(this.lastSyncError);
      if (process.env.NODE_ENV !== "production") {
        console.debug("[DisplaySync] sync_complete", {
          reason,
          result: "failed",
          errorCode: this.lastCloudErrorCode,
        });
      }
      console.warn("[DisplaySync] failed:", this.lastSyncError);
      this.scheduleRetry();
    } finally {
      this.syncInProgress = false;
      this.persistRuntimeStatus();
      this.emitState();
      if (this.syncFollowUpRequested) {
        this.syncFollowUpRequested = false;
        void this.syncNow("follow-up");
      }
    }
  }

  async reconcileLocalDisplays(projectIds: string[]): Promise<void> {
    for (const projectId of projectIds) {
      for (const display of this.displays.listByProject(projectId)) {
        this.queueOperation({
          operationType: "display.create",
          entityType: "display",
          entityId: display.id,
          payload: { projectId },
        });
      }
    }
    await this.syncNow("reconcile");
  }

  private scheduleUpload(): void {
    if (this.uploadDebounceTimer) {
      clearTimeout(this.uploadDebounceTimer);
    }
    this.uploadDebounceTimer = setTimeout(() => {
      this.uploadDebounceTimer = null;
      this.requestSync("mutation");
    }, 750);
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const attempt = Math.min(DISPLAY_SYNC_BACKOFF_MS.length - 1, 0);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow("retry");
    }, DISPLAY_SYNC_BACKOFF_MS[attempt]);
  }

  private recordSyncAttempt(result: string): void {
    const now = new Date().toISOString();
    this.settings.set(DISPLAY_SYNC_LAST_ATTEMPT_KEY, now);
    this.settings.set(DISPLAY_SYNC_LAST_RESULT_KEY, result);
    this.persistRuntimeStatus({ lastSyncAttemptAt: now, lastSyncResult: result });
  }

  private async refreshOnlineState(): Promise<void> {
    const snapshot = this.cloud.getAuthSnapshot();
    if (!snapshot.authenticatedCloudSessionAvailable) {
      this.online = false;
      return;
    }
    try {
      this.online = await this.cloudClient.ping();
    } catch {
      this.online = false;
    }
  }

  private resolveSyncPassResult(pass: DisplaySyncPassResult): string {
    if (pass.attempted === 0 && pass.remainingEligible === 0 && pass.remainingDelayedRetry === 0) {
      return "no_work";
    }
    if (pass.remainingEligible > 0) {
      return "partial";
    }
    if (pass.failed > 0) {
      return pass.succeeded > 0 ? "partial" : "failed";
    }
    return "success";
  }

  private persistPassResult(pass: DisplaySyncPassResult): void {
    this.lastPassResult = pass;
    this.settings.set(DISPLAY_SYNC_LAST_PASS_RESULT_KEY, pass);
    this.persistRuntimeStatus({
      lastPassAttempted: pass.attempted,
      lastPassSucceeded: pass.succeeded,
      lastPassFailed: pass.failed,
      lastPassSkipped: pass.skipped,
      lastPassRemainingEligible: pass.remainingEligible,
      lastPassRemainingDelayedRetry: pass.remainingDelayedRetry,
    });
  }

  private collectDisplaySyncTargets(): LocalDisplay[] {
    const byId = new Map<string, LocalDisplay>();

    for (const display of this.displays.listPendingSync(100)) {
      byId.set(display.id, display);
    }

    for (const entry of this.queue.listPendingDisplayOperations(200)) {
      if (entry.entityType !== "display") {
        continue;
      }
      const display = this.displays.getById(entry.entityId);
      if (display && !this.tombstones.isDeleted(display.id)) {
        byId.set(display.id, display);
      }
    }

    for (const entry of this.queue.listEligibleRevisionCreates(200)) {
      const revision = this.revisions.getById(entry.entityId);
      if (!revision || revision.resourceType !== "display") {
        continue;
      }
      const display = this.displays.getById(revision.resourceId);
      if (display && !this.tombstones.isDeleted(display.id)) {
        byId.set(display.id, display);
      }
    }

    return [...byId.values()];
  }

  private async pushPending(reason = "manual"): Promise<void> {
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    const syncedAt = new Date().toISOString();
    const pass = createEmptyDisplaySyncPassResult();
    const coalesced = this.queue.deduplicatePending();
    if (process.env.NODE_ENV !== "production" && coalesced > 0) {
      console.debug("[DisplaySync] coalesced duplicate queue entries", { count: coalesced });
    }

    const projectIds = new Set<string>([
      ...this.queue.listPendingProjectIds(500),
      ...this.collectDisplaySyncTargets().map((display) => display.projectId),
    ]);

    for (const projectId of projectIds) {
      const identity = await reconcileHostedProjectAndDisplayIdentity({
        cloud: this.cloud,
        projects: this.projects,
        displays: this.displays,
        displayCode: this.displayCode,
        projectId,
      });
      if (!identity.ok) {
        throw new Error(`${identity.code}: ${identity.message}`);
      }
      for (const display of this.displays.listByProject(identity.projectId)) {
        this.queue.repairPayloadProjectId(display.id, identity.projectId);
      }
      for (const realigned of identity.realignedDisplayIds) {
        const match = realigned.match(/^[^:]+:([^->]+)->(.+)$/);
        if (match?.[1] && match[2]) {
          this.queue.repairPayloadDisplayId(match[1], match[2]);
        }
      }
      if (process.env.NODE_ENV !== "production") {
        console.debug("[DisplaySync] identity", {
          reason,
          projectId: identity.projectId,
          realignedProjectId: identity.realignedProjectId,
          realignedDisplayIds: identity.realignedDisplayIds,
        });
      }
    }

    const displayTargets = this.collectDisplaySyncTargets();
    if (displayTargets.length > 0) {
      const baseResult = await this.pushDisplayBaseMetadata({
        reason,
        pendingDisplays: displayTargets,
        userId,
      });
      pass.attempted += baseResult.succeeded + baseResult.failed + baseResult.skipped;
      pass.succeeded += baseResult.succeeded;
      pass.failed += baseResult.failed;
      pass.skipped += baseResult.skipped;
    }

    const revisionResult = await this.pushPendingRevisions({ reason, userId });
    pass.attempted += revisionResult.attempted;
    pass.succeeded += revisionResult.succeeded;
    pass.failed += revisionResult.failed;
    pass.skipped += revisionResult.skipped;

    const publicationTargets = this.collectDisplaySyncTargets();
    if (publicationTargets.length > 0) {
      const publishResult = await this.pushDisplayPublicationMetadata({
        reason,
        pendingDisplays: publicationTargets,
        userId,
        syncedAt,
      });
      pass.attempted += publishResult.succeeded + publishResult.failed + publishResult.skipped;
      pass.succeeded += publishResult.succeeded;
      pass.failed += publishResult.failed;
      pass.skipped += publishResult.skipped;
    }

    const tombstoneRows = this.tombstones.listPending(50).map(toCloudDisplayTombstoneRow);
    if (tombstoneRows.length > 0) {
      pass.attempted += tombstoneRows.length;
      const tombstoneResult = await this.cloudClient.upsertTombstones(tombstoneRows);
      if (tombstoneResult.errors.length > 0) {
        pass.failed += tombstoneRows.length;
        throw new Error(
          `${tombstoneResult.codes.join(",") || "tombstone_upsert_failed"}: ${tombstoneResult.errors.join("; ")}`,
        );
      }
      pass.succeeded += tombstoneRows.length;
      for (const tombstone of tombstoneRows) {
        this.tombstones.markSynced(tombstone.display_id, syncedAt);
        this.queue.markSyncedForEntityOperations({
          entityId: tombstone.display_id,
          operationTypes: ["display.delete"],
        });
      }
    }

    pass.remainingEligible = this.queue.countEligiblePending();
    pass.remainingDelayedRetry = this.queue.countDelayedRetryPending();
    this.persistPassResult(pass);
    this.settings.set(DISPLAY_SYNC_LAST_PUSH_KEY, syncedAt);
  }

  private async pushDisplayBaseMetadata(input: {
    reason: string;
    pendingDisplays: LocalDisplay[];
    userId: string | null;
  }): Promise<Pick<DisplaySyncPassResult, "succeeded" | "failed" | "skipped">> {
    const result = { succeeded: 0, failed: 0, skipped: 0 };
    for (const display of input.pendingDisplays) {
      if (this.tombstones.isDeleted(display.id)) {
        result.skipped += 1;
        continue;
      }
      const code = this.displayCode.getByDisplayId(display.id);
      const baseRow = toCloudDisplayRow({
        display,
        code,
        instanceId: this.instanceId,
        userId: input.userId,
        publicationPhase: "base",
      });
      const upsertResult = await this.cloudClient.upsertDisplay(baseRow);
      if (upsertResult.errors.length > 0) {
        this.displays.markSyncFailed(display.id, upsertResult.errors.join("; "));
        this.setOnlinePublishError(display.id, upsertResult.errors.join("; "), upsertResult.codes[0] ?? null);
        result.failed += 1;
        continue;
      }
      result.succeeded += 1;
      this.logDisplayRowAttempt(display, code, "base", upsertResult.codes, true);
    }
    return result;
  }

  private async pushPendingRevisions(input: {
    reason: string;
    userId: string | null;
  }): Promise<Pick<DisplaySyncPassResult, "attempted" | "succeeded" | "failed" | "skipped">> {
    const result = { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
    const pendingRevisionOps = this.queue.listEligibleRevisionCreates(50);
    for (const entry of pendingRevisionOps) {
      const eligibility = this.queue.getEligibility(entry);
      if (!eligibility.eligibleNow) {
        result.skipped += 1;
        if (process.env.NODE_ENV !== "production") {
          console.debug("[DisplaySync] revision_skipped", {
            queueId: entry.id,
            operationType: entry.operationType,
            entityType: entry.entityType,
            entityId: entry.entityId,
            status: entry.syncState,
            attemptCount: entry.attemptCount,
            exclusionReason: eligibility.exclusionReason,
          });
        }
        continue;
      }

      if (!this.queue.shouldRetry(entry)) {
        this.queue.markIrrecoverable(entry.id, "max_retries_exceeded: Queue entry exceeded retry limit.");
        result.skipped += 1;
        continue;
      }

      const revision = this.revisions.getById(entry.entityId);
      if (!revision || revision.resourceType !== "display") {
        this.queue.markIrrecoverable(
          entry.id,
          "revision_not_found_locally: Pending revision no longer exists locally.",
        );
        result.skipped += 1;
        continue;
      }

      result.attempted += 1;
      this.queue.recordAttempt(entry.id);
      const attemptedEntry = { ...entry, attemptCount: entry.attemptCount + 1 };

      const storageRevisionId = String(revision.metadata?.storageRevisionId ?? revision.id);
      const bundle = this.storage.readDisplayRevision(
        revision.projectId,
        revision.resourceId,
        storageRevisionId,
      );
      if (!bundle) {
        this.queue.markFailed(
          entry.id,
          "revision_bundle_missing: Display revision files are missing locally.",
        );
        result.failed += 1;
        continue;
      }

      const versionNumber = this.resolveRevisionVersionNumber(revision);
      const display = this.displays.getById(revision.resourceId);
      const code = this.displayCode.getByDisplayId(revision.resourceId);
      const slug = code?.slug ?? display?.displayKey ?? revision.resourceId;
      const uploadHtml =
        slug === "stream-ticker" && isStreamTickerLogoReference(bundle.html)
          ? inlineStreamTickerLogoForHosted(bundle.html)
          : bundle.html;
      const row = toCloudDisplayRevisionRow({
        revision,
        displayId: revision.resourceId,
        projectId: revision.projectId,
        versionNumber,
        html: uploadHtml,
        instanceId: this.instanceId,
        userId: input.userId,
      });

      const shouldLog =
        process.env.NODE_ENV !== "production" &&
        (slug === "stream-bid-display" || input.reason === "online-viewer");

      const upsertResult = await this.cloudClient.upsertRevision(row);
      const continued = upsertResult.errors.length === 0;
      if (shouldLog) {
        console.debug("[DisplaySync] revision_attempt", {
          reason: input.reason,
          queueId: entry.id,
          slug,
          revisionId: row.id,
          displayId: row.display_id,
          projectId: row.project_id,
          versionNumber: row.version_number,
          syncVersion: row.sync_version,
          cloudUpsertOk: continued,
          cloudErrorCode: upsertResult.codes[0] ?? null,
          retryState: attemptedEntry.attemptCount,
          continuedToNextRow: true,
        });
      }

      if (!continued) {
        this.queue.markFailed(
          entry.id,
          `${upsertResult.codes[0] ?? "revision_upsert_failed"}: ${upsertResult.errors.join("; ")}`,
        );
        this.lastCloudErrorCode = upsertResult.codes[0] ?? "revision_upsert_failed";
        result.failed += 1;
        continue;
      }

      const exists = await this.cloudClient.revisionExists(row.id);
      if (!exists) {
        this.queue.markFailed(
          entry.id,
          "revision_not_confirmed_in_cloud: Cloud revision read-back failed.",
        );
        result.failed += 1;
        continue;
      }

      this.queue.markSynced(entry.id);
      result.succeeded += 1;
    }
    return result;
  }

  private async pushDisplayPublicationMetadata(input: {
    reason: string;
    pendingDisplays: LocalDisplay[];
    userId: string | null;
    syncedAt: string;
  }): Promise<Pick<DisplaySyncPassResult, "succeeded" | "failed" | "skipped">> {
    const result = { succeeded: 0, failed: 0, skipped: 0 };
    for (const display of input.pendingDisplays) {
      if (this.tombstones.isDeleted(display.id)) {
        result.skipped += 1;
        continue;
      }

      const code = this.displayCode.getByDisplayId(display.id);
      const onlineViewerEnabled =
        Boolean(code?.onlineViewerEnabled) && display.enabled;
      const targetRevisionId = code?.publishedRevisionId ?? null;

      if (targetRevisionId) {
        appendDisplaySyncLog(
          this.paths,
          `display.active_revision.push.begin displayId=${display.id} revisionId=${targetRevisionId}`,
        );
      }

      if (onlineViewerEnabled && targetRevisionId) {
        const revisionReady = await this.cloudClient.revisionExists(targetRevisionId);
        if (!revisionReady) {
          this.displays.markSyncFailed(
            display.id,
            "revision_not_ready: Published revision has not synced to cloud yet.",
          );
          this.setOnlinePublishError(
            display.id,
            "Published revision has not synced to cloud yet. Sync will retry automatically.",
            "revision_not_ready",
          );
          result.failed += 1;
          continue;
        }
      }

      const publishRow = toCloudDisplayRow({
        display,
        code,
        instanceId: this.instanceId,
        userId: input.userId,
        publicationPhase: "publish",
        publishedRevisionId: onlineViewerEnabled ? targetRevisionId : null,
        publishedAt: onlineViewerEnabled && targetRevisionId ? new Date().toISOString() : null,
      });

      const upsertResult = await this.cloudClient.upsertDisplay(publishRow);
      if (upsertResult.errors.length > 0) {
        this.displays.markSyncFailed(display.id, upsertResult.errors.join("; "));
        this.setOnlinePublishError(display.id, upsertResult.errors.join("; "), upsertResult.codes[0] ?? null);
        this.logDisplayRowAttempt(display, code, "publish", upsertResult.codes, false);
        result.failed += 1;
        continue;
      }

      const cloudDisplay = await this.cloudClient.fetchDisplayById(display.id);
      if (!cloudDisplay) {
        this.displays.markSyncFailed(display.id, "display_not_confirmed_in_cloud");
        this.setOnlinePublishError(
          display.id,
          "Cloud display read-back failed after update.",
          "display_not_confirmed_in_cloud",
        );
        result.failed += 1;
        continue;
      }

      if (onlineViewerEnabled) {
        if (
          !cloudDisplay.online_published_revision_id ||
          cloudDisplay.online_published_revision_id !== targetRevisionId
        ) {
          this.displays.markSyncFailed(display.id, "published_pointer_not_confirmed");
          this.setOnlinePublishError(
            display.id,
            "Cloud did not confirm the published revision pointer.",
            "published_pointer_not_confirmed",
          );
          result.failed += 1;
          continue;
        }
        const confirmedRevision = await this.cloudClient.revisionExists(
          cloudDisplay.online_published_revision_id,
        );
        if (!confirmedRevision) {
          this.displays.markSyncFailed(display.id, "published_revision_not_confirmed");
          this.setOnlinePublishError(
            display.id,
            "Cloud published revision could not be confirmed.",
            "published_revision_not_confirmed",
          );
          result.failed += 1;
          continue;
        }
      }

      this.displays.markSynced(display.id, input.syncedAt);
      this.queue.markSyncedForEntityOperations({
        entityId: display.id,
        operationTypes: [
          "display.create",
          "display.update",
          "display.archive",
          "display.unarchive",
          "display.active_revision.update",
          "display.order.update",
        ],
      });
      this.confirmLocalPublishedState(display, code, cloudDisplay);
      this.logDisplayRowAttempt(display, code, "publish", [], true);
      if (targetRevisionId) {
        appendDisplaySyncLog(
          this.paths,
          `display.active_revision.push.complete displayId=${display.id} revisionId=${targetRevisionId}`,
        );
      }
      result.succeeded += 1;
    }
    return result;
  }

  private confirmLocalPublishedState(
    display: LocalDisplay,
    code: ReturnType<ProjectDisplayCodeRepository["getByDisplayId"]>,
    cloudDisplay: {
      online_published_revision_id: string | null;
      online_published_at: string | null;
    },
  ): void {
    if (!code) {
      return;
    }

    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    const onlineViewerEnabled =
      Boolean(code.onlineViewerEnabled) && display.enabled;

    if (!onlineViewerEnabled) {
      if (code.onlinePublishedAt || code.onlinePublishedRevisionId || code.onlinePublishError) {
        this.displayCode.upsert({
          ...code,
          onlinePublishedAt: null,
          onlinePublishedRevisionId: null,
          onlinePublishError: null,
          updatedBy: userId ?? code.updatedBy,
        });
      }
      return;
    }

    const publishedRevisionId = cloudDisplay.online_published_revision_id;
    if (!publishedRevisionId) {
      return;
    }

    const hadError = Boolean(code.onlinePublishError);
    const publishedRevisionChanged = publishedRevisionId !== code.onlinePublishedRevisionId;
    const publishedAt = cloudDisplay.online_published_at ?? new Date().toISOString();

    this.displayCode.upsert({
      ...code,
      onlinePublishedRevisionId: publishedRevisionId,
      onlinePublishedAt: publishedAt,
      onlinePublishError: null,
      updatedBy: userId ?? code.updatedBy,
    });

    if (!this.recordOnlineViewerActivity) {
      return;
    }

    if (hadError) {
      this.recordOnlineViewerActivity({
        type: "display.online_publish_resumed",
        projectId: display.projectId,
        displayId: display.id,
        displayName: display.name,
        message: `Online viewer sync resumed for "${display.name}".`,
      });
      return;
    }

    if (publishedRevisionChanged || !code.onlinePublishedAt) {
      this.recordOnlineViewerActivity({
        type: "display.online_published",
        projectId: display.projectId,
        displayId: display.id,
        displayName: display.name,
        message: `Published "${display.name}" to the online viewer.`,
        metadata: { publishedRevisionId },
      });
    }
  }

  private setOnlinePublishError(
    displayId: string,
    message: string,
    code: string | null,
  ): void {
    const codeRow = this.displayCode.getByDisplayId(displayId);
    if (!codeRow?.onlineViewerEnabled) {
      return;
    }
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    this.displayCode.upsert({
      ...codeRow,
      onlinePublishError: code ? `${code}: ${message}` : message,
      updatedBy: userId ?? codeRow.updatedBy,
    });
    if (code) {
      this.lastCloudErrorCode = code;
      this.settings.set(DISPLAY_SYNC_LAST_CLOUD_ERROR_KEY, code);
    }
  }

  private resolveRevisionVersionNumber(
    revision: NonNullable<ReturnType<ProjectCodeRevisionsRepository["getById"]>>,
  ): number {
    if (revision.versionNumber) {
      return revision.versionNumber;
    }
    const allRevisions = this.revisions.listForResource({
      projectId: revision.projectId,
      resourceType: "display",
      resourceId: revision.resourceId,
    });
    const sorted = [...allRevisions].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return Math.max(sorted.findIndex((item) => item.id === revision.id) + 1, 1);
  }

  private logDisplayRowAttempt(
    display: LocalDisplay,
    code: ReturnType<ProjectDisplayCodeRepository["getByDisplayId"]>,
    phase: "base" | "publish",
    codes: string[],
    continued: boolean,
  ): void {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const slug = code?.slug ?? display.displayKey;
    if (slug !== "stream-bid-display") {
      return;
    }
    console.debug("[DisplaySync] row", {
      phase,
      projectId: display.projectId,
      displayId: display.id,
      slug,
      enabled: display.enabled,
      onlineViewerEnabled:
        Boolean(code?.onlineViewerEnabled) && display.enabled,
      publishedRevisionId: code?.publishedRevisionId ?? null,
      syncVersion: display.syncVersion,
      cloudErrorCode: codes[0] ?? null,
      continuedToNextRow: continued,
    });
  }

  private async pullTombstones(): Promise<void> {
    const since = this.settings.get<string | null>(DISPLAY_SYNC_LAST_PULL_KEY, null);
    const remote = await this.cloudClient.fetchTombstonesSince(since);
    for (const tombstone of remote) {
      if (tombstone.source_instance_id === this.instanceId) continue;
      if (this.tombstones.isDeleted(tombstone.display_id)) continue;
      const display = this.displays.getById(tombstone.display_id);
      if (!display) continue;
      this.tombstones.create({
        displayId: tombstone.display_id,
        projectId: tombstone.project_id,
        deletedByUserId: tombstone.deleted_by_user_id,
        sourceInstanceId: tombstone.source_instance_id,
      });
      this.storage.deleteDisplayTree(tombstone.project_id, tombstone.display_id);
      this.revisions.deleteByResource({
        projectId: tombstone.project_id,
        resourceType: "display",
        resourceId: tombstone.display_id,
      });
      this.displayCode.deleteByDisplayId(tombstone.display_id);
      this.displays.deleteById(tombstone.display_id);
    }
    if (remote.length > 0) {
      const latest = remote[remote.length - 1]?.deleted_at ?? new Date().toISOString();
      this.settings.set(DISPLAY_SYNC_LAST_PULL_KEY, latest);
      this.onDisplaysChanged();
    }
  }

  private emitState(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private recordOnlineViewerSyncFailure(errorMessage: string): void {
    if (!this.recordOnlineViewerActivity) {
      return;
    }
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    for (const display of this.displays.listPendingSync(50)) {
      const code = this.displayCode.getByDisplayId(display.id);
      if (!code?.onlineViewerEnabled) {
        continue;
      }
      this.displayCode.upsert({
        ...code,
        onlinePublishError: errorMessage,
        updatedBy: userId ?? code.updatedBy,
      });
      this.recordOnlineViewerActivity({
        type: "display.online_publish_failed",
        projectId: display.projectId,
        displayId: display.id,
        displayName: display.name,
        message: `Online viewer sync failed for "${display.name}".`,
        metadata: { error: errorMessage },
      });
    }
  }
}

function extractLeadingErrorCode(message: string): string | null {
  const match = message.match(/^([a-z0-9_]+):/i);
  return match?.[1] ?? null;
}
