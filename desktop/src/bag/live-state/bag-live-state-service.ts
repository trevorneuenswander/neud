import { isBagAuctionEngineConfig } from "../default-sources";
import type { DataSourcesRepository } from "../../repositories/data-sources-repository";
import type { ProjectsRepository } from "../../repositories/projects-repository";
import type { LocalSourceSnapshot } from "../../repositories/data-sources-repository";
import { BagLiveStateEvents } from "./bag-live-state-events";
import { BagLiveStateRepository } from "./bag-live-state-repository";
import {
  BagManualEventsRepository,
} from "./bag-manual-events-repository";
import {
  BagManualModeService,
  type ManualActor,
  type ManualMutationResult,
} from "./bag-manual-service";
import {
  createEmptyBagLiveState,
  normalizeBagSnapshot,
} from "./bag-snapshot-normalizer";
import type {
  BagConnectionStatus,
  BagLiveState,
  BagLiveStateEnvelope,
  BagSnapshotPayload,
} from "./bag-live-state-types";
import type { AuctionDatasetService } from "../../services/auction-dataset-service";
import {
  buildManualBidCurrencyDisplayStrings,
  type CurrencyRateService,
} from "../../services/currency-rate-service";

export class BagLiveStateService {
  private readonly manual: BagManualModeService;
  private auctionDataset: AuctionDatasetService | null = null;
  private currencyRates: CurrencyRateService | null = null;

  constructor(
    private readonly projects: ProjectsRepository,
    private readonly dataSources: DataSourcesRepository,
    private readonly repository: BagLiveStateRepository,
    private readonly events: BagLiveStateEvents,
    manualEvents: BagManualEventsRepository,
  ) {
    this.manual = new BagManualModeService(
      projects,
      dataSources,
      repository,
      manualEvents,
      events,
      (state, engineId) => this.mergeConnectionFromEngine(state, engineId),
    );
  }

  setAuctionDatasetService(service: AuctionDatasetService) {
    this.auctionDataset = service;
    this.syncLocalControllerProviders();
  }

  setCurrencyRateService(service: CurrencyRateService) {
    this.currencyRates = service;
    this.syncLocalControllerProviders();
  }

  private syncLocalControllerProviders() {
    this.manual.configureProviders({
      getActiveDataset: (projectId) =>
        this.auctionDataset?.readActiveDataset(projectId) ?? null,
      hasFileDataset: (projectId) =>
        this.auctionDataset?.isFileDatasetActive(projectId) ?? false,
      buildBidCurrencyStrings: (amountUsd) => {
        if (!this.currencyRates) return [];
        return buildManualBidCurrencyDisplayStrings(
          amountUsd,
          this.currencyRates.getRates(),
        );
      },
    });
  }

  isBagGraphicsProject(projectId: string): boolean {
    const project = this.projects.getById(projectId);
    return project?.projectType === "bag-graphics";
  }

  projectExists(projectId: string): boolean {
    return this.projects.getById(projectId) !== null;
  }

  getBagEngineForProject(projectId: string) {
    return this.dataSources
      .listByProject(projectId)
      .find(
        (engine) =>
          engine.sourceType === "webpage-scraper" &&
          isBagAuctionEngineConfig(engine.config),
      );
  }

  getLiveState(projectId: string): BagLiveState | null {
    if (!this.isBagGraphicsProject(projectId)) {
      return null;
    }

    return this.ensureLiveState(projectId);
  }

