"use client";

const CHANNEL_NAME = "neud-display-connection";
const CONNECTION_EVENT_TYPE = "neud-display-connection-changed";
const REFRESH_RATE_EVENT_TYPE = "neud-display-refresh-rate-changed";
const RELOAD_EVENT_TYPE = "neud-display-reload-request";
const DATA_CHANGED_EVENT_TYPE = "neud-display-data-changed";

function postDisplayConnectionPayload(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;

  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // BroadcastChannel unavailable.
  }

  try {
    window.postMessage(payload, window.location.origin);
  } catch {
    // postMessage unavailable.
  }
}

export function notifyDisplayConnectionChanged(
  displayId: string,
  enabled: boolean,
): void {
  postDisplayConnectionPayload({
    type: CONNECTION_EVENT_TYPE,
    displayId,
    enabled,
    dataConnected: enabled,
    updatedAt: new Date().toISOString(),
    timestamp: Date.now(),
  });
}

export function notifyDisplayRefreshRateChanged(
  displayId: string,
  refreshRateMs: number,
): void {
  postDisplayConnectionPayload({
    type: REFRESH_RATE_EVENT_TYPE,
    displayId,
    refreshRateMs,
    pollIntervalMs: refreshRateMs,
    timestamp: Date.now(),
  });
}

export function requestDisplayViewerReload(displayId: string): void {
  postDisplayConnectionPayload({
    type: RELOAD_EVENT_TYPE,
    displayId,
    timestamp: Date.now(),
  });
}

export function notifyDisplayBridgeDataChanged(
  displayId: string,
  revision?: number | null,
  projectId?: string | null,
): void {
  postDisplayConnectionPayload({
    type: DATA_CHANGED_EVENT_TYPE,
    displayId,
    projectId: projectId ?? null,
    revision: revision ?? null,
    timestamp: Date.now(),
  });
}
