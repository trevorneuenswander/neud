"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublishingManager = void 0;
const neud_instance_id_1 = require("../neud-instance-id");
const hash_1 = require("../../publishing/hash");
const validate_1 = require("../../publishing/validate");
const cloud_publishing_client_1 = require("./cloud-publishing-client");
const types_1 = require("./types");
class PublishingManager {
    userSession;
    publicConfig;
    settings;
    projects;
    auth;
    access;
    data;
    online = false;
    started = false;
    heartbeatTimer = null;
    settingsTimer = null;
    stopping = false;
    instanceId;
    registeredHostedProjects = new Set();
    projectStates = new Map();
    constructor(userSession, publicConfig, settings, projects, auth, access, data) {
        this.userSession = userSession;
        this.publicConfig = publicConfig;
        this.settings = settings;
        this.projects = projects;
        this.auth = auth;
        this.access = access;
        this.data = data;
        this.instanceId = (0, neud_instance_id_1.getOrCreateNeudInstanceId)(settings);
    }
    async getCloudClient() {
        if (!this.publicConfig) {
            return null;
        }
        const supabase = await this.userSession.getAuthenticatedClient(this.publicConfig);
        if (!supabase) {
            return null;
        }
        return new cloud_publishing_client_1.CloudPublishingClient(supabase);
    }
    hasCloudPublishingSession() {
        return this.userSession.hasCloudSession();
    }
    async ensureHostedProjectRegistered(cloudClient, projectId) {
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
    start() {
        if (this.started) {
            return;
        }
        this.started = true;
        this.stopping = false;
        void this.refreshOnlineState();
        this.heartbeatTimer = setInterval(() => {
            void this.runHeartbeatCycle();
        }, types_1.PUBLISHING_HEARTBEAT_MS);
        this.settingsTimer = setInterval(() => {
            void this.refreshAllProjectSettings();
        }, types_1.PUBLISHING_SETTINGS_POLL_MS);
        void this.runHeartbeatCycle();
    }
    async stop() {
        if (!this.started) {
            return;
        }
        this.stopping = true;
        this.started = false;
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.settingsTimer) {
            clearInterval(this.settingsTimer);
            this.settingsTimer = null;
        }
        const releaseTargets = [...this.projectStates.entries()].filter(([, state]) => state.ownsLease && state.publishingEnabled);
        await Promise.race([
            Promise.allSettled(releaseTargets.map(async ([projectId]) => {
                try {
                    const cloudClient = await this.getCloudClient();
                    if (!cloudClient) {
                        return;
                    }
                    await cloudClient.releaseLease(projectId, this.instanceId);
                }
                catch (error) {
                    console.warn(`[PublishingManager] Failed to release lease for ${projectId}:`, error instanceof Error ? error.message : error);
                }
            })),
            new Promise((resolve) => {
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
            state.inFlight = false;
            state.pending = null;
            state.ownsLease = false;
        }
    }
    notifyProjectCanonicalMayHaveChanged(projectId) {
        const state = this.ensureProjectState(projectId);
        if (!state.publishingEnabled) {
            return;
        }
        if (state.inFlight) {
            state.resyncAfterInFlight = true;
            return;
        }
        if (state.debounceTimer) {
            clearTimeout(state.debounceTimer);
        }
        state.debounceTimer = setTimeout(() => {
            state.debounceTimer = null;
            void this.syncProject(projectId, "canonical-change");
        }, types_1.PUBLISHING_DEBOUNCE_MS);
    }
    async setProjectPublishingEnabled(projectId, enabled) {
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId) {
            throw new Error("Sign in to manage online publishing.");
        }
        this.access.assertCanEditProjectSettings(userId, projectId);
        if (!this.hasCloudPublishingSession()) {
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
        this.settings.set((0, types_1.publishingProjectEnabledCacheKey)(projectId), enabled);
        if (!enabled) {
            state.pending = null;
            state.status = "disabled";
            if (state.ownsLease) {
                try {
                    await cloudClient.releaseLease(projectId, this.instanceId);
                }
                catch {
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
    getProjectDiagnostics(projectId) {
        const state = this.ensureProjectState(projectId);
        return this.toProjectDiagnostics(projectId, state);
    }
    getDiagnostics() {
        const projectIds = new Set([
            ...this.projects.list().map((project) => project.id),
            ...this.projectStates.keys(),
        ]);
        return {
            instanceId: this.instanceId,
            online: this.online,
            authenticated: Boolean(this.auth.getAuthenticatedUser()),
            cloudSessionAvailable: this.hasCloudPublishingSession(),
            projects: [...projectIds].map((projectId) => this.toProjectDiagnostics(projectId, this.ensureProjectState(projectId))),
        };
    }
    toProjectDiagnostics(projectId, state) {
        return {
            projectId,
            publishingEnabled: state.publishingEnabled,
            status: state.status,
            instanceId: this.instanceId,
            leaseOwnerInstanceId: state.leaseOwnerInstanceId,
            ownsLease: state.ownsLease,
            leaseExpiresAt: state.leaseExpiresAt,
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
    ensureProjectState(projectId) {
        const existing = this.projectStates.get(projectId);
        if (existing) {
            return existing;
        }
        const cachedEnabled = this.settings.get((0, types_1.publishingProjectEnabledCacheKey)(projectId), false);
        const created = {
            publishingEnabled: cachedEnabled === true,
            status: cachedEnabled ? "waiting_for_data" : "disabled",
            ownsLease: false,
            leaseOwnerInstanceId: null,
            leaseExpiresAt: null,
            latestLocalRevision: null,
            latestLocalHash: null,
            latestPublishedRevision: this.settings.get((0, types_1.publishingProjectLastPublishedRevisionKey)(projectId), null),
            latestPublishedHash: this.settings.get((0, types_1.publishingProjectLastPublishedHashKey)(projectId), null),
            lastSuccessfulPublishAt: this.settings.get((0, types_1.publishingProjectLastSuccessfulPublishAtKey)(projectId), null),
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
        };
        this.projectStates.set(projectId, created);
        return created;
    }
    async refreshOnlineState() {
        try {
            const cloudClient = await this.getCloudClient();
            this.online = cloudClient ? await cloudClient.ping() : false;
        }
        catch {
            this.online = false;
        }
    }
    async refreshAllProjectSettings() {
        if (!this.auth.getAuthenticatedUser() || !this.hasCloudPublishingSession()) {
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
                if (state.publishingEnabled !== enabled) {
                    state.publishingEnabled = enabled;
                    this.settings.set((0, types_1.publishingProjectEnabledCacheKey)(project.id), enabled);
                    if (!enabled) {
                        state.status = "disabled";
                        state.pending = null;
                    }
                    else {
                        void this.syncProject(project.id, "settings-refresh");
                    }
                }
            }
            catch (error) {
                console.debug(`[PublishingManager] settings refresh failed for ${project.id}:`, error instanceof Error ? error.message : error);
            }
        }
    }
    async runHeartbeatCycle() {
        await this.refreshOnlineState();
        if (!this.auth.getAuthenticatedUser()) {
            for (const state of this.projectStates.values()) {
                if (state.publishingEnabled) {
                    state.status = "authentication_required";
                }
            }
            return;
        }
        if (!this.hasCloudPublishingSession()) {
            for (const state of this.projectStates.values()) {
                if (state.publishingEnabled) {
                    state.status = "cloud_session_required";
                }
            }
            return;
        }
        for (const project of this.projects.list()) {
            const state = this.ensureProjectState(project.id);
            if (!state.publishingEnabled) {
                continue;
            }
            if (state.nextRetryAt && Date.parse(state.nextRetryAt) > Date.now()) {
                continue;
            }
            void this.syncProject(project.id, "heartbeat");
        }
    }
    async syncProject(projectId, reason) {
        if (this.stopping) {
            return;
        }
        const state = this.ensureProjectState(projectId);
        if (!state.publishingEnabled) {
            state.status = "disabled";
            return;
        }
        if (!this.auth.getAuthenticatedUser()) {
            state.status = "authentication_required";
            return;
        }
        if (!this.hasCloudPublishingSession()) {
            state.status = "cloud_session_required";
            return;
        }
        const userId = this.auth.getAuthenticatedUser()?.userId;
        if (!userId) {
            state.status = "authentication_required";
            return;
        }
        const capabilities = this.access.getProjectCapabilities(userId, projectId);
        if (!capabilities.canOperateEngines && !capabilities.canEditProjectSettings) {
            state.status = "error";
            state.lastErrorSummary = "You do not have permission to publish this project.";
            return;
        }
        if (!this.online) {
            state.status = "paused_offline";
            return;
        }
        const cloudClient = await this.getCloudClient();
        if (!cloudClient) {
            state.status = "cloud_session_required";
            return;
        }
        const registration = await this.ensureHostedProjectRegistered(cloudClient, projectId);
        if (!registration.ok) {
            state.status = registration.code === "forbidden" ? "error" : "cloud_session_required";
            state.lastErrorSummary = registration.message;
            return;
        }
        if (state.inFlight) {
            state.resyncAfterInFlight = true;
            return;
        }
        state.inFlight = true;
        state.lastAttemptAt = new Date().toISOString();
        try {
            const canonical = this.data.getLocalCanonicalProjectResponse(projectId);
            state.sourceMode = canonical.payload?.source.mode ?? null;
            state.sourceConnected = canonical.runtime.dataConnected;
            if (canonical.availability !== "ready" || !canonical.payload) {
                state.status = "waiting_for_data";
                return;
            }
            const validation = (0, validate_1.validatePublishedProjectPayload)(canonical.payload);
            if (!validation.ok) {
                state.status = "error";
                state.lastErrorSummary = validation.issues.join(" ");
                return;
            }
            if (validation.payload.projectId !== projectId) {
                state.status = "error";
                state.lastErrorSummary = "Published payload project identity mismatch.";
                return;
            }
            const payload = validation.payload;
            const payloadHash = (0, hash_1.hashCanonicalProjectData)(payload.data);
            const payloadSizeBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
            state.latestLocalRevision = payload.revision;
            state.latestLocalHash = payloadHash;
            state.payloadSizeBytes = payloadSizeBytes;
            if (payloadSizeBytes > types_1.PUBLISHING_MAX_PAYLOAD_BYTES) {
                state.status = "error";
                state.lastErrorSummary = "Canonical payload exceeds the maximum publish size.";
                return;
            }
            if (payloadHash === state.latestPublishedHash &&
                payload.revision === state.latestPublishedRevision) {
                state.status = state.ownsLease ? "active" : "waiting_for_data";
                state.pending = null;
                return;
            }
            state.pending = {
                payload,
                payloadHash,
                payloadSizeBytes,
                queuedAt: new Date().toISOString(),
            };
            if (!state.ownsLease) {
                state.status = "acquiring_lease";
                const lease = await cloudClient.acquireLease(projectId, this.instanceId);
                if (!lease.ok) {
                    if (lease.code === "lease_conflict") {
                        state.status = "publisher_conflict";
                        state.leaseOwnerInstanceId = lease.owner_instance_id ?? null;
                        state.leaseExpiresAt = lease.lease_expires_at ?? null;
                        state.lastErrorSummary = lease.message ?? "Another publisher owns this project.";
                        this.scheduleRetry(projectId, state, lease.code);
                        return;
                    }
                    if (lease.code === "publishing_disabled") {
                        state.publishingEnabled = false;
                        state.status = "disabled";
                        this.settings.set((0, types_1.publishingProjectEnabledCacheKey)(projectId), false);
                        return;
                    }
                    if (lease.code === "forbidden" || lease.code === "authentication_required") {
                        state.status = "error";
                        state.lastErrorSummary = lease.message ?? "Cloud publishing permission denied.";
                        return;
                    }
                    throw new Error(lease.message ?? "Unable to acquire publisher lease.");
                }
                state.ownsLease = true;
                state.leaseOwnerInstanceId = this.instanceId;
                state.leaseExpiresAt = lease.lease_expires_at ?? null;
            }
            else {
                const renewed = await cloudClient.renewLease(projectId, this.instanceId);
                if (!renewed.ok) {
                    state.ownsLease = false;
                    if (renewed.code === "lease_not_owned") {
                        state.status = "acquiring_lease";
                        return this.syncProject(projectId, "lease-renew-retry");
                    }
                    if (renewed.code === "forbidden" || renewed.code === "authentication_required") {
                        state.status = "error";
                        state.lastErrorSummary = renewed.message ?? "Cloud publishing permission denied.";
                        return;
                    }
                    throw new Error(renewed.message ?? "Unable to renew publisher lease.");
                }
                state.leaseExpiresAt = renewed.lease_expires_at ?? state.leaseExpiresAt;
            }
            state.status = "publishing";
            const pending = state.pending;
            if (!pending) {
                state.status = "active";
                return;
            }
            const publishResult = await cloudClient.publishSnapshot({
                projectId,
                publisherInstanceId: this.instanceId,
                payload: pending.payload,
                payloadHash: pending.payloadHash,
            });
            if (!publishResult.ok) {
                if (publishResult.code === "duplicate_unchanged") {
                    this.markPublished(state, projectId, pending.payloadHash, pending.payload.revision);
                    state.pending = null;
                    state.status = "active";
                    state.retryAttempt = 0;
                    state.nextRetryAt = null;
                    state.lastErrorSummary = null;
                    return;
                }
                if (publishResult.code === "lease_not_owned") {
                    state.ownsLease = false;
                    state.status = "acquiring_lease";
                    this.scheduleRetry(projectId, state, publishResult.code);
                    return;
                }
                if (publishResult.code === "forbidden" || publishResult.code === "authentication_required") {
                    state.status = "error";
                    state.lastErrorSummary = publishResult.message ?? "Cloud publishing permission denied.";
                    return;
                }
                state.status = "error";
                state.lastErrorSummary = publishResult.message ?? "Publish failed.";
                if (!(0, types_1.isRecoverablePublishingError)(publishResult.code)) {
                    state.retryAttempt = 0;
                    state.nextRetryAt = null;
                    return;
                }
                this.scheduleRetry(projectId, state, publishResult.code);
                return;
            }
            this.markPublished(state, projectId, publishResult.payload_hash ?? pending.payloadHash, publishResult.revision ?? pending.payload.revision);
            state.pending = null;
            state.status = "active";
            state.retryAttempt = 0;
            state.nextRetryAt = null;
            state.lastErrorSummary = null;
            console.debug(`[PublishingManager] published project=${projectId} reason=${reason}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            state.status = this.online ? "reconnecting" : "paused_offline";
            state.lastErrorSummary = message;
            this.scheduleRetry(projectId, state, "network");
            console.warn(`[PublishingManager] sync failed project=${projectId}:`, message);
        }
        finally {
            state.inFlight = false;
            if (state.resyncAfterInFlight && state.publishingEnabled && !this.stopping) {
                state.resyncAfterInFlight = false;
                void this.syncProject(projectId, "coalesced");
            }
        }
    }
    markPublished(state, projectId, payloadHash, revision) {
        const publishedAt = new Date().toISOString();
        state.latestPublishedHash = payloadHash;
        state.latestPublishedRevision = revision;
        state.lastSuccessfulPublishAt = publishedAt;
        this.settings.set((0, types_1.publishingProjectLastPublishedHashKey)(projectId), payloadHash);
        this.settings.set((0, types_1.publishingProjectLastPublishedRevisionKey)(projectId), revision);
        this.settings.set((0, types_1.publishingProjectLastSuccessfulPublishAtKey)(projectId), publishedAt);
    }
    scheduleRetry(projectId, state, code) {
        if (!(0, types_1.isRecoverablePublishingError)(code)) {
            state.nextRetryAt = null;
            return;
        }
        if (state.retryTimer) {
            clearTimeout(state.retryTimer);
        }
        const delayMs = (0, types_1.computePublishingBackoffMs)(state.retryAttempt);
        state.retryAttempt += 1;
        state.nextRetryAt = new Date(Date.now() + delayMs).toISOString();
        state.retryTimer = setTimeout(() => {
            state.retryTimer = null;
            void this.syncProject(projectId, "retry");
        }, delayMs);
    }
}
exports.PublishingManager = PublishingManager;
