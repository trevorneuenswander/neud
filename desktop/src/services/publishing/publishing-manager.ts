import type { AppSettingsRepository } from "../../repositories/app-settings-repository";
import type { ProjectsRepository } from "../../repositories/projects-repository";
import type { AccessAuthorizationService } from "../access-authorization-service";
import type { AuthLicenseManager } from "../auth-license-manager";
import type { LocalDataService } from "../local-data-service";
import type { AuthenticatedCloudCoordinator } from "../authenticated-cloud-coordinator";
import type { SupabasePublicConfig } from "../supabase-public-config";
import { getOrCreateNeudInstanceId } from "../neud-instance-id";
import { hashCanonicalProjectDataForPublish } from "../../publishing/hash";
import type { NeudPublishedProjectPayload } from "../../publishing/contract";
import { validatePublishedProjectPayload } from "../../publishing/validate";
import { CloudPublishingClient } from "./cloud-publishing-client";
import {
  PUBLISHING_DEBOUNCE_MS,
  PUBLISHING_DISABLE_GRACE_MS,
  PUBLISHING_HEARTBEAT_MS,
  PUBLISHING_MAX_PAYLOAD_BYTES,
  PUBLISHING_SETTINGS_POLL_MS,
  type PendingPublishPayload,
  type ProjectPublishingDiagnostics,
  type ProjectPublishingStatus,
  type PublishingDiagnostics,
  computePublishingBackoffMs,
  isRecoverablePublishingError,
  publishingProjectEnabledCacheKey,
  publishingProjectLastPublishedHashKey,
  publishingProjectLastPublishedRevisionKey,
  publishingProjectLastSuccessfulPublishAtKey,
  publishingProjectCanonicalPublishDiagnosticsKey,
} from "./types";
import {
  createDefaultProjectCanonicalPublishDiagnostics,
  type ProjectCanonicalPublishDiagnostics,
} from "../canonical/canonical-pipeline-diagnostics";
import {
  createDefaultPublishingRuntimeStatus,
  PUBLISHING_RUNTIME_STATUS_KEY,
  type PublishingRuntimeStatus,
} from "./publishing-runtime-status";
import { validateLeaseRpcResponse, type ValidatedLeaseRpcResult } from "./publishing-lease-rpc";

type ProjectRuntimeState = {
  publishingEnabled: boolean;
  status: ProjectPublishingStatus;
  ownsLease: boolean;
  leaseOwnerInstanceId: string | null;
  leaseExpiresAt: string | null;
  lastLeaseHeartbeatAt: string | null;
  latestLocalRevision: number | null;
  latestLocalHash: string | null;
  latestPublishedRevision: number | null;
  latestPublishedHash: string | null;
  latestPublishedSourceMode: ProjectPublishingDiagnostics["sourceMode"];
  latestPublishedSourceConnected: boolean | null;
  lastSuccessfulPublishAt: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  lastErrorSummary: string | null;
  retryAttempt: number;
  pending: PendingPublishPayload | null;
  inFlight: boolean;
  sourceMode: ProjectPublishingDiagnostics["sourceMode"];
  sourceConnected: boolean | null;
  payloadSizeBytes: number | null;
  debounceTimer: NodeJS.Timeout | null;
  retryTimer: NodeJS.Timeout | null;
  resyncAfterInFlight: boolean;
  onlineViewerGraceTimer: NodeJS.Timeout | null;
  lastCanonicalPublishRequestedAt: string | null;
  lastCanonicalPublishReason: string | null;
  lastCanonicalPublicationAttemptAt: string | null;
  lastCanonicalPublicationResult: string | null;
  lastCanonicalNoChangeAt: string | null;
  lastCanonicalFailureCode: string | null;
  canonicalPublicationFollowUpRequested: boolean;
};

export class PublishingManager {
  private online = false;
  private initialized = false;
  private started = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private settingsTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private lastStopReason: string | null = null;
  private readonly instanceId: string;
  private readonly registeredHostedProjects = new Set<string>();
  private readonly projectStates = new Map<string, ProjectRuntimeState>();

  constructor(
    private readonly cloud: AuthenticatedCloudCoordinator,
    private readonly publicConfig: SupabasePublicConfig | null,
    private readonly settings: AppSettingsRepository,
    private readonly projects: ProjectsRepository,
    private readonly auth: AuthLicenseManager,
    private readonly access: AccessAuthorizationService,
    private readonly data: LocalDataService,
  ) {
    this.instanceId = getOrCreateNeudInstanceId(settings);
    this.initialized = true;
    this.persistRuntimeStatus();
  }

  private async getCloudClient(): Promise<CloudPublishingClient | null> {
    if (!this.publicConfig) {
      return null;
    }
    const acquisition = await this.cloud.acquireAuthenticatedClient("publishing");
    if (!acquisition.client) {
      return null;
    }
    return new CloudPublishingClient(acquisition.client);
  }

  private getAuthSnapshot() {
    return this.cloud.getAuthSnapshot();
  }

  private logPublisherLeaseEvent(
    stage: "acquire" | "renew" | "release" | "heartbeat" | "reconnect",
    input: {
      projectId: string;
      ok: boolean;
      reason?: string | null;
      leaseExpiresAt?: string | null;
      heartbeatAgeSeconds?: number | null;
    },
  ): void {
    const snapshot = this.getAuthSnapshot();
    if (process.env.NODE_ENV === "production") {
      return;
    }
    console.debug("[PublishingManager] publisher_lease", {
      stage,
      projectId: input.projectId,
      instanceId: this.instanceId,
      ok: input.ok,
      reason: input.reason ?? null,
      leaseExpiresAt: input.leaseExpiresAt ?? null,
      heartbeatAgeSeconds: input.heartbeatAgeSeconds ?? null,
      authenticatedCloudSessionAvailable: snapshot.authenticatedCloudSessionAvailable,
      sessionGeneration: snapshot.sessionGeneration,
    });
  }

