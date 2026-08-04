"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerActivityIpc = registerActivityIpc;
exports.pushActivitySnapshotToWindow = pushActivitySnapshotToWindow;
exports.pushActivityEntryToWindow = pushActivityEntryToWindow;
const credentials_1 = require("./credentials");
const channels_1 = require("./channels");
function parseRecordPayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("Invalid activity payload.");
    }
    const record = payload;
    const type = typeof record.type === "string" ? record.type.trim() : "";
    const message = typeof record.message === "string" ? record.message.trim() : "";
    const userAction = typeof record.userAction === "string" ? record.userAction.trim() : "";
    if (!type || (!message && !userAction)) {
        throw new Error("Activity type and message are required.");
    }
    return {
        type,
        message: message || userAction || type,
        source: typeof record.source === "string" ? record.source : undefined,
        severity: record.severity === "warning" || record.severity === "error"
            ? record.severity
            : "info",
        metadata: record.metadata && typeof record.metadata === "object"
            ? record.metadata
            : undefined,
        userAction: userAction || undefined,
        actor: record.actor && typeof record.actor === "object"
            ? record.actor
            : undefined,
    };
}
function registerActivityIpc(data) {
    (0, channels_1.registerIpcHandler)("neud:activity:getSnapshot", () => {
        return data.getActivitySnapshot();
    });
    (0, channels_1.registerIpcHandler)("neud:activity:record", (_event, payload) => {
        const parsed = parseRecordPayload(payload);
        return data.recordActivity(parsed);
    });
    (0, channels_1.registerIpcHandler)("neud:activity:subscribe", (event) => {
        data.subscribeActivity((0, credentials_1.getSenderWindow)(event));
    });
    (0, channels_1.registerIpcHandler)("neud:activity:unsubscribe", (event) => {
        data.unsubscribeActivity((0, credentials_1.getSenderWindow)(event));
    });
    (0, channels_1.registerIpcHandler)("neud:activity:getDisplayDataSource", () => {
        return data.getDisplayDataSource();
    });
    (0, channels_1.registerIpcHandler)("neud:activity:setDisplayDataSource", (_event, source) => {
        return data.setDisplayDataSource(source);
    });
    (0, channels_1.registerIpcHandler)("neud:activity:getSyncState", () => {
        return data.getActivitySyncState();
    });
    (0, channels_1.registerIpcHandler)("neud:activity:syncNow", async () => {
        await data.syncActivityNow();
        return data.getActivitySyncState();
    });
}
function pushActivitySnapshotToWindow(window, entries) {
    if (window.isDestroyed())
        return;
    (0, channels_1.sendToRenderer)(window, "neud:activity:snapshot", { entries });
}
function pushActivityEntryToWindow(window, entry) {
    if (window.isDestroyed())
        return;
    (0, channels_1.sendToRenderer)(window, "neud:activity:entry", { entry });
}
