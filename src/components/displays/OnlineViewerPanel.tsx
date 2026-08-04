"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import {
  localGetProjectPublishingStatus,
  resolveLiveDataStatusLabel,
} from "@/lib/local/publishing-api";
import { isDesktopRuntimeClient } from "@/lib/runtime/environment";
import { openExternalUrl } from "@/lib/desktop/open-external-url";
import {
  buildAbsoluteHostedFullscreenViewerUrl,
  buildHostedFullscreenViewerPath,
  resolveHostedViewerPath,
} from "@/lib/hosted/viewer-url";
import { useHostedPortalOrigin } from "@/lib/hosted/use-hosted-portal-origin";
import {
  localGetOnlineViewerSettings,
  localUpdateOnlineViewerSettings,
} from "@/lib/local/online-viewer-api";

type OnlineViewerPanelProps = {
  projectSlug: string;
  displayId: string;
  displaySlug: string;
  canManage?: boolean;
};

export function OnlineViewerPanel({
  projectSlug,
  displayId,
  displaySlug,
  canManage = false,
}: OnlineViewerPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [liveDataStatus, setLiveDataStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isDesktop = isDesktopRuntimeClient();
  const controlsDisabled = !canManage || !isDesktop || Boolean(loadError) || loading;

  const hostedPortal = useHostedPortalOrigin();
  const viewerPath = useMemo(
    () =>
      buildHostedFullscreenViewerPath(projectSlug, displaySlug, visibility) ??
      resolveHostedViewerPath(projectSlug, displaySlug, visibility) ??
      "Invalid viewer path",
    [displaySlug, projectSlug, visibility],
  );
  const viewerUrl = useMemo(
    () =>
      buildAbsoluteHostedFullscreenViewerUrl(
        projectSlug,
        displaySlug,
        visibility,
        hostedPortal.origin,
      ),
    [displaySlug, hostedPortal.origin, projectSlug, visibility],
  );

  const loadSettings = useCallback(async () => {
    if (!isDesktop) {
      setLoadError("Online Viewer settings are managed from the NEUD desktop app.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const settings = await localGetOnlineViewerSettings(projectSlug, displayId);
      setEnabled(settings.onlineViewerEnabled);
      setVisibility(settings.onlineVisibility);
      setPublishedAt(settings.onlinePublishedAt);
      setPublishError(settings.onlinePublishError);
      setLoadError(null);
      if (settings.onlineViewerEnabled) {
        const publishing = await localGetProjectPublishingStatus(projectSlug);
        setLiveDataStatus(resolveLiveDataStatusLabel(publishing));
      } else {
        setLiveDataStatus(null);
      }
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load online viewer settings. Restart NEUD Desktop after updating.",
      );
    } finally {
      setLoading(false);
    }
  }, [displayId, isDesktop, projectSlug]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function saveVisibility(nextVisibility: "private" | "public") {
    if (controlsDisabled) {
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const settings = await localUpdateOnlineViewerSettings(projectSlug, displayId, {
        onlineVisibility: nextVisibility,
      });
      setEnabled(settings.onlineViewerEnabled);
      setVisibility(settings.onlineVisibility);
      setPublishedAt(settings.onlinePublishedAt);
      setPublishError(settings.onlinePublishError);
      setLoadError(null);
      setStatus("Online visibility updated.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to update online viewer settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    if (controlsDisabled || !enabled) {
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const settings = await localUpdateOnlineViewerSettings(projectSlug, displayId, {
        onlineVisibility: visibility,
      });
      setEnabled(settings.onlineViewerEnabled);
      setVisibility(settings.onlineVisibility);
      setPublishedAt(settings.onlinePublishedAt);
      setPublishError(settings.onlinePublishError);
      setLoadError(null);
      setStatus("Online viewer sync queued.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to queue online viewer sync.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const absoluteUrl = viewerUrl ?? viewerPath;
    await navigator.clipboard.writeText(absoluteUrl);
    setStatus("Viewer link copied.");
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Online Viewer</h2>
        <p className="mt-1 text-sm text-muted">
          Manage how this display is shared through the NEUD web portal. Turn Online Viewer on or
          off from the Displays page.
        </p>
      </div>

      {!canManage ? (
        <Alert variant="info">
          You can view online viewer settings here, but only project owners and admins can change
          sharing settings.
        </Alert>
      ) : null}

      {!isDesktop ? (
        <Alert variant="info">
          Open the NEUD desktop app to manage online viewer sharing for this display.
        </Alert>
      ) : null}

      {loadError ? <Alert variant="error">{loadError}</Alert> : null}
      {status ? <Alert variant="info">{status}</Alert> : null}
      {publishError ? <Alert variant="error">{publishError}</Alert> : null}

      {!loading && !enabled ? (
        <p className="text-xs text-muted">
          Online Viewer is currently off for this display.
        </p>
      ) : null}

      <fieldset className="space-y-2" disabled={controlsDisabled || busy}>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`online-visibility-${displayId}`}
            checked={visibility === "private"}
            disabled={controlsDisabled || busy}
            onChange={() => {
              void saveVisibility("private");
            }}
          />
          Private — Only users with access to this project can view this display.
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`online-visibility-${displayId}`}
            checked={visibility === "public"}
            disabled={controlsDisabled || busy}
            onChange={() => {
              void saveVisibility("public");
            }}
          />
          Public — Anyone with this link can view the display. No project controls or data are exposed.
        </label>
      </fieldset>

      <div className="space-y-1 text-sm">
        <p className="text-muted">Hosted viewer URL</p>
        <p className="break-all font-mono text-xs text-foreground">{viewerPath}</p>
        {loading ? (
          <p className="text-xs text-muted">Loading publishing status…</p>
        ) : enabled ? (
          <>
            <p className="text-xs text-muted">
              Display published: {publishedAt ? new Date(publishedAt).toLocaleString() : "Not yet"}
            </p>
            <p className="text-xs text-muted">
              Live data: {liveDataStatus ?? "Unknown"}
            </p>
          </>
        ) : publishedAt ? (
          <p className="text-xs text-muted">
            Last published {new Date(publishedAt).toLocaleString()}
          </p>
        ) : (
          <p className="text-xs text-muted">Not published online yet</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!enabled || busy || loading}
          onClick={() => void copyLink()}
        >
          Copy Link
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!enabled || busy || loading || !viewerUrl}
          onClick={() => {
            if (viewerUrl) {
              void openExternalUrl(viewerUrl);
            }
          }}
        >
          Open Viewer
        </Button>
        <Button type="button" disabled={controlsDisabled || busy || !enabled} onClick={() => void syncNow()}>
          Sync Now
        </Button>
      </div>
    </Card>
  );
}
