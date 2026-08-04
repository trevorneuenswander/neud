"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisplaySyncService = void 0;
const neud_instance_id_1 = require("../neud-instance-id");
const cloud_display_client_1 = require("./cloud-display-client");
const cloud_display_mapper_1 = require("./cloud-display-mapper");
const types_1 = require("./types");
class DisplaySyncService {
    cloud;
    settings;
    displays;
    displayCode;
    revisions;
    storage;
    queue;
    tombstones;
    auth;
    onDisplaysChanged;
    online = false;
    syncInProgress = false;
    lastSyncError = null;
    retryTimer = null;
    periodicTimer = null;
    uploadDebounceTimer = null;
    listeners = new Set();
    instanceId;
    cloudClient;
    constructor(cloud, settings, displays, displayCode, revisions, storage, queue, tombstones, auth, onDisplaysChanged) {
        this.cloud = cloud;
        this.settings = settings;
        this.displays = displays;
        this.displayCode = displayCode;
        this.revisions = revisions;
        this.storage = storage;
        this.queue = queue;
        this.tombstones = tombstones;
        this.auth = auth;
        this.onDisplaysChanged = onDisplaysChanged;
        this.instanceId = (0, neud_instance_id_1.getOrCreateNeudInstanceId)(settings);
        this.cloudClient = new cloud_display_client_1.CloudDisplayClient(cloud);
    }
    start() {
        void this.refreshOnlineState();
        this.periodicTimer = setInterval(() => {
            void this.syncNow("periodic");
        }, 60_000);
        void this.syncNow("startup");
    }
    stop() {
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
    isDeleted(displayId) {
        return this.tombstones.isDeleted(displayId);
    }
    queueOperation(input) {
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
    recordDeletionTombstone(input) {
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
    getDiagnostics() {
        return {
            instanceId: this.instanceId,
            online: this.online,
            pendingQueueCount: this.queue.countByState("pending") + this.queue.countByState("failed"),
            pendingDisplayCount: this.displays.listPendingSync(1000).length,
            pendingTombstoneCount: this.tombstones.listPending(1000).length,
            lastSyncError: this.lastSyncError,
            syncInProgress: this.syncInProgress,
        };
    }
    getState() {
        const diagnostics = this.getDiagnostics();
        if (!this.auth.getAuthenticatedUser()) {
            return { status: "idle", message: "Sign in to synchronize displays." };
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
            return { status: "syncing", message: "Saved locally · Waiting to sync" };
        }
        if (this.lastSyncError) {
            return { status: "error", message: "Display sync error." };
        }
        return { status: "synced", message: "Synced" };
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
            if (!this.online)
                return;
            await this.pushPending();
            await this.pullTombstones();
            this.lastSyncError = null;
            console.debug(`[DisplaySync] completed reason=${reason}`);
        }
        catch (error) {
            this.lastSyncError = error instanceof Error ? error.message : String(error);
            console.warn("[DisplaySync] failed:", this.lastSyncError);
            this.scheduleRetry();
        }
        finally {
            this.syncInProgress = false;
            this.emitState();
        }
    }
    async reconcileLocalDisplays(projectIds) {
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
    scheduleUpload() {
        if (this.uploadDebounceTimer) {
            clearTimeout(this.uploadDebounceTimer);
        }
        this.uploadDebounceTimer = setTimeout(() => {
            this.uploadDebounceTimer = null;
            void this.syncNow("mutation").catch(() => {
                this.scheduleRetry();
            });
        }, 750);
    }
    scheduleRetry() {
        if (this.retryTimer)
            return;
        const attempt = Math.min(types_1.DISPLAY_SYNC_BACKOFF_MS.length - 1, 0);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.syncNow("retry");
        }, types_1.DISPLAY_SYNC_BACKOFF_MS[attempt]);
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
        const userId = this.auth.getAuthenticatedUser()?.userId ?? null;
        const displayRows = [];
        for (const display of this.displays.listPendingSync(50)) {
            if (this.tombstones.isDeleted(display.id))
                continue;
            const code = this.displayCode.getByDisplayId(display.id);
            displayRows.push((0, cloud_display_mapper_1.toCloudDisplayRow)({ display, code, instanceId: this.instanceId, userId }));
        }
        const displayResult = await this.cloudClient.upsertDisplays(displayRows);
        if (displayResult.errors.length > 0) {
            throw new Error(displayResult.errors.join("; "));
        }
        const syncedAt = new Date().toISOString();
        for (const row of displayRows) {
            this.displays.markSynced(row.id, syncedAt);
        }
        const revisionRows = [];
        for (const entry of this.queue.listPending(50)) {
            if (entry.operationType !== "display.revision.create")
                continue;
            const revision = this.revisions.getById(entry.entityId);
            if (!revision || revision.resourceType !== "display")
                continue;
            const bundle = this.storage.readDisplayRevision(revision.projectId, revision.resourceId, String(revision.metadata?.storageRevisionId ?? revision.id));
            if (!bundle)
                continue;
            const allRevisions = this.revisions.listForResource({
                projectId: revision.projectId,
                resourceType: "display",
                resourceId: revision.resourceId,
            });
            const sorted = [...allRevisions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            const versionNumber = revision.versionNumber ??
                Math.max(sorted.findIndex((item) => item.id === revision.id) + 1, 1);
            revisionRows.push((0, cloud_display_mapper_1.toCloudDisplayRevisionRow)({
                revision,
                displayId: revision.resourceId,
                projectId: revision.projectId,
                versionNumber,
                html: bundle.html,
                instanceId: this.instanceId,
                userId,
            }));
        }
        const revisionResult = await this.cloudClient.upsertRevisions(revisionRows);
        if (revisionResult.errors.length > 0) {
            throw new Error(revisionResult.errors.join("; "));
        }
        const tombstoneRows = this.tombstones.listPending(50).map(cloud_display_mapper_1.toCloudDisplayTombstoneRow);
        const tombstoneResult = await this.cloudClient.upsertTombstones(tombstoneRows);
        if (tombstoneResult.errors.length > 0) {
            throw new Error(tombstoneResult.errors.join("; "));
        }
        for (const tombstone of tombstoneRows) {
            this.tombstones.markSynced(tombstone.display_id, syncedAt);
        }
        for (const entry of this.queue.listPending(100)) {
            this.queue.markSynced(entry.id);
        }
        this.settings.set(types_1.DISPLAY_SYNC_LAST_PUSH_KEY, syncedAt);
    }
    async pullTombstones() {
        const since = this.settings.get(types_1.DISPLAY_SYNC_LAST_PULL_KEY, null);
        const remote = await this.cloudClient.fetchTombstonesSince(since);
        for (const tombstone of remote) {
            if (tombstone.source_instance_id === this.instanceId)
                continue;
            if (this.tombstones.isDeleted(tombstone.display_id))
                continue;
            const display = this.displays.getById(tombstone.display_id);
            if (!display)
                continue;
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
            this.settings.set(types_1.DISPLAY_SYNC_LAST_PULL_KEY, latest);
            this.onDisplaysChanged();
        }
    }
    emitState() {
        const state = this.getState();
        for (const listener of this.listeners) {
            listener(state);
        }
    }
}
exports.DisplaySyncService = DisplaySyncService;
