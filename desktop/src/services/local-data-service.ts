import { applyLotPhotoOverrides } from "../bag/live-state/lot-photo-overrides";
import { randomUUID } from "crypto";
import type { ActivityEventsRepository } from "../repositories/activity-events-repository";
import type { ActivitySyncService } from "./activity-sync/activity-sync-service";
import type { ActivitySyncState } from "./activity-sync/types";
import type { SupabaseUserDirectorySyncService } from "./supabase-user-directory-sync/supabase-user-directory-sync-service";
import type { UserDirectorySyncState } from "./supabase-user-directory-sync/types";
import { resolveUserDetailsFields } from "./resolve-user-details-profile";
import type { SupabaseIdentityService } from "./supabase-identity-service";
import type { AuthenticatedCloudCoordinator } from "./authenticated-cloud-coordinator";
import { verifyAuthenticatedSupabaseSession } from "./auth-session-verification-service";
import { getOrCreateNeudInstanceId } from "./neud-instance-id";
import { resolveTrustedPortalOrigin } from "./trusted-portal-origin";
import { SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE } from "../auth/messages";
import { abbreviateUserId } from "../auth/local-desktop-identity";
import {
  classifyCloudAccessDirectoryFailure,
  CloudAccessDirectoryError,
  countCloudAccessDirectoryEntities,
  createEmptyCloudAccessDirectoryDiagnostics,
  shouldServeStaleCloudAccessCache,
  type CloudAccessDirectoryDiagnostics,
  type CloudAccessFallbackReason,
} from "./cloud-access-directory";
import path from "path";
import fs from "fs";
import { isPackagedDesktopRuntime } from "../lib/packaged-runtime";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type {
  DataSourcesRepository,
  LocalSourceStatus,
} from "../repositories/data-sources-repository";
import type { DisplaysRepository } from "../repositories/displays-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { LocalProjectMembershipsRepository } from "../repositories/local-project-memberships-repository";
import {
  toPortalDataEngine,
  toPortalDisplay,
  toPortalEngineStatus,
  toPortalLog,
  toPortalProject,
  toPortalScraperSettings,
  toPortalScraperSource,
  toPortalSnapshot,
} from "../mappers/portal-shapes";
import type { PylonDisplayService } from "./pylon-display-service";
import type { LowerTickerDisplayService } from "./lower-ticker-display-service";
import type { NewAuctionDisplaysService } from "./new-auction-displays-service";
import {
  buildNewAuctionGraphicPayload,
} from "../displays/new-auction-graphic-data";
import type { BagSourceService } from "./bag-source-service";
import { resolveEffectiveDisplayData } from "../displays/resolve-effective-display-data";
import { LOCAL_CONTROLLER_WAITING_STATUS } from "../displays/resolve-local-controller-display-data";
import { sanitizePylonFeedPayload, type PylonFeedPayload } from "../displays/pylon-data";
import {
  DISPLAY_DATA_SOURCE_SETTING_KEY,
  displayDataSourceLabel,
  isDisplayDataSource,
  normalizeDisplayDataSource,
  type DisplayDataSource,
} from "../displays/display-data-source";
import {
  formatDisplayRefreshRateLabel,
  isAllowedDisplayRefreshRateMs,
  normalizeDisplayRefreshRateMs,
} from "../displays/refresh-rate";
import {
  formatDisplaySizeLabel,
  isAllowedDisplaySize,
  normalizeDisplaySize,
} from "../displays/display-size";
import type { GenericScraperService } from "./generic-scraper-service";
import type { BagLiveStateService } from "../bag/live-state/bag-live-state-service";
import type { AuthLicenseManager } from "./auth-license-manager";
import type { AppPaths } from "./app-paths";
import {
  migrateLegacyEngineRuntimeAssets,
  type LegacyRuntimeMigrationResult,
} from "./legacy-runtime-migration";
import type { ProjectDeletionService } from "./project-deletion-service";
import type { BagProjectRepairService } from "./bag-project-repair-service";
import type { BroadArrowPhaseBootstrapService } from "./broad-arrow-phase-bootstrap-service";
import type { CredentialStore } from "./credential-store";
import { getProjectWebpageScraperCredentials } from "./project-scraper-auth";
import type { OfflineAuctionExportService } from "./offline-auction-export-service";
import {
  DISPLAY_VIEWER_STALE_MS,
  DisplayViewerSessionStore,
} from "./display-viewer-session-store";
import type { EngineManager } from "./engine-manager";
import {
  logDesiredStateTransition,
  logHeartbeatReceivedByParent,
} from "./worker-lifecycle-diagnostics";
import type {
  AuctionDatasetDisplayInfo,
  AuctionDatasetService,
} from "./auction-dataset-service";
import { buildBagRuntimeConfigForWorker } from "../bag/config/bag-runtime-config";
import {
  ExecutionLogSessionStore,
  type SessionExecutionLogEntry,
} from "./execution-log-session-store";
import {
  EngineStatusSessionStore,
  type EngineStatusSnapshot,
} from "./engine-status-session-store";
import {
  ActivitySessionStore,
  type ActivityActor,
  type ActivityEvent,
} from "./activity-session-store";
import {
  filterDeprecatedActivityEntries,
  isDeprecatedActivityType,
} from "./deprecated-activity-types";
import {
  normalizeActivityEventForDisplay,
  selectCompactActivityEvents,
} from "./activity-display";
import {
  canAccessProject,
  canManageProjectSettings,
  normalizeProjectIsActive,
  resolveAuthenticatedProjectRole,
  type ProjectRole,
} from "../projects/project-permissions";
import {
  formatActivityDescription,
  formatSystemActivityMessage,
} from "./activity-message";
import {
  ACTIVITY_SYSTEM_ACTOR_LABEL,
  isAutomatedActivityEventType,
} from "../lib/activity/actor-resolution";
import { formatPollingInterval } from "./poll-interval-format";
import type { AccessAuthorizationService } from "./access-authorization-service";
import { sendToRenderer } from "../ipc/channels";
import { BrowserWindow as BrowserWindowRuntime } from "electron";
import { closeDisplayViewerWindows, reconcileDisplayViewerWindows } from "./display-preview-window-manager";
import { localStatsDayKey } from "../lib/time/local-day";
import {
  importManualLotPhotosToDownload,
  resolveManualPhotoAssetPath,
} from "./lot-manual-photo-import";
import { finalizeDownloadPackage } from "./auction-data-paths";
import { getDownloadSizeForJsonPath } from "./auction-download-json-sync";
import { formatDownloadSize } from "./auction-download-size";
import type { UserDisplayOrderRepository } from "../repositories/user-display-order-repository";
import type { ProjectDisplayCodeRepository } from "../repositories/project-display-code-repository";
import { reconcileHostedProjectAndDisplayIdentity } from "./display-sync/hosted-identity-reconciliation";
import type { LocalDisplay } from "../repositories/displays-repository";
import { mergeDisplayOrder } from "../lib/displays/merge-display-order";
import {
  isBroadArrowCanonicalProject,
  shouldAutoSeedBagDisplays,
} from "../bag/broad-arrow-phase";
import {
  serializeCanonicalProjectSnapshot,
  validateCanonicalProjectData,
  type CanonicalProjectData,
} from "../displays/canonical-project-data";
import { normalizeBroadArrowDisplayData } from "../displays/normalize-broad-arrow-display-data";
import {
  buildPublishedProjectPayload,
  CanonicalRevisionTracker,
  hashCanonicalProjectDataForPublish,
  NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION,
  sanitizeCanonicalProjectData,
  type LocalCanonicalApiResponse,
} from "../publishing";
import {
  publishingProjectLastPublishedHashKey,
  publishingProjectLastPublishedRevisionKey,
} from "./publishing/types";
import type { PublishingManager } from "./publishing/publishing-manager";
import {
  buildCanonicalPipelineSnapshot,
  CANONICAL_PIPELINE_DIAGNOSTICS_KEY,
  CANONICAL_PROJECT_PIPELINE_KEY,
  createDefaultCanonicalPipelineDiagnostics,
  type CanonicalPipelineDiagnostics,
} from "./canonical/canonical-pipeline-diagnostics";

const REGISTRY_DISPLAY_KEYS = new Set([
  "pylon",
  "lower-ticker-v5",
  "new-bid-display-v1",
  "new-ticker-v1",
]);

export type LocalProjectsListMeta = {
  databasePath: string;
  projectCount: number;
  mode: "local";
  authenticatedUserId: string | null;
  authenticatedLocalUserId?: string | null;
  authenticatedUserEmail?: string | null;
  authenticatedUserDisplayName?: string | null;
  authenticatedUserTeam?: string | null;
  authenticatedUserRole?: string | null;
  identityStatus?:
    | "loading-session"
    | "loading-profile"
    | "ready"
    | "offline-ready"
    | "missing-profile"
    | "stale-session"
    | "identity-conflict"
    | "error";
  resolvedProfileSource?:
    | "remote-cache"
    | "local-user"
    | "team-membership"
    | "merged"
    | "supabase"
    | "none";
  primaryMembershipTeamName?: string | null;
  identityMessage?: string | null;
  identityRetryCount?: number;
  localCacheSyncStatus?: "idle" | "pending" | "synced" | "error";
  localCacheSyncErrorCode?: string | null;
  conflictingLocalUserId?: string | null;
  identityDiagnostics?: {
    authSessionPresent: boolean;
    supabaseUserValidation: string;
    profileQueryStatus: string;
    lastIdentityError: string | null;
    retryCount: number;
    supabaseProfileResolved?: boolean;
    localCacheSyncStatus?: string;
    identityAttemptId?: number | null;
    identityAttemptDurationMs?: number | null;
    loadingPromiseActive?: boolean;
  };
  isPlatformAdmin?: boolean;
  canCreateProject?: boolean;
  canDeleteProject?: boolean;
  canManageUsersAndAccess?: boolean;
  authorizationContext?: unknown;
  defaultProjectSlug?: string;
  filteringApplied: boolean;
};

export class LocalDataService {
  private localApiBaseUrl = "http://127.0.0.1:8070";
  private viewerBaseUrl = "http://127.0.0.1:3000";
  private readonly executionLogSession = new ExecutionLogSessionStore();
  private readonly engineStatusSession = new EngineStatusSessionStore();
  private readonly activitySession: ActivitySessionStore;
  private readonly activityEventsRepository: ActivityEventsRepository | null;
  private activitySync: ActivitySyncService | null = null;
  private displaySync: import("./display-sync/display-sync-service").DisplaySyncService | null =
    null;
  private activitySyncState: ActivitySyncState | null = null;
  private userDirectorySync: SupabaseUserDirectorySyncService | null = null;
  private userDirectorySyncState: UserDirectorySyncState | null = null;
  private cloudCoordinator: AuthenticatedCloudCoordinator | null = null;
  private activitySubscribers = new Set<number>();
  private displayDataSourceSubscribers = new Set<number>();
  private offlineAuctionService: OfflineAuctionExportService | null = null;
  private auctionDatasetService: AuctionDatasetService | null = null;
  private executionLogListeners = new Set<
    (engineId: string, entry: SessionExecutionLogEntry) => void
  >();
  private engineStatusListeners = new Set<
    (engineId: string, snapshot: EngineStatusSnapshot) => void
  >();
  private displayDataRevision = 0;
  private controllerStateRevision = 0;
  private scraperStateRevision = 0;
  private canonicalRevisionTrackers = new Map<string, CanonicalRevisionTracker>();
  private canonicalSnapshotLogHashes = new Map<string, string>();
  private lastObservedCanonicalSnapshot = new Map<string, Record<string, unknown>>();
  private startupAuthValidationStarted = false;
  private lastSessionRecoveryAt = 0;
  private static readonly SESSION_RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;
  private publishingManager: PublishingManager | null = null;
  private pendingExportCommands = new Map<
    string,
    {
      requestId: string;
      engineId: string;
      operationId: string;
      projectId?: string;
      workerId?: string;
      generation: number;
      tasks: Array<{ lotNumber: string; editUrl: string }>;
      photoDownloadRoot?: string;
      status: "pending" | "processing" | "completed" | "failed" | "cancelled";
      cancelRequested?: boolean;
      result?: Record<string, unknown>;
      error?: string;
      createdAt: number;
      processingStartedAt?: number;
      workerAcceptedAt?: number;
      lastWorkerEventAt?: number;
      progress?: {
        percent: number;
        completedMetadataLots: number;
        totalPhotos: number;
        completedPhotos: number;
        completedLots: number;
        totalLots: number;
        currentLotNumber?: string;
        currentPhotoIndex?: number;
        currentPhotoTotal?: number;
        phase?: string;
        message?: string;
      };
    }
  >();
  private exportCommandByEngine = new Map<string, string>();
  private exportGenerationByEngine = new Map<string, number>();
  private exportWorkerEventListeners = new Set<
    (payload: import("./export-worker-events").ExportWorkerProgressPayload) => void
  >();
  private startupDiagnosticsLogged = false;
  private readonly displayViewerSessions = new DisplayViewerSessionStore();
  private engineManager: EngineManager | null = null;
  private accessAuthorization: AccessAuthorizationService | null = null;
  private displayCodeRepo: ProjectDisplayCodeRepository | null = null;
  private accessManagement: import("./access-management-service").AccessManagementService | null =
    null;
  private supabaseIdentity: SupabaseIdentityService | null = null;
  private cloudPhotoAssetService: import("./cloud-photo-asset-service").CloudPhotoAssetService | null =
    null;
  private cloudAccessBridge: import("./cloud-access-bridge").CloudAccessBridge | null = null;
  private cloudAccessCache: import("../repositories/cloud-access-cache-repository").CloudAccessCacheRepository | null =
    null;
  private cloudAccessDirectoryDiagnostics: CloudAccessDirectoryDiagnostics =
    createEmptyCloudAccessDirectoryDiagnostics();
  private trustedAccessApi: import("./desktop-trusted-access-api-client").DesktopTrustedAccessApiClient | null =
    null;

  constructor(
    private readonly projects: ProjectsRepository,
    private readonly dataSources: DataSourcesRepository,
    private readonly displays: DisplaysRepository,
    private readonly settings: AppSettingsRepository,
    private readonly bagSources: BagSourceService,
    private readonly genericScraper: GenericScraperService,
    private readonly pylonDisplays: PylonDisplayService,
    private readonly lowerTickerDisplays: LowerTickerDisplayService,
    private readonly newAuctionDisplays: NewAuctionDisplaysService,
    private readonly bagLiveState: BagLiveStateService,
    private readonly paths: AppPaths,
    private readonly auth: AuthLicenseManager,
    private readonly memberships: LocalProjectMembershipsRepository,
    private readonly projectDeletion: ProjectDeletionService,
    private readonly bagRepair: BagProjectRepairService,
    private readonly broadArrowPhase: BroadArrowPhaseBootstrapService,
    private readonly credentials: CredentialStore,
    activityEvents?: ActivityEventsRepository,
    private readonly userDisplayOrder?: UserDisplayOrderRepository | null,
  ) {
    this.activityEventsRepository = activityEvents ?? null;
    this.activitySession = new ActivitySessionStore(activityEvents ?? null);
  }

  setActivitySync(service: ActivitySyncService) {
    this.activitySync = service;
    service.subscribe((state) => {
      this.activitySyncState = state;
    });
  }

  setDisplaySync(service: import("./display-sync/display-sync-service").DisplaySyncService) {
    this.displaySync = service;
  }

  getDisplaySyncDiagnostics() {
    return this.displaySync?.getRuntimeStatus() ?? null;
  }

  requestDisplaySync(reason = "manual") {
    this.displaySync?.requestSync(reason);
  }

  setSupabaseIdentity(service: SupabaseIdentityService) {
    this.supabaseIdentity = service;
  }

  getSupabaseIdentity(): SupabaseIdentityService | null {
    return this.supabaseIdentity;
  }

  async ensureIdentityLoaded(reason = "api"): Promise<void> {
    await this.supabaseIdentity?.ensureLoaded(reason);
  }

  kickIdentityResolution(reason = "background"): void {
    const identity = this.supabaseIdentity?.getResolvedIdentity();
    if (identity?.status === "loading") {
      return;
    }
    if (
      identity?.status === "online-ready" ||
      identity?.status === "offline-ready"
    ) {
      return;
    }
    void this.supabaseIdentity?.ensureLoaded(reason);
  }

  async refreshIdentity(reason = "manual"): Promise<void> {
    await this.supabaseIdentity?.refresh(reason);
  }

  resetIdentity(): void {
    this.supabaseIdentity?.reset();
  }

  getAuthSessionSnapshot() {
    const user = this.auth.getAuthenticatedUser();
    const status = this.auth.getStatus();
    return {
      authenticated: Boolean(user && status.allowed),
      userId: user?.userId ?? null,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      team: user?.team ?? null,
      role: user?.role ?? status.role ?? null,
    };
  }

  setUserDirectorySync(input: {
    service: SupabaseUserDirectorySyncService;
    cloud: AuthenticatedCloudCoordinator;
  }) {
    this.userDirectorySync = input.service;
    this.cloudCoordinator = input.cloud;
    input.service.subscribe((state) => {
      this.userDirectorySyncState = state;
    });
  }

  getAuthStatusBundle() {
    const auth = this.auth.getStatus();
    const userDirectorySync =
      this.userDirectorySyncState ?? this.userDirectorySync?.getState() ?? {
        status: "idle" as const,
        message: "User directory sync unavailable.",
        lastSuccessfulSyncAt: null,
        lastResult: null,
        syncInProgress: false,
        syncStartedAt: null,
        connectionOnline: false,
      };

    return {
      auth,
      connectionStatus:
        auth.mode === "online" || userDirectorySync.connectionOnline
          ? ("connected" as const)
          : ("offline" as const),
      cloudConfigured: this.cloudCoordinator?.isCloudConfigured() ?? false,
      hasCloudSession: this.cloudCoordinator?.hasCloudSession() ?? false,
      requiresCloudReauthentication: this.cloudCoordinator?.requiresReauthentication() ?? false,
      userDirectorySync: {
        status: userDirectorySync.status,
        message: userDirectorySync.message,
        lastSuccessfulSyncAt: userDirectorySync.lastSuccessfulSyncAt,
        syncInProgress: userDirectorySync.syncInProgress,
        syncStartedAt: userDirectorySync.syncStartedAt,
        connectionOnline: userDirectorySync.connectionOnline,
      },
    };
  }

  getHostedPortalOrigin(): {
    origin: string | null;
    configured: boolean;
    message?: string;
  } {
    const resolved = resolveTrustedPortalOrigin({
      allowLocalDevFallback: process.env.NEUD_DESKTOP_DEV === "1",
    });
    if (resolved.ok) {
      return { origin: resolved.origin, configured: true };
    }
    return {
      origin: null,
      configured: false,
      message:
        resolved.code === "trusted_portal_origin_missing"
          ? "Hosted portal URL is not configured. Set NEUD_TRUSTED_PORTAL_ORIGIN for View Online links."
          : resolved.message,
    };
  }

  async performStartupAuthValidation(): Promise<void> {
    if (this.startupAuthValidationStarted) {
      return;
    }
    this.startupAuthValidationStarted = true;

    if (!this.auth.isAccessAllowed()) {
      return;
    }

    if (!this.cloudCoordinator?.hasCloudSession()) {
      await this.supabaseIdentity?.ensureLoaded("startup");
      return;
    }

    const result = await this.verifyOnlineSession({ reason: "startup" });
    if (result.verification.status === "offline") {
      await this.supabaseIdentity?.ensureLoaded("startup");
    }
  }

