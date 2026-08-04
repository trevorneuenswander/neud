import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import {
  app,
  BrowserWindow,
  dialog,
  shell,
  session,
  nativeImage,
} from "electron";
import { registerAppIpc, type CloseRequestResponse } from "./ipc/app";
import { sendToRenderer } from "./ipc/channels";
import { registerAuthIpc } from "./ipc/auth";
import { AUTH_EXPLICITLY_SIGNED_OUT_KEY } from "./auth/session-recovery-keys";
import { LOCAL_API_URL_SETTING_KEY } from "./auth/local-session-token";
import {
  DEFAULT_LOCAL_API_ORIGIN,
  normalizeLocalApiOrigin,
} from "./lib/normalize-local-api-origin";
import {
  CLOUD_SESSION_DIAGNOSTICS_KEY,
  createDefaultCloudSessionDiagnostics,
} from "./services/cloud-session-diagnostics";
import { setClearLocalSessionHandler } from "./menu/application-menu";
import { registerCredentialsIpc } from "./ipc/credentials";
import { registerEnginesIpc } from "./ipc/engines";
import { registerLocalDataIpc } from "./ipc/local-data";
import { registerActivityIpc } from "./ipc/activity";
import { registerDisplayDataSourceIpc } from "./ipc/display-data-source";
import { registerDisplaysIpc, shutdownDisplayPreviewWindows } from "./ipc/displays";
import { registerOfflineAuctionIpc } from "./ipc/offline-auction";
import {
  closeLocalDatabase,
  openLocalDatabase,
  type LocalDatabase,
} from "./database/connection";
import { ActivityEventsRepository } from "./repositories/activity-events-repository";
import { AppSettingsRepository } from "./repositories/app-settings-repository";
import { DataSourcesRepository } from "./repositories/data-sources-repository";
import { DisplaysRepository } from "./repositories/displays-repository";
import { UserDisplayOrderRepository } from "./repositories/user-display-order-repository";
import { ProjectsRepository } from "./repositories/projects-repository";
import { getAppPaths } from "./services/app-paths";
import { AuctionDatasetService } from "./services/auction-dataset-service";
import { AuthLicenseManager } from "./services/auth-license-manager";
import { CredentialStore } from "./services/credential-store";
import { loadSupabasePublicConfig } from "./services/supabase-public-config";
import { SupabaseUserSessionService } from "./services/supabase-user-session";
import { AuthenticatedCloudCoordinator } from "./services/authenticated-cloud-coordinator";
import { SHARED_CLOUD_AUTH_DIAGNOSTICS_KEY } from "./services/shared-cloud-auth-diagnostics";
import { upsertDesktopHost } from "./services/desktop-cloud-client";
import { DesktopAdminApiClient } from "./services/desktop-admin-api-client";
import { DesktopTrustedAccessApiClient } from "./services/desktop-trusted-access-api-client";
import { resolveTrustedPortalOrigin } from "./services/trusted-portal-origin";
import { PylonDisplayService } from "./services/pylon-display-service";
import { LowerTickerDisplayService } from "./services/lower-ticker-display-service";
import { NewAuctionDisplaysService } from "./services/new-auction-displays-service";
import { BagSourceService } from "./services/bag-source-service";
import { BagProjectRepairService } from "./services/bag-project-repair-service";
import { BroadArrowPhaseBootstrapService } from "./services/broad-arrow-phase-bootstrap-service";
import { BagLiveStateEvents } from "./bag/live-state/bag-live-state-events";
import { BagLiveStateRepository } from "./bag/live-state/bag-live-state-repository";
import { BagLiveStateService } from "./bag/live-state/bag-live-state-service";
import { BagManualEventsRepository } from "./bag/live-state/bag-manual-events-repository";
import { GenericScraperService } from "./services/generic-scraper-service";
import { ProjectDeletionService } from "./services/project-deletion-service";
import { EngineManager } from "./services/engine-manager";
import { ImportService } from "./import/import-service";
import { LocalApiServer } from "./services/local-api-server";
import { LocalAuthBootstrapService } from "./services/local-auth-bootstrap-service";
import { LocalDataService } from "./services/local-data-service";
import { repairHistoricalActivityDescriptions } from "./services/activity-description-repair";
import { closeDisplayPreviewWindow } from "./services/display-preview-window-manager";
import { LocalProjectMembershipsRepository } from "./repositories/local-project-memberships-repository";
import { LocalUsersRepository } from "./repositories/local-users-repository";
import { LocalInvitationsRepository } from "./repositories/local-invitations-repository";
import { TeamsRepository } from "./repositories/teams-repository";
import { TeamMembershipsRepository } from "./repositories/team-memberships-repository";
import { ProjectMembershipsRepository } from "./repositories/project-memberships-repository";
import { ProjectTeamAssignmentsRepository } from "./repositories/project-team-assignments-repository";
import { AccessAuthorizationService } from "./services/access-authorization-service";
import { CloudPhotoAssetService } from "./services/cloud-photo-asset-service";
import { ProjectPhotoUploadRepository } from "./repositories/project-photo-upload-repository";
import { CloudAccessCacheRepository } from "./repositories/cloud-access-cache-repository";
import { CloudAccessBridge } from "./services/cloud-access-bridge";
import { AccessManagementService } from "./services/access-management-service";
import { runAccessDataMigration } from "./services/access-data-migration";
import { runDefaultOwnerEmailMigration } from "./services/default-owner-email-migration";
import { runOwnerIdentitySyncMigration } from "./services/owner-identity-sync-migration";
import { runUsersAccessDirectoryRepairMigration } from "./services/users-access-directory-repair-migration";
import { SupabaseUserDirectorySyncService } from "./services/supabase-user-directory-sync/supabase-user-directory-sync-service";
import { SupabaseIdentityService } from "./services/supabase-identity-service";
import { extractSupabaseProjectRef } from "./services/supabase-project-ref";
import {
  logIdentityReconciliation,
  reconcileAuthenticatedUser,
} from "./services/user-identity-reconciliation-service";
import { runMultiTeamDataMigration } from "./services/multi-team-data-migration";
import { ProjectScraperCodeRepository } from "./repositories/project-scraper-code-repository";
import { ProjectDisplayCodeRepository } from "./repositories/project-display-code-repository";
import {
  ProjectCodeRevisionsRepository,
  ProjectValidationLogsRepository,
} from "./repositories/project-code-revisions-repository";
import { ProjectCodeStorageService } from "./services/project-code-storage-service";
import {
  DeveloperToolsService,
  ProjectCodeMigrationService,
} from "./services/developer-tools-service";
import { OfflineAuctionExportService } from "./services/offline-auction-export-service";
import { CurrencyRateService } from "./services/currency-rate-service";
import { registerCurrencyRatesIpc } from "./ipc/currency-rates";
import { MachineRegistration } from "./services/machine-registration";
import {
  ProcessManager,
} from "./services/process-manager";
import {
  getDevServerUrl,
  isDevMode,
  NextServerService,
} from "./services/next-server";
import {
  clearSavedStartupPath,
  DESKTOP_FALLBACK_LANDING_PATH,
  joinRendererUrl,
  persistStartupPath,
  readSavedStartupPath,
  resolveDesktopStartupPath,
  resolveVerifiedProjectStartupPath,
} from "./services/startup-route";
import { ActivitySyncService } from "./services/activity-sync/activity-sync-service";
import { DisplaySyncQueueRepository } from "./repositories/display-sync-queue-repository";
import { DisplayDeletionTombstonesRepository } from "./repositories/display-deletion-tombstones-repository";
import { DisplaySyncService } from "./services/display-sync/display-sync-service";
import { PublishingManager } from "./services/publishing/publishing-manager";
import { BroadArrowUploadedDisplaysImportService } from "./services/broad-arrow-uploaded-displays-import-service";
import { BroadArrowLegacyDisplaysImportService } from "./services/broad-arrow-legacy-displays-import-service";
import { BroadArrowStreamDisplaysImportService } from "./services/broad-arrow-stream-displays-import-service";
import { configureUserDataPath } from "./services/user-data-migration";
import { migrateLegacyAppSettings } from "./services/legacy-settings-migration";
import { syncElectronReleaseVersion } from "./app/release-version";

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });
configureUserDataPath();

