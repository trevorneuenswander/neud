"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BagLocalControllerService = void 0;
const bag_local_controller_state_1 = require("./bag-local-controller-state");
const bag_manual_lot_navigation_1 = require("./bag-manual-lot-navigation");
const bag_lot_navigation_1 = require("./bag-lot-navigation");
const bag_snapshot_normalizer_1 = require("./bag-snapshot-normalizer");
const bag_manual_validation_1 = require("./bag-manual-validation");
const display_bid_normalization_1 = require("../../displays/display-bid-normalization");
const reserve_status_1 = require("../reserve-status");
const lot_key_1 = require("../lot-key");
class BagLocalControllerService {
    repository;
    manualEvents;
    events;
    buildEnvelope;
    providers = {
        getActiveDataset: () => null,
        hasFileDataset: () => false,
        buildBidCurrencyStrings: () => [],
    };
    constructor(repository, manualEvents, events, buildEnvelope) {
        this.repository = repository;
        this.manualEvents = manualEvents;
        this.events = events;
        this.buildEnvelope = buildEnvelope;
    }
    configureProviders(providers) {
        this.providers = { ...this.providers, ...providers };
    }
    syncFromAutomaticState(record, automaticState) {
        const latestScrapedCurrentLot = automaticState.currentLot ?? null;
        const draft = record.localControllerDraft ?? (0, bag_local_controller_state_1.createEmptyDraft)();
        const navState = {
            ...automaticState,
            lots: automaticState.lots.length > 0 ? automaticState.lots : record.state.lots,
        };
        return this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: {
                ...record.state,
                lots: navState.lots,
                lotCount: navState.lotCount,
                connection: {
                    ...record.state.connection,
                    ...automaticState.connection,
                },
            },
            automaticState,
            latestScrapedCurrentLot,
            localControllerDraft: draft,
            sourceSnapshotId: record.sourceSnapshotId,
        });
    }
    initializeForManualMode(record, automaticState) {
        const latestScrapedCurrentLot = automaticState.currentLot ?? null;
        const draft = (0, bag_local_controller_state_1.createEmptyDraft)();
        const navigation = (0, bag_manual_lot_navigation_1.createEmptyManualLotNavigation)();
        const baseSubmitted = record.localControllerSubmitted ??
            {
                ...automaticState,
                mode: "manual",
                source: { type: "manual" },
                updatedAt: new Date().toISOString(),
            };
        const submitted = {
            ...baseSubmitted,
            lots: this.stripAllLotBids(automaticState.lots),
            currentLot: this.stripLotBid(baseSubmitted.currentLot),
        };
        const manualState = {
            ...submitted,
            lots: submitted.lots,
            lotCount: automaticState.lotCount,
        };
        return this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: manualState,
            automaticState,
            manualState,
            latestScrapedCurrentLot,
            localControllerDraft: draft,
            localControllerSubmitted: submitted,
            manualLotNavigation: navigation,
            sourceSnapshotId: record.sourceSnapshotId,
        });
    }
    patchDraftLot(record, patch, actor) {
        const draft = this.requireDraft(record);
        const validated = (0, bag_manual_validation_1.validateManualLotPatch)(patch);
        if (!validated.ok) {
            return { ok: false, error: validated.error };
        }
        const nextLotNumber = validated.patch.lotNumber ?? draft.lotNumber;
        let nextTitle = validated.patch.title ?? draft.title;
        let nextReserveStatus = validated.patch.reserveStatus !== undefined
            ? validated.patch.reserveStatus
            : draft.reserveStatus;
        if (validated.patch.lotNumber !== undefined &&
            validated.patch.lotNumber.trim() !== draft.lotNumber.trim() &&
            validated.patch.title === undefined) {
            const matchedLot = (0, bag_lot_navigation_1.findLotByIdentifier)(this.navigationContext(record).lots, nextLotNumber);
            const matchedTitle = matchedLot ? (0, bag_manual_validation_1.formatManualLotTitle)(matchedLot) : "";
            if (matchedTitle) {
                nextTitle = matchedTitle;
            }
            if (validated.patch.reserveStatus === undefined && matchedLot?.reserveStatus) {
                nextReserveStatus = matchedLot.reserveStatus;
            }
        }
        const nextDraft = (0, bag_local_controller_state_1.draftLotPatch)(draft, {
            lotNumber: nextLotNumber,
            title: nextTitle,
            reserveStatus: nextReserveStatus,
        });
        return this.saveDraft(record, nextDraft, {
            eventType: "edit_lot",
            previousValue: draft,
            nextValue: nextDraft,
            actor,
        });
    }
    selectDraftPreviousLot(record, actor) {
        return this.navigateDraftLot(record, "previous", actor);
    }
    selectDraftNextLot(record, actor) {
        return this.navigateDraftLot(record, "next", actor);
    }
    loadLotForEditing(record, input, actor) {
        const nextDraft = {
            lotNumber: input.lotNumber,
            title: input.title,
            reserveStatus: input.reserveStatus,
            currentBid: input.currentBid ?? null,
            currentBidLabel: input.currentBidLabel ?? "",
            lotDirty: false,
            bidDirty: false,
        };
        const navigation = {
            cursorLotId: input.stableId,
        };
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: record.state,
            localControllerDraft: nextDraft,
            localControllerSubmitted: record.localControllerSubmitted,
            manualLotNavigation: navigation,
            sourceSnapshotId: record.sourceSnapshotId,
        });
        this.audit({
            projectId: record.projectId,
            eventType: "select_lot",
            previousValue: record.localControllerDraft,
            nextValue: nextDraft,
            details: { loadLotForEditing: true, stableId: input.stableId },
            actor,
        });
        const envelope = this.buildEnvelope(next);
        this.events.publishUpdate(envelope);
        return { ok: true, envelope };
    }
    selectDraftLot(record, lotIdentifier, actor) {
        const navContext = this.navigationContext(record);
        const lot = (0, bag_lot_navigation_1.findLotByIdentifier)(navContext.lots, lotIdentifier);
        if (!lot) {
            return {
                ok: false,
                error: `Lot "${lotIdentifier.trim()}" was not found.`,
            };
        }
        const startingLot = (0, bag_manual_lot_navigation_1.resolveNavigationStartingLot)({
            draft: this.requireDraft(record),
            navigation: this.requireNavigation(record),
            submittedLot: record.localControllerSubmitted?.currentLot ?? null,
            datasetCurrentLot: navContext.datasetCurrentLot,
            lots: navContext.lots,
        });
        if (!(0, bag_manual_lot_navigation_1.lotsDiffer)(startingLot, lot)) {
            return { ok: true, envelope: this.buildEnvelope(record) };
        }
        return this.applyDraftLot(record, lot, "select_lot", actor, {
            lotIdentifier: lotIdentifier.trim(),
        });
    }
    setDraftBid(record, bidInput, actor) {
        if (!bidInput.trim()) {
            return this.clearDraftBid(record, actor);
        }
        const amount = (0, bag_manual_validation_1.parseBidInput)(bidInput);
        if (amount === null) {
            return { ok: false, error: "Enter a valid bid amount." };
        }
        return this.applyDraftBid(record, amount, {
            eventType: "set_bid",
            previousValue: record.localControllerDraft?.currentBid ?? null,
            nextValue: amount,
            details: { bidInput },
            actor,
        });
    }
    adjustDraftBid(record, delta, actor) {
        if (!Number.isFinite(delta)) {
            return { ok: false, error: "Bid adjustment must be a number." };
        }
        const draft = this.requireDraft(record);
        const current = draft.currentBid ?? 0;
        const amount = Math.max(0, Math.round(current + delta));
        return this.applyDraftBid(record, amount, {
            eventType: "adjust_bid",
            previousValue: draft.currentBid,
            nextValue: amount,
            details: { delta },
            actor,
        });
    }
    applyDraftCalculator(record, expression, actor) {
        const draft = this.requireDraft(record);
        const result = (0, bag_manual_validation_1.evaluateBidExpression)(expression, draft.currentBid);
        if (!result.ok) {
            return result;
        }
        return this.applyDraftBid(record, result.amount, {
            eventType: "set_bid",
            previousValue: draft.currentBid,
            nextValue: result.amount,
            details: { expression },
            actor,
        });
    }
    previewDraftCalculator(record, expression) {
        const draft = this.requireDraft(record);
        const result = (0, bag_manual_validation_1.evaluateBidExpression)(expression, draft.currentBid);
        if (!result.ok) {
            return result;
        }
        return {
            ok: true,
            amount: result.amount,
            label: (0, bag_manual_validation_1.formatBidLabel)(result.amount),
        };
    }
    submitLot(record, actor) {
        const draft = this.requireDraft(record);
        const validated = (0, bag_manual_validation_1.validateManualLotPatch)({
            lotNumber: draft.lotNumber,
            title: draft.title,
        });
        if (!validated.ok) {
            return { ok: false, error: validated.error };
        }
        const baseSubmitted = record.localControllerSubmitted ??
            record.automaticState ??
            record.state;
        const navContext = this.navigationContext(record);
        const existingSubmittedLot = record.localControllerSubmitted?.currentLot;
        const matchedLot = (0, bag_lot_navigation_1.findLotByIdentifier)(navContext.lots, validated.patch.lotNumber ?? draft.lotNumber) ??
            null;
        const previousLotKey = (0, lot_key_1.getLotKey)(existingSubmittedLot);
        const nextLotKey = (0, lot_key_1.getLotKey)({
            id: matchedLot?.id,
            lotNumber: validated.patch.lotNumber ?? draft.lotNumber,
        });
        const lotIdentityChanged = nextLotKey !== "" && previousLotKey !== "" && nextLotKey !== previousLotKey;
        const manualReserve = (0, reserve_status_1.normalizeReserveStatus)(draft.reserveStatus);
        const reserveStatus = (0, reserve_status_1.formatReserveStatusLabel)(manualReserve !== "unknown"
            ? manualReserve
            : (0, reserve_status_1.readReserveStatusFromRecord)(matchedLot ?? {}) !== "unknown"
                ? (0, reserve_status_1.readReserveStatusFromRecord)(matchedLot ?? {})
                : (0, reserve_status_1.readReserveStatusFromRecord)((existingSubmittedLot ?? {})));
        const initialBidAmount = lotIdentityChanged
            ? (0, display_bid_normalization_1.resolveCanonicalBidAmount)({
                currentBid: matchedLot?.currentBid,
                currentBidLabel: matchedLot?.currentBidLabel,
            })
            : (0, display_bid_normalization_1.resolveCanonicalBidAmount)({
                currentBid: existingSubmittedLot?.currentBid,
                currentBidLabel: existingSubmittedLot?.currentBidLabel,
            });
        const initialBid = initialBidAmount ?? null;
        const initialBidLabel = initialBidAmount != null ? (0, bag_manual_validation_1.formatBidLabel)(initialBidAmount) : "";
        const targetLot = {
            ...(matchedLot ?? {}),
            lotNumber: validated.patch.lotNumber ?? draft.lotNumber,
            title: validated.patch.title ?? draft.title,
            currentBid: initialBid ?? undefined,
            currentBidLabel: initialBidLabel,
            currency: matchedLot?.currency ?? "USD",
            reserveStatus,
        };
        const submittedBase = (0, bag_lot_navigation_1.rebuildNavigation)({
            ...baseSubmitted,
            mode: "manual",
            source: { type: "manual" },
            lots: navContext.lots,
            lotCount: navContext.lots.length,
            updatedAt: new Date().toISOString(),
        }, targetLot);
        const currencyStrings = initialBidAmount != null
            ? this.providers.buildBidCurrencyStrings(initialBidAmount)
            : [];
        const submitted = {
            ...submittedBase,
            auctionDisplay: {
                ...(baseSubmitted.auctionDisplay ?? {}),
                lot: targetLot.lotNumber
                    ? targetLot.lotNumber.trim().startsWith("Lot")
                        ? targetLot.lotNumber.trim()
                        : `Lot ${targetLot.lotNumber.trim()}`
                    : "Lot —",
                title: targetLot.title ?? "",
                reserveStatus,
                biddingPrice: (0, display_bid_normalization_1.normalizeDisplayBid)(initialBidLabel || initialBid),
                currencies: currencyStrings,
            },
        };
        const nextDraft = {
            ...draft,
            lotNumber: targetLot.lotNumber ?? "",
            title: targetLot.title ?? "",
            reserveStatus: (0, reserve_status_1.normalizeReserveStatus)(targetLot.reserveStatus ?? "unknown"),
            lotDirty: false,
            ...(lotIdentityChanged
                ? {
                    currentBid: null,
                    currentBidLabel: "",
                    bidDirty: false,
                }
                : {}),
        };
        const cursorLotId = (0, bag_lot_navigation_1.lotIdentity)(targetLot);
        const navigation = {
            cursorLotId,
        };
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: submitted,
            manualState: submitted,
            localControllerDraft: nextDraft,
            localControllerSubmitted: submitted,
            manualLotNavigation: navigation,
            sourceSnapshotId: record.sourceSnapshotId,
        });
        const envelope = this.buildEnvelope(next);
        this.events.publishUpdate(envelope);
        return { ok: true, envelope };
    }
    submitBid(record, actor) {
        const draft = this.requireDraft(record);
        const baseSubmitted = record.localControllerSubmitted ??
            record.automaticState ??
            record.state;
        const currentLot = baseSubmitted.currentLot;
        if (!currentLot) {
            return { ok: false, error: "No current lot is selected." };
        }
        const draftBidAmount = (0, display_bid_normalization_1.resolveCanonicalBidAmount)({
            currentBid: draft.currentBid,
            currentBidLabel: draft.currentBidLabel,
        });
        if (draftBidAmount == null) {
            return this.clearSubmittedBid(record, actor, baseSubmitted, currentLot, draft);
        }
        const nextLot = (0, bag_manual_validation_1.applyBidToLot)(currentLot, draftBidAmount, currentLot.currency ?? "USD");
        if (!nextLot) {
            return { ok: false, error: "Unable to update bid." };
        }
        const currencyStrings = this.providers.buildBidCurrencyStrings(draftBidAmount);
        const reserveStatus = (0, reserve_status_1.formatReserveStatusLabel)((0, reserve_status_1.normalizeReserveStatus)(nextLot.reserveStatus)) ||
            (0, reserve_status_1.formatReserveStatusLabel)((0, reserve_status_1.normalizeReserveStatus)(typeof baseSubmitted.auctionDisplay === "object" && baseSubmitted.auctionDisplay
                ? baseSubmitted.auctionDisplay.reserveStatus
                : undefined)) ||
            "Unknown";
        const submitted = {
            ...baseSubmitted,
            mode: "manual",
            source: { type: "manual" },
            currentLot: nextLot,
            lots: this.updateLotInArray(baseSubmitted.lots, nextLot),
            auctionDisplay: {
                ...(baseSubmitted.auctionDisplay ?? {}),
                biddingPrice: (0, display_bid_normalization_1.normalizeDisplayBid)(nextLot.currentBidLabel ?? nextLot.currentBid),
                currencies: currencyStrings,
                reserveStatus,
            },
            updatedAt: new Date().toISOString(),
        };
        const nextDraft = {
            ...draft,
            currentBid: draft.currentBid,
            currentBidLabel: draft.currentBidLabel,
            bidDirty: false,
        };
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: submitted,
            manualState: submitted,
            localControllerDraft: nextDraft,
            localControllerSubmitted: submitted,
            sourceSnapshotId: record.sourceSnapshotId,
        });
        const envelope = this.buildEnvelope(next);
        this.events.publishUpdate(envelope);
        return { ok: true, envelope };
    }
    getNavigationCapabilities(record) {
        const navContext = this.navigationContext(record);
        const startingLot = (0, bag_manual_lot_navigation_1.resolveNavigationStartingLot)({
            draft: this.requireDraft(record),
            navigation: this.requireNavigation(record),
            submittedLot: record.localControllerSubmitted?.currentLot ?? null,
            datasetCurrentLot: navContext.datasetCurrentLot,
            lots: navContext.lots,
        });
        return (0, bag_manual_lot_navigation_1.buildNavigationCapabilities)(navContext.lots, startingLot);
    }
    getSubmittedDisplayState(record) {
        return record.localControllerSubmitted;
    }
    loadOfflineAuction(record, auctionData, actor) {
        const normalized = (0, bag_snapshot_normalizer_1.normalizeBagSnapshot)({
            projectId: record.projectId,
            engineId: record.engineId,
            snapshotId: `offline-${Date.now()}`,
            capturedAt: typeof auctionData.exportedAt === "string"
                ? auctionData.exportedAt
                : new Date().toISOString(),
            snapshot: auctionData,
            connection: {
                status: "disconnected",
                lastSuccessfulScrapeAt: typeof auctionData.scrapedAt === "string" ? auctionData.scrapedAt : undefined,
            },
        });
        if (!normalized.ok) {
            return { ok: false, error: normalized.error };
        }
        const automaticState = normalized.state;
        const draft = (0, bag_local_controller_state_1.createEmptyDraft)();
        const strippedLots = this.stripAllLotBids(automaticState.lots);
        const submitted = {
            ...automaticState,
            lots: strippedLots,
            mode: "manual",
            source: {
                type: "restored",
                capturedAt: typeof auctionData.exportedAt === "string"
                    ? auctionData.exportedAt
                    : new Date().toISOString(),
            },
            currentLot: this.stripLotBid(automaticState.currentLot),
            updatedAt: new Date().toISOString(),
        };
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: submitted,
            automaticState,
            manualState: submitted,
            latestScrapedCurrentLot: automaticState.currentLot,
            localControllerDraft: { ...draft, lotDirty: false, bidDirty: false },
            localControllerSubmitted: submitted,
            sourceSnapshotId: record.sourceSnapshotId,
        });
        this.audit({
            projectId: record.projectId,
            eventType: "select_lot",
            previousValue: record.localControllerSubmitted?.currentLot ?? null,
            nextValue: submitted.currentLot,
            details: { offlineLoaded: true },
            actor,
        });
        const envelope = this.buildEnvelope(next);
        this.events.publishUpdate(envelope);
        return { ok: true, envelope };
    }
    clearDownloadedDatasetState(record, actor) {
        const emptyDraft = (0, bag_local_controller_state_1.createEmptyDraft)();
        const emptyNavigation = (0, bag_manual_lot_navigation_1.createEmptyManualLotNavigation)();
        const clearedLots = {
            lots: [],
            lotCount: 0,
            currentLot: null,
        };
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: {
                ...record.state,
                ...clearedLots,
            },
            automaticState: record.automaticState
                ? {
                    ...record.automaticState,
                    ...clearedLots,
                }
                : record.automaticState,
            manualState: record.manualState
                ? {
                    ...record.manualState,
                    ...clearedLots,
                }
                : record.manualState,
            localControllerDraft: { ...emptyDraft, lotDirty: false, bidDirty: false },
            localControllerSubmitted: null,
            manualLotNavigation: emptyNavigation,
            lotPhotoOverrides: {},
            sourceSnapshotId: record.sourceSnapshotId,
        });
        this.audit({
            projectId: record.projectId,
            eventType: "edit_lot",
            previousValue: record.localControllerSubmitted?.currentLot ?? null,
            nextValue: null,
            details: { downloadsCleared: true },
            actor,
        });
        const envelope = this.buildEnvelope(next);
        this.events.publishUpdate(envelope);
        return { ok: true, envelope };
    }
    navigateDraftLot(record, direction, actor) {
        const navContext = this.navigationContext(record);
        const startingLot = (0, bag_manual_lot_navigation_1.resolveNavigationStartingLot)({
            draft: this.requireDraft(record),
            navigation: this.requireNavigation(record),
            submittedLot: record.localControllerSubmitted?.currentLot ?? null,
            datasetCurrentLot: navContext.datasetCurrentLot,
            lots: navContext.lots,
        });
        const targetLot = (0, bag_manual_lot_navigation_1.selectAdjacentLot)(navContext.lots, startingLot, direction);
        if (!targetLot) {
            return {
                ok: false,
                error: direction === "previous"
                    ? "No previous lot is available."
                    : "No next lot is available.",
            };
        }
        return this.applyDraftLot(record, targetLot, direction === "previous" ? "select_previous_lot" : "select_next_lot", actor);
    }
    applyDraftLot(record, lot, eventType, actor, details) {
        const draft = this.requireDraft(record);
        const normalizedReserve = (0, reserve_status_1.normalizeReserveStatus)(lot.reserveStatus ?? (0, reserve_status_1.readReserveStatusFromRecord)(lot));
        const reserveLabel = (0, reserve_status_1.formatReserveStatusLabel)(normalizedReserve);
        const isNavigationEvent = eventType === "select_previous_lot" ||
            eventType === "select_next_lot" ||
            eventType === "select_lot";
        const bidAmount = (0, display_bid_normalization_1.resolveCanonicalBidAmount)({
            currentBid: lot.currentBid,
            currentBidLabel: lot.currentBidLabel,
        });
        const bidLabel = bidAmount != null ? (0, bag_manual_validation_1.formatBidLabel)(bidAmount) : "";
        const nextDraft = isNavigationEvent
            ? {
                lotNumber: lot.lotNumber ?? "",
                title: lot.title ?? "",
                reserveStatus: reserveLabel,
                currentBid: bidAmount,
                currentBidLabel: bidLabel,
                lotDirty: false,
                bidDirty: false,
            }
            : {
                ...(0, bag_local_controller_state_1.draftLotPatch)(draft, {
                    lotNumber: lot.lotNumber ?? "",
                    title: lot.title ?? "",
                    reserveStatus: reserveLabel,
                }),
                lotDirty: true,
            };
        const navigation = {
            cursorLotId: (0, bag_lot_navigation_1.lotIdentity)(lot),
        };
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: record.state,
            localControllerDraft: nextDraft,
            localControllerSubmitted: record.localControllerSubmitted,
            manualLotNavigation: navigation,
            sourceSnapshotId: record.sourceSnapshotId,
        });
        this.audit({
            projectId: record.projectId,
            eventType,
            previousValue: draft,
            nextValue: nextDraft,
            details,
            actor,
        });
        const envelope = this.buildEnvelope(next);
        this.events.publishUpdate(envelope);
        return { ok: true, envelope };
    }
    applyDraftBid(record, amount, audit) {
        const draft = this.requireDraft(record);
        const nextDraft = (0, bag_local_controller_state_1.draftBidAmount)(draft, amount);
        return this.saveDraft(record, nextDraft, audit);
    }
    saveDraft(record, draft, audit) {
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: record.state,
            localControllerDraft: draft,
            sourceSnapshotId: record.sourceSnapshotId,
        });
        this.audit({
            projectId: record.projectId,
            eventType: audit.eventType,
            previousValue: audit.previousValue,
            nextValue: audit.nextValue,
            details: audit.details,
            actor: audit.actor,
        });
        const envelope = this.buildEnvelope(next);
        this.events.publishUpdate(envelope);
        return { ok: true, envelope };
    }
    navigationContext(record) {
        if (!this.providers.hasFileDataset(record.projectId)) {
            return { lots: [], datasetCurrentLot: null };
        }
        const automatic = record.automaticState;
        const base = record.localControllerSubmitted ?? record.state;
        const automaticLots = automatic?.lots.length && automatic.lots.length > 0 ? automatic.lots : base.lots;
        const dataset = this.providers.getActiveDataset(record.projectId);
        const lots = (0, bag_manual_lot_navigation_1.orderedLotsFromDataset)(automaticLots, dataset, this.providers.hasFileDataset(record.projectId));
        const datasetCurrent = dataset && typeof dataset.current === "object" && dataset.current
            ? (0, bag_lot_navigation_1.findLotByIdentifier)(lots, String(dataset.current.lotNumber ??
                dataset.current.lot ??
                ""))
            : null;
        return {
            lots,
            datasetCurrentLot: datasetCurrent ?? automatic?.currentLot ?? null,
        };
    }
    requireNavigation(record) {
        return record.manualLotNavigation ?? (0, bag_manual_lot_navigation_1.createEmptyManualLotNavigation)();
    }
    requireDraft(record) {
        return record.localControllerDraft ?? (0, bag_local_controller_state_1.createEmptyDraft)();
    }
    stripLotBid(lot) {
        if (!lot)
            return null;
        return {
            ...lot,
            currentBid: undefined,
            currentBidLabel: "",
        };
    }
    stripAllLotBids(lots) {
        return lots.map((lot) => this.stripLotBid(lot));
    }
    updateLotInArray(lots, lot) {
        const identity = (0, bag_lot_navigation_1.lotIdentity)(lot);
        if (!identity) {
            return lots ?? [];
        }
        return (lots ?? []).map((entry) => (0, bag_lot_navigation_1.lotIdentity)(entry) === identity ? { ...entry, ...lot } : entry);
    }
    clearDraftBid(record, actor) {
        const draft = this.requireDraft(record);
        const nextDraft = {
            ...draft,
            currentBid: null,
            currentBidLabel: "",
            bidDirty: true,
        };
        return this.saveDraft(record, nextDraft, {
            eventType: "set_bid",
            previousValue: draft.currentBid,
            nextValue: null,
            details: { cleared: true },
            actor,
        });
    }
    clearSubmittedBid(record, actor, baseSubmitted, currentLot, draft) {
        const clearedLot = this.stripLotBid(currentLot);
        if (!clearedLot) {
            return { ok: false, error: "Unable to clear bid." };
        }
        const submitted = {
            ...baseSubmitted,
            mode: "manual",
            source: { type: "manual" },
            currentLot: clearedLot,
            lots: this.updateLotInArray(baseSubmitted.lots, clearedLot),
            auctionDisplay: {
                ...(baseSubmitted.auctionDisplay ?? {}),
                biddingPrice: (0, display_bid_normalization_1.normalizeDisplayBid)(null),
                currencies: [],
            },
            updatedAt: new Date().toISOString(),
        };
        const nextDraft = {
            ...draft,
            currentBid: null,
            currentBidLabel: "",
            bidDirty: false,
        };
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: submitted,
            manualState: submitted,
            localControllerDraft: nextDraft,
            localControllerSubmitted: submitted,
            sourceSnapshotId: record.sourceSnapshotId,
        });
        const envelope = this.buildEnvelope(next);
        this.events.publishUpdate(envelope);
        return { ok: true, envelope };
    }
    audit(input) {
        try {
            this.manualEvents.insert({
                projectId: input.projectId,
                eventType: input.eventType,
                previousValue: input.previousValue,
                nextValue: input.nextValue,
                details: input.details,
                createdBy: input.actor.email ?? input.actor.id ?? null,
            });
        }
        catch (error) {
            console.error("[bag-local-controller] Failed to record audit event:", error);
        }
    }
    updateDraftLotPhotoOrder(record, lotNumber, photoUrls, actor) {
        const key = lotNumber.replace(/^lot\s+/i, "").trim();
        if (!key) {
            return { ok: false, error: "Lot number is required." };
        }
        const overrides = { ...record.lotPhotoOverrides };
        const current = overrides[key] ?? {};
        overrides[key] = {
            ...current,
            order: photoUrls.filter(Boolean),
        };
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: record.state,
            lotPhotoOverrides: overrides,
        });
        this.audit({
            projectId: record.projectId,
            eventType: "edit_lot",
            previousValue: current,
            nextValue: overrides[key],
            details: { lotNumber: key, action: "photo-order" },
            actor,
        });
        return { ok: true, envelope: this.buildEnvelope(next) };
    }
    removeDraftLotPhoto(record, lotNumber, photoUrl, actor) {
        const key = lotNumber.replace(/^lot\s+/i, "").trim();
        if (!key || !photoUrl.trim()) {
            return { ok: false, error: "Lot number and photo are required." };
        }
        const overrides = { ...record.lotPhotoOverrides };
        const current = overrides[key] ?? {};
        const removed = new Set(current.removed ?? []);
        removed.add(photoUrl);
        const order = (current.order ?? []).filter((url) => url !== photoUrl);
        overrides[key] = {
            order,
            removed: [...removed],
        };
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: record.state,
            lotPhotoOverrides: overrides,
        });
        this.audit({
            projectId: record.projectId,
            eventType: "edit_lot",
            previousValue: current,
            nextValue: overrides[key],
            details: { lotNumber: key, action: "photo-remove", photoUrl },
            actor,
        });
        return { ok: true, envelope: this.buildEnvelope(next) };
    }
    addDraftLotPhotos(record, lotNumber, photoUrls, actor) {
        const key = lotNumber.replace(/^lot\s+/i, "").trim();
        if (!key || photoUrls.length === 0) {
            return { ok: false, error: "Lot number and at least one photo are required." };
        }
        const overrides = { ...record.lotPhotoOverrides };
        const current = overrides[key] ?? {};
        const added = [...(current.added ?? [])];
        const seen = new Set(added);
        for (const url of photoUrls) {
            if (!url || seen.has(url))
                continue;
            seen.add(url);
            added.push(url);
        }
        overrides[key] = {
            ...current,
            added,
            order: [...(current.order ?? []), ...photoUrls.filter((url) => url && !current.order?.includes(url))],
        };
        const next = this.repository.upsert({
            projectId: record.projectId,
            engineId: record.engineId,
            state: record.state,
            lotPhotoOverrides: overrides,
        });
        this.audit({
            projectId: record.projectId,
            eventType: "edit_lot",
            previousValue: current,
            nextValue: overrides[key],
            details: { lotNumber: key, action: "photo-add", count: photoUrls.length },
            actor,
        });
        return { ok: true, envelope: this.buildEnvelope(next) };
    }
}
exports.BagLocalControllerService = BagLocalControllerService;
