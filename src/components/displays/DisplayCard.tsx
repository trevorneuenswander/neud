"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DisclosureSection } from "@/components/ui/DisclosureSection";
import { Switch } from "@/components/ui/Switch";
import type { DisplayDefinition } from "@/lib/displays/registry";
import {
  buildLowerTickerV5ViewerPath,
  buildNewBidDisplayV1ViewerPath,
  buildNewTickerV1ViewerPath,
  buildPylonViewerPath,
  LOWER_TICKER_V5_DISPLAY_ID,
  NEW_BID_DISPLAY_V1_ID,
  NEW_TICKER_V1_ID,
  PYLON_DISPLAY_ID,
} from "@/lib/displays/registry";
import {
  localGetDisplayEnabled,
  localSetDisplayEnabled,
  localSetDisplayRefreshRate,
  localSetDisplaySize,
} from "@/lib/local/displays-api";
import {
  notifyDisplayConnectionChanged,
  requestDisplayViewerReload,
} from "@/lib/displays/display-connection-client";
import { normalizeDisplayRefreshRateMs } from "@/lib/displays/refresh-rate";
import { normalizeDisplaySize } from "@/lib/displays/display-size";
import { recordDesktopActivity } from "@/lib/desktop/activity-session-client";
import { getDesktopAPI } from "@/lib/desktop/client";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { DisplayEditMenu } from "@/components/displays/DisplayEditMenu";
import {
  DisplayCardActionSizeRow,
  DisplayCardControlRow,
  DisplayCardControls,
} from "@/components/displays/DisplayCardControls";
import {
  getOnlineViewerVisibilityHint,
  OnlineViewerToggle,
} from "@/components/displays/OnlineViewerToggle";
import { ViewOnlineButton } from "@/components/displays/ViewOnlineButton";
import { useOnlineViewerSettings } from "@/lib/displays/use-online-viewer-settings";
import { NoDrag } from "@/components/displays/NoDrag";
import { DisplayPreviewPanel } from "@/components/displays/DisplayPreviewPanel";
import { DisplayRefreshRateSelect } from "@/components/displays/DisplayRefreshRateSelect";
import { DisplaySizeSelect } from "@/components/displays/DisplaySizeSelect";
import { DisplayVersionBadge } from "@/components/displays/DisplayVersionBadge";
import { useDisplayInlinePreview } from "@/lib/displays/display-inline-preview-context";
import type { ProjectDisplaySource } from "@/lib/developer-tools/types";

type DisplayCardProps = {
  display: DisplayDefinition;
  initialEnabled: boolean;
  hasLiveSnapshot?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  hasLivePayload?: (payload: Record<string, unknown>) => boolean;
  projectSlug?: string;
  projectId?: string;
  displayPersistId?: string;
  initialRefreshRateMs?: number;
  initialDisplayWidth?: number;
  initialDisplayHeight?: number;
  canDeveloperTools?: boolean;
  cardDescription?: string | null;
  activeVersionNumber?: number | null;
  activeVersionCreatedAt?: string | null;
  developerDisplay?: Pick<
    ProjectDisplaySource,
    "id" | "name" | "slug" | "displayKey" | "sourceType" | "archived" | "description"
  > | null;
  onArchived?: (displayId: string) => void;
  onDeleted?: (displayId: string) => void;
  onDuplicated?: (duplicate: {
    id: string;
    projectId: string;
    name: string;
    slug: string;
    displayKey: string;
    description: string | null;
    sourceType: "built-in" | "project-html";
    enabled: boolean;
    archived: boolean;
    refreshRateMs: number;
    publishedRevisionId: string | null;
  }) => void;
};

type PreviewConnectionState = "disconnected" | "connected" | "error";

function defaultHasLivePayload(payload: Record<string, unknown>): boolean {
  if (!payload || payload.enabled === false || payload.status === "display_disabled") {
    return false;
  }

  if (payload.current && typeof payload.current === "object") {
    const current = payload.current as Record<string, unknown>;
    return Boolean(
      current.title ||
        current.biddingPrice ||
        (current.lot && current.lot !== "Lot —") ||
        (Array.isArray(current.photos) && current.photos.length > 0),
    );
  }

  if (Array.isArray(payload.next)) {
    return payload.next.length > 0;
  }

  const auctionDisplay = payload.auctionDisplay;
  if (!auctionDisplay || typeof auctionDisplay !== "object") {
    return false;
  }

  const display = auctionDisplay as Record<string, unknown>;
  return Boolean(
    display.title ||
      display.lot ||
      display.biddingPrice ||
      (Array.isArray(display.photos) && display.photos.length > 0),
  );
}