  async recoverSessionAfterInternetRestore(): Promise<{
    attempted: boolean;
    status: ReturnType<LocalDataService["getAuthStatusBundle"]>;
  }> {
    const now = Date.now();
    if (now - this.lastSessionRecoveryAt < LocalDataService.SESSION_RECOVERY_COOLDOWN_MS) {
      return { attempted: false, status: this.getAuthStatusBundle() };
    }

    if (!this.auth.isAccessAllowed() || !this.cloudCoordinator?.hasCloudSession()) {
      return { attempted: false, status: this.getAuthStatusBundle() };
    }

    this.lastSessionRecoveryAt = now;
    const result = await this.verifyOnlineSession({ reason: "reconnect" });
    return { attempted: true, status: result.status };
  }

  async verifyOnlineSession(options?: {
    reason?: "startup" | "login" | "manual" | "reconnect" | "legacy";
  }): Promise<{
    verification: { status: "valid" | "offline" | "revoked"; message?: string };
    status: ReturnType<LocalDataService["getAuthStatusBundle"]>;
  }> {
    const reason = options?.reason ?? "legacy";
    const shouldRefreshIdentity =
      reason === "startup" || reason === "login" || reason === "manual" || reason === "legacy";
    const shouldSyncDirectory =
      reason === "startup" || reason === "login" || reason === "manual" || reason === "legacy";

    if (!this.cloudCoordinator) {
      return {
        verification: { status: "offline" },
        status: this.getAuthStatusBundle(),
      };
    }

    const supabase = await this.cloudCoordinator.getClient();
    if (!supabase) {
      return {
        verification: { status: "offline" },
        status: this.getAuthStatusBundle(),
      };
    }

    const authUser = this.auth.getAuthenticatedUser();
    if (!authUser) {
      return {
        verification: { status: "revoked", message: "No authenticated session." },
        status: this.getAuthStatusBundle(),
      };
    }

    try {
      const verification = await verifyAuthenticatedSupabaseSession({
        supabase,
        auth: this.auth,
      });

      if (verification.status === "revoked") {
        this.auth.clear();
        return {
          verification,
          status: this.getAuthStatusBundle(),
        };
      }

      if (verification.status === "valid") {
        this.auth.setConnectionOnline(true);
        if (shouldRefreshIdentity) {
          await this.refreshIdentity(reason === "legacy" ? "manual" : reason);
        }
        if (shouldSyncDirectory && this.userDirectorySync?.isStale()) {
          void this.userDirectorySync.syncNow(
            reason === "login" ? "login" : "startup",
          );
        }
      } else if (verification.status === "offline") {
        this.auth.setConnectionOnline(false);
      }

      return {
        verification,
        status: this.getAuthStatusBundle(),
      };
    } catch {
      this.auth.setConnectionOnline(false);
      return {
        verification: { status: "offline" },
        status: this.getAuthStatusBundle(),
      };
    }
  }

  async syncUserDirectory(
    reason: "manual" | "users-page" = "manual",
  ): Promise<ReturnType<LocalDataService["getAuthStatusBundle"]>> {
    if (this.userDirectorySync) {
      if (reason === "users-page" && !this.userDirectorySync.isStale()) {
        return this.getAuthStatusBundle();
      }
      await this.userDirectorySync.syncNow(reason);
    }
    return this.getAuthStatusBundle();
  }

  getActivitySyncState(): ActivitySyncState | null {
    return this.activitySyncState ?? this.activitySync?.getState() ?? null;
  }

  async syncActivityNow(): Promise<void> {
    await this.activitySync?.syncNow("manual");
    this.notifyActivitySyncChanged();
  }

  notifyActivitySyncChanged() {
    this.refreshActivityFromStore();
  }

  getActivitySessionStore(): ActivitySessionStore {
    return this.activitySession;
  }

  private refreshActivityFromStore() {
    this.activitySession.reloadFromRepository();
    this.pushActivitySnapshot();
  }

  private pushActivitySnapshot() {
    for (const windowId of this.activitySubscribers) {
      const window = BrowserWindowRuntime.fromId(windowId);
      if (window && !window.isDestroyed()) {
        sendToRenderer(window, "neud:activity:snapshot", {
          entries: this.getActivitySnapshot(),
          overviewEntries: this.getActivityOverviewSnapshot(),
        });
      }
    }
  }

  setLocalApiBaseUrl(baseUrl: string) {
    this.localApiBaseUrl = baseUrl.replace(/\/$/, "");
  }

  setViewerBaseUrl(baseUrl: string) {
    this.viewerBaseUrl = baseUrl.replace(/\/$/, "");
  }

  attachOfflineAuctionService(service: OfflineAuctionExportService) {
    this.offlineAuctionService = service;
  }

  attachAuctionDatasetService(service: AuctionDatasetService) {
    this.auctionDatasetService = service;
  }

  setPublishingManager(manager: PublishingManager) {
    this.publishingManager = manager;
  }

  getPublishingDiagnostics() {
    return this.publishingManager?.getDiagnostics() ?? null;
  }

  getProjectPublishingDiagnostics(projectId: string) {
    return this.publishingManager?.getProjectDiagnostics(projectId) ?? null;
  }

  async setProjectPublishingEnabled(projectId: string, enabled: boolean) {
    if (!this.publishingManager) {
      throw new Error("Publishing is unavailable.");
    }
    await this.publishingManager.setProjectPublishingEnabled(projectId, enabled);
  }

  notifyProjectCanonicalMayHaveChanged(projectId: string, reason = "canonical-change") {
    this.publishingManager?.notifyProjectCanonicalMayHaveChanged(projectId, reason);
  }

  /** Persists manual controller state without changing the selected data source. */
  notifyLocalControllerStateChanged(projectId: string, actionType: string) {
    const now = new Date().toISOString();
    this.controllerStateRevision += 1;
    const selectedSource = this.getDisplayDataSource();
    const previousSnapshot = this.lastObservedCanonicalSnapshot.get(projectId) ?? null;
    const activeSourceSelected = selectedSource === "local-controller";

    this.recordCanonicalPipelineDiagnostics(projectId, {
      triggerReason: `controller:${actionType}`,
      controllerActionType: actionType,
      previousSnapshot,
      publicationRequestedAt: activeSourceSelected ? now : null,
      inactiveSourceStateStaged: !activeSourceSelected,
    });

    if (activeSourceSelected) {
      this.notifyActiveCanonicalDataChanged(projectId, `controller:${actionType}`);
    }
  }

  /** @deprecated Use notifyLocalControllerStateChanged — kept for route wiring compatibility. */
  notifyLocalControllerCanonicalChanged(projectId: string, actionType: string) {
    this.notifyLocalControllerStateChanged(projectId, actionType);
  }

  /** Requests publication when changed data belongs to the currently selected source. */
  notifyActiveCanonicalDataChanged(projectId: string, reason: string) {
    this.notifyProjectCanonicalMayHaveChanged(projectId, reason);
  }

  /** Explicit data-source switch: updates selection and republishes from the new source. */
  notifySelectedCanonicalSourceChanged(
    source: DisplayDataSource,
    options?: { reason?: string },
  ): DisplayDataSource {
    return this.setDisplayDataSource(source, options);
  }

  observeScraperCanonicalUpdate(projectId: string) {
    const now = new Date().toISOString();
    this.scraperStateRevision += 1;
    const previousSnapshot = this.lastObservedCanonicalSnapshot.get(projectId) ?? null;
    this.recordCanonicalPipelineDiagnostics(projectId, {
      triggerReason: "scraper-update",
      previousSnapshot,
      scraperObservation: true,
      publicationRequestedAt: now,
    });
    this.notifyProjectCanonicalMayHaveChanged(projectId, "scraper-update");
  }

  recordOnlineViewerReconcile(projectId: string) {
    const diagnostics =
      this.settings.get<CanonicalPipelineDiagnostics>(
        CANONICAL_PROJECT_PIPELINE_KEY(projectId),
        createDefaultCanonicalPipelineDiagnostics(),
      ) ?? createDefaultCanonicalPipelineDiagnostics();
    this.settings.set(CANONICAL_PROJECT_PIPELINE_KEY(projectId), {
      ...diagnostics,
      lastOnlineViewerReconcileAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  getCanonicalPipelineDiagnostics(projectId?: string | null) {
    const global =
      this.settings.get<CanonicalPipelineDiagnostics>(
        CANONICAL_PIPELINE_DIAGNOSTICS_KEY,
        createDefaultCanonicalPipelineDiagnostics(),
      ) ?? createDefaultCanonicalPipelineDiagnostics();
    if (!projectId) {
      return global;
    }
    const projectSpecific =
      this.settings.get<CanonicalPipelineDiagnostics>(
        CANONICAL_PROJECT_PIPELINE_KEY(projectId),
        createDefaultCanonicalPipelineDiagnostics(),
      ) ?? createDefaultCanonicalPipelineDiagnostics();
    return {
      ...global,
      ...projectSpecific,
      selectedDataSource: this.getDisplayDataSource(),
      controllerStateRevision: this.controllerStateRevision,
      scraperStateRevision: this.scraperStateRevision,
    };
  }

  private recordCanonicalPipelineDiagnostics(
    projectId: string,
    input: {
      triggerReason: string;
      controllerActionType?: string | null;
      previousSnapshot?: Record<string, unknown> | null;
      scraperObservation?: boolean;
      publicationRequestedAt?: string | null;
      inactiveSourceStateStaged?: boolean | null;
    },
  ) {
    const source = this.getDisplayDataSource();
    const snapshot = this.getActiveCanonicalProjectSnapshot(projectId);
    const revision = this.getCanonicalRevisionTracker(projectId).getState().revision;
    const diagnostics = buildCanonicalPipelineSnapshot({
      selectedDataSource: source,
      controllerStateRevision: this.controllerStateRevision,
      scraperStateRevision: this.scraperStateRevision,
      canonicalSourceUsed: source,
      localCanonicalRevision: revision,
      snapshot: snapshot as CanonicalProjectData | null,
      previousSnapshot: (input.previousSnapshot ?? null) as CanonicalProjectData | null,
      triggerReason: input.triggerReason,
      controllerActionType: input.controllerActionType ?? null,
      scraperObservation: input.scraperObservation ?? false,
      publicationRequestedAt: input.publicationRequestedAt ?? null,
      inactiveSourceStateStaged: input.inactiveSourceStateStaged ?? null,
    });

    if (snapshot) {
      this.lastObservedCanonicalSnapshot.set(projectId, { ...snapshot });
    }

    this.settings.set(CANONICAL_PIPELINE_DIAGNOSTICS_KEY, diagnostics);
    this.settings.set(CANONICAL_PROJECT_PIPELINE_KEY(projectId), diagnostics);
  }

  hasEligibleOnlineViewerDisplay(projectId: string): boolean {
    return this.countEligibleOnlineViewerDisplays(projectId) > 0;
  }

  countEligibleOnlineViewerDisplays(projectId: string): number {
    if (!this.displayCodeRepo) {
      return 0;
    }

    let count = 0;
    for (const display of this.displays.listByProject(projectId)) {
      if (!display.enabled || display.deletedAt) {
        continue;
      }
      const code = this.displayCodeRepo.getByDisplayId(display.id);
      if (code?.archived) {
        continue;
      }
      if (code?.onlineViewerEnabled) {
        count += 1;
      }
    }
    return count;
  }

  reconcileProjectPublishingForOnlineViewer(projectId: string): void {
    this.publishingManager?.ensureProjectPublishingForOnlineViewer(projectId);
  }

  setEngineManager(engineManager: EngineManager) {
    this.engineManager = engineManager;
  }

  setAccessAuthorization(service: AccessAuthorizationService) {
    this.accessAuthorization = service;
  }

  setProjectDisplayCodeRepository(repository: ProjectDisplayCodeRepository) {
    this.displayCodeRepo = repository;
  }

  async ensureHostedProjectRegisteredForSync(projectId: string): Promise<{
    ok: boolean;
    projectId: string;
    realigned: boolean;
    error?: string;
  }> {
    if (!this.cloudCoordinator?.isAuthenticatedCloudSessionAvailable()) {
      return {
        ok: false,
        projectId,
        realigned: false,
        error: "Cloud session unavailable.",
      };
    }
    if (!this.displayCodeRepo) {
      return {
        ok: false,
        projectId,
        realigned: false,
        error: "Display code repository unavailable.",
      };
    }

    const result = await reconcileHostedProjectAndDisplayIdentity({
      cloud: this.cloudCoordinator,
      projects: this.projects,
      displays: this.displays,
      displayCode: this.displayCodeRepo,
      projectId,
    });

    if (!result.ok) {
      return {
        ok: false,
        projectId,
        realigned: false,
        error: result.message,
      };
    }

    if (result.realignedProjectId && this.activityEventsRepository) {
      this.activityEventsRepository.repairMetadataProjectId(projectId, result.projectId);
    }

    return {
      ok: true,
      projectId: result.projectId,
      realigned: result.realignedProjectId,
    };
  }

  getAccessAuthorization(): AccessAuthorizationService | null {
    return this.accessAuthorization;
  }

  getAuthorizationContext() {
    return this.accessAuthorization?.getAuthorizationContext() ?? null;
  }

  setAccessManagement(service: import("./access-management-service").AccessManagementService) {
    this.accessManagement = service;
  }

  setCloudAccessBridge(bridge: import("./cloud-access-bridge").CloudAccessBridge) {
    this.cloudAccessBridge = bridge;
  }

  setCloudAccessCache(
    repository: import("../repositories/cloud-access-cache-repository").CloudAccessCacheRepository,
  ) {
    this.cloudAccessCache = repository;
  }

  setTrustedAccessApi(
    client: import("./desktop-trusted-access-api-client").DesktopTrustedAccessApiClient,
  ) {
    this.trustedAccessApi = client;
  }

  private requireCloudAccessBridge() {
    if (!this.cloudAccessBridge) {
      throw new CloudAccessDirectoryError(
        "cloud_access_bridge_not_initialized",
        "Cloud access service could not be initialized.",
      );
    }
    if (!this.cloudCoordinator?.isCloudConfigured()) {
      throw new CloudAccessDirectoryError(
        "cloud_config_missing",
        "Cloud access is not configured.",
      );
    }
    if (this.cloudCoordinator?.requiresReauthentication()) {
      throw new CloudAccessDirectoryError(
        "cloud_reauthentication_required",
        "Your cloud session has expired. Sign in again to resume publishing and access management.",
      );
    }
    if (!this.cloudCoordinator?.hasCloudSession()) {
      throw classifyCloudAccessDirectoryFailure(
        new Error("No authenticated cloud session."),
        false,
      );
    }
    return this.cloudAccessBridge;
  }

  private mergeBridgeDiagnostics(
    diagnostics: CloudAccessDirectoryDiagnostics,
  ): CloudAccessDirectoryDiagnostics {
    const bridgeDiagnostics = this.cloudAccessBridge?.getBridgeDiagnostics();
    if (!bridgeDiagnostics) {
      return diagnostics;
    }
    return {
      ...diagnostics,
      sessionServiceInstanceIdHash: bridgeDiagnostics.sessionServiceInstanceIdHash,
      cloudAccessBridgeInstanceInitialized: bridgeDiagnostics.cloudAccessBridgeInstanceInitialized,
      bridgeUsesSharedSessionService: bridgeDiagnostics.bridgeUsesSharedSessionService,
      persistedTokensPresent: bridgeDiagnostics.persistedTokensPresent,
      authenticatedClientCreationAttempted:
        bridgeDiagnostics.authenticatedClientCreationAttempted,
      authenticatedClientCreationResult: bridgeDiagnostics.authenticatedClientCreationResult,
      authenticatedClientCreationErrorCode:
        bridgeDiagnostics.authenticatedClientCreationErrorCode,
      sessionRefreshAttempted: bridgeDiagnostics.sessionRefreshAttempted,
      sessionRefreshResult: bridgeDiagnostics.sessionRefreshResult,
      directoryRpcAttempted: bridgeDiagnostics.directoryRpcAttempted,
      cloudDirectoryRpcAttempted: bridgeDiagnostics.directoryRpcAttempted,
      firstCloudAccessFailureStage: bridgeDiagnostics.firstCloudAccessFailureStage,
      directoryRpcPostgrestCode: bridgeDiagnostics.directoryRpcPostgrestCode,
      directoryRpcSqlState: bridgeDiagnostics.directoryRpcSqlState,
      directoryRpcSafeMessage: bridgeDiagnostics.directoryRpcSafeMessage,
      directoryRpcSafeCategory: bridgeDiagnostics.directoryRpcSafeCategory,
      directoryRpcFailureSection: bridgeDiagnostics.directoryRpcFailureSection,
      directoryRpcFunctionSignature: bridgeDiagnostics.directoryRpcFunctionSignature,
      directoryRpcCallerUidPresent: bridgeDiagnostics.directoryRpcCallerUidPresent,
      directoryRpcCallerAuthorized: bridgeDiagnostics.directoryRpcCallerAuthorized,
      directoryRpcCallerPlatformRole: bridgeDiagnostics.directoryRpcCallerPlatformRole,
      directoryRpcCallerTeamMembershipCount: bridgeDiagnostics.directoryRpcCallerTeamMembershipCount,
      directoryRpcRawResultType: bridgeDiagnostics.directoryRpcRawResultType,
      directoryRpcTopLevelKeys: bridgeDiagnostics.directoryRpcTopLevelKeys,
      directoryRpcEntityCounts: bridgeDiagnostics.directoryRpcEntityCounts,
    };
  }

  getCloudAccessDirectoryDiagnostics(): CloudAccessDirectoryDiagnostics {
    const cacheMeta = this.cloudAccessCache?.getCacheMetadata() ?? { rowCount: 0, syncedAt: null };
    return this.mergeBridgeDiagnostics({
      ...this.cloudAccessDirectoryDiagnostics,
      authenticatedCloudSessionAvailable:
        this.cloudCoordinator?.isAuthenticatedCloudSessionAvailable() ?? false,
      cacheRowCount: cacheMeta.rowCount,
      cacheSyncedAt: cacheMeta.syncedAt,
    });
  }

  async getCloudAccessDirectory(options?: { forceRefresh?: boolean }) {
    const authSnapshot = this.cloudCoordinator?.getAuthSnapshot() ?? null;
    const hasCloudSession = authSnapshot?.authenticatedCloudSessionAvailable ?? false;
    const attemptedAt = new Date().toISOString();
    const cacheMeta = this.cloudAccessCache?.getCacheMetadata() ?? { rowCount: 0, syncedAt: null };
    const diagnostics = createEmptyCloudAccessDirectoryDiagnostics(
      cacheMeta.rowCount > 0 ? "none" : "cache_empty",
    );
    diagnostics.authenticatedCloudSessionAvailable = hasCloudSession;
    const cloudSessionDiagnostics = this.settings.get<{
      lastSessionRestoreAt?: string | null;
    } | null>("cloudSession.diagnostics", null);
    diagnostics.cloudSessionRestoreAt = cloudSessionDiagnostics?.lastSessionRestoreAt ?? null;
    diagnostics.cacheRowCount = cacheMeta.rowCount;
    diagnostics.cacheSyncedAt = cacheMeta.syncedAt;
    diagnostics.cloudDirectoryRequestAttemptedAt = attemptedAt;

    let cached: { directory: Record<string, unknown>; syncedAt: string } | null = null;
    try {
      cached = this.cloudAccessCache?.getCachedDirectory() ?? null;
    } catch (error) {
      const classified = classifyCloudAccessDirectoryFailure(error, hasCloudSession);
      diagnostics.cloudDirectoryRequestResult = "failure";
      diagnostics.cloudDirectoryRpcAttempted = false;
      diagnostics.cloudDirectoryRpcResult = "not_attempted";
      diagnostics.cloudDirectoryErrorCode = classified.code;
      diagnostics.actualFallbackReason = classified.code;
      this.cloudAccessDirectoryDiagnostics = diagnostics;
      throw classified;
    }

    if (!hasCloudSession) {
      if (this.cloudCoordinator?.requiresReauthentication()) {
        diagnostics.cloudDirectoryRequestResult = "failure";
        diagnostics.actualFallbackReason = "cloud_reauthentication_required";
        diagnostics.cloudDirectoryErrorCode = "invalid_refresh_token";
        diagnostics.firstCloudAccessFailureStage = "token_refresh_failed";
        this.cloudAccessDirectoryDiagnostics = this.mergeBridgeDiagnostics(diagnostics);
        return {
          ok: false,
          fallbackReason: "cloud_reauthentication_required",
          error:
            "Your cloud session has expired. Sign in again to resume publishing and access management.",
          httpStatus: 401,
        };
      }

      if (cached?.directory) {
        diagnostics.cloudDirectoryRequestResult = "not_attempted";
        diagnostics.actualFallbackReason = "no_session";
        diagnostics.cloudDirectoryEntityCounts = countCloudAccessDirectoryEntities(
          cached.directory as Record<string, unknown>,
        );
        this.cloudAccessDirectoryDiagnostics = this.mergeBridgeDiagnostics(diagnostics);
        return {
          ...(cached.directory as Record<string, unknown>),
          ok: true,
          syncedAt: cached.syncedAt,
          stale: true,
          offline: true,
          fallbackReason: "no_session" satisfies CloudAccessFallbackReason,
          warning: "Sign in to load and manage cloud access.",
        };
      }

      const classified = classifyCloudAccessDirectoryFailure(
        new Error("No authenticated cloud session."),
        false,
      );
      diagnostics.actualFallbackReason = classified.code;
      diagnostics.cloudDirectoryErrorCode = classified.code;
      diagnostics.cloudDirectoryRequestResult = "failure";
      this.cloudAccessDirectoryDiagnostics = this.mergeBridgeDiagnostics(diagnostics);
      return {
        ok: false,
        fallbackReason: classified.code,
        error: classified.message,
        httpStatus: 401,
      };
    }

    if (!this.cloudCoordinator?.isCloudConfigured()) {
      diagnostics.cloudDirectoryRequestResult = "failure";
      diagnostics.actualFallbackReason = "cloud_config_missing";
      diagnostics.cloudDirectoryErrorCode = "cloud_config_missing";
      diagnostics.firstCloudAccessFailureStage = "cloud_config_missing";
      this.cloudAccessDirectoryDiagnostics = this.mergeBridgeDiagnostics(diagnostics);
      return {
        ok: false,
        fallbackReason: "cloud_config_missing",
        error: "Cloud access is not configured.",
        httpStatus: 503,
      };
    }

    try {
      const bridge = this.requireCloudAccessBridge();
      const directory = await bridge.getDirectory({ forceRefresh: options?.forceRefresh });
      const syncedAt = new Date().toISOString();
      diagnostics.cloudDirectoryRequestResult = "success";
      diagnostics.cloudDirectoryRpcResult = "success";
      diagnostics.cloudDirectoryRpcAttempted = true;
      diagnostics.cloudDirectoryParsed = true;
      diagnostics.cloudDirectoryEntityCounts = countCloudAccessDirectoryEntities(directory);
      diagnostics.cloudDirectoryErrorCode = null;
      diagnostics.actualFallbackReason = "none";

      diagnostics.cacheWriteAttempted = Boolean(this.cloudAccessCache);
      if (this.cloudAccessCache) {
        try {
          this.cloudAccessCache.replaceDirectory(directory as Record<string, unknown>, syncedAt);
          diagnostics.cacheWriteSucceeded = true;
          diagnostics.cacheRowCount = 1;
          diagnostics.cacheSyncedAt = syncedAt;
        } catch (cacheError) {
          diagnostics.cacheWriteSucceeded = false;
          diagnostics.actualFallbackReason = "cache_write_failed";
          diagnostics.cloudDirectoryErrorCode = classifyCloudAccessDirectoryFailure(
            cacheError,
            hasCloudSession,
          ).code;
        }
      }

      this.cloudAccessDirectoryDiagnostics = this.mergeBridgeDiagnostics(diagnostics);

      return {
        ...directory,
        ok: true,
        syncedAt,
        stale: false,
        offline: false,
        fallbackReason:
          diagnostics.actualFallbackReason === "cache_write_failed"
            ? ("cache_write_failed" satisfies CloudAccessFallbackReason)
            : null,
        warning:
          diagnostics.actualFallbackReason === "cache_write_failed"
            ? "Access data loaded, but the offline cache could not be updated."
            : null,
      };
    } catch (error) {
      const classified = classifyCloudAccessDirectoryFailure(error, hasCloudSession);
      diagnostics.cloudDirectoryRequestResult = "failure";
      diagnostics.cloudDirectoryRpcResult = classified.code.startsWith("directory_")
        ? "failure"
        : "not_attempted";
      diagnostics.cloudDirectoryErrorCode = classified.code;
      diagnostics.actualFallbackReason = classified.code;
      const mergedDiagnostics = this.mergeBridgeDiagnostics(diagnostics);

      if (
        cached?.directory &&
        shouldServeStaleCloudAccessCache(classified.code)
      ) {
        mergedDiagnostics.cloudDirectoryEntityCounts = countCloudAccessDirectoryEntities(
          cached.directory as Record<string, unknown>,
        );
        mergedDiagnostics.actualFallbackReason = classified.code;
        mergedDiagnostics.cloudDirectoryRpcAttempted = mergedDiagnostics.directoryRpcAttempted;
        mergedDiagnostics.cloudDirectoryRpcResult =
          classified.code.startsWith("directory_") ? "failure" : mergedDiagnostics.cloudDirectoryRpcResult;
        this.cloudAccessDirectoryDiagnostics = mergedDiagnostics;
        return {
          ...(cached.directory as Record<string, unknown>),
          ok: true,
          syncedAt: cached.syncedAt,
          stale: true,
          offline: classified.code === "offline",
          fallbackReason: classified.code,
          error: classified.message,
          warning:
            classified.code === "offline"
              ? "Access management requires an internet connection. Cached access data is shown read-only."
              : null,
        };
      }

      this.cloudAccessDirectoryDiagnostics = mergedDiagnostics;
      return {
        ok: false,
        fallbackReason: classified.code,
        error: classified.message,
        httpStatus:
          classified.code === "no_session"
            ? 401
            : classified.code === "directory_permission_denied"
              ? 403
              : classified.code === "schema_missing"
                ? 500
                : 503,
      };
    }
  }

  isCloudAccessManagementAuthoritative(): boolean {
    return Boolean(this.cloudCoordinator?.hasCloudSession() && this.cloudAccessBridge);
  }

  isCloudAccessBridgeAvailable(): boolean {
    return Boolean(this.cloudAccessBridge);
  }

  markLotPhotoOrphanCandidate(projectId: string, displayUrl: string): void {
    this.cloudPhotoAssetService?.markPhotoRemoved(projectId, displayUrl);
  }

  async createCloudAccessTeam(input: { name: string; description?: string | null }) {
    const result = await this.requireCloudAccessBridge().createTeam(input);
    await this.getCloudAccessDirectory();
    return result;
  }

  async updateCloudAccessTeam(input: {
    teamId: string;
    name?: string;
    description?: string | null;
    isActive?: boolean;
  }) {
    const result = await this.requireCloudAccessBridge().updateTeam(input);
    await this.getCloudAccessDirectory();
    return result;
  }

  async archiveCloudAccessTeam(teamId: string) {
    const result = await this.requireCloudAccessBridge().archiveTeam(teamId);
    await this.getCloudAccessDirectory();
    return result;
  }

  async upsertCloudTeamMember(input: { teamId: string; userId: string; role: string }) {
    const result = await this.requireCloudAccessBridge().upsertTeamMember(input);
    await this.getCloudAccessDirectory();
    return result;
  }

  async removeCloudTeamMember(input: { teamId: string; userId: string }) {
    const result = await this.requireCloudAccessBridge().removeTeamMember(input);
    await this.getCloudAccessDirectory();
    return result;
  }

  async assignCloudProjectTeam(input: { projectId: string; teamId: string }) {
    const result = await this.requireCloudAccessBridge().assignProjectTeam(input);
    await this.getCloudAccessDirectory();
    return result;
  }

  async removeCloudProjectTeam(input: { projectId: string; teamId: string }) {
    const result = await this.requireCloudAccessBridge().removeProjectTeam(input);
    await this.getCloudAccessDirectory();
    return result;
  }

  async upsertCloudProjectMember(input: {
    projectId: string;
    userId: string;
    role: string;
  }) {
    const result = await this.requireCloudAccessBridge().upsertProjectMember(input);
    await this.getCloudAccessDirectory();
    return result;
  }

  async removeCloudProjectMember(input: { projectId: string; userId: string }) {
    const result = await this.requireCloudAccessBridge().removeProjectMember(input);
    await this.getCloudAccessDirectory();
    return result;
  }

  async createCloudAccessInvitation(input: {
    email: string;
    teamId?: string | null;
    teamRole?: string | null;
    platformRole?: string | null;
    projectAssignments?: Array<{ projectId: string; role: string }>;
  }) {
    if (!this.trustedAccessApi) {
      throw new Error(
        "Cloud access invitations are not configured for this installation.",
      );
    }
    const result = await this.trustedAccessApi.createInvitation(input);
    await this.getCloudAccessDirectory();
    return result;
  }

  async resendCloudAccessInvitation(invitationId: string) {
    if (!this.trustedAccessApi) {
      throw new Error(
        "Cloud access invitations are not configured for this installation.",
      );
    }
    const result = await this.trustedAccessApi.resendInvitation(invitationId);
    await this.getCloudAccessDirectory();
    return result;
  }

  async revokeCloudAccessInvitation(invitationId: string) {
    if (!this.trustedAccessApi) {
      throw new Error(
        "Cloud access invitations are not configured for this installation.",
      );
    }
    const result = await this.trustedAccessApi.revokeInvitation(invitationId);
    await this.getCloudAccessDirectory();
    return result;
  }

  setCloudPhotoAssetService(
    service: import("./cloud-photo-asset-service").CloudPhotoAssetService,
  ) {
    this.cloudPhotoAssetService = service;
  }

  async retryPendingPhotoUploads(projectId?: string) {
    if (!this.cloudPhotoAssetService) {
      return 0;
    }
    return this.cloudPhotoAssetService.retryPendingUploads({
      projectId,
      onUploaded: (uploadedProjectId) => {
        this.notifyProjectCanonicalMayHaveChanged(uploadedProjectId, "photo-uploaded");
      },
    });
  }

  getProjectAccessUsers(projectId: string) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.accessAuthorization) {
      throw new Error("You do not have permission to view project access.");
    }
    return {
      users: this.accessAuthorization.listUsersWithProjectAccess(userId, projectId),
    };
  }

  async getAccessDirectory() {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.accessManagement) {
      throw new Error("You do not have permission to manage users and access.");
    }
    await this.syncUserDirectory("users-page");
    return this.accessManagement.getDirectory(userId);
  }

