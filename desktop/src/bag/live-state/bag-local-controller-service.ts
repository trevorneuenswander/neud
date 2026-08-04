import type { BagLiveStateRepository, BagLiveStateRecord } from "./bag-live-state-repository";
import type { BagLiveStateEvents } from "./bag-live-state-events";
import {
  createEmptyDraft,
  draftBidAmount,
  draftLotPatch,
  type LocalControllerDraft,
} from "./bag-local-controller-state";
import {
  buildNavigationCapabilities,
  createEmptyManualLotNavigation,
  deriveCursorLotIdFromDraft,
  lotsDiffer,
  orderedLotsFromDataset,
  resolveNavigationStartingLot,
  selectAdjacentLot,
  type ManualLotNavigationCapabilities,
  type ManualLotNavigationState,
} from "./bag-manual-lot-navigation";
import { findLotByIdentifier, lotIdentity, rebuildNavigation } from "./bag-lot-navigation";
import type { BagLiveLot, BagLiveState, BagLiveStateEnvelope, BagSnapshotPayload } from "./bag-live-state-types";
import { normalizeBagSnapshot } from "./bag-snapshot-normalizer";
import {
  applyBidToLot,
  evaluateBidExpression,
  formatBidLabel,
  formatManualLotTitle,
  parseBidInput,
  validateManualLotPatch,
} from "./bag-manual-validation";
import {
  normalizeDisplayBid,
  resolveCanonicalBidAmount,
} from "../../displays/display-bid-normalization";
import type { BagManualEventsRepository, BagManualEventType } from "./bag-manual-events-repository";
import {
  formatReserveStatusLabel,
  normalizeReserveStatus,
  readReserveStatusFromRecord,
} from "../reserve-status";
import { getLotKey } from "../lot-key";

export type LocalControllerMutationResult =
  | { ok: true; envelope: BagLiveStateEnvelope }
  | { ok: false; error: string };

export type LocalControllerActor = {
  id?: string | null;
  email?: string | null;
};

type ManualEnvelopeBuilder = (record: BagLiveStateRecord) => BagLiveStateEnvelope;

type LocalControllerProviders = {
  getActiveDataset: (projectId: string) => Record<string, unknown> | null;
  hasFileDataset: (projectId: string) => boolean;
  buildBidCurrencyStrings: (amountUsd: number) => string[];
};

export class BagLocalControllerService {
  private providers: LocalControllerProviders = {
    getActiveDataset: () => null,
    hasFileDataset: () => false,
    buildBidCurrencyStrings: () => [],
  };

  constructor(
    private readonly repository: BagLiveStateRepository,
    private readonly manualEvents: BagManualEventsRepository,
    private readonly events: BagLiveStateEvents,
    private readonly buildEnvelope: ManualEnvelopeBuilder,
  ) {}

  configureProviders(providers: Partial<LocalControllerProviders>) {
    this.providers = { ...this.providers, ...providers };
  }

