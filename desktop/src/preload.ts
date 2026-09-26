import { contextBridge, ipcRenderer } from "electron";
import type { EngineLogEntry } from "./types/desktop-api";
import type { ActivitySyncState } from "./services/activity-sync/types";

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

export type ActivityEvent = {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  source?: string;
  severity?: "info" | "warning" | "error";
  metadata?: Record<string, unknown>;
};

export type ActivitySnapshotEvent = {
  entries: ActivityEvent[];
};

export type ActivityEntryEvent = {
  entry: ActivityEvent;
};

export type OfflineExportProgress = {
  exportId?: string;
  phase:
    | "idle"
    | "preparing"
    | "scraping-lots"
    | "downloading-photos"
    | "writing-json"
    | "finalizing"
    | "complete"
    | "error";
  completed: number;
  total: number;
  percent: number;
  message: string;
  outputPath?: string;
  error?: string;
};

const neudDesktop = {
  app: {
    isDesktop: () => true as const,
    getVersion: () => ipcRenderer.invoke("neud:app:getVersion") as Promise<string>,
    exportDiagnostics: () =>
      ipcRenderer.invoke("neud:app:exportDiagnostics") as Promise<
        | { ok: true; filePath: string; fileName: string }
        | { ok: false; error: string }
      >,
    getPlatform: () => ipcRenderer.invoke("neud:app:getPlatform") as Promise<string>,
    getHostId: () => ipcRenderer.invoke("neud:app:getHostId") as Promise<string>,
    getSupabasePublicConfig: () =>
      ipcRenderer.invoke("neud:app:getSupabasePublicConfig") as Promise<{
        supabaseUrl: string | null;
        supabasePublishableKey: string | null;
        diagnostic: {
          configPresent: boolean;
          urlHost: string | null;
          keyPresent: boolean;
          source: string;
          validationResult: string;
          configPath: string | null;
        };
      }>,
    recordAuthLoginDiagnostic: (payload: { stage: string; [key: string]: unknown }) =>
      ipcRenderer.invoke("neud:app:recordAuthLoginDiagnostic", payload) as Promise<{
        ok: boolean;
      }>,
    openExternal: (url: string) =>
      ipcRenderer.invoke("neud:app:openExternal", url) as Promise<
        { ok: true } | { ok: false; error: string }
      >,
    getMenuLabels: () => ipcRenderer.invoke("neud:app:getMenuLabels") as Promise<string[]>,
    popupMenu: (label: string, position?: { x?: number; y?: number }) =>
      ipcRenderer.invoke("neud:app:popupMenu", label, position) as Promise<boolean>,
    getWindowState: () =>
      ipcRenderer.invoke("neud:app:getWindowState") as Promise<{ isMaximized: boolean }>,
    windowControl: (action: "minimize" | "maximize" | "close") =>
      ipcRenderer.invoke("neud:app:windowControl", action) as Promise<
        { isMaximized: boolean } | false
      >,
    respondCloseRequest: (action: "cancel" | "confirm" | "force") =>
      ipcRenderer.invoke("neud:app:respondCloseRequest", action) as Promise<{ ok: boolean }>,
    onCloseRequested: (
      callback: (payload: { shutdownFailed?: boolean }) => void,
    ) => {
      const listener = (_event: unknown, payload: { shutdownFailed?: boolean }) => {
        callback(payload ?? {});
      };
      ipcRenderer.on("neud:app:closeRequested", listener);
      return () => {
        ipcRenderer.removeListener("neud:app:closeRequested", listener);
      };
    },
  },
  engines: {
    getLocalStatus: (engineId: string) =>
      ipcRenderer.invoke("neud:engines:getLocalStatus", engineId),
    start: (payload: { engineId: string; requestedBy?: string | null }) =>
      ipcRenderer.invoke("neud:engines:start", payload),
    stop: (payload: { engineId: string; requestedBy?: string | null }) =>
      ipcRenderer.invoke("neud:engines:stop", payload),
    restart: (payload: { engineId: string; requestedBy?: string | null }) =>
      ipcRenderer.invoke("neud:engines:restart", payload),
    runOnce: (payload: { engineId: string; requestedBy?: string | null }) =>
      ipcRenderer.invoke("neud:engines:runOnce", payload),
    subscribeLogs: (engineId: string) =>
      ipcRenderer.invoke("neud:engines:subscribeLogs", engineId),
    unsubscribeLogs: (engineId: string) =>
      ipcRenderer.invoke("neud:engines:unsubscribeLogs", engineId),
    clearSessionLogs: (engineId: string) =>
      ipcRenderer.invoke("neud:engines:clearSessionLogs", engineId),
    subscribeExecutionLogs: (engineId: string) =>
      ipcRenderer.invoke("neud:engines:subscribeExecutionLogs", engineId),
    unsubscribeExecutionLogs: (engineId: string) =>
      ipcRenderer.invoke("neud:engines:unsubscribeExecutionLogs", engineId),
    subscribeEngineStatus: (engineId: string) =>
      ipcRenderer.invoke("neud:engines:subscribeEngineStatus", engineId),
    unsubscribeEngineStatus: (engineId: string) =>
      ipcRenderer.invoke("neud:engines:unsubscribeEngineStatus", engineId),
    getBrowserSessionState: (engineId: string) =>
      ipcRenderer.invoke("neud:engines:getBrowserSessionState", engineId),
    onLog: (callback: (entry: EngineLogEntry) => void) => {
      const listener = (_event: unknown, entry: EngineLogEntry) => {
        callback(entry);
      };
      ipcRenderer.on("neud:engines:log", listener);
      return () => {
        ipcRenderer.removeListener("neud:engines:log", listener);
      };
    },
    onExecutionLogSnapshot: (
      callback: (payload: ExecutionLogSnapshotEvent) => void,
    ) => {
      const listener = (_event: unknown, payload: ExecutionLogSnapshotEvent) => {
        callback(payload);
      };
      ipcRenderer.on("neud:engines:executionLogSnapshot", listener);
      return () => {
        ipcRenderer.removeListener("neud:engines:executionLogSnapshot", listener);
      };
    },
    onExecutionLogEntry: (callback: (payload: ExecutionLogEntryEvent) => void) => {
      const listener = (_event: unknown, payload: ExecutionLogEntryEvent) => {
        callback(payload);
      };
      ipcRenderer.on("neud:engines:executionLogEntry", listener);
      return () => {
        ipcRenderer.removeListener("neud:engines:executionLogEntry", listener);
      };
    },
    onEngineStatusSnapshot: (
      callback: (payload: {
        engineId: string;
        snapshot: {
          engineId: string;
          lastRunSucceededAt: string | null;
          lastError: string | null;
          actualState: string | null;
          healthState: string | null;
        };
      }) => void,
    ) => {
      const listener = (
        _event: unknown,
        payload: {
          engineId: string;
          snapshot: {
            engineId: string;
            lastRunSucceededAt: string | null;
            lastError: string | null;
            actualState: string | null;
            healthState: string | null;
          };
        },
      ) => {
        callback(payload);
      };
      ipcRenderer.on("neud:engines:engineStatusSnapshot", listener);
      return () => {
        ipcRenderer.removeListener("neud:engines:engineStatusSnapshot", listener);
      };
    },
  },
  credentials: {
    hasCredentials: (engineId: string) =>
      ipcRenderer.invoke("neud:credentials:has", engineId) as Promise<boolean>,
    getCredentialMeta: (engineId: string) =>
      ipcRenderer.invoke("neud:credentials:getMeta", engineId) as Promise<{
        hasCredentials: boolean;
        email: string | null;
      }>,
    getCredentials: (engineId: string) =>
      ipcRenderer.invoke("neud:credentials:get", engineId) as Promise<{
        email: string;
        password: string;
      } | null>,
    saveCredentials: (
      engineId: string,
      credentials: { email: string; password?: string },
    ) => ipcRenderer.invoke("neud:credentials:save", engineId, credentials),
    clearCredentials: (engineId: string) =>
      ipcRenderer.invoke("neud:credentials:clear", engineId),
  },
  auth: {
    getStatus: () => ipcRenderer.invoke("neud:auth:getStatus"),
    storeVerifiedSession: (payload: {
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
    }) => ipcRenderer.invoke("neud:auth:storeVerifiedSession", payload),
    getCloudSessionDiagnostics: () =>
      ipcRenderer.invoke("neud:auth:getCloudSessionDiagnostics"),
    clear: () => ipcRenderer.invoke("neud:auth:clear"),
    forceSignOut: () =>
      ipcRenderer.invoke("neud:auth:forceSignOut") as Promise<{ ok: boolean }>,
  },
  local: {
    listProjects: () => ipcRenderer.invoke("neud:local:listProjects"),
    getRuntimeStatus: () => ipcRenderer.invoke("neud:local:getRuntimeStatus"),
    getApiConfig: () =>
      ipcRenderer.invoke("neud:local:getApiConfig") as Promise<{
        baseUrl: string;
        sessionToken: string | null;
      }>,
  },
  displayDataSource: {
    get: () =>
      ipcRenderer.invoke("neud:displayDataSource:get") as Promise<
        "webpage-scraper" | "local-controller"
      >,
    set: (source: "webpage-scraper" | "local-controller") =>
      ipcRenderer.invoke("neud:displayDataSource:set", source) as Promise<
        "webpage-scraper" | "local-controller"
      >,
    subscribe: () => ipcRenderer.invoke("neud:displayDataSource:subscribe"),
    unsubscribe: () => ipcRenderer.invoke("neud:displayDataSource:unsubscribe"),
    onChanged: (
      callback: (payload: { source: "webpage-scraper" | "local-controller" }) => void,
    ) => {
      const listener = (_event: unknown, payload: { source: "webpage-scraper" | "local-controller" }) => {
        callback(payload);
      };
      ipcRenderer.on("neud:displayDataSource:changed", listener);
      return () => {
        ipcRenderer.removeListener("neud:displayDataSource:changed", listener);
      };
    },
  },
  activity: {
    getSnapshot: () => ipcRenderer.invoke("neud:activity:getSnapshot") as Promise<ActivityEvent[]>,
    record: (payload: {
      type: string;
      message: string;
      source?: string;
      severity?: ActivityEvent["severity"];
      metadata?: Record<string, unknown>;
    }) => ipcRenderer.invoke("neud:activity:record", payload) as Promise<ActivityEvent>,
    subscribe: () => ipcRenderer.invoke("neud:activity:subscribe"),
    unsubscribe: () => ipcRenderer.invoke("neud:activity:unsubscribe"),
    onSnapshot: (callback: (payload: ActivitySnapshotEvent) => void) => {
      const listener = (_event: unknown, payload: ActivitySnapshotEvent) => {
        callback(payload);
      };
      ipcRenderer.on("neud:activity:snapshot", listener);
      return () => {
        ipcRenderer.removeListener("neud:activity:snapshot", listener);
      };
    },
    onEntry: (callback: (payload: ActivityEntryEvent) => void) => {
      const listener = (_event: unknown, payload: ActivityEntryEvent) => {
        callback(payload);
      };
      ipcRenderer.on("neud:activity:entry", listener);
      return () => {
        ipcRenderer.removeListener("neud:activity:entry", listener);
      };
    },
    getDisplayDataSource: () =>
      ipcRenderer.invoke("neud:displayDataSource:get") as Promise<
        "webpage-scraper" | "local-controller"
      >,
    setDisplayDataSource: (source: "webpage-scraper" | "local-controller") =>
      ipcRenderer.invoke("neud:displayDataSource:set", source) as Promise<
        "webpage-scraper" | "local-controller"
      >,
    getSyncState: () =>
      ipcRenderer.invoke("neud:activity:getSyncState") as Promise<ActivitySyncState | null>,
    syncNow: () =>
      ipcRenderer.invoke("neud:activity:syncNow") as Promise<ActivitySyncState | null>,
  },
  offlineAuction: {
    hasValidScrape: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:hasValidScrape", projectId) as Promise<boolean>,
    isExportInProgress: (projectId?: string) =>
      ipcRenderer.invoke("neud:offline:isExportInProgress", projectId) as Promise<boolean>,
    getExportOperation: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:getExportOperation", projectId),
    listExportOperations: () =>
      ipcRenderer.invoke("neud:offline:listExportOperations"),
    getActiveDataset: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:getActiveDataset", projectId) as Promise<{
        reference: {
          source: "downloaded" | "loaded" | "live-snapshot";
          filePath?: string;
          filename?: string;
          loadedAt: string;
          manualOverride?: boolean;
        };
        label: string;
        tooltip: string;
      } | null>,
    getActiveDownloadedDataset: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:getActiveDownloadedDataset", projectId) as Promise<
        Record<string, unknown> | null
      >,
    dismissExportOperation: (payload: { projectId: string; operationId: string }) =>
      ipcRenderer.invoke("neud:offline:dismissExportOperation", payload) as Promise<
        { ok: true } | { ok: false; error: string }
      >,
    getLotThumbnailPhotos: (projectId: string, lotNumber: string) =>
      ipcRenderer.invoke("neud:offline:getLotThumbnailPhotos", {
        projectId,
        lotNumber,
      }) as Promise<Array<{ url: string; alt: string; source: "local" | "remote" }>>,
    importLotPhotos: (projectId: string, lotNumber: string) =>
      ipcRenderer.invoke("neud:offline:importLotPhotos", {
        projectId,
        lotNumber,
      }) as Promise<{
        ok: boolean;
        cancelled?: boolean;
        error?: string;
        imported?: string[];
        rejected?: string[];
      }>,
    getLotDatasetDetails: (projectId: string, lotNumber: string) =>
      ipcRenderer.invoke("neud:offline:getLotDatasetDetails", {
        projectId,
        lotNumber,
      }) as Promise<{ title: string } | null>,
    export: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:export", projectId) as Promise<{
        ok: boolean;
        operationId?: string;
        alreadyRunning?: boolean;
        error?: string;
      }>,
    cancelExport: (operationId: string) =>
      ipcRenderer.invoke("neud:offline:cancelExport", operationId) as Promise<{
        ok: boolean;
        error?: string;
      }>,
    load: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:load", projectId) as Promise<{
        ok: boolean;
        cancelled?: boolean;
        error?: string;
        packageId?: string;
        lotCount?: number;
      }>,
    onProgress: (callback: (progress: OfflineExportProgress) => void) => {
      const listener = (_event: unknown, progress: OfflineExportProgress) => {
        callback(progress);
      };
      ipcRenderer.on("neud:offline:progress", listener);
      return () => {
        ipcRenderer.removeListener("neud:offline:progress", listener);
      };
    },
    listDownloads: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:listDownloads", projectId),
    refreshDownloads: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:refreshDownloads", projectId),
    clearDownloads: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:clearDownloads", projectId) as Promise<{
        ok: boolean;
        error?: string;
        foldersRemoved?: number;
        filesRemoved?: number;
        bytesRemoved?: number;
        dataset?: {
          label: string;
          tooltip: string;
          reference: {
            source: "downloaded" | "loaded" | "live-snapshot" | "none";
            filePath?: string;
            filename?: string;
            loadedAt: string;
          };
        };
        envelope?: Record<string, unknown>;
      }>,
    openDownloadRoot: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:openDownloadRoot", projectId) as Promise<{
        ok: boolean;
        path?: string;
        error?: string;
      }>,
    openDownloadFolder: (projectId: string) =>
      ipcRenderer.invoke("neud:offline:openDownloadFolder", projectId) as Promise<{
        ok: boolean;
        path: string;
      }>,
  },
  currencyRates: {
    getRates: () => ipcRenderer.invoke("neud:currency:getRates") as Promise<{
      base: "USD";
      rates: { EUR: number; GBP: number; CHF: number; JPY: number };
      updatedAt: string;
    }>,
    refreshIfStale: () =>
      ipcRenderer.invoke("neud:currency:refreshIfStale") as Promise<{
        base: "USD";
        rates: { EUR: number; GBP: number; CHF: number; JPY: number };
        updatedAt: string;
      }>,
    refreshNow: () =>
      ipcRenderer.invoke("neud:currency:refreshNow") as Promise<{
        base: "USD";
        rates: { EUR: number; GBP: number; CHF: number; JPY: number };
        updatedAt: string;
      }>,
  },
  displays: {
    openPreview: (payload: {
      projectId: string;
      displayId: string;
      title: string;
      viewerUrl: string;
      displayWidth?: number;
      displayHeight?: number;
    }) => ipcRenderer.invoke("neud:displays:openPreview", payload) as Promise<{ ok: boolean }>,
    closePreview: (payload: { projectId: string; displayId: string }) =>
      ipcRenderer.invoke("neud:displays:closePreview", payload) as Promise<{ ok: boolean }>,
    saveOrder: (payload: { projectId: string; displayIds: string[] }) =>
      ipcRenderer.invoke("neud:displays:saveOrder", payload) as Promise<{
        ok: boolean;
        rowCount?: number;
      }>,
    getOrder: (projectId: string) =>
      ipcRenderer.invoke("neud:displays:getOrder", projectId) as Promise<{
        order: Array<{ displayId: string; sortIndex: number; updatedAt: string }>;
        databasePath?: string;
      }>,
    getPinnedViewer: (projectId: string) =>
      ipcRenderer.invoke("neud:displays:getPinnedViewer", projectId),
    togglePin: (payload: { projectId: string; displayId: string }) =>
      ipcRenderer.invoke("neud:displays:togglePin", payload),
    unpinIfPinned: (payload: { projectId: string; displayId: string }) =>
      ipcRenderer.invoke("neud:displays:unpinIfPinned", payload),
    setPinnedViewerHeight: (payload: { projectId: string; viewerHeightPx: number }) =>
      ipcRenderer.invoke("neud:displays:setPinnedViewerHeight", payload),
    patchPinnedViewer: (payload: { projectId: string } & Record<string, unknown>) =>
      ipcRenderer.invoke("neud:displays:patchPinnedViewer", payload),
  },
  updates: {
    getStatus: () => ipcRenderer.invoke("neud:updates:getStatus"),
    check: (reason?: "manual" | "menu" | "startup") =>
      ipcRenderer.invoke("neud:updates:check", reason ?? "manual"),
    download: () =>
      ipcRenderer.invoke("neud:updates:download") as Promise<
        { ok: true } | { ok: false; error: string }
      >,
    dismiss: () => ipcRenderer.invoke("neud:updates:dismiss"),
    install: () => ipcRenderer.invoke("neud:updates:install") as Promise<
      { ok: true } | { ok: false; error: string }
    >,
    onStatus: (
      callback: (status: Record<string, unknown>) => void,
    ) => {
      const listener = (_event: unknown, status: Record<string, unknown>) => {
        callback(status);
      };
      ipcRenderer.on("neud:updates:status", listener);
      return () => {
        ipcRenderer.removeListener("neud:updates:status", listener);
      };
    },
  },
};