  listViewableUserIds() {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.accessManagement) {
      throw new Error("You do not have permission to view users.");
    }
    return this.accessManagement.listViewableUserIds(userId);
  }

  async getUserDetails(targetUserId: string) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.accessManagement) {
      throw new Error("You do not have permission to view users.");
    }

    const base = this.accessManagement.getUserDetails(userId, targetUserId);
    const identity = this.supabaseIdentity?.getResolvedIdentity() ?? null;
    const supabaseUserId = base.user.supabaseUserId?.trim() || null;
    let source: "supabase" | "local-cache" = "local-cache";
    let remoteProfile: Awaited<
      ReturnType<NonNullable<typeof this.supabaseIdentity>["fetchRemoteProfile"]>
    > = null;

    if (
      this.supabaseIdentity?.isOnlineReady() &&
      supabaseUserId
    ) {
      remoteProfile = await this.supabaseIdentity.fetchRemoteProfile(supabaseUserId);
      if (remoteProfile) {
        source = "supabase";
        this.supabaseIdentity.syncProfileFieldsToLocalUser({
          localUserId: base.user.id,
          fullName: remoteProfile.full_name,
          phone: remoteProfile.phone_number,
          profileTeam: remoteProfile.team,
        });
      }
    }

    const fields = resolveUserDetailsFields({
      localFullName: base.user.fullName,
      localEmail: base.user.email,
      localPhone: base.user.phone,
      localProfileTeam: base.user.profileTeam,
      localPlatformRole: base.user.platformRole,
      supabaseFullName: remoteProfile?.full_name ?? null,
      supabaseEmail: remoteProfile?.email ?? identity?.email ?? null,
      supabasePhoneNumber: remoteProfile?.phone_number ?? null,
      supabaseTeam: remoteProfile?.team ?? null,
      supabaseRole: remoteProfile?.role ?? identity?.profile.role ?? null,
      source,
    });

    return {
      user: {
        ...base.user,
        fullName: fields.fullName,
        email: fields.email,
        phone: fields.phoneNumber,
        teamName: fields.teamName,
        roleLabel: fields.roleLabel,
        platformRole: fields.platformRole,
        source: fields.source,
      },
      teams: base.teams,
      projects: base.projects,
    };
  }

  createTeam(input: { name: string; description?: string | null }) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.accessManagement) {
      throw new Error("You do not have permission to create teams.");
    }
    return this.accessManagement.createTeam(userId, input);
  }

  assignProjectTeam(input: {
    projectId: string;
    teamId: string;
    removeAssignments?: boolean;
  }) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.accessManagement) {
      throw new Error("You do not have permission to move projects between teams.");
    }
    return this.accessManagement.assignProjectToTeam(userId, input);
  }

  setProjectTeams(input: { projectId: string; teamIds: string[] }) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.accessManagement) {
      throw new Error("You do not have permission to assign project teams.");
    }
    return this.accessManagement.setProjectTeams(userId, input);
  }

  updateTeam(
    teamId: string,
    input: { name?: string; description?: string | null; isActive?: boolean },
  ) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.accessManagement) {
      throw new Error("You do not have permission to manage teams.");
    }
    return this.accessManagement.updateTeam(userId, teamId, input);
  }

  inviteAccessUser(input: {
    email: string;
    fullName: string;
    teamId: string;
    role: import("./access-types").TeamRole;
    projectIds?: string[];
  }) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.accessManagement) {
      throw new Error("You do not have permission to invite users.");
    }
    return this.accessManagement.inviteUser(userId, input);
  }

  upsertAccessTeamMember(input: {
    teamId: string;
    userId: string;
    role: import("./access-types").TeamRole;
    projectIds?: string[];
  }) {
    const actorUserId = this.auth.getAuthenticatedUser()?.userId;
    if (!actorUserId || !this.accessManagement) {
      throw new Error("You do not have permission to manage team members.");
    }
    return this.accessManagement.upsertTeamMember(actorUserId, input);
  }

  setAccessUserActive(targetUserId: string, isActive: boolean) {
    const actorUserId = this.auth.getAuthenticatedUser()?.userId;
    if (!actorUserId || !this.accessManagement) {
      throw new Error("You do not have permission to manage users.");
    }
    return this.accessManagement.setUserActive(actorUserId, targetUserId, isActive);
  }

  assignAccessProject(input: {
    projectId: string;
    teamId: string;
    userId: string;
    accessRole: import("./access-types").ProjectAccessRole;
  }) {
    const actorUserId = this.auth.getAuthenticatedUser()?.userId;
    if (!actorUserId || !this.accessManagement) {
      throw new Error("You do not have permission to assign projects.");
    }
    return this.accessManagement.setProjectAssignment(actorUserId, input);
  }

  removeAccessProjectAssignment(projectId: string, teamId: string, userId: string) {
    const actorUserId = this.auth.getAuthenticatedUser()?.userId;
    if (!actorUserId || !this.accessManagement) {
      throw new Error("You do not have permission to remove project assignments.");
    }
    return this.accessManagement.removeProjectAssignment(
      actorUserId,
      projectId,
      teamId,
      userId,
    );
  }

  removeProjectAccessPath(input: {
    projectId: string;
    userId: string;
    pathType: "project_operator" | "project_viewer" | "team_admin";
    teamId: string;
  }) {
    const actorUserId = this.auth.getAuthenticatedUser()?.userId;
    if (!actorUserId || !this.accessManagement) {
      throw new Error("You do not have permission to remove project access.");
    }
    return this.accessManagement.removeProjectAccessPath(actorUserId, input);
  }

  recordDisplayViewerHeartbeat(input: {
    projectId: string;
    displayId: string;
    sessionId?: string;
  }) {
    return this.displayViewerSessions.touch(input);
  }

  getAccessibleProjectIds(): Set<string> {
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    if (this.accessAuthorization && userId) {
      const projects = this.accessAuthorization.getAccessibleProjects(userId);
      return new Set(projects.map((project) => project.id));
    }

    const role = this.resolveCurrentProjectRole();
    const canSeeInactive = canManageProjectSettings(role);
    let records = this.projects.list();
    if (!canSeeInactive) {
      records = records.filter((project) => normalizeProjectIsActive(project));
    }
    return new Set(records.map((project) => project.id));
  }

  getActiveDisplayCount(accessibleProjectIds?: Set<string>) {
    const projectIds = [
      ...(accessibleProjectIds ?? this.getAccessibleProjectIds()),
    ];
    return this.displays.countActiveForProjects(projectIds);
  }

  getRunningEngineCount(accessibleProjectIds?: Set<string>) {
    const accessible = accessibleProjectIds ?? this.getAccessibleProjectIds();
    const summaries = this.engineManager?.getRunningEngineSummaries() ?? [];
    const runningEngineIds = new Set<string>();

    for (const summary of summaries) {
      if (!accessible.has(summary.projectId)) {
        continue;
      }

      const engine = this.dataSources.getById(summary.engineId);
      if (!engine || !engine.enabled) {
        continue;
      }

      if (!["starting", "running", "ready"].includes(summary.status)) {
        continue;
      }

      runningEngineIds.add(summary.engineId);
    }

    return runningEngineIds.size;
  }

  getOnlineDisplaySessionCount() {
    return this.displayViewerSessions.countActiveSessions(DISPLAY_VIEWER_STALE_MS);
  }

  getActiveAuctionDatasetDisplay(projectId: string): AuctionDatasetDisplayInfo {
    if (!this.auctionDatasetService) {
      return {
        reference: { source: "live-snapshot", loadedAt: new Date().toISOString() },
        label: "Live scraper snapshot",
        tooltip: "Live scraper snapshot",
      };
    }
    return this.auctionDatasetService.getDisplayInfo(projectId);
  }

  getActiveDownloadedDataset(projectId: string): Record<string, unknown> | null {
    if (!this.auctionDatasetService || !this.auctionDatasetService.isFileDatasetActive(projectId)) {
      return null;
    }
    return this.auctionDatasetService.readActiveDataset(projectId);
  }

  dismissWebpageExportOperation(
    projectId: string,
    operationId: string,
  ): { ok: true } | { ok: false; error: string } {
    if (!this.offlineAuctionService) {
      return { ok: false, error: "Export service is unavailable." };
    }
    return this.offlineAuctionService.dismissCurrentWebpageExportOperation(
      projectId,
      operationId,
    );
  }

  listAuctionDownloads(projectId: string) {
    return this.auctionDatasetService?.listCompletedDownloads(projectId) ?? [];
  }

  refreshAuctionDataset(projectId: string): AuctionDatasetDisplayInfo {
    if (!this.auctionDatasetService) {
      return this.getActiveAuctionDatasetDisplay(projectId);
    }
    const reference = this.auctionDatasetService.resolveActiveReference(projectId);
    if (reference?.filePath) {
      const totalSizeBytes = getDownloadSizeForJsonPath(reference.filePath);
      this.auctionDatasetService.setReference(projectId, {
        ...reference,
        totalSizeBytes,
        totalSizeFormatted: formatDownloadSize(totalSizeBytes),
      });
    }
    return this.auctionDatasetService.getDisplayInfo(projectId);
  }

  clearAllAuctionDownloads(projectId: string) {
    if (!this.auctionDatasetService) {
      return { ok: false as const, error: "Auction dataset service is unavailable." };
    }
    const result = this.auctionDatasetService.clearAllDownloads(projectId);
    if (result.ok) {
      const actor = this.resolveCurrentActivityActor();
      const reset = this.bagLiveState.clearDownloadedDatasetState(projectId, actor);
      if (!reset.ok) {
        return { ok: false as const, error: reset.error };
      }
      this.recordActivity({
        type: "controller.downloads.cleared",
        message: "Cleared all local auction downloads",
        userAction: "cleared all local auction downloads",
        metadata: {
          projectId,
          foldersRemoved: result.foldersRemoved,
          filesRemoved: result.filesRemoved,
          bytesRemoved: result.bytesRemoved,
        },
      });
      return { ...result, envelope: reset.envelope };
    }
    return result;
  }

  resolveAuctionDownloadFolder(projectId: string): string | null {
    return this.auctionDatasetService?.getActiveDownloadFolder(projectId) ?? null;
  }

  getProjectAuctionDataDirectory(projectId: string): string | null {
    if (!this.auctionDatasetService) return null;
    const slug = this.auctionDatasetService.resolveProjectSlug(projectId);
    return path.join(this.paths.root, "auction-data", slug);
  }

  getProjectById(projectId: string) {
    return this.projects.getById(projectId);
  }

  resolveProjectRecord(segment: string) {
    const trimmed = segment.trim();
    if (!trimmed) {
      return null;
    }
    return this.projects.getById(trimmed) ?? this.projects.getBySlug(trimmed);
  }

  private getCanonicalRevisionTracker(projectId: string): CanonicalRevisionTracker {
    const existing = this.canonicalRevisionTrackers.get(projectId);
    if (existing) {
      return existing;
    }
    const tracker = new CanonicalRevisionTracker();
    const lastPublishedRevision = this.settings.get<number | null>(
      publishingProjectLastPublishedRevisionKey(projectId),
      null,
    );
    const lastPublishedHash = this.settings.get<string | null>(
      publishingProjectLastPublishedHashKey(projectId),
      null,
    );
    if (lastPublishedRevision != null) {
      tracker.seedFromPublishedState(lastPublishedRevision, lastPublishedHash);
    }
    this.canonicalRevisionTrackers.set(projectId, tracker);
    return tracker;
  }

  /** Realigns in-memory revision counter with cloud after stale_revision. */
  realignCanonicalRevisionTracker(
    projectId: string,
    revision: number,
    payloadHash: string | null,
  ): void {
    const tracker = this.getCanonicalRevisionTracker(projectId);
    tracker.seedFromPublishedState(revision, payloadHash);
  }

  private isProjectCanonicalSourceConnected(projectId: string): boolean {
    const source = this.getDisplayDataSource();
    if (source === "local-controller") {
      return true;
    }

    const engines = this.ensureProjectEngines(projectId);
    const scraper = engines.find((engine) => engine.engine_type === "webpage-scraper");
    if (!scraper) {
      return false;
    }

    return this.isEngineWorkerLive(scraper.id);
  }

  getLocalCanonicalProjectResponse(projectId: string): LocalCanonicalApiResponse {
    const project = this.resolveProjectRecord(projectId);
    if (!project) {
      return {
        ok: false,
        availability: "unavailable",
        payload: null,
        runtime: {
          localActive: true,
          dataConnected: false,
          contractVersion: NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION,
        },
        error: "Project not found.",
      };
    }

    const snapshot = this.getActiveCanonicalProjectSnapshot(project.id);
    const sourceConnected = this.isProjectCanonicalSourceConnected(project.id);
    const runtime = {
      localActive: true,
      dataConnected: sourceConnected,
      contractVersion: NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION,
    };

    if (!snapshot) {
      return {
        ok: true,
        availability: "no_data",
        payload: null,
        runtime,
      };
    }

    const serialized = serializeCanonicalProjectSnapshot(snapshot);
    if (!serialized) {
      return {
        ok: true,
        availability: "no_data",
        payload: null,
        runtime,
      };
    }

    const sanitized = sanitizeCanonicalProjectData(serialized);
    const revisionState = this.getCanonicalRevisionTracker(project.id).observeCanonicalData(
      sanitized,
    );
    const now = new Date().toISOString();
    const instanceId = getOrCreateNeudInstanceId(this.settings);

    return {
      ok: true,
      availability: "ready",
      payload: buildPublishedProjectPayload({
        projectId: project.id,
        projectSlug: project.slug,
        revision: revisionState.revision,
        generatedAt: sanitized.updatedAt ?? now,
        publisherInstanceId: instanceId,
        publisherLastSeenAt: now,
        sourceMode: sanitized.dataSource,
        sourceConnected,
        data: sanitized,
      }),
      runtime,
    };
  }

  getLotThumbnailPhotos(projectId: string, lotNumber: string) {
    if (!this.auctionDatasetService || !this.offlineAuctionService) {
      return [];
    }
    const reference = this.auctionDatasetService.resolveActiveReference(projectId);
    if (reference?.source === "live-snapshot" || !reference?.filePath) {
      return [];
    }
    const dataset = this.auctionDatasetService.readActiveDataset(projectId);
    const packageId = path.basename(path.dirname(reference.filePath));
    const photos = this.offlineAuctionService.getLotThumbnailsFromDataset(
      dataset,
      lotNumber,
      packageId,
    );
    const overrides = this.bagLiveState.getLotPhotoOverrides(projectId);
    return applyLotPhotoOverrides(photos, overrides, lotNumber);
  }

  async importLotPhotos(projectId: string, lotNumber: string, sourcePaths: string[]) {
    if (!this.auctionDatasetService) {
      return {
        ok: false as const,
        error: "Auction dataset service is unavailable.",
        imported: [],
        rejected: sourcePaths,
      };
    }

    let jsonPath = this.auctionDatasetService.resolveActiveReference(projectId)?.filePath;
    let packageDir = jsonPath ? path.dirname(jsonPath) : null;
    if (!jsonPath || !packageDir || !fs.existsSync(jsonPath)) {
      const created = this.auctionDatasetService.createManualWorkingDownload(projectId);
      packageDir = finalizeDownloadPackage(created.packageDir);
      jsonPath = path.join(packageDir, path.basename(created.jsonPath));
      this.auctionDatasetService.setDownloaded(projectId, jsonPath);
    }

    const packageId = path.basename(packageDir!);
    const imported = await importManualLotPhotosToDownload({
      packageDir: packageDir!,
      jsonPath: jsonPath!,
      lotNumber,
      sourcePaths,
      buildDisplayUrl: (relativePath) =>
        this.offlineAuctionService!.buildAssetUrl(packageId, relativePath),
    });
    if (imported.imported.length > 0 && this.cloudPhotoAssetService) {
      const lotKey = lotNumber.replace(/^lot\s+/i, "").trim();
      for (const photo of imported.photos) {
        const displayUrl = photo.displayUrl;
        const relativePath = photo.relativePath;
        if (!displayUrl || !relativePath) {
          continue;
        }
        const localPath = path.join(packageDir!, relativePath);
        this.cloudPhotoAssetService.registerLocalPhoto({
          projectId,
          lotKey,
          displayUrl,
          localPath,
          originalFilename: photo.fileName ?? path.basename(localPath),
        });
      }
      void this.retryPendingPhotoUploads(projectId).then((count) => {
        if (count > 0) {
          this.notifyProjectCanonicalMayHaveChanged(projectId, "photo-uploaded");
        }
      });
    }
    if (imported.imported.length === 0) {
      return {
        ok: false as const,
        error:
          imported.rejected.length > 0
            ? "Unsupported or duplicate photo files were rejected."
            : "No photos were imported.",
        imported: [],
        rejected: imported.rejected,
      };
    }

    this.recordActivity({
      type: "controller.lot.photos-added",
      message: `Added ${imported.imported.length} lot photo(s)`,
      userAction: `added ${imported.imported.length} lot photo(s)`,
      metadata: { projectId, lotNumber },
    });

    if (jsonPath) {
      const totalSizeBytes = getDownloadSizeForJsonPath(jsonPath);
      this.auctionDatasetService.setReference(projectId, {
        ...this.auctionDatasetService.resolveActiveReference(projectId)!,
        totalSizeBytes,
        totalSizeFormatted: formatDownloadSize(totalSizeBytes),
      });
    }

    this.notifyLocalControllerStateChanged(projectId, "controller.lot.photos-added");

    return {
      ok: true as const,
      imported: imported.imported,
      rejected: imported.rejected,
    };
  }

  getLotDatasetDetails(projectId: string, lotNumber: string) {
    if (!this.auctionDatasetService || !this.offlineAuctionService) {
      return null;
    }
    const reference = this.auctionDatasetService.resolveActiveReference(projectId);
    if (reference?.source === "live-snapshot" || !reference?.filePath) {
      return null;
    }
    const dataset = this.auctionDatasetService.readActiveDataset(projectId);
    return this.offlineAuctionService.getLotDetailsFromDataset(dataset, lotNumber);
  }

  hasDirtyLocalControllerDraft(projectId: string): boolean {
    const envelope = this.bagLiveState.getLiveStateEnvelope(projectId);
    const draft = envelope?.localControllerDraft;
    if (!draft) return false;
    return Boolean(draft.lotDirty || draft.bidDirty);
  }

  restoreAuctionDatasets() {
    if (!this.auctionDatasetService || !this.offlineAuctionService) return;

    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      const display = this.auctionDatasetService.resolveActiveReference(project.id);
      if (!display?.filePath) continue;
      if (!this.auctionDatasetService.isFileDatasetActive(project.id)) continue;

      const loaded = this.offlineAuctionService.loadJsonExport(project.id, display.filePath);
      if (!loaded.ok || !loaded.auctionData) continue;

      this.bagLiveState.loadOfflineAuction(project.id, loaded.auctionData, {
        id: null,
        email: null,
      });
    }
  }

  resolveOfflineAsset(packageId: string, relativePath: string) {
    if (packageId.startsWith("manual-")) {
      const projectId = packageId.slice("manual-".length);
      const manualPath = resolveManualPhotoAssetPath(this.paths, projectId, relativePath);
      return manualPath;
    }
    return this.offlineAuctionService?.resolveAssetPath(packageId, relativePath) ?? null;
  }

  hasValidScraperSnapshotForExport(projectId: string) {
    return this.offlineAuctionService?.hasValidScraperSnapshot(projectId) ?? false;
  }

  getViewerBaseUrl() {
    return this.viewerBaseUrl;
  }

  private resolveCurrentProjectRole(projectId?: string): ProjectRole {
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    if (userId && this.accessAuthorization) {
      if (projectId) {
        const capabilities = this.accessAuthorization.getProjectCapabilities(
          userId,
          projectId,
        );
        if (!capabilities.canViewProject) {
          return "viewer";
        }
        const context = this.accessAuthorization.getAuthorizationContext(userId);
        if (context?.isPlatformOwner) {
          return "owner";
        }
        if (capabilities.canEditProjectSettings) {
          return "admin";
        }
        if (capabilities.canOperateEngines) {
          return "operator";
        }
        return "viewer";
      }

      const context = this.accessAuthorization.getAuthorizationContext(userId);
      if (context?.isPlatformOwner) {
        return "owner";
      }
      if (
        context?.teamMemberships.some(
          (membership) =>
            membership.role === "admin" && membership.isActive && membership.teamIsActive,
        )
      ) {
        return "admin";
      }
      if (
        context?.teamMemberships.some(
          (membership) =>
            membership.role === "operator" && membership.isActive && membership.teamIsActive,
        )
      ) {
        return "operator";
      }
      return "viewer";
    }

    const user = this.auth.getAuthenticatedUser();
    if (projectId && user?.userId) {
      const membershipRole = this.memberships.getProjectRole(
        user.userId,
        projectId,
      );
      if (membershipRole) {
        return membershipRole;
      }
    }

    return resolveAuthenticatedProjectRole({
      role: user?.role ?? this.auth.getStatus().role,
    });
  }

  private isElevatedAccessUser(): boolean {
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    const context = userId
      ? this.accessAuthorization?.getAuthorizationContext(userId)
      : null;
    if (context) {
      return (
        context.isPlatformOwner ||
        context.teamMemberships.some(
          (membership) =>
            membership.role === "admin" && membership.isActive && membership.teamIsActive,
        )
      );
    }
    return canManageProjectSettings(this.resolveCurrentProjectRole());
  }

  private isPureViewerUser(): boolean {
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    const context = userId
      ? this.accessAuthorization?.getAuthorizationContext(userId)
      : null;
    if (!context) {
      return false;
    }
    if (context.isPlatformOwner) {
      return false;
    }
    const hasAdmin = context.teamMemberships.some(
      (membership) =>
        membership.role === "admin" && membership.isActive && membership.teamIsActive,
    );
    const hasOperator = context.teamMemberships.some(
      (membership) =>
        membership.role === "operator" && membership.isActive && membership.teamIsActive,
    );
    return !hasAdmin && !hasOperator;
  }

  logStartupAuthDiagnostics() {
    if (this.startupDiagnosticsLogged) {
      return;
    }
    this.startupDiagnosticsLogged = true;

    const user = this.auth.getAuthenticatedUser();
    const resolved = this.accessAuthorization?.resolveAuthenticatedProfile() ?? null;
    const membershipCount = resolved?.localUserId
      ? this.memberships.countForUser(resolved.localUserId)
      : 0;

    console.info(
      `[local-auth] identity=${user?.userId ? "resolved" : "missing"} userId=${abbreviateUserId(user?.userId ?? "none")} localUserId=${abbreviateUserId(resolved?.localUserId ?? "none")} profileSource=${resolved?.source ?? "none"} profileStatus=${resolved?.status ?? "none"} projectMemberships=${membershipCount} database=${this.paths.databaseFile}`,
    );
  }

  private shouldFilterInactiveProjects(): boolean {
    return !this.isElevatedAccessUser();
  }

  getProjectRecordBySlug(slug: string) {
    return this.projects.getBySlug(slug);
  }

  listProjects(query?: string) {
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    if (this.accessAuthorization && userId) {
      const accessible = new Set(
        this.accessAuthorization.getAccessibleProjects(userId).map((project) => project.id),
      );
      let records = this.projects.search(query).filter((project) => accessible.has(project.id));
      const context = this.accessAuthorization.getAuthorizationContext(userId);
      if (!context?.isPlatformOwner) {
        records = records.filter((project) => normalizeProjectIsActive(project));
      }
      return records.map((project) => {
        const portalProject = toPortalProject(project);
        const teams = context
          ? this.accessAuthorization!.getVisibleProjectTeams(context, project.id)
          : [];
        return {
          ...portalProject,
          teams,
        };
      });
    }

    const role = this.resolveCurrentProjectRole();
    let records = this.projects.search(query);
    if (!canManageProjectSettings(role)) {
      records = records.filter((project) => normalizeProjectIsActive(project));
    }
    return records.map((project) => ({
      ...toPortalProject(project),
      teams: [] as Array<{ id: string; name: string }>,
    }));
  }

  getDashboardData(limit = 5) {
    const accessibleProjectIds = this.getAccessibleProjectIds();
    const canSeeInactive = this.isElevatedAccessUser();
    let records = this.projects.list().filter((project) =>
      accessibleProjectIds.has(project.id),
    );
    if (!canSeeInactive) {
      records = records.filter((project) => normalizeProjectIsActive(project));
    }

    records.sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );

    const recentProjects = records.slice(0, limit).map((project) => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      isActive: normalizeProjectIsActive(project),
      updatedAt: project.updatedAt,
    }));

    const accessibleProjects = new Map(records.map((project) => [project.id, project]));
    const isPureViewer = this.isPureViewerUser();

    const normalizedActivity = isPureViewer
      ? []
      : this.getActivitySnapshot()
          .map((entry) => {
            const metadata = entry.metadata ?? {};
            const projectId =
              typeof metadata.projectId === "string" ? metadata.projectId : null;
            if (projectId && !accessibleProjectIds.has(projectId)) {
              return null;
            }

            const project = projectId ? accessibleProjects.get(projectId) : null;
            if (!project) {
              return null;
            }

            return normalizeActivityEventForDisplay(
              entry,
              { id: project.id, slug: project.slug, name: project.name },
              null,
            );
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const recentActivity = selectCompactActivityEvents(normalizedActivity).map(
      (entry) => ({
        id: entry.id,
        projectId: entry.projectId,
        projectSlug: entry.projectSlug ?? "",
        projectName: entry.projectName ?? "Unknown Project",
        type: entry.type ?? "",
        message: entry.message,
        actorName: entry.actorName,
        actorId: entry.actorId,
        createdAt: entry.createdAt,
      }),
    );

    return {
      recentProjects,
      recentActivity,
      onlineDisplays: this.getActiveDisplayCount(accessibleProjectIds),
      runningEngines: this.getRunningEngineCount(accessibleProjectIds),
      isPureViewer,
      accessibleDisplayCount: isPureViewer
        ? this.getActiveDisplayCount(accessibleProjectIds)
        : undefined,
    };
  }

  getProjectsListMeta(): LocalProjectsListMeta {
    const user = this.auth.getAuthenticatedUser();
    const status = this.auth.getStatus();
    const identity = this.supabaseIdentity?.getResolvedIdentity() ?? null;
    const filteringApplied = this.shouldFilterInactiveProjects();
    const projectCount = filteringApplied
      ? this.listProjects().length
      : this.projects.list().length;

    const mapStatus = (
      value: string | null | undefined,
    ): LocalProjectsListMeta["identityStatus"] => {
      if (
        value === "loading" &&
        identity?.supabaseProfileResolved &&
        identity.profile.fullName
      ) {
        return "ready";
      }

      switch (value) {
        case "idle":
        case "loading":
          return identity?.status === "loading" || !identity
            ? "loading-profile"
            : "error";
        case "online-ready":
          return "ready";
        case "offline-ready":
          return "offline-ready";
        case "missing-profile":
        case "stale-session":
        case "identity-conflict":
        case "error":
          return value;
        default:
          return user ? "loading-profile" : "loading-session";
      }
    };

    const mapSource = (
      value: string | null | undefined,
    ): LocalProjectsListMeta["resolvedProfileSource"] => {
      if (value === "supabase") return "supabase";
      if (value === "local-cache") return "local-user";
      return "none";
    };

    return {
      databasePath: this.paths.databaseFile,
      projectCount,
      mode: "local",
      authenticatedUserId: identity?.authUserId ?? user?.userId ?? null,
      authenticatedLocalUserId: identity?.localUserId ?? user?.userId ?? null,
      authenticatedUserEmail: identity?.email ?? user?.email ?? null,
      authenticatedUserDisplayName: identity?.profile.fullName ?? null,
      authenticatedUserTeam: identity?.profile.teamName ?? null,
      authenticatedUserRole: identity?.profile.role ?? status.role,
      identityStatus: mapStatus(identity?.status),
      resolvedProfileSource: mapSource(identity?.source),
      primaryMembershipTeamName: identity?.profile.teamName ?? null,
      identityMessage:
        identity?.status === "online-ready" || identity?.status === "offline-ready"
          ? null
          : identity?.errorMessage ?? null,
      identityRetryCount: identity?.retryCount ?? 0,
      localCacheSyncStatus: identity?.cacheSync.status,
      localCacheSyncErrorCode: identity?.localCacheSyncErrorCode ?? identity?.cacheSync.errorCode ?? null,
      conflictingLocalUserId: identity?.conflictingLocalUserId ?? null,
      isPlatformAdmin: this.isPlatformAdmin(),
      canCreateProject: this.canCreateProject(),
      canManageUsersAndAccess:
        this.accessAuthorization?.getAuthorizationContext()?.canManageUsersAndAccess ??
        false,
      authorizationContext: this.getAuthorizationContext(),
      canDeleteProject: this.auth.canDeleteProject(),
      defaultProjectSlug: this.broadArrowPhase.getDefaultProjectSlug(),
      filteringApplied,
    };
  }

  getDatabasePath(): string {
    return this.paths.databaseFile;
  }

  getProjectBySlug(slug: string) {
    const project = this.projects.getBySlug(slug);
    if (!project) {
      return null;
    }
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    if (userId && this.accessAuthorization) {
      const capabilities = this.accessAuthorization.getProjectCapabilities(
        userId,
        project.id,
      );
      if (!capabilities.canViewProject) {
        return null;
      }
      return toPortalProject(project);
    }

    const role = this.resolveCurrentProjectRole(project.id);
    if (!canAccessProject(role, project)) {
      return null;
    }
    return toPortalProject(project);
  }

  updateProjectSettings(
    slug: string,
    input: { name: string; isActive: boolean; description?: string | null },
  ) {
    if (!this.auth.isAccessAllowed()) {
      throw new Error(SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE);
    }

    const existing = this.projects.getBySlug(slug);
    if (!existing) {
      throw new Error("Project not found.");
    }

    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    const role = this.resolveCurrentProjectRole(existing.id);
    if (this.accessAuthorization && userId) {
      const capabilities = this.accessAuthorization.getProjectCapabilities(
        userId,
        existing.id,
      );
      if (!capabilities.canEditProjectSettings) {
        throw new Error("You do not have permission to edit project settings.");
      }
    } else if (!canManageProjectSettings(role)) {
      throw new Error("Only platform owners and admins may update project settings.");
    }

    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new Error("Project name is required.");
    }
    if (trimmedName.length > 80) {
      throw new Error("Project name must be 80 characters or fewer.");
    }

    if (input.description !== undefined && input.description !== null) {
      const trimmedDescription = input.description.trim();
      if (trimmedDescription.length > 500) {
        throw new Error("Project description must be 500 characters or fewer.");
      }
    }

    const previousName = existing.name;
    const previousActive = normalizeProjectIsActive(existing);
    const previousDescription = existing.description?.trim() ?? "";
    const nextDescription =
      input.description === undefined
        ? previousDescription
        : (input.description?.trim() ?? "");

    const updated = this.projects.updateSettings(existing.id, {
      name: trimmedName,
      isActive: input.isActive,
      description:
        input.description === undefined ? undefined : input.description?.trim() || null,
    });
    if (!updated) {
      throw new Error("Project not found.");
    }

    const nameChanged = previousName !== trimmedName;
    const statusChanged = previousActive !== input.isActive;
    const descriptionChanged = previousDescription !== nextDescription;
    const actor = this.resolveCurrentActivityActor();

    if (statusChanged && !nameChanged && !descriptionChanged) {
      this.recordActivity({
        type: input.isActive ? "project.marked-active" : "project.marked-inactive",
        message: input.isActive ? "Project marked active" : "Project marked inactive",
        actor,
        metadata: {
          projectId: updated.id,
          projectSlug: updated.slug,
          projectName: updated.name,
        },
      });
    } else if (nameChanged || statusChanged || descriptionChanged) {
      this.recordActivity({
        type: "project.settings-updated",
        message: "Project settings updated",
        actor,
        metadata: {
          projectId: updated.id,
          projectSlug: updated.slug,
          projectName: updated.name,
        },
      });
    }

    const engineId = this.getPrimaryBagEngineIdForProject(updated.id);
    if (engineId) {
      const changes: string[] = [];
      if (nameChanged) {
        changes.push(`renamed to "${trimmedName}"`);
      }
      if (statusChanged) {
        changes.push(input.isActive ? "marked active" : "marked inactive");
      }
      if (descriptionChanged) {
        changes.push("description updated");
      }
      if (changes.length > 0) {
        this.recordLog(engineId, {
          level: "info",
          eventType: "project.settings",
          message: `Project settings updated: ${changes.join("; ")}`,
        });
      }
    }

    return toPortalProject(updated);
  }

  private getPrimaryBagEngineIdForProject(projectId: string): string | null {
    const project = this.projects.getById(projectId);
    if (!project || project.projectType !== "bag-graphics") {
      return null;
    }
    const engine = this.bagLiveState.getBagEngineForProject(projectId);
    return engine?.id ?? null;
  }

  slugExists(slug: string) {
    return this.projects.slugExists(slug);
  }

  createProject(input: {
    name: string;
    slug: string;
    projectType: string;
    description?: string | null;
    theme?: string;
    icon?: string;
  }) {
    if (!this.auth.isAccessAllowed()) {
      throw new Error(SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE);
    }
    if (!this.canCreateProject()) {
      throw new Error("Only platform owners and admins may create projects.");
    }

    const project = this.projects.create(input);
    if (input.projectType === "webpage-scraper" || input.projectType === "bag-graphics") {
      const engine = this.dataSources.ensureWebpageScraper(
        project.id,
        input.projectType,
      );
      if (input.projectType === "bag-graphics") {
        this.bagSources.ensureBagScraperSources(engine.id);
        if (shouldAutoSeedBagDisplays(project)) {
          this.pylonDisplays.ensurePylonDisplay(project.id, this.viewerBaseUrl);
          this.lowerTickerDisplays.ensureLowerTickerDisplay(project.id, this.viewerBaseUrl);
          this.newAuctionDisplays.ensureNewBidDisplay(project.id, this.viewerBaseUrl);
          this.newAuctionDisplays.ensureNewTickerDisplay(project.id, this.viewerBaseUrl);
        }
      } else if (input.projectType === "webpage-scraper") {
        this.genericScraper.ensureGenericScraperSources(engine.id);
      }
      this.normalizeEngineExecutionMode(engine.id);
    }
    return toPortalProject(project);
  }

  ensureProjectEngines(projectId: string) {
    const project = this.projects.getById(projectId);
    if (!project) return [];
    if (
      project.projectType === "webpage-scraper" ||
      project.projectType === "bag-graphics"
    ) {
      const engine = this.dataSources.ensureWebpageScraper(
        projectId,
        project.projectType,
      );
      if (project.projectType === "bag-graphics") {
        this.bagSources.ensureBagScraperSources(engine.id);
        if (shouldAutoSeedBagDisplays(project)) {
          this.pylonDisplays.ensurePylonDisplay(projectId, this.viewerBaseUrl);
          this.lowerTickerDisplays.ensureLowerTickerDisplay(projectId, this.viewerBaseUrl);
          this.newAuctionDisplays.ensureNewBidDisplay(projectId, this.viewerBaseUrl);
          this.newAuctionDisplays.ensureNewTickerDisplay(projectId, this.viewerBaseUrl);
        }
      } else if (project.projectType === "webpage-scraper") {
        this.genericScraper.ensureGenericScraperSources(engine.id);
      }
      this.normalizeEngineExecutionMode(engine.id);
    }
    return this.getProjectEngines(projectId);
  }

  listProjectDisplays(projectId: string) {
    const project = this.projects.getById(projectId);
    if (!project) return [];

    const isArchivedDisplay = (displayId: string) =>
      this.displayCodeRepo?.getByDisplayId(displayId)?.archived ?? false;

    if (isBroadArrowCanonicalProject(project)) {
      const projectDisplays = this.displays
        .listByProject(projectId)
        .filter((display) => !isArchivedDisplay(display.id));
      const combined = projectDisplays.map((display) => this.toCustomPortalDisplay(display));
      const hasProjectOrder = projectDisplays.some((display) => display.sortOrder != null);
      if (hasProjectOrder) {
        return combined;
      }

      const userId = this.auth.getAuthenticatedUser()?.userId;
      if (!userId || !this.userDisplayOrder) {
        return combined;
      }

      const savedOrder = this.userDisplayOrder.listForUserProject(userId, projectId);
      return mergeDisplayOrder(
        combined,
        savedOrder.map((entry) => ({
          displayId: entry.displayId,
          sortIndex: entry.sortIndex,
        })),
      );
    }

    const pylonRows = this.pylonDisplays
      .listProjectDisplays(projectId, this.viewerBaseUrl)
      .map((display) => toPortalDisplay(display, this.viewerBaseUrl))
      .filter((display) => !isArchivedDisplay(display.id));
    const lowerTickerRows = this.lowerTickerDisplays
      .listProjectDisplays(projectId, this.viewerBaseUrl)
      .map((display) => toPortalDisplay(display, this.viewerBaseUrl))
      .filter((display) => !isArchivedDisplay(display.id));

    this.newAuctionDisplays.ensureNewBidDisplay(projectId, this.viewerBaseUrl);
    this.newAuctionDisplays.ensureNewTickerDisplay(projectId, this.viewerBaseUrl);
    const newDisplayRows = this.displays
      .listByProject(projectId)
      .filter(
        (display) =>
          display.displayKey === "new-bid-display-v1" ||
          display.displayKey === "new-ticker-v1",
      )
      .map((display) => toPortalDisplay(display, this.viewerBaseUrl))
      .filter((display) => !isArchivedDisplay(display.id));

    const knownIds = new Set(
      [...pylonRows, ...lowerTickerRows, ...newDisplayRows].map((display) => display.id),
    );
    const knownKeys = new Set(
      [...pylonRows, ...lowerTickerRows, ...newDisplayRows].map(
        (display) => display.display_key,
      ),
    );

    const customRows = this.displays
      .listByProject(projectId)
      .filter((display) => !REGISTRY_DISPLAY_KEYS.has(display.displayKey))
      .filter((display) => !isArchivedDisplay(display.id))
      .filter((display) => !knownIds.has(display.id) && !knownKeys.has(display.displayKey))
      .map((display) => this.toCustomPortalDisplay(display));

    const combined = [...pylonRows, ...lowerTickerRows, ...newDisplayRows, ...customRows];
    const hasProjectOrder = this.displays
      .listByProject(projectId)
      .some((display) => display.sortOrder != null);
    if (hasProjectOrder) {
      const orderById = new Map(
        this.displays.listByProject(projectId).map((display, index) => [display.id, index]),
      );
      return [...combined].sort((left, right) => {
        const leftOrder = orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      });
    }

    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.userDisplayOrder) {
      return combined;
    }

    const savedOrder = this.userDisplayOrder.listForUserProject(userId, projectId);
    const resolvedOrder = mergeDisplayOrder(
      combined,
      savedOrder.map((entry) => ({
        displayId: entry.displayId,
        sortIndex: entry.sortIndex,
      })),
    );
    console.debug("[DisplayOrder][Load]", {
      userId,
      projectId,
      savedOrder,
      resolvedOrder: resolvedOrder.map((display) => display.id),
      databasePath: this.paths.databaseFile,
    });
    // Note: Next.js may invoke this twice in development (React Strict Mode).
    return resolvedOrder;
  }

  private toCustomPortalDisplay(display: LocalDisplay) {
    const code = this.displayCodeRepo?.getByDisplayId(display.id);
    const slug = code?.slug ?? display.displayKey;
    const base = this.viewerBaseUrl.replace(/\/$/, "");
    const url = `${base}/display/${encodeURIComponent(display.projectId)}/${encodeURIComponent(slug)}`;
    return toPortalDisplay(
      {
        ...display,
        settings: {
          ...(display.settings ?? {}),
          url,
          displayType: "project-html",
        },
      },
      this.viewerBaseUrl,
    );
  }

  insertDisplayAfterInUserOrder(
    projectId: string,
    sourceDisplayId: string,
    newDisplayId: string,
  ) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.userDisplayOrder) {
      return;
    }

    const orderedIds = this.listProjectDisplays(projectId)
      .map((display) => display.id)
      .filter((displayId) => displayId !== newDisplayId);
    const sourceIndex = orderedIds.indexOf(sourceDisplayId);
    if (sourceIndex >= 0) {
      orderedIds.splice(sourceIndex + 1, 0, newDisplayId);
    } else {
      orderedIds.push(newDisplayId);
    }
    this.userDisplayOrder.saveOrder(userId, projectId, orderedIds);
  }

  appendDisplayToUserOrder(projectId: string, displayId: string) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId || !this.userDisplayOrder) {
      return;
    }

    const orderedIds = this.listProjectDisplays(projectId)
      .map((display) => display.id)
      .filter((id) => id !== displayId);
    orderedIds.push(displayId);
    this.userDisplayOrder.saveOrder(userId, projectId, orderedIds);
  }

  getUserDisplayOrder(projectId: string) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId) {
      throw new Error("Sign in to load display order.");
    }
    if (!this.userDisplayOrder) {
      return [];
    }
    return this.userDisplayOrder.listForUserProject(userId, projectId);
  }

  saveUserDisplayOrder(projectId: string, displayIds: string[]) {
    const userId = this.auth.getAuthenticatedUser()?.userId;
    if (!userId) {
      throw new Error("Sign in to save display order.");
    }
    if (!this.accessAuthorization) {
      throw new Error("You do not have permission to reorder displays.");
    }
    const capabilities = this.accessAuthorization.getProjectCapabilities(userId, projectId);
    if (!capabilities.canOperateDisplays) {
      throw new Error("You do not have permission to reorder displays.");
    }
    if (!this.userDisplayOrder) {
      throw new Error("Display order persistence is unavailable.");
    }

    if (!isBroadArrowCanonicalProject(this.projects.getById(projectId) ?? { slug: "" })) {
      this.pylonDisplays.listProjectDisplays(projectId, this.viewerBaseUrl);
      this.lowerTickerDisplays.listProjectDisplays(projectId, this.viewerBaseUrl);
      this.newAuctionDisplays.ensureNewBidDisplay(projectId, this.viewerBaseUrl);
      this.newAuctionDisplays.ensureNewTickerDisplay(projectId, this.viewerBaseUrl);
    }

    const projectDisplays = this.displays.listByProject(projectId);
    const knownIds = new Set(projectDisplays.map((display) => display.id));
    const idByKey = new Map(projectDisplays.map((display) => [display.displayKey, display.id]));

    const entries: string[] = [];
    const seen = new Set<string>();
    for (const rawId of displayIds) {
      const trimmed = rawId.trim();
      if (!trimmed) continue;
      let resolved = trimmed;
      if (!knownIds.has(trimmed)) {
        const byKey = idByKey.get(trimmed);
        if (byKey) {
          resolved = byKey;
        }
      }
      if (!knownIds.has(resolved) || seen.has(resolved)) continue;
      seen.add(resolved);
      entries.push(resolved);
    }

    if (entries.length === 0) {
      throw new Error("No valid displays were provided.");
    }

    const databasePath = this.paths.databaseFile;
    console.debug("[DisplayOrder][SaveStart]", {
      userId,
      projectId,
      entries,
      databasePath,
    });

    const rowCount = this.userDisplayOrder.saveOrder(userId, projectId, entries);

    const keyById = new Map(projectDisplays.map((display) => [display.id, display.displayKey]));
    const keysInOrder = entries
      .map((displayId) => keyById.get(displayId))
      .filter((displayKey): displayKey is string => Boolean(displayKey));
    if (keysInOrder.length > 0) {
      this.displays.reorderProjectDisplays(projectId, keysInOrder);
      const actor = this.resolveCurrentActivityActor();
      this.recordActivity({
        type: "display.order_changed",
        message: "Reordered project displays.",
        source: "displays",
        actor,
        metadata: {
          projectId,
          displayCount: keysInOrder.length,
          displayIds: entries,
        },
      });
      this.displaySync?.requestSync("display-order-changed");
    }

    console.debug("[DisplayOrder][SaveComplete]", {
      userId,
      projectId,
      rowCount,
      databasePath,
    });

    return { ok: true as const, rowCount };
  }

  setDisplayRefreshRate(projectId: string, displayIdOrKey: string, refreshRateMs: number) {
    const normalizedRefreshRateMs = normalizeDisplayRefreshRateMs(refreshRateMs);
    if (!isAllowedDisplayRefreshRateMs(normalizedRefreshRateMs)) {
      throw new Error("Unsupported display refresh rate.");
    }

    const display = this.resolveProjectDisplay(projectId, displayIdOrKey);
    if (!display) {
      throw new Error("Display not found.");
    }

    const previousRefreshRateMs = display.refreshRateMs;
    const updated = this.displays.setRefreshRateMs(display.id, normalizedRefreshRateMs);
    if (!updated) {
      throw new Error("Display not found.");
    }

    if (previousRefreshRateMs !== normalizedRefreshRateMs) {
      const actor = this.resolveCurrentActivityActor();
      this.recordActivity({
        type: "display.refresh-rate-changed",
        message: `Changed display refresh rate to ${formatDisplayRefreshRateLabel(normalizedRefreshRateMs)}.`,
        source: "displays",
        actor,
        metadata: {
          displayId: display.id,
          displayKey: display.displayKey,
          displayName: display.name,
          projectId,
          refreshRateMs: normalizedRefreshRateMs,
        },
      });
      this.notifyPlatformDisplayConnectionChanged(display.displayKey, display.enabled);
    }

    return {
      displayId: updated.id,
      refreshRateMs: updated.refreshRateMs,
    };
  }

  setDisplaySize(
    projectId: string,
    displayIdOrKey: string,
    displayWidth: number,
    displayHeight: number,
  ) {
    if (!isAllowedDisplaySize(displayWidth, displayHeight)) {
      throw new Error("Unsupported display size.");
    }

    const display = this.resolveProjectDisplay(projectId, displayIdOrKey);
    if (!display) {
      throw new Error("Display not found.");
    }

    const size = normalizeDisplaySize(displayWidth, displayHeight);
    const updated = this.displays.setDisplaySize(
      display.id,
      size.displayWidth,
      size.displayHeight,
    );
    if (!updated) {
      throw new Error("Display not found.");
    }

    const actor = this.resolveCurrentActivityActor();
    this.recordActivity({
      type: "display.size-changed",
      message: `Changed display size for "${display.name}" to ${formatDisplaySizeLabel(size.displayWidth, size.displayHeight)}.`,
      source: "displays",
      actor,
      metadata: {
        displayId: display.id,
        displayKey: display.displayKey,
        displayName: display.name,
        projectId,
        displayWidth: size.displayWidth,
        displayHeight: size.displayHeight,
      },
    });

    return {
      displayId: updated.id,
      displayWidth: updated.displayWidth,
      displayHeight: updated.displayHeight,
    };
  }

  private resolveProjectDisplay(projectId: string, displayIdOrKey: string) {
    const byId = this.displays.getById(displayIdOrKey);
    if (byId && byId.projectId === projectId) {
      return byId;
    }

    return this.displays.getByKey(projectId, displayIdOrKey);
  }

  removeUserDisplayOrderForDisplay(displayId: string) {
    this.userDisplayOrder?.removeForDisplay(displayId);
  }

  removeUserDisplayOrderForProject(projectId: string) {
    this.userDisplayOrder?.removeForProject(projectId);
  }

  isPylonDisplayEnabled() {
    return this.pylonDisplays.isPylonEnabled();
  }

  setPylonDisplayEnabled(enabled: boolean) {
    const previous = this.pylonDisplays.isPylonEnabled();
    const result = this.pylonDisplays.setPylonEnabled(enabled);
    if (previous !== enabled) {
      this.notifyPlatformDisplayConnectionChanged("pylon", enabled);
      this.recordActivity({
        type: "display.connection",
        message: enabled
          ? "Pylon display data connected"
          : "Pylon display data disconnected",
        source: "displays",
      });
    }
    return result;
  }

  isLowerTickerDisplayEnabled() {
    return this.lowerTickerDisplays.isLowerTickerEnabled();
  }

  setLowerTickerDisplayEnabled(enabled: boolean) {
    const previous = this.lowerTickerDisplays.isLowerTickerEnabled();
    const result = this.lowerTickerDisplays.setLowerTickerEnabled(enabled);
    if (previous !== enabled) {
      this.notifyPlatformDisplayConnectionChanged("lower-ticker-v5", enabled);
      this.recordActivity({
        type: "display.connection",
        message: enabled
          ? "Lower Ticker display data connected"
          : "Lower Ticker display data disconnected",
        source: "displays",
      });
    }
    return result;
  }

  getDisplayDataSource(): DisplayDataSource {
    const stored = this.settings.get<string>(
      DISPLAY_DATA_SOURCE_SETTING_KEY,
      "webpage-scraper",
    );
    const normalized = normalizeDisplayDataSource(stored);
    if (normalized !== stored) {
      this.settings.set(DISPLAY_DATA_SOURCE_SETTING_KEY, normalized);
    }
    return normalized;
  }

  subscribeDisplayDataSource(window: BrowserWindowRuntime) {
    this.displayDataSourceSubscribers.add(window.id);
    if (!window.isDestroyed()) {
      sendToRenderer(window, "neud:displayDataSource:changed", {
        source: this.getDisplayDataSource(),
      });
    }
  }

  unsubscribeDisplayDataSource(window: BrowserWindowRuntime) {
    this.displayDataSourceSubscribers.delete(window.id);
  }

  setDisplayDataSource(
    source: unknown,
    options?: { reason?: string },
  ): DisplayDataSource {
    if (!isDisplayDataSource(source)) {
      throw new Error("Invalid display data source.");
    }

    const previous = this.getDisplayDataSource();
    if (previous === source) {
      return source;
    }

    this.settings.set(DISPLAY_DATA_SOURCE_SETTING_KEY, source);
    this.displayDataRevision += 1;
    this.pushDisplayDataSourceChanged(source);

    const label = displayDataSourceLabel(source);
    const primaryEngineId = this.getPrimaryBagEngineId();
    setImmediate(() => {
      this.recordActivity({
        type: "data-source.changed",
        message: `Data source changed to ${label}`,
        userAction: `Data source changed to ${label}`,
        source: "system",
        metadata: {
          source,
          displayDataRevision: this.displayDataRevision,
          ...(primaryEngineId ? { engineId: primaryEngineId } : {}),
        },
      });

      for (const project of this.projects.list()) {
        this.recordCanonicalPipelineDiagnostics(project.id, {
          triggerReason: options?.reason ?? "source-switch",
          previousSnapshot: this.lastObservedCanonicalSnapshot.get(project.id) ?? null,
          publicationRequestedAt: new Date().toISOString(),
        });
        this.notifyProjectCanonicalMayHaveChanged(
          project.id,
          options?.reason ?? "source-switch",
        );
      }

      const engineId = this.getPrimaryBagEngineId();
      if (engineId) {
        this.recordLog(engineId, {
          level: "info",
          eventType: "engine.execution",
          message: `Data source changed to ${label}`,
        });
      }
    });

    return source;
  }

  private pushDisplayDataSourceChanged(source: DisplayDataSource) {
    for (const windowId of this.displayDataSourceSubscribers) {
      const window = BrowserWindowRuntime.fromId(windowId);
      if (window && !window.isDestroyed()) {
        sendToRenderer(window, "neud:displayDataSource:changed", { source });
      }
    }
  }

  private notifyPlatformDisplayConnectionChanged(displayId: string, enabled: boolean) {
    if (!enabled) {
      if (this.viewerBaseUrl) {
        reconcileDisplayViewerWindows(displayId, this.viewerBaseUrl);
      } else {
        closeDisplayViewerWindows(displayId);
      }
    }

    for (const window of BrowserWindowRuntime.getAllWindows()) {
      if (!window.isDestroyed()) {
        sendToRenderer(window, "neud:displayConnection:changed", {
          displayId,
          enabled,
        });
      }
    }
  }

  reconcileDisabledDisplayViewerWindows(): void {
    const baseUrl = this.viewerBaseUrl;
    if (!baseUrl) return;

    if (!this.isPylonDisplayEnabled()) {
      reconcileDisplayViewerWindows("pylon", baseUrl);
    }
    if (!this.isLowerTickerDisplayEnabled()) {
      reconcileDisplayViewerWindows("lower-ticker-v5", baseUrl);
    }
    if (!this.isNewBidDisplayEnabled()) {
      reconcileDisplayViewerWindows("new-bid-display-v1", baseUrl);
    }
    if (!this.isNewTickerDisplayEnabled()) {
      reconcileDisplayViewerWindows("new-ticker-v1", baseUrl);
    }
  }

  getDisplayDataRevision() {
    return this.displayDataRevision;
  }

  isAnyEngineSessionActive(): boolean {
    for (const project of this.projects.list()) {
      for (const engine of this.dataSources.listByProject(project.id)) {
        if (engine.desiredState === "running") {
          return true;
        }

        const status = this.dataSources.getStatus(engine.id);
        const actualState = status?.actualState ?? "stopped";
        if (
          actualState === "starting" ||
          actualState === "running" ||
          actualState === "stopping" ||
          actualState === "scraping"
        ) {
          return true;
        }
      }
    }

    return false;
  }

  getPylonDisplayData(options?: { preview?: boolean }) {
    const source = this.getDisplayDataSource();
    const platformEnabled = this.pylonDisplays.isPylonEnabled();

    if (!platformEnabled && !options?.preview) {
      return {
        enabled: false,
        status: "display_disabled",
        source,
      };
    }

    const payload = this.buildPylonPayloadForSource(source);
    const effective = this.resolveDisplayData(source);
    const waitingForManual =
      source === "local-controller" &&
      !effective.localControllerState?.currentLot?.lotNumber?.trim();
    return {
      enabled: platformEnabled || options?.preview === true,
      status: waitingForManual
        ? LOCAL_CONTROLLER_WAITING_STATUS
        : payload.hasData
          ? "ok"
          : "no_data",
      source,
      revision: this.displayDataRevision,
      currencies: effective.currency.displayCurrencies,
      ...sanitizePylonFeedPayload(payload.feed),
    };
  }

  isNewBidDisplayEnabled() {
    return this.newAuctionDisplays.isNewBidDisplayEnabled();
  }

  setNewBidDisplayEnabled(enabled: boolean) {
    const previous = this.newAuctionDisplays.isNewBidDisplayEnabled();
    const result = this.newAuctionDisplays.setNewBidDisplayEnabled(enabled);
    if (previous !== enabled) {
      this.notifyPlatformDisplayConnectionChanged("new-bid-display-v1", enabled);
      this.recordActivity({
        type: "display.connection",
        message: enabled
          ? "New Bid Display v1 data connected"
          : "New Bid Display v1 data disconnected",
        source: "displays",
      });
    }
    return result;
  }

  isNewTickerDisplayEnabled() {
    return this.newAuctionDisplays.isNewTickerDisplayEnabled();
  }

  setNewTickerDisplayEnabled(enabled: boolean) {
    const previous = this.newAuctionDisplays.isNewTickerDisplayEnabled();
    const result = this.newAuctionDisplays.setNewTickerDisplayEnabled(enabled);
    if (previous !== enabled) {
      this.notifyPlatformDisplayConnectionChanged("new-ticker-v1", enabled);
      this.recordActivity({
        type: "display.connection",
        message: enabled
          ? "New Ticker v1 data connected"
          : "New Ticker v1 data disconnected",
        source: "displays",
      });
    }
    return result;
  }

  getNewBidDisplayData(options?: { preview?: boolean }) {
    return this.getNewAuctionGraphicDisplayData(
      this.isNewBidDisplayEnabled(),
      options?.preview === true,
    );
  }

  getNewTickerDisplayData(options?: { preview?: boolean }) {
    return this.getNewAuctionGraphicDisplayData(
      this.isNewTickerDisplayEnabled(),
      options?.preview === true,
    );
  }

  private getNewAuctionGraphicDisplayData(enabled: boolean, preview = false) {
    const source = this.getDisplayDataSource();
    if (!enabled && !preview) {
      return {
        enabled: false,
        status: "display_disabled",
        source,
      };
    }

    const effective = this.resolveDisplayData(source);
    const payload = buildNewAuctionGraphicPayload({
      source,
      scraperSnapshot: effective.scraperSnapshot,
      localControllerState: effective.localControllerState,
      submittedState: this.getPrimaryBagSubmittedRawState(),
      dataset: this.getPrimaryBagActiveDataset(),
      revision: this.displayDataRevision,
      enabled: enabled || preview,
      status: "ok",
    });

    const auctionDisplay = effective.pylonFeed.auctionDisplay;
    const scraperAuctionDisplay =
      source === "webpage-scraper" &&
      effective.scraperSnapshot &&
      typeof effective.scraperSnapshot.auctionDisplay === "object" &&
      effective.scraperSnapshot.auctionDisplay !== null
        ? (effective.scraperSnapshot.auctionDisplay as Record<string, unknown>)
        : null;
    const scraperReserveStatus =
      typeof scraperAuctionDisplay?.reserveStatus === "string"
        ? scraperAuctionDisplay.reserveStatus
        : "";
    const resolvedReserveStatus =
      payload.current.reserveStatus ??
      (scraperReserveStatus.trim() ? scraperReserveStatus : null) ??
      (auctionDisplay.reserveStatus.trim() ? auctionDisplay.reserveStatus : null);

    const currencyCodes = ["EUR", "GBP", "CHF", "JPY"] as const;
    const currencyRowsFromObject = currencyCodes
      .map((code) => {
        const value = payload.current.currencies[code];
        return value ? `${code} ${value}` : "";
      })
      .filter(Boolean);
    const currencyRows =
      currencyRowsFromObject.length > 0
        ? currencyRowsFromObject
        : auctionDisplay.currencies
            .map((row, index) => {
              const trimmed = String(row ?? "").trim();
              if (!trimmed) return "";
              if (/^[A-Z]{3}\b/.test(trimmed)) return trimmed;
              const code = currencyCodes[index];
              return code ? `${code} ${trimmed}` : trimmed;
            })
            .filter(Boolean);

    return {
      ...payload,
      revision: this.displayDataRevision,
      current: {
        ...payload.current,
        reserveStatus: resolvedReserveStatus,
        currencies:
          Object.keys(payload.current.currencies).length > 0
            ? payload.current.currencies
            : currencyRows.reduce(
                (acc, row) => {
                  const match = row.match(/^([A-Z]{3})\b[:\s-]*(.+)$/i);
                  if (match) {
                    acc[match[1] as (typeof currencyCodes)[number]] = match[2].trim();
                  }
                  return acc;
                },
                {} as Partial<Record<(typeof currencyCodes)[number], string>>,
              ),
      },
      auctionDisplay: {
        lot: payload.current.lot ?? auctionDisplay.lot,
        title: payload.current.title ?? auctionDisplay.title,
        reserveStatus: resolvedReserveStatus ?? "",
        biddingPrice: payload.current.biddingPrice ?? auctionDisplay.biddingPrice,
        currencies: currencyRows,
        photos: payload.current.photos.length > 0 ? payload.current.photos : auctionDisplay.photos,
      },
    };
  }

  getGenericDisplayBridgeData(projectId: string) {
    const source = this.getDisplayDataSource();
    const effective = this.resolveDisplayData(source, projectId);
    const validated = this.getActiveCanonicalProjectSnapshot(projectId);
    const snapshot =
      validated ??
      (effective.canonicalSnapshot
        ? serializeCanonicalProjectSnapshot(effective.canonicalSnapshot)
        : effective.previewSnapshot
          ? serializeCanonicalProjectSnapshot(
              effective.previewSnapshot as Parameters<
                typeof serializeCanonicalProjectSnapshot
              >[0],
            )
          : null);

    const canonicalFields = snapshot ?? {
      prev: null,
      current: null,
      next: [],
      lots: [],
      lastSold: null,
      auctionDisplay: null,
      updatedAt: new Date().toISOString(),
      dataSource: source,
    };

    return {
      ...canonicalFields,
      enabled: true,
      source,
      revision: this.displayDataRevision,
      snapshot,
      broadArrowDisplay: snapshot
        ? normalizeBroadArrowDisplayData(snapshot as Record<string, unknown>)
        : null,
      currencies: effective.currency.displayCurrencies,
      projectId,
    };
  }

  getActiveCanonicalProjectSnapshot(projectId: string) {
    const source = this.getDisplayDataSource();
    const effective = this.resolveDisplayData(source, projectId);
    const snapshot = effective.canonicalSnapshot;
    if (!snapshot) {
      console.debug("[CanonicalProjectData] snapshot unavailable", { projectId, source });
      return null;
    }

    const validation = validateCanonicalProjectData(snapshot);
    if (!validation.ok) {
      console.warn("[CanonicalProjectData] validation failed", {
        projectId,
        source,
        issues: validation.issues,
      });
      return null;
    }

    const contentHash = hashCanonicalProjectDataForPublish(validation.data);
    const previousHash = this.canonicalSnapshotLogHashes.get(projectId);
    if (previousHash !== contentHash) {
      this.canonicalSnapshotLogHashes.set(projectId, contentHash);
      console.debug("[CanonicalProjectData] snapshot content changed", {
        projectId,
        source,
      });
    }

    this.lastObservedCanonicalSnapshot.set(projectId, { ...validation.data });

    return validation.data;
  }

  getLowerTickerDisplayData(options?: { preview?: boolean }) {
    const source = this.getDisplayDataSource();
    const platformEnabled = this.lowerTickerDisplays.isLowerTickerEnabled();

    if (!platformEnabled && !options?.preview) {
      return {
        enabled: false,
        status: "display_disabled",
        source,
        next: [],
      };
    }

    const payload = this.buildLowerTickerPayloadForSource(source);
    return {
      enabled: platformEnabled || options?.preview === true,
      status: payload.hasData ? "ok" : "no_data",
      source,
      ...payload.feed,
    };
  }

  initializeSessionDiagnostics() {
    this.logStartupAuthDiagnostics();
    this.clearSessionFacingLastErrors();
    for (const project of this.projects.list()) {
      for (const engine of this.dataSources.listByProject(project.id)) {
        this.pushEngineStatusSnapshot(engine.id);
      }
    }
  }

  private shouldAutoResolveActivityActor(type: string, userAction?: string): boolean {
    if (userAction?.trim()) {
      return true;
    }
    if (isAutomatedActivityEventType(type)) {
      return false;
    }
    if (type.startsWith("system.")) {
      return false;
    }
    if (type === "engine.started" || type === "engine.stopped" || type === "engine.error") {
      return false;
    }
    return (
      type.startsWith("access.") ||
      type.startsWith("controller.") ||
      type.startsWith("display.") ||
      type.startsWith("developer-tools.") ||
      type.startsWith("project.") ||
      type.startsWith("team.") ||
      type.startsWith("invitation.") ||
      type.startsWith("online_viewer.") ||
      type.startsWith("data-source.") ||
      type.startsWith("manual.") ||
      type === "user.action"
    );
  }

  resolveCurrentActivityActor(): ActivityActor {
    const user = this.auth.getAuthenticatedUser();
    const displayName = user?.displayName?.trim();
    const email = user?.email?.trim();
    const name =
      displayName ||
      (email ? email.split("@")[0] : "") ||
      "Unknown User";

    return {
      id: user?.userId,
      name,
      email: email || undefined,
    };
  }

  private resolveProjectActivityMetadata(
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> {
    const input = metadata ?? {};
    const projectId =
      typeof input.projectId === "string" ? input.projectId : undefined;
    const engineId =
      typeof input.engineId === "string" ? input.engineId : undefined;
    const displayId =
      typeof input.displayId === "string" ? input.displayId : undefined;

    if (projectId) {
      const project = this.projects.getById(projectId);
      if (project) {
        return {
          projectId: project.id,
          projectSlug: project.slug,
          projectName: project.name,
          ...(engineId ? { engineId } : {}),
          ...(displayId ? { displayId } : {}),
        };
      }
    }

    if (engineId) {
      const engine = this.dataSources.getById(engineId);
      if (engine) {
        const project = this.projects.getById(engine.projectId);
        if (project) {
          return {
            projectId: project.id,
            projectSlug: project.slug,
            projectName: project.name,
            engineId,
            ...(displayId ? { displayId } : {}),
          };
        }
      }
      return { engineId, ...(displayId ? { displayId } : {}) };
    }

    if (displayId) {
      const display =
        this.displays.getById(displayId) ??
        (projectId ? this.displays.getByKey(projectId, displayId) : null) ??
        this.displays.listByProject(projectId ?? "").find(
          (row) => row.displayKey === displayId || row.id === displayId,
        ) ??
        null;
      if (display) {
        const project = this.projects.getById(display.projectId);
        if (project) {
          return {
            projectId: project.id,
            projectSlug: project.slug,
            projectName: project.name,
            displayId: display.id,
            displayKey: display.displayKey,
            displayName: display.name,
          };
        }
      }
      return { displayId, ...(projectId ? { projectId } : {}) };
    }

    return {};
  }

  recordActivity(input: {
    type: string;
    message: string;
    source?: string;
    severity?: ActivityEvent["severity"];
    actor?: ActivityActor;
    metadata?: Record<string, unknown>;
    userAction?: string;
  }) {
    if (isDeprecatedActivityType(input.type)) {
      return null;
    }

    const rawDescription = (input.userAction ?? input.message).trim();
    const storedDescription = rawDescription
      ? formatActivityDescription(rawDescription)
      : formatSystemActivityMessage(input.message);

    const actor =
      input.actor ??
      (this.shouldAutoResolveActivityActor(input.type, input.userAction)
        ? this.resolveCurrentActivityActor()
        : isAutomatedActivityEventType(input.type)
          ? { name: ACTIVITY_SYSTEM_ACTOR_LABEL }
          : undefined);

    const cloudId = randomUUID();
    const instanceId =
      this.activitySync?.getDiagnostics().instanceId ??
      getOrCreateNeudInstanceId(this.settings);

    const entry = this.activitySession.append({
      event: {
        type: input.type,
        message: storedDescription,
        timestamp: new Date().toISOString(),
        source: input.source,
        severity: input.severity,
        actor,
        metadata: {
          ...this.resolveProjectActivityMetadata(input.metadata),
          ...(input.metadata ?? {}),
          description: storedDescription,
        },
        id: cloudId,
      },
      cloudId,
      instanceId,
    });
    this.pushActivityEntry(entry);
    this.activitySync?.queueEventUpload(cloudId);
    return entry;
  }

  getActivitySnapshot(limit?: number) {
    return filterDeprecatedActivityEntries(this.activitySession.getSnapshot(limit));
  }

  getActivityOverviewSnapshot() {
    return filterDeprecatedActivityEntries(this.activitySession.getOverviewSnapshot());
  }

  subscribeActivity(window: BrowserWindowRuntime) {
    this.activitySubscribers.add(window.id);
    if (!window.isDestroyed()) {
      sendToRenderer(window, "neud:activity:snapshot", {
        entries: this.getActivitySnapshot(),
        overviewEntries: this.getActivityOverviewSnapshot(),
      });
    }
  }

  unsubscribeActivity(window: BrowserWindowRuntime) {
    this.activitySubscribers.delete(window.id);
  }

  clearActivityWindow(window: BrowserWindowRuntime) {
    this.activitySubscribers.delete(window.id);
  }

  private pushActivityEntry(entry: ActivityEvent) {
    for (const windowId of this.activitySubscribers) {
      const window = BrowserWindowRuntime.fromId(windowId);
      if (window && !window.isDestroyed()) {
        sendToRenderer(window, "neud:activity:entry", { entry });
      }
    }
  }

  private buildPylonPayloadForSource(source: DisplayDataSource) {
    const effective = this.resolveDisplayData(source);
    const feed = effective.pylonFeed;
    return {
      hasData: this.pylonFeedHasData(feed),
      feed,
    };
  }

  private pylonFeedHasData(feed: PylonFeedPayload) {
    const display = feed.auctionDisplay;
    return Boolean(
      display.title ||
        display.biddingPrice ||
        display.reserveStatus ||
        (display.lot && display.lot !== "Lot —") ||
        display.photos.length > 0,
    );
  }

  private buildLowerTickerPayloadForSource(source: DisplayDataSource) {
    const effective = this.resolveDisplayData(source);
    const feed = effective.lowerTickerFeed;
    return {
      hasData: feed.next.length > 0,
      feed,
    };
  }

  resolveDisplayData(
    source: DisplayDataSource = this.getDisplayDataSource(),
    projectId?: string,
  ) {
    const scraperSnapshot = projectId
      ? this.getLatestBagSnapshotPayloadForProject(projectId)
      : this.getLatestBagSnapshotPayload();
    const submittedState = projectId
      ? this.bagLiveState.getSubmittedDisplayState(projectId)
      : this.getPrimaryBagSubmittedRawState();
    const dataset = projectId
      ? (this.auctionDatasetService?.readActiveDataset(projectId) ?? null)
      : this.getPrimaryBagActiveDataset();
    const photoOverrides = projectId
      ? this.bagLiveState.getLotPhotoOverrides(projectId)
      : this.getPrimaryBagPhotoOverrides();
    const enrichCanonicalPhotos =
      projectId && this.cloudPhotoAssetService
        ? (photos: import("../displays/canonical-photo").CanonicalPhotoInput[]) =>
            this.cloudPhotoAssetService!.enrichCanonicalPhotos(projectId, photos)
        : undefined;
    return resolveEffectiveDisplayData({
      source,
      scraperSnapshot,
      localControllerState: null,
      submittedState,
      dataset,
      photoOverrides,
      enrichCanonicalPhotos,
    });
  }

  private getPrimaryBagPhotoOverrides() {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      return this.bagLiveState.getLotPhotoOverrides(project.id);
    }
    return {};
  }

  private getPrimaryBagSubmittedRawState() {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      return this.bagLiveState.getSubmittedDisplayState(project.id);
    }
    return null;
  }

  private getPrimaryBagActiveDataset(): Record<string, unknown> | null {
    if (!this.auctionDatasetService) return null;
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      return this.auctionDatasetService.readActiveDataset(project.id);
    }
    return null;
  }

  private getPrimaryBagSubmittedState() {
    return this.resolveDisplayData("local-controller").localControllerState;
  }

  private getPrimaryBagLiveState() {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      return this.bagLiveState.getLiveState(project.id);
    }
    return null;
  }

  private getPrimaryBagEngineId(): string | null {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      const engine = this.bagLiveState.getBagEngineForProject(project.id);
      return engine?.id ?? null;
    }
    return null;
  }

  private getLatestBagSnapshotPayload(): Record<string, unknown> | null {
    for (const project of this.projects.list()) {
      if (project.projectType !== "bag-graphics") continue;
      const engines = this.dataSources.listByProject(project.id);
      for (const engine of engines) {
        const snapshot = this.dataSources.getLatestSnapshot(engine.id);
        if (snapshot?.data && typeof snapshot.data === "object") {
          return snapshot.data as Record<string, unknown>;
        }
      }
    }
    return null;
  }

  getProjectEngines(projectId: string) {
    return this.dataSources.listByProject(projectId).map((source) => {
      const settings = this.dataSources.getSettings(source.id);
      const status = this.dataSources.getStatus(source.id);
      return {
        ...toPortalDataEngine(source),
        status: toPortalEngineStatus(source.id, status, source.createdAt),
        settings: toPortalScraperSettings(source.id, settings, source.createdAt),
      };
    });
  }

  getEngineById(engineId: string) {
    const source = this.dataSources.getById(engineId);
    return source ? toPortalDataEngine(source) : null;
  }

  getEngineDetailBundle(engineId: string) {
    const source = this.dataSources.getById(engineId);
    if (!source) return null;

    if (this.bagSources.isBagGraphicsProject(engineId)) {
      this.bagSources.ensureBagScraperSources(engineId);
      this.bagRepair.repairEngineIfBroadArrow(engineId);
    } else if (this.genericScraper.isGenericWebpageProject(engineId)) {
      this.genericScraper.ensureGenericScraperSources(engineId);
    }
    this.normalizeEngineExecutionMode(engineId);

    const refreshed = this.dataSources.getById(engineId);
    if (!refreshed) return null;

    const settings = this.dataSources.getSettings(refreshed.id);
    const status = this.dataSources.getStatus(refreshed.id);
    const sources = this.dataSources.listSources(refreshed.id);
    const latestSnapshot = this.dataSources.getLatestSnapshot(refreshed.id);
    const recentSnapshots = this.dataSources.getRecentSnapshots(refreshed.id, 100);
    const logs = this.dataSources.getLogs(refreshed.id);
    const contamination = this.bagSources.detectGenericBagContamination(engineId);
    const adapterContamination =
      this.genericScraper.detectGenericAdapterContamination(engineId);

    return {
      engine: toPortalDataEngine(refreshed),
      status: toPortalEngineStatus(refreshed.id, status, refreshed.createdAt, {
        pollIntervalMs: settings?.pollIntervalMs ?? null,
      }),
      settings: toPortalScraperSettings(refreshed.id, settings, refreshed.createdAt),
      sources: sources.map(toPortalScraperSource),
      latestSnapshot: latestSnapshot ? toPortalSnapshot(latestSnapshot) : null,
      recentSnapshots: recentSnapshots.map(toPortalSnapshot),
      logs: logs.map(toPortalLog),
      pendingCommand: null,
      latestCommand: null,
      activeCommandCount: 0,
      bagContamination: contamination.contaminated
        ? { untouchedKeys: contamination.untouchedKeys }
        : null,
      adapterContamination: adapterContamination.contaminated
        ? { adapter: adapterContamination.adapter }
        : null,
    };
  }

  clearUntouchedBagDefaults(engineId: string) {
    return this.bagSources.clearUntouchedBagDefaults(engineId);
  }

  saveGenericScraperConfig(
    engineId: string,
    input: Parameters<GenericScraperService["saveGenericConfig"]>[1],
  ) {
    return this.genericScraper.saveGenericConfig(engineId, input);
  }

  saveBagScraperUrls(
    engineId: string,
    input: Parameters<BagSourceService["saveBagSourceUrls"]>[1],
  ) {
    return this.bagSources.saveBagSourceUrls(engineId, input);
  }

  listBagSources(engineId: string) {
    return this.bagSources.listSources(engineId).map(toPortalScraperSource);
  }

  saveBagSource(
    engineId: string,
    input: Parameters<BagSourceService["saveBagSource"]>[1],
  ) {
    return toPortalScraperSource(this.bagSources.saveBagSource(engineId, input));
  }

  addBagCustomSource(
    engineId: string,
    input: Parameters<BagSourceService["addCustomSource"]>[1],
  ) {
    return toPortalScraperSource(this.bagSources.addCustomSource(engineId, input));
  }

  removeBagSource(engineId: string, sourceId: string) {
    this.bagSources.removeSource(engineId, sourceId);
  }

  resetBagSource(engineId: string, sourceId: string) {
    return toPortalScraperSource(this.bagSources.resetSource(engineId, sourceId));
  }

  reorderBagSources(engineId: string, orderedSourceIds: string[]) {
    return this.bagSources
      .reorderSources(engineId, orderedSourceIds)
      .map(toPortalScraperSource);
  }

  repairBroadArrowConfiguration() {
    return this.bagRepair.repairBroadArrowConfiguration();
  }

  migrateLegacyEngineRuntimeAssets(engineId: string): LegacyRuntimeMigrationResult {
    return migrateLegacyEngineRuntimeAssets(this.paths, engineId);
  }

  migrateAllLegacyEngineRuntimeAssets(): Array<{
    engineId: string;
    result: LegacyRuntimeMigrationResult;
  }> {
    const results: Array<{
      engineId: string;
      result: LegacyRuntimeMigrationResult;
    }> = [];

    for (const project of this.projects.list()) {
      for (const engine of this.dataSources.listByProject(project.id)) {
        this.credentials.getCredentialMeta(engine.id);
        const result = migrateLegacyEngineRuntimeAssets(this.paths, engine.id);
        if (result.cookiesMigrated || result.browserDataMigrated) {
          results.push({ engineId: engine.id, result });
        }

        const status = this.dataSources.getStatus(engine.id);
        if (
          status?.lastError &&
          status.lastSuccessAt &&
          (!status.lastRunFailedAt ||
            Date.parse(status.lastSuccessAt) >= Date.parse(status.lastRunFailedAt))
        ) {
          this.dataSources.upsertStatus(engine.id, { lastError: null });
        }
      }
    }

    return results;
  }

  ensureBroadArrowDevelopmentPhase() {
    return this.broadArrowPhase.ensureBroadArrowDevelopmentPhase(
      this.localApiBaseUrl,
    );
  }

  getDefaultProjectSlug() {
    return this.broadArrowPhase.getDefaultProjectSlug();
  }

  getCredentialMeta(engineId: string) {
    return this.credentials.getCredentialMeta(engineId);
  }

  deleteProject(input: Parameters<ProjectDeletionService["deleteProject"]>[0]) {
    return this.projectDeletion.deleteProject(input);
  }

  isPlatformAdmin() {
    return this.isElevatedAccessUser();
  }

  canCreateProject() {
    return this.isElevatedAccessUser();
  }

  canDeleteProject() {
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    const context = userId
      ? this.accessAuthorization?.getAuthorizationContext(userId)
      : null;
    if (context) {
      return context.isPlatformOwner;
    }
    return this.auth.canDeleteProject();
  }

  getProjectAccessContextBySlug(slug: string) {
    const project = this.projects.getBySlug(slug);
    const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
    if (!project || !userId || !this.accessAuthorization) {
      return null;
    }

    const capabilities = this.accessAuthorization.getProjectCapabilities(userId, project.id);
    if (!capabilities.canViewProject) {
      return null;
    }

    const context = this.accessAuthorization.getAuthorizationContext(userId);
    let projectRole: ProjectRole = "viewer";
    if (context?.isPlatformOwner) {
      projectRole = "owner";
    } else if (capabilities.canEditProjectSettings) {
      projectRole = "admin";
    } else if (capabilities.canOperateEngines) {
      projectRole = "operator";
    }

    return {
      project: toPortalProject(project),
      capabilities,
      projectRole,
      isPlatformAdmin: context?.isPlatformOwner ?? false,
      canManageSettings: capabilities.canEditProjectSettings,
      canManageMembers: capabilities.canManageProjectUsers,
    };
  }

  convertGenericAdapter(
    engineId: string,
    options: { removeUntouchedBagUrls?: boolean } = {},
  ) {
    return this.genericScraper.convertBagAdapterToGeneric(engineId, options);
  }

  getWorkerCredentials(engineId: string): { email: string; password: string } | null {
    if (!this.genericScraper.requiresCredentials(engineId)) {
      return null;
    }

    return getProjectWebpageScraperCredentials(this.credentials, engineId);
  }

  getWorkerBundle(engineId: string) {
    const source = this.dataSources.getById(engineId);
    if (!source) return null;

    if (this.bagSources.isBagGraphicsProject(engineId)) {
      this.bagSources.ensureBagScraperSources(engineId);
    }

    const refreshed = this.dataSources.getById(engineId);
    if (!refreshed) return null;

    const settings = this.dataSources.getSettings(refreshed.id);
    const isBagEngine = this.bagSources.isBagAuctionEngine(refreshed);

    return {
      engine: toPortalDataEngine(refreshed),
      settings: toPortalScraperSettings(
        refreshed.id,
        settings,
        refreshed.createdAt,
      ),
      sources: this.dataSources
        .listSources(refreshed.id, true)
        .map(toPortalScraperSource),
      status: toPortalEngineStatus(
        refreshed.id,
        this.dataSources.getStatus(refreshed.id),
        refreshed.createdAt,
        { pollIntervalMs: settings?.pollIntervalMs ?? null },
      ),
      pendingRunOnce: this.settings.get<boolean>(
        `pending_run_once:${engineId}`,
        false,
      ),
      ...(isBagEngine
        ? {
            bagRuntime: buildBagRuntimeConfigForWorker(),
          }
        : {}),
    };
  }

  clearPendingRunOnce(engineId: string) {
    this.settings.set(`pending_run_once:${engineId}`, false);
  }

  updateDesiredState(
    engineId: string,
    desiredState: "running" | "stopped",
    meta?: { source?: string; requestedBy?: string | null },
  ) {
    const previous = this.dataSources.getById(engineId)?.desiredState ?? null;
    logDesiredStateTransition({
      engineId,
      previousDesiredState: previous,
      nextDesiredState: desiredState,
      source: meta?.source ?? "LocalDataService.updateDesiredState",
      requestedBy: meta?.requestedBy ?? null,
    });
    this.dataSources.updateDesiredState(engineId, desiredState);
  }

  async applyDesiredState(
    engineId: string,
    desiredState: "running" | "stopped",
    requestedBy?: string | null,
  ): Promise<void> {
    this.updateDesiredState(engineId, desiredState, {
      source: "LocalDataService.applyDesiredState",
      requestedBy: requestedBy ?? null,
    });

    if (!this.engineManager) {
      console.warn(
        `[engine] desired-state=${desiredState} engineId=${engineId} (engine manager unavailable)`,
      );
      return;
    }

    const source = this.dataSources.getById(engineId);
    if (!source) {
      console.warn(`[engine] desired-state=${desiredState} engineId=${engineId} (engine not found)`);
      return;
    }

    const mode = isPackagedDesktopRuntime()
      ? "local-desktop"
      : ((source.config.execution_mode as string | undefined) ?? "local-desktop");
    if (mode !== "local-desktop") {
      return;
    }

    console.info(
      `[engine] Apply desired-state=${desiredState} engineId=${engineId} mode=${mode}`,
    );

    if (desiredState === "running") {
      const result = await this.engineManager.start(engineId, requestedBy ?? null);
      if (!result.ok) {
        console.warn(`[engine] Start failed engineId=${engineId} message=${result.message}`);
      }
      return;
    }

    await this.engineManager.stop(engineId, requestedBy ?? null);
  }

  setExecutionMode(engineId: string, mode: "local-desktop" | "remote-worker") {
    if (mode === "remote-worker") {
      throw new Error("Remote Worker execution is not available yet. Desktop execution is required.");
    }

    const source = this.dataSources.getById(engineId);
    if (!source) throw new Error("Data Engine not found.");

    this.dataSources.updateConfig(engineId, {
      ...source.config,
      execution_mode: "local-desktop",
    });
  }

  queueRunOnce(engineId: string) {
    this.settings.set(`pending_run_once:${engineId}`, true);
  }

  consumeRunOnce(engineId: string): boolean {
    const pending = this.settings.get<boolean>(
      `pending_run_once:${engineId}`,
      false,
    );
    if (pending) {
      this.settings.set(`pending_run_once:${engineId}`, false);
    }
    return pending;
  }

  updateScraperSettings(
    engineId: string,
    input: {
      pollIntervalMs: number;
      detailsTtlMs: number;
      maxDetailChecksPerPoll: number;
      headless: boolean;
    },
  ) {
    const previousSettings = this.dataSources.getSettings(engineId);
    const previousPollIntervalMs = previousSettings?.pollIntervalMs ?? null;
    this.dataSources.updateSettings(engineId, input);

    if (
      previousPollIntervalMs !== null &&
      input.pollIntervalMs !== previousPollIntervalMs
    ) {
      const engine = this.dataSources.getById(engineId);
      const previousLabel = formatPollingInterval(previousPollIntervalMs);
      const nextLabel = formatPollingInterval(input.pollIntervalMs);
      this.recordActivity({
        type: "scraper_polling_interval_changed",
        message: `Changed scraper polling interval from ${previousLabel} to ${nextLabel}.`,
        userAction: `Changed scraper polling interval from ${previousLabel} to ${nextLabel}.`,
        metadata: {
          projectId: engine?.projectId ?? null,
          engineId,
          previousIntervalMs: previousPollIntervalMs,
          newIntervalMs: input.pollIntervalMs,
        },
      });
    }
  }

  saveScraperSource(
    engineId: string,
    input: {
      id?: string;
      name: string;
      sourceKey: string;
      url: string;
      pageType: string;
      enabled: boolean;
      position: number;
    },
  ) {
    return toPortalScraperSource(this.dataSources.saveSource(engineId, input));
  }

  toggleScraperSource(engineId: string, sourceId: string, enabled: boolean) {
    this.dataSources.toggleSource(engineId, sourceId, enabled);
  }

  removeScraperSource(engineId: string, sourceId: string) {
    this.dataSources.removeSource(engineId, sourceId);
  }

  recordSnapshot(
    engineId: string,
    input: {
      data: Record<string, unknown>;
      recordCount?: number | null;
      payloadSizeBytes?: number | null;
      durationMs?: number | null;
      capturedAt?: string;
    },
  ) {
    const snapshot = this.dataSources.insertSnapshot(engineId, input);
    // Counters are owned by recordRunSuccess / recordRunFailure to avoid double-count.
    this.dataSources.upsertStatus(engineId, {
      lastSuccessAt: snapshot.capturedAt,
      lastDurationMs: snapshot.durationMs,
      lastRecordCount: snapshot.recordCount,
      lastPayloadSizeBytes: snapshot.payloadSizeBytes,
      actualState: "running",
      healthState: "healthy",
    });
    this.pushEngineStatusSnapshot(engineId);
    const liveStateResult = this.bagLiveState.processSnapshot(engineId, snapshot);
    if (liveStateResult) {
      const engine = this.dataSources.getById(engineId);
      const projectId = engine?.projectId ?? liveStateResult.state.projectId;
      this.dataSources.insertLog(engineId, {
        level: "info",
        eventType: "bag.diagnostic",
        message: "Live state updated",
        metadata: {
          stage: "live_state.update",
          snapshotId: snapshot.id,
          projectId,
        },
      });
      this.dataSources.insertLog(engineId, {
        level: "info",
        eventType: "bag.diagnostic",
        message: "SSE published",
        metadata: {
          stage: "sse.publish",
          projectId,
        },
      });
    }
    return toPortalSnapshot(snapshot);
  }

  onExecutionLogEntry(
    listener: (engineId: string, entry: SessionExecutionLogEntry) => void,
  ) {
    this.executionLogListeners.add(listener);
    return () => {
      this.executionLogListeners.delete(listener);
    };
  }

  onEngineStatusChange(
    listener: (engineId: string, snapshot: EngineStatusSnapshot) => void,
  ) {
    this.engineStatusListeners.add(listener);
    return () => {
      this.engineStatusListeners.delete(listener);
    };
  }

  getEngineStatusSnapshot(engineId: string): EngineStatusSnapshot {
    const cached = this.engineStatusSession.get(engineId);
    if (cached) {
      return cached;
    }
    return this.syncEngineStatusSnapshot(engineId);
  }

  getEngineWorkerId(engineId: string): string | null {
    return this.dataSources.getStatus(engineId)?.workerId ?? null;
  }

  private syncEngineStatusSnapshot(engineId: string): EngineStatusSnapshot {
    const status = this.dataSources.getStatus(engineId);
    const snapshot: EngineStatusSnapshot = {
      engineId,
      lastRunSucceededAt: status?.lastSuccessAt ?? null,
      lastError: status?.lastError ?? null,
      actualState: status?.actualState ?? null,
      healthState: status?.healthState ?? null,
    };
    this.engineStatusSession.set(engineId, snapshot);
    return snapshot;
  }

  private pushEngineStatusSnapshot(engineId: string) {
    const snapshot = this.syncEngineStatusSnapshot(engineId);
    for (const listener of this.engineStatusListeners) {
      listener(engineId, snapshot);
    }
  }

  onExportWorkerEvent(
    listener: (payload: import("./export-worker-events").ExportWorkerProgressPayload) => void,
  ): () => void {
    this.exportWorkerEventListeners.add(listener);
    return () => {
      this.exportWorkerEventListeners.delete(listener);
    };
  }

  private emitExportWorkerEvent(
    payload: import("./export-worker-events").ExportWorkerProgressPayload,
  ) {
    for (const listener of this.exportWorkerEventListeners) {
      listener(payload);
    }
  }

  private touchExportWorkerEvent(requestId: string) {
    const command = this.pendingExportCommands.get(requestId);
    if (!command) return;
    command.lastWorkerEventAt = Date.now();
  }

  queueExportCurrentAuction(
    engineId: string,
    tasks: Array<{ lotNumber: string; editUrl: string }>,
    photoDownloadRoot?: string,
    meta?: { operationId?: string; projectId?: string },
  ) {
    const existingRequestId = this.exportCommandByEngine.get(engineId);
    if (existingRequestId) {
      const existing = this.pendingExportCommands.get(existingRequestId);
      if (existing && (existing.status === "pending" || existing.status === "processing")) {
        throw new Error("An export is already in progress for this engine.");
      }
    }

    const requestId = randomUUID();
    const generation = (this.exportGenerationByEngine.get(engineId) ?? 0) + 1;
    this.exportGenerationByEngine.set(engineId, generation);
    this.pendingExportCommands.set(requestId, {
      requestId,
      engineId,
      operationId: meta?.operationId ?? requestId,
      projectId: meta?.projectId,
      generation,
      tasks,
      photoDownloadRoot,
      status: "pending",
      createdAt: Date.now(),
    });
    this.exportCommandByEngine.set(engineId, requestId);
    return requestId;
  }

  getExportJobStatus(
    requestId: string,
  ): "queued" | "running" | "completed" | "failed" | "cancelled" | "missing" {
    const command = this.pendingExportCommands.get(requestId);
    if (!command) return "missing";
    if (command.status === "pending") return "queued";
    if (command.status === "processing") return "running";
    if (command.status === "completed") return "completed";
    if (command.status === "cancelled") return "cancelled";
    if (command.status === "failed") {
      const error = command.error ?? "";
      if (/cancel/i.test(error)) return "cancelled";
      return "failed";
    }
    return "missing";
  }

  claimExportCurrentAuction(engineId: string) {
    const requestId = this.exportCommandByEngine.get(engineId);
    if (!requestId) return null;

    const command = this.pendingExportCommands.get(requestId);
    if (!command || command.status !== "pending") {
      return null;
    }

    command.status = "processing";
    command.processingStartedAt = Date.now();
    return {
      requestId: command.requestId,
      operationId: command.operationId,
      projectId: command.projectId,
      generation: command.generation,
      tasks: command.tasks,
      photoDownloadRoot: command.photoDownloadRoot,
    };
  }

  reportExportStarted(
    requestId: string,
    input: { workerId: string; operationId?: string; projectId?: string },
  ): boolean {
    const command = this.pendingExportCommands.get(requestId);
    if (!command || command.status !== "processing") {
      return false;
    }
    if (input.operationId && input.operationId !== command.operationId) {
      return false;
    }

    const now = Date.now();
    command.workerId = input.workerId;
    command.workerAcceptedAt = now;
    command.lastWorkerEventAt = now;
    if (input.projectId) {
      command.projectId = input.projectId;
    }

    this.emitExportWorkerEvent({
      type: "comprehensive-export-started",
      operationId: command.operationId,
      requestId: command.requestId,
      projectId: command.projectId,
      workerId: input.workerId,
      generation: command.generation,
      message: "Export started in worker",
    });
    return true;
  }

  reportExportProgress(
    requestId: string,
    input: {
      workerId?: string;
      operationId?: string;
      message?: string;
      progressPhase?: "metadata" | "photos" | "writing";
      completedMetadataLots?: number;
      totalPhotos?: number;
      completedPhotos?: number;
      completedLots?: number;
      totalLots?: number;
      currentLotNumber?: string;
      currentPhotoIndex?: number;
      currentPhotoTotal?: number;
      percent?: number;
      phase?: string;
    },
  ): boolean {
    const command = this.pendingExportCommands.get(requestId);
    if (!command || command.status !== "processing") {
      return false;
    }
    if (input.operationId && input.operationId !== command.operationId) {
      return false;
    }
    if (input.workerId && command.workerId && input.workerId !== command.workerId) {
      return false;
    }

    const now = Date.now();
    command.lastWorkerEventAt = now;
    command.progress = {
      percent: input.percent ?? command.progress?.percent ?? 0,
      completedMetadataLots:
        input.completedMetadataLots ?? command.progress?.completedMetadataLots ?? 0,
      totalPhotos: input.totalPhotos ?? command.progress?.totalPhotos ?? 0,
      completedPhotos: input.completedPhotos ?? command.progress?.completedPhotos ?? 0,
      completedLots: input.completedLots ?? command.progress?.completedLots ?? 0,
      totalLots: input.totalLots ?? command.progress?.totalLots ?? command.tasks.length,
      currentLotNumber: input.currentLotNumber ?? command.progress?.currentLotNumber,
      currentPhotoIndex: input.currentPhotoIndex ?? command.progress?.currentPhotoIndex,
      currentPhotoTotal: input.currentPhotoTotal ?? command.progress?.currentPhotoTotal,
      phase: input.progressPhase ?? input.phase ?? command.progress?.phase,
      message: input.message ?? command.progress?.message,
    };

    this.emitExportWorkerEvent({
      type: "comprehensive-export-progress",
      operationId: command.operationId,
      requestId: command.requestId,
      projectId: command.projectId,
      workerId: command.workerId ?? input.workerId,
      generation: command.generation,
      message: input.message,
      progressPhase: input.progressPhase,
      completedMetadataLots: command.progress.completedMetadataLots,
      totalPhotos: command.progress.totalPhotos,
      completedPhotos: command.progress.completedPhotos,
      completedLots: command.progress.completedLots,
      totalLots: command.progress.totalLots,
      currentLotNumber: command.progress.currentLotNumber,
      currentPhotoIndex: command.progress.currentPhotoIndex,
      currentPhotoTotal: command.progress.currentPhotoTotal,
      percent: command.progress.percent,
      phase: command.progress.phase,
    });
    return true;
  }

  cancelExportCurrentAuction(requestId: string): boolean {
    const command = this.pendingExportCommands.get(requestId);
    if (!command) return false;
    if (command.status !== "pending" && command.status !== "processing") {
      return false;
    }
    command.cancelRequested = true;
    return true;
  }

  cancelExportCurrentAuctionByOperationId(operationId: string): boolean {
    for (const command of this.pendingExportCommands.values()) {
      if (command.operationId !== operationId) continue;
      return this.cancelExportCurrentAuction(command.requestId);
    }
    return false;
  }

  isExportCancelled(requestId: string): boolean {
    const command = this.pendingExportCommands.get(requestId);
    return command?.cancelRequested === true;
  }

  completeExportCurrentAuction(
    requestId: string,
    result: Record<string, unknown>,
    meta?: { workerId?: string; operationId?: string },
  ) {
    const command = this.pendingExportCommands.get(requestId);
    if (!command) return false;
    if (meta?.operationId && meta.operationId !== command.operationId) {
      return false;
    }
    if (meta?.workerId && command.workerId && meta.workerId !== command.workerId) {
      return false;
    }
    if (command.status === "completed" || command.status === "cancelled") {
      return true;
    }

    command.status = "completed";
    command.result = result;
    command.lastWorkerEventAt = Date.now();
    if (this.exportCommandByEngine.get(command.engineId) === requestId) {
      this.exportCommandByEngine.delete(command.engineId);
    }

    this.emitExportWorkerEvent({
      type: "comprehensive-export-complete",
      operationId: command.operationId,
      requestId: command.requestId,
      projectId: command.projectId,
      workerId: command.workerId ?? meta?.workerId,
      generation: command.generation,
      result,
    });
    return true;
  }

  failExportCurrentAuction(
    requestId: string,
    error: string,
    meta?: { workerId?: string; operationId?: string },
  ) {
    const command = this.pendingExportCommands.get(requestId);
    if (!command) return false;
    if (meta?.operationId && meta.operationId !== command.operationId) {
      return false;
    }
    if (meta?.workerId && command.workerId && meta.workerId !== command.workerId) {
      return false;
    }
    if (command.status === "completed" || command.status === "cancelled") {
      return false;
    }

    if (/cancel/i.test(error)) {
      command.status = "cancelled";
    } else {
      command.status = "failed";
    }
    command.error = error;
    command.lastWorkerEventAt = Date.now();
    if (this.exportCommandByEngine.get(command.engineId) === requestId) {
      this.exportCommandByEngine.delete(command.engineId);
    }

    this.emitExportWorkerEvent({
      type: /cancel/i.test(error)
        ? "comprehensive-export-cancelled"
        : "comprehensive-export-failed",
      operationId: command.operationId,
      requestId: command.requestId,
      projectId: command.projectId,
      workerId: command.workerId ?? meta?.workerId,
      generation: command.generation,
      error,
    });
    return true;
  }

  cancelPendingExportsForShutdown() {
    for (const [requestId, command] of this.pendingExportCommands.entries()) {
      if (command.status !== "pending" && command.status !== "processing") {
        continue;
      }
      command.status = "cancelled";
      command.error = "Export cancelled during application exit.";
      if (this.exportCommandByEngine.get(command.engineId) === requestId) {
        this.exportCommandByEngine.delete(command.engineId);
      }
      this.emitExportWorkerEvent({
        type: "comprehensive-export-cancelled",
        operationId: command.operationId,
        requestId: command.requestId,
        projectId: command.projectId,
        workerId: command.workerId,
        generation: command.generation,
        error: command.error,
      });
    }
  }

  getExportCurrentAuctionResult(requestId: string) {
    return this.pendingExportCommands.get(requestId) ?? null;
  }

  getExportRequestIdForOperation(operationId: string): string | null {
    for (const command of this.pendingExportCommands.values()) {
      if (command.operationId === operationId) {
        return command.requestId;
      }
    }
    return null;
  }

  isEngineWorkerLive(engineId: string): boolean {
    return this.engineManager?.isEngineRunning(engineId) ?? false;
  }

  async waitForExportCurrentAuctionResult(
    requestId: string,
    pollMs = 200,
  ): Promise<Record<string, unknown>> {
    const {
      EXPORT_INACTIVITY_TIMEOUT_MS,
      EXPORT_SESSION_TIMEOUT_MESSAGE,
      EXPORT_STARTUP_TIMEOUT_MS,
    } = await import("./export-worker-events.js");

    while (true) {
      const command = this.pendingExportCommands.get(requestId);
      if (!command) {
        throw new Error("Export request was not found.");
      }
      if (command.status === "completed" && command.result) {
        return command.result;
      }
      if (command.status === "failed") {
        throw new Error(command.error ?? "Export failed.");
      }
      if (command.status === "cancelled") {
        throw new Error(command.error ?? "Export cancelled.");
      }

      const now = Date.now();

      if (command.status === "pending") {
        const workerAccepted = Boolean(command.workerAcceptedAt);
        if (!workerAccepted && now - command.createdAt > EXPORT_STARTUP_TIMEOUT_MS) {
          throw new Error(EXPORT_SESSION_TIMEOUT_MESSAGE);
        }
      }

      if (command.status === "processing") {
        const lastEventAt =
          command.lastWorkerEventAt ??
          command.workerAcceptedAt ??
          command.processingStartedAt ??
          command.createdAt;
        const inactiveFor = now - lastEventAt;
        if (inactiveFor > EXPORT_INACTIVITY_TIMEOUT_MS) {
          const workerLive = this.isEngineWorkerLive(command.engineId);
          if (!workerLive) {
            throw new Error(
              "The Webpage Scraper worker disconnected before the download finished.",
            );
          }
          throw new Error(
            "The download stopped making progress. Restart the Webpage Scraper and try again.",
          );
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  getExecutionLogSnapshot(engineId: string) {
    return this.executionLogSession.getSnapshot(engineId);
  }

  clearExecutionLogSession(engineId: string) {
    this.executionLogSession.clear(engineId);
  }

  clearAllExecutionLogSessions() {
    this.executionLogSession.clearAll();
  }

  clearSessionFacingLastErrors() {
    for (const project of this.projects.list()) {
      for (const engine of this.dataSources.listByProject(project.id)) {
        const status = this.dataSources.getStatus(engine.id);
        if (status?.lastError) {
          this.dataSources.upsertStatus(engine.id, { lastError: null });
        }
        if (project.projectType === "bag-graphics") {
          this.bagLiveState.syncEngineStatus(engine.id);
        }
        this.pushEngineStatusSnapshot(engine.id);
      }
    }
  }

  recordLog(
    engineId: string,
    input: {
      level: string;
      eventType?: string | null;
      message: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const inserted = this.dataSources.insertLog(engineId, input);
    const sessionEntry = this.executionLogSession.append({
      id: String(inserted.id),
      engineId,
      level: inserted.level,
      eventType: inserted.eventType,
      message: inserted.message,
      metadata: inserted.metadata,
      createdAt: inserted.createdAt,
    });

    if (sessionEntry) {
      for (const listener of this.executionLogListeners) {
        listener(engineId, sessionEntry);
      }
    }

    this.maybeRecordActivityFromLog(engineId, inserted);

    return toPortalLog(inserted);
  }

  private maybeRecordActivityFromLog(
    engineId: string,
    log: {
      eventType?: string | null;
      message: string;
      level: string;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    const eventType = log.eventType ?? "";

    if (eventType === "scrape.failed") {
      this.recordActivity({
        type: "scraper.failed",
        message: log.message,
        source: "scraper",
        severity: "error",
        metadata: { engineId },
      });
      return;
    }

    if (
      eventType === "engine.execution" &&
      log.message.startsWith("Polling interval changed to")
    ) {
      this.recordActivity({
        type: "scraper.interval-changed",
        message: log.message,
        userAction: log.message,
        source: "scraper",
        metadata: { engineId },
      });
      return;
    }

    if (eventType === "engine.execution" && log.message === "Scraper Engine started") {
      this.recordActivity({
        type: "scraper.started",
        message: "Scraper started",
        source: "scraper",
        userAction: "Scraper started",
        metadata: { engineId },
      });
      return;
    }

    if (eventType === "engine.execution" && log.message === "Scraper Engine stopped") {
      this.recordActivity({
        type: "scraper.stopped",
        message: "Scraper stopped",
        source: "scraper",
        userAction: "Scraper stopped",
        metadata: { engineId },
      });
      return;
    }

    if (eventType === "engine.execution" && log.message === "Scraper Engine restarted") {
      this.recordActivity({
        type: "scraper.restarted",
        message: "Scraper restarted",
        source: "scraper",
        userAction: "Scraper restarted",
        metadata: { engineId },
      });
      return;
    }

  }

  recordStatus(
    engineId: string,
    patch: {
      actualState?: string;
      healthState?: string;
      workerId?: string | null;
      lastHeartbeatAt?: string | null;
      lastRunAt?: string | null;
      lastError?: string | null;
    },
  ) {
    this.dataSources.upsertStatus(engineId, {
      actualState: patch.actualState,
      healthState: patch.healthState,
      workerId: patch.workerId,
      lastHeartbeatAt: patch.lastHeartbeatAt,
      lastRunAt: patch.lastRunAt,
      lastError: patch.lastError,
    });
    if (patch.lastHeartbeatAt) {
      logHeartbeatReceivedByParent({
        engineId,
        lastHeartbeatAt: patch.lastHeartbeatAt,
        actualState: patch.actualState ?? null,
        workerId: patch.workerId ?? null,
        source: "LocalDataService.recordStatus",
      });
    }
    this.bagLiveState.syncEngineStatus(engineId);
    this.pushEngineStatusSnapshot(engineId);
  }

  recordRunSuccess(
    engineId: string,
    input: {
      actualState: string;
      startedAt: string;
    },
  ) {
    const status = this.dataSources.getStatus(engineId);
    const dayCounters = rollDailyScrapeCounters(status, "success");
    this.dataSources.upsertStatus(engineId, {
      actualState: input.actualState,
      healthState: "healthy",
      lastRunAt: input.startedAt,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
      runCount: (status?.runCount ?? 0) + 1,
      successCount: (status?.successCount ?? 0) + 1,
      ...dayCounters,
    });
    this.bagLiveState.syncEngineStatus(engineId);
    this.pushEngineStatusSnapshot(engineId);
  }

  recordRunFailure(
    engineId: string,
    input: {
      actualState?: string;
      startedAt: string;
      errorMessage: string;
    },
  ) {
    const status = this.dataSources.getStatus(engineId);
    const dayCounters = rollDailyScrapeCounters(status, "failure");
    this.dataSources.upsertStatus(engineId, {
      actualState: input.actualState ?? "error",
      healthState: "error",
      lastRunAt: input.startedAt,
      lastRunFailedAt: new Date().toISOString(),
      lastError: input.errorMessage,
      runCount: (status?.runCount ?? 0) + 1,
      failureCount: (status?.failureCount ?? 0) + 1,
      ...dayCounters,
    });
    this.bagLiveState.syncEngineStatus(engineId);
    this.pushEngineStatusSnapshot(engineId);
  }

  verifyConnected() {
    this.projects.list();
    return true;
  }

  getBagLiveState(projectId: string) {
    return this.bagLiveState.getLiveState(projectId);
  }

  ensureBagLiveState(projectId: string) {
    return this.bagLiveState.ensureLiveState(projectId);
  }

  getPrimaryBagEngineIdPublic(): string | null {
    return this.getPrimaryBagEngineId();
  }

  getPrimaryBagEngineIdForProjectPublic(projectId: string): string | null {
    return this.getPrimaryBagEngineIdForProject(projectId);
  }

  hasValidScraperSnapshot(projectId: string) {
    return this.getLatestBagSnapshotPayloadForProject(projectId) !== null;
  }

  loadOfflineAuction(
    projectId: string,
    auctionData: Record<string, unknown>,
    actor?: ActivityActor,
  ) {
    return this.bagLiveState.loadOfflineAuction(
      projectId,
      auctionData,
      actor ?? this.resolveCurrentActivityActor(),
    );
  }

  private getLatestBagSnapshotPayloadForProject(projectId: string): Record<string, unknown> | null {
    const engines = this.dataSources.listByProject(projectId);
    for (const engine of engines) {
      const snapshot = this.dataSources.getLatestSnapshot(engine.id);
      if (snapshot?.data && typeof snapshot.data === "object") {
        return snapshot.data as Record<string, unknown>;
      }
    }
    return null;
  }

  repairBagProjectAssets() {
    this.pylonDisplays.repairAllBagProjects(this.viewerBaseUrl);
    this.lowerTickerDisplays.repairAllBagProjects(this.viewerBaseUrl);
    this.newAuctionDisplays.repairAllBagProjects(this.viewerBaseUrl);
  }

  private normalizeEngineExecutionMode(engineId: string) {
    const source = this.dataSources.getById(engineId);
    if (!source) return;

    const currentMode = source.config.execution_mode;
    if (currentMode === "local-desktop") {
      return;
    }

    this.dataSources.updateConfig(engineId, {
      ...source.config,
      execution_mode: "local-desktop",
    });
    this.dataSources.insertLog(engineId, {
      level: "info",
      eventType: "engine.execution_mode_normalized",
      message:
        "Execution mode was normalized to Desktop because Remote Worker is not available yet.",
      metadata: { previousMode: currentMode ?? "missing" },
    });
  }
}

function localStatsDay(now = new Date()): string {
  return localStatsDayKey(now);
}

function rollDailyScrapeCounters(
  status: LocalSourceStatus | null,
  outcome: "success" | "failure",
): Pick<
  LocalSourceStatus,
  "scrapesToday" | "successfulToday" | "failedToday" | "statsDay"
> {
  const today = localStatsDay();
  const sameDay = status?.statsDay === today;
  const scrapesToday = (sameDay ? (status?.scrapesToday ?? 0) : 0) + 1;
  const successfulToday =
    (sameDay ? (status?.successfulToday ?? 0) : 0) + (outcome === "success" ? 1 : 0);
  const failedToday =
    (sameDay ? (status?.failedToday ?? 0) : 0) + (outcome === "failure" ? 1 : 0);

  return {
    scrapesToday,
    successfulToday,
    failedToday,
    statsDay: today,
  };
}