  syncFromAutomaticState(record: BagLiveStateRecord, automaticState: BagLiveState): BagLiveStateRecord {
    const latestScrapedCurrentLot = automaticState.currentLot ?? null;
    const draft = record.localControllerDraft ?? createEmptyDraft();

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

  initializeForManualMode(
    record: BagLiveStateRecord,
    automaticState: BagLiveState,
  ): BagLiveStateRecord {
    const latestScrapedCurrentLot = automaticState.currentLot ?? null;
    const draft = createEmptyDraft();
    const navigation = createEmptyManualLotNavigation();
    const baseSubmitted =
      record.localControllerSubmitted ??
      ({
        ...automaticState,
        mode: "manual",
        source: { type: "manual" },
        updatedAt: new Date().toISOString(),
      } satisfies BagLiveState);
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

  patchDraftLot(
    record: BagLiveStateRecord,
    patch: { lotNumber?: string; title?: string; reserveStatus?: string },
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const draft = this.requireDraft(record);
    const validated = validateManualLotPatch(patch);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    const nextLotNumber = validated.patch.lotNumber ?? draft.lotNumber;
    let nextTitle = validated.patch.title ?? draft.title;
    let nextReserveStatus =
      validated.patch.reserveStatus !== undefined
        ? validated.patch.reserveStatus
        : draft.reserveStatus;

    if (
      validated.patch.lotNumber !== undefined &&
      validated.patch.lotNumber.trim() !== draft.lotNumber.trim() &&
      validated.patch.title === undefined
    ) {
      const matchedLot = findLotByIdentifier(
        this.navigationContext(record).lots,
        nextLotNumber,
      );
      const matchedTitle = matchedLot ? formatManualLotTitle(matchedLot) : "";
      if (matchedTitle) {
        nextTitle = matchedTitle;
      }
      if (validated.patch.reserveStatus === undefined && matchedLot?.reserveStatus) {
        nextReserveStatus = matchedLot.reserveStatus;
      }
    }

    const nextDraft = draftLotPatch(draft, {
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

  selectDraftPreviousLot(
    record: BagLiveStateRecord,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    return this.navigateDraftLot(record, "previous", actor);
  }

  selectDraftNextLot(
    record: BagLiveStateRecord,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    return this.navigateDraftLot(record, "next", actor);
  }

  loadLotForEditing(
    record: BagLiveStateRecord,
    input: {
      lotNumber: string;
      title: string;
      reserveStatus: string;
      currentBid?: number | null;
      currentBidLabel?: string;
      stableId: string;
    },
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const nextDraft: LocalControllerDraft = {
      lotNumber: input.lotNumber,
      title: input.title,
      reserveStatus: input.reserveStatus,
      currentBid: input.currentBid ?? null,
      currentBidLabel: input.currentBidLabel ?? "",
      lotDirty: false,
      bidDirty: false,
    };

    const navigation: ManualLotNavigationState = {
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

  selectDraftLot(
    record: BagLiveStateRecord,
    lotIdentifier: string,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const navContext = this.navigationContext(record);
    const lot = findLotByIdentifier(navContext.lots, lotIdentifier);
    if (!lot) {
      return {
        ok: false,
        error: `Lot "${lotIdentifier.trim()}" was not found.`,
      };
    }

    const startingLot = resolveNavigationStartingLot({
      draft: this.requireDraft(record),
      navigation: this.requireNavigation(record),
      submittedLot: record.localControllerSubmitted?.currentLot ?? null,
      datasetCurrentLot: navContext.datasetCurrentLot,
      lots: navContext.lots,
    });

    if (!lotsDiffer(startingLot, lot)) {
      return { ok: true, envelope: this.buildEnvelope(record) };
    }

    return this.applyDraftLot(record, lot, "select_lot", actor, {
      lotIdentifier: lotIdentifier.trim(),
    });
  }

  setDraftBid(
    record: BagLiveStateRecord,
    bidInput: string,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    if (!bidInput.trim()) {
      return this.clearDraftBid(record, actor);
    }

    const amount = parseBidInput(bidInput);
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

  adjustDraftBid(
    record: BagLiveStateRecord,
    delta: number,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
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

  applyDraftCalculator(
    record: BagLiveStateRecord,
    expression: string,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const draft = this.requireDraft(record);
    const result = evaluateBidExpression(expression, draft.currentBid);
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

  previewDraftCalculator(record: BagLiveStateRecord, expression: string) {
    const draft = this.requireDraft(record);
    const result = evaluateBidExpression(expression, draft.currentBid);
    if (!result.ok) {
      return result;
    }
    return {
      ok: true as const,
      amount: result.amount,
      label: formatBidLabel(result.amount),
    };
  }

  submitLot(
    record: BagLiveStateRecord,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const draft = this.requireDraft(record);
    const validated = validateManualLotPatch({
      lotNumber: draft.lotNumber,
      title: draft.title,
    });
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    const baseSubmitted =
      record.localControllerSubmitted ??
      record.automaticState ??
      record.state;
    const navContext = this.navigationContext(record);
    const existingSubmittedLot = record.localControllerSubmitted?.currentLot;
    const matchedLot =
      findLotByIdentifier(navContext.lots, validated.patch.lotNumber ?? draft.lotNumber) ??
      null;
    const previousLotKey = getLotKey(existingSubmittedLot);
    const nextLotKey = getLotKey({
      id: matchedLot?.id,
      lotNumber: validated.patch.lotNumber ?? draft.lotNumber,
    });
    const lotIdentityChanged =
      nextLotKey !== "" && previousLotKey !== "" && nextLotKey !== previousLotKey;
    const manualReserve = normalizeReserveStatus(draft.reserveStatus);
    const reserveStatus = formatReserveStatusLabel(
      manualReserve !== "unknown"
        ? manualReserve
        : readReserveStatusFromRecord(matchedLot ?? {}) !== "unknown"
          ? readReserveStatusFromRecord(matchedLot ?? {})
          : readReserveStatusFromRecord(
              (existingSubmittedLot ?? {}) as Record<string, unknown>,
            ),
    );
    const initialBidAmount = lotIdentityChanged
      ? resolveCanonicalBidAmount({
          currentBid: matchedLot?.currentBid,
          currentBidLabel: matchedLot?.currentBidLabel,
        })
      : resolveCanonicalBidAmount({
          currentBid: existingSubmittedLot?.currentBid,
          currentBidLabel: existingSubmittedLot?.currentBidLabel,
        });
    const initialBid = initialBidAmount ?? null;
    const initialBidLabel =
      initialBidAmount != null ? formatBidLabel(initialBidAmount) : "";
    const targetLot: BagLiveLot = {
      ...(matchedLot ?? {}),
      lotNumber: validated.patch.lotNumber ?? draft.lotNumber,
      title: validated.patch.title ?? draft.title,
      currentBid: initialBid ?? undefined,
      currentBidLabel: initialBidLabel,
      currency: matchedLot?.currency ?? "USD",
      reserveStatus,
    };

    const submittedBase = rebuildNavigation(
      {
        ...baseSubmitted,
        mode: "manual",
        source: { type: "manual" },
        lots: navContext.lots,
        lotCount: navContext.lots.length,
        updatedAt: new Date().toISOString(),
      },
      targetLot,
    );
    const currencyStrings =
      initialBidAmount != null
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
        biddingPrice: normalizeDisplayBid(initialBidLabel || initialBid),
        currencies: currencyStrings,
      },
    };

    const nextDraft: LocalControllerDraft = {
      ...draft,
      lotNumber: targetLot.lotNumber ?? "",
      title: targetLot.title ?? "",
      reserveStatus: normalizeReserveStatus(targetLot.reserveStatus ?? "unknown"),
      lotDirty: false,
      ...(lotIdentityChanged
        ? {
            currentBid: null,
            currentBidLabel: "",
            bidDirty: false,
          }
        : {}),
    };

    const cursorLotId = lotIdentity(targetLot);
    const navigation: ManualLotNavigationState = {
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

  submitBid(
    record: BagLiveStateRecord,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const draft = this.requireDraft(record);
    const baseSubmitted =
      record.localControllerSubmitted ??
      record.automaticState ??
      record.state;
    const currentLot = baseSubmitted.currentLot;
    if (!currentLot) {
      return { ok: false, error: "No current lot is selected." };
    }

    const draftBidAmount = resolveCanonicalBidAmount({
      currentBid: draft.currentBid,
      currentBidLabel: draft.currentBidLabel,
    });

    if (draftBidAmount == null) {
      return this.clearSubmittedBid(record, actor, baseSubmitted, currentLot, draft);
    }

    const nextLot = applyBidToLot(currentLot, draftBidAmount, currentLot.currency ?? "USD");
    if (!nextLot) {
      return { ok: false, error: "Unable to update bid." };
    }

    const currencyStrings = this.providers.buildBidCurrencyStrings(draftBidAmount);
    const reserveStatus =
      formatReserveStatusLabel(normalizeReserveStatus(nextLot.reserveStatus)) ||
      formatReserveStatusLabel(
        normalizeReserveStatus(
          typeof baseSubmitted.auctionDisplay === "object" && baseSubmitted.auctionDisplay
            ? (baseSubmitted.auctionDisplay as Record<string, unknown>).reserveStatus
            : undefined,
        ),
      ) ||
      "Unknown";

    const submitted = {
      ...baseSubmitted,
      mode: "manual" as const,
      source: { type: "manual" as const },
      currentLot: nextLot,
      lots: this.updateLotInArray(baseSubmitted.lots, nextLot),
      auctionDisplay: {
        ...(baseSubmitted.auctionDisplay ?? {}),
        biddingPrice: normalizeDisplayBid(nextLot.currentBidLabel ?? nextLot.currentBid),
        currencies: currencyStrings,
        reserveStatus,
      },
      updatedAt: new Date().toISOString(),
    };

    const nextDraft: LocalControllerDraft = {
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

  getNavigationCapabilities(
    record: BagLiveStateRecord,
  ): ManualLotNavigationCapabilities {
    const navContext = this.navigationContext(record);
    const startingLot = resolveNavigationStartingLot({
      draft: this.requireDraft(record),
      navigation: this.requireNavigation(record),
      submittedLot: record.localControllerSubmitted?.currentLot ?? null,
      datasetCurrentLot: navContext.datasetCurrentLot,
      lots: navContext.lots,
    });
    return buildNavigationCapabilities(navContext.lots, startingLot);
  }

  getSubmittedDisplayState(record: BagLiveStateRecord): BagLiveState | null {
    return record.localControllerSubmitted;
  }

  loadOfflineAuction(
    record: BagLiveStateRecord,
    auctionData: Record<string, unknown>,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const normalized = normalizeBagSnapshot({
      projectId: record.projectId,
      engineId: record.engineId,
      snapshotId: `offline-${Date.now()}`,
      capturedAt:
        typeof auctionData.exportedAt === "string"
          ? auctionData.exportedAt
          : new Date().toISOString(),
      snapshot: auctionData as BagSnapshotPayload,
      connection: {
        status: "disconnected",
        lastSuccessfulScrapeAt:
          typeof auctionData.scrapedAt === "string" ? auctionData.scrapedAt : undefined,
      },
    });

    if (!normalized.ok) {
      return { ok: false, error: normalized.error };
    }

    const automaticState = normalized.state;
    const draft = createEmptyDraft();
    const strippedLots = this.stripAllLotBids(automaticState.lots);
    const submitted: BagLiveState = {
      ...automaticState,
      lots: strippedLots,
      mode: "manual",
      source: {
        type: "restored",
        capturedAt:
          typeof auctionData.exportedAt === "string"
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

  clearDownloadedDatasetState(
    record: BagLiveStateRecord,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const emptyDraft = createEmptyDraft();
    const emptyNavigation = createEmptyManualLotNavigation();
    const clearedLots = {
      lots: [] as BagLiveLot[],
      lotCount: 0,
      currentLot: null as BagLiveLot | null,
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

  private navigateDraftLot(
    record: BagLiveStateRecord,
    direction: "previous" | "next",
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const navContext = this.navigationContext(record);
    const startingLot = resolveNavigationStartingLot({
      draft: this.requireDraft(record),
      navigation: this.requireNavigation(record),
      submittedLot: record.localControllerSubmitted?.currentLot ?? null,
      datasetCurrentLot: navContext.datasetCurrentLot,
      lots: navContext.lots,
    });

    const targetLot = selectAdjacentLot(navContext.lots, startingLot, direction);
    if (!targetLot) {
      return {
        ok: false,
        error:
          direction === "previous"
            ? "No previous lot is available."
            : "No next lot is available.",
      };
    }

    return this.applyDraftLot(
      record,
      targetLot,
      direction === "previous" ? "select_previous_lot" : "select_next_lot",
      actor,
    );
  }

  private applyDraftLot(
    record: BagLiveStateRecord,
    lot: BagLiveLot,
    eventType: BagManualEventType,
    actor: LocalControllerActor,
    details?: Record<string, unknown>,
  ): LocalControllerMutationResult {
    const draft = this.requireDraft(record);
    const normalizedReserve = normalizeReserveStatus(
      lot.reserveStatus ?? readReserveStatusFromRecord(lot as Record<string, unknown>),
    );
    const reserveLabel = formatReserveStatusLabel(normalizedReserve);
    const isNavigationEvent =
      eventType === "select_previous_lot" ||
      eventType === "select_next_lot" ||
      eventType === "select_lot";
    const bidAmount = resolveCanonicalBidAmount({
      currentBid: lot.currentBid,
      currentBidLabel: lot.currentBidLabel,
    });
    const bidLabel = bidAmount != null ? formatBidLabel(bidAmount) : "";

    const nextDraft: LocalControllerDraft = isNavigationEvent
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
          ...draftLotPatch(draft, {
            lotNumber: lot.lotNumber ?? "",
            title: lot.title ?? "",
            reserveStatus: reserveLabel,
          }),
          lotDirty: true,
        };

    const navigation: ManualLotNavigationState = {
      cursorLotId: lotIdentity(lot),
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

  private applyDraftBid(
    record: BagLiveStateRecord,
    amount: number,
    audit: {
      eventType: BagManualEventType;
      previousValue: unknown;
      nextValue: unknown;
      details?: Record<string, unknown>;
      actor: LocalControllerActor;
    },
  ): LocalControllerMutationResult {
    const draft = this.requireDraft(record);
    const nextDraft = draftBidAmount(draft, amount);
    return this.saveDraft(record, nextDraft, audit);
  }

  private saveDraft(
    record: BagLiveStateRecord,
    draft: LocalControllerDraft,
    audit: {
      eventType: BagManualEventType;
      previousValue: unknown;
      nextValue: unknown;
      details?: Record<string, unknown>;
      actor: LocalControllerActor;
    },
  ): LocalControllerMutationResult {
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

  private navigationContext(record: BagLiveStateRecord): {
    lots: BagLiveLot[];
    datasetCurrentLot: BagLiveLot | null;
  } {
    if (!this.providers.hasFileDataset(record.projectId)) {
      return { lots: [], datasetCurrentLot: null };
    }

    const automatic = record.automaticState;
    const base = record.localControllerSubmitted ?? record.state;
    const automaticLots =
      automatic?.lots.length && automatic.lots.length > 0 ? automatic.lots : base.lots;
    const dataset = this.providers.getActiveDataset(record.projectId);
    const lots = orderedLotsFromDataset(
      automaticLots,
      dataset,
      this.providers.hasFileDataset(record.projectId),
    );

    const datasetCurrent =
      dataset && typeof dataset.current === "object" && dataset.current
        ? findLotByIdentifier(
            lots,
            String(
              (dataset.current as Record<string, unknown>).lotNumber ??
                (dataset.current as Record<string, unknown>).lot ??
                "",
            ),
          )
        : null;

    return {
      lots,
      datasetCurrentLot: datasetCurrent ?? automatic?.currentLot ?? null,
    };
  }

  private requireNavigation(record: BagLiveStateRecord): ManualLotNavigationState {
    return record.manualLotNavigation ?? createEmptyManualLotNavigation();
  }

  private requireDraft(record: BagLiveStateRecord): LocalControllerDraft {
    return record.localControllerDraft ?? createEmptyDraft();
  }

  private stripLotBid(lot: BagLiveLot | null | undefined): BagLiveLot | null {
    if (!lot) return null;
    return {
      ...lot,
      currentBid: undefined,
      currentBidLabel: "",
    };
  }

  private stripAllLotBids(lots: BagLiveLot[]): BagLiveLot[] {
    return lots.map((lot) => this.stripLotBid(lot)!);
  }

  private updateLotInArray(
    lots: BagLiveLot[] | undefined,
    lot: BagLiveLot,
  ): BagLiveLot[] {
    const identity = lotIdentity(lot);
    if (!identity) {
      return lots ?? [];
    }

    return (lots ?? []).map((entry) =>
      lotIdentity(entry) === identity ? { ...entry, ...lot } : entry,
    );
  }

  private clearDraftBid(
    record: BagLiveStateRecord,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const draft = this.requireDraft(record);
    const nextDraft: LocalControllerDraft = {
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

  private clearSubmittedBid(
    record: BagLiveStateRecord,
    actor: LocalControllerActor,
    baseSubmitted: BagLiveState,
    currentLot: BagLiveLot,
    draft: LocalControllerDraft,
  ): LocalControllerMutationResult {
    const clearedLot = this.stripLotBid(currentLot);
    if (!clearedLot) {
      return { ok: false, error: "Unable to clear bid." };
    }

    const submitted = {
      ...baseSubmitted,
      mode: "manual" as const,
      source: { type: "manual" as const },
      currentLot: clearedLot,
      lots: this.updateLotInArray(baseSubmitted.lots, clearedLot),
      auctionDisplay: {
        ...(baseSubmitted.auctionDisplay ?? {}),
        biddingPrice: normalizeDisplayBid(null),
        currencies: [],
      },
      updatedAt: new Date().toISOString(),
    };

    const nextDraft: LocalControllerDraft = {
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

  private audit(input: {
    projectId: string;
    eventType: BagManualEventType;
    previousValue: unknown;
    nextValue: unknown;
    details?: Record<string, unknown>;
    actor: LocalControllerActor;
  }) {
    try {
      this.manualEvents.insert({
        projectId: input.projectId,
        eventType: input.eventType,
        previousValue: input.previousValue,
        nextValue: input.nextValue,
        details: input.details,
        createdBy: input.actor.email ?? input.actor.id ?? null,
      });
    } catch (error) {
      console.error("[bag-local-controller] Failed to record audit event:", error);
    }
  }

  updateDraftLotPhotoOrder(
    record: BagLiveStateRecord,
    lotNumber: string,
    photoUrls: string[],
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
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

  removeDraftLotPhoto(
    record: BagLiveStateRecord,
    lotNumber: string,
    photoUrl: string,
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
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

  addDraftLotPhotos(
    record: BagLiveStateRecord,
    lotNumber: string,
    photoUrls: string[],
    actor: LocalControllerActor,
  ): LocalControllerMutationResult {
    const key = lotNumber.replace(/^lot\s+/i, "").trim();
    if (!key || photoUrls.length === 0) {
      return { ok: false, error: "Lot number and at least one photo are required." };
    }

    const overrides = { ...record.lotPhotoOverrides };
    const current = overrides[key] ?? {};
    const added = [...(current.added ?? [])];
    const seen = new Set(added);
    for (const url of photoUrls) {
      if (!url || seen.has(url)) continue;
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
