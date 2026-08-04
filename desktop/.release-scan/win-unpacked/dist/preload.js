"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const neudDesktop = {
    app: {
        isDesktop: () => true,
        getVersion: () => electron_1.ipcRenderer.invoke("neud:app:getVersion"),
        getPlatform: () => electron_1.ipcRenderer.invoke("neud:app:getPlatform"),
        getHostId: () => electron_1.ipcRenderer.invoke("neud:app:getHostId"),
        getMenuLabels: () => electron_1.ipcRenderer.invoke("neud:app:getMenuLabels"),
        popupMenu: (label, position) => electron_1.ipcRenderer.invoke("neud:app:popupMenu", label, position),
        getWindowState: () => electron_1.ipcRenderer.invoke("neud:app:getWindowState"),
        windowControl: (action) => electron_1.ipcRenderer.invoke("neud:app:windowControl", action),
        respondCloseRequest: (action) => electron_1.ipcRenderer.invoke("neud:app:respondCloseRequest", action),
        onCloseRequested: (callback) => {
            const listener = (_event, payload) => {
                callback(payload ?? {});
            };
            electron_1.ipcRenderer.on("neud:app:closeRequested", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("neud:app:closeRequested", listener);
            };
        },
    },
    engines: {
        getLocalStatus: (engineId) => electron_1.ipcRenderer.invoke("neud:engines:getLocalStatus", engineId),
        start: (payload) => electron_1.ipcRenderer.invoke("neud:engines:start", payload),
        stop: (payload) => electron_1.ipcRenderer.invoke("neud:engines:stop", payload),
        restart: (payload) => electron_1.ipcRenderer.invoke("neud:engines:restart", payload),
        runOnce: (payload) => electron_1.ipcRenderer.invoke("neud:engines:runOnce", payload),
        subscribeLogs: (engineId) => electron_1.ipcRenderer.invoke("neud:engines:subscribeLogs", engineId),
        unsubscribeLogs: (engineId) => electron_1.ipcRenderer.invoke("neud:engines:unsubscribeLogs", engineId),
        clearSessionLogs: (engineId) => electron_1.ipcRenderer.invoke("neud:engines:clearSessionLogs", engineId),
        subscribeExecutionLogs: (engineId) => electron_1.ipcRenderer.invoke("neud:engines:subscribeExecutionLogs", engineId),
        unsubscribeExecutionLogs: (engineId) => electron_1.ipcRenderer.invoke("neud:engines:unsubscribeExecutionLogs", engineId),
        subscribeEngineStatus: (engineId) => electron_1.ipcRenderer.invoke("neud:engines:subscribeEngineStatus", engineId),
        unsubscribeEngineStatus: (engineId) => electron_1.ipcRenderer.invoke("neud:engines:unsubscribeEngineStatus", engineId),
        getBrowserSessionState: (engineId) => electron_1.ipcRenderer.invoke("neud:engines:getBrowserSessionState", engineId),
        onLog: (callback) => {
            const listener = (_event, entry) => {
                callback(entry);
            };
            electron_1.ipcRenderer.on("neud:engines:log", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("neud:engines:log", listener);
            };
        },
        onExecutionLogSnapshot: (callback) => {
            const listener = (_event, payload) => {
                callback(payload);
            };
            electron_1.ipcRenderer.on("neud:engines:executionLogSnapshot", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("neud:engines:executionLogSnapshot", listener);
            };
        },
        onExecutionLogEntry: (callback) => {
            const listener = (_event, payload) => {
                callback(payload);
            };
            electron_1.ipcRenderer.on("neud:engines:executionLogEntry", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("neud:engines:executionLogEntry", listener);
            };
        },
        onEngineStatusSnapshot: (callback) => {
            const listener = (_event, payload) => {
                callback(payload);
            };
            electron_1.ipcRenderer.on("neud:engines:engineStatusSnapshot", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("neud:engines:engineStatusSnapshot", listener);
            };
        },
    },
    credentials: {
        hasCredentials: (engineId) => electron_1.ipcRenderer.invoke("neud:credentials:has", engineId),
        getCredentialMeta: (engineId) => electron_1.ipcRenderer.invoke("neud:credentials:getMeta", engineId),
        getCredentials: (engineId) => electron_1.ipcRenderer.invoke("neud:credentials:get", engineId),
        saveCredentials: (engineId, credentials) => electron_1.ipcRenderer.invoke("neud:credentials:save", engineId, credentials),
        clearCredentials: (engineId) => electron_1.ipcRenderer.invoke("neud:credentials:clear", engineId),
    },
    auth: {
        getStatus: () => electron_1.ipcRenderer.invoke("neud:auth:getStatus"),
        storeVerifiedSession: (payload) => electron_1.ipcRenderer.invoke("neud:auth:storeVerifiedSession", payload),
        clear: () => electron_1.ipcRenderer.invoke("neud:auth:clear"),
        forceSignOut: () => electron_1.ipcRenderer.invoke("neud:auth:forceSignOut"),
    },
    local: {
        listProjects: () => electron_1.ipcRenderer.invoke("neud:local:listProjects"),
        getRuntimeStatus: () => electron_1.ipcRenderer.invoke("neud:local:getRuntimeStatus"),
    },
    displayDataSource: {
        get: () => electron_1.ipcRenderer.invoke("neud:displayDataSource:get"),
        set: (source) => electron_1.ipcRenderer.invoke("neud:displayDataSource:set", source),
        subscribe: () => electron_1.ipcRenderer.invoke("neud:displayDataSource:subscribe"),
        unsubscribe: () => electron_1.ipcRenderer.invoke("neud:displayDataSource:unsubscribe"),
        onChanged: (callback) => {
            const listener = (_event, payload) => {
                callback(payload);
            };
            electron_1.ipcRenderer.on("neud:displayDataSource:changed", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("neud:displayDataSource:changed", listener);
            };
        },
    },
    activity: {
        getSnapshot: () => electron_1.ipcRenderer.invoke("neud:activity:getSnapshot"),
        record: (payload) => electron_1.ipcRenderer.invoke("neud:activity:record", payload),
        subscribe: () => electron_1.ipcRenderer.invoke("neud:activity:subscribe"),
        unsubscribe: () => electron_1.ipcRenderer.invoke("neud:activity:unsubscribe"),
        onSnapshot: (callback) => {
            const listener = (_event, payload) => {
                callback(payload);
            };
            electron_1.ipcRenderer.on("neud:activity:snapshot", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("neud:activity:snapshot", listener);
            };
        },
        onEntry: (callback) => {
            const listener = (_event, payload) => {
                callback(payload);
            };
            electron_1.ipcRenderer.on("neud:activity:entry", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("neud:activity:entry", listener);
            };
        },
        getDisplayDataSource: () => electron_1.ipcRenderer.invoke("neud:displayDataSource:get"),
        setDisplayDataSource: (source) => electron_1.ipcRenderer.invoke("neud:displayDataSource:set", source),
        getSyncState: () => electron_1.ipcRenderer.invoke("neud:activity:getSyncState"),
        syncNow: () => electron_1.ipcRenderer.invoke("neud:activity:syncNow"),
    },
    offlineAuction: {
        hasValidScrape: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:hasValidScrape", projectId),
        isExportInProgress: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:isExportInProgress", projectId),
        getExportOperation: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:getExportOperation", projectId),
        listExportOperations: () => electron_1.ipcRenderer.invoke("neud:offline:listExportOperations"),
        getActiveDataset: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:getActiveDataset", projectId),
        getActiveDownloadedDataset: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:getActiveDownloadedDataset", projectId),
        dismissExportOperation: (payload) => electron_1.ipcRenderer.invoke("neud:offline:dismissExportOperation", payload),
        getLotThumbnailPhotos: (projectId, lotNumber) => electron_1.ipcRenderer.invoke("neud:offline:getLotThumbnailPhotos", {
            projectId,
            lotNumber,
        }),
        importLotPhotos: (projectId, lotNumber) => electron_1.ipcRenderer.invoke("neud:offline:importLotPhotos", {
            projectId,
            lotNumber,
        }),
        getLotDatasetDetails: (projectId, lotNumber) => electron_1.ipcRenderer.invoke("neud:offline:getLotDatasetDetails", {
            projectId,
            lotNumber,
        }),
        export: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:export", projectId),
        cancelExport: (operationId) => electron_1.ipcRenderer.invoke("neud:offline:cancelExport", operationId),
        load: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:load", projectId),
        onProgress: (callback) => {
            const listener = (_event, progress) => {
                callback(progress);
            };
            electron_1.ipcRenderer.on("neud:offline:progress", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("neud:offline:progress", listener);
            };
        },
        listDownloads: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:listDownloads", projectId),
        refreshDownloads: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:refreshDownloads", projectId),
        clearDownloads: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:clearDownloads", projectId),
        openDownloadRoot: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:openDownloadRoot", projectId),
        openDownloadFolder: (projectId) => electron_1.ipcRenderer.invoke("neud:offline:openDownloadFolder", projectId),
    },
    currencyRates: {
        getRates: () => electron_1.ipcRenderer.invoke("neud:currency:getRates"),
        refreshIfStale: () => electron_1.ipcRenderer.invoke("neud:currency:refreshIfStale"),
        refreshNow: () => electron_1.ipcRenderer.invoke("neud:currency:refreshNow"),
    },
    displays: {
        openPreview: (payload) => electron_1.ipcRenderer.invoke("neud:displays:openPreview", payload),
        closePreview: (payload) => electron_1.ipcRenderer.invoke("neud:displays:closePreview", payload),
        saveOrder: (payload) => electron_1.ipcRenderer.invoke("neud:displays:saveOrder", payload),
        getOrder: (projectId) => electron_1.ipcRenderer.invoke("neud:displays:getOrder", projectId),
    },
};
const DISPLAY_CONNECTION_EVENT = "neud-display-connection-changed";
const DISPLAY_RELOAD_EVENT = "neud-display-reload-request";
function postDisplayConnectionMessage(message) {
    try {
        const channel = new BroadcastChannel("neud-display-connection");
        channel.postMessage(message);
        channel.close();
    }
    catch {
        // BroadcastChannel unavailable in this context.
    }
    window.postMessage(message, window.location.origin);
}
function relayDisplayConnectionChanged(payload) {
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
electron_1.ipcRenderer.on("neud:displayConnection:changed", (_event, payload) => {
    if (!payload || typeof payload !== "object")
        return;
    const record = payload;
    if (typeof record.displayId !== "string")
        return;
    relayDisplayConnectionChanged({
        displayId: record.displayId,
        enabled: record.enabled === true,
    });
});
electron_1.contextBridge.exposeInMainWorld("neudDesktop", neudDesktop);