  private async attemptCloudSessionRecovery(): Promise<boolean> {
    if (!this.publicConfig || !this.cloud.hasRestorableCloudSession()) {
      return false;
    }

    if (this.cloud.requiresReauthentication()) {
      return false;
    }

    if (this.cloud.isAuthenticatedCloudSessionAvailable()) {
      return true;
    }

    const acquisition = await this.cloud.acquireAuthenticatedClient("publishing-recovery", {
      forceRefresh: true,
    });
    if (acquisition.client) {
      this.logPublisherLeaseEvent("reconnect", {
        projectId: "*",
        ok: true,
        reason: acquisition.sessionRefreshResult,
      });
      return true;
    }

    return this.cloud.isAuthenticatedCloudSessionAvailable();
  }

  getRuntimeStatus(): PublishingRuntimeStatus {
    const persisted = this.settings.get<PublishingRuntimeStatus | null>(
      PUBLISHING_RUNTIME_STATUS_KEY,
      null,
    );
    const authSnapshot = this.getAuthSnapshot();

    return {
      ...(persisted ??
        createDefaultPublishingRuntimeStatus({
          initialized: this.initialized,
        })),
      initialized: this.initialized,
      running: this.started && !this.stopping,
      authenticatedSessionAvailable: authSnapshot.authenticatedCloudSessionAvailable,
      heartbeatTimerActive: this.heartbeatTimer !== null,
      lastHeartbeatAttemptAt:
        persisted?.lastHeartbeatAttemptAt ?? null,
      lastHeartbeatSuccessAt:
        persisted?.lastHeartbeatSuccessAt ?? null,
      lastHeartbeatErrorCode:
        persisted?.lastHeartbeatErrorCode ?? authSnapshot.lastRefreshErrorCode,
      lastStartReason: persisted?.lastStartReason ?? null,
      lastStopReason: this.lastStopReason ?? persisted?.lastStopReason ?? null,
      updatedAt: new Date().toISOString(),
    };
  }

  private persistRuntimeStatus(overrides: Partial<PublishingRuntimeStatus> = {}): void {
    const status = {
      ...this.getRuntimeStatus(),
      ...overrides,
      updatedAt: new Date().toISOString(),
    };
    this.settings.set(PUBLISHING_RUNTIME_STATUS_KEY, status);
  }

  private hasEligibleOnlineViewerTarget(): boolean {
    return this.projects
      .list()
      .some((project) => this.data.hasEligibleOnlineViewerDisplay(project.id));
  }

  ensureStarted(reason: string): void {
    const requestedAt = new Date().toISOString();
    const authSnapshot = this.getAuthSnapshot();
    const authenticatedSessionAvailable = authSnapshot.authenticatedCloudSessionAvailable;
    const eligibleOnlineDisplayCount = this.projects.list().filter((project) =>
      this.data.hasEligibleOnlineViewerDisplay(project.id),
    ).length;
    const persisted = this.settings.get<PublishingRuntimeStatus | null>(
      PUBLISHING_RUNTIME_STATUS_KEY,
      null,
    );

    if (!this.initialized) {
      this.persistRuntimeStatus({
        startRequestedAt: requestedAt,
        startRequestReason: reason,
        startAccepted: false,
        startRejectedReason: "not_initialized",
        authenticatedSessionAvailableAtStart: authenticatedSessionAvailable,
        eligibleOnlineDisplayCountAtStart: eligibleOnlineDisplayCount,
      });
      return;
    }

    if (!this.cloud.hasRestorableCloudSession()) {
      this.persistRuntimeStatus({
        startRequestedAt: requestedAt,
        startRequestReason: reason,
        startAccepted: false,
        startRejectedReason: "cloud_session_unavailable",
        authenticatedSessionAvailableAtStart: false,
        eligibleOnlineDisplayCountAtStart: eligibleOnlineDisplayCount,
      });
      return;
    }

    const timerAlreadyActive = this.heartbeatTimer !== null;
    let heartbeatTimerCreatedAt = persisted?.heartbeatTimerCreatedAt ?? null;
    if (!this.started) {
      this.started = true;
      this.stopping = false;
      this.lastStopReason = null;
      void this.refreshOnlineState();
      this.heartbeatTimer = setInterval(() => {
        void this.runHeartbeatCycle();
      }, PUBLISHING_HEARTBEAT_MS);
      this.settingsTimer = setInterval(() => {
        void this.refreshAllProjectSettings();
      }, PUBLISHING_SETTINGS_POLL_MS);
      heartbeatTimerCreatedAt = new Date().toISOString();
    }

    this.persistRuntimeStatus({
      startRequestedAt: requestedAt,
      startRequestReason: reason,
      startAccepted: true,
      startRejectedReason: null,
      authenticatedSessionAvailableAtStart: authenticatedSessionAvailable,
      eligibleOnlineDisplayCountAtStart: eligibleOnlineDisplayCount,
      heartbeatTimerCreatedAt,
      running: true,
      heartbeatTimerActive: this.heartbeatTimer !== null,
      lastStartReason: reason,
      lastStopReason: null,
    });

    if (!timerAlreadyActive) {
      void this.runHeartbeatCycle();
    }
  }

  start(): void {
    this.ensureStarted("start");
  }

  private async ensureHostedProjectRegistered(
    cloudClient: CloudPublishingClient,
    projectId: string,
  ): Promise<{ ok: true } | { ok: false; message: string; code?: string }> {
    if (this.registeredHostedProjects.has(projectId)) {
      return { ok: true };
    }

    const project = this.projects.getById(projectId);
    if (!project) {
      return { ok: false, message: "Project not found.", code: "invalid_input" };
    }

    const result = await cloudClient.registerHostedProject({
      projectId: project.id,
      slug: project.slug,
      name: project.name,
      projectType: project.projectType,
    });

    if (!result.ok) {
      return {
        ok: false,
        message: result.message ?? "Unable to register hosted project identity.",
        code: result.code,
      };
    }

    this.registeredHostedProjects.add(projectId);
    return { ok: true };
  }

