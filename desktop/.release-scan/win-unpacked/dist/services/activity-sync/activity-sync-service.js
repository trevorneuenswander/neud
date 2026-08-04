"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivitySyncService = void 0;
const neud_instance_id_1 = require("../neud-instance-id");
const cloud_activity_client_1 = require("./cloud-activity-client");
const cloud_activity_mapper_1 = require("./cloud-activity-mapper");
const types_1 = require("./types");
class ActivitySyncService {
    cloud;
    settings;
    repository;
    sessionStore;
    auth;
    access;
    projects;
    onEntriesChanged;
    online = false;
    syncInProgress = false;
    lastSyncError = null;
    lastPushUploaded = 0;
    lastPullDownloaded = 0;
    retryTimer = null;
    periodicTimer = null;
    uploadDebounceTimer = null;
    realtimeChannel = null;
    listeners = new Set();
    instanceId;
    cloudClient;
    constructor(cloud, settings, repository, sessionStore, auth, access, projects, onEntriesChanged) {
        this.cloud = cloud;
        this.settings = settings;
        this.repository = repository;
        this.sessionStore = sessionStore;
        this.auth = auth;
        this.access = access;
        this.projects = projects;
        this.onEntriesChanged = onEntriesChanged;
        this.instanceId = (0, neud_instance_id_1.getOrCreateNeudInstanceId)(settings);
        this.cloudClient = new cloud_activity_client_1.CloudActivityClient(cloud);
        this.repository.assignCloudIdsForLegacyRows({
            instanceId: this.instanceId,
            resolveCloudId: (localId) => (0, cloud_activity_mapper_1.deterministicActivityCloudId)(this.instanceId, localId),
        });
    }
    start() {
        void this.refreshOnlineState();
        this.periodicTimer = setInterval(() => {
            void this.syncNow("periodic");
        }, 45_000);
        void this.setupRealtimeSubscription();
        void this.syncNow("startup");
    }
    async setupRealtimeSubscription() {
        const supabase = await this.cloud.getClient();
        if (!supabase) {
            return;
        }
        this.realtimeChannel = supabase
            .channel("neud-activity-sync")
            .on("postgres_changes", { event: "*", schema: "public", table: "activity_events" }, () => {
            void this.syncNow("realtime");
        })
            .subscribe();
    }
    stop() {
        if (this.realtimeChannel) {
            void this.cloud.getClient().then((client) => {
                if (client) {
                    void client.removeChannel(this.realtimeChannel);
                }
            });
            this.realtimeChannel = null;
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
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.getState());
        return () => this.listeners.delete(listener);
    }
    getDiagnostics() {
        return {
            instanceId: this.instanceId,
            cloudUserId: this.auth.getAuthenticatedUser()?.userId ?? null,
            online: this.online,
            lastSuccessfulPushAt: this.settings.get(types_1.ACTIVITY_SYNC_LAST_PUSH_KEY, null),
            lastSuccessfulPullAt: this.settings.get(types_1.ACTIVITY_SYNC_LAST_PULL_KEY, null),
            cursor: this.getCursor(),
            pendingUploadCount: this.repository.countBySyncStatus("pending"),
            failedUploadCount: this.repository.countBySyncStatus("failed"),
            lastSyncError: this.lastSyncError,
            cloudProvider: "supabase",
            lastPushUploaded: this.lastPushUploaded,
            lastPullDownloaded: this.lastPullDownloaded,
            syncInProgress: this.syncInProgress,
        };
    }
    getState() {
        const diagnostics = this.getDiagnostics();
        if (!this.auth.getAuthenticatedUser()) {
            return {
                status: "offline",
                message: "Sign in to synchronize Activity.",
                diagnostics,
            };
        }
        if (this.syncInProgress) {
            return { status: "syncing", message: "Syncing Activity…", diagnostics };
        }
        if (!this.online) {
            return {
                status: "offline",
                message: "Offline — changes queued.",
                diagnostics,
            };
        }
        if (diagnostics.failedUploadCount > 0 || this.lastSyncError) {
            return {
                status: "error",
                message: "Some Activity events failed to sync.",
                diagnostics,
            };
        }
        if (diagnostics.pendingUploadCount > 0) {
            return {
                status: "syncing",
                message: "Uploading queued Activity…",
                diagnostics,
            };
        }
        return { status: "synced", message: "Activity synced.", diagnostics };
    }
    queueEventUpload(cloudId) {
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
    async syncNow(reason = "manual") {
        if (this.syncInProgress)
            return;
        if (!this.auth.getAuthenticatedUser())
            return;
        if (!this.cloud.hasCloudSession())
            return;
        this.syncInProgress = true;
        this.emitState();
        try {
            await this.refreshOnlineState();
            if (!this.online) {
                return;
            }
            await this.pushPending();
            await this.pullRemote();
            this.lastSyncError = null;
            console.debug(`[ActivitySync] completed reason=${reason}`);
        }
        catch (error) {
            this.lastSyncError = error instanceof Error ? error.message : String(error);
            console.warn("[ActivitySync] failed:", this.lastSyncError);
        }
        finally {
            this.syncInProgress = false;
            this.emitState();
        }
    }
    createCloudIdForEvent(localId) {
        if (localId && /^[0-9a-f-]{36}$/i.test(localId)) {
            return localId;
        }
        return (0, cloud_activity_mapper_1.deterministicActivityCloudId)(this.instanceId, localId ?? `draft-${Date.now()}`);
    }
    async refreshOnlineState() {
        try {
            this.online = await this.cloudClient.ping();
        }
        catch {
            this.online = false;
        }
    }
    async pushPending() {
        const pending = this.repository.listPendingSync(100);
        if (pending.length === 0) {
            this.lastPushUploaded = 0;
            return;
        }
        const uploadable = [];
        const rows = [];
        for (const record of pending) {
            if (!this.canUploadRecord(record)) {
                this.repository.markFailed(record.cloudId, "Project access denied for Activity upload.");
                continue;
            }
            this.repository.markSyncAttempt(record.cloudId);
            const teamId = this.resolveTeamId(record);
            uploadable.push(record);
            rows.push((0, cloud_activity_mapper_1.toCloudActivityRow)({
                event: record,
                cloudId: record.cloudId,
                instanceId: this.instanceId,
                teamId,
            }));
        }
        if (rows.length === 0) {
            this.lastPushUploaded = 0;
            return;
        }
        const result = await this.cloudClient.upsertEvents(rows);
        const now = new Date().toISOString();
        if (result.errors.length > 0) {
            for (const record of uploadable) {
                this.repository.markFailed(record.cloudId, result.errors[0] ?? "Upload failed.");
            }
            throw new Error(result.errors[0] ?? "Activity upload failed.");
        }
        for (const record of uploadable) {
            this.repository.markSynced(record.cloudId, now);
        }
        this.lastPushUploaded = result.uploaded;
        this.settings.set(types_1.ACTIVITY_SYNC_LAST_PUSH_KEY, now);
    }
    async pullRemote() {
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
            if (rows.length === 0)
                break;
            for (const row of rows) {
                const event = (0, cloud_activity_mapper_1.fromCloudActivityRow)(row);
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
            if (rows.length < 100)
                break;
        }
        if (cursor) {
            this.settings.set(types_1.ACTIVITY_SYNC_CURSOR_KEY, cursor);
        }
        if (downloaded > 0) {
            this.onEntriesChanged();
        }
        this.lastPullDownloaded = downloaded;
        this.settings.set(types_1.ACTIVITY_SYNC_LAST_PULL_KEY, new Date().toISOString());
    }
    canUploadRecord(record) {
        const projectId = typeof record.metadata?.projectId === "string"
            ? record.metadata.projectId
            : null;
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId)
            return false;
        if (!projectId)
            return true;
        return this.access.getAuthorizationContext(userId)?.accessibleProjectIds.includes(projectId) ?? false;
    }
    resolveTeamId(record) {
        const projectId = typeof record.metadata?.projectId === "string"
            ? record.metadata.projectId
            : null;
        if (!projectId)
            return null;
        return this.projects.getById(projectId)?.teamId ?? null;
    }
    getCursor() {
        return this.settings.get(types_1.ACTIVITY_SYNC_CURSOR_KEY, null);
    }
    scheduleRetry(cloudId) {
        const record = this.repository.getByCloudId(cloudId);
        if (!record)
            return;
        const attempt = Math.min(record.syncAttemptCount, types_1.ACTIVITY_SYNC_BACKOFF_MS.length - 1);
        const delay = types_1.ACTIVITY_SYNC_BACKOFF_MS[attempt];
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
        }
        this.retryTimer = setTimeout(() => {
            void this.syncNow("retry");
        }, delay);
    }
    emitState() {
        const state = this.getState();
        for (const listener of this.listeners) {
            listener(state);
        }
    }
}
exports.ActivitySyncService = ActivitySyncService;
