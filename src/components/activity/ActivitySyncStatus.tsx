"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import type { ActivitySyncState } from "@/lib/activity/sync-types";

function formatTimestamp(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function ActivitySyncStatus() {
  const [state, setState] = useState<ActivitySyncState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isDesktopEnvironment()) return;
    const api = getDesktopAPI()?.activity;
    if (!api?.getSyncState) return;
    const next = await api.getSyncState();
    setState(next);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function handleSyncNow() {
    const api = getDesktopAPI()?.activity;
    if (!api?.syncNow) return;
    setBusy(true);
    try {
      const next = await api.syncNow();
      setState(next);
    } finally {
      setBusy(false);
    }
  }

  if (!isDesktopEnvironment() || !state) {
    return null;
  }

  const { diagnostics } = state;

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">Activity sync: {state.message}</p>
          <p className="text-muted">
            Last pull {formatTimestamp(diagnostics.lastSuccessfulPullAt)} · Last push{" "}
            {formatTimestamp(diagnostics.lastSuccessfulPushAt)}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || state.status === "syncing"}
          onClick={() => {
            void handleSyncNow();
          }}
        >
          {busy ? "Syncing…" : "Sync now"}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span>Pending {diagnostics.pendingUploadCount}</span>
        <span>Failed {diagnostics.failedUploadCount}</span>
        {diagnostics.lastSyncError ? (
          <span className="text-danger">{diagnostics.lastSyncError}</span>
        ) : null}
      </div>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer">Sync diagnostics</summary>
        <dl className="mt-2 grid gap-1">
          <div>Instance ID: {diagnostics.instanceId}</div>
          <div>Cloud user: {diagnostics.cloudUserId ?? "Not signed in"}</div>
          <div>Online: {diagnostics.online ? "Yes" : "No"}</div>
          <div>Provider: {diagnostics.cloudProvider}</div>
          <div>
            Cursor:{" "}
            {diagnostics.cursor
              ? `${diagnostics.cursor.updatedAt} / ${diagnostics.cursor.id}`
              : "None"}
          </div>
          <div>Last push uploaded: {diagnostics.lastPushUploaded}</div>
          <div>Last pull downloaded: {diagnostics.lastPullDownloaded}</div>
          <div>Rejected event types: {diagnostics.rejectedEventTypes.join(", ") || "None"}</div>
          <div>Recoverable failed: {diagnostics.recoverableFailedCount}</div>
          <div>Unrecoverable failed: {diagnostics.unrecoverableFailedCount}</div>
          <div>Last requeued: {diagnostics.requeuedCount}</div>
          <div>Failure stage: {diagnostics.firstActivitySyncFailureStage}</div>
        </dl>
      </details>
    </div>
  );
}