  getLiveStateEnvelope(projectId: string): BagLiveStateEnvelope | null {
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

  ensureLiveState(projectId: string): BagLiveState {
    const engine = this.getBagEngineForProject(projectId);
    if (!engine) {
      return createEmptyBagLiveState({
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

    const empty = createEmptyBagLiveState({
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
      if (project.projectType !== "bag-graphics") continue;
      try {
        const persisted = this.repository.get(project.id);
        if (persisted?.mode === "manual") {
          this.manual.markRestoredSession(project.id);
        }
        this.ensureLiveState(project.id);
      } catch (error) {
        console.error(
          `[bag-live-state] Failed to recover project ${project.id}:`,
          error,
        );
      }
    }
  }

  processSnapshot(
    engineId: string,
    snapshot: LocalSourceSnapshot,
    options: { publish?: boolean } = {},
  ): { envelope: BagLiveStateEnvelope; state: BagLiveState } | null {
    const engine = this.dataSources.getById(engineId);
    if (!engine || !isBagAuctionEngineConfig(engine.config)) {
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

    const normalized = normalizeBagSnapshot({
      projectId: project.id,
      engineId,
      snapshotId: snapshot.id,
      capturedAt: snapshot.capturedAt,
      snapshot: snapshot.data as BagSnapshotPayload,
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
      const stateForSync =
        preserveFileDataset && persisted.automaticState
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

  syncEngineStatus(engineId: string) {
    const engine = this.dataSources.getById(engineId);
    if (!engine || !isBagAuctionEngineConfig(engine.config)) return;

    const project = this.projects.getById(engine.projectId);
    if (!project || project.projectType !== "bag-graphics") return;

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

  enterManualMode(projectId: string, actor: ManualActor): ManualMutationResult {
    this.ensureLiveState(projectId);
    return this.manual.enterManualMode(projectId, actor);
  }

  exitManualMode(projectId: string, actor: ManualActor): ManualMutationResult {
    return this.manual.exitManualMode(projectId, actor);
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
    return this.manual.applyManualLotPatch(projectId, patch, actor);
  }

  selectPreviousLot(projectId: string, actor: ManualActor): ManualMutationResult {
    return this.manual.selectPreviousLot(projectId, actor);
  }

  selectNextLot(projectId: string, actor: ManualActor): ManualMutationResult {
    return this.manual.selectNextLot(projectId, actor);
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
    return this.manual.loadLotForEditing(projectId, input, actor);
  }

  selectLot(
    projectId: string,
    lotIdentifier: string,
    actor: ManualActor,
  ): ManualMutationResult {
    return this.manual.selectLot(projectId, lotIdentifier, actor);
  }

  setManualBid(
    projectId: string,
    bidInput: string,
    actor: ManualActor,
  ): ManualMutationResult {
    return this.manual.setManualBid(projectId, bidInput, actor);
  }

  adjustManualBid(
    projectId: string,
    delta: number,
    actor: ManualActor,
  ): ManualMutationResult {
    return this.manual.adjustManualBid(projectId, delta, actor);
  }

  previewBidCalculator(projectId: string, expression: string) {
    return this.manual.previewBidCalculator(projectId, expression);
  }

  applyBidCalculator(
    projectId: string,
    expression: string,
    actor: ManualActor,
  ): ManualMutationResult {
    return this.manual.applyBidCalculator(projectId, expression, actor);
  }

  setManualLotStatus(
    projectId: string,
    status: "sold" | "passed",
    actor: ManualActor,
  ): ManualMutationResult {
    return this.manual.setManualLotStatus(projectId, status, actor);
  }

  clearManualLotStatus(projectId: string, actor: ManualActor): ManualMutationResult {
    return this.manual.clearManualLotStatus(projectId, actor);
  }

  submitManualLot(projectId: string, actor: ManualActor): ManualMutationResult {
    return this.manual.submitManualLot(projectId, actor);
  }

  submitManualBid(projectId: string, actor: ManualActor): ManualMutationResult {
    return this.manual.submitManualBid(projectId, actor);
  }

  updateDraftLotPhotoOrder(
    projectId: string,
    lotNumber: string,
    photoUrls: string[],
    actor: ManualActor,
  ): ManualMutationResult {
    return this.manual.updateDraftLotPhotoOrder(projectId, lotNumber, photoUrls, actor);
  }

  removeDraftLotPhoto(
    projectId: string,
    lotNumber: string,
    photoUrl: string,
    actor: ManualActor,
  ): ManualMutationResult {
    return this.manual.removeDraftLotPhoto(projectId, lotNumber, photoUrl, actor);
  }

  addDraftLotPhotos(
    projectId: string,
    lotNumber: string,
    photoUrls: string[],
    actor: ManualActor,
  ): ManualMutationResult {
    return this.manual.addDraftLotPhotos(projectId, lotNumber, photoUrls, actor);
  }

  getLotPhotoOverrides(projectId: string) {
    return this.repository.get(projectId)?.lotPhotoOverrides ?? {};
  }

  loadOfflineAuction(
    projectId: string,
    auctionData: Record<string, unknown>,
    actor: ManualActor,
  ): ManualMutationResult {
    return this.manual.loadOfflineAuction(projectId, auctionData, actor);
  }

  clearDownloadedDatasetState(
    projectId: string,
    actor: ManualActor,
  ): ManualMutationResult {
    return this.manual.clearDownloadedDatasetState(projectId, actor);
  }

  getSubmittedDisplayState(projectId: string): BagLiveState | null {
    return this.manual.getSubmittedDisplayState(projectId);
  }

  getDisplayUrl(projectId: string, baseUrl: string): string {
    return `${baseUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/bag/display`;
  }

  getControllerInfo(projectId: string, baseUrl: string) {
    const engine = this.getBagEngineForProject(projectId);
    return {
      projectId,
      engineId: engine?.id ?? null,
      displayUrl: this.getDisplayUrl(projectId, baseUrl),
      liveUrl: `${baseUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/bag/live`,
      eventsUrl: `${baseUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/bag/live/events`,
    };
  }

  private handleInvalidSnapshot(input: {
    project: { id: string };
    engineId: string;
    snapshot: LocalSourceSnapshot;
    previousActive: BagLiveState | null;
    persisted: ReturnType<BagLiveStateRepository["get"]>;
    connection: BagLiveState["connection"];
    error: string;
    publish: boolean;
  }) {
    const { project, engineId, snapshot, previousActive, persisted, connection, error, publish } =
      input;

    this.dataSources.insertLog(engineId, {
      level: "warning",
      eventType: "bag.live_state.normalize_failed",
      message: error,
      metadata: { snapshotId: snapshot.id },
    });

    if (persisted?.mode === "manual" && previousActive) {
      const manualActive = this.mergeConnectionFromEngine(
        {
          ...previousActive,
          connection: {
            ...previousActive.connection,
            ...connection,
            status: "error",
            lastError: error,
            lastAttemptAt: snapshot.capturedAt,
          },
        },
        engineId,
      );

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
            status: "error" as BagConnectionStatus,
            lastError: error,
            lastAttemptAt: snapshot.capturedAt,
          },
          updatedAt: new Date().toISOString(),
        }
      : createEmptyBagLiveState({
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

  private mergeConnectionFromEngine(
    state: BagLiveState,
    engineId: string,
  ): BagLiveState {
    const status = this.dataSources.getStatus(engineId);
    const connection = this.buildConnectionFromStatus(engineId, {
      lastSuccessfulScrapeAt:
        state.connection.lastSuccessfulScrapeAt ?? status?.lastSuccessAt ?? undefined,
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

  private buildConnectionFromStatus(
    engineId: string,
    patch: Partial<BagLiveState["connection"]> = {},
  ): BagLiveState["connection"] {
    const status = this.dataSources.getStatus(engineId);
    const mappedStatus = mapEngineStatus(status?.actualState, status?.healthState);

    return {
      status: patch.status ?? mappedStatus,
      lastSuccessfulScrapeAt:
        patch.lastSuccessfulScrapeAt ?? status?.lastSuccessAt ?? undefined,
      lastAttemptAt: patch.lastAttemptAt ?? status?.lastRunAt ?? undefined,
      lastError: patch.lastError ?? status?.lastError ?? undefined,
    };
  }
}

function mapEngineStatus(
  actualState?: string | null,
  healthState?: string | null,
): BagConnectionStatus {
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