"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppVersion } from "@/components/branding/AppVersion";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import type { NeudUpdateStatus } from "@/lib/desktop/types";

function formatLastChecked(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(status: NeudUpdateStatus): string {
  if (status.message) {
    return status.message;
  }

  switch (status.state) {
    case "checking":
      return "Checking for updates…";
    case "downloading":
      return status.downloadPercent != null
        ? `Downloading update… ${Math.round(status.downloadPercent)}%`
        : "Downloading update…";
    case "downloaded":
      return status.availableVersion
        ? `NEUD ${status.availableVersion} is ready to install.`
        : "An update is ready to install.";
    case "not-available":
      return "NEUD is up to date.";
    case "error":
      return status.lastError ?? "Unable to check for updates.";
    case "unavailable":
      return "Automatic updates are unavailable in this session.";
    default:
      return "Check for the latest NEUD release.";
  }
}

export function ApplicationUpdatesSection() {
  const desktop = isDesktopEnvironment();
  const [status, setStatus] = useState<NeudUpdateStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const api = getDesktopAPI();
    if (!api?.updates) {
      return;
    }

    let cancelled = false;

    void api.updates.getStatus().then((initial) => {
      if (!cancelled) {
        setStatus(initial);
      }
    });

    const unsubscribe = api.updates.onStatus((next) => {
      setStatus(next);
      if (next.state !== "checking" && next.state !== "downloading") {
        setBusy(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [desktop]);

  const lastCheckedLabel = useMemo(
    () => formatLastChecked(status?.lastCheckedAt ?? null),
    [status?.lastCheckedAt],
  );

  const checkForUpdates = useCallback(async () => {
    const api = getDesktopAPI();
    if (!api?.updates || busy) {
      return;
    }

    setActionError(null);
    setBusy(true);
    try {
      const next = await api.updates.check("manual");
      setStatus(next);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to check for updates.",
      );
      setBusy(false);
    }
  }, [busy]);

  const installUpdate = useCallback(async () => {
    const api = getDesktopAPI();
    if (!api?.updates) {
      return;
    }

    setActionError(null);
    const result = await api.updates.install();
    if (!result.ok) {
      setActionError(result.error);
    }
  }, []);

  if (!desktop) {
    return null;
  }

  const updatesEnabled = status?.enabled ?? false;
  const checking = status?.state === "checking" || busy;
  const downloading = status?.state === "downloading";
  const canInstall = status?.canInstall === true;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">About NEUD</h2>
          <p className="text-sm text-muted">
            Installed release information and Windows update controls.
          </p>
          <AppVersion placement="sidebar" className="mt-2" />
          <p className="text-xs text-muted">© 2026 NEUD</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-foreground">{status ? statusLabel(status) : "Loading update status…"}</p>
          {lastCheckedLabel ? (
            <p className="text-xs text-muted">Last checked: {lastCheckedLabel}</p>
          ) : null}
          {downloading && status?.downloadPercent != null ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.max(0, Math.min(100, status.downloadPercent))}%` }}
              />
            </div>
          ) : null}
        </div>

        {actionError ? <Alert variant="error">{actionError}</Alert> : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!updatesEnabled || checking || downloading}
            onClick={() => void checkForUpdates()}
          >
            {checking ? "Checking…" : "Check for Updates"}
          </Button>
          {canInstall ? (
            <Button type="button" variant="primary" size="sm" onClick={() => void installUpdate()}>
              Restart and Install
            </Button>
          ) : null}
        </div>

        {!updatesEnabled ? (
          <p className="text-xs text-muted">
            Automatic updates are available only in the packaged NEUD desktop app.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