  async stop(reason = "stop"): Promise<void> {
    if (!this.started && !this.heartbeatTimer) {
      return;
    }
    this.stopping = true;
    this.started = false;
    this.lastStopReason = reason;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.settingsTimer) {
      clearInterval(this.settingsTimer);
      this.settingsTimer = null;
    }

    this.persistRuntimeStatus({
      running: false,
      heartbeatTimerActive: false,
      lastStopReason: reason,
    });

    const releaseTargets = [...this.projectStates.entries()].filter(
      ([, state]) => state.ownsLease && state.publishingEnabled,
    );

    await Promise.race([
      Promise.allSettled(
        releaseTargets.map(async ([projectId]) => {
          try {
            const cloudClient = await this.getCloudClient();
            if (!cloudClient) {
              return;
            }
            await cloudClient.releaseLease(projectId, this.instanceId);
          } catch (error) {
            console.warn(
              `[PublishingManager] Failed to release lease for ${projectId}:`,
              error instanceof Error ? error.message : error,
            );
          }
        }),
      ),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 2_000);
      }),
    ]);

    for (const state of this.projectStates.values()) {
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = null;
      }
      if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
      }
      if (state.onlineViewerGraceTimer) {
        clearTimeout(state.onlineViewerGraceTimer);
        state.onlineViewerGraceTimer = null;
      }
      state.inFlight = false;
      state.pending = null;
      state.ownsLease = false;
    }
  }

  notifyProjectCanonicalMayHaveChanged(projectId: string, reason = "canonical-change"): void {
    const state = this.ensureProjectState(projectId);
    if (!state.publishingEnabled) {
      return;
    }

    const now = new Date().toISOString();
    state.lastCanonicalPublishRequestedAt = now;
    state.lastCanonicalPublishReason = reason;
    this.persistProjectCanonicalPublishDiagnostics(projectId, state);

    if (state.inFlight) {
      state.resyncAfterInFlight = true;
      state.canonicalPublicationFollowUpRequested = true;
      return;
    }
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }

    const delayMs = reason === "heartbeat" ? PUBLISHING_DEBOUNCE_MS : 0;
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      void this.syncProject(projectId, reason);
    }, delayMs);
  }

  async setProjectPublishingEnabled(projectId: string, enabled: boolean): Promise<void> {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId) {
      throw new Error("Sign in to manage online publishing.");
    }
    this.access.assertCanEditProjectSettings(userId, projectId);

    if (!this.cloud.isAuthenticatedCloudSessionAvailable()) {
      throw new Error("Online account session required to manage cloud publishing.");
    }

    const cloudClient = await this.getCloudClient();
    if (!cloudClient) {
      throw new Error("Cloud publishing session is unavailable.");
    }

    const registration = await this.ensureHostedProjectRegistered(cloudClient, projectId);
    if (!registration.ok) {
      throw new Error(registration.message);
    }

    const result = await cloudClient.setOnlinePublishingEnabled(projectId, enabled);
    if (!result.ok) {
      throw new Error(result.message ?? "Unable to update publishing settings.");
    }

    const state = this.ensureProjectState(projectId);
    state.publishingEnabled = enabled;
    this.settings.set(publishingProjectEnabledCacheKey(projectId), enabled);

    if (!enabled) {
      state.pending = null;
      state.status = "disabled";
      if (state.ownsLease) {
        try {
          await cloudClient.releaseLease(projectId, this.instanceId);
        } catch {
          // Best effort during disable.
        }
        state.ownsLease = false;
        state.leaseOwnerInstanceId = null;
        state.leaseExpiresAt = null;
      }
      return;
    }

    state.status = "waiting_for_data";
    void this.syncProject(projectId, "enabled");
  }

  /**
   * When a display Online Viewer is enabled/disabled, reconcile whether the project
   * should publish canonical live data. Online Viewer on at least one eligible display
   * automatically enables project publishing; the last display off stops after grace.
   */
  ensureProjectPublishingForOnlineViewer(projectId: string): void {
    if (
      this.data.hasEligibleOnlineViewerDisplay(projectId) &&
      this.cloud.hasRestorableCloudSession()
    ) {
      this.ensureStarted("online-viewer-display");
    }
    void this.reconcileProjectPublishing(projectId);
  }

  getProjectDiagnostics(projectId: string): ProjectPublishingDiagnostics {
    const state = this.ensureProjectState(projectId);
    return this.toProjectDiagnostics(projectId, state);
  }

  getDiagnostics(): PublishingDiagnostics {
    const projectIds = new Set<string>([
      ...this.projects.list().map((project) => project.id),
      ...this.projectStates.keys(),
    ]);

    return {
      instanceId: this.instanceId,
      started: this.started && !this.stopping,
      online: this.online,
      authenticated: Boolean(this.auth.getAuthenticatedUser()),
      cloudSessionAvailable: this.cloud.isAuthenticatedCloudSessionAvailable(),
      projects: [...projectIds].map((projectId) =>
        this.toProjectDiagnostics(projectId, this.ensureProjectState(projectId)),
      ),
    };
  }

  private toProjectDiagnostics(
    projectId: string,
    state: ProjectRuntimeState,
  ): ProjectPublishingDiagnostics {
    return {
      projectId,
      publishingEnabled: state.publishingEnabled,
      status: state.status,
      instanceId: this.instanceId,
      leaseOwnerInstanceId: state.leaseOwnerInstanceId,
      ownsLease: state.ownsLease,
      leaseExpiresAt: state.leaseExpiresAt,
      lastLeaseHeartbeatAt: state.lastLeaseHeartbeatAt,
      latestLocalRevision: state.latestLocalRevision,
      latestLocalHash: state.latestLocalHash,
      latestPublishedRevision: state.latestPublishedRevision,
      latestPublishedHash: state.latestPublishedHash,
      lastSuccessfulPublishAt: state.lastSuccessfulPublishAt,
      lastAttemptAt: state.lastAttemptAt,
      nextRetryAt: state.nextRetryAt,
      lastErrorSummary: state.lastErrorSummary,
      queuedUpdatePresent: state.pending !== null,
      payloadSizeBytes: state.payloadSizeBytes,
      sourceMode: state.sourceMode,
      sourceConnected: state.sourceConnected,
    };
  }

  private persistProjectCanonicalPublishDiagnostics(
    projectId: string,
    state: ProjectRuntimeState,
  ): void {
    const payload: ProjectCanonicalPublishDiagnostics = {
      lastCanonicalPublicationAttemptAt: state.lastCanonicalPublicationAttemptAt,
      lastCanonicalPublicationResult: state.lastCanonicalPublicationResult,
      lastCanonicalPublishedRevision: state.latestPublishedRevision,
      lastCanonicalPublishedHashPrefix: state.latestPublishedHash
        ? state.latestPublishedHash.slice(0, 12)
        : null,
      lastCanonicalNoChangeAt: state.lastCanonicalNoChangeAt,
      lastCanonicalFailureCode: state.lastCanonicalFailureCode,
      lastCanonicalPublishRequestedAt: state.lastCanonicalPublishRequestedAt,
      lastCanonicalPublishReason: state.lastCanonicalPublishReason,
      canonicalPublicationPending: state.pending !== null,
      canonicalPublicationInProgress: state.inFlight,
      canonicalPublicationFollowUpRequested: state.canonicalPublicationFollowUpRequested,
      updatedAt: new Date().toISOString(),
    };
    this.settings.set(publishingProjectCanonicalPublishDiagnosticsKey(projectId), payload);
  }

  private ensureProjectState(projectId: string): ProjectRuntimeState {
    const existing = this.projectStates.get(projectId);
    if (existing) {
      return existing;
    }

    const cachedEnabled = this.settings.get<boolean>(
      publishingProjectEnabledCacheKey(projectId),
      false,
    );
    const created: ProjectRuntimeState = {
      publishingEnabled: cachedEnabled === true,
      status: cachedEnabled ? "waiting_for_data" : "disabled",
      ownsLease: false,
      leaseOwnerInstanceId: null,
      leaseExpiresAt: null,
      lastLeaseHeartbeatAt: null,
      latestLocalRevision: null,
      latestLocalHash: null,
      latestPublishedRevision: this.settings.get<number | null>(
        publishingProjectLastPublishedRevisionKey(projectId),
        null,
      ),
      latestPublishedHash: this.settings.get<string | null>(
        publishingProjectLastPublishedHashKey(projectId),
        null,
      ),
      latestPublishedSourceMode: null,
      latestPublishedSourceConnected: null,
      lastSuccessfulPublishAt: this.settings.get<string | null>(
        publishingProjectLastSuccessfulPublishAtKey(projectId),
        null,
      ),
      lastAttemptAt: null,
      nextRetryAt: null,
      lastErrorSummary: null,
      retryAttempt: 0,
      pending: null,
      inFlight: false,
      sourceMode: null,
      sourceConnected: null,
      payloadSizeBytes: null,
      debounceTimer: null,
      retryTimer: null,
      resyncAfterInFlight: false,
      onlineViewerGraceTimer: null,
      lastCanonicalPublishRequestedAt: null,
      lastCanonicalPublishReason: null,
      lastCanonicalPublicationAttemptAt: null,
      lastCanonicalPublicationResult: null,
      lastCanonicalNoChangeAt: null,
      lastCanonicalFailureCode: null,
      canonicalPublicationFollowUpRequested: false,
    };
    this.projectStates.set(projectId, created);
    return created;
  }

  private async refreshOnlineState(): Promise<void> {
    try {
      const cloudClient = await this.getCloudClient();
      this.online = cloudClient ? await cloudClient.ping() : false;
    } catch {
      this.online = false;
    }
  }

  private async refreshAllProjectSettings(): Promise<void> {
    if (!this.cloud.hasRestorableCloudSession()) {
      return;
    }

    const sessionReady = await this.attemptCloudSessionRecovery();
    if (!sessionReady) {
      return;
    }

    const cloudClient = await this.getCloudClient();
    if (!cloudClient) {
      return;
    }
    for (const project of this.projects.list()) {
      try {
        const registration = await this.ensureHostedProjectRegistered(cloudClient, project.id);
        if (!registration.ok) {
          continue;
        }
        const settings = await cloudClient.fetchPublishingSettings(project.id);
        const enabled = settings?.online_publishing_enabled === true;
        const state = this.ensureProjectState(project.id);
        const eligible = this.data.hasEligibleOnlineViewerDisplay(project.id);
        if (eligible && !enabled) {
          await this.ensureProjectPublishingEnabled(project.id);
          continue;
        }
        if (state.publishingEnabled !== enabled) {
          state.publishingEnabled = enabled;
          this.settings.set(publishingProjectEnabledCacheKey(project.id), enabled);
          if (!enabled) {
            state.status = "disabled";
            state.pending = null;
            state.ownsLease = false;
          } else {
            await this.syncProject(project.id, "settings-refresh");
          }
        }
      } catch (error) {
        console.debug(
          `[PublishingManager] settings refresh failed for ${project.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  private async runHeartbeatCycle(): Promise<void> {
    const attemptAt = new Date().toISOString();
    const persisted = this.settings.get<PublishingRuntimeStatus | null>(
      PUBLISHING_RUNTIME_STATUS_KEY,
      null,
    );
    const firstAttempt = persisted?.firstHeartbeatAttemptAt ?? attemptAt;
    this.persistRuntimeStatus({
      lastHeartbeatAttemptAt: attemptAt,
      firstHeartbeatAttemptAt: firstAttempt,
    });

    if (!this.hasEligibleOnlineViewerTarget()) {
      this.persistRuntimeStatus({
        authenticatedSessionAvailable: this.getAuthSnapshot().authenticatedCloudSessionAvailable,
        firstHeartbeatResult: "no_eligible_online_displays",
      });
      return;
    }

    if (!this.cloud.hasRestorableCloudSession()) {
      for (const state of this.projectStates.values()) {
        if (state.publishingEnabled) {
          state.status = "cloud_session_required";
        }
      }
      this.persistRuntimeStatus({
        authenticatedSessionAvailable: false,
        lastHeartbeatErrorCode: "no_cloud_session",
        firstHeartbeatResult: "no_cloud_session",
      });
      return;
    }

    const sessionReady = await this.attemptCloudSessionRecovery();
    if (!sessionReady) {
      const authSnapshot = this.getAuthSnapshot();
      const errorCode =
        authSnapshot.lastRefreshErrorCode ??
        (this.cloud.requiresReauthentication() ? "invalid_refresh_token" : "session_recovery_failed");
      for (const state of this.projectStates.values()) {
        if (state.publishingEnabled) {
          state.status = "cloud_session_required";
        }
      }
      this.persistRuntimeStatus({
        authenticatedSessionAvailable: authSnapshot.authenticatedCloudSessionAvailable,
        lastHeartbeatErrorCode: errorCode,
        firstHeartbeatResult: errorCode,
      });
      if (
        this.cloud.requiresReauthentication() ||
        !this.cloud.hasRestorableCloudSession()
      ) {
        await this.stop(
          this.cloud.requiresReauthentication()
            ? "invalid_refresh_token"
            : "cloud_session_unavailable",
        );
      }
      return;
    }

    await this.refreshOnlineState();
    this.persistRuntimeStatus({
      authenticatedSessionAvailable: this.getAuthSnapshot().authenticatedCloudSessionAvailable,
      lastHeartbeatErrorCode: null,
      firstHeartbeatResult: "session_ready",
    });

    await this.reconcileEffectivePublishing();

    let leaseHeartbeatSucceeded = false;
    for (const project of this.projects.list()) {
      const state = this.ensureProjectState(project.id);
      if (!state.publishingEnabled) {
        continue;
      }
      if (state.nextRetryAt && Date.parse(state.nextRetryAt) > Date.now()) {
        continue;
      }
      const heartbeatOk = await this.syncProject(project.id, "heartbeat");
      if (heartbeatOk) {
        leaseHeartbeatSucceeded = true;
      }
    }

    if (!leaseHeartbeatSucceeded) {
      this.persistRuntimeStatus({
        lastHeartbeatSuccessAt: null,
        heartbeatRpcSucceeded: false,
        heartbeatVerifiedInCloud: false,
        lastHeartbeatErrorCode:
          this.getRuntimeStatus().lastHeartbeatErrorCode ?? "lease_heartbeat_failed",
        firstHeartbeatResult: "lease_heartbeat_failed",
      });
    }
  }

  private async reconcileEffectivePublishing(): Promise<void> {
    if (this.stopping || !this.started) {
      return;
    }
    for (const project of this.projects.list()) {
      await this.reconcileProjectPublishing(project.id);
    }
  }

  private async reconcileProjectPublishing(projectId: string): Promise<void> {
    const eligible = this.data.hasEligibleOnlineViewerDisplay(projectId);
    const state = this.ensureProjectState(projectId);

    if (eligible) {
      if (state.onlineViewerGraceTimer) {
        clearTimeout(state.onlineViewerGraceTimer);
        state.onlineViewerGraceTimer = null;
      }
      if (!state.publishingEnabled) {
        await this.ensureProjectPublishingEnabled(projectId);
      }
      this.data.recordOnlineViewerReconcile(projectId);
      return;
    }

    if (!state.publishingEnabled || state.onlineViewerGraceTimer) {
      return;
    }

    state.onlineViewerGraceTimer = setTimeout(() => {
      state.onlineViewerGraceTimer = null;
      if (!this.data.hasEligibleOnlineViewerDisplay(projectId)) {
        void this.disableProjectPublishingWhenIdle(projectId);
      }
    }, PUBLISHING_DISABLE_GRACE_MS);
  }

  private async ensureProjectPublishingEnabled(projectId: string): Promise<void> {
    const state = this.ensureProjectState(projectId);
    if (state.publishingEnabled) {
      return;
    }

    if (!this.cloud.hasRestorableCloudSession()) {
      return;
    }

    try {
      const cloudClient = await this.getCloudClient();
      if (!cloudClient) {
        return;
      }

      const registration = await this.ensureHostedProjectRegistered(cloudClient, projectId);
      if (!registration.ok) {
        return;
      }

      const result = await cloudClient.setOnlinePublishingEnabled(projectId, true);
      if (!result.ok) {
        return;
      }

      state.publishingEnabled = true;
      this.settings.set(publishingProjectEnabledCacheKey(projectId), true);
      state.status = "waiting_for_data";
      await this.syncProject(projectId, "online-viewer");
    } catch (error) {
      console.debug(
        `[PublishingManager] auto-enable publishing failed for ${projectId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async disableProjectPublishingWhenIdle(projectId: string): Promise<void> {
    if (this.data.hasEligibleOnlineViewerDisplay(projectId)) {
      return;
    }

    const state = this.ensureProjectState(projectId);
    if (!state.publishingEnabled) {
      return;
    }

    try {
      await this.setProjectPublishingEnabled(projectId, false);
    } catch (error) {
      console.debug(
        `[PublishingManager] auto-disable publishing failed for ${projectId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private persistLeaseRpcDiagnostics(
    validated: ValidatedLeaseRpcResult,
    verifiedInCloud: boolean,
  ): void {
    this.persistRuntimeStatus({
      heartbeatRpcAttempted: validated.attempted,
      heartbeatRpcName: validated.rpcName,
      heartbeatRpcSucceeded: validated.succeeded && verifiedInCloud,
      heartbeatRpcErrorCode: validated.succeeded && !verifiedInCloud ? "cloud_verify_failed" : validated.errorCode,
      heartbeatRpcSafeMessage:
        validated.succeeded && !verifiedInCloud
          ? "Publisher lease RPC succeeded but cloud row did not match this desktop instance."
          : validated.safeMessage,
      heartbeatResponseValid: validated.responseValid,
      heartbeatVerifiedInCloud: verifiedInCloud,
      lastLeaseRpcAt: new Date().toISOString(),
    });
  }

  private async verifyPublisherLeaseInCloud(
    cloudClient: CloudPublishingClient,
    projectId: string,
    expectedExpiresAt: string | null,
  ): Promise<boolean> {
    try {
      const row = await cloudClient.fetchPublisherLease(projectId);
      if (!row || row.released_at != null) {
        return false;
      }
      if (row.publisher_instance_id !== this.instanceId) {
        return false;
      }
      const expiresMs = row.lease_expires_at ? Date.parse(row.lease_expires_at) : Number.NaN;
      if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
        return false;
      }
      if (expectedExpiresAt && row.lease_expires_at !== expectedExpiresAt) {
        // Allow minor clock skew; expiry must still be in the future.
        return Number.isFinite(expiresMs) && expiresMs > Date.now();
      }
      return true;
    } catch {
      return false;
    }
  }

  private async finalizeSuccessfulLeaseHeartbeat(
    projectId: string,
    state: ProjectRuntimeState,
    validated: ValidatedLeaseRpcResult,
    cloudClient: CloudPublishingClient,
    action: "renew" | "acquire",
  ): Promise<boolean> {
    const verified = await this.verifyPublisherLeaseInCloud(
      cloudClient,
      projectId,
      validated.leaseExpiresAt,
    );
    this.persistLeaseRpcDiagnostics(validated, verified);
    if (!verified) {
      state.ownsLease = false;
      this.persistRuntimeStatus({
        lastHeartbeatSuccessAt: null,
        lastHeartbeatErrorCode: "cloud_verify_failed",
      });
      return false;
    }

    state.ownsLease = true;
    state.leaseOwnerInstanceId = this.instanceId;
    state.leaseExpiresAt = validated.leaseExpiresAt;
    state.lastLeaseHeartbeatAt = new Date().toISOString();
    this.logPublisherLeaseEvent(action, {
      projectId,
      ok: true,
      leaseExpiresAt: state.leaseExpiresAt,
      heartbeatAgeSeconds: 0,
    });
    this.persistRuntimeStatus({
      lastHeartbeatSuccessAt: state.lastLeaseHeartbeatAt,
      lastHeartbeatErrorCode: null,
      heartbeatRpcSucceeded: true,
      heartbeatVerifiedInCloud: true,
    });
    return true;
  }

  private async ensurePublisherLease(
    projectId: string,
    state: ProjectRuntimeState,
    cloudClient: CloudPublishingClient,
  ): Promise<boolean> {
    if (state.ownsLease) {
      const renewedRaw = await cloudClient.renewLease(projectId, this.instanceId);
      const validated = validateLeaseRpcResponse("renew", renewedRaw);
      if (validated.succeeded) {
        return this.finalizeSuccessfulLeaseHeartbeat(
          projectId,
          state,
          validated,
          cloudClient,
          "renew",
        );
      }

      this.persistLeaseRpcDiagnostics(validated, false);
      this.logPublisherLeaseEvent("renew", {
        projectId,
        ok: false,
        reason: validated.errorCode ?? "renew_failed",
        leaseExpiresAt: validated.leaseExpiresAt ?? state.leaseExpiresAt,
      });

      state.ownsLease = false;
      this.persistRuntimeStatus({
        lastHeartbeatSuccessAt: null,
        lastHeartbeatErrorCode: validated.errorCode ?? "renew_failed",
      });
      if (validated.errorCode === "lease_not_owned") {
        // Fall through to acquire.
      } else if (
        validated.errorCode === "forbidden" ||
        validated.errorCode === "authentication_required"
      ) {
        state.status = "error";
        state.lastErrorSummary = validated.safeMessage ?? "Cloud publishing permission denied.";
        return false;
      } else if (validated.errorCode === "response_invalid") {
        state.status = "error";
        state.lastErrorSummary = validated.safeMessage ?? "Invalid publisher lease RPC response.";
        return false;
      } else {
        throw new Error(validated.safeMessage ?? "Unable to renew publisher lease.");
      }
    }

    state.status = "acquiring_lease";
    const leaseRaw = await cloudClient.acquireLease(projectId, this.instanceId);
    const validated = validateLeaseRpcResponse("acquire", leaseRaw);
    if (!validated.succeeded) {
      this.persistLeaseRpcDiagnostics(validated, false);
      this.logPublisherLeaseEvent("acquire", {
        projectId,
        ok: false,
        reason: validated.errorCode ?? "acquire_failed",
        leaseExpiresAt: validated.leaseExpiresAt,
      });
      this.persistRuntimeStatus({
        lastHeartbeatSuccessAt: null,
        lastHeartbeatErrorCode: validated.errorCode ?? "acquire_failed",
      });
      if (validated.errorCode === "lease_conflict") {
        state.status = "publisher_conflict";
        state.leaseOwnerInstanceId = validated.leasePublisherInstanceId;
        state.leaseExpiresAt = validated.leaseExpiresAt;
        state.lastErrorSummary =
          validated.safeMessage ?? "Another publisher owns this project.";
        this.scheduleRetry(projectId, state, "lease_conflict");
        return false;
      }
      if (validated.errorCode === "publishing_disabled") {
        if (this.data.hasEligibleOnlineViewerDisplay(projectId)) {
          await this.ensureProjectPublishingEnabled(projectId);
        } else {
          state.publishingEnabled = false;
          state.status = "disabled";
          this.settings.set(publishingProjectEnabledCacheKey(projectId), false);
        }
        return false;
      }
      if (
        validated.errorCode === "forbidden" ||
        validated.errorCode === "authentication_required"
      ) {
        state.status = "error";
        state.lastErrorSummary = validated.safeMessage ?? "Cloud publishing permission denied.";
        return false;
      }
      throw new Error(validated.safeMessage ?? "Unable to acquire publisher lease.");
    }

    return this.finalizeSuccessfulLeaseHeartbeat(
      projectId,
      state,
      validated,
      cloudClient,
      "acquire",
    );
  }

  private shouldMaintainPublisherLease(reason: string, unchanged: boolean): boolean {
    if (!unchanged) {
      return true;
    }
    return [
      "heartbeat",
      "online-viewer",
      "startup",
      "settings-refresh",
      "enabled",
      "retry",
      "lease-renew-retry",
    ].includes(reason);
  }

  private async syncProject(projectId: string, reason: string): Promise<boolean> {
    const heartbeatSync = reason === "heartbeat";
    let heartbeatLeaseMaintained = false;

    if (this.stopping) {
      return heartbeatSync ? false : true;
    }

    const state = this.ensureProjectState(projectId);
    if (!state.publishingEnabled) {
      state.status = "disabled";
      return heartbeatSync ? false : true;
    }

    if (!this.auth.getAuthenticatedUser()) {
      state.status = "authentication_required";
      return heartbeatSync ? false : true;
    }

    if (!this.cloud.isAuthenticatedCloudSessionAvailable()) {
      state.status = "cloud_session_required";
      return heartbeatSync ? false : true;
    }

    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId) {
      state.status = "authentication_required";
      return heartbeatSync ? false : true;
    }

    const capabilities = this.access.getProjectCapabilities(userId, projectId);
    if (!capabilities.canOperateEngines && !capabilities.canEditProjectSettings) {
      state.status = "error";
      state.lastErrorSummary = "You do not have permission to publish this project.";
      return heartbeatSync ? false : true;
    }

    if (!this.online) {
      state.status = "paused_offline";
      return heartbeatSync ? false : true;
    }

    const cloudClient = await this.getCloudClient();
    if (!cloudClient) {
      state.status = "cloud_session_required";
      return heartbeatSync ? false : true;
    }

    const registration = await this.ensureHostedProjectRegistered(cloudClient, projectId);
    if (!registration.ok) {
      state.status = registration.code === "forbidden" ? "error" : "cloud_session_required";
      state.lastErrorSummary = registration.message;
      return heartbeatSync ? false : true;
    }

    if (state.inFlight) {
      state.resyncAfterInFlight = true;
      return heartbeatSync ? false : true;
    }

    state.inFlight = true;
    state.lastAttemptAt = new Date().toISOString();
    if (reason !== "heartbeat") {
      state.lastCanonicalPublicationAttemptAt = state.lastAttemptAt;
      state.canonicalPublicationFollowUpRequested = false;
      this.persistProjectCanonicalPublishDiagnostics(projectId, state);
    }

    try {
      const canonical = this.data.getLocalCanonicalProjectResponse(projectId);
      state.sourceMode = canonical.payload?.source.mode ?? null;
      state.sourceConnected = canonical.runtime.dataConnected;

      if (canonical.availability !== "ready" || !canonical.payload) {
        state.status = "waiting_for_data";
        if (this.shouldMaintainPublisherLease(reason, true)) {
          const leased = await this.ensurePublisherLease(projectId, state, cloudClient);
          heartbeatLeaseMaintained = leased && state.ownsLease;
          if (heartbeatLeaseMaintained) {
            state.status = "waiting_for_data";
          }
        }
        return heartbeatSync ? heartbeatLeaseMaintained : true;
      }

      const validation = validatePublishedProjectPayload(canonical.payload);
      if (!validation.ok) {
        state.status = "error";
        state.lastErrorSummary = validation.issues.join(" ");
        return heartbeatSync ? false : true;
      }

      if (validation.payload.projectId !== projectId) {
        state.status = "error";
        state.lastErrorSummary = "Published payload project identity mismatch.";
        return heartbeatSync ? false : true;
      }

      const payload = validation.payload;
      const payloadHash = hashCanonicalProjectDataForPublish(payload.data);
      const payloadSizeBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");

      state.latestLocalRevision = payload.revision;
      state.latestLocalHash = payloadHash;
      state.payloadSizeBytes = payloadSizeBytes;

      if (payloadSizeBytes > PUBLISHING_MAX_PAYLOAD_BYTES) {
        state.status = "error";
        state.lastErrorSummary = "Canonical payload exceeds the maximum publish size.";
        return heartbeatSync ? false : true;
      }

      const sourceUnchanged =
        state.latestPublishedSourceMode === payload.source.mode &&
        state.latestPublishedSourceConnected === payload.source.connected;

      const unchanged =
        payloadHash === state.latestPublishedHash &&
        payload.revision === state.latestPublishedRevision &&
        sourceUnchanged;

      if (this.shouldMaintainPublisherLease(reason, unchanged)) {
        const leased = await this.ensurePublisherLease(projectId, state, cloudClient);
        heartbeatLeaseMaintained = leased && state.ownsLease;
        if (!leased) {
          return heartbeatSync ? false : true;
        }
      }

      if (unchanged) {
        if (reason !== "heartbeat") {
          state.lastCanonicalNoChangeAt = new Date().toISOString();
          state.lastCanonicalPublicationResult = "duplicate_unchanged";
          this.persistProjectCanonicalPublishDiagnostics(projectId, state);
        }
        state.status = state.ownsLease ? "active" : "waiting_for_data";
        if (reason === "heartbeat") {
          state.pending = null;
        }
        return heartbeatSync ? heartbeatLeaseMaintained && state.ownsLease : true;
      }

      state.pending = {
        payload,
        payloadHash,
        payloadSizeBytes,
        queuedAt: new Date().toISOString(),
      };

      if (!state.ownsLease) {
        const leased = await this.ensurePublisherLease(projectId, state, cloudClient);
        if (!leased) {
          return heartbeatSync ? false : true;
        }
      }

      state.status = "publishing";
      const pending = state.pending;
      if (!pending) {
        state.status = "active";
        return heartbeatSync ? heartbeatLeaseMaintained && state.ownsLease : true;
      }

      const publishResult = await cloudClient.publishSnapshot({
        projectId,
        publisherInstanceId: this.instanceId,
        payload: pending.payload,
        payloadHash: pending.payloadHash,
      });

      if (!publishResult.ok) {
        state.lastCanonicalPublicationResult = publishResult.code ?? "publish_failed";
        state.lastCanonicalFailureCode = publishResult.code ?? "publish_failed";
        this.persistProjectCanonicalPublishDiagnostics(projectId, state);
        if (publishResult.code === "duplicate_unchanged") {
          this.markPublished(
            state,
            projectId,
            pending.payloadHash,
            pending.payload.revision,
            pending.payload.source,
          );
          state.pending = null;
          state.status = "active";
          state.retryAttempt = 0;
          state.nextRetryAt = null;
          state.lastErrorSummary = null;
          heartbeatLeaseMaintained = state.ownsLease;
          return heartbeatSync ? heartbeatLeaseMaintained : true;
        }
        if (publishResult.code === "stale_revision") {
          const latestRevision =
            typeof publishResult.latest_revision === "number"
              ? publishResult.latest_revision
              : null;
          const cloudSnapshot =
            latestRevision == null
              ? await cloudClient.fetchLatestCanonicalSnapshot(projectId)
              : null;
          const resolvedRevision =
            latestRevision ?? cloudSnapshot?.revision ?? state.latestPublishedRevision;
          const resolvedHash =
            cloudSnapshot?.payload_hash ?? state.latestPublishedHash ?? pending.payloadHash;
          if (resolvedRevision != null) {
            this.data.realignCanonicalRevisionTracker(projectId, resolvedRevision, resolvedHash);
            const realigned = this.data.getLocalCanonicalProjectResponse(projectId);
            if (realigned.ok && realigned.payload) {
              state.latestLocalRevision = realigned.payload.revision;
              state.latestLocalHash = hashCanonicalProjectDataForPublish(realigned.payload.data);
              state.pending = {
                payload: realigned.payload,
                payloadHash: state.latestLocalHash,
                payloadSizeBytes: Buffer.byteLength(JSON.stringify(realigned.payload), "utf8"),
                queuedAt: new Date().toISOString(),
              };
              state.lastCanonicalPublicationResult = "stale_revision_realigned";
              void this.syncProject(projectId, "stale-revision-realign");
              return heartbeatSync ? heartbeatLeaseMaintained : true;
            }
          }
        }
        if (publishResult.code === "lease_not_owned") {
          state.ownsLease = false;
          state.status = "acquiring_lease";
          this.scheduleRetry(projectId, state, publishResult.code);
          return heartbeatSync ? false : true;
        }
        if (publishResult.code === "forbidden" || publishResult.code === "authentication_required") {
          state.status = "error";
          state.lastErrorSummary = publishResult.message ?? "Cloud publishing permission denied.";
          return heartbeatSync ? false : true;
        }
        state.status = "error";
        state.lastErrorSummary = publishResult.message ?? "Publish failed.";
        if (!isRecoverablePublishingError(publishResult.code)) {
          state.retryAttempt = 0;
          state.nextRetryAt = null;
          return heartbeatSync ? false : true;
        }
        this.scheduleRetry(projectId, state, publishResult.code);
        return heartbeatSync ? false : true;
      }

      this.markPublished(
        state,
        projectId,
        publishResult.payload_hash ?? pending.payloadHash,
        publishResult.revision ?? pending.payload.revision,
        pending.payload.source,
      );

      state.lastCanonicalPublicationResult = publishResult.code ?? "published";
      state.lastCanonicalFailureCode = null;
      this.persistProjectCanonicalPublishDiagnostics(projectId, state);

      state.pending = null;
      state.status = "active";
      state.retryAttempt = 0;
      state.nextRetryAt = null;
      state.lastErrorSummary = null;
      console.debug(`[PublishingManager] published project=${projectId} reason=${reason}`);
      heartbeatLeaseMaintained = state.ownsLease;
      return heartbeatSync ? heartbeatLeaseMaintained : true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.status = this.online ? "reconnecting" : "paused_offline";
      state.lastErrorSummary = message;
      this.scheduleRetry(projectId, state, "network");
      console.warn(`[PublishingManager] sync failed project=${projectId}:`, message);
      return heartbeatSync ? false : true;
    } finally {
      state.inFlight = false;
      if (state.resyncAfterInFlight && state.publishingEnabled && !this.stopping) {
        state.resyncAfterInFlight = false;
        void this.syncProject(projectId, "coalesced");
      }
    }
  }

  private markPublished(
    state: ProjectRuntimeState,
    projectId: string,
    payloadHash: string,
    revision: number,
    source?: NeudPublishedProjectPayload["source"],
  ): void {
    const publishedAt = new Date().toISOString();
    state.latestPublishedHash = payloadHash;
    state.latestPublishedRevision = revision;
    state.lastSuccessfulPublishAt = publishedAt;
    if (source) {
      state.latestPublishedSourceMode = source.mode;
      state.latestPublishedSourceConnected = source.connected;
    }
    this.settings.set(publishingProjectLastPublishedHashKey(projectId), payloadHash);
    this.settings.set(publishingProjectLastPublishedRevisionKey(projectId), revision);
    this.settings.set(publishingProjectLastSuccessfulPublishAtKey(projectId), publishedAt);
  }

  private scheduleRetry(
    projectId: string,
    state: ProjectRuntimeState,
    code: string | null | undefined,
  ): void {
    if (!isRecoverablePublishingError(code)) {
      state.nextRetryAt = null;
      return;
    }
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
    }
    const delayMs = computePublishingBackoffMs(state.retryAttempt);
    state.retryAttempt += 1;
    state.nextRetryAt = new Date(Date.now() + delayMs).toISOString();
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      void this.syncProject(projectId, "retry");
    }, delayMs);
  }
}
