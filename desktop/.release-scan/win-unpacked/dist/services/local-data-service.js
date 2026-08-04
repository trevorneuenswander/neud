"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalDataService = void 0;
const lot_photo_overrides_1 = require("../bag/live-state/lot-photo-overrides");
const crypto_1 = require("crypto");
const resolve_user_details_profile_1 = require("./resolve-user-details-profile");
const auth_session_verification_service_1 = require("./auth-session-verification-service");
const neud_instance_id_1 = require("./neud-instance-id");
const messages_1 = require("../auth/messages");
const local_desktop_identity_1 = require("../auth/local-desktop-identity");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const portal_shapes_1 = require("../mappers/portal-shapes");
const new_auction_graphic_data_1 = require("../displays/new-auction-graphic-data");
const resolve_effective_display_data_1 = require("../displays/resolve-effective-display-data");
const resolve_local_controller_display_data_1 = require("../displays/resolve-local-controller-display-data");
const pylon_data_1 = require("../displays/pylon-data");
const display_data_source_1 = require("../displays/display-data-source");
const refresh_rate_1 = require("../displays/refresh-rate");
const display_size_1 = require("../displays/display-size");
const legacy_runtime_migration_1 = require("./legacy-runtime-migration");
const project_scraper_auth_1 = require("./project-scraper-auth");
const display_viewer_session_store_1 = require("./display-viewer-session-store");
const bag_runtime_config_1 = require("../bag/config/bag-runtime-config");
const execution_log_session_store_1 = require("./execution-log-session-store");
const engine_status_session_store_1 = require("./engine-status-session-store");
const activity_session_store_1 = require("./activity-session-store");
const deprecated_activity_types_1 = require("./deprecated-activity-types");
const activity_display_1 = require("./activity-display");
const project_permissions_1 = require("../projects/project-permissions");
const activity_message_1 = require("./activity-message");
const poll_interval_format_1 = require("./poll-interval-format");
const channels_1 = require("../ipc/channels");
const electron_1 = require("electron");
const display_preview_window_manager_1 = require("./display-preview-window-manager");
const local_day_1 = require("../lib/time/local-day");
const lot_manual_photo_import_1 = require("./lot-manual-photo-import");
const auction_data_paths_1 = require("./auction-data-paths");
const auction_download_json_sync_1 = require("./auction-download-json-sync");
const auction_download_size_1 = require("./auction-download-size");
const merge_display_order_1 = require("../lib/displays/merge-display-order");
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const canonical_project_data_1 = require("../displays/canonical-project-data");
const normalize_broad_arrow_display_data_1 = require("../displays/normalize-broad-arrow-display-data");
const publishing_1 = require("../publishing");
const REGISTRY_DISPLAY_KEYS = new Set([
    "pylon",
    "lower-ticker-v5",
    "new-bid-display-v1",
    "new-ticker-v1",
]);
class LocalDataService {
    projects;
    dataSources;
    displays;
    settings;
    bagSources;
    genericScraper;
    pylonDisplays;
    lowerTickerDisplays;
    newAuctionDisplays;
    bagLiveState;
    paths;
    auth;
    memberships;
    projectDeletion;
    bagRepair;
    broadArrowPhase;
    credentials;
    userDisplayOrder;
    localApiBaseUrl = "http://127.0.0.1:8070";
    viewerBaseUrl = "http://127.0.0.1:3000";
    executionLogSession = new execution_log_session_store_1.ExecutionLogSessionStore();
    engineStatusSession = new engine_status_session_store_1.EngineStatusSessionStore();
    activitySession;
    activityEventsRepository;
    activitySync = null;
    activitySyncState = null;
    userDirectorySync = null;
    userDirectorySyncState = null;
    cloudCoordinator = null;
    activitySubscribers = new Set();
    displayDataSourceSubscribers = new Set();
    offlineAuctionService = null;
    auctionDatasetService = null;
    executionLogListeners = new Set();
    engineStatusListeners = new Set();
    displayDataRevision = 0;
    canonicalRevisionTrackers = new Map();
    publishingManager = null;
    pendingExportCommands = new Map();
    exportCommandByEngine = new Map();
    exportGenerationByEngine = new Map();
    exportWorkerEventListeners = new Set();
    startupDiagnosticsLogged = false;
    displayViewerSessions = new display_viewer_session_store_1.DisplayViewerSessionStore();
    engineManager = null;
    accessAuthorization = null;
    displayCodeRepo = null;
    accessManagement = null;
    supabaseIdentity = null;
    constructor(projects, dataSources, displays, settings, bagSources, genericScraper, pylonDisplays, lowerTickerDisplays, newAuctionDisplays, bagLiveState, paths, auth, memberships, projectDeletion, bagRepair, broadArrowPhase, credentials, activityEvents, userDisplayOrder) {
        this.projects = projects;
        this.dataSources = dataSources;
        this.displays = displays;
        this.settings = settings;
        this.bagSources = bagSources;
        this.genericScraper = genericScraper;
        this.pylonDisplays = pylonDisplays;
        this.lowerTickerDisplays = lowerTickerDisplays;
        this.newAuctionDisplays = newAuctionDisplays;
        this.bagLiveState = bagLiveState;
        this.paths = paths;
        this.auth = auth;
        this.memberships = memberships;
        this.projectDeletion = projectDeletion;
        this.bagRepair = bagRepair;
        this.broadArrowPhase = broadArrowPhase;
        this.credentials = credentials;
        this.userDisplayOrder = userDisplayOrder;
        this.activityEventsRepository = activityEvents ?? null;
        this.activitySession = new activity_session_store_1.ActivitySessionStore(activityEvents ?? null);
    }
    setActivitySync(service) {
        this.activitySync = service;
        service.subscribe((state) => {
            this.activitySyncState = state;
        });
    }
    setSupabaseIdentity(service) {
        this.supabaseIdentity = service;
    }
    getSupabaseIdentity() {
        return this.supabaseIdentity;
    }
    async ensureIdentityLoaded(reason = "api") {
        await this.supabaseIdentity?.ensureLoaded(reason);
    }
    kickIdentityResolution(reason = "background") {
        const identity = this.supabaseIdentity?.getResolvedIdentity();
        if (identity?.status === "loading") {
            return;
        }
        if (identity?.status === "online-ready" ||
            identity?.status === "offline-ready") {
            return;
        }
        void this.supabaseIdentity?.ensureLoaded(reason);
    }
    async refreshIdentity(reason = "manual") {
        await this.supabaseIdentity?.refresh(reason);
    }
    resetIdentity() {
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
    setUserDirectorySync(input) {
        this.userDirectorySync = input.service;
        this.cloudCoordinator = input.cloud;
        input.service.subscribe((state) => {
            this.userDirectorySyncState = state;
        });
    }
    getAuthStatusBundle() {
        const auth = this.auth.getStatus();
        const userDirectorySync = this.userDirectorySyncState ?? this.userDirectorySync?.getState() ?? {
            status: "idle",
            message: "User directory sync unavailable.",
            lastSuccessfulSyncAt: null,
            lastResult: null,
            syncInProgress: false,
            connectionOnline: false,
        };
        return {
            auth,
            connectionStatus: auth.mode === "online" || userDirectorySync.connectionOnline
                ? "connected"
                : "offline",
            userDirectorySync: {
                status: userDirectorySync.status,
                message: userDirectorySync.message,
                lastSuccessfulSyncAt: userDirectorySync.lastSuccessfulSyncAt,
                syncInProgress: userDirectorySync.syncInProgress,
                connectionOnline: userDirectorySync.connectionOnline,
            },
        };
    }
    async verifyOnlineSession() {
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
            const verification = await (0, auth_session_verification_service_1.verifyAuthenticatedSupabaseSession)({
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
                await this.refreshIdentity("verify-online");
                await this.userDirectorySync?.syncNow("reconnect");
            }
            else if (verification.status === "offline") {
                this.auth.setConnectionOnline(false);
            }
            return {
                verification,
                status: this.getAuthStatusBundle(),
            };
        }
        catch {
            this.auth.setConnectionOnline(false);
            return {
                verification: { status: "offline" },
                status: this.getAuthStatusBundle(),
            };
        }
    }
    async syncUserDirectory(reason = "manual") {
        if (this.userDirectorySync) {
            if (reason === "users-page" && !this.userDirectorySync.isStale()) {
                return this.getAuthStatusBundle();
            }
            await this.userDirectorySync.syncNow(reason);
        }
        return this.getAuthStatusBundle();
    }
    getActivitySyncState() {
        return this.activitySyncState ?? this.activitySync?.getState() ?? null;
    }
    async syncActivityNow() {
        await this.activitySync?.syncNow("manual");
        this.notifyActivitySyncChanged();
    }
    notifyActivitySyncChanged() {
        this.refreshActivityFromStore();
    }
    getActivitySessionStore() {
        return this.activitySession;
    }
    refreshActivityFromStore() {
        this.activitySession.reloadFromRepository();
        this.pushActivitySnapshot();
    }
    pushActivitySnapshot() {
        for (const windowId of this.activitySubscribers) {
            const window = electron_1.BrowserWindow.fromId(windowId);
            if (window && !window.isDestroyed()) {
                (0, channels_1.sendToRenderer)(window, "neud:activity:snapshot", {
                    entries: this.getActivitySnapshot(),
                    overviewEntries: this.getActivityOverviewSnapshot(),
                });
            }
        }
    }
    setLocalApiBaseUrl(baseUrl) {
        this.localApiBaseUrl = baseUrl.replace(/\/$/, "");
    }
    setViewerBaseUrl(baseUrl) {
        this.viewerBaseUrl = baseUrl.replace(/\/$/, "");
    }
    attachOfflineAuctionService(service) {
        this.offlineAuctionService = service;
    }
    attachAuctionDatasetService(service) {
        this.auctionDatasetService = service;
    }
    setPublishingManager(manager) {
        this.publishingManager = manager;
    }
    getPublishingDiagnostics() {
        return this.publishingManager?.getDiagnostics() ?? null;
    }
    getProjectPublishingDiagnostics(projectId) {
        return this.publishingManager?.getProjectDiagnostics(projectId) ?? null;
    }
    async setProjectPublishingEnabled(projectId, enabled) {
        if (!this.publishingManager) {
            throw new Error("Publishing is unavailable.");
        }
        await this.publishingManager.setProjectPublishingEnabled(projectId, enabled);
    }
    notifyProjectCanonicalMayHaveChanged(projectId) {
        this.publishingManager?.notifyProjectCanonicalMayHaveChanged(projectId);
    }
    setEngineManager(engineManager) {
        this.engineManager = engineManager;
    }
    setAccessAuthorization(service) {
        this.accessAuthorization = service;
    }
    setProjectDisplayCodeRepository(repository) {
        this.displayCodeRepo = repository;
    }
    getAccessAuthorization() {
        return this.accessAuthorization;
    }
    getAuthorizationContext() {
        return this.accessAuthorization?.getAuthorizationContext() ?? null;
    }
    setAccessManagement(service) {
        this.accessManagement = service;
    }
    getProjectAccessUsers(projectId) {
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
    async getUserDetails(targetUserId) {
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId || !this.accessManagement) {
            throw new Error("You do not have permission to view users.");
        }
        const base = this.accessManagement.getUserDetails(userId, targetUserId);
        const identity = this.supabaseIdentity?.getResolvedIdentity() ?? null;
        const supabaseUserId = base.user.supabaseUserId?.trim() || null;
        let source = "local-cache";
        let remoteProfile = null;
        if (this.supabaseIdentity?.isOnlineReady() &&
            supabaseUserId) {
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
        const fields = (0, resolve_user_details_profile_1.resolveUserDetailsFields)({
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
    createTeam(input) {
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId || !this.accessManagement) {
            throw new Error("You do not have permission to create teams.");
        }
        return this.accessManagement.createTeam(userId, input);
    }
    assignProjectTeam(input) {
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId || !this.accessManagement) {
            throw new Error("You do not have permission to move projects between teams.");
        }
        return this.accessManagement.assignProjectToTeam(userId, input);
    }
    setProjectTeams(input) {
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId || !this.accessManagement) {
            throw new Error("You do not have permission to assign project teams.");
        }
        return this.accessManagement.setProjectTeams(userId, input);
    }
    updateTeam(teamId, input) {
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId || !this.accessManagement) {
            throw new Error("You do not have permission to manage teams.");
        }
        return this.accessManagement.updateTeam(userId, teamId, input);
    }
    inviteAccessUser(input) {
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId || !this.accessManagement) {
            throw new Error("You do not have permission to invite users.");
        }
        return this.accessManagement.inviteUser(userId, input);
    }
    upsertAccessTeamMember(input) {
        const actorUserId = this.auth.getAuthenticatedUser()?.userId;
        if (!actorUserId || !this.accessManagement) {
            throw new Error("You do not have permission to manage team members.");
        }
        return this.accessManagement.upsertTeamMember(actorUserId, input);
    }
    setAccessUserActive(targetUserId, isActive) {
        const actorUserId = this.auth.getAuthenticatedUser()?.userId;
        if (!actorUserId || !this.accessManagement) {
            throw new Error("You do not have permission to manage users.");
        }
        return this.accessManagement.setUserActive(actorUserId, targetUserId, isActive);
    }
    assignAccessProject(input) {
        const actorUserId = this.auth.getAuthenticatedUser()?.userId;
        if (!actorUserId || !this.accessManagement) {
            throw new Error("You do not have permission to assign projects.");
        }
        return this.accessManagement.setProjectAssignment(actorUserId, input);
    }
    removeAccessProjectAssignment(projectId, teamId, userId) {
        const actorUserId = this.auth.getAuthenticatedUser()?.userId;
        if (!actorUserId || !this.accessManagement) {
            throw new Error("You do not have permission to remove project assignments.");
        }
        return this.accessManagement.removeProjectAssignment(actorUserId, projectId, teamId, userId);
    }
    removeProjectAccessPath(input) {
        const actorUserId = this.auth.getAuthenticatedUser()?.userId;
        if (!actorUserId || !this.accessManagement) {
            throw new Error("You do not have permission to remove project access.");
        }
        return this.accessManagement.removeProjectAccessPath(actorUserId, input);
    }
    recordDisplayViewerHeartbeat(input) {
        return this.displayViewerSessions.touch(input);
    }
    getAccessibleProjectIds() {
        const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
        if (this.accessAuthorization && userId) {
            const projects = this.accessAuthorization.getAccessibleProjects(userId);
            return new Set(projects.map((project) => project.id));
        }
        const role = this.resolveCurrentProjectRole();
        const canSeeInactive = (0, project_permissions_1.canManageProjectSettings)(role);
        let records = this.projects.list();
        if (!canSeeInactive) {
            records = records.filter((project) => (0, project_permissions_1.normalizeProjectIsActive)(project));
        }
        return new Set(records.map((project) => project.id));
    }
    getActiveDisplayCount(accessibleProjectIds) {
        const projectIds = [
            ...(accessibleProjectIds ?? this.getAccessibleProjectIds()),
        ];
        return this.displays.countActiveForProjects(projectIds);
    }
    getRunningEngineCount(accessibleProjectIds) {
        const accessible = accessibleProjectIds ?? this.getAccessibleProjectIds();
        const summaries = this.engineManager?.getRunningEngineSummaries() ?? [];
        const runningEngineIds = new Set();
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
        return this.displayViewerSessions.countActiveSessions(display_viewer_session_store_1.DISPLAY_VIEWER_STALE_MS);
    }
    getActiveAuctionDatasetDisplay(projectId) {
        if (!this.auctionDatasetService) {
            return {
                reference: { source: "live-snapshot", loadedAt: new Date().toISOString() },
                label: "Live scraper snapshot",
                tooltip: "Live scraper snapshot",
            };
        }
        return this.auctionDatasetService.getDisplayInfo(projectId);
    }
    getActiveDownloadedDataset(projectId) {
        if (!this.auctionDatasetService || !this.auctionDatasetService.isFileDatasetActive(projectId)) {
            return null;
        }
        return this.auctionDatasetService.readActiveDataset(projectId);
    }
    dismissWebpageExportOperation(projectId, operationId) {
        if (!this.offlineAuctionService) {
            return { ok: false, error: "Export service is unavailable." };
        }
        return this.offlineAuctionService.dismissCurrentWebpageExportOperation(projectId, operationId);
    }
    listAuctionDownloads(projectId) {
        return this.auctionDatasetService?.listCompletedDownloads(projectId) ?? [];
    }
    refreshAuctionDataset(projectId) {
        if (!this.auctionDatasetService) {
            return this.getActiveAuctionDatasetDisplay(projectId);
        }
        const reference = this.auctionDatasetService.resolveActiveReference(projectId);
        if (reference?.filePath) {
            const totalSizeBytes = (0, auction_download_json_sync_1.getDownloadSizeForJsonPath)(reference.filePath);
            this.auctionDatasetService.setReference(projectId, {
                ...reference,
                totalSizeBytes,
                totalSizeFormatted: (0, auction_download_size_1.formatDownloadSize)(totalSizeBytes),
            });
        }
        return this.auctionDatasetService.getDisplayInfo(projectId);
    }
    clearAllAuctionDownloads(projectId) {
        if (!this.auctionDatasetService) {
            return { ok: false, error: "Auction dataset service is unavailable." };
        }
        const result = this.auctionDatasetService.clearAllDownloads(projectId);
        if (result.ok) {
            const actor = this.resolveCurrentActivityActor();
            const reset = this.bagLiveState.clearDownloadedDatasetState(projectId, actor);
            if (!reset.ok) {
                return { ok: false, error: reset.error };
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
    resolveAuctionDownloadFolder(projectId) {
        return this.auctionDatasetService?.getActiveDownloadFolder(projectId) ?? null;
    }
    getProjectAuctionDataDirectory(projectId) {
        if (!this.auctionDatasetService)
            return null;
        const slug = this.auctionDatasetService.resolveProjectSlug(projectId);
        return path_1.default.join(this.paths.root, "auction-data", slug);
    }
    getProjectById(projectId) {
        return this.projects.getById(projectId);
    }
    resolveProjectRecord(segment) {
        const trimmed = segment.trim();
        if (!trimmed) {
            return null;
        }
        return this.projects.getById(trimmed) ?? this.projects.getBySlug(trimmed);
    }
    getCanonicalRevisionTracker(projectId) {
        const existing = this.canonicalRevisionTrackers.get(projectId);
        if (existing) {
            return existing;
        }
        const tracker = new publishing_1.CanonicalRevisionTracker();
        this.canonicalRevisionTrackers.set(projectId, tracker);
        return tracker;
    }
    isProjectCanonicalSourceConnected(projectId) {
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
    getLocalCanonicalProjectResponse(projectId) {
        const project = this.resolveProjectRecord(projectId);
        if (!project) {
            return {
                ok: false,
                availability: "unavailable",
                payload: null,
                runtime: {
                    localActive: true,
                    dataConnected: false,
                    contractVersion: publishing_1.NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION,
                },
                error: "Project not found.",
            };
        }
        const snapshot = this.getActiveCanonicalProjectSnapshot(project.id);
        const sourceConnected = this.isProjectCanonicalSourceConnected(project.id);
        const runtime = {
            localActive: true,
            dataConnected: sourceConnected,
            contractVersion: publishing_1.NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION,
        };
        if (!snapshot) {
            return {
                ok: true,
                availability: "no_data",
                payload: null,
                runtime,
            };
        }
        const serialized = (0, canonical_project_data_1.serializeCanonicalProjectSnapshot)(snapshot);
        if (!serialized) {
            return {
                ok: true,
                availability: "no_data",
                payload: null,
                runtime,
            };
        }
        const sanitized = (0, publishing_1.sanitizeCanonicalProjectData)(serialized);
        const revisionState = this.getCanonicalRevisionTracker(project.id).observeCanonicalData(sanitized);
        const now = new Date().toISOString();
        const instanceId = (0, neud_instance_id_1.getOrCreateNeudInstanceId)(this.settings);
        return {
            ok: true,
            availability: "ready",
            payload: (0, publishing_1.buildPublishedProjectPayload)({
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
    getLotThumbnailPhotos(projectId, lotNumber) {
        if (!this.auctionDatasetService || !this.offlineAuctionService) {
            return [];
        }
        const reference = this.auctionDatasetService.resolveActiveReference(projectId);
        if (reference?.source === "live-snapshot" || !reference?.filePath) {
            return [];
        }
        const dataset = this.auctionDatasetService.readActiveDataset(projectId);
        const packageId = path_1.default.basename(path_1.default.dirname(reference.filePath));
        const photos = this.offlineAuctionService.getLotThumbnailsFromDataset(dataset, lotNumber, packageId);
        const overrides = this.bagLiveState.getLotPhotoOverrides(projectId);
        return (0, lot_photo_overrides_1.applyLotPhotoOverrides)(photos, overrides, lotNumber);
    }
    async importLotPhotos(projectId, lotNumber, sourcePaths) {
        if (!this.auctionDatasetService) {
            return {
                ok: false,
                error: "Auction dataset service is unavailable.",
                imported: [],
                rejected: sourcePaths,
            };
        }
        let jsonPath = this.auctionDatasetService.resolveActiveReference(projectId)?.filePath;
        let packageDir = jsonPath ? path_1.default.dirname(jsonPath) : null;
        if (!jsonPath || !packageDir || !fs_1.default.existsSync(jsonPath)) {
            const created = this.auctionDatasetService.createManualWorkingDownload(projectId);
            packageDir = (0, auction_data_paths_1.finalizeDownloadPackage)(created.packageDir);
            jsonPath = path_1.default.join(packageDir, path_1.default.basename(created.jsonPath));
            this.auctionDatasetService.setDownloaded(projectId, jsonPath);
        }
        const packageId = path_1.default.basename(packageDir);
        const imported = await (0, lot_manual_photo_import_1.importManualLotPhotosToDownload)({
            packageDir: packageDir,
            jsonPath: jsonPath,
            lotNumber,
            sourcePaths,
            buildDisplayUrl: (relativePath) => this.offlineAuctionService.buildAssetUrl(packageId, relativePath),
        });
        if (imported.imported.length === 0) {
            return {
                ok: false,
                error: imported.rejected.length > 0
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
            const totalSizeBytes = (0, auction_download_json_sync_1.getDownloadSizeForJsonPath)(jsonPath);
            this.auctionDatasetService.setReference(projectId, {
                ...this.auctionDatasetService.resolveActiveReference(projectId),
                totalSizeBytes,
                totalSizeFormatted: (0, auction_download_size_1.formatDownloadSize)(totalSizeBytes),
            });
        }
        return {
            ok: true,
            imported: imported.imported,
            rejected: imported.rejected,
        };
    }
    getLotDatasetDetails(projectId, lotNumber) {
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
    hasDirtyLocalControllerDraft(projectId) {
        const envelope = this.bagLiveState.getLiveStateEnvelope(projectId);
        const draft = envelope?.localControllerDraft;
        if (!draft)
            return false;
        return Boolean(draft.lotDirty || draft.bidDirty);
    }
    restoreAuctionDatasets() {
        if (!this.auctionDatasetService || !this.offlineAuctionService)
            return;
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            const display = this.auctionDatasetService.resolveActiveReference(project.id);
            if (!display?.filePath)
                continue;
            if (!this.auctionDatasetService.isFileDatasetActive(project.id))
                continue;
            const loaded = this.offlineAuctionService.loadJsonExport(project.id, display.filePath);
            if (!loaded.ok || !loaded.auctionData)
                continue;
            this.bagLiveState.loadOfflineAuction(project.id, loaded.auctionData, {
                id: null,
                email: null,
            });
        }
    }
    resolveOfflineAsset(packageId, relativePath) {
        if (packageId.startsWith("manual-")) {
            const projectId = packageId.slice("manual-".length);
            const manualPath = (0, lot_manual_photo_import_1.resolveManualPhotoAssetPath)(this.paths, projectId, relativePath);
            return manualPath;
        }
        return this.offlineAuctionService?.resolveAssetPath(packageId, relativePath) ?? null;
    }
    hasValidScraperSnapshotForExport(projectId) {
        return this.offlineAuctionService?.hasValidScraperSnapshot(projectId) ?? false;
    }
    getViewerBaseUrl() {
        return this.viewerBaseUrl;
    }
    resolveCurrentProjectRole(projectId) {
        const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
        if (userId && this.accessAuthorization) {
            if (projectId) {
                const capabilities = this.accessAuthorization.getProjectCapabilities(userId, projectId);
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
            if (context?.teamMemberships.some((membership) => membership.role === "admin" && membership.isActive && membership.teamIsActive)) {
                return "admin";
            }
            if (context?.teamMemberships.some((membership) => membership.role === "operator" && membership.isActive && membership.teamIsActive)) {
                return "operator";
            }
            return "viewer";
        }
        const user = this.auth.getAuthenticatedUser();
        if (projectId && user?.userId) {
            const membershipRole = this.memberships.getProjectRole(user.userId, projectId);
            if (membershipRole) {
                return membershipRole;
            }
        }
        return (0, project_permissions_1.resolveAuthenticatedProjectRole)({
            role: user?.role ?? this.auth.getStatus().role,
        });
    }
    isElevatedAccessUser() {
        const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
        const context = userId
            ? this.accessAuthorization?.getAuthorizationContext(userId)
            : null;
        if (context) {
            return (context.isPlatformOwner ||
                context.teamMemberships.some((membership) => membership.role === "admin" && membership.isActive && membership.teamIsActive));
        }
        return (0, project_permissions_1.canManageProjectSettings)(this.resolveCurrentProjectRole());
    }
    isPureViewerUser() {
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
        const hasAdmin = context.teamMemberships.some((membership) => membership.role === "admin" && membership.isActive && membership.teamIsActive);
        const hasOperator = context.teamMemberships.some((membership) => membership.role === "operator" && membership.isActive && membership.teamIsActive);
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
        console.info(`[local-auth] identity=${user?.userId ? "resolved" : "missing"} userId=${(0, local_desktop_identity_1.abbreviateUserId)(user?.userId ?? "none")} localUserId=${(0, local_desktop_identity_1.abbreviateUserId)(resolved?.localUserId ?? "none")} profileSource=${resolved?.source ?? "none"} profileStatus=${resolved?.status ?? "none"} projectMemberships=${membershipCount} database=${this.paths.databaseFile}`);
    }
    shouldFilterInactiveProjects() {
        return !this.isElevatedAccessUser();
    }
    getProjectRecordBySlug(slug) {
        return this.projects.getBySlug(slug);
    }
    listProjects(query) {
        const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
        if (this.accessAuthorization && userId) {
            const accessible = new Set(this.accessAuthorization.getAccessibleProjects(userId).map((project) => project.id));
            let records = this.projects.search(query).filter((project) => accessible.has(project.id));
            const context = this.accessAuthorization.getAuthorizationContext(userId);
            if (!context?.isPlatformOwner) {
                records = records.filter((project) => (0, project_permissions_1.normalizeProjectIsActive)(project));
            }
            return records.map((project) => {
                const portalProject = (0, portal_shapes_1.toPortalProject)(project);
                const teams = context
                    ? this.accessAuthorization.getVisibleProjectTeams(context, project.id)
                    : [];
                return {
                    ...portalProject,
                    teams,
                };
            });
        }
        const role = this.resolveCurrentProjectRole();
        let records = this.projects.search(query);
        if (!(0, project_permissions_1.canManageProjectSettings)(role)) {
            records = records.filter((project) => (0, project_permissions_1.normalizeProjectIsActive)(project));
        }
        return records.map((project) => ({
            ...(0, portal_shapes_1.toPortalProject)(project),
            teams: [],
        }));
    }
    getDashboardData(limit = 5) {
        const accessibleProjectIds = this.getAccessibleProjectIds();
        const canSeeInactive = this.isElevatedAccessUser();
        let records = this.projects.list().filter((project) => accessibleProjectIds.has(project.id));
        if (!canSeeInactive) {
            records = records.filter((project) => (0, project_permissions_1.normalizeProjectIsActive)(project));
        }
        records.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
        const recentProjects = records.slice(0, limit).map((project) => ({
            id: project.id,
            slug: project.slug,
            name: project.name,
            description: project.description,
            isActive: (0, project_permissions_1.normalizeProjectIsActive)(project),
            updatedAt: project.updatedAt,
        }));
        const accessibleProjects = new Map(records.map((project) => [project.id, project]));
        const isPureViewer = this.isPureViewerUser();
        const normalizedActivity = isPureViewer
            ? []
            : this.getActivitySnapshot()
                .map((entry) => {
                const metadata = entry.metadata ?? {};
                const projectId = typeof metadata.projectId === "string" ? metadata.projectId : null;
                if (projectId && !accessibleProjectIds.has(projectId)) {
                    return null;
                }
                const project = projectId ? accessibleProjects.get(projectId) : null;
                if (!project) {
                    return null;
                }
                return (0, activity_display_1.normalizeActivityEventForDisplay)(entry, { id: project.id, slug: project.slug, name: project.name }, null);
            })
                .filter((entry) => entry !== null);
        const recentActivity = (0, activity_display_1.selectCompactActivityEvents)(normalizedActivity).map((entry) => ({
            id: entry.id,
            projectId: entry.projectId,
            projectSlug: entry.projectSlug ?? "",
            projectName: entry.projectName ?? "Unknown Project",
            type: entry.type ?? "",
            message: entry.message,
            actorName: entry.actorName,
            actorId: entry.actorId,
            createdAt: entry.createdAt,
        }));
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
    getProjectsListMeta() {
        const user = this.auth.getAuthenticatedUser();
        const status = this.auth.getStatus();
        const identity = this.supabaseIdentity?.getResolvedIdentity() ?? null;
        const filteringApplied = this.shouldFilterInactiveProjects();
        const projectCount = filteringApplied
            ? this.listProjects().length
            : this.projects.list().length;
        const mapStatus = (value) => {
            if (value === "loading" &&
                identity?.supabaseProfileResolved &&
                identity.profile.fullName) {
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
        const mapSource = (value) => {
            if (value === "supabase")
                return "supabase";
            if (value === "local-cache")
                return "local-user";
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
            identityMessage: identity?.status === "online-ready" || identity?.status === "offline-ready"
                ? null
                : identity?.errorMessage ?? null,
            identityRetryCount: identity?.retryCount ?? 0,
            localCacheSyncStatus: identity?.cacheSync.status,
            localCacheSyncErrorCode: identity?.localCacheSyncErrorCode ?? identity?.cacheSync.errorCode ?? null,
            conflictingLocalUserId: identity?.conflictingLocalUserId ?? null,
            isPlatformAdmin: this.isPlatformAdmin(),
            canCreateProject: this.canCreateProject(),
            canManageUsersAndAccess: this.accessAuthorization?.getAuthorizationContext()?.canManageUsersAndAccess ??
                false,
            authorizationContext: this.getAuthorizationContext(),
            canDeleteProject: this.auth.canDeleteProject(),
            defaultProjectSlug: this.broadArrowPhase.getDefaultProjectSlug(),
            filteringApplied,
        };
    }
    getDatabasePath() {
        return this.paths.databaseFile;
    }
    getProjectBySlug(slug) {
        const project = this.projects.getBySlug(slug);
        if (!project) {
            return null;
        }
        const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
        if (userId && this.accessAuthorization) {
            const capabilities = this.accessAuthorization.getProjectCapabilities(userId, project.id);
            if (!capabilities.canViewProject) {
                return null;
            }
            return (0, portal_shapes_1.toPortalProject)(project);
        }
        const role = this.resolveCurrentProjectRole(project.id);
        if (!(0, project_permissions_1.canAccessProject)(role, project)) {
            return null;
        }
        return (0, portal_shapes_1.toPortalProject)(project);
    }
    updateProjectSettings(slug, input) {
        if (!this.auth.isAccessAllowed()) {
            throw new Error(messages_1.SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE);
        }
        const existing = this.projects.getBySlug(slug);
        if (!existing) {
            throw new Error("Project not found.");
        }
        const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
        const role = this.resolveCurrentProjectRole(existing.id);
        if (this.accessAuthorization && userId) {
            const capabilities = this.accessAuthorization.getProjectCapabilities(userId, existing.id);
            if (!capabilities.canEditProjectSettings) {
                throw new Error("You do not have permission to edit project settings.");
            }
        }
        else if (!(0, project_permissions_1.canManageProjectSettings)(role)) {
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
        const previousActive = (0, project_permissions_1.normalizeProjectIsActive)(existing);
        const previousDescription = existing.description?.trim() ?? "";
        const nextDescription = input.description === undefined
            ? previousDescription
            : (input.description?.trim() ?? "");
        const updated = this.projects.updateSettings(existing.id, {
            name: trimmedName,
            isActive: input.isActive,
            description: input.description === undefined ? undefined : input.description?.trim() || null,
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
        }
        else if (nameChanged || statusChanged || descriptionChanged) {
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
            const changes = [];
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
        return (0, portal_shapes_1.toPortalProject)(updated);
    }
    getPrimaryBagEngineIdForProject(projectId) {
        const project = this.projects.getById(projectId);
        if (!project || project.projectType !== "bag-graphics") {
            return null;
        }
        const engine = this.bagLiveState.getBagEngineForProject(projectId);
        return engine?.id ?? null;
    }
    slugExists(slug) {
        return this.projects.slugExists(slug);
    }
    createProject(input) {
        if (!this.auth.isAccessAllowed()) {
            throw new Error(messages_1.SIGN_IN_TO_NEUD_ACCOUNT_MESSAGE);
        }
        if (!this.canCreateProject()) {
            throw new Error("Only platform owners and admins may create projects.");
        }
        const project = this.projects.create(input);
        if (input.projectType === "webpage-scraper" || input.projectType === "bag-graphics") {
            const engine = this.dataSources.ensureWebpageScraper(project.id, input.projectType);
            if (input.projectType === "bag-graphics") {
                this.bagSources.ensureBagScraperSources(engine.id);
                if ((0, broad_arrow_phase_1.shouldAutoSeedBagDisplays)(project)) {
                    this.pylonDisplays.ensurePylonDisplay(project.id, this.viewerBaseUrl);
                    this.lowerTickerDisplays.ensureLowerTickerDisplay(project.id, this.viewerBaseUrl);
                    this.newAuctionDisplays.ensureNewBidDisplay(project.id, this.viewerBaseUrl);
                    this.newAuctionDisplays.ensureNewTickerDisplay(project.id, this.viewerBaseUrl);
                }
            }
            else if (input.projectType === "webpage-scraper") {
                this.genericScraper.ensureGenericScraperSources(engine.id);
            }
            this.normalizeEngineExecutionMode(engine.id);
        }
        return (0, portal_shapes_1.toPortalProject)(project);
    }
    ensureProjectEngines(projectId) {
        const project = this.projects.getById(projectId);
        if (!project)
            return [];
        if (project.projectType === "webpage-scraper" ||
            project.projectType === "bag-graphics") {
            const engine = this.dataSources.ensureWebpageScraper(projectId, project.projectType);
            if (project.projectType === "bag-graphics") {
                this.bagSources.ensureBagScraperSources(engine.id);
                if ((0, broad_arrow_phase_1.shouldAutoSeedBagDisplays)(project)) {
                    this.pylonDisplays.ensurePylonDisplay(projectId, this.viewerBaseUrl);
                    this.lowerTickerDisplays.ensureLowerTickerDisplay(projectId, this.viewerBaseUrl);
                    this.newAuctionDisplays.ensureNewBidDisplay(projectId, this.viewerBaseUrl);
                    this.newAuctionDisplays.ensureNewTickerDisplay(projectId, this.viewerBaseUrl);
                }
            }
            else if (project.projectType === "webpage-scraper") {
                this.genericScraper.ensureGenericScraperSources(engine.id);
            }
            this.normalizeEngineExecutionMode(engine.id);
        }
        return this.getProjectEngines(projectId);
    }
    listProjectDisplays(projectId) {
        const project = this.projects.getById(projectId);
        if (!project)
            return [];
        const isArchivedDisplay = (displayId) => this.displayCodeRepo?.getByDisplayId(displayId)?.archived ?? false;
        if ((0, broad_arrow_phase_1.isBroadArrowCanonicalProject)(project)) {
            const combined = this.displays
                .listByProject(projectId)
                .filter((display) => !isArchivedDisplay(display.id))
                .map((display) => this.toCustomPortalDisplay(display));
            const userId = this.auth.getAuthenticatedUser()?.userId;
            if (!userId || !this.userDisplayOrder) {
                return combined;
            }
            const savedOrder = this.userDisplayOrder.listForUserProject(userId, projectId);
            return (0, merge_display_order_1.mergeDisplayOrder)(combined, savedOrder.map((entry) => ({
                displayId: entry.displayId,
                sortIndex: entry.sortIndex,
            })));
        }
        const pylonRows = this.pylonDisplays
            .listProjectDisplays(projectId, this.viewerBaseUrl)
            .map((display) => (0, portal_shapes_1.toPortalDisplay)(display, this.viewerBaseUrl))
            .filter((display) => !isArchivedDisplay(display.id));
        const lowerTickerRows = this.lowerTickerDisplays
            .listProjectDisplays(projectId, this.viewerBaseUrl)
            .map((display) => (0, portal_shapes_1.toPortalDisplay)(display, this.viewerBaseUrl))
            .filter((display) => !isArchivedDisplay(display.id));
        this.newAuctionDisplays.ensureNewBidDisplay(projectId, this.viewerBaseUrl);
        this.newAuctionDisplays.ensureNewTickerDisplay(projectId, this.viewerBaseUrl);
        const newDisplayRows = this.displays
            .listByProject(projectId)
            .filter((display) => display.displayKey === "new-bid-display-v1" ||
            display.displayKey === "new-ticker-v1")
            .map((display) => (0, portal_shapes_1.toPortalDisplay)(display, this.viewerBaseUrl))
            .filter((display) => !isArchivedDisplay(display.id));
        const knownIds = new Set([...pylonRows, ...lowerTickerRows, ...newDisplayRows].map((display) => display.id));
        const knownKeys = new Set([...pylonRows, ...lowerTickerRows, ...newDisplayRows].map((display) => display.display_key));
        const customRows = this.displays
            .listByProject(projectId)
            .filter((display) => !REGISTRY_DISPLAY_KEYS.has(display.displayKey))
            .filter((display) => !isArchivedDisplay(display.id))
            .filter((display) => !knownIds.has(display.id) && !knownKeys.has(display.displayKey))
            .map((display) => this.toCustomPortalDisplay(display));
        const combined = [...pylonRows, ...lowerTickerRows, ...newDisplayRows, ...customRows];
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId || !this.userDisplayOrder) {
            return combined;
        }
        const savedOrder = this.userDisplayOrder.listForUserProject(userId, projectId);
        const resolvedOrder = (0, merge_display_order_1.mergeDisplayOrder)(combined, savedOrder.map((entry) => ({
            displayId: entry.displayId,
            sortIndex: entry.sortIndex,
        })));
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
    toCustomPortalDisplay(display) {
        const code = this.displayCodeRepo?.getByDisplayId(display.id);
        const slug = code?.slug ?? display.displayKey;
        const base = this.viewerBaseUrl.replace(/\/$/, "");
        const url = `${base}/display/${encodeURIComponent(display.projectId)}/${encodeURIComponent(slug)}`;
        return (0, portal_shapes_1.toPortalDisplay)({
            ...display,
            settings: {
                ...(display.settings ?? {}),
                url,
                displayType: "project-html",
            },
        }, this.viewerBaseUrl);
    }
    insertDisplayAfterInUserOrder(projectId, sourceDisplayId, newDisplayId) {
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
        }
        else {
            orderedIds.push(newDisplayId);
        }
        this.userDisplayOrder.saveOrder(userId, projectId, orderedIds);
    }
    appendDisplayToUserOrder(projectId, displayId) {
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
    getUserDisplayOrder(projectId) {
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId) {
            throw new Error("Sign in to load display order.");
        }
        if (!this.userDisplayOrder) {
            return [];
        }
        return this.userDisplayOrder.listForUserProject(userId, projectId);
    }
    saveUserDisplayOrder(projectId, displayIds) {
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId) {
            throw new Error("Sign in to save display order.");
        }
        if (!this.accessAuthorization) {
            throw new Error("You do not have permission to reorder displays.");
        }
        this.accessAuthorization.assertCanViewProject(userId, projectId);
        if (!this.userDisplayOrder) {
            throw new Error("Display order persistence is unavailable.");
        }
        if (!(0, broad_arrow_phase_1.isBroadArrowCanonicalProject)(this.projects.getById(projectId) ?? { slug: "" })) {
            this.pylonDisplays.listProjectDisplays(projectId, this.viewerBaseUrl);
            this.lowerTickerDisplays.listProjectDisplays(projectId, this.viewerBaseUrl);
            this.newAuctionDisplays.ensureNewBidDisplay(projectId, this.viewerBaseUrl);
            this.newAuctionDisplays.ensureNewTickerDisplay(projectId, this.viewerBaseUrl);
        }
        const projectDisplays = this.displays.listByProject(projectId);
        const knownIds = new Set(projectDisplays.map((display) => display.id));
        const idByKey = new Map(projectDisplays.map((display) => [display.displayKey, display.id]));
        const entries = [];
        const seen = new Set();
        for (const rawId of displayIds) {
            const trimmed = rawId.trim();
            if (!trimmed)
                continue;
            let resolved = trimmed;
            if (!knownIds.has(trimmed)) {
                const byKey = idByKey.get(trimmed);
                if (byKey) {
                    resolved = byKey;
                }
            }
            if (!knownIds.has(resolved) || seen.has(resolved))
                continue;
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
        console.debug("[DisplayOrder][SaveComplete]", {
            userId,
            projectId,
            rowCount,
            databasePath,
        });
        return { ok: true, rowCount };
    }
    setDisplayRefreshRate(projectId, displayIdOrKey, refreshRateMs) {
        const normalizedRefreshRateMs = (0, refresh_rate_1.normalizeDisplayRefreshRateMs)(refreshRateMs);
        if (!(0, refresh_rate_1.isAllowedDisplayRefreshRateMs)(normalizedRefreshRateMs)) {
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
                message: `Changed display refresh rate to ${(0, refresh_rate_1.formatDisplayRefreshRateLabel)(normalizedRefreshRateMs)}.`,
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
    setDisplaySize(projectId, displayIdOrKey, displayWidth, displayHeight) {
        if (!(0, display_size_1.isAllowedDisplaySize)(displayWidth, displayHeight)) {
            throw new Error("Unsupported display size.");
        }
        const display = this.resolveProjectDisplay(projectId, displayIdOrKey);
        if (!display) {
            throw new Error("Display not found.");
        }
        const size = (0, display_size_1.normalizeDisplaySize)(displayWidth, displayHeight);
        const updated = this.displays.setDisplaySize(display.id, size.displayWidth, size.displayHeight);
        if (!updated) {
            throw new Error("Display not found.");
        }
        const actor = this.resolveCurrentActivityActor();
        this.recordActivity({
            type: "display.size-changed",
            message: `Changed display size for "${display.name}" to ${(0, display_size_1.formatDisplaySizeLabel)(size.displayWidth, size.displayHeight)}.`,
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
    resolveProjectDisplay(projectId, displayIdOrKey) {
        const byId = this.displays.getById(displayIdOrKey);
        if (byId && byId.projectId === projectId) {
            return byId;
        }
        return this.displays.getByKey(projectId, displayIdOrKey);
    }
    removeUserDisplayOrderForDisplay(displayId) {
        this.userDisplayOrder?.removeForDisplay(displayId);
    }
    removeUserDisplayOrderForProject(projectId) {
        this.userDisplayOrder?.removeForProject(projectId);
    }
    isPylonDisplayEnabled() {
        return this.pylonDisplays.isPylonEnabled();
    }
    setPylonDisplayEnabled(enabled) {
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
    setLowerTickerDisplayEnabled(enabled) {
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
    getDisplayDataSource() {
        const stored = this.settings.get(display_data_source_1.DISPLAY_DATA_SOURCE_SETTING_KEY, "webpage-scraper");
        const normalized = (0, display_data_source_1.normalizeDisplayDataSource)(stored);
        if (normalized !== stored) {
            this.settings.set(display_data_source_1.DISPLAY_DATA_SOURCE_SETTING_KEY, normalized);
        }
        return normalized;
    }
    subscribeDisplayDataSource(window) {
        this.displayDataSourceSubscribers.add(window.id);
        if (!window.isDestroyed()) {
            (0, channels_1.sendToRenderer)(window, "neud:displayDataSource:changed", {
                source: this.getDisplayDataSource(),
            });
        }
    }
    unsubscribeDisplayDataSource(window) {
        this.displayDataSourceSubscribers.delete(window.id);
    }
    setDisplayDataSource(source) {
        if (!(0, display_data_source_1.isDisplayDataSource)(source)) {
            throw new Error("Invalid display data source.");
        }
        const previous = this.getDisplayDataSource();
        if (previous === source) {
            return source;
        }
        this.settings.set(display_data_source_1.DISPLAY_DATA_SOURCE_SETTING_KEY, source);
        this.displayDataRevision += 1;
        this.pushDisplayDataSourceChanged(source);
        const label = (0, display_data_source_1.displayDataSourceLabel)(source);
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
                this.notifyProjectCanonicalMayHaveChanged(project.id);
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
    pushDisplayDataSourceChanged(source) {
        for (const windowId of this.displayDataSourceSubscribers) {
            const window = electron_1.BrowserWindow.fromId(windowId);
            if (window && !window.isDestroyed()) {
                (0, channels_1.sendToRenderer)(window, "neud:displayDataSource:changed", { source });
            }
        }
    }
    notifyPlatformDisplayConnectionChanged(displayId, enabled) {
        if (!enabled) {
            if (this.viewerBaseUrl) {
                (0, display_preview_window_manager_1.reconcileDisplayViewerWindows)(displayId, this.viewerBaseUrl);
            }
            else {
                (0, display_preview_window_manager_1.closeDisplayViewerWindows)(displayId);
            }
        }
        for (const window of electron_1.BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) {
                (0, channels_1.sendToRenderer)(window, "neud:displayConnection:changed", {
                    displayId,
                    enabled,
                });
            }
        }
    }
    reconcileDisabledDisplayViewerWindows() {
        const baseUrl = this.viewerBaseUrl;
        if (!baseUrl)
            return;
        if (!this.isPylonDisplayEnabled()) {
            (0, display_preview_window_manager_1.reconcileDisplayViewerWindows)("pylon", baseUrl);
        }
        if (!this.isLowerTickerDisplayEnabled()) {
            (0, display_preview_window_manager_1.reconcileDisplayViewerWindows)("lower-ticker-v5", baseUrl);
        }
        if (!this.isNewBidDisplayEnabled()) {
            (0, display_preview_window_manager_1.reconcileDisplayViewerWindows)("new-bid-display-v1", baseUrl);
        }
        if (!this.isNewTickerDisplayEnabled()) {
            (0, display_preview_window_manager_1.reconcileDisplayViewerWindows)("new-ticker-v1", baseUrl);
        }
    }
    getDisplayDataRevision() {
        return this.displayDataRevision;
    }
    isAnyEngineSessionActive() {
        for (const project of this.projects.list()) {
            for (const engine of this.dataSources.listByProject(project.id)) {
                if (engine.desiredState === "running") {
                    return true;
                }
                const status = this.dataSources.getStatus(engine.id);
                const actualState = status?.actualState ?? "stopped";
                if (actualState === "starting" ||
                    actualState === "running" ||
                    actualState === "stopping" ||
                    actualState === "scraping") {
                    return true;
                }
            }
        }
        return false;
    }
    getPylonDisplayData(options) {
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
        const waitingForManual = source === "local-controller" &&
            !effective.localControllerState?.currentLot?.lotNumber?.trim();
        return {
            enabled: platformEnabled || options?.preview === true,
            status: waitingForManual
                ? resolve_local_controller_display_data_1.LOCAL_CONTROLLER_WAITING_STATUS
                : payload.hasData
                    ? "ok"
                    : "no_data",
            source,
            revision: this.displayDataRevision,
            currencies: effective.currency.displayCurrencies,
            ...(0, pylon_data_1.sanitizePylonFeedPayload)(payload.feed),
        };
    }
    isNewBidDisplayEnabled() {
        return this.newAuctionDisplays.isNewBidDisplayEnabled();
    }
    setNewBidDisplayEnabled(enabled) {
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
    setNewTickerDisplayEnabled(enabled) {
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
    getNewBidDisplayData(options) {
        return this.getNewAuctionGraphicDisplayData(this.isNewBidDisplayEnabled(), options?.preview === true);
    }
    getNewTickerDisplayData(options) {
        return this.getNewAuctionGraphicDisplayData(this.isNewTickerDisplayEnabled(), options?.preview === true);
    }
    getNewAuctionGraphicDisplayData(enabled, preview = false) {
        const source = this.getDisplayDataSource();
        if (!enabled && !preview) {
            return {
                enabled: false,
                status: "display_disabled",
                source,
            };
        }
        const effective = this.resolveDisplayData(source);
        const payload = (0, new_auction_graphic_data_1.buildNewAuctionGraphicPayload)({
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
        const scraperAuctionDisplay = source === "webpage-scraper" &&
            effective.scraperSnapshot &&
            typeof effective.scraperSnapshot.auctionDisplay === "object" &&
            effective.scraperSnapshot.auctionDisplay !== null
            ? effective.scraperSnapshot.auctionDisplay
            : null;
        const scraperReserveStatus = typeof scraperAuctionDisplay?.reserveStatus === "string"
            ? scraperAuctionDisplay.reserveStatus
            : "";
        const resolvedReserveStatus = payload.current.reserveStatus ??
            (scraperReserveStatus.trim() ? scraperReserveStatus : null) ??
            (auctionDisplay.reserveStatus.trim() ? auctionDisplay.reserveStatus : null);
        const currencyCodes = ["EUR", "GBP", "CHF", "JPY"];
        const currencyRowsFromObject = currencyCodes
            .map((code) => {
            const value = payload.current.currencies[code];
            return value ? `${code} ${value}` : "";
        })
            .filter(Boolean);
        const currencyRows = currencyRowsFromObject.length > 0
            ? currencyRowsFromObject
            : auctionDisplay.currencies
                .map((row, index) => {
                const trimmed = String(row ?? "").trim();
                if (!trimmed)
                    return "";
                if (/^[A-Z]{3}\b/.test(trimmed))
                    return trimmed;
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
                currencies: Object.keys(payload.current.currencies).length > 0
                    ? payload.current.currencies
                    : currencyRows.reduce((acc, row) => {
                        const match = row.match(/^([A-Z]{3})\b[:\s-]*(.+)$/i);
                        if (match) {
                            acc[match[1]] = match[2].trim();
                        }
                        return acc;
                    }, {}),
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
    getGenericDisplayBridgeData(projectId) {
        const source = this.getDisplayDataSource();
        const effective = this.resolveDisplayData(source, projectId);
        const validated = this.getActiveCanonicalProjectSnapshot(projectId);
        const snapshot = validated ??
            (effective.canonicalSnapshot
                ? (0, canonical_project_data_1.serializeCanonicalProjectSnapshot)(effective.canonicalSnapshot)
                : effective.previewSnapshot
                    ? (0, canonical_project_data_1.serializeCanonicalProjectSnapshot)(effective.previewSnapshot)
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
                ? (0, normalize_broad_arrow_display_data_1.normalizeBroadArrowDisplayData)(snapshot)
                : null,
            currencies: effective.currency.displayCurrencies,
            projectId,
        };
    }
    getActiveCanonicalProjectSnapshot(projectId) {
        const source = this.getDisplayDataSource();
        const effective = this.resolveDisplayData(source, projectId);
        const snapshot = effective.canonicalSnapshot;
        if (!snapshot) {
            console.debug("[CanonicalProjectData] snapshot unavailable", { projectId, source });
            return null;
        }
        const validation = (0, canonical_project_data_1.validateCanonicalProjectData)(snapshot);
        if (!validation.ok) {
            console.warn("[CanonicalProjectData] validation failed", {
                projectId,
                source,
                issues: validation.issues,
            });
            return null;
        }
        console.debug("[CanonicalProjectData] snapshot published", { projectId, source });
        return validation.data;
    }
    getLowerTickerDisplayData(options) {
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
    resolveCurrentActivityActor() {
        const user = this.auth.getAuthenticatedUser();
        const displayName = user?.displayName?.trim();
        const email = user?.email?.trim();
        const name = displayName ||
            (email ? email.split("@")[0] : "") ||
            "Unknown User";
        return {
            id: user?.userId,
            name,
            email: email || undefined,
        };
    }
    resolveProjectActivityMetadata(metadata) {
        const input = metadata ?? {};
        const projectId = typeof input.projectId === "string" ? input.projectId : undefined;
        const engineId = typeof input.engineId === "string" ? input.engineId : undefined;
        const displayId = typeof input.displayId === "string" ? input.displayId : undefined;
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
            const display = this.displays.getById(displayId) ??
                (projectId ? this.displays.getByKey(projectId, displayId) : null) ??
                this.displays.listByProject(projectId ?? "").find((row) => row.displayKey === displayId || row.id === displayId) ??
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
    recordActivity(input) {
        if ((0, deprecated_activity_types_1.isDeprecatedActivityType)(input.type)) {
            return null;
        }
        const rawDescription = (input.userAction ?? input.message).trim();
        const storedDescription = rawDescription
            ? (0, activity_message_1.formatActivityDescription)(rawDescription)
            : (0, activity_message_1.formatSystemActivityMessage)(input.message);
        const actor = input.actor ??
            (input.userAction || input.type.startsWith("access.") || input.type.startsWith("controller.")
                ? this.resolveCurrentActivityActor()
                : input.actor);
        const cloudId = (0, crypto_1.randomUUID)();
        const instanceId = this.activitySync?.getDiagnostics().instanceId ??
            (0, neud_instance_id_1.getOrCreateNeudInstanceId)(this.settings);
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
    getActivitySnapshot(limit) {
        return (0, deprecated_activity_types_1.filterDeprecatedActivityEntries)(this.activitySession.getSnapshot(limit));
    }
    getActivityOverviewSnapshot() {
        return (0, deprecated_activity_types_1.filterDeprecatedActivityEntries)(this.activitySession.getOverviewSnapshot());
    }
    subscribeActivity(window) {
        this.activitySubscribers.add(window.id);
        if (!window.isDestroyed()) {
            (0, channels_1.sendToRenderer)(window, "neud:activity:snapshot", {
                entries: this.getActivitySnapshot(),
                overviewEntries: this.getActivityOverviewSnapshot(),
            });
        }
    }
    unsubscribeActivity(window) {
        this.activitySubscribers.delete(window.id);
    }
    clearActivityWindow(window) {
        this.activitySubscribers.delete(window.id);
    }
    pushActivityEntry(entry) {
        for (const windowId of this.activitySubscribers) {
            const window = electron_1.BrowserWindow.fromId(windowId);
            if (window && !window.isDestroyed()) {
                (0, channels_1.sendToRenderer)(window, "neud:activity:entry", { entry });
            }
        }
    }
    buildPylonPayloadForSource(source) {
        const effective = this.resolveDisplayData(source);
        const feed = effective.pylonFeed;
        return {
            hasData: this.pylonFeedHasData(feed),
            feed,
        };
    }
    pylonFeedHasData(feed) {
        const display = feed.auctionDisplay;
        return Boolean(display.title ||
            display.biddingPrice ||
            display.reserveStatus ||
            (display.lot && display.lot !== "Lot —") ||
            display.photos.length > 0);
    }
    buildLowerTickerPayloadForSource(source) {
        const effective = this.resolveDisplayData(source);
        const feed = effective.lowerTickerFeed;
        return {
            hasData: feed.next.length > 0,
            feed,
        };
    }
    resolveDisplayData(source = this.getDisplayDataSource(), projectId) {
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
        return (0, resolve_effective_display_data_1.resolveEffectiveDisplayData)({
            source,
            scraperSnapshot,
            localControllerState: null,
            submittedState,
            dataset,
            photoOverrides,
        });
    }
    getPrimaryBagPhotoOverrides() {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            return this.bagLiveState.getLotPhotoOverrides(project.id);
        }
        return {};
    }
    getPrimaryBagSubmittedRawState() {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            return this.bagLiveState.getSubmittedDisplayState(project.id);
        }
        return null;
    }
    getPrimaryBagActiveDataset() {
        if (!this.auctionDatasetService)
            return null;
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            return this.auctionDatasetService.readActiveDataset(project.id);
        }
        return null;
    }
    getPrimaryBagSubmittedState() {
        return this.resolveDisplayData("local-controller").localControllerState;
    }
    getPrimaryBagLiveState() {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            return this.bagLiveState.getLiveState(project.id);
        }
        return null;
    }
    getPrimaryBagEngineId() {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            const engine = this.bagLiveState.getBagEngineForProject(project.id);
            return engine?.id ?? null;
        }
        return null;
    }
    getLatestBagSnapshotPayload() {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            const engines = this.dataSources.listByProject(project.id);
            for (const engine of engines) {
                const snapshot = this.dataSources.getLatestSnapshot(engine.id);
                if (snapshot?.data && typeof snapshot.data === "object") {
                    return snapshot.data;
                }
            }
        }
        return null;
    }
    getProjectEngines(projectId) {
        return this.dataSources.listByProject(projectId).map((source) => {
            const settings = this.dataSources.getSettings(source.id);
            const status = this.dataSources.getStatus(source.id);
            return {
                ...(0, portal_shapes_1.toPortalDataEngine)(source),
                status: (0, portal_shapes_1.toPortalEngineStatus)(source.id, status, source.createdAt),
                settings: (0, portal_shapes_1.toPortalScraperSettings)(source.id, settings, source.createdAt),
            };
        });
    }
    getEngineById(engineId) {
        const source = this.dataSources.getById(engineId);
        return source ? (0, portal_shapes_1.toPortalDataEngine)(source) : null;
    }
    getEngineDetailBundle(engineId) {
        const source = this.dataSources.getById(engineId);
        if (!source)
            return null;
        if (this.bagSources.isBagGraphicsProject(engineId)) {
            this.bagSources.ensureBagScraperSources(engineId);
            this.bagRepair.repairEngineIfBroadArrow(engineId);
        }
        else if (this.genericScraper.isGenericWebpageProject(engineId)) {
            this.genericScraper.ensureGenericScraperSources(engineId);
        }
        this.normalizeEngineExecutionMode(engineId);
        const refreshed = this.dataSources.getById(engineId);
        if (!refreshed)
            return null;
        const settings = this.dataSources.getSettings(refreshed.id);
        const status = this.dataSources.getStatus(refreshed.id);
        const sources = this.dataSources.listSources(refreshed.id);
        const latestSnapshot = this.dataSources.getLatestSnapshot(refreshed.id);
        const recentSnapshots = this.dataSources.getRecentSnapshots(refreshed.id, 100);
        const logs = this.dataSources.getLogs(refreshed.id);
        const contamination = this.bagSources.detectGenericBagContamination(engineId);
        const adapterContamination = this.genericScraper.detectGenericAdapterContamination(engineId);
        return {
            engine: (0, portal_shapes_1.toPortalDataEngine)(refreshed),
            status: (0, portal_shapes_1.toPortalEngineStatus)(refreshed.id, status, refreshed.createdAt, {
                pollIntervalMs: settings?.pollIntervalMs ?? null,
            }),
            settings: (0, portal_shapes_1.toPortalScraperSettings)(refreshed.id, settings, refreshed.createdAt),
            sources: sources.map(portal_shapes_1.toPortalScraperSource),
            latestSnapshot: latestSnapshot ? (0, portal_shapes_1.toPortalSnapshot)(latestSnapshot) : null,
            recentSnapshots: recentSnapshots.map(portal_shapes_1.toPortalSnapshot),
            logs: logs.map(portal_shapes_1.toPortalLog),
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
    clearUntouchedBagDefaults(engineId) {
        return this.bagSources.clearUntouchedBagDefaults(engineId);
    }
    saveGenericScraperConfig(engineId, input) {
        return this.genericScraper.saveGenericConfig(engineId, input);
    }
    saveBagScraperUrls(engineId, input) {
        return this.bagSources.saveBagSourceUrls(engineId, input);
    }
    listBagSources(engineId) {
        return this.bagSources.listSources(engineId).map(portal_shapes_1.toPortalScraperSource);
    }
    saveBagSource(engineId, input) {
        return (0, portal_shapes_1.toPortalScraperSource)(this.bagSources.saveBagSource(engineId, input));
    }
    addBagCustomSource(engineId, input) {
        return (0, portal_shapes_1.toPortalScraperSource)(this.bagSources.addCustomSource(engineId, input));
    }
    removeBagSource(engineId, sourceId) {
        this.bagSources.removeSource(engineId, sourceId);
    }
    resetBagSource(engineId, sourceId) {
        return (0, portal_shapes_1.toPortalScraperSource)(this.bagSources.resetSource(engineId, sourceId));
    }
    reorderBagSources(engineId, orderedSourceIds) {
        return this.bagSources
            .reorderSources(engineId, orderedSourceIds)
            .map(portal_shapes_1.toPortalScraperSource);
    }
    repairBroadArrowConfiguration() {
        return this.bagRepair.repairBroadArrowConfiguration();
    }
    migrateLegacyEngineRuntimeAssets(engineId) {
        return (0, legacy_runtime_migration_1.migrateLegacyEngineRuntimeAssets)(this.paths, engineId);
    }
    migrateAllLegacyEngineRuntimeAssets() {
        const results = [];
        for (const project of this.projects.list()) {
            for (const engine of this.dataSources.listByProject(project.id)) {
                this.credentials.getCredentialMeta(engine.id);
                const result = (0, legacy_runtime_migration_1.migrateLegacyEngineRuntimeAssets)(this.paths, engine.id);
                if (result.cookiesMigrated || result.browserDataMigrated) {
                    results.push({ engineId: engine.id, result });
                }
                const status = this.dataSources.getStatus(engine.id);
                if (status?.lastError &&
                    status.lastSuccessAt &&
                    (!status.lastRunFailedAt ||
                        Date.parse(status.lastSuccessAt) >= Date.parse(status.lastRunFailedAt))) {
                    this.dataSources.upsertStatus(engine.id, { lastError: null });
                }
            }
        }
        return results;
    }
    ensureBroadArrowDevelopmentPhase() {
        return this.broadArrowPhase.ensureBroadArrowDevelopmentPhase(this.localApiBaseUrl);
    }
    getDefaultProjectSlug() {
        return this.broadArrowPhase.getDefaultProjectSlug();
    }
    getCredentialMeta(engineId) {
        return this.credentials.getCredentialMeta(engineId);
    }
    deleteProject(input) {
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
    getProjectAccessContextBySlug(slug) {
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
        let projectRole = "viewer";
        if (context?.isPlatformOwner) {
            projectRole = "owner";
        }
        else if (capabilities.canEditProjectSettings) {
            projectRole = "admin";
        }
        else if (capabilities.canOperateEngines) {
            projectRole = "operator";
        }
        return {
            project: (0, portal_shapes_1.toPortalProject)(project),
            capabilities,
            projectRole,
            isPlatformAdmin: context?.isPlatformOwner ?? false,
            canManageSettings: capabilities.canEditProjectSettings,
            canManageMembers: capabilities.canManageProjectUsers,
        };
    }
    convertGenericAdapter(engineId, options = {}) {
        return this.genericScraper.convertBagAdapterToGeneric(engineId, options);
    }
    getWorkerCredentials(engineId) {
        if (!this.genericScraper.requiresCredentials(engineId)) {
            return null;
        }
        return (0, project_scraper_auth_1.getProjectWebpageScraperCredentials)(this.credentials, engineId);
    }
    getWorkerBundle(engineId) {
        const source = this.dataSources.getById(engineId);
        if (!source)
            return null;
        if (this.bagSources.isBagGraphicsProject(engineId)) {
            this.bagSources.ensureBagScraperSources(engineId);
        }
        const refreshed = this.dataSources.getById(engineId);
        if (!refreshed)
            return null;
        const settings = this.dataSources.getSettings(refreshed.id);
        const isBagEngine = this.bagSources.isBagAuctionEngine(refreshed);
        return {
            engine: (0, portal_shapes_1.toPortalDataEngine)(refreshed),
            settings: (0, portal_shapes_1.toPortalScraperSettings)(refreshed.id, settings, refreshed.createdAt),
            sources: this.dataSources
                .listSources(refreshed.id, true)
                .map(portal_shapes_1.toPortalScraperSource),
            status: (0, portal_shapes_1.toPortalEngineStatus)(refreshed.id, this.dataSources.getStatus(refreshed.id), refreshed.createdAt, { pollIntervalMs: settings?.pollIntervalMs ?? null }),
            pendingRunOnce: this.settings.get(`pending_run_once:${engineId}`, false),
            ...(isBagEngine
                ? {
                    bagRuntime: (0, bag_runtime_config_1.buildBagRuntimeConfigForWorker)(),
                }
                : {}),
        };
    }
    clearPendingRunOnce(engineId) {
        this.settings.set(`pending_run_once:${engineId}`, false);
    }
    updateDesiredState(engineId, desiredState) {
        this.dataSources.updateDesiredState(engineId, desiredState);
    }
    setExecutionMode(engineId, mode) {
        if (mode === "remote-worker") {
            throw new Error("Remote Worker execution is not available yet. Desktop execution is required.");
        }
        const source = this.dataSources.getById(engineId);
        if (!source)
            throw new Error("Data Engine not found.");
        this.dataSources.updateConfig(engineId, {
            ...source.config,
            execution_mode: "local-desktop",
        });
    }
    queueRunOnce(engineId) {
        this.settings.set(`pending_run_once:${engineId}`, true);
    }
    consumeRunOnce(engineId) {
        const pending = this.settings.get(`pending_run_once:${engineId}`, false);
        if (pending) {
            this.settings.set(`pending_run_once:${engineId}`, false);
        }
        return pending;
    }
    updateScraperSettings(engineId, input) {
        const previousSettings = this.dataSources.getSettings(engineId);
        const previousPollIntervalMs = previousSettings?.pollIntervalMs ?? null;
        this.dataSources.updateSettings(engineId, input);
        if (previousPollIntervalMs !== null &&
            input.pollIntervalMs !== previousPollIntervalMs) {
            const engine = this.dataSources.getById(engineId);
            const previousLabel = (0, poll_interval_format_1.formatPollingInterval)(previousPollIntervalMs);
            const nextLabel = (0, poll_interval_format_1.formatPollingInterval)(input.pollIntervalMs);
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
    saveScraperSource(engineId, input) {
        return (0, portal_shapes_1.toPortalScraperSource)(this.dataSources.saveSource(engineId, input));
    }
    toggleScraperSource(engineId, sourceId, enabled) {
        this.dataSources.toggleSource(engineId, sourceId, enabled);
    }
    removeScraperSource(engineId, sourceId) {
        this.dataSources.removeSource(engineId, sourceId);
    }
    recordSnapshot(engineId, input) {
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
        return (0, portal_shapes_1.toPortalSnapshot)(snapshot);
    }
    onExecutionLogEntry(listener) {
        this.executionLogListeners.add(listener);
        return () => {
            this.executionLogListeners.delete(listener);
        };
    }
    onEngineStatusChange(listener) {
        this.engineStatusListeners.add(listener);
        return () => {
            this.engineStatusListeners.delete(listener);
        };
    }
    getEngineStatusSnapshot(engineId) {
        const cached = this.engineStatusSession.get(engineId);
        if (cached) {
            return cached;
        }
        return this.syncEngineStatusSnapshot(engineId);
    }
    getEngineWorkerId(engineId) {
        return this.dataSources.getStatus(engineId)?.workerId ?? null;
    }
    syncEngineStatusSnapshot(engineId) {
        const status = this.dataSources.getStatus(engineId);
        const snapshot = {
            engineId,
            lastRunSucceededAt: status?.lastSuccessAt ?? null,
            lastError: status?.lastError ?? null,
            actualState: status?.actualState ?? null,
            healthState: status?.healthState ?? null,
        };
        this.engineStatusSession.set(engineId, snapshot);
        return snapshot;
    }
    pushEngineStatusSnapshot(engineId) {
        const snapshot = this.syncEngineStatusSnapshot(engineId);
        for (const listener of this.engineStatusListeners) {
            listener(engineId, snapshot);
        }
    }
    onExportWorkerEvent(listener) {
        this.exportWorkerEventListeners.add(listener);
        return () => {
            this.exportWorkerEventListeners.delete(listener);
        };
    }
    emitExportWorkerEvent(payload) {
        for (const listener of this.exportWorkerEventListeners) {
            listener(payload);
        }
    }
    touchExportWorkerEvent(requestId) {
        const command = this.pendingExportCommands.get(requestId);
        if (!command)
            return;
        command.lastWorkerEventAt = Date.now();
    }
    queueExportCurrentAuction(engineId, tasks, photoDownloadRoot, meta) {
        const existingRequestId = this.exportCommandByEngine.get(engineId);
        if (existingRequestId) {
            const existing = this.pendingExportCommands.get(existingRequestId);
            if (existing && (existing.status === "pending" || existing.status === "processing")) {
                throw new Error("An export is already in progress for this engine.");
            }
        }
        const requestId = (0, crypto_1.randomUUID)();
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
    getExportJobStatus(requestId) {
        const command = this.pendingExportCommands.get(requestId);
        if (!command)
            return "missing";
        if (command.status === "pending")
            return "queued";
        if (command.status === "processing")
            return "running";
        if (command.status === "completed")
            return "completed";
        if (command.status === "cancelled")
            return "cancelled";
        if (command.status === "failed") {
            const error = command.error ?? "";
            if (/cancel/i.test(error))
                return "cancelled";
            return "failed";
        }
        return "missing";
    }
    claimExportCurrentAuction(engineId) {
        const requestId = this.exportCommandByEngine.get(engineId);
        if (!requestId)
            return null;
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
    reportExportStarted(requestId, input) {
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
    reportExportProgress(requestId, input) {
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
            completedMetadataLots: input.completedMetadataLots ?? command.progress?.completedMetadataLots ?? 0,
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
    cancelExportCurrentAuction(requestId) {
        const command = this.pendingExportCommands.get(requestId);
        if (!command)
            return false;
        if (command.status !== "pending" && command.status !== "processing") {
            return false;
        }
        command.cancelRequested = true;
        return true;
    }
    cancelExportCurrentAuctionByOperationId(operationId) {
        for (const command of this.pendingExportCommands.values()) {
            if (command.operationId !== operationId)
                continue;
            return this.cancelExportCurrentAuction(command.requestId);
        }
        return false;
    }
    isExportCancelled(requestId) {
        const command = this.pendingExportCommands.get(requestId);
        return command?.cancelRequested === true;
    }
    completeExportCurrentAuction(requestId, result, meta) {
        const command = this.pendingExportCommands.get(requestId);
        if (!command)
            return false;
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
    failExportCurrentAuction(requestId, error, meta) {
        const command = this.pendingExportCommands.get(requestId);
        if (!command)
            return false;
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
        }
        else {
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
    getExportCurrentAuctionResult(requestId) {
        return this.pendingExportCommands.get(requestId) ?? null;
    }
    getExportRequestIdForOperation(operationId) {
        for (const command of this.pendingExportCommands.values()) {
            if (command.operationId === operationId) {
                return command.requestId;
            }
        }
        return null;
    }
    isEngineWorkerLive(engineId) {
        return this.engineManager?.isEngineRunning(engineId) ?? false;
    }
    async waitForExportCurrentAuctionResult(requestId, pollMs = 200) {
        const { EXPORT_INACTIVITY_TIMEOUT_MS, EXPORT_SESSION_TIMEOUT_MESSAGE, EXPORT_STARTUP_TIMEOUT_MS, } = await Promise.resolve().then(() => __importStar(require("./export-worker-events.js")));
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
                const lastEventAt = command.lastWorkerEventAt ??
                    command.workerAcceptedAt ??
                    command.processingStartedAt ??
                    command.createdAt;
                const inactiveFor = now - lastEventAt;
                if (inactiveFor > EXPORT_INACTIVITY_TIMEOUT_MS) {
                    const workerLive = this.isEngineWorkerLive(command.engineId);
                    if (!workerLive) {
                        throw new Error("The Webpage Scraper worker disconnected before the download finished.");
                    }
                    throw new Error("The download stopped making progress. Restart the Webpage Scraper and try again.");
                }
            }
            await new Promise((resolve) => setTimeout(resolve, pollMs));
        }
    }
    getExecutionLogSnapshot(engineId) {
        return this.executionLogSession.getSnapshot(engineId);
    }
    clearExecutionLogSession(engineId) {
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
    recordLog(engineId, input) {
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
        return (0, portal_shapes_1.toPortalLog)(inserted);
    }
    maybeRecordActivityFromLog(engineId, log) {
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
        if (eventType === "engine.execution" &&
            log.message.startsWith("Polling interval changed to")) {
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
    recordStatus(engineId, patch) {
        this.dataSources.upsertStatus(engineId, {
            actualState: patch.actualState,
            healthState: patch.healthState,
            workerId: patch.workerId,
            lastHeartbeatAt: patch.lastHeartbeatAt,
            lastRunAt: patch.lastRunAt,
            lastError: patch.lastError,
        });
        this.bagLiveState.syncEngineStatus(engineId);
        this.pushEngineStatusSnapshot(engineId);
    }
    recordRunSuccess(engineId, input) {
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
    recordRunFailure(engineId, input) {
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
    getBagLiveState(projectId) {
        return this.bagLiveState.getLiveState(projectId);
    }
    ensureBagLiveState(projectId) {
        return this.bagLiveState.ensureLiveState(projectId);
    }
    getPrimaryBagEngineIdPublic() {
        return this.getPrimaryBagEngineId();
    }
    getPrimaryBagEngineIdForProjectPublic(projectId) {
        return this.getPrimaryBagEngineIdForProject(projectId);
    }
    hasValidScraperSnapshot(projectId) {
        return this.getLatestBagSnapshotPayloadForProject(projectId) !== null;
    }
    loadOfflineAuction(projectId, auctionData, actor) {
        return this.bagLiveState.loadOfflineAuction(projectId, auctionData, actor ?? this.resolveCurrentActivityActor());
    }
    getLatestBagSnapshotPayloadForProject(projectId) {
        const engines = this.dataSources.listByProject(projectId);
        for (const engine of engines) {
            const snapshot = this.dataSources.getLatestSnapshot(engine.id);
            if (snapshot?.data && typeof snapshot.data === "object") {
                return snapshot.data;
            }
        }
        return null;
    }
    repairBagProjectAssets() {
        this.pylonDisplays.repairAllBagProjects(this.viewerBaseUrl);
        this.lowerTickerDisplays.repairAllBagProjects(this.viewerBaseUrl);
        this.newAuctionDisplays.repairAllBagProjects(this.viewerBaseUrl);
    }
    normalizeEngineExecutionMode(engineId) {
        const source = this.dataSources.getById(engineId);
        if (!source)
            return;
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
            message: "Execution mode was normalized to Desktop because Remote Worker is not available yet.",
            metadata: { previousMode: currentMode ?? "missing" },
        });
    }
}
exports.LocalDataService = LocalDataService;
function localStatsDay(now = new Date()) {
    return (0, local_day_1.localStatsDayKey)(now);
}
function rollDailyScrapeCounters(status, outcome) {
    const today = localStatsDay();
    const sameDay = status?.statsDay === today;
    const scrapesToday = (sameDay ? (status?.scrapesToday ?? 0) : 0) + 1;
    const successfulToday = (sameDay ? (status?.successfulToday ?? 0) : 0) + (outcome === "success" ? 1 : 0);
    const failedToday = (sameDay ? (status?.failedToday ?? 0) : 0) + (outcome === "failure" ? 1 : 0);
    return {
        scrapesToday,
        successfulToday,
        failedToday,
        statsDay: today,
    };
}
