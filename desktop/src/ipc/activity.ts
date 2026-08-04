import { BrowserWindow } from "electron";
import type { LocalDataService } from "../services/local-data-service";
import type { ActivityEvent } from "../services/activity-session-store";
import { getSenderWindow } from "./credentials";
import { registerIpcHandler, sendToRenderer } from "./channels";

type RecordActivityPayload = {
  type: string;
  message: string;
  source?: string;
  severity?: ActivityEvent["severity"];
  metadata?: Record<string, unknown>;
  userAction?: string;
  actor?: ActivityEvent["actor"];
};

function parseRecordPayload(payload: unknown): RecordActivityPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid activity payload.");
  }

  const record = payload as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const userAction =
    typeof record.userAction === "string" ? record.userAction.trim() : "";

  if (!type || (!message && !userAction)) {
    throw new Error("Activity type and message are required.");
  }

  return {
    type,
    message: message || userAction || type,
    source: typeof record.source === "string" ? record.source : undefined,
    severity:
      record.severity === "warning" || record.severity === "error"
        ? record.severity
        : "info",
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : undefined,
    userAction: userAction || undefined,
    actor:
      record.actor && typeof record.actor === "object"
        ? (record.actor as ActivityEvent["actor"])
        : undefined,
  };
}

export function registerActivityIpc(data: LocalDataService) {
  registerIpcHandler("neud:activity:getSnapshot", () => {
    return data.getActivitySnapshot();
  });

  registerIpcHandler("neud:activity:record", (_event, payload: unknown) => {
    const parsed = parseRecordPayload(payload);
    return data.recordActivity(parsed);
  });

  registerIpcHandler("neud:activity:subscribe", (event) => {
    data.subscribeActivity(getSenderWindow(event));
  });

  registerIpcHandler("neud:activity:unsubscribe", (event) => {
    data.unsubscribeActivity(getSenderWindow(event));
  });

  registerIpcHandler("neud:activity:getDisplayDataSource", () => {
    return data.getDisplayDataSource();
  });

  registerIpcHandler("neud:activity:setDisplayDataSource", (_event, source: unknown) => {
    return data.setDisplayDataSource(source);
  });

  registerIpcHandler("neud:activity:getSyncState", () => {
    return data.getActivitySyncState();
  });

  registerIpcHandler("neud:activity:syncNow", async () => {
    await data.syncActivityNow();
    return data.getActivitySyncState();
  });
}

export function pushActivitySnapshotToWindow(
  window: BrowserWindow,
  entries: ActivityEvent[],
) {
  if (window.isDestroyed()) return;
  sendToRenderer(window, "neud:activity:snapshot", { entries });
}

export function pushActivityEntryToWindow(
  window: BrowserWindow,
  entry: ActivityEvent,
) {
  if (window.isDestroyed()) return;
  sendToRenderer(window, "neud:activity:entry", { entry });
}
