"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { DisclosureSection } from "@/components/ui/DisclosureSection";
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
import { DisplaySizeSelect } from "@/components/displays/DisplaySizeSelect";
import { DisplayPinButton } from "@/components/displays/DisplayPinButton";
import { DisplayVersionBadge } from "@/components/displays/DisplayVersionBadge";
import {
  requestPinnedViewerRefresh,
  requestPinnedViewerUnpin,
} from "@/lib/displays/pinned-viewer-context";
import {
  buildPinnedViewerDisplaySummary,
  localUnpinDisplayIfPinned,
} from "@/lib/local/pinned-viewer-api";
import { BroadArrowTypedDisplayPreview } from "@/components/displays/broad-arrow/BroadArrowTypedDisplayPreview";
import { useDisplayInlinePreview } from "@/lib/displays/display-inline-preview-context";
import {
  notifyDisplayConnectionChanged,
  requestDisplayViewerReload,
} from "@/lib/displays/display-connection-client";
import { useBroadArrowDisplayData } from "@/lib/displays/broad-arrow/useBroadArrowDisplayData";
import type { BroadArrowRendererKey } from "@/lib/displays/broad-arrow/renderer-keys";
import { buildProjectDisplayOutputPath } from "@/lib/local/developer-tools-api";
import { buildDisplayWindowFitPath } from "@/lib/displays/display-view-mode";
import { localSetDeveloperDisplayEnabled } from "@/lib/local/developer-tools-api";
import { localSetDisplaySize } from "@/lib/local/displays-api";
import { normalizeDisplaySize } from "@/lib/displays/display-size";
import { shouldUseLocalDataClient } from "@/lib/local/mode";
import { getDesktopAPI } from "@/lib/desktop/client";
import type { ProjectDisplaySource } from "@/lib/developer-tools/types";

type BroadArrowTypedDisplayCardProps = {
  projectSlug: string;
  projectId: string;
  rendererKey: BroadArrowRendererKey;
  refreshRateMs?: number;
  displayWidth?: number;
  displayHeight?: number;
  canDeveloperTools?: boolean;
  activeVersionNumber?: number | null;
  activeVersionCreatedAt?: string | null;
  display: Pick<
    ProjectDisplaySource,
    "id" | "name" | "slug" | "displayKey" | "description" | "sourceType" | "archived" | "enabled"
  >;
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
    displayWidth?: number;
    displayHeight?: number;
    publishedRevisionId: string | null;
    activeVersion?: {
      id: string;
      versionNumber: number;
      createdAt: string;
    };
  }) => void;
};

function getDataConnectionLabel(input: {
  enabled: boolean;
  previewOpen: boolean;
  hasLiveContent: boolean;
  connected: boolean;
  loadError: string | null;
}): string {
  if (!input.enabled) {
    return "Data Disconnected";
  }
  if (input.loadError) {
    return "Connection Error";
  }
  if (input.previewOpen) {
    return input.hasLiveContent || input.connected ? "Data Connected" : "Connecting…";
  }
  return input.hasLiveContent || input.connected ? "Data Connected" : "Data Disconnected";
}

