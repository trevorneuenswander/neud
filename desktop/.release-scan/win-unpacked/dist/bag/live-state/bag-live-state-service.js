"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BagLiveStateService = void 0;
const default_sources_1 = require("../default-sources");
const bag_manual_service_1 = require("./bag-manual-service");
const bag_snapshot_normalizer_1 = require("./bag-snapshot-normalizer");
const currency_rate_service_1 = require("../../services/currency-rate-service");
class BagLiveStateService {
    projects;
    dataSources;
    repository;
    events;
    manual;
    auctionDataset = null;
    currencyRates = null;
    constructor(projects, dataSources, repository, events, manualEvents) {
        this.projects = projects;
        this.dataSources = dataSources;
        this.repository = repository;
        this.events = events;
        this.manual = new bag_manual_service_1.BagManualModeService(projects, dataSources, repository, manualEvents, events, (state, engineId) => this.mergeConnectionFromEngine(state, engineId));
    }
    setAuctionDatasetService(service) {
        this.auctionDataset = service;
        this.syncLocalControllerProviders();
    }
    setCurrencyRateService(service) {
        this.currencyRates = service;
        this.syncLocalControllerProviders();
    }
    syncLocalControllerProviders() {
        this.manual.configureProviders({
            getActiveDataset: (projectId) => this.auctionDataset?.readActiveDataset(projectId) ?? null,
            hasFileDataset: (projectId) => this.auctionDataset?.isFileDatasetActive(projectId) ?? false,
            buildBidCurrencyStrings: (amountUsd) => {
                if (!this.currencyRates)
                    return [];
                return (0, currency_rate_service_1.buildManualBidCurrencyDisplayStrings)(amountUsd, this.currencyRates.getRates());
            },
        });
    }
    isBagGraphicsProject(projectId) {
        const project = this.projects.getById(projectId);
        return project?.projectType === "bag-graphics";
    }
    projectExists(projectId) {
        return this.projects.getById(projectId) !== null;
    }
    getBagEngineForProject(projectId) {
        return this.dataSources
            .listByProject(projectId)
            .find((engine) => engine.sourceType === "webpage-scraper" &&
            (0, default_sources_1.isBagAuctionEngineConfig)(engine.config));
    }
    getLiveState(projectId) {
        if (!this.isBagGraphicsProject(projectId)) {
            return null;
        }
        return this.ensureLiveState(projectId);
    }
    getLiveStateEnvelope(projectId) {
        if (!this.isBagGraphicsProject(projectId)) {
            return null;
        }
        const state = this.ensureLiveState(projectId);
        const record = this.repository.get(projectId);
        if (!record) {
            return {
                state,
                automaticState: state.mode === "automatic" ? state : null,
                manualSession: null,
                automaticComparison: null,
            };
        }
        return this.manual.buildEnvelope(record);
    }
    ensureLiveState(projectId) {
        const engine = this.getBagEngineForProject(projectId);
        if (!engine) {
            return (0, bag_snapshot_normalizer_1.createEmptyBagLiveState)({
                projectId,
                engineId: "unknown",
                connection: { status: "stopped" },
            });
        }
        const persisted = this.repository.get(projectId);
        if (persisted) {
            const merged = this.mergeConnectionFromEngine(persisted.state, engine.id);
            if (merged !== persisted.state) {
                this.repository.upsert({
                    projectId,
                    engineId: engine.id,
                    state: merged,
                    sourceSnapshotId: persisted.sourceSnapshotId,
                });
            }
            return merged;
        }
        const latestSnapshot = this.dataSources.getLatestSnapshot(engine.id);
        if (latestSnapshot) {
            const derived = this.processSnapshot(engine.id, latestSnapshot, {
                publish: false,
            });
            if (derived) {
                return derived.envelope.state;
            }
        }
        const empty = (0, bag_snapshot_normalizer_1.createEmptyBagLiveState)({
            projectId,
            engineId: engine.id,
            connection: this.buildConnectionFromStatus(engine.id),
        });
        this.repository.upsert({
            projectId,
            engineId: engine.id,
            state: empty,
            automaticState: empty,
        });
        return empty;
    }
    recoverAllProjects() {
        for (const project of this.projects.list()) {
            if (project.projectType !== "bag-graphics")
                continue;
            try {
                const persisted = this.repository.get(project.id);
                if (persisted?.mode === "manual") {
                    this.manual.markRestoredSession(project.id);
                }
                this.ensureLiveState(project.id);
            }
            catch (error) {
                console.error(`[bag-live-state] Failed to recover project ${project.id}:`, error);
            }
        }
    }
    processSnapshot(engineId, snapshot, options = {}) {
        const engine = this.dataSources.getById(engineId);
        if (!engine || !(0, default_sources_1.isBagAuctionEngineConfig)(engine.config)) {
            return null;
        }
        const project = this.projects.getById(engine.projectId);
        if (!project || project.projectType !== "bag-graphics") {
            return null;
        }
        const persisted = this.repository.get(project.id);
        const previousActive = persisted?.state ?? null;
        const connection = this.buildConnectionFromStatus(engineId, {
            lastSuccessfulScrapeAt: snapshot.capturedAt,
            lastAttemptAt: snapshot.capturedAt,
        });
        const normalized = (0, bag_snapshot_normalizer_1.normalizeBagSnapshot)({
            projectId: project.id,
            engineId,
            snapshotId: snapshot.id,
            capturedAt: snapshot.capturedAt,
            snapshot: snapshot.data,
            connection: {
                ...connection,
                status: "connected",
            },
            previousState: previousActive,
        });
        if (!normalized.ok) {
            return this.handleInvalidSnapshot({
                project,
                engineId,
                snapshot,
                previousActive,
                persisted,
                connection,
                error: normalized.error,
                publish: options.publish !== false,
            });
        }
        const automaticState = this.mergeConnectionFromEngine(normalized.state, engineId);
        if (persisted?.mode === "manual") {
            const preserveFileDataset = this.auctionDataset?.isFileDatasetActive(project.id) ?? false;
            const stateForSync = preserveFileDataset && persisted.automaticState
                ? {
                    ...persisted.automaticState,
                    connection: automaticState.connection,
                }
                : automaticState;
            const synced = this.manual.syncLocalControllerFromAutomatic(persisted, stateForSync);
            const manualActive = this.mergeConnectionFromEngine(synced.state, engineId);
            const record = this.repository.upsert({
                projectId: project.id,
                engineId,
                state: manualActive,
                automaticState: preserveFileDataset ? persisted.automaticState : automaticState,
                manualState: manualActive,
                latestScrapedCurrentLot: automaticState.currentLot ?? synced.latestScrapedCurrentLot,
                localControllerDraft: synced.localControllerDraft,
                localControllerSubmitted: synced.localControllerSubmitted,
                sourceSnapshotId: snapshot.id,
            });
            const envelope = this.manual.buildEnvelope(record);
            if (options.publish !== false) {
                this.events.publishUpdate(envelope);
            }
            return { envelope, state: envelope.state };
        }
        const record = this.repository.upsert({
            projectId: project.id,
            engineId,
            state: automaticState,
            automaticState,
            sourceSnapshotId: snapshot.id,
        });
        const envelope = this.manual.buildEnvelope(record);
        if (options.publish !== false) {
            this.events.publishUpdate(envelope);
        }
        return { envelope, state: envelope.state };
    }
    syncEngineStatus(engineId) {
        const engine = this.dataSources.getById(engineId);
        if (!engine || !(0, default_sources_1.isBagAuctionEngineConfig)(engine.config))
            return;
        const project = this.projects.getById(engine.projectId);
        if (!project || project.projectType !== "bag-graphics")
            return;
        const persisted = this.repository.get(project.id);
        if (!persisted) {
            this.ensureLiveState(project.id);
            return;
        }
        const next = this.mergeConnectionFromEngine(persisted.state, engineId);
        const record = this.repository.upsert({
            projectId: project.id,
            engineId,
            state: next,
            sourceSnapshotId: persisted.sourceSnapshotId,
        });
        this.events.publishUpdate(this.manual.buildEnvelope(record));
    }
    enterManualMode(projectId, actor) {
        this.ensureLiveState(projectId);
        return this.manual.enterManualMode(projectId, actor);
    }
    exitManualMode(projectId, actor) {
        return this.manual.exitManualMode(projectId, actor);
    }
    applyManualLotPatch(projectId, patch, actor) {
        return this.manual.applyManualLotPatch(projectId, patch, actor);
    }
    selectPreviousLot(projectId, actor) {
        return this.manual.selectPreviousLot(projectId, actor);
    }
    selectNextLot(projectId, actor) {
        return this.manual.selectNextLot(projectId, actor);
    }
    loadLotForEditing(projectId, input, actor) {
        return this.manual.loadLotForEditing(projectId, input, actor);
    }
    selectLot(projectId, lotIdentifier, actor) {
        return this.manual.selectLot(projectId, lotIdentifier, actor);
    }
    setManualBid(projectId, bidInput, actor) {
        return this.manual.setManualBid(projectId, bidInput, actor);
    }
    adjustManualBid(projectId, delta, actor) {
        return this.manual.adjustManualBid(projectId, delta, actor);
    }
    previewBidCalculator(projectId, expression) {
        return this.manual.previewBidCalculator(projectId, expression);
    }
    applyBidCalculator(projectId, expression, actor) {
        return this.manual.applyBidCalculator(projectId, expression, actor);
    }
    setManualLotStatus(projectId, status, actor) {
        return this.manual.setManualLotStatus(projectId, status, actor);
    }
    clearManualLotStatus(projectId, actor) {
        return this.manual.clearManualLotStatus(projectId, actor);
    }
    submitManualLot(projectId, actor) {
        return this.manual.submitManualLot(projectId, actor);
    }
    submitManualBid(projectId, actor) {
        return this.manual.submitManualBid(projectId, actor);
    }
    updateDraftLotPhotoOrder(projectId, lotNumber, photoUrls, actor) {
        return this.manual.updateDraftLotPhotoOrder(projectId, lotNumber, photoUrls, actor);
    }
    removeDraftLotPhoto(projectId, lotNumber, photoUrl, actor) {
        return this.manual.removeDraftLotPhoto(projectId, lotNumber, photoUrl, actor);
    }
    addDraftLotPhotos(projectId, lotNumber, photoUrls, actor) {
        return this.manual.addDraftLotPhotos(projectId, lotNumber, photoUrls, actor);
    }
    getLotPhotoOverrides(projectId) {
        return this.repository.get(projectId)?.lotPhotoOverrides ?? {};
    }
    loadOfflineAuction(projectId, auctionData, actor) {
        return this.manual.loadOfflineAuction(projectId, auctionData, actor);
    }
    clearDownloadedDatasetState(projectId, actor) {
        return this.manual.clearDownloadedDatasetState(projectId, actor);
    }
    getSubmittedDisplayState(projectId) {
        return this.manual.getSubmittedDisplayState(projectId);
    }
    getDisplayUrl(projectId, baseUrl) {
        return `${baseUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/bag/display`;
    }
    getControllerInfo(projectId, baseUrl) {
        const engine = this.getBagEngineForProject(projectId);
        return {
            projectId,
            engineId: engine?.id ?? null,
            displayUrl: this.getDisplayUrl(projectId, baseUrl),
            liveUrl: `${baseUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/bag/live`,
            eventsUrl: `${baseUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/bag/live/events`,
        };
    }
    handleInvalidSnapshot(input) {
        const { project, engineId, snapshot, previousActive, persisted, connection, error, publish } = input;
        this.dataSources.insertLog(engineId, {
            level: "warning",
            eventType: "bag.live_state.normalize_failed",
            message: error,
            metadata: { snapshotId: snapshot.id },
        });
        if (persisted?.mode === "manual" && previousActive) {
            const manualActive = this.mergeConnectionFromEngine({
                ...previousActive,
                connection: {
                    ...previousActive.connection,
                    ...connection,
                    status: "error",
                    lastError: error,
                    lastAttemptAt: snapshot.capturedAt,
                },
            }, engineId);
            const record = this.repository.upsert({
                projectId: project.id,
                engineId,
                state: manualActive,
                sourceSnapshotId: persisted.sourceSnapshotId,
            });
            const envelope = this.manual.buildEnvelope(record);
            if (publish) {
                this.events.publishUpdate(envelope);
            }
            return { envelope, state: envelope.state };
        }
        const fallback = previousActive
            ? {
                ...previousActive,
                connection: {
                    ...previousActive.connection,
                    ...connection,
                    status: "error",
                    lastError: error,
                    lastAttemptAt: snapshot.capturedAt,
                },
                updatedAt: new Date().toISOString(),
            }
            : (0, bag_snapshot_normalizer_1.createEmptyBagLiveState)({
                projectId: project.id,
                engineId,
                connection: {
                    ...connection,
                    status: "error",
                    lastError: error,
                    lastAttemptAt: snapshot.capturedAt,
                },
            });
        const record = this.repository.upsert({
            projectId: project.id,
            engineId,
            state: fallback,
            automaticState: persisted?.automaticState ?? fallback,
            sourceSnapshotId: previousActive?.source.snapshotId ?? null,
        });
        const envelope = this.manual.buildEnvelope(record);
        if (publish) {
            this.events.publishUpdate(envelope);
        }
        return { envelope, state: envelope.state };
    }
    mergeConnectionFromEngine(state, engineId) {
        const status = this.dataSources.getStatus(engineId);
        const connection = this.buildConnectionFromStatus(engineId, {
            lastSuccessfulScrapeAt: state.connection.lastSuccessfulScrapeAt ?? status?.lastSuccessAt ?? undefined,
            lastAttemptAt: state.connection.lastAttemptAt ?? status?.lastRunAt ?? undefined,
            lastError: status?.lastError ?? undefined,
        });
        return {
            ...state,
            connection: {
                ...state.connection,
                ...connection,
            },
        };
    }
    buildConnectionFromStatus(engineId, patch = {}) {
        const status = this.dataSources.getStatus(engineId);
        const mappedStatus = mapEngineStatus(status?.actualState, status?.healthState);
        return {
            status: patch.status ?? mappedStatus,
            lastSuccessfulScrapeAt: patch.lastSuccessfulScrapeAt ?? status?.lastSuccessAt ?? undefined,
            lastAttemptAt: patch.lastAttemptAt ?? status?.lastRunAt ?? undefined,
            lastError: patch.lastError ?? status?.lastError ?? undefined,
        };
    }
}
exports.BagLiveStateService = BagLiveStateService;
function mapEngineStatus(actualState, healthState) {
    switch (actualState) {
        case "starting":
            return "starting";
        case "running":
            return healthState === "error" ? "error" : "scraping";
        case "stopping":
        case "stopped":
            return "stopped";
        case "error":
            return "error";
        case "offline":
            return "disconnected";
        default:
            return healthState === "warning" ? "retrying" : "disconnected";
    }
}
