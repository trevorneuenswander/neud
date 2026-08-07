"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { NeudModal } from "@/components/ui/NeudModal";
import { getDesktopAPI, isDesktopEnvironment } from "@/lib/desktop/client";
import {
  formatDownloadSize,
  formatReleaseDate,
  normalizeReleaseNotes,
} from "@/lib/desktop/normalize-release-notes";
import type { NeudUpdateStatus } from "@/lib/desktop/types";

type UpdateAvailableModalProps = {
  status: NeudUpdateStatus;
  actionError?: string | null;
  busy?: boolean;
  onDownload: () => void;
  onInstall: () => void;
  onLater: () => void;
};

export function UpdateAvailableModal({
  status,
  actionError,
  busy = false,
  onDownload,
  onInstall,
  onLater,
}: UpdateAvailableModalProps) {
  const releaseNotes =
    status.releaseNotes ?? normalizeReleaseNotes(status.releaseNotes) ?? null;
  const releaseDateLabel = formatReleaseDate(status.releaseDate);
  const downloadSizeLabel =
    status.downloadSizeLabel ??
    formatDownloadSize(status.totalBytes ?? null);

  const title =
    status.releaseName?.trim() ||
    (status.availableVersion
      ? `NEUD ${status.availableVersion} is available`
      : "Update available");

  return (
    <NeudModal
      title={title}
      description={
        <div className="space-y-2">
          <p>
            Installed: <strong className="text-foreground">{status.currentVersion}</strong>
            {status.availableVersion ? (
              <>
                {" "}
                → Available:{" "}
                <strong className="text-foreground">{status.availableVersion}</strong>
              </>
            ) : null}
          </p>
          {releaseDateLabel ? <p>Released: {releaseDateLabel}</p> : null}
          {downloadSizeLabel ? <p>Download size: {downloadSizeLabel}</p> : null}
        </div>
      }
      onClose={onLater}
      closeOnBackdrop={status.state !== "downloading"}
      closeOnEscape={status.state !== "downloading"}
      footer={
        <div className="space-y-4">
          {releaseNotes ? (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-surface-raised p-3 text-sm whitespace-pre-wrap text-foreground">
              {releaseNotes}
            </div>
          ) : null}

          {status.state === "downloading" && status.downloadPercent != null ? (
            <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{
                  width: `${Math.max(0, Math.min(100, status.downloadPercent))}%`,
                }}
              />
            </div>
          ) : null}

          {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}

          <div className="flex flex-wrap justify-end gap-3">
            {status.state === "downloaded" ? (
              <>
                <Button type="button" variant="secondary" onClick={onLater}>
                  Later
                </Button>
                <Button type="button" variant="primary" disabled={busy} onClick={onInstall}>
                  Restart and Install
                </Button>
              </>
            ) : status.state === "downloading" ? (
              <Button type="button" variant="secondary" disabled>
                Downloading…
              </Button>
            ) : (
              <>
                <Button type="button" variant="secondary" disabled={busy} onClick={onLater}>
                  Later
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={busy || !status.canDownload}
                  onClick={onDownload}
                >
                  Download Update
                </Button>
              </>
            )}
          </div>
        </div>
      }
    />
  );
}

export function UpdateAvailableModalHost() {
  const [status, setStatus] = useState<NeudUpdateStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const api = getDesktopAPI();
    if (!isDesktopEnvironment() || !api?.updates) {
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
  }, []);

  const handleDownload = useCallback(async () => {
    const api = getDesktopAPI();
    if (!api?.updates || busy) {
      return;
    }

    setActionError(null);
    setBusy(true);
    const result = await api.updates.download();
    if (!result.ok) {
      setActionError(result.error);
      setBusy(false);
    }
  }, [busy]);

  const handleLater = useCallback(async () => {
    const api = getDesktopAPI();
    if (!api?.updates) {
      return;
    }
    setActionError(null);
    const next = await api.updates.dismiss();
    setStatus(next);
  }, []);

  const handleInstall = useCallback(async () => {
    const api = getDesktopAPI();
    if (!api?.updates) {
      return;
    }

    const confirmed = window.confirm(
      "NEUD will install the update and sign you out. You will need to sign in again after the update.",
    );
    if (!confirmed) {
      return;
    }

    setActionError(null);
    const result = await api.updates.install();
    if (!result.ok) {
      setActionError(result.error);
    }
  }, []);

  if (
    !status?.promptVisible ||
    (status.state !== "available" &&
      status.state !== "downloading" &&
      status.state !== "downloaded")
  ) {
    return null;
  }

  return (
    <UpdateAvailableModal
      status={status}
      actionError={actionError}
      busy={busy}
      onDownload={() => void handleDownload()}
      onInstall={() => void handleInstall()}
      onLater={() => void handleLater()}
    />
  );
}