export function BroadArrowTypedDisplayCard({
  projectSlug,
  projectId,
  rendererKey,
  display,
  refreshRateMs: initialRefreshRateMs = 5000,
  displayWidth: initialDisplayWidth = 1920,
  displayHeight: initialDisplayHeight = 1080,
  canDeveloperTools = false,
  activeVersionNumber = null,
  activeVersionCreatedAt = null,
  onArchived,
  onDeleted,
  onDuplicated,
}: BroadArrowTypedDisplayCardProps) {
  const initialSize = normalizeDisplaySize(initialDisplayWidth, initialDisplayHeight);
  const outputUrl =
    typeof window !== "undefined"
      ? buildProjectDisplayOutputPath(projectId, display.slug, {
          origin: window.location.origin,
        })
      : buildProjectDisplayOutputPath(projectId, display.slug);

  const [enabled, setEnabled] = useState(display.enabled);
  const [displayWidth, setDisplayWidth] = useState(initialSize.displayWidth);
  const [displayHeight, setDisplayHeight] = useState(initialSize.displayHeight);
  const [saving, setSaving] = useState(false);
  const [displaySizeSaving, setDisplaySizeSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const { isExpanded, setExpanded } = useDisplayInlinePreview();
  const previewOpen = isExpanded(projectId, display.id);
  const hasActiveRevision = activeVersionNumber !== null && activeVersionNumber > 0;
  const { hasLiveContent, connected, loadError } = useBroadArrowDisplayData(projectId);
  const onlineViewer = useOnlineViewerSettings(projectSlug, display.id, canDeveloperTools, enabled);

  useEffect(() => {
    setEnabled(display.enabled);
  }, [display.enabled]);

  useEffect(() => {
    const nextSize = normalizeDisplaySize(initialDisplayWidth, initialDisplayHeight);
    setDisplayWidth(nextSize.displayWidth);
    setDisplayHeight(nextSize.displayHeight);
  }, [initialDisplayWidth, initialDisplayHeight]);

  useEffect(() => {
    if (!shouldUseLocalDataClient() || enabled) return;
    notifyDisplayConnectionChanged(display.id, false);
    requestDisplayViewerReload(display.id);
  }, [display.id, enabled]);

  async function handleEnabledChange(nextEnabled: boolean) {
    const previousEnabled = enabled;
    setEnabled(nextEnabled);
    setErrorMessage(null);
    notifyDisplayConnectionChanged(display.id, nextEnabled);

    if (!nextEnabled && shouldUseLocalDataClient()) {
      requestPinnedViewerUnpin(display.id);
      const desktop = getDesktopAPI();
      if (desktop?.displays?.closePreview) {
        void desktop.displays.closePreview({
          projectId,
          displayId: display.id,
        });
      }
    }

    if (!shouldUseLocalDataClient()) return;

    setSaving(true);
    try {
      const result = await localSetDeveloperDisplayEnabled(
        projectSlug,
        display.id,
        nextEnabled,
      );
      setEnabled(result.display.enabled);
      notifyDisplayConnectionChanged(display.id, result.display.enabled);
      if (!result.display.enabled && shouldUseLocalDataClient()) {
        await localUnpinDisplayIfPinned(projectSlug, projectId, display.id);
        requestPinnedViewerRefresh();
      }
    } catch (error) {
      setEnabled(previousEnabled);
      notifyDisplayConnectionChanged(display.id, previousEnabled);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update display state.",
      );
      requestPinnedViewerRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDisplaySizeChange(nextWidth: number, nextHeight: number) {
    const previousWidth = displayWidth;
    const previousHeight = displayHeight;
    setDisplayWidth(nextWidth);
    setDisplayHeight(nextHeight);
    setErrorMessage(null);
    if (!shouldUseLocalDataClient()) return;

    setDisplaySizeSaving(true);
    try {
      const result = await localSetDisplaySize(projectSlug, display.id, nextWidth, nextHeight);
      setDisplayWidth(result.displayWidth);
      setDisplayHeight(result.displayHeight);
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
    try {
      await navigator.clipboard.writeText(outputUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  function handleViewFullscreen() {
    if (typeof window === "undefined") return;
    const outputTargetUrl = outputUrl;
    const browserFullscreenUrl = buildDisplayWindowFitPath({
      targetUrl: outputTargetUrl,
      displayWidth,
      displayHeight,
      origin: window.location.origin,
    });

    if (shouldUseLocalDataClient()) {
      const desktop = getDesktopAPI();
      if (desktop?.displays?.openPreview) {
        void desktop.displays.openPreview({
          projectId,
          displayId: display.id,
          title: display.name,
          viewerUrl: outputTargetUrl,
          displayWidth,
          displayHeight,
        });
        return;
      }
    }

    window.open(browserFullscreenUrl, "_blank", "noopener,noreferrer");
  }

  const dataConnectionLabel = getDataConnectionLabel({
    enabled,
    previewOpen,
    hasLiveContent,
    connected,
    loadError,
  });

  const copyLabel =
    copyState === "copied"
      ? "Copied"
      : copyState === "error"
        ? "Copy failed"
        : "Copy Local URL";

  const pinnedViewerSummary = buildPinnedViewerDisplaySummary({
    id: display.id,
    name: display.name,
    displayKey: display.displayKey,
    url: outputUrl,
    width: displayWidth,
    height: displayHeight,
    settings: { rendererKey },
  });

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">{display.name}</h4>
              <div className="flex items-center gap-1">
                <DisplayVersionBadge
                  versionNumber={activeVersionNumber}
                  createdAt={activeVersionCreatedAt}
                />
                {enabled ? (
                  <DisplayPinButton
                    displayId={display.id}
                    enabled={enabled}
                    archived={display.archived}
                    displaySummary={pinnedViewerSummary}
                  />
                ) : null}
              </div>
              <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                TypeScript
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {display.description ?? "Broad Arrow TypeScript display"}
            </p>
            <p className="mt-1 text-xs text-muted">{dataConnectionLabel}</p>
            <p className="mt-1 text-xs text-muted">
              {displayWidth} × {displayHeight} · transparent · renderer {rendererKey}
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
              <DisplayCardControlRow
                label="Online Viewer"
                hint={getOnlineViewerVisibilityHint(onlineViewer)}
              >
                <OnlineViewerToggle
                  canManage={canDeveloperTools}
                  displayEnabled={enabled}
                  displayName={display.name}
                  onlineViewer={onlineViewer}
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
                  disabled={!hasActiveRevision}
                  title={
                    !hasActiveRevision
                      ? "Publish HTML before opening fullscreen preview."
                      : undefined
                  }
                  onClick={handleViewFullscreen}
                >
                  View Fullscreen
                </Button>
                <ViewOnlineButton
                  projectSlug={projectSlug}
                  displaySlug={display.slug}
                  displayEnabled={enabled}
                  enabled={onlineViewer.enabled}
                  visibility={onlineViewer.visibility}
                  loading={onlineViewer.loading}
                />
                {canDeveloperTools ? (
                  <DisplayEditMenu
                    projectSlug={projectSlug}
                    display={display}
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
            onOpenChange={(open) => setExpanded(projectId, display.id, open)}
          >
            {previewOpen ? (
              <BroadArrowTypedDisplayPreview
                projectId={projectId}
                rendererKey={rendererKey}
                displayWidth={displayWidth}
                displayHeight={displayHeight}
                enabled={enabled}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-md border border-border bg-background/70 text-sm font-medium text-muted">
                Open preview to load display
              </div>
            )}
          </DisclosureSection>
        </NoDrag>

        {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}
      </div>
    </Card>
  );
}