import { isAllowedExternalUrl } from "./services/external-url";

let mainWindow: BrowserWindow | null = null;
let localDataService: LocalDataService | null = null;
let activitySyncService: import("./services/activity-sync/activity-sync-service").ActivitySyncService | null =
  null;
let displaySyncService: DisplaySyncService | null = null;
let publishingManager: PublishingManager | null = null;
let userDirectorySyncService: SupabaseUserDirectorySyncService | null = null;
let offlineAuctionExportService: OfflineAuctionExportService | null = null;
let currencyRateService: CurrencyRateService | null = null;
let auctionDatasetService: AuctionDatasetService | null = null;
let engineManager: EngineManager | null = null;
let nextServer: NextServerService | null = null;
let localApiServer: LocalApiServer | null = null;
let localDatabase: LocalDatabase | null = null;
let processManager: ProcessManager | null = null;
let isQuitting = false;
let forceCloseConfirmed = false;
let shutdownInProgress = false;

let closePromptResolver: ((action: CloseRequestResponse) => void) | null = null;
let closePromptPending = false;

const SHUTDOWN_ENGINE_GRACEFUL_MS = 10000;
const SHUTDOWN_ENGINE_FORCE_MS = 5000;
const SHUTDOWN_RESOURCE_MS = 8000;

async function cancelActiveExportsForShutdown() {
  offlineAuctionExportService?.cancelActiveExportForShutdown();
  localDataService?.cancelPendingExportsForShutdown();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(startApplication).catch(handleStartupFailure);
}

app.on("before-quit", async (event) => {
  if (isQuitting) return;

  if (!forceCloseConfirmed && shouldBlockAppClose()) {
    event.preventDefault();
    const action = await promptExitConfirmation();
    if (action === "cancel") return;
    forceCloseConfirmed = action === "confirm" || action === "force";
    if (!forceCloseConfirmed) return;
  }

  if (shutdownInProgress) return;

  event.preventDefault();
  isQuitting = true;
  const shutdownOk = await performGracefulShutdown();
  if (!shutdownOk && !forceCloseConfirmed) {
    forceCloseConfirmed = true;
    if (processManager) {
      await processManager.stopAll(0);
    }
  }
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

async function startApplication() {
  const releaseVersion = syncElectronReleaseVersion();
  console.info(`[desktop] Release version ${releaseVersion}`);
  await createMainWindow();
}

async function handleStartupFailure(error: unknown) {
  const message = formatStartupError(error);
  console.error("[desktop] Failed to start:", error);
  await cleanupStartupResources();
  dialog.showErrorBox("NEUD failed to start", message);
  app.exit(1);
}

async function cleanupStartupResources() {
  await publishingManager?.stop();
  publishingManager = null;
  displaySyncService?.stop();
  displaySyncService = null;
  activitySyncService?.stop();
  activitySyncService = null;
  await cancelActiveExportsForShutdown();
  await engineManager?.stopAllForApplicationExit();
  await localApiServer?.stop();
  await nextServer?.stop();
  await processManager?.stopAll(SHUTDOWN_ENGINE_FORCE_MS);
  closeLocalDatabase(localDatabase);
  localDatabase = null;
  localDataService = null;
  engineManager = null;
  localApiServer = null;
  nextServer = null;
  processManager = null;
  offlineAuctionExportService = null;
}

function shouldBlockAppClose(): boolean {
  if (forceCloseConfirmed || shutdownInProgress) {
    return false;
  }
  return engineManager?.isScraperSessionActive() ?? false;
}

async function promptExitConfirmation(
  options: { shutdownFailed?: boolean } = {},
): Promise<CloseRequestResponse> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return "cancel";
  }
  if (closePromptPending) {
    return "cancel";
  }

  closePromptPending = true;
  const action = await new Promise<CloseRequestResponse>((resolve) => {
    closePromptResolver = resolve;
    sendToRenderer(mainWindow!, "neud:app:closeRequested", {
      shutdownFailed: options.shutdownFailed === true,
    });
  });
  closePromptPending = false;
  closePromptResolver = null;

  if (action === "cancel") {
    localDataService?.recordActivity({
      type: "app.exit-canceled",
      message: "App exit canceled",
      source: "system",
    });
    return "cancel";
  }

  localDataService?.recordActivity({
    type: "app.exit-confirmed",
    message: "App exit confirmed",
    userAction: "App exit confirmed",
    source: "system",
  });
  return action;
}

function handleCloseRequestResponse(action: CloseRequestResponse) {
  closePromptResolver?.(action);
}