const DISPLAY_CONNECTION_EVENT = "neud-display-connection-changed";
const DISPLAY_RELOAD_EVENT = "neud-display-reload-request";
const DISPLAY_DATA_CHANGED_EVENT = "neud-display-data-changed";

function postDisplayConnectionMessage(message: Record<string, unknown>): void {
  try {
    const channel = new BroadcastChannel("neud-display-connection");
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel unavailable in this context.
  }

  window.postMessage(message, window.location.origin);
}

function relayDisplayConnectionChanged(payload: {
  displayId: string;
  enabled: boolean;
}) {
  postDisplayConnectionMessage({
    type: DISPLAY_CONNECTION_EVENT,
    displayId: payload.displayId,
    enabled: payload.enabled,
    dataConnected: payload.enabled,
    updatedAt: new Date().toISOString(),
    timestamp: Date.now(),
  });

  if (!payload.enabled) {
    postDisplayConnectionMessage({
      type: DISPLAY_RELOAD_EVENT,
      displayId: payload.displayId,
      timestamp: Date.now(),
    });
  }
}

ipcRenderer.on("neud:displayConnection:changed", (_event, payload: unknown) => {
  if (!payload || typeof payload !== "object") return;
  const record = payload as { displayId?: unknown; enabled?: unknown };
  if (typeof record.displayId !== "string") return;
  relayDisplayConnectionChanged({
    displayId: record.displayId,
    enabled: record.enabled === true,
  });
});

ipcRenderer.on("neud:displayData:changed", (_event, payload: unknown) => {
  if (!payload || typeof payload !== "object") return;
  const record = payload as {
    projectId?: unknown;
    revision?: unknown;
    contentHash?: unknown;
  };
  if (typeof record.projectId !== "string") return;
  postDisplayConnectionMessage({
    type: DISPLAY_DATA_CHANGED_EVENT,
    projectId: record.projectId,
    revision: typeof record.revision === "number" ? record.revision : null,
    contentHash: typeof record.contentHash === "string" ? record.contentHash : null,
    timestamp: Date.now(),
  });
});

contextBridge.exposeInMainWorld("neudDesktop", neudDesktop);
