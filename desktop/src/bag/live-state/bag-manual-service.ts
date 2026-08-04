import type { DataSourcesRepository } from "../../repositories/data-sources-repository";
import type { ProjectsRepository } from "../../repositories/projects-repository";
import { BagLiveStateEvents } from "./bag-live-state-events";
import { rebuildNavigation, statesDifferForComparison } from "./bag-lot-navigation";
import type { BagLiveStateRepository, BagLiveStateRecord } from "./bag-live-state-repository";
import type {
  BagAutomaticComparison,
  BagLiveLot,
  BagLiveState,
  BagLiveStateEnvelope,
  ManualLotStatus,
} from "./bag-live-state-types";
import { BagLocalControllerService } from "./bag-local-controller-service";
import { applyBidToLot, formatBidLabel } from "./bag-manual-validation";
import {
  BagManualEventsRepository,
  type BagManualEventType,
} from "./bag-manual-events-repository";

export type ManualMutationResult =
  | { ok: true; envelope: BagLiveStateEnvelope }
  | { ok: false; error: string };

export type ManualActor = {
  id?: string | null;
  email?: string | null;
};

export class BagManualModeService {
  private readonly restoredSessions = new Set<string>();
  private readonly localController: BagLocalControllerService;

  constructor(
    private readonly projects: ProjectsRepository,
    private readonly dataSources: DataSourcesRepository,
    private readonly repository: BagLiveStateRepository,
    private readonly manualEvents: BagManualEventsRepository,
    private readonly events: BagLiveStateEvents,
    private readonly mergeConnectionFromEngine: (
      state: BagLiveState,
      engineId: string,
    ) => BagLiveState,
  ) {
    this.localController = new BagLocalControllerService(
      repository,
      manualEvents,
      events,
      (record) => this.buildEnvelope(record),
    );
  }

  configureProviders(
    providers: Parameters<BagLocalControllerService["configureProviders"]>[0],
  ) {
    this.localController.configureProviders(providers);
  }

  markRestoredSession(projectId: string) {
    this.restoredSessions.add(projectId);
  }

  buildEnvelope(record: BagLiveStateRecord): BagLiveStateEnvelope {
    const automaticState =
      record.automaticState ??
      (record.mode === "automatic" ? record.state : null);
    const restored = this.restoredSessions.has(record.projectId);

    const envelope: BagLiveStateEnvelope = {
      state: record.state,
      automaticState,
      manualSession:
        record.mode === "manual"
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

  publishRecord(record: BagLiveStateRecord) {
    this.events.publishUpdate(this.buildEnvelope(record));
  }

  syncLocalControllerFromAutomatic(record: BagLiveStateRecord, automaticState: BagLiveState) {
    const next = this.localController.syncFromAutomaticState(record, automaticState);
    this.publishRecord(next);
    return next;
  }

  getSubmittedDisplayState(projectId: string): BagLiveState | null {
    const record = this.repository.get(projectId);
    if (!record) return null;
    return this.localController.getSubmittedDisplayState(record);
  }

  enterManualMode(projectId: string, actor: ManualActor): ManualMutationResult {
    const record = this.requireBagRecord(projectId);
    const active = this.mergeConnectionFromEngine(record.state, record.engineId);
    const automaticState =
      record.automaticState ??
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

  exitManualMode(projectId: string, actor: ManualActor): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    const automaticState = record.automaticState;

    if (!automaticState) {
      return {
        ok: false,
        error: "No valid automatic scraper state is available to resume.",
      };
    }

    const resumed = this.mergeConnectionFromEngine(
      {
        ...automaticState,
        mode: "automatic",
        updatedAt: new Date().toISOString(),
      },
      record.engineId,
    );

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

  applyManualLotPatch(
    projectId: string,
    patch: {
      lotNumber?: string;
      title?: string;
      description?: string;
      imageUrl?: string;
      reserveStatus?: string;
    },
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.patchDraftLot(record, patch, actor);
  }

  selectPreviousLot(projectId: string, actor: ManualActor): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.selectDraftPreviousLot(record, actor);
  }

  selectNextLot(projectId: string, actor: ManualActor): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.selectDraftNextLot(record, actor);
  }

  loadLotForEditing(
    projectId: string,
    input: {
      lotNumber: string;
      title: string;
      reserveStatus: string;
      currentBid?: number | null;
      currentBidLabel?: string;
      stableId: string;
    },
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.loadLotForEditing(record, input, actor);
  }

  selectLot(
    projectId: string,
    lotIdentifier: string,
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.selectDraftLot(record, lotIdentifier, actor);
  }

  setManualBid(
    projectId: string,
    bidInput: string,
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.setDraftBid(record, bidInput, actor);
  }

  adjustManualBid(
    projectId: string,
    delta: number,
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.adjustDraftBid(record, delta, actor);
  }

  previewBidCalculator(
    projectId: string,
    expression: string,
  ): { ok: true; amount: number; label: string } | { ok: false; error: string } {
    const record = this.requireManualRecord(projectId);
    return this.localController.previewDraftCalculator(record, expression);
  }

  applyBidCalculator(
    projectId: string,
    expression: string,
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.applyDraftCalculator(record, expression, actor);
  }

  submitManualLot(projectId: string, actor: ManualActor): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.submitLot(record, actor);
  }