async function performGracefulShutdown(): Promise<boolean> {
  if (shutdownInProgress) return true;
  shutdownInProgress = true;
  shutdownDisplayPreviewWindows();

  try {
    await cancelActiveExportsForShutdown();

    if (engineManager) {
      await engineManager.stopAllForApplicationExit();
    }

    await Promise.race([
      Promise.all([
        localApiServer?.stop(),
        nextServer?.stop(),
      ]),
      new Promise<void>((resolve) => {
        setTimeout(resolve, SHUTDOWN_RESOURCE_MS);
      }),
    ]);

    await publishingManager?.stop();
    publishingManager = null;
    displaySyncService?.stop();
    displaySyncService = null;

    activitySyncService?.stop();
    activitySyncService = null;

    if (processManager) {
      await processManager.stopAll(SHUTDOWN_ENGINE_FORCE_MS);
    }

    closeLocalDatabase(localDatabase);
    localDatabase = null;
    localDataService = null;
    engineManager = null;
    localApiServer = null;
    nextServer = null;
    processManager = null;
    offlineAuctionExportService = null;

    return true;
  } catch (error) {
    console.error("[desktop] Graceful shutdown failed:", error);
    if (processManager) {
      await processManager.stopAll(0);
    }
    return false;
  } finally {
    shutdownInProgress = false;
  }
}

function attachMainWindowCloseHandler() {
  if (!mainWindow) return;

  mainWindow.on("close", async (event) => {
    if (isQuitting || forceCloseConfirmed) return;

    if (!shouldBlockAppClose()) return;

    event.preventDefault();
    const action = await promptExitConfirmation();
    if (action === "cancel") return;

    if (action === "force") {
      forceCloseConfirmed = true;
      isQuitting = true;
      mainWindow?.destroy();
      app.quit();
      return;
    }

    isQuitting = true;
    const shutdownOk = await performGracefulShutdown();
    if (!shutdownOk && mainWindow && !mainWindow.isDestroyed()) {
      isQuitting = false;
      const retryAction = await promptExitConfirmation({ shutdownFailed: true });
      if (retryAction === "cancel") return;
      forceCloseConfirmed = true;
      isQuitting = true;
      if (retryAction === "force" && processManager) {
        await processManager.stopAll(0);
      }
    } else {
      forceCloseConfirmed = true;
    }

    mainWindow?.destroy();
    app.quit();
  });
}

function formatStartupError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function resolveDesktopApplicationIcon() {
  const assetRoots = [
    path.join(__dirname, "..", "assets"),
    path.join(app.getAppPath(), "assets"),
  ];

  for (const assetRoot of assetRoots) {
    for (const fileName of ["icon.ico", "icon.png"]) {
      const iconPath = path.join(assetRoot, fileName);
      if (fs.existsSync(iconPath)) {
        const image = nativeImage.createFromPath(iconPath);
        return image.isEmpty() ? undefined : image;
      }
    }
  }

  return undefined;
}

