import fs from "fs";
import path from "path";
import os from "os";

export type LiveDisplayPipelineStage =
  | "worker.faye_received"
  | "worker.event_accepted"
  | "worker.post_started"
  | "worker.post_finished"
  | "desktop.snapshot_received"
  | "desktop.sqlite_insert_started"
  | "desktop.sqlite_insert_finished"
  | "desktop.memory_promoted"
  | "desktop.notify_called"
  | "desktop.notify_skipped"
  | "desktop.sse_notify_published"
  | "desktop.sse_connection_opened"
  | "desktop.sse_write_started"
  | "desktop.sse_write_finished"
  | "desktop.sse_flush_started"
  | "desktop.sse_flush_finished"
  | "desktop.sse_emitted"
  | "desktop.process_snapshot_finished"
  | "desktop.display_get_served"
  | "local_api.display_get_received"
  | "local_api.display_get_response_started"
  | "next_proxy_request_received"
  | "next_proxy_fetch_started"
  | "next_proxy_fetch_finished"
  | "next_proxy_response_started"
  | "next_proxy_response_finished"
  | "browser.sse_received"
  | "browser.fetch_started"
  | "browser.fetch_finished"
  | "browser.display_published"
  | "browser.bridge_rendered";

export type LiveDisplayPipelineLogEntry = {
  traceEventId?: string | null;
  stage: LiveDisplayPipelineStage;
  platform: NodeJS.Platform;
  atMs: number;
  notificationIndex?: number;
  revision?: number;
  lotNumber?: string | null;
  bidLabel?: string | null;
  bidAtGet?: string | null;
  sqliteInsertMs?: number;
  notifyReturned?: boolean;
  fetchInFlight?: boolean;
  pendingFetch?: boolean;
  displayDataRevision?: number;
  connectionId?: string;
  displayClientId?: string | null;
  fetchRequestId?: string | null;
  detail?: Record<string, unknown>;
};

export function appendLiveDisplayPipelineLog(
  logsDir: string,
  entry: Omit<LiveDisplayPipelineLogEntry, "platform" | "atMs"> & {
    atMs?: number;
    platform?: NodeJS.Platform;
  },
): void {
  try {
    const filePath = path.join(logsDir, "live-display-pipeline.jsonl");
    fs.mkdirSync(logsDir, { recursive: true });
    const line = JSON.stringify({
      ...entry,
      platform: entry.platform ?? os.platform(),
      atMs: entry.atMs ?? Date.now(),
    });
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  } catch {
    // Diagnostic-only.
  }
}
