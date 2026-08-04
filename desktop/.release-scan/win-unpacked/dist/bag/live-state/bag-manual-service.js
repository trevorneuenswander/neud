"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BagManualModeService = void 0;
const bag_lot_navigation_1 = require("./bag-lot-navigation");
const bag_local_controller_service_1 = require("./bag-local-controller-service");
const bag_manual_validation_1 = require("./bag-manual-validation");
class BagManualModeService {
    projects;
    dataSources;
    repository;
    manualEvents;
    events;
    mergeConnectionFromEngine;
    restoredSessions = new Set();
    localController;
    constructor(projects, dataSources, repository, manualEvents, events, mergeConnectionFromEngine) {
        this.projects = projects;
        this.dataSources = dataSources;
        this.repository = repository;
        this.manualEvents = manualEvents;
        this.events = events;
        this.mergeConnectionFromEngine = mergeConnectionFromEngine;
        this.localController = new bag_local_controller_service_1.BagLocalControllerService(repository, manualEvents, events, (record) => this.buildEnvelope(record));
    }
    configureProviders(providers) {
        this.localController.configureProviders(providers);
    }
    markRestoredSession(projectId) {
        this.restoredSessions.add(projectId);
    }
    buildEnvelope(record) {
        const automaticState = record.automaticState ??
            (record.mode === "automatic" ? record.state : null);
        const restored = this.restoredSessions.has(record.projectId);
        const envelope = {
            state: record.state,
            automaticState,
            manualSession: record.mode === "manual"
                ? {
                    startedAt: record.manualStartedAt,
                    startedBy: record.manualStartedBy,
                    restoredFromPreviousSession: restored,
                }
                : null,
            automaticComparison: this.buildAutomaticComparison(record, automaticState),
            latestScrapedCurrentLot: record.latestScrapedCurrentLot,
            localControllerDraft: record.localControllerDraft,
            localControllerSubmitted: record.localControllerSubmitted,
            manualLotNavigation: record.manualLotNavigation,
            manualLotNavigationCapabilities: this.localController.getNavigationCapabilities(record),
        };
        if (restored) {
            this.restoredSessions.delete(record.projectId);
        }
        return envelope;
    }
    publishRecord(record) {
        this.events.publishUpdate(this.buildEnvelope(record));
    }
    syncLocalControllerFromAutomatic(record, automaticState) {
        const next = this.localController.syncFromAutomaticState(record, automaticState);
        this.publishRecord(next);
        return next;
    }
    getSubmittedDisplayState(projectId) {
        const record = this.repository.get(projectId);
        if (!record)
            return null;
        return this.localController.getSubmittedDisplayState(record);
    }
    enterManualMode(projectId, actor) {
        const record = this.requireBagRecord(projectId);
        const active = this.mergeConnectionFromEngine(record.state, record.engineId);
        const automaticState = record.automaticState ??
            (record.mode === "automatic" ? active : null) ??
            active;
        const now = new Date().toISOString();
        const actorLabel = formatActor(actor);
        const initialized = this.localController.initializeForManualMode(record, {
            ...automaticState,
            connection: active.connection,
        });
        const next = this.repository.upsert({
            projectId,
            engineId: record.engineId,
            state: initialized.state,
            automaticState: initialized.automaticState,
            manualState: initialized.state,
            manualStartedAt: now,
            manualStartedBy: actorLabel,
            latestScrapedCurrentLot: initialized.latestScrapedCurrentLot,
            localControllerDraft: initialized.localControllerDraft,
            localControllerSubmitted: initialized.localControllerSubmitted,
            sourceSnapshotId: record.sourceSnapshotId,
        });
        this.audit({
            projectId,
            eventType: "enter_manual",
            previousValue: { mode: record.mode },
            nextValue: { mode: "manual" },
            actor,
        });
        this.publishRecord(next);
        return { ok: true, envelope: this.buildEnvelope(next) };
    }
    exitManualMode(projectId, actor) {
        const record = this.requireManualRecord(projectId);
        const automaticState = record.automaticState;
        if (!automaticState) {
            return {
                ok: false,
                error: "No valid automatic scraper state is available to resume.",
            };
        }
        const resumed = this.mergeConnectionFromEngine({
            ...automaticState,
            mode: "automatic",
            updatedAt: new Date().toISOString(),
        }, record.engineId);
        const next = this.repository.upsert({
            projectId,
            engineId: record.engineId,
            state: resumed,
            automaticState: resumed,
            manualState: null,
            manualStartedAt: null,
            manualStartedBy: null,
            sourceSnapshotId: automaticState.source.snapshotId ?? record.sourceSnapshotId,
        });
        this.audit({
            projectId,
            eventType: "exit_manual",
            previousValue: { mode: "manual", state: record.state },
            nextValue: { mode: "automatic", state: resumed },
            actor,
        });
        this.publishRecord(next);
        return { ok: true, envelope: this.buildEnvelope(next) };
    }
    applyManualLotPatch(projectId, patch, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.patchDraftLot(record, patch, actor);
    }
    selectPreviousLot(projectId, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.selectDraftPreviousLot(record, actor);
    }
    selectNextLot(projectId, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.selectDraftNextLot(record, actor);
    }
    loadLotForEditing(projectId, input, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.loadLotForEditing(record, input, actor);
    }
    selectLot(projectId, lotIdentifier, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.selectDraftLot(record, lotIdentifier, actor);
    }
    setManualBid(projectId, bidInput, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.setDraftBid(record, bidInput, actor);
    }
    adjustManualBid(projectId, delta, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.adjustDraftBid(record, delta, actor);
    }
    previewBidCalculator(projectId, expression) {
        const record = this.requireManualRecord(projectId);
        return this.localController.previewDraftCalculator(record, expression);
    }
    applyBidCalculator(projectId, expression, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.applyDraftCalculator(record, expression, actor);
    }
    submitManualLot(projectId, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.submitLot(record, actor);
    }
    submitManualBid(projectId, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.submitBid(record, actor);
    }
    updateDraftLotPhotoOrder(projectId, lotNumber, photoUrls, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.updateDraftLotPhotoOrder(record, lotNumber, photoUrls, actor);
    }
    removeDraftLotPhoto(projectId, lotNumber, photoUrl, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.removeDraftLotPhoto(record, lotNumber, photoUrl, actor);
    }
    addDraftLotPhotos(projectId, lotNumber, photoUrls, actor) {
        const record = this.requireManualRecord(projectId);
        return this.localController.addDraftLotPhotos(record, lotNumber, photoUrls, actor);
    }
    loadOfflineAuction(projectId, auctionData, actor) {
        const record = this.requireBagRecord(projectId);
        return this.localController.loadOfflineAuction(record, auctionData, actor);
    }
    clearDownloadedDatasetState(projectId, actor) {
        const record = this.requireBagRecord(projectId);
        return this.localController.clearDownloadedDatasetState(record, actor);
    }
    setManualLotStatus(projectId, status, actor) {
        const record = this.requireManualRecord(projectId);
        const currentLot = record.state.currentLot;
        if (!currentLot) {
            return { ok: false, error: "No current lot is selected." };
        }
        const nextLot = {
            ...currentLot,
            sold: status === "sold",
            passed: status === "passed",
        };
        return this.updateManualState(projectId, record, (state) => ({
            ...state,
            currentLot: nextLot,
        }), {
            eventType: "set_status",
            previousValue: {
                sold: currentLot.sold ?? false,
                passed: currentLot.passed ?? false,
            },
            nextValue: {
                sold: nextLot.sold ?? false,
                passed: nextLot.passed ?? false,
            },
            details: { status },
            actor,
        });
    }
    clearManualLotStatus(projectId, actor) {
        const record = this.requireManualRecord(projectId);
        const currentLot = record.state.currentLot;
        if (!currentLot) {
            return { ok: false, error: "No current lot is selected." };
        }
        const nextLot = {
            ...currentLot,
            sold: false,
            passed: false,
        };
        return this.updateManualState(projectId, record, (state) => ({
            ...state,
            currentLot: nextLot,
        }), {
            eventType: "clear_status",
            previousValue: {
                sold: currentLot.sold ?? false,
                passed: currentLot.passed ?? false,
            },
            nextValue: { sold: false, passed: false },
            actor,
        });
    }
    applyBidAmount(projectId, record, amount, audit) {
        const currentLot = record.state.currentLot;
        if (!currentLot) {
            return { ok: false, error: "No current lot is selected." };
        }
        const nextLot = (0, bag_manual_validation_1.applyBidToLot)(currentLot, amount, currentLot.currency ?? "USD");
        if (!nextLot) {
            return { ok: false, error: "Unable to update bid." };
        }
        return this.updateManualState(projectId, record, (state) => ({
            ...state,
            currentLot: nextLot,
        }), audit);
    }
    updateManualState(projectId, record, mutate, audit) {
        const nextState = {
            ...mutate(record.state),
            mode: "manual",
            source: { type: "manual" },
            updatedAt: new Date().toISOString(),
        };
        const next = this.repository.upsert({
            projectId,
            engineId: record.engineId,
            state: nextState,
            manualState: nextState,
            sourceSnapshotId: record.sourceSnapshotId,
        });
        this.audit({
            projectId,
            eventType: audit.eventType,
            previousValue: audit.previousValue,
            nextValue: audit.nextValue,
            details: audit.details,
            actor: audit.actor,
        });
        this.publishRecord(next);
        return { ok: true, envelope: this.buildEnvelope(next) };
    }
    requireBagRecord(projectId) {
        const project = this.projects.getById(projectId);
        if (!project || project.projectType !== "bag-graphics") {
            throw new Error("Manual controls are only available for BAG projects.");
        }
        const record = this.repository.get(projectId);
        if (!record) {
            throw new Error("Live state is not initialized for this project.");
        }
        return record;
    }
    requireManualRecord(projectId) {
        const record = this.requireBagRecord(projectId);
        if (record.mode !== "manual") {
            throw new Error("Manual controls require Manual Mode.");
        }
        return record;
    }
    buildAutomaticComparison(record, automaticState) {
        if (record.mode !== "manual" || !automaticState) {
            return null;
        }
        return {
            hasNewerAutomaticData: Boolean(automaticState.updatedAt) &&
                automaticState.updatedAt > record.state.updatedAt,
            differsFromManual: (0, bag_lot_navigation_1.statesDifferForComparison)(record.state, automaticState),
            automaticUpdatedAt: automaticState.updatedAt,
            automaticCurrentLotNumber: automaticState.currentLot?.lotNumber,
            automaticCurrentBidLabel: automaticState.currentLot?.currentBidLabel ??
                (automaticState.currentLot?.currentBid != null
                    ? (0, bag_manual_validation_1.formatBidLabel)(automaticState.currentLot.currentBid)
                    : undefined),
        };
    }
    audit(input) {
        try {
            this.manualEvents.insert({
                projectId: input.projectId,
                eventType: input.eventType,
                previousValue: input.previousValue,
                nextValue: input.nextValue,
                details: input.details,
                createdBy: formatActor(input.actor),
            });
        }
        catch (error) {
            console.error("[bag-manual] Failed to record audit event:", error);
        }
    }
}
exports.BagManualModeService = BagManualModeService;
function formatActor(actor) {
    return actor.email ?? actor.id ?? null;
}