function getEnabledLabel(enabled: boolean): string {
  return enabled ? "Enabled" : "Disabled";
}

function getDataConnectionLabel(input: {
  enabled: boolean;
  previewOpen: boolean;
  bridgeReady: boolean;
  connectionState: PreviewConnectionState;
}): string {
  if (!input.enabled) {
    return "Data Disconnected";
  }

  if (input.previewOpen) {
    if (input.connectionState === "error") {
      return "Connection Error";
    }
    if (input.bridgeReady) {
      return "Data Connected";
    }
    return "Connecting…";
  }

  if (input.connectionState === "error") {
    return "Connection Error";
  }
  if (input.connectionState === "connected") {
    return "Data Connected";
  }
  return "Data Disconnected";
}

export function DisplayCard({
  display,
  initialEnabled,
  hasLiveSnapshot = false,
  onEnabledChange,
  hasLivePayload = defaultHasLivePayload,
  projectSlug,
  projectId,
  displayPersistId,
  initialRefreshRateMs = 5000,
  initialDisplayWidth = 1920,
  initialDisplayHeight = 1080,
  canDeveloperTools = false,
  cardDescription = null,
  activeVersionNumber = null,
  activeVersionCreatedAt = null,
  developerDisplay = null,
  onArchived,
  onDeleted,
  onDuplicated,
}: DisplayCardProps) {
  const initialSize = normalizeDisplaySize(initialDisplayWidth, initialDisplayHeight);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [persistedEnabled, setPersistedEnabled] = useState(initialEnabled);
  const [refreshRateMs, setRefreshRateMs] = useState(
    normalizeDisplayRefreshRateMs(initialRefreshRateMs),
  );
  const [displayWidth, setDisplayWidth] = useState(initialSize.displayWidth);
  const [displayHeight, setDisplayHeight] = useState(initialSize.displayHeight);
  const [refreshRateSaving, setRefreshRateSaving] = useState(false);
  const [displaySizeSaving, setDisplaySizeSaving] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [connectionState, setConnectionState] =
    useState<PreviewConnectionState>("disconnected");
  const [bridgeReady, setBridgeReady] = useState(false);
  const { isExpanded, setExpanded } = useDisplayInlinePreview();
  const previewOpen =
    Boolean(projectId && displayPersistId && isExpanded(projectId, displayPersistId));
  const onlineViewer = useOnlineViewerSettings(
    projectSlug ?? "",
    displayPersistId ?? display.id,
    canDeveloperTools,
    enabled,
  );
  const copyTimerRef = useRef<number | null>(null);
  const copyActivityLoggedRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollMs = refreshRateMs;

  const viewerUrl = (() => {
    if (typeof window === "undefined") {
      return display.outputUrl;
    }

    const origin = window.location.origin;
    if (display.id === PYLON_DISPLAY_ID) {
      return buildPylonViewerPath(origin, pollMs);
    }
    if (display.id === LOWER_TICKER_V5_DISPLAY_ID) {
      const params = new URLSearchParams({ poll: String(pollMs) });
      return `${buildLowerTickerV5ViewerPath(origin)}?${params.toString()}`;
    }
    if (display.id === NEW_BID_DISPLAY_V1_ID) {
      return buildNewBidDisplayV1ViewerPath(origin, pollMs);
    }
    if (display.id === NEW_TICKER_V1_ID) {
      return buildNewTickerV1ViewerPath(origin, pollMs);
    }

    return display.outputUrl;
  })();

  const clearCopyTimer = useCallback(() => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearCopyTimer();
    };
  }, [clearCopyTimer]);

  useEffect(() => {
    setEnabled(initialEnabled);
    setPersistedEnabled(initialEnabled);
  }, [initialEnabled]);

  useEffect(() => {
    setRefreshRateMs(normalizeDisplayRefreshRateMs(initialRefreshRateMs));
  }, [initialRefreshRateMs]);

  useEffect(() => {
    const nextSize = normalizeDisplaySize(initialDisplayWidth, initialDisplayHeight);
    setDisplayWidth(nextSize.displayWidth);
    setDisplayHeight(nextSize.displayHeight);
  }, [initialDisplayWidth, initialDisplayHeight]);

  useEffect(() => {
    if (!shouldUseLocalDataClient()) return;

    let cancelled = false;
    void localGetDisplayEnabled(display.id)
      .then(({ enabled: nextEnabled }) => {
        if (cancelled) return;
        setEnabled(nextEnabled);
        setPersistedEnabled(nextEnabled);
        onEnabledChange?.(nextEnabled);
        if (!nextEnabled) {
          notifyDisplayConnectionChanged(display.id, false);
          requestDisplayViewerReload(display.id);
        }
      })
      .catch(() => {
        // Keep the last known enabled state.
      });

    return () => {
      cancelled = true;
    };
  }, [display.id, onEnabledChange]);

  useEffect(() => {
    if (!shouldUseLocalDataClient() || enabled) return;
    notifyDisplayConnectionChanged(display.id, false);
    requestDisplayViewerReload(display.id);
  }, [display.id, enabled]);

  function handlePreviewOpenChange(open: boolean) {
    if (!projectId || !displayPersistId) return;
    setExpanded(projectId, displayPersistId, open);
  }

  const previewIframeKey =
    displayPersistId && activeVersionNumber
      ? `${displayPersistId}:${activeVersionNumber}`
      : displayPersistId ?? display.id;

  useEffect(() => {
    if (!enabled || !previewOpen) {
      setBridgeReady(false);
    }
  }, [enabled, previewOpen]);

  useEffect(() => {
    if (!shouldUseLocalDataClient() || !enabled) {
      pollAbortRef.current?.abort();
      pollAbortRef.current = null;
      setConnectionState("disconnected");
      return;
    }

    let cancelled = false;
    let interval: number | null = null;

    const stopPolling = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
      pollAbortRef.current?.abort();
      pollAbortRef.current = null;
    };

    const pollDataEndpoint = async () => {
      if (cancelled || !enabled) return;

      pollAbortRef.current?.abort();
      const controller = new AbortController();
      pollAbortRef.current = controller;

      try {
        const response = await fetch(`${display.dataPath}?_=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "X-NEUD-Display-Client": "management-card",
          },
        });
        if (cancelled || controller.signal.aborted) return;

        if (response.status === 409 || response.status === 423) {
          setConnectionState("disconnected");
          stopPolling();
          return;
        }

        if (!response.ok) {
          setConnectionState("error");
          return;
        }

        const payload = (await response.json()) as Record<string, unknown>;
        if (
          payload.enabled === false ||
          payload.status === "display_disabled" ||
          payload.dataConnected === false
        ) {
          setConnectionState("disconnected");
          stopPolling();
          return;
        }

        setConnectionState(
          hasLivePayload(payload) || hasLiveSnapshot ? "connected" : "disconnected",
        );
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setConnectionState("error");
      }
    };

    void pollDataEndpoint();
    interval = window.setInterval(() => {
      void pollDataEndpoint();
    }, pollMs);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [display.dataPath, enabled, hasLivePayload, hasLiveSnapshot, pollMs]);

  const resolvedConnectionState: PreviewConnectionState = enabled
    ? connectionState
    : "disconnected";

  const dataConnectionLabel = getDataConnectionLabel({
    enabled,
    previewOpen,
    bridgeReady,
    connectionState: resolvedConnectionState,
  });

  function handlePreviewBridgeAck() {
    setBridgeReady(true);
    setConnectionState("connected");
  }

  async function handleEnabledChange(nextEnabled: boolean) {
    const previousEnabled = persistedEnabled;
    setEnabled(nextEnabled);
    setErrorMessage(null);
    onEnabledChange?.(nextEnabled);

    if (!nextEnabled) {
      pollAbortRef.current?.abort();
      pollAbortRef.current = null;
      setConnectionState("disconnected");
      setBridgeReady(false);
    }

    notifyDisplayConnectionChanged(display.id, nextEnabled);

    if (!nextEnabled && projectId && shouldUseLocalDataClient()) {
      const previewDisplayId = displayPersistId ?? developerDisplay?.id ?? display.id;
      const desktop = getDesktopAPI();
      if (desktop?.displays?.closePreview) {
        void desktop.displays.closePreview({
          projectId,
          displayId: previewDisplayId,
        });
      }
    }

    if (!shouldUseLocalDataClient()) {
      setPersistedEnabled(nextEnabled);
      return;
    }

    setSaving(true);
    try {
      const result = await localSetDisplayEnabled(display.id, nextEnabled);
      setEnabled(result.enabled);
      setPersistedEnabled(result.enabled);
      onEnabledChange?.(result.enabled);
      notifyDisplayConnectionChanged(display.id, result.enabled);
    } catch (error) {
      setEnabled(previousEnabled);
      setPersistedEnabled(previousEnabled);
      onEnabledChange?.(previousEnabled);
      notifyDisplayConnectionChanged(display.id, previousEnabled);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update display state.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshRateChange(nextRefreshRateMs: number) {
    const previousRefreshRateMs = refreshRateMs;
    setRefreshRateMs(nextRefreshRateMs);
    setErrorMessage(null);

    if (!shouldUseLocalDataClient() || !projectSlug || !displayPersistId) {
      return;
    }

    setRefreshRateSaving(true);
    try {
      const result = await localSetDisplayRefreshRate(
        projectSlug,
        displayPersistId,
        nextRefreshRateMs,
      );
      setRefreshRateMs(normalizeDisplayRefreshRateMs(result.refreshRateMs));
      requestDisplayViewerReload(display.id);
    } catch (error) {
      setRefreshRateMs(previousRefreshRateMs);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update refresh rate.",
      );
    } finally {
      setRefreshRateSaving(false);
    }
  }

  async function handleDisplaySizeChange(nextWidth: number, nextHeight: number) {
    const previousWidth = displayWidth;
    const previousHeight = displayHeight;
    setDisplayWidth(nextWidth);
    setDisplayHeight(nextHeight);
    setErrorMessage(null);

    if (!shouldUseLocalDataClient() || !projectSlug || !displayPersistId) {
      return;
    }

    setDisplaySizeSaving(true);
    try {
      const result = await localSetDisplaySize(
        projectSlug,
        displayPersistId,
        nextWidth,
        nextHeight,
      );
      setDisplayWidth(result.displayWidth);
      setDisplayHeight(result.displayHeight);
      requestDisplayViewerReload(display.id);
    } catch (error) {
      setDisplayWidth(previousWidth);
      setDisplayHeight(previousHeight);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update display size.",
      );
    } finally {
      setDisplaySizeSaving(false);
    }
  }

  async function handleCopyUrl() {
    if (copyState === "copied" && copyActivityLoggedRef.current) {
      return;
    }
    clearCopyTimer();
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopyState("copied");
      if (shouldUseLocalDataClient() && !copyActivityLoggedRef.current) {
        copyActivityLoggedRef.current = true;
        void recordDesktopActivity({
          type: "display.url-copied",
          message: `Copied ${display.name} local URL`,
          userAction: `copied ${display.name} local URL`,
          source: "displays",
          metadata: {
            displayId: display.id,
            displayKey: display.id,
            displayName: display.name,
            ...(projectId ? { projectId } : {}),
            ...(projectSlug ? { projectSlug } : {}),
          },
        });
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopyState("idle");
        copyActivityLoggedRef.current = false;
        copyTimerRef.current = null;
      }, 2500);
    } catch {
      setCopyState("error");
      copyTimerRef.current = window.setTimeout(() => {
        setCopyState("idle");
        copyTimerRef.current = null;
      }, 2500);
    }
  }

  function handleViewFullscreen() {
    const previewDisplayId = displayPersistId ?? developerDisplay?.id ?? display.id;
    if (!projectId) return;

    const previewUrl = `${viewerUrl}${viewerUrl.includes("?") ? "&" : "?"}preview=1`;

    if (shouldUseLocalDataClient()) {
      const desktop = getDesktopAPI();
      if (desktop?.displays?.openPreview) {
        void desktop.displays.openPreview({
          projectId,
          displayId: previewDisplayId,
          title: developerDisplay?.name ?? display.name,
          viewerUrl: previewUrl,
          displayWidth,
          displayHeight,
        });
        return;
      }
      setErrorMessage("Display preview is unavailable in this session.");
      return;
    }

    window.open(previewUrl, "_blank", "noopener,noreferrer");
  }

  const displayTitle = developerDisplay?.name ?? display.name;

  const enabledLabel = getEnabledLabel(enabled);
  const resolvedDescription = cardDescription ?? display.description ?? null;
  const copyLabel =
    copyState === "copied"
      ? "✓ Copied"
      : copyState === "error"
        ? "Copy failed"
        : "Copy Local URL";

  return (
    <Card>
      <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">{displayTitle}</h4>
                <DisplayVersionBadge
                  versionNumber={activeVersionNumber}
                  createdAt={activeVersionCreatedAt}
                />
              </div>
              {resolvedDescription ? (
                <p className="mt-1 text-xs text-muted">{resolvedDescription}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted">{dataConnectionLabel}</p>
              {resolvedConnectionState === "error" && enabled ? (
                <p className="mt-1 text-xs text-red-400">Connection Error</p>
              ) : null}
              <p className="mt-1 text-xs text-muted">
                {displayWidth} × {displayHeight} · transparent
              </p>
            </div>
            <NoDrag>
              <DisplayCardControls>
                <DisplayCardControlRow label="Enable Display">
                  <Switch
                    checked={enabled}
                    disabled={saving}
                    aria-label={`${display.name} display enabled`}
                    onCheckedChange={(nextEnabled) => void handleEnabledChange(nextEnabled)}
                  />
                </DisplayCardControlRow>
                {projectSlug && displayPersistId && developerDisplay ? (
                  <DisplayCardControlRow
                    label="Online Viewer"
                    hint={getOnlineViewerVisibilityHint(onlineViewer)}
                  >
                    <OnlineViewerToggle
                      canManage={canDeveloperTools}
                      displayEnabled={enabled}
                      displayName={developerDisplay.name}
                      onlineViewer={onlineViewer}
                    />
                  </DisplayCardControlRow>
                ) : null}
                <DisplayCardControlRow label="Refresh Rate">
                  <DisplayRefreshRateSelect
                    valueMs={refreshRateMs}
                    disabled={refreshRateSaving}
                    showLabel={false}
                    onChange={(nextRefreshRateMs) =>
                      void handleRefreshRateChange(nextRefreshRateMs)
                    }
                  />
                </DisplayCardControlRow>
              </DisplayCardControls>
            </NoDrag>
          </div>

          <NoDrag>
            <DisplayCardActionSizeRow
              actions={
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!enabled}
                    aria-label="Copy local display URL"
                    onClick={() => void handleCopyUrl()}
                  >
                    {copyLabel}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={handleViewFullscreen}
                  >
                    View Fullscreen
                  </Button>
                  {projectSlug && developerDisplay ? (
                    <ViewOnlineButton
                      projectSlug={projectSlug}
                      displaySlug={developerDisplay.slug}
                      displayEnabled={enabled}
                      enabled={onlineViewer.enabled}
                      visibility={onlineViewer.visibility}
                      loading={onlineViewer.loading}
                    />
                  ) : null}
                  {canDeveloperTools && projectSlug && developerDisplay ? (
                    <DisplayEditMenu
                      projectSlug={projectSlug}
                      display={developerDisplay}
                      onArchived={onArchived}
                      onDeleted={onDeleted}
                      onDuplicated={onDuplicated}
                    />
                  ) : null}
                </>
              }
              sizeControl={
                <DisplaySizeSelect
                  displayWidth={displayWidth}
                  displayHeight={displayHeight}
                  disabled={displaySizeSaving}
                  showLabel={false}
                  onChange={(nextWidth, nextHeight) =>
                    void handleDisplaySizeChange(nextWidth, nextHeight)
                  }
                />
              }
            />
          </NoDrag>

          {onlineViewer.loadError ? (
            <p className="text-xs text-amber-300">{onlineViewer.loadError}</p>
          ) : null}
          {onlineViewer.settings?.onlinePublishError ? (
            <p className="text-xs text-destructive">{onlineViewer.settings.onlinePublishError}</p>
          ) : null}

          <NoDrag>
            <DisclosureSection
              title="Preview"
              lazyMount
              open={previewOpen}
              onOpenChange={handlePreviewOpenChange}
            >
              {previewOpen ? (
                <DisplayPreviewPanel
                  viewerUrl={viewerUrl}
                  title={display.name}
                  displayWidth={displayWidth}
                  displayHeight={displayHeight}
                  iframeKey={previewIframeKey}
                  hasActiveRevision={
                    activeVersionNumber !== null && activeVersionNumber > 0
                  }
                  enabled={enabled}
                  displayId={displayPersistId ?? display.id}
                  onBridgeAck={handlePreviewBridgeAck}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-md border border-border bg-background/70 text-sm font-medium text-muted">
                  Open preview to load display
                </div>
              )}
            </DisclosureSection>
          </NoDrag>

          {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
      </div>
    </Card>
  );
}