async function createMainWindow() {
  const paths = getAppPaths();
  processManager = new ProcessManager();
  nextServer = new NextServerService(paths, processManager);
  localDatabase = await openLocalDatabase(paths);
  migrateLegacyAppSettings(localDatabase);

  const projectsRepository = new ProjectsRepository(localDatabase);
  const dataSourcesRepository = new DataSourcesRepository(localDatabase);
  const appSettingsRepository = new AppSettingsRepository(localDatabase);
  runDefaultOwnerEmailMigration({
    db: localDatabase,
    settings: appSettingsRepository,
  });
  const activityEventsRepository = new ActivityEventsRepository(localDatabase);
  const localProjectMembershipsRepository = new LocalProjectMembershipsRepository(
    localDatabase,
  );
  const localUsersRepository = new LocalUsersRepository(localDatabase);
  const teamsRepository = new TeamsRepository(localDatabase);
  const teamMembershipsRepository = new TeamMembershipsRepository(localDatabase);
  const projectMembershipsRepository = new ProjectMembershipsRepository(localDatabase);
  const projectTeamAssignmentsRepository = new ProjectTeamAssignmentsRepository(localDatabase);
  const localInvitationsRepository = new LocalInvitationsRepository(localDatabase);

  const credentials = new CredentialStore(paths);
  const host = new MachineRegistration(paths);
  registerAppIpc(host, () => mainWindow, handleCloseRequestResponse);

  const authLicenseManager = new AuthLicenseManager(
    paths,
    localDatabase,
    host.touch().id,
  );
  const supabaseUserSessionService = new SupabaseUserSessionService(paths);
  const supabasePublicConfig = loadSupabasePublicConfig(paths);
  const authenticatedCloud = new AuthenticatedCloudCoordinator(
    supabaseUserSessionService,
    supabasePublicConfig,
  );

  authenticatedCloud.attachSharedDiagnosticsWriter((diagnostics) => {
    appSettingsRepository.set(SHARED_CLOUD_AUTH_DIAGNOSTICS_KEY, diagnostics);
  });

  let reconcileIdentityOnSession: (() => void) | null = null;
  let clearIdentityOnSession: (() => void) | null = null;
  let startUserDirectorySync: (() => void) | null = null;
  let stopUserDirectorySync: (() => void) | null = null;

  let forceSignOutFromMain: (() => Promise<{ ok: boolean }>) | null = null;

  registerAuthIpc(authLicenseManager, {
    userSession: supabaseUserSessionService,
    settings: appSettingsRepository,
    onSessionStored: ({ startReason }) => {
      appSettingsRepository.set(AUTH_EXPLICITLY_SIGNED_OUT_KEY, false);
      reconcileIdentityOnSession?.();
      startUserDirectorySync?.();

      const authSnapshot = authenticatedCloud.getAuthSnapshot();
      const hasCloudSession = authSnapshot.authenticatedCloudSessionAvailable;
      const lifecycle = supabaseUserSessionService.getSessionLifecycleDiagnostics();
      const existingDiagnostics =
        appSettingsRepository.get(CLOUD_SESSION_DIAGNOSTICS_KEY, null) ??
        createDefaultCloudSessionDiagnostics();

      appSettingsRepository.set(CLOUD_SESSION_DIAGNOSTICS_KEY, {
        ...existingDiagnostics,
        coordinatorReceivedSession: true,
        cloudServicesStartRequested: hasCloudSession,
        publishingManagerStartRequested: hasCloudSession,
        lastPublishingManagerStartReason: hasCloudSession ? startReason : null,
        lastSessionStoreAt: lifecycle.lastSessionStoreAt ?? existingDiagnostics.lastSessionStoreAt,
        lastSessionRestoreAt:
          lifecycle.lastSessionRestoreAt ?? existingDiagnostics.lastSessionRestoreAt,
        lastSessionErrorCode: hasCloudSession
          ? null
          : (lifecycle.lastSessionErrorCode ?? "cloud_session_unavailable"),
        updatedAt: new Date().toISOString(),
      });

      authenticatedCloud.notifySessionStored(startReason);
      displaySyncService?.updateRuntimeContext({
        publicCloudConfigAvailable: Boolean(supabasePublicConfig),
        authenticatedSessionAvailable: authSnapshot.authenticatedCloudSessionAvailable,
        lastUnavailableReason: authSnapshot.authenticatedCloudSessionAvailable
          ? null
          : "missing_authenticated_client",
      });

      void displaySyncService?.requestSync("login");
      void localDataService?.refreshIdentity("login");
      void activitySyncService?.syncNow("login");
      void userDirectorySyncService?.syncNow("login");
      void localDataService?.getCloudAccessDirectory({ forceRefresh: true });
      publishingManager?.ensureStarted(startReason);
    },
    onSessionCleared: () => {
      appSettingsRepository.set(AUTH_EXPLICITLY_SIGNED_OUT_KEY, true);
      authenticatedCloud.notifySessionCleared();
      localDataService?.resetIdentity();
      clearIdentityOnSession?.();
      stopUserDirectorySync?.();
    },
    forceSignOut: async () => {
      if (forceSignOutFromMain) {
        return forceSignOutFromMain();
      }
      console.info("[logout] Main process fallback force sign-out");
      appSettingsRepository.set(AUTH_EXPLICITLY_SIGNED_OUT_KEY, true);
      authLicenseManager.clear();
      localDataService?.resetIdentity();
      clearIdentityOnSession?.();
      stopUserDirectorySync?.();
      return { ok: true };
    },
  });

  const localAuthBootstrap = new LocalAuthBootstrapService(
    appSettingsRepository,
    projectsRepository,
    localProjectMembershipsRepository,
    authLicenseManager,
    paths,
    host.touch().id,
  );
  localAuthBootstrap.ensure();

  runMultiTeamDataMigration(localDatabase);

  runAccessDataMigration({
    db: localDatabase,
    auth: authLicenseManager,
    users: localUsersRepository,
    teams: teamsRepository,
    teamMemberships: teamMembershipsRepository,
    projectMemberships: projectMembershipsRepository,
    projects: projectsRepository,
    legacyMemberships: localProjectMembershipsRepository,
    projectTeams: projectTeamAssignmentsRepository,
  });

  runOwnerIdentitySyncMigration({
    db: localDatabase,
    auth: authLicenseManager,
    users: localUsersRepository,
    teams: teamsRepository,
    teamMemberships: teamMembershipsRepository,
  });

  runUsersAccessDirectoryRepairMigration({
    db: localDatabase,
    auth: authLicenseManager,
    users: localUsersRepository,
    teams: teamsRepository,
    teamMemberships: teamMembershipsRepository,
  });

  repairHistoricalActivityDescriptions({
    activityEvents: activityEventsRepository,
    settings: appSettingsRepository,
  });

  const accessAuthorizationService = new AccessAuthorizationService(
    authLicenseManager,
    localUsersRepository,
    teamsRepository,
    teamMembershipsRepository,
    projectMembershipsRepository,
    projectTeamAssignmentsRepository,
    projectsRepository,
    dataSourcesRepository,
  );

  const bagSourceService = new BagSourceService(
    dataSourcesRepository,
    projectsRepository,
  );
  const bagProjectRepairService = new BagProjectRepairService(
    projectsRepository,
    dataSourcesRepository,
    bagSourceService,
    credentials,
    appSettingsRepository,
  );
  const bagLiveStateRepository = new BagLiveStateRepository(localDatabase);
  const bagManualEventsRepository = new BagManualEventsRepository(localDatabase);
  const bagLiveStateEvents = new BagLiveStateEvents();
  const bagLiveStateService = new BagLiveStateService(
    projectsRepository,
    dataSourcesRepository,
    bagLiveStateRepository,
    bagLiveStateEvents,
    bagManualEventsRepository,
  );
  auctionDatasetService = new AuctionDatasetService(appSettingsRepository, projectsRepository);
  const displaysRepository = new DisplaysRepository(localDatabase);
  const userDisplayOrderRepository = new UserDisplayOrderRepository(localDatabase);
  const pylonDisplayService = new PylonDisplayService(
    projectsRepository,
    displaysRepository,
    appSettingsRepository,
  );
  const lowerTickerDisplayService = new LowerTickerDisplayService(
    projectsRepository,
    displaysRepository,
    appSettingsRepository,
  );
  const newAuctionDisplaysService = new NewAuctionDisplaysService(
    projectsRepository,
    displaysRepository,
    appSettingsRepository,
  );
  const genericScraperService = new GenericScraperService(
    dataSourcesRepository,
    projectsRepository,
  );
  const projectDeletionService = new ProjectDeletionService(
    projectsRepository,
    dataSourcesRepository,
    credentials,
    paths,
    authLicenseManager,
    bagLiveStateEvents,
  );
  const broadArrowPhaseBootstrapService = new BroadArrowPhaseBootstrapService(
    projectsRepository,
    dataSourcesRepository,
    bagSourceService,
    appSettingsRepository,
    credentials,
    projectDeletionService,
  );

  localDataService = new LocalDataService(
    projectsRepository,
    dataSourcesRepository,
    displaysRepository,
    appSettingsRepository,
    bagSourceService,
    genericScraperService,
    pylonDisplayService,
    lowerTickerDisplayService,
    newAuctionDisplaysService,
    bagLiveStateService,
    paths,
    authLicenseManager,
    localProjectMembershipsRepository,
    projectDeletionService,
    bagProjectRepairService,
    broadArrowPhaseBootstrapService,
    credentials,
    activityEventsRepository,
    userDisplayOrderRepository,
  );
  localDataService.setAccessAuthorization(accessAuthorizationService);

  const projectPhotoUploadRepository = new ProjectPhotoUploadRepository(localDatabase);
  const cloudPhotoAssetService = new CloudPhotoAssetService(
    projectPhotoUploadRepository,
    () => authenticatedCloud.getClient(),
  );
  localDataService.setCloudPhotoAssetService(cloudPhotoAssetService);

  const cloudAccessBridge = new CloudAccessBridge(authenticatedCloud);
  localDataService.setCloudAccessBridge(cloudAccessBridge);
  localDataService.setCloudAccessCache(new CloudAccessCacheRepository(localDatabase));

  if (!supabasePublicConfig) {
    console.warn(
      "[desktop] Supabase public configuration missing — cloud sync disabled until configured.",
    );
  }

  activitySyncService = new ActivitySyncService(
    authenticatedCloud,
    appSettingsRepository,
    activityEventsRepository,
    localDataService.getActivitySessionStore(),
    authLicenseManager,
    accessAuthorizationService,
    projectsRepository,
    () => localDataService!.notifyActivitySyncChanged(),
  );
  localDataService.setActivitySync(activitySyncService);

  userDirectorySyncService = new SupabaseUserDirectorySyncService(
    authenticatedCloud,
    appSettingsRepository,
    localUsersRepository,
    teamsRepository,
    teamMembershipsRepository,
    authLicenseManager,
  );
  localDataService.setUserDirectorySync({
    service: userDirectorySyncService,
    cloud: authenticatedCloud,
  });

  const restorePersistedCloudSessionEarly = async () => {
    if (!authLicenseManager.isAccessAllowed()) {
      return;
    }
    if (!supabasePublicConfig) {
      return;
    }
    if (!authenticatedCloud.hasCloudSession()) {
      return;
    }
    await authenticatedCloud.restorePersistedSession();
  };

  const cloudSessionRestorePromise = restorePersistedCloudSessionEarly().catch(() => undefined);
  authenticatedCloud.setSessionRestorePromise(
    cloudSessionRestorePromise.then(() => undefined),
  );

  await Promise.race([
    cloudSessionRestorePromise,
    new Promise<void>((resolve) => {
      setTimeout(resolve, 10_000);
    }),
  ]);

  const supabaseIdentityService = new SupabaseIdentityService(
    authenticatedCloud,
    supabasePublicConfig,
    authLicenseManager,
    localUsersRepository,
    accessAuthorizationService,
    localDatabase!,
    teamsRepository,
    teamMembershipsRepository,
  );
  localDataService.setSupabaseIdentity(supabaseIdentityService);

  if (process.env.NODE_ENV !== "production" && supabasePublicConfig) {
    console.info(
      `[identity-resolution] Configured Supabase project reference: ${extractSupabaseProjectRef(supabasePublicConfig.supabaseUrl) ?? "unknown"}`,
    );
  }

  const startCloudSyncServices = (reason = "cloud-session") => {
    if (!authLicenseManager.isAccessAllowed()) {
      return;
    }
    activitySyncService?.start();
    displaySyncService?.start();
    userDirectorySyncService?.start();
    if (authenticatedCloud.hasCloudSession() || authenticatedCloud.hasPersistedTokens()) {
      publishingManager?.ensureStarted(reason);
      void localDataService?.retryPendingPhotoUploads();
    }
  };

  const stopCloudSyncServices = (reason = "cloud-session-cleared") => {
    void activitySyncService?.stop();
    displaySyncService?.stop();
    void publishingManager?.stop(reason);
    userDirectorySyncService?.stop();
  };

  startUserDirectorySync = () => {
    userDirectorySyncService?.start();
  };
  stopUserDirectorySync = () => {
    userDirectorySyncService?.stop();
  };

  authenticatedCloud.onSessionStored((reason) => {
    startCloudSyncServices(reason);
  });
  authenticatedCloud.onSessionCleared(() => {
    stopCloudSyncServices();
  });

  authenticatedCloud.onReauthenticationRequired(() => {
    stopCloudSyncServices("invalid_refresh_token");
    displaySyncService?.markServiceUnavailable("invalid_refresh_token");
    displaySyncService?.updateRuntimeContext({
      authenticatedSessionAvailable: false,
      lastUnavailableReason: "invalid_refresh_token",
    });
  });

  reconcileIdentityOnSession = () => {
    const result = reconcileAuthenticatedUser({
      db: localDatabase!,
      auth: authLicenseManager,
      users: localUsersRepository,
      teams: teamsRepository,
      teamMemberships: teamMembershipsRepository,
    });
    logIdentityReconciliation(result);
  };

  clearIdentityOnSession = () => {
    localAuthBootstrap.getSessionTokenService().clearSessionBinding();
  };

  reconcileIdentityOnSession();

  const importService = new ImportService(
    paths,
    localDatabase,
    projectsRepository,
    dataSourcesRepository,
    authLicenseManager,
    bagSourceService,
    authenticatedCloud,
  );

  localApiServer = new LocalApiServer(
    paths,
    localDataService,
    authLicenseManager,
    localAuthBootstrap.getSessionTokenService(),
    importService,
    bagLiveStateService,
    bagLiveStateEvents,
  );
  const localApiInfo = await localApiServer.start();
  const canonicalLocalApiOrigin =
    normalizeLocalApiOrigin(localApiInfo.baseUrl) ?? DEFAULT_LOCAL_API_ORIGIN;
  const storedLocalApiOrigin = appSettingsRepository.get<string | null>(
    LOCAL_API_URL_SETTING_KEY,
    null,
  );
  if (storedLocalApiOrigin !== canonicalLocalApiOrigin) {
    appSettingsRepository.set(LOCAL_API_URL_SETTING_KEY, canonicalLocalApiOrigin);
  }
  localAuthBootstrap.publishSessionConfig(canonicalLocalApiOrigin);
  localDataService.setLocalApiBaseUrl(canonicalLocalApiOrigin);
  offlineAuctionExportService = new OfflineAuctionExportService(
    paths,
    projectsRepository,
    dataSourcesRepository,
    credentials,
    canonicalLocalApiOrigin,
  );
  currencyRateService = new CurrencyRateService(paths);
  localDataService.attachOfflineAuctionService(offlineAuctionExportService);
  localDataService.onExportWorkerEvent((payload) => {
    offlineAuctionExportService!.handleWorkerEvent(payload);
  });
  localDataService.attachAuctionDatasetService(auctionDatasetService);
  localDataService.initializeSessionDiagnostics();
  localDataService.restoreAuctionDatasets();
  bagLiveStateService.setAuctionDatasetService(auctionDatasetService);
  bagLiveStateService.setCurrencyRateService(currencyRateService);
  bagLiveStateService.recoverAllProjects();
  const bootstrapResult = localDataService.ensureBroadArrowDevelopmentPhase();
  console.info(
    `[desktop] Broad Arrow phase bootstrap bootstrapped=${bootstrapResult.bootstrapped} repaired=${bootstrapResult.repaired} projectsDeleted=${bootstrapResult.deletedProjectCount} slug=${bootstrapResult.projectSlug}`,
  );
  registerLocalDataIpc({
    data: localDataService,
    localApi: localApiServer,
    auth: authLicenseManager,
    getSessionConfig: () => {
      try {
        const configPath = localAuthBootstrap
          .getSessionTokenService()
          .getSessionConfigPath();
        const raw = fs.readFileSync(configPath, "utf8");
        const parsed = JSON.parse(raw) as {
          baseUrl?: string;
          sessionToken?: string;
          userId?: string;
          updatedAt?: string;
        };
        if (
          typeof parsed.baseUrl === "string" &&
          typeof parsed.sessionToken === "string" &&
          parsed.sessionToken.trim()
        ) {
          return {
            baseUrl:
              normalizeLocalApiOrigin(parsed.baseUrl) ??
              parsed.baseUrl.replace(/\/$/, ""),
            sessionToken: parsed.sessionToken.trim(),
            userId: typeof parsed.userId === "string" ? parsed.userId : "",
            updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
          };
        }
      } catch {
        // session config unavailable
      }
      return null;
    },
  });
  registerActivityIpc(localDataService);
  registerDisplayDataSourceIpc(localDataService);
  registerDisplaysIpc({
    data: localDataService,
    auth: authLicenseManager,
  });
  registerOfflineAuctionIpc({
    data: localDataService,
    offlineAuction: offlineAuctionExportService,
    auctionDataset: auctionDatasetService,
  });

  engineManager = new EngineManager(
    paths,
    processManager,
    credentials,
    host,
    localDataService,
    bagSourceService,
    genericScraperService,
    canonicalLocalApiOrigin,
  );
  offlineAuctionExportService?.attachEngineManager(engineManager);
  projectDeletionService.setEngineManager(engineManager);
  localDataService.setEngineManager(engineManager);
  registerEnginesIpc(engineManager);

  const projectScraperCodeRepository = new ProjectScraperCodeRepository(localDatabase);
  const projectDisplayCodeRepository = new ProjectDisplayCodeRepository(localDatabase);
  localDataService.setProjectDisplayCodeRepository(projectDisplayCodeRepository);
  const projectCodeRevisionsRepository = new ProjectCodeRevisionsRepository(localDatabase);
  const projectValidationLogsRepository = new ProjectValidationLogsRepository(localDatabase);
  const projectCodeStorageService = new ProjectCodeStorageService(paths);
  const displaySyncQueueRepository = new DisplaySyncQueueRepository(localDatabase);
  const displayDeletionTombstonesRepository = new DisplayDeletionTombstonesRepository(
    localDatabase,
  );
  displaySyncService = new DisplaySyncService(
    authenticatedCloud,
    appSettingsRepository,
    projectsRepository,
    displaysRepository,
    projectDisplayCodeRepository,
    projectCodeRevisionsRepository,
    projectCodeStorageService,
    displaySyncQueueRepository,
    displayDeletionTombstonesRepository,
    authLicenseManager,
    () => {
      void localDataService!.notifyActivitySyncChanged();
    },
    (input) => {
      localDataService!.recordActivity({
        type: input.type,
        message: input.message,
        source: "displays",
        metadata: {
          projectId: input.projectId,
          displayId: input.displayId,
          displayName: input.displayName,
          ...(input.metadata ?? {}),
        },
      });
    },
  );
  publishingManager = new PublishingManager(
    authenticatedCloud,
    supabasePublicConfig,
    appSettingsRepository,
    projectsRepository,
    authLicenseManager,
    accessAuthorizationService,
    localDataService,
  );
  localDataService.setPublishingManager(publishingManager);
  localDataService.setDisplaySync(displaySyncService);

  const bootstrapRestoredCloudSession = async () => {
    const authSnapshot = authenticatedCloud.getAuthSnapshot();
    displaySyncService?.updateRuntimeContext({
      publicCloudConfigAvailable: Boolean(supabasePublicConfig),
      authenticatedSessionAvailable: authSnapshot.authenticatedCloudSessionAvailable,
    });

    if (!authLicenseManager.isAccessAllowed()) {
      displaySyncService?.markServiceUnavailable("auth_required");
      if (process.env.NODE_ENV !== "production") {
        console.debug("[CloudCoordinator] session_restore", {
          ok: false,
          errorCode: "auth_required",
        });
      }
      return;
    }

    await localDataService!.performStartupAuthValidation();

    if (!supabasePublicConfig) {
      displaySyncService?.markServiceUnavailable("missing_cloud_config");
      return;
    }

    const restore = await authenticatedCloud.restorePersistedSession();
    const postRestoreAuth = authenticatedCloud.getAuthSnapshot();
    const lifecycle = supabaseUserSessionService.getSessionLifecycleDiagnostics();
    const existingDiagnostics =
      appSettingsRepository.get(CLOUD_SESSION_DIAGNOSTICS_KEY, null) ??
      createDefaultCloudSessionDiagnostics();

    appSettingsRepository.set(CLOUD_SESSION_DIAGNOSTICS_KEY, {
      ...existingDiagnostics,
      persistedSessionDecryptable: supabaseUserSessionService.getPersistedSessionProbe()
        .sessionDecryptable,
      lastSessionRestoreAt: lifecycle.lastSessionRestoreAt ?? new Date().toISOString(),
      lastSessionErrorCode: postRestoreAuth.authenticatedCloudSessionAvailable
        ? null
        : (restore.errorCode ?? lifecycle.lastSessionErrorCode),
      coordinatorReceivedSession: postRestoreAuth.authenticatedCloudSessionAvailable,
      cloudServicesStartRequested: postRestoreAuth.authenticatedCloudSessionAvailable,
      publishingManagerStartRequested: postRestoreAuth.authenticatedCloudSessionAvailable,
      lastPublishingManagerStartReason: postRestoreAuth.authenticatedCloudSessionAvailable
        ? "startup_restore"
        : null,
      updatedAt: new Date().toISOString(),
    });

    displaySyncService?.updateRuntimeContext({
      publicCloudConfigAvailable: true,
      authenticatedSessionAvailable: postRestoreAuth.authenticatedCloudSessionAvailable,
      lastUnavailableReason: postRestoreAuth.authenticatedCloudSessionAvailable
        ? null
        : (restore.errorCode ?? "missing_authenticated_client"),
    });

    if (!postRestoreAuth.authenticatedCloudSessionAvailable) {
      displaySyncService?.markServiceUnavailable(
        restore.errorCode ?? "missing_authenticated_client",
      );
      if (postRestoreAuth.hasRestorableCloudSession) {
        startCloudSyncServices("startup_restore");
      }
      return;
    }

    startCloudSyncServices("startup_restore");
    startUserDirectorySync();
    void activitySyncService?.syncNow("startup-restore");
    void displaySyncService?.syncNow("startup-restore");
  };

  void bootstrapRestoredCloudSession().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[CloudCoordinator] session_restore failed:", message);
    displaySyncService?.markServiceUnavailable("session_restore_failed");
  });

  bagLiveStateEvents.on("update", (event) => {
    if (localDataService?.getDisplayDataSource() !== "webpage-scraper") {
      return;
    }
    localDataService.observeScraperCanonicalUpdate(event.projectId);
  });
  const projectCodeMigrationService = new ProjectCodeMigrationService(
    appSettingsRepository,
    projectsRepository,
    displaysRepository,
    projectDisplayCodeRepository,
    projectScraperCodeRepository,
    projectCodeRevisionsRepository,
    projectCodeStorageService,
    paths.repoRoot,
  );
  const activityRecorder = localDataService;
  const recordDeveloperToolsActivity = activityRecorder
    ? (input: { type: string; message: string; metadata?: Record<string, unknown> }) => {
        activityRecorder.recordActivity(input);
      }
    : null;
  const developerToolsService = new DeveloperToolsService(
    projectsRepository,
    displaysRepository,
    projectScraperCodeRepository,
    projectDisplayCodeRepository,
    projectCodeRevisionsRepository,
    projectValidationLogsRepository,
    projectCodeStorageService,
    projectCodeMigrationService,
    authLicenseManager,
    localProjectMembershipsRepository,
    dataSourcesRepository,
    engineManager,
    recordDeveloperToolsActivity,
    canonicalLocalApiOrigin,
    ({ projectId, displayId }) => {
      localDataService!.removeUserDisplayOrderForDisplay(displayId);
      closeDisplayPreviewWindow({ projectId, displayId });
    },
    ({ projectId, sourceDisplayId, displayId }) => {
      localDataService!.insertDisplayAfterInUserOrder(
        projectId,
        sourceDisplayId,
        displayId,
      );
    },
    ({ projectId, displayId }) => {
      localDataService!.appendDisplayToUserOrder(projectId, displayId);
    },
    ({ projectId, displayId }) => {
      localDataService!.appendDisplayToUserOrder(projectId, displayId);
    },
    {
      queueOperation: (input) =>
        displaySyncService?.queueOperation({
          ...input,
          operationType: input.operationType as import("./services/display-sync/types").DisplaySyncOperationType,
        }),
      syncNow: (reason) => {
        displaySyncService?.requestSync(reason ?? "online-viewer");
      },
      recordDeletion: (input) => displaySyncService?.recordDeletionTombstone(input),
      isDeleted: (displayId) => displaySyncService?.isDeleted(displayId) ?? false,
      reconcileProjectPublishing: (projectId) => {
        localDataService!.reconcileProjectPublishingForOnlineViewer(projectId);
      },
    },
  );
  localApiServer.setDeveloperTools(developerToolsService);

  const broadArrowUploadedDisplaysImport = new BroadArrowUploadedDisplaysImportService(
    appSettingsRepository,
    projectsRepository,
    displaysRepository,
    projectDisplayCodeRepository,
    projectCodeRevisionsRepository,
    projectCodeStorageService,
    paths.repoRoot,
  );
  const uploadedDisplaysImportResult = broadArrowUploadedDisplaysImport.ensureImported();
  if (uploadedDisplaysImportResult.createdCount > 0) {
    console.info(
      `[desktop] Broad Arrow uploaded displays imported count=${uploadedDisplaysImportResult.createdCount}`,
    );
  }

  const broadArrowLegacyDisplaysImport = new BroadArrowLegacyDisplaysImportService(
    appSettingsRepository,
    projectsRepository,
    displaysRepository,
    projectDisplayCodeRepository,
    projectCodeRevisionsRepository,
    projectCodeStorageService,
    paths.repoRoot,
  );
  const legacyDisplaysImportResult = broadArrowLegacyDisplaysImport.ensureImported();
  if (legacyDisplaysImportResult.createdCount > 0) {
    console.info(
      `[desktop] Broad Arrow legacy displays imported count=${legacyDisplaysImportResult.createdCount}`,
    );
  }
  if (legacyDisplaysImportResult.retiredAuctionPylonRemoved) {
    console.info("[desktop] Retired TypeScript Auction Pylon display removed");
  }

  const broadArrowStreamDisplaysImport = new BroadArrowStreamDisplaysImportService(
    appSettingsRepository,
    projectsRepository,
    displaysRepository,
    projectDisplayCodeRepository,
    projectCodeRevisionsRepository,
    projectCodeStorageService,
    paths.repoRoot,
  );
  const streamDisplaysImportResult = broadArrowStreamDisplaysImport.ensureImported();
  if (streamDisplaysImportResult.createdCount > 0) {
    console.info(
      `[desktop] Broad Arrow Stream displays imported count=${streamDisplaysImportResult.createdCount}`,
    );
  }
  if (streamDisplaysImportResult.revisionCount > 0) {
    console.info(
      `[desktop] Broad Arrow Stream display revisions published count=${streamDisplaysImportResult.revisionCount}`,
    );
  }

  const broadArrowProject = projectsRepository.getBySlug("broad-arrow-auctions");
  for (const project of projectsRepository.list()) {
    developerToolsService.reconcileInvalidDisplayOnlineStates(project.id);
  }
  if (broadArrowProject && displaySyncService) {
    void displaySyncService.reconcileLocalDisplays([broadArrowProject.id]);
  }

  registerCurrencyRatesIpc(currencyRateService);
  registerCredentialsIpc(credentials);

  const identity = host.touch();
  await upsertDesktopHost(authenticatedCloud, {
    id: identity.id,
    displayName: identity.displayName,
    hostname: identity.hostname,
    platform: identity.platform,
    appVersion: identity.appVersion,
  });

  const devMode = isDevMode();
  const appUrl = devMode
    ? getDevServerUrl()
    : await nextServer.start(false, { localApiUrl: canonicalLocalApiOrigin });

  const trustedPortal = resolveTrustedPortalOrigin({
    allowLocalDevFallback: devMode,
    localDevFallbackOrigin: appUrl,
  });
  const desktopAdminApi = trustedPortal.ok
    ? new DesktopAdminApiClient(trustedPortal.origin, authenticatedCloud)
    : null;
  if (trustedPortal.ok) {
    localDataService.setTrustedAccessApi(
      new DesktopTrustedAccessApiClient(trustedPortal.origin, authenticatedCloud),
    );
  }
  const accessManagementService = new AccessManagementService(
    accessAuthorizationService,
    localUsersRepository,
    teamsRepository,
    teamMembershipsRepository,
    projectMembershipsRepository,
    projectTeamAssignmentsRepository,
    projectsRepository,
    localInvitationsRepository,
    (input) => localDataService!.recordActivity(input),
    async ({ email, fullName }) => {
      if (!desktopAdminApi || !trustedPortal.ok) {
        const message = trustedPortal.ok
          ? "Trusted portal administration is unavailable."
          : trustedPortal.message;
        throw new Error(message);
      }
      const result = await desktopAdminApi.inviteUser({ email, fullName });
      if (!result.ok) {
        throw new Error(result.message);
      }
      void userDirectorySyncService?.syncNow("manual");
      return { userId: result.userId };
    },
  );
  localDataService.setAccessManagement(accessManagementService);

  localDataService.setViewerBaseUrl(appUrl);
  localDataService.repairBagProjectAssets();
  const broadArrowRepair = localDataService.repairBroadArrowConfiguration();
  const legacyRuntimeMigrations =
    localDataService.migrateAllLegacyEngineRuntimeAssets();
  if (broadArrowRepair.credentialsMigrated) {
    console.info("[desktop] Broad Arrow credentials migrated from legacy storage");
  }
  if (legacyRuntimeMigrations.length > 0) {
    console.info(
      `[desktop] Legacy engine runtime assets migrated count=${legacyRuntimeMigrations.length}`,
    );
  }

  if (devMode) {
    await waitForDevHealth(appUrl);
  }

  localDataService.reconcileDisabledDisplayViewerWindows();

  const authAllowed = authLicenseManager.isAccessAllowed();
  let savedPath = readSavedStartupPath(appSettingsRepository);
  if (savedPath && !authAllowed) {
    clearSavedStartupPath(appSettingsRepository);
    savedPath = null;
  }

  const startupPath = resolveDesktopStartupPath({
    savedPath,
    preferredPath: authAllowed
      ? resolveVerifiedProjectStartupPath({
          defaultProjectSlug: localDataService.getDefaultProjectSlug(),
          projectExists: (slug) =>
            Boolean(projectsRepository.getBySlug(slug)),
        })
      : undefined,
  });
  const rendererUrl = joinRendererUrl(appUrl, startupPath);
  console.info(`[NEUD Desktop] Loading renderer URL: ${rendererUrl}`);

  const preloadPath = path.join(__dirname, "preload.js");
  const appSession = session.fromPartition("persist:neud");
  const applicationIcon = resolveDesktopApplicationIcon();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    title: "NEUD",
    autoHideMenuBar: true,
    ...(applicationIcon ? { icon: applicationIcon } : {}),
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const }
      : {
          titleBarStyle: "hidden" as const,
        }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      session: appSession,
    },
  });

  mainWindow.on("closed", () => {
    if (mainWindow) {
      engineManager?.clearWindow(mainWindow);
    }
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) {
        void shell.openExternal(url);
      }
    }
  });

  attachStartupRoutePersistence(mainWindow, appSettingsRepository, appUrl, authAllowed);
  attachDevStartupRecovery(mainWindow, appUrl, appSettingsRepository, devMode);

  forceSignOutFromMain = async () => {
    console.info("[logout] Main process force sign-out started");
    appSettingsRepository.set(AUTH_EXPLICITLY_SIGNED_OUT_KEY, true);
    authLicenseManager.clear();
    supabaseUserSessionService.clearSession();
    authenticatedCloud.notifySessionCleared();
    localDataService?.resetIdentity();
    clearIdentityOnSession?.();
    stopUserDirectorySync?.();
    clearSavedStartupPath(appSettingsRepository);
    localAuthBootstrap.getSessionTokenService().clearSessionBinding();

    try {
      await fetch(`${appUrl}/api/local/reset-session-cache`, { method: "POST" });
      console.info("[logout] Next.js session cache reset requested");
    } catch (error) {
      console.warn("[logout] Next.js session cache reset failed", error);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      const loginUrl = joinRendererUrl(appUrl, "/");
      console.info(`[logout] Redirecting renderer to ${loginUrl}`);
      await loadRendererUrl(mainWindow, loginUrl);
    }

    console.info("[logout] Main process force sign-out completed");
    return { ok: true };
  };

  setClearLocalSessionHandler(() => {
    void forceSignOutFromMain?.();
  });

  await loadRendererUrl(mainWindow, rendererUrl);
  attachMainWindowCloseHandler();
  mainWindow.show();
}


