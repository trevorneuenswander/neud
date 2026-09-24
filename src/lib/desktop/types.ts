import type {
  AuctionDatasetDisplayInfo,
  OfflineExportProgress,
  OfflineExportResponse,
  OfflineLoadResponse,
} from "./offline-auction-types";

export type EngineProcessState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export type LocalEngineStatus = {
  engineId: string;
  pid: number | null;
  state: EngineProcessState;
  startedAt: string | null;
  lastExitCode: number | null;
  hostId: string;
};

export type EngineControlResult = {
  ok: boolean;
  code:
    | "started"
    | "stopped"
    | "restarted"
    | "run-once-queued"
    | "already-running"
    | "not-running"
    | "missing-credentials"
    | "missing-sources"
    | "error";
  message: string;
  status?: LocalEngineStatus | null;
};

export type EngineLogEntry = {
  engineId: string;
  stream: "stdout" | "stderr";
  message: string;
  timestamp: string;
};

export type SessionExecutionLogEntry = {
  sequenceId: number;
  id: string;
  engine_id: string;
  level: string;
  event_type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ExecutionLogSnapshotEvent = {
  engineId: string;
  entries: SessionExecutionLogEntry[];
};

export type ExecutionLogEntryEvent = {
  engineId: string;
  entry: SessionExecutionLogEntry;
};

export type EngineStatusSnapshot = {
  engineId: string;
  lastRunSucceededAt: string | null;
  lastError: string | null;
  actualState: string | null;
  healthState: string | null;
};

export type EngineStatusSnapshotEvent = {
  engineId: string;
  snapshot: EngineStatusSnapshot;
};

export type BrowserSessionState =
  | "stopped"
  | "starting"
  | "authenticating"
  | "ready"
  | "unavailable"
  | "error";

export type ActivityActor = {
  id?: string;
  name: string;
  email?: string;
};

export type ActivityEvent = {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  source?: string;
  severity?: "info" | "warning" | "error";
  actor?: ActivityActor;
  metadata?: Record<string, unknown>;
};

export type ActivitySnapshotEvent = {
  entries: ActivityEvent[];
};

export type ActivityEntryEvent = {
  entry: ActivityEvent;
};

export type DisplayDataSource = "webpage-scraper" | "local-controller";

export type DesktopCredentialsInput = {
  email: string;
  password: string;
};

export type DesktopCredentials = {
  email: string;
  password: string;
};

export type DesktopCredentialMeta = {
  hasCredentials: boolean;
  email: string | null;
  hasPersistedSession?: boolean;
};

export type NeudUpdateLifecycleState =
  | "unavailable"
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export type NeudUpdateStatus = {
  state: NeudUpdateLifecycleState;
  enabled: boolean;
  packaged: boolean;
  currentVersion: string;
  availableVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  downloadSizeLabel: string | null;
  downloadPercent: number | null;
  transferredBytes: number | null;
  totalBytes: number | null;
  bytesPerSecond: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  canInstall: boolean;
  canDownload: boolean;
  promptVisible: boolean;
  lastCheckReason: "startup" | "manual" | "menu" | null;
  message: string | null;
};

export type NeudDesktopAPI = {
  app: {
    isDesktop(): true;
    getVersion(): Promise<string>;
    getPlatform(): Promise<string>;
    getHostId(): Promise<string>;
    openExternal(url: string): Promise<{ ok: true } | { ok: false; error: string }>;
    getMenuLabels(): Promise<string[]>;
    popupMenu(
      label: string,
      position?: { x?: number; y?: number },
    ): Promise<boolean>;
    getWindowState(): Promise<{ isMaximized: boolean }>;
    windowControl(
      action: "minimize" | "maximize" | "close",
    ): Promise<{ isMaximized: boolean } | false>;
    respondCloseRequest(
      action: "cancel" | "confirm" | "force",
    ): Promise<{ ok: boolean }>;
    onCloseRequested(
      callback: (payload: { shutdownFailed?: boolean }) => void,
    ): () => void;
  };
  engines: {
    getLocalStatus(engineId: string): Promise<LocalEngineStatus | null>;
    start(payload: {
      engineId: string;
      requestedBy?: string | null;
    }): Promise<EngineControlResult>;
    stop(payload: {
      engineId: string;
      requestedBy?: string | null;
    }): Promise<EngineControlResult>;
    restart(payload: {
      engineId: string;
      requestedBy?: string | null;
    }): Promise<EngineControlResult>;
    runOnce(payload: {
      engineId: string;
      requestedBy?: string | null;
    }): Promise<EngineControlResult>;
    subscribeLogs(engineId: string): Promise<void>;
    unsubscribeLogs(engineId: string): Promise<void>;
    clearSessionLogs(engineId: string): Promise<{ ok: boolean }>;
    subscribeExecutionLogs(engineId: string): Promise<void>;
    unsubscribeExecutionLogs(engineId: string): Promise<void>;
    subscribeEngineStatus(engineId: string): Promise<void>;
    unsubscribeEngineStatus(engineId: string): Promise<void>;
    getBrowserSessionState(engineId: string): Promise<BrowserSessionState>;
    onLog(callback: (entry: EngineLogEntry) => void): () => void;
    onExecutionLogSnapshot(
      callback: (payload: ExecutionLogSnapshotEvent) => void,
    ): () => void;
    onExecutionLogEntry(
      callback: (payload: ExecutionLogEntryEvent) => void,
    ): () => void;
    onEngineStatusSnapshot(
      callback: (payload: EngineStatusSnapshotEvent) => void,
    ): () => void;
  };
  credentials: {
    hasCredentials(engineId: string): Promise<boolean>;
    getCredentialMeta(engineId: string): Promise<DesktopCredentialMeta>;
    getCredentials(engineId: string): Promise<DesktopCredentials | null>;
    saveCredentials(
      engineId: string,
      credentials: DesktopCredentialsInput,
    ): Promise<void>;
    clearCredentials(engineId: string): Promise<void>;
  };
  auth: {
    getStatus(): Promise<{
      mode: "locked" | "offline" | "online";
      allowed: boolean;
      email: string | null;
      role: string | null;
    }>;
    storeVerifiedSession(payload: {
      handoffTarget?: "desktop" | "hosted";
      userId: string;
      email: string;
      displayName?: string | null;
      team?: string | null;
      role: string;
      entitlement?: Record<string, unknown>;
      deviceId: string;
      cloudSession: {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
      };
    }): Promise<unknown>;
    getCloudSessionDiagnostics(): Promise<Record<string, unknown>>;
    clear(): Promise<void>;
    forceSignOut(): Promise<{ ok: boolean }>;
  };
  local?: {
    listProjects(): Promise<unknown>;
    getRuntimeStatus(): Promise<unknown>;
    getApiConfig(): Promise<{
      baseUrl: string;
      sessionToken: string | null;
    }>;
  };
  activity?: {
    getSnapshot(): Promise<ActivityEvent[]>;
    record(payload: {
      type: string;
      message: string;
      source?: string;
      severity?: ActivityEvent["severity"];
      metadata?: Record<string, unknown>;
      userAction?: string;
      actor?: ActivityActor;
    }): Promise<ActivityEvent>;
    subscribe(): Promise<void>;
    unsubscribe(): Promise<void>;
    onSnapshot(callback: (payload: ActivitySnapshotEvent) => void): () => void;
    onEntry(callback: (payload: ActivityEntryEvent) => void): () => void;
    getDisplayDataSource(): Promise<DisplayDataSource>;
    setDisplayDataSource(source: DisplayDataSource): Promise<DisplayDataSource>;
    getSyncState(): Promise<import("@/lib/activity/sync-types").ActivitySyncState | null>;
    syncNow(): Promise<import("@/lib/activity/sync-types").ActivitySyncState | null>;
  };
  displayDataSource?: {
    get(): Promise<DisplayDataSource>;
    set(source: DisplayDataSource): Promise<DisplayDataSource>;
    subscribe(): Promise<void>;
    unsubscribe(): Promise<void>;
    onChanged(callback: (payload: { source: DisplayDataSource }) => void): () => void;
  };
  offlineAuction?: {
    hasValidScrape(projectId: string): Promise<boolean>;
    isExportInProgress(projectId?: string): Promise<boolean>;
    getExportOperation(projectId: string): Promise<import("@/lib/desktop/webpage-export-types").WebpageExportOperation | null>;
    listExportOperations(): Promise<import("@/lib/desktop/webpage-export-types").WebpageExportOperation[]>;
    getActiveDataset(projectId: string): Promise<AuctionDatasetDisplayInfo | null>;
    getActiveDownloadedDataset(projectId: string): Promise<Record<string, unknown> | null>;
    dismissExportOperation(payload: {
      projectId: string;
      operationId: string;
    }): Promise<{ ok: true } | { ok: false; error: string }>;
    getLotThumbnailPhotos(
      projectId: string,
      lotNumber: string,
    ): Promise<Array<{ url: string; alt: string; source: "local" | "remote" }>>;
    importLotPhotos(
      projectId: string,
      lotNumber: string,
    ): Promise<{
      ok: boolean;
      cancelled?: boolean;
      error?: string;
      imported?: string[];
      rejected?: string[];
    }>;
    getLotDatasetDetails(
      projectId: string,
      lotNumber: string,
    ): Promise<{ title: string; reserveStatus: string } | null>;
    export(projectId: string): Promise<
      | { ok: true; operationId: string; alreadyRunning?: boolean }
      | { ok: false; error: string }
    >;
    cancelExport(operationId: string): Promise<{ ok: true } | { ok: false; error: string }>;
    load(projectId: string): Promise<OfflineLoadResponse>;
    listDownloads(projectId: string): Promise<Array<{
      packageDir: string;
      jsonPath: string;
      filename: string;
      downloadedAt: string;
      totalSizeBytes: number;
      totalSizeFormatted: string;
      lotCount: number;
    }>>;
    refreshDownloads(projectId: string): Promise<AuctionDatasetDisplayInfo | null>;
    clearDownloads(projectId: string): Promise<{
      ok: boolean;
      error?: string;
      foldersRemoved?: number;
      filesRemoved?: number;
      bytesRemoved?: number;
      dataset?: AuctionDatasetDisplayInfo;
      envelope?: import("@/lib/bag/types").BagLiveStateEnvelope;
    }>;
    openDownloadRoot(projectId: string): Promise<{ ok: boolean; path?: string; error?: string }>;
    openDownloadFolder(projectId: string): Promise<{ ok: boolean; path: string }>;
    onProgress(callback: (progress: import("@/lib/desktop/webpage-export-types").WebpageExportProgressEvent) => void): () => void;
  };
  currencyRates?: {
    getRates(): Promise<CurrencyRates>;
    refreshIfStale(): Promise<CurrencyRates>;
    refreshNow(): Promise<CurrencyRates>;
  };
  displays?: {
    openPreview(payload: {
      projectId: string;
      displayId: string;
      title: string;
      viewerUrl: string;
      displayWidth?: number;
      displayHeight?: number;
    }): Promise<{ ok: boolean }>;
    closePreview(payload: {
      projectId: string;
      displayId: string;
    }): Promise<{ ok: boolean }>;
    saveOrder(payload: {
      projectId: string;
      displayIds: string[];
    }): Promise<{ ok: boolean; rowCount?: number }>;
    getOrder(projectId: string): Promise<{
      order: Array<{ displayId: string; sortIndex: number; updatedAt: string }>;
      databasePath?: string;
    }>;
    getPinnedViewer(projectId: string): Promise<import("@/lib/local/pinned-viewer-api").PinnedViewerState>;
    togglePin(payload: {
      projectId: string;
      displayId: string;
    }): Promise<import("@/lib/local/pinned-viewer-api").PinnedViewerState>;
    unpinIfPinned(payload: {
      projectId: string;
      displayId: string;
    }): Promise<import("@/lib/local/pinned-viewer-api").PinnedViewerState>;
    setPinnedViewerHeight(payload: {
      projectId: string;
      viewerHeightPx: number;
    }): Promise<import("@/lib/local/pinned-viewer-api").PinnedViewerState>;
  };
  updates: {
    getStatus(): Promise<NeudUpdateStatus>;
    check(reason?: "manual" | "menu" | "startup"): Promise<NeudUpdateStatus>;
    download(): Promise<{ ok: true } | { ok: false; error: string }>;
    dismiss(): Promise<NeudUpdateStatus>;
    install(): Promise<{ ok: true } | { ok: false; error: string }>;
    onStatus(callback: (status: NeudUpdateStatus) => void): () => void;
  };
};

export type CurrencyRates = {
  base: "USD";
  rates: {
    EUR: number;
    GBP: number;
    CHF: number;
    JPY: number;
  };
  updatedAt: string;
};

declare global {
  interface Window {
    neudDesktop?: NeudDesktopAPI;
  }
}

export {};