  submitManualBid(projectId: string, actor: ManualActor): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.submitBid(record, actor);
  }

  updateDraftLotPhotoOrder(
    projectId: string,
    lotNumber: string,
    photoUrls: string[],
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.updateDraftLotPhotoOrder(
      record,
      lotNumber,
      photoUrls,
      actor,
    );
  }

  removeDraftLotPhoto(
    projectId: string,
    lotNumber: string,
    photoUrl: string,
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.removeDraftLotPhoto(record, lotNumber, photoUrl, actor);
  }

  addDraftLotPhotos(
    projectId: string,
    lotNumber: string,
    photoUrls: string[],
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    return this.localController.addDraftLotPhotos(record, lotNumber, photoUrls, actor);
  }

  loadOfflineAuction(
    projectId: string,
    auctionData: Record<string, unknown>,
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireBagRecord(projectId);
    return this.localController.loadOfflineAuction(record, auctionData, actor);
  }

  clearDownloadedDatasetState(
    projectId: string,
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireBagRecord(projectId);
    return this.localController.clearDownloadedDatasetState(record, actor);
  }

  setManualLotStatus(
    projectId: string,
    status: Exclude<ManualLotStatus, "clear">,
    actor: ManualActor,
  ): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    const currentLot = record.state.currentLot;
    if (!currentLot) {
      return { ok: false, error: "No current lot is selected." };
    }

    const nextLot: BagLiveLot = {
      ...currentLot,
      sold: status === "sold",
      passed: status === "passed",
    };

    return this.updateManualState(
      projectId,
      record,
      (state) => ({
        ...state,
        currentLot: nextLot,
      }),
      {
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
      },
    );
  }

  clearManualLotStatus(projectId: string, actor: ManualActor): ManualMutationResult {
    const record = this.requireManualRecord(projectId);
    const currentLot = record.state.currentLot;
    if (!currentLot) {
      return { ok: false, error: "No current lot is selected." };
    }

    const nextLot: BagLiveLot = {
      ...currentLot,
      sold: false,
      passed: false,
    };

    return this.updateManualState(
      projectId,
      record,
      (state) => ({
        ...state,
        currentLot: nextLot,
      }),
      {
        eventType: "clear_status",
        previousValue: {
          sold: currentLot.sold ?? false,
          passed: currentLot.passed ?? false,
        },
        nextValue: { sold: false, passed: false },
        actor,
      },
    );
  }

  private applyBidAmount(
    projectId: string,
    record: BagLiveStateRecord,
    amount: number,
    audit: {
      eventType: BagManualEventType;
      previousValue: unknown;
      nextValue: unknown;
      details?: Record<string, unknown>;
      actor: ManualActor;
    },
  ): ManualMutationResult {
    const currentLot = record.state.currentLot;
    if (!currentLot) {
      return { ok: false, error: "No current lot is selected." };
    }

    const nextLot = applyBidToLot(currentLot, amount, currentLot.currency ?? "USD");
    if (!nextLot) {
      return { ok: false, error: "Unable to update bid." };
    }

    return this.updateManualState(
      projectId,
      record,
      (state) => ({
        ...state,
        currentLot: nextLot,
      }),
      audit,
    );
  }

  private updateManualState(
    projectId: string,
    record: BagLiveStateRecord,
    mutate: (state: BagLiveState) => BagLiveState,
    audit: {
      eventType: BagManualEventType;
      previousValue: unknown;
      nextValue: unknown;
      details?: Record<string, unknown>;
      actor: ManualActor;
    },
  ): ManualMutationResult {
    const nextState = {
      ...mutate(record.state),
      mode: "manual" as const,
      source: { type: "manual" as const },
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

  private requireBagRecord(projectId: string): BagLiveStateRecord {
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

  private requireManualRecord(projectId: string): BagLiveStateRecord {
    const record = this.requireBagRecord(projectId);
    if (record.mode !== "manual") {
      throw new Error("Manual controls require Manual Mode.");
    }
    return record;
  }

  private buildAutomaticComparison(
    record: BagLiveStateRecord,
    automaticState: BagLiveState | null,
  ): BagAutomaticComparison | null {
    if (record.mode !== "manual" || !automaticState) {
      return null;
    }

    return {
      hasNewerAutomaticData:
        Boolean(automaticState.updatedAt) &&
        automaticState.updatedAt > record.state.updatedAt,
      differsFromManual: statesDifferForComparison(record.state, automaticState),
      automaticUpdatedAt: automaticState.updatedAt,
      automaticCurrentLotNumber: automaticState.currentLot?.lotNumber,
      automaticCurrentBidLabel:
        automaticState.currentLot?.currentBidLabel ??
        (automaticState.currentLot?.currentBid != null
          ? formatBidLabel(automaticState.currentLot.currentBid)
          : undefined),
    };
  }

  private audit(input: {
    projectId: string;
    eventType: BagManualEventType;
    previousValue: unknown;
    nextValue: unknown;
    details?: Record<string, unknown>;
    actor: ManualActor;
  }) {
    try {
      this.manualEvents.insert({
        projectId: input.projectId,
        eventType: input.eventType,
        previousValue: input.previousValue,
        nextValue: input.nextValue,
        details: input.details,
        createdBy: formatActor(input.actor),
      });
    } catch (error) {
      console.error("[bag-manual] Failed to record audit event:", error);
    }
  }
}

function formatActor(actor: ManualActor): string | null {
  return actor.email ?? actor.id ?? null;
}