async function waitForDevHealth(baseUrl: string) {
  const started = Date.now();
  while (Date.now() - started < 120000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Next.js dev server did not become ready.");
}

function attachStartupRoutePersistence(
  window: BrowserWindow,
  settings: AppSettingsRepository,
  appUrl: string,
  authAllowed: boolean,
) {
  if (!authAllowed) {
    return;
  }

  const recordPath = (url: string) => {
    if (!url.startsWith(appUrl)) {
      return;
    }

    const pathname = new URL(url).pathname;
    persistStartupPath(settings, pathname);
  };

  window.webContents.on("did-navigate", (_event, url) => {
    recordPath(url);
  });
  window.webContents.on("did-navigate-in-page", (_event, url) => {
    recordPath(url);
  });
}

function attachDevStartupRecovery(
  window: BrowserWindow,
  appUrl: string,
  settings: AppSettingsRepository,
  devMode: boolean,
) {
  if (!devMode) {
    return;
  }

  let recoveredFrom404 = false;

  window.webContents.on("did-finish-load", () => {
    if (recoveredFrom404 || window.isDestroyed()) {
      return;
    }

    void window.webContents
      .executeJavaScript("document.title", true)
      .then((title) => {
        if (recoveredFrom404 || window.isDestroyed()) {
          return;
        }

        if (typeof title !== "string" || !title.includes("404")) {
          return;
        }

        const currentPath = new URL(window.webContents.getURL()).pathname;
        console.warn(
          `[NEUD Desktop] Startup route returned 404 (${currentPath}); recovering to ${DESKTOP_FALLBACK_LANDING_PATH}`,
        );
        recoveredFrom404 = true;
        clearSavedStartupPath(settings);
        void window.loadURL(joinRendererUrl(appUrl, DESKTOP_FALLBACK_LANDING_PATH));
      })
      .catch(() => {
        // ignore renderer inspection failures
      });
  });
}

async function loadRendererUrl(window: BrowserWindow, url: string) {
  try {
    await window.loadURL(url);
  } catch (error) {
    if (!isNavigationAbortError(error)) {
      throw error;
    }
  }
}

function isNavigationAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ERR_ABORTED"
  );
}
