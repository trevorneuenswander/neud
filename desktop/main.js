"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
const electron_1 = require("electron");
const app_1 = require("./ipc/app");
const updates_1 = require("./ipc/updates");
const channels_1 = require("./ipc/channels");
const auth_1 = require("./ipc/auth");
const session_recovery_keys_1 = require("./auth/session-recovery-keys");
const local_session_token_1 = require("./auth/local-session-token");
const normalize_local_api_origin_1 = require("./lib/normalize-local-api-origin");
const cloud_session_diagnostics_1 = require("./services/cloud-session-diagnostics");
const application_menu_1 = require("./menu/application-menu");
const auto_update_service_1 = require("./services/auto-update-service");
const credentials_1 = require("./ipc/credentials");
const engines_1 = require("./ipc/engines");
const local_data_1 = require("./ipc/local-data");
const activity_1 = require("./ipc/activity");
const display_data_source_1 = require("./ipc/display-data-source");
const displays_1 = require("./ipc/displays");
const offline_auction_1 = require("./ipc/offline-auction");
const connection_1 = require("./database/connection");
const activity_events_repository_1 = require("./repositories/activity-events-repository");
const app_settings_repository_1 = require("./repositories/app-settings-repository");
const data_sources_repository_1 = require("./repositories/data-sources-repository");
const displays_repository_1 = require("./repositories/displays-repository");
const user_display_order_repository_1 = require("./repositories/user-display-order-repository");
const projects_repository_1 = require("./repositories/projects-repository");
const app_paths_1 = require("./services/app-paths");
const auction_dataset_service_1 = require("./services/auction-dataset-service");
const auth_license_manager_1 = require("./services/auth-license-manager");
const credential_store_1 = require("./services/credential-store");
const supabase_public_config_1 = require("./services/supabase-public-config");
const supabase_user_session_1 = require("./services/supabase-user-session");
const authenticated_cloud_coordinator_1 = require("./services/authenticated-cloud-coordinator");
const shared_cloud_auth_diagnostics_1 = require("./services/shared-cloud-auth-diagnostics");
const desktop_cloud_client_1 = require("./services/desktop-cloud-client");
const desktop_admin_api_client_1 = require("./services/desktop-admin-api-client");
const desktop_trusted_access_api_client_1 = require("./services/desktop-trusted-access-api-client");
const trusted_portal_origin_1 = require("./services/trusted-portal-origin");
const pylon_display_service_1 = require("./services/pylon-display-service");
const lower_ticker_display_service_1 = require("./services/lower-ticker-display-service");
const new_auction_displays_service_1 = require("./services/new-auction-displays-service");
const bag_source_service_1 = require("./services/bag-source-service");
const bag_project_repair_service_1 = require("./services/bag-project-repair-service");
const broad_arrow_phase_bootstrap_service_1 = require("./services/broad-arrow-phase-bootstrap-service");
const bag_live_state_events_1 = require("./bag/live-state/bag-live-state-events");
const bag_live_state_repository_1 = require("./bag/live-state/bag-live-state-repository");
const bag_live_state_service_1 = require("./bag/live-state/bag-live-state-service");
const bag_manual_events_repository_1 = require("./bag/live-state/bag-manual-events-repository");
const generic_scraper_service_1 = require("./services/generic-scraper-service");
const project_deletion_service_1 = require("./services/project-deletion-service");
const engine_manager_1 = require("./services/engine-manager");
const import_service_1 = require("./import/import-service");
const local_api_server_1 = require("./services/local-api-server");
const local_auth_bootstrap_service_1 = require("./services/local-auth-bootstrap-service");
const local_data_service_1 = require("./services/local-data-service");
const activity_description_repair_1 = require("./services/activity-description-repair");
const display_preview_window_manager_1 = require("./services/display-preview-window-manager");
const local_project_memberships_repository_1 = require("./repositories/local-project-memberships-repository");
const local_users_repository_1 = require("./repositories/local-users-repository");
const local_invitations_repository_1 = require("./repositories/local-invitations-repository");
const teams_repository_1 = require("./repositories/teams-repository");
const team_memberships_repository_1 = require("./repositories/team-memberships-repository");
const project_memberships_repository_1 = require("./repositories/project-memberships-repository");
const project_team_assignments_repository_1 = require("./repositories/project-team-assignments-repository");
const access_authorization_service_1 = require("./services/access-authorization-service");
const cloud_photo_asset_service_1 = require("./services/cloud-photo-asset-service");
const project_photo_upload_repository_1 = require("./repositories/project-photo-upload-repository");
const cloud_access_cache_repository_1 = require("./repositories/cloud-access-cache-repository");
const cloud_access_bridge_1 = require("./services/cloud-access-bridge");
const access_management_service_1 = require("./services/access-management-service");
const access_data_migration_1 = require("./services/access-data-migration");
const default_owner_email_migration_1 = require("./services/default-owner-email-migration");
const owner_identity_sync_migration_1 = require("./services/owner-identity-sync-migration");
const users_access_directory_repair_migration_1 = require("./services/users-access-directory-repair-migration");
const supabase_user_directory_sync_service_1 = require("./services/supabase-user-directory-sync/supabase-user-directory-sync-service");
const supabase_identity_service_1 = require("./services/supabase-identity-service");
const supabase_project_ref_1 = require("./services/supabase-project-ref");
const user_identity_reconciliation_service_1 = require("./services/user-identity-reconciliation-service");
const multi_team_data_migration_1 = require("./services/multi-team-data-migration");
const project_scraper_code_repository_1 = require("./repositories/project-scraper-code-repository");
const project_display_code_repository_1 = require("./repositories/project-display-code-repository");
const project_code_revisions_repository_1 = require("./repositories/project-code-revisions-repository");
const project_code_storage_service_1 = require("./services/project-code-storage-service");
const developer_tools_service_1 = require("./services/developer-tools-service");
const offline_auction_export_service_1 = require("./services/offline-auction-export-service");
const currency_rate_service_1 = require("./services/currency-rate-service");
const currency_rates_1 = require("./ipc/currency-rates");
const machine_registration_1 = require("./services/machine-registration");
const process_manager_1 = require("./services/process-manager");
const next_server_1 = require("./services/next-server");
const startup_route_1 = require("./services/startup-route");
const activity_sync_service_1 = require("./services/activity-sync/activity-sync-service");
const display_sync_queue_repository_1 = require("./repositories/display-sync-queue-repository");
const display_deletion_tombstones_repository_1 = require("./repositories/display-deletion-tombstones-repository");
const display_sync_service_1 = require("./services/display-sync/display-sync-service");
const publishing_manager_1 = require("./services/publishing/publishing-manager");
const broad_arrow_uploaded_displays_import_service_1 = require("./services/broad-arrow-uploaded-displays-import-service");
const broad_arrow_legacy_displays_import_service_1 = require("./services/broad-arrow-legacy-displays-import-service");
const broad_arrow_stream_displays_import_service_1 = require("./services/broad-arrow-stream-displays-import-service");
const user_data_migration_1 = require("./services/user-data-migration");
const legacy_settings_migration_1 = require("./services/legacy-settings-migration");
const release_version_1 = require("./app/release-version");
const startup_diagnostics_1 = require("./services/startup-diagnostics");
function writePackagedBootstrapLog(message, metadata = {}) {
    if (!electron_1.app.isPackaged) {
        return;
    }
    try {
        const logPath = path_1.default.join(process.env.APPDATA ?? "", "NEUD", "logs", "bootstrap.log");
        fs_1.default.mkdirSync(path_1.default.dirname(logPath), { recursive: true });
        fs_1.default.appendFileSync(logPath, `${JSON.stringify({
            at: new Date().toISOString(),
            message,
            ...metadata,
        })}\n`, "utf8");
    }
    catch {
        // ignore bootstrap logging failures
    }
}
function serializeStartupError(error) {
    return error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
        }
        : String(error);
}
process.on("uncaughtException", (error) => {
    writePackagedBootstrapLog("process.uncaughtException", {
        error: serializeStartupError(error),
    });
    (0, startup_diagnostics_1.logStartupFailure)(error);
});
process.on("unhandledRejection", (reason) => {
    writePackagedBootstrapLog("process.unhandledRejection", {
        error: serializeStartupError(reason),
    });
    (0, startup_diagnostics_1.logStartupFailure)(reason);
});
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "..", "..", ".env.local") });
(0, user_data_migration_1.configureUserDataPath)();
writePackagedBootstrapLog("main.module_loaded");
const external_url_1 = require("./services/external-url");
let mainWindow = null;
let localDataService = null;
let activitySyncService = null;
let displaySyncService = null;
let publishingManager = null;
let userDirectorySyncService = null;
let offlineAuctionExportService = null;
let currencyRateService = null;
let auctionDatasetService = null;
let engineManager = null;
let nextServer = null;
let localApiServer = null;
let localDatabase = null;
let processManager = null;
let isQuitting = false;
let forceCloseConfirmed = false;
let shutdownInProgress = false;
let closePromptResolver = null;
let closePromptPending = false;
const SHUTDOWN_ENGINE_GRACEFUL_MS = 10000;
const SHUTDOWN_ENGINE_FORCE_MS = 5000;
const SHUTDOWN_RESOURCE_MS = 8000;
async function cancelActiveExportsForShutdown() {
    offlineAuctionExportService?.cancelActiveExportForShutdown();
    localDataService?.cancelPendingExportsForShutdown();
}
const gotLock = electron_1.app.requestSingleInstanceLock();
if (!gotLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
    void electron_1.app.whenReady().then(startApplication).catch(handleStartupFailure);
    writePackagedBootstrapLog("main.when_ready_registered");
}
electron_1.app.on("before-quit", async (event) => {
    if (isQuitting)
        return;
    if (!forceCloseConfirmed && shouldBlockAppClose()) {
        event.preventDefault();
        const action = await promptExitConfirmation();
        if (action === "cancel")
            return;
        forceCloseConfirmed = action === "confirm" || action === "force";
        if (!forceCloseConfirmed)
            return;
    }
    if (shutdownInProgress)
        return;
    event.preventDefault();
    isQuitting = true;
    const shutdownOk = await performGracefulShutdown();
    if (!shutdownOk && !forceCloseConfirmed) {
        forceCloseConfirmed = true;
        if (processManager) {
            await processManager.stopAll(0);
        }
    }
    electron_1.app.quit();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
async function startApplication() {
    writePackagedBootstrapLog("startup.startApplication");
    (0, startup_diagnostics_1.logStartupEnvironment)();
    (0, startup_diagnostics_1.logStartupCheckpoint)("startup.begin");
    const releaseVersion = (0, release_version_1.syncElectronReleaseVersion)();
    console.info(`[desktop] Release version ${releaseVersion}`);
    (0, startup_diagnostics_1.logStartupCheckpoint)("startup.release_version", { releaseVersion });
    await createMainWindow();
    (0, startup_diagnostics_1.logStartupCheckpoint)("startup.main_window_ready");
}
async function handleStartupFailure(error) {
    const message = formatStartupError(error);
    console.error("[desktop] Failed to start:", error);
    (0, startup_diagnostics_1.logStartupFailure)(error);
    await cleanupStartupResources();
    electron_1.dialog.showErrorBox("NEUD failed to start", message);
    electron_1.app.exit(1);
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
    (0, connection_1.closeLocalDatabase)(localDatabase);
    localDatabase = null;
    localDataService = null;
    engineManager = null;
    localApiServer = null;
    nextServer = null;
    processManager = null;
    offlineAuctionExportService = null;
}
function shouldBlockAppClose() {
    if (forceCloseConfirmed || shutdownInProgress) {
        return false;
    }
    return engineManager?.isScraperSessionActive() ?? false;
}
async function promptExitConfirmation(options = {}) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return "cancel";
    }
    if (closePromptPending) {
        return "cancel";
    }
    closePromptPending = true;
    const action = await new Promise((resolve) => {
        closePromptResolver = resolve;
        (0, channels_1.sendToRenderer)(mainWindow, "neud:app:closeRequested", {
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
function handleCloseRequestResponse(action) {
    closePromptResolver?.(action);
}
async function performGracefulShutdown() {
    if (shutdownInProgress)
        return true;
    shutdownInProgress = true;
    (0, displays_1.shutdownDisplayPreviewWindows)();
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
            new Promise((resolve) => {
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
        (0, connection_1.closeLocalDatabase)(localDatabase);
        localDatabase = null;
        localDataService = null;
        engineManager = null;
        localApiServer = null;
        nextServer = null;
        processManager = null;
        offlineAuctionExportService = null;
        return true;
    }
    catch (error) {
        console.error("[desktop] Graceful shutdown failed:", error);
        if (processManager) {
            await processManager.stopAll(0);
        }
        return false;
    }
    finally {
        shutdownInProgress = false;
    }
}
function attachMainWindowCloseHandler() {
    if (!mainWindow)
        return;
    mainWindow.on("close", async (event) => {
        if (isQuitting || forceCloseConfirmed)
            return;
        if (!shouldBlockAppClose())
            return;
        event.preventDefault();
        const action = await promptExitConfirmation();
        if (action === "cancel")
            return;
        if (action === "force") {
            forceCloseConfirmed = true;
            isQuitting = true;
            mainWindow?.destroy();
            electron_1.app.quit();
            return;
        }
        isQuitting = true;
        const shutdownOk = await performGracefulShutdown();
        if (!shutdownOk && mainWindow && !mainWindow.isDestroyed()) {
            isQuitting = false;
            const retryAction = await promptExitConfirmation({ shutdownFailed: true });
            if (retryAction === "cancel")
                return;
            forceCloseConfirmed = true;
            isQuitting = true;
            if (retryAction === "force" && processManager) {
                await processManager.stopAll(0);
            }
        }
        else {
            forceCloseConfirmed = true;
        }
        mainWindow?.destroy();
        electron_1.app.quit();
    });
}
function formatStartupError(error) {
    if (error instanceof Error) {
        return error.stack ?? error.message;
    }
    return String(error);
}
function resolveDesktopApplicationIcon() {
    const assetRoots = [
        path_1.default.join(__dirname, "..", "assets"),
        path_1.default.join(electron_1.app.getAppPath(), "assets"),
        process.resourcesPath ? path_1.default.join(process.resourcesPath, "assets") : null,
    ].filter((candidate) => Boolean(candidate));
    for (const assetRoot of assetRoots) {
        for (const fileName of ["icon.ico", "icon.png"]) {
            const iconPath = path_1.default.join(assetRoot, fileName);
            if (fs_1.default.existsSync(iconPath)) {
                const image = electron_1.nativeImage.createFromPath(iconPath);
                if (!image.isEmpty()) {
                    return image;
                }
            }
        }
    }
    return undefined;
}
async function createMainWindow() {
    const paths = (0, app_paths_1.getAppPaths)();
    processManager = new process_manager_1.ProcessManager();
    nextServer = new next_server_1.NextServerService(paths, processManager);
    localDatabase = await (0, connection_1.openLocalDatabase)(paths);
    (0, legacy_settings_migration_1.migrateLegacyAppSettings)(localDatabase);
    const projectsRepository = new projects_repository_1.ProjectsRepository(localDatabase);
    const dataSourcesRepository = new data_sources_repository_1.DataSourcesRepository(localDatabase);
    const appSettingsRepository = new app_settings_repository_1.AppSettingsRepository(localDatabase);
    (0, default_owner_email_migration_1.runDefaultOwnerEmailMigration)({
        db: localDatabase,
        settings: appSettingsRepository,
    });
    const activityEventsRepository = new activity_events_repository_1.ActivityEventsRepository(localDatabase);
    const localProjectMembershipsRepository = new local_project_memberships_repository_1.LocalProjectMembershipsRepository(localDatabase);
    const localUsersRepository = new local_users_repository_1.LocalUsersRepository(localDatabase);
    const teamsRepository = new teams_repository_1.TeamsRepository(localDatabase);
    const teamMembershipsRepository = new team_memberships_repository_1.TeamMembershipsRepository(localDatabase);
    const projectMembershipsRepository = new project_memberships_repository_1.ProjectMembershipsRepository(localDatabase);
    const projectTeamAssignmentsRepository = new project_team_assignments_repository_1.ProjectTeamAssignmentsRepository(localDatabase);
    const localInvitationsRepository = new local_invitations_repository_1.LocalInvitationsRepository(localDatabase);
    const credentials = new credential_store_1.CredentialStore(paths);
    const host = new machine_registration_1.MachineRegistration(paths);
    (0, app_1.registerAppIpc)(host, () => mainWindow, handleCloseRequestResponse);
    (0, updates_1.registerUpdateIpc)();
    const authLicenseManager = new auth_license_manager_1.AuthLicenseManager(paths, localDatabase, host.touch().id);
    const supabaseUserSessionService = new supabase_user_session_1.SupabaseUserSessionService(paths);
    const supabasePublicConfig = (0, supabase_public_config_1.loadSupabasePublicConfig)(paths);
    const authenticatedCloud = new authenticated_cloud_coordinator_1.AuthenticatedCloudCoordinator(supabaseUserSessionService, supabasePublicConfig);
    authenticatedCloud.attachSharedDiagnosticsWriter((diagnostics) => {
        appSettingsRepository.set(shared_cloud_auth_diagnostics_1.SHARED_CLOUD_AUTH_DIAGNOSTICS_KEY, diagnostics);
    });
    let reconcileIdentityOnSession = null;
    let clearIdentityOnSession = null;
    let startUserDirectorySync = null;
    let stopUserDirectorySync = null;
    let forceSignOutFromMain = null;
    (0, auth_1.registerAuthIpc)(authLicenseManager, {
        userSession: supabaseUserSessionService,
        settings: appSettingsRepository,
        onSessionStored: ({ startReason }) => {
            appSettingsRepository.set(session_recovery_keys_1.AUTH_EXPLICITLY_SIGNED_OUT_KEY, false);
            reconcileIdentityOnSession?.();
            startUserDirectorySync?.();
            const authSnapshot = authenticatedCloud.getAuthSnapshot();
            const hasCloudSession = authSnapshot.authenticatedCloudSessionAvailable;
            const lifecycle = supabaseUserSessionService.getSessionLifecycleDiagnostics();
            const existingDiagnostics = appSettingsRepository.get(cloud_session_diagnostics_1.CLOUD_SESSION_DIAGNOSTICS_KEY, null) ??
                (0, cloud_session_diagnostics_1.createDefaultCloudSessionDiagnostics)();
            appSettingsRepository.set(cloud_session_diagnostics_1.CLOUD_SESSION_DIAGNOSTICS_KEY, {
                ...existingDiagnostics,
                coordinatorReceivedSession: true,
                cloudServicesStartRequested: hasCloudSession,
                publishingManagerStartRequested: hasCloudSession,
                lastPublishingManagerStartReason: hasCloudSession ? startReason : null,
                lastSessionStoreAt: lifecycle.lastSessionStoreAt ?? existingDiagnostics.lastSessionStoreAt,
                lastSessionRestoreAt: lifecycle.lastSessionRestoreAt ?? existingDiagnostics.lastSessionRestoreAt,
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
            appSettingsRepository.set(session_recovery_keys_1.AUTH_EXPLICITLY_SIGNED_OUT_KEY, true);
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
            appSettingsRepository.set(session_recovery_keys_1.AUTH_EXPLICITLY_SIGNED_OUT_KEY, true);
            authLicenseManager.clear();
            localDataService?.resetIdentity();
            clearIdentityOnSession?.();
            stopUserDirectorySync?.();
            return { ok: true };
        },
    });
    const localAuthBootstrap = new local_auth_bootstrap_service_1.LocalAuthBootstrapService(appSettingsRepository, projectsRepository, localProjectMembershipsRepository, authLicenseManager, paths, host.touch().id);
    localAuthBootstrap.ensure();
    (0, multi_team_data_migration_1.runMultiTeamDataMigration)(localDatabase);
    (0, access_data_migration_1.runAccessDataMigration)({
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
    (0, owner_identity_sync_migration_1.runOwnerIdentitySyncMigration)({
        db: localDatabase,
        auth: authLicenseManager,
        users: localUsersRepository,
        teams: teamsRepository,
        teamMemberships: teamMembershipsRepository,
    });
    (0, users_access_directory_repair_migration_1.runUsersAccessDirectoryRepairMigration)({
        db: localDatabase,
        auth: authLicenseManager,
        users: localUsersRepository,
        teams: teamsRepository,
        teamMemberships: teamMembershipsRepository,
    });
    (0, activity_description_repair_1.repairHistoricalActivityDescriptions)({
        activityEvents: activityEventsRepository,
        settings: appSettingsRepository,
    });
    const accessAuthorizationService = new access_authorization_service_1.AccessAuthorizationService(authLicenseManager, localUsersRepository, teamsRepository, teamMembershipsRepository, projectMembershipsRepository, projectTeamAssignmentsRepository, projectsRepository, dataSourcesRepository);
    const bagSourceService = new bag_source_service_1.BagSourceService(dataSourcesRepository, projectsRepository);
    const bagProjectRepairService = new bag_project_repair_service_1.BagProjectRepairService(projectsRepository, dataSourcesRepository, bagSourceService, credentials, appSettingsRepository);
    const bagLiveStateRepository = new bag_live_state_repository_1.BagLiveStateRepository(localDatabase);
    const bagManualEventsRepository = new bag_manual_events_repository_1.BagManualEventsRepository(localDatabase);
    const bagLiveStateEvents = new bag_live_state_events_1.BagLiveStateEvents();
    const bagLiveStateService = new bag_live_state_service_1.BagLiveStateService(projectsRepository, dataSourcesRepository, bagLiveStateRepository, bagLiveStateEvents, bagManualEventsRepository);
    auctionDatasetService = new auction_dataset_service_1.AuctionDatasetService(appSettingsRepository, projectsRepository);
    const displaysRepository = new displays_repository_1.DisplaysRepository(localDatabase);
    const userDisplayOrderRepository = new user_display_order_repository_1.UserDisplayOrderRepository(localDatabase);
    const pylonDisplayService = new pylon_display_service_1.PylonDisplayService(projectsRepository, displaysRepository, appSettingsRepository);
    const lowerTickerDisplayService = new lower_ticker_display_service_1.LowerTickerDisplayService(projectsRepository, displaysRepository, appSettingsRepository);
    const newAuctionDisplaysService = new new_auction_displays_service_1.NewAuctionDisplaysService(projectsRepository, displaysRepository, appSettingsRepository);
    const genericScraperService = new generic_scraper_service_1.GenericScraperService(dataSourcesRepository, projectsRepository);
    const projectDeletionService = new project_deletion_service_1.ProjectDeletionService(projectsRepository, dataSourcesRepository, credentials, paths, authLicenseManager, bagLiveStateEvents);
    const broadArrowPhaseBootstrapService = new broad_arrow_phase_bootstrap_service_1.BroadArrowPhaseBootstrapService(projectsRepository, dataSourcesRepository, bagSourceService, appSettingsRepository, credentials, projectDeletionService);
    localDataService = new local_data_service_1.LocalDataService(projectsRepository, dataSourcesRepository, displaysRepository, appSettingsRepository, bagSourceService, genericScraperService, pylonDisplayService, lowerTickerDisplayService, newAuctionDisplaysService, bagLiveStateService, paths, authLicenseManager, localProjectMembershipsRepository, projectDeletionService, bagProjectRepairService, broadArrowPhaseBootstrapService, credentials, activityEventsRepository, userDisplayOrderRepository);
    localDataService.setAccessAuthorization(accessAuthorizationService);
    const projectPhotoUploadRepository = new project_photo_upload_repository_1.ProjectPhotoUploadRepository(localDatabase);
    const cloudPhotoAssetService = new cloud_photo_asset_service_1.CloudPhotoAssetService(projectPhotoUploadRepository, () => authenticatedCloud.getClient());
    localDataService.setCloudPhotoAssetService(cloudPhotoAssetService);
    const cloudAccessBridge = new cloud_access_bridge_1.CloudAccessBridge(authenticatedCloud);
    localDataService.setCloudAccessBridge(cloudAccessBridge);
    localDataService.setCloudAccessCache(new cloud_access_cache_repository_1.CloudAccessCacheRepository(localDatabase));
    if (!supabasePublicConfig) {
        console.warn("[desktop] Supabase public configuration missing — cloud sync disabled until configured.");
    }
    activitySyncService = new activity_sync_service_1.ActivitySyncService(authenticatedCloud, appSettingsRepository, activityEventsRepository, localDataService.getActivitySessionStore(), authLicenseManager, accessAuthorizationService, projectsRepository, () => localDataService.notifyActivitySyncChanged());
    localDataService.setActivitySync(activitySyncService);
    userDirectorySyncService = new supabase_user_directory_sync_service_1.SupabaseUserDirectorySyncService(authenticatedCloud, appSettingsRepository, localUsersRepository, teamsRepository, teamMembershipsRepository, authLicenseManager);
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
    authenticatedCloud.setSessionRestorePromise(cloudSessionRestorePromise.then(() => undefined));
    await Promise.race([
        cloudSessionRestorePromise,
        new Promise((resolve) => {
            setTimeout(resolve, 10_000);
        }),
    ]);
    const supabaseIdentityService = new supabase_identity_service_1.SupabaseIdentityService(authenticatedCloud, supabasePublicConfig, authLicenseManager, localUsersRepository, accessAuthorizationService, localDatabase, teamsRepository, teamMembershipsRepository);
    localDataService.setSupabaseIdentity(supabaseIdentityService);
    if (process.env.NODE_ENV !== "production" && supabasePublicConfig) {
        console.info(`[identity-resolution] Configured Supabase project reference: ${(0, supabase_project_ref_1.extractSupabaseProjectRef)(supabasePublicConfig.supabaseUrl) ?? "unknown"}`);
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
        const result = (0, user_identity_reconciliation_service_1.reconcileAuthenticatedUser)({
            db: localDatabase,
            auth: authLicenseManager,
            users: localUsersRepository,
            teams: teamsRepository,
            teamMemberships: teamMembershipsRepository,
        });
        (0, user_identity_reconciliation_service_1.logIdentityReconciliation)(result);
    };
    clearIdentityOnSession = () => {
        localAuthBootstrap.getSessionTokenService().clearSessionBinding();
    };
    reconcileIdentityOnSession();
    const importService = new import_service_1.ImportService(paths, localDatabase, projectsRepository, dataSourcesRepository, authLicenseManager, bagSourceService, authenticatedCloud);
    localApiServer = new local_api_server_1.LocalApiServer(paths, localDataService, authLicenseManager, localAuthBootstrap.getSessionTokenService(), importService, bagLiveStateService, bagLiveStateEvents);
    (0, startup_diagnostics_1.logStartupCheckpoint)("startup.local_api_start");
    const localApiInfo = await localApiServer.start();
    (0, startup_diagnostics_1.logStartupCheckpoint)("startup.local_api_ready", { baseUrl: localApiInfo.baseUrl });
    const canonicalLocalApiOrigin = (0, normalize_local_api_origin_1.normalizeLocalApiOrigin)(localApiInfo.baseUrl) ?? normalize_local_api_origin_1.DEFAULT_LOCAL_API_ORIGIN;
    const storedLocalApiOrigin = appSettingsRepository.get(local_session_token_1.LOCAL_API_URL_SETTING_KEY, null);
    if (storedLocalApiOrigin !== canonicalLocalApiOrigin) {
        appSettingsRepository.set(local_session_token_1.LOCAL_API_URL_SETTING_KEY, canonicalLocalApiOrigin);
    }
    localAuthBootstrap.publishSessionConfig(canonicalLocalApiOrigin);
    localDataService.setLocalApiBaseUrl(canonicalLocalApiOrigin);
    offlineAuctionExportService = new offline_auction_export_service_1.OfflineAuctionExportService(paths, projectsRepository, dataSourcesRepository, credentials, canonicalLocalApiOrigin);
    currencyRateService = new currency_rate_service_1.CurrencyRateService(paths);
    localDataService.attachOfflineAuctionService(offlineAuctionExportService);
    localDataService.onExportWorkerEvent((payload) => {
        offlineAuctionExportService.handleWorkerEvent(payload);
    });
    localDataService.attachAuctionDatasetService(auctionDatasetService);
    localDataService.initializeSessionDiagnostics();
    localDataService.restoreAuctionDatasets();
    bagLiveStateService.setAuctionDatasetService(auctionDatasetService);
    bagLiveStateService.setCurrencyRateService(currencyRateService);
    bagLiveStateService.recoverAllProjects();
    const bootstrapResult = localDataService.ensureBroadArrowDevelopmentPhase();
    console.info(`[desktop] Broad Arrow phase bootstrap bootstrapped=${bootstrapResult.bootstrapped} repaired=${bootstrapResult.repaired} projectsDeleted=${bootstrapResult.deletedProjectCount} slug=${bootstrapResult.projectSlug}`);
    (0, local_data_1.registerLocalDataIpc)({
        data: localDataService,
        localApi: localApiServer,
        auth: authLicenseManager,
        getSessionConfig: () => {
            try {
                const configPath = localAuthBootstrap
                    .getSessionTokenService()
                    .getSessionConfigPath();
                const raw = fs_1.default.readFileSync(configPath, "utf8");
                const parsed = JSON.parse(raw);
                if (typeof parsed.baseUrl === "string" &&
                    typeof parsed.sessionToken === "string" &&
                    parsed.sessionToken.trim()) {
                    return {
                        baseUrl: (0, normalize_local_api_origin_1.normalizeLocalApiOrigin)(parsed.baseUrl) ??
                            parsed.baseUrl.replace(/\/$/, ""),
                        sessionToken: parsed.sessionToken.trim(),
                        userId: typeof parsed.userId === "string" ? parsed.userId : "",
                        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
                    };
                }
            }
            catch {
                // session config unavailable
            }
            return null;
        },
    });
    (0, activity_1.registerActivityIpc)(localDataService);
    (0, display_data_source_1.registerDisplayDataSourceIpc)(localDataService);
    (0, displays_1.registerDisplaysIpc)({
        data: localDataService,
        auth: authLicenseManager,
    });
    (0, offline_auction_1.registerOfflineAuctionIpc)({
        data: localDataService,
        offlineAuction: offlineAuctionExportService,
        auctionDataset: auctionDatasetService,
    });
    engineManager = new engine_manager_1.EngineManager(paths, processManager, credentials, host, localDataService, bagSourceService, genericScraperService, canonicalLocalApiOrigin);
    offlineAuctionExportService?.attachEngineManager(engineManager);
    projectDeletionService.setEngineManager(engineManager);
    localDataService.setEngineManager(engineManager);
    (0, engines_1.registerEnginesIpc)(engineManager);
    const projectScraperCodeRepository = new project_scraper_code_repository_1.ProjectScraperCodeRepository(localDatabase);
    const projectDisplayCodeRepository = new project_display_code_repository_1.ProjectDisplayCodeRepository(localDatabase);
    localDataService.setProjectDisplayCodeRepository(projectDisplayCodeRepository);
    const projectCodeRevisionsRepository = new project_code_revisions_repository_1.ProjectCodeRevisionsRepository(localDatabase);
    const projectValidationLogsRepository = new project_code_revisions_repository_1.ProjectValidationLogsRepository(localDatabase);
    const projectCodeStorageService = new project_code_storage_service_1.ProjectCodeStorageService(paths);
    const displaySyncQueueRepository = new display_sync_queue_repository_1.DisplaySyncQueueRepository(localDatabase);
    const displayDeletionTombstonesRepository = new display_deletion_tombstones_repository_1.DisplayDeletionTombstonesRepository(localDatabase);
    displaySyncService = new display_sync_service_1.DisplaySyncService(authenticatedCloud, appSettingsRepository, projectsRepository, displaysRepository, projectDisplayCodeRepository, projectCodeRevisionsRepository, projectCodeStorageService, displaySyncQueueRepository, displayDeletionTombstonesRepository, authLicenseManager, () => {
        void localDataService.notifyActivitySyncChanged();
    }, (input) => {
        localDataService.recordActivity({
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
    });
    publishingManager = new publishing_manager_1.PublishingManager(authenticatedCloud, supabasePublicConfig, appSettingsRepository, projectsRepository, authLicenseManager, accessAuthorizationService, localDataService);
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
        await localDataService.performStartupAuthValidation();
        if (!supabasePublicConfig) {
            displaySyncService?.markServiceUnavailable("missing_cloud_config");
            return;
        }
        const restore = await authenticatedCloud.restorePersistedSession();
        const postRestoreAuth = authenticatedCloud.getAuthSnapshot();
        const lifecycle = supabaseUserSessionService.getSessionLifecycleDiagnostics();
        const existingDiagnostics = appSettingsRepository.get(cloud_session_diagnostics_1.CLOUD_SESSION_DIAGNOSTICS_KEY, null) ??
            (0, cloud_session_diagnostics_1.createDefaultCloudSessionDiagnostics)();
        appSettingsRepository.set(cloud_session_diagnostics_1.CLOUD_SESSION_DIAGNOSTICS_KEY, {
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
            displaySyncService?.markServiceUnavailable(restore.errorCode ?? "missing_authenticated_client");
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
    const projectCodeMigrationService = new developer_tools_service_1.ProjectCodeMigrationService(appSettingsRepository, projectsRepository, displaysRepository, projectDisplayCodeRepository, projectScraperCodeRepository, projectCodeRevisionsRepository, projectCodeStorageService, paths.repoRoot);
    const activityRecorder = localDataService;
    const recordDeveloperToolsActivity = activityRecorder
        ? (input) => {
            activityRecorder.recordActivity(input);
        }
        : null;
    const developerToolsService = new developer_tools_service_1.DeveloperToolsService(projectsRepository, displaysRepository, projectScraperCodeRepository, projectDisplayCodeRepository, projectCodeRevisionsRepository, projectValidationLogsRepository, projectCodeStorageService, projectCodeMigrationService, authLicenseManager, localProjectMembershipsRepository, dataSourcesRepository, engineManager, recordDeveloperToolsActivity, canonicalLocalApiOrigin, ({ projectId, displayId }) => {
        localDataService.removeUserDisplayOrderForDisplay(displayId);
        (0, display_preview_window_manager_1.closeDisplayPreviewWindow)({ projectId, displayId });
    }, ({ projectId, sourceDisplayId, displayId }) => {
        localDataService.insertDisplayAfterInUserOrder(projectId, sourceDisplayId, displayId);
    }, ({ projectId, displayId }) => {
        localDataService.appendDisplayToUserOrder(projectId, displayId);
    }, ({ projectId, displayId }) => {
        localDataService.appendDisplayToUserOrder(projectId, displayId);
    }, {
        queueOperation: (input) => displaySyncService?.queueOperation({
            ...input,
            operationType: input.operationType,
        }),
        syncNow: (reason) => {
            displaySyncService?.requestSync(reason ?? "online-viewer");
        },
        recordDeletion: (input) => displaySyncService?.recordDeletionTombstone(input),
        isDeleted: (displayId) => displaySyncService?.isDeleted(displayId) ?? false,
        reconcileProjectPublishing: (projectId) => {
            localDataService.reconcileProjectPublishingForOnlineViewer(projectId);
        },
    });
    localApiServer.setDeveloperTools(developerToolsService);
    const broadArrowUploadedDisplaysImport = new broad_arrow_uploaded_displays_import_service_1.BroadArrowUploadedDisplaysImportService(appSettingsRepository, projectsRepository, displaysRepository, projectDisplayCodeRepository, projectCodeRevisionsRepository, projectCodeStorageService, paths.repoRoot);
    const uploadedDisplaysImportResult = broadArrowUploadedDisplaysImport.ensureImported();
    if (uploadedDisplaysImportResult.createdCount > 0) {
        console.info(`[desktop] Broad Arrow uploaded displays imported count=${uploadedDisplaysImportResult.createdCount}`);
    }
    const broadArrowLegacyDisplaysImport = new broad_arrow_legacy_displays_import_service_1.BroadArrowLegacyDisplaysImportService(appSettingsRepository, projectsRepository, displaysRepository, projectDisplayCodeRepository, projectCodeRevisionsRepository, projectCodeStorageService, paths.repoRoot);
    const legacyDisplaysImportResult = broadArrowLegacyDisplaysImport.ensureImported();
    if (legacyDisplaysImportResult.createdCount > 0) {
        console.info(`[desktop] Broad Arrow legacy displays imported count=${legacyDisplaysImportResult.createdCount}`);
    }
    if (legacyDisplaysImportResult.retiredAuctionPylonRemoved) {
        console.info("[desktop] Retired TypeScript Auction Pylon display removed");
    }
    const broadArrowStreamDisplaysImport = new broad_arrow_stream_displays_import_service_1.BroadArrowStreamDisplaysImportService(appSettingsRepository, projectsRepository, displaysRepository, projectDisplayCodeRepository, projectCodeRevisionsRepository, projectCodeStorageService, paths.repoRoot);
    const streamDisplaysImportResult = broadArrowStreamDisplaysImport.ensureImported();
    if (streamDisplaysImportResult.createdCount > 0) {
        console.info(`[desktop] Broad Arrow Stream displays imported count=${streamDisplaysImportResult.createdCount}`);
    }
    if (streamDisplaysImportResult.revisionCount > 0) {
        console.info(`[desktop] Broad Arrow Stream display revisions published count=${streamDisplaysImportResult.revisionCount}`);
    }
    const broadArrowProject = projectsRepository.getBySlug("broad-arrow-auctions");
    for (const project of projectsRepository.list()) {
        developerToolsService.reconcileInvalidDisplayOnlineStates(project.id);
    }
    if (broadArrowProject && displaySyncService) {
        void displaySyncService.reconcileLocalDisplays([broadArrowProject.id]);
    }
    (0, currency_rates_1.registerCurrencyRatesIpc)(currencyRateService);
    (0, credentials_1.registerCredentialsIpc)(credentials);
    const identity = host.touch();
    await (0, desktop_cloud_client_1.upsertDesktopHost)(authenticatedCloud, {
        id: identity.id,
        displayName: identity.displayName,
        hostname: identity.hostname,
        platform: identity.platform,
        appVersion: identity.appVersion,
    });
    const devMode = (0, next_server_1.isDevMode)();
    (0, startup_diagnostics_1.logStartupCheckpoint)("startup.next_server_start", { devMode });
    const appUrl = devMode
        ? (0, next_server_1.getDevServerUrl)()
        : await nextServer.start(false, { localApiUrl: canonicalLocalApiOrigin });
    (0, startup_diagnostics_1.logStartupCheckpoint)("startup.next_server_ready", { appUrl });
    const trustedPortal = (0, trusted_portal_origin_1.resolveTrustedPortalOrigin)({
        allowLocalDevFallback: devMode,
        localDevFallbackOrigin: appUrl,
    });
    const desktopAdminApi = trustedPortal.ok
        ? new desktop_admin_api_client_1.DesktopAdminApiClient(trustedPortal.origin, authenticatedCloud)
        : null;
    if (trustedPortal.ok) {
        localDataService.setTrustedAccessApi(new desktop_trusted_access_api_client_1.DesktopTrustedAccessApiClient(trustedPortal.origin, authenticatedCloud));
    }
    const accessManagementService = new access_management_service_1.AccessManagementService(accessAuthorizationService, localUsersRepository, teamsRepository, teamMembershipsRepository, projectMembershipsRepository, projectTeamAssignmentsRepository, projectsRepository, localInvitationsRepository, (input) => localDataService.recordActivity(input), async ({ email, fullName }) => {
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
    });
    localDataService.setAccessManagement(accessManagementService);
    localDataService.setViewerBaseUrl(appUrl);
    localDataService.repairBagProjectAssets();
    const broadArrowRepair = localDataService.repairBroadArrowConfiguration();
    const legacyRuntimeMigrations = localDataService.migrateAllLegacyEngineRuntimeAssets();
    if (broadArrowRepair.credentialsMigrated) {
        console.info("[desktop] Broad Arrow credentials migrated from legacy storage");
    }
    if (legacyRuntimeMigrations.length > 0) {
        console.info(`[desktop] Legacy engine runtime assets migrated count=${legacyRuntimeMigrations.length}`);
    }
    if (devMode) {
        await waitForDevHealth(appUrl);
    }
    localDataService.reconcileDisabledDisplayViewerWindows();
    const authAllowed = authLicenseManager.isAccessAllowed();
    let savedPath = (0, startup_route_1.readSavedStartupPath)(appSettingsRepository);
    if (savedPath && !authAllowed) {
        (0, startup_route_1.clearSavedStartupPath)(appSettingsRepository);
        savedPath = null;
    }
    const startupPath = (0, startup_route_1.resolveDesktopStartupPath)({
        savedPath,
        preferredPath: authAllowed
            ? (0, startup_route_1.resolveVerifiedProjectStartupPath)({
                defaultProjectSlug: localDataService.getDefaultProjectSlug(),
                projectExists: (slug) => Boolean(projectsRepository.getBySlug(slug)),
            })
            : undefined,
    });
    const rendererUrl = (0, startup_route_1.joinRendererUrl)(appUrl, startupPath);
    console.info(`[NEUD Desktop] Loading renderer URL: ${rendererUrl}`);
    const preloadPath = path_1.default.join(__dirname, "preload.js");
    const appSession = electron_1.session.fromPartition("persist:neud");
    const applicationIcon = resolveDesktopApplicationIcon();
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        show: false,
        title: "NEUD",
        autoHideMenuBar: true,
        ...(applicationIcon ? { icon: applicationIcon } : {}),
        ...(process.platform === "darwin"
            ? { titleBarStyle: "hiddenInset" }
            : {
                titleBarStyle: "hidden",
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
        if ((0, external_url_1.isAllowedExternalUrl)(url)) {
            void electron_1.shell.openExternal(url);
        }
        return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(appUrl)) {
            event.preventDefault();
            if ((0, external_url_1.isAllowedExternalUrl)(url)) {
                void electron_1.shell.openExternal(url);
            }
        }
    });
    attachStartupRoutePersistence(mainWindow, appSettingsRepository, appUrl, authAllowed);
    attachDevStartupRecovery(mainWindow, appUrl, appSettingsRepository, devMode);
    forceSignOutFromMain = async () => {
        console.info("[logout] Main process force sign-out started");
        appSettingsRepository.set(session_recovery_keys_1.AUTH_EXPLICITLY_SIGNED_OUT_KEY, true);
        authLicenseManager.clear();
        supabaseUserSessionService.clearSession();
        authenticatedCloud.notifySessionCleared();
        localDataService?.resetIdentity();
        clearIdentityOnSession?.();
        stopUserDirectorySync?.();
        (0, startup_route_1.clearSavedStartupPath)(appSettingsRepository);
        localAuthBootstrap.getSessionTokenService().clearSessionBinding();
        try {
            await fetch(`${appUrl}/api/local/reset-session-cache`, { method: "POST" });
            console.info("[logout] Next.js session cache reset requested");
        }
        catch (error) {
            console.warn("[logout] Next.js session cache reset failed", error);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            const loginUrl = (0, startup_route_1.joinRendererUrl)(appUrl, "/");
            console.info(`[logout] Redirecting renderer to ${loginUrl}`);
            await loadRendererUrl(mainWindow, loginUrl);
        }
        console.info("[logout] Main process force sign-out completed");
        return { ok: true };
    };
    (0, application_menu_1.setClearLocalSessionHandler)(() => {
        void forceSignOutFromMain?.();
    });
    await loadRendererUrl(mainWindow, rendererUrl);
    attachMainWindowCloseHandler();
    mainWindow.show();
    (0, auto_update_service_1.initializeAutoUpdateService)({
        getMainWindow: () => mainWindow,
        logActivity: (type, message, metadata) => {
            console.info(`[updates] ${type}: ${message}`, metadata ?? {});
        },
    });
    (0, auto_update_service_1.setHelpMenuCheckForUpdatesHandler)(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
        }
        void (0, auto_update_service_1.checkForUpdates)("menu");
    });
    (0, auto_update_service_1.scheduleStartupUpdateCheck)();
}
async function waitForDevHealth(baseUrl) {
    const started = Date.now();
    while (Date.now() - started < 120000) {
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok)
                return;
        }
        catch {
            // retry
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Next.js dev server did not become ready.");
}
function attachStartupRoutePersistence(window, settings, appUrl, authAllowed) {
    if (!authAllowed) {
        return;
    }
    const recordPath = (url) => {
        if (!url.startsWith(appUrl)) {
            return;
        }
        const pathname = new URL(url).pathname;
        (0, startup_route_1.persistStartupPath)(settings, pathname);
    };
    window.webContents.on("did-navigate", (_event, url) => {
        recordPath(url);
    });
    window.webContents.on("did-navigate-in-page", (_event, url) => {
        recordPath(url);
    });
}
function attachDevStartupRecovery(window, appUrl, settings, devMode) {
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
            console.warn(`[NEUD Desktop] Startup route returned 404 (${currentPath}); recovering to ${startup_route_1.DESKTOP_FALLBACK_LANDING_PATH}`);
            recoveredFrom404 = true;
            (0, startup_route_1.clearSavedStartupPath)(settings);
            void window.loadURL((0, startup_route_1.joinRendererUrl)(appUrl, startup_route_1.DESKTOP_FALLBACK_LANDING_PATH));
        })
            .catch(() => {
            // ignore renderer inspection failures
        });
    });
}
async function loadRendererUrl(window, url) {
    try {
        await window.loadURL(url);
    }
    catch (error) {
        if (!isNavigationAbortError(error)) {
            throw error;
        }
    }
}
function isNavigationAbortError(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ERR_ABORTED");
}
