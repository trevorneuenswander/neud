"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DisclosureSection } from "@/components/ui/DisclosureSection";
import { NoDrag } from "@/components/displays/NoDrag";
import { HostedDisplayViewerClient } from "@/components/hosted/HostedDisplayViewerClient";
import {
  buildAbsoluteHostedFullscreenViewerUrl,
  buildHostedFullscreenViewerPath,
} from "@/lib/hosted/viewer-url";
import { useHostedPortalOrigin } from "@/lib/hosted/use-hosted-portal-origin";
import { useHostedDisplayBundleStatus } from "@/lib/hosted/use-hosted-display-bundle-status";
import {
  resolveHostedDisplayStatus,
  type HostedDisplayStatusInput,
} from "@/lib/hosted/hosted-display-connection-status";
import {
  toHostedDisplayStatusInput,
  type HostedDisplayCardDisplay,
} from "@/lib/hosted/hosted-display-snapshot";

export type { HostedDisplayCardDisplay };
import { formatDisplayRefreshRateLabel } from "@/lib/displays/refresh-rate";
import {
  formatHostedAbsoluteTimestamp,
  formatHostedRelativeTimestamp,
} from "@/lib/hosted/format-hosted-timestamp";

type HostedDisplayCardProps = {
  projectSlug: string;
  display: HostedDisplayCardDisplay;
  previewPaused?: boolean;
};

function connectivityBadgeClassName(tone: "success" | "danger" | "muted"): string {
  if (tone === "success") {
    return "border-success/30 bg-success/10 text-success";
  }
  if (tone === "danger") {
    return "border-danger/30 bg-danger/10 text-danger";
  }
  return "border-border bg-surface-raised text-muted";
}

function visibilityBadgeClassName(visibility: "private" | "public"): string {
  return visibility === "public"
    ? "border-primary/30 bg-primary/10 text-primary"
    : "border-border bg-surface-raised text-muted";
}

function toStatusInput(display: HostedDisplayCardDisplay): HostedDisplayStatusInput {
  return toHostedDisplayStatusInput(display, {
    authorized: true,
    portalSessionPresent: true,
  });
}

export function HostedDisplayCard({
  projectSlug,
  display,
  previewPaused = false,
}: HostedDisplayCardProps) {
  const hostedPortalOrigin = useHostedPortalOrigin();
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const statusInput = useMemo(() => toStatusInput(display), [display]);
  const visibility = display.online_visibility;
  const publishedViewerEligible = Boolean(display.online_published_revision_id);
  const fullscreenPath = publishedViewerEligible
    ? buildHostedFullscreenViewerPath(projectSlug, display.slug, visibility)
    : null;

  const shouldPollBundle =
    display.enabled && publishedViewerEligible && !previewPaused;

  const liveStatus = useHostedDisplayBundleStatus({
    projectSlug,
    displaySlug: display.slug,
    mode: visibility,
    refreshRateMs: display.refresh_rate_ms,
    enabled: shouldPollBundle,
    display: statusInput,
  });

  const resolvedStatus = useMemo(
    () =>
      resolveHostedDisplayStatus({
        ...statusInput,
        publisherOnline: liveStatus.publisherOnline,
        viewerRpcCode: liveStatus.viewerRpcCode,
        htmlPresent: liveStatus.htmlPresent,
      }),
    [liveStatus.htmlPresent, liveStatus.publisherOnline, liveStatus.viewerRpcCode, statusInput],
  );

  const canOpenFullscreen =
    publishedViewerEligible &&
    display.enabled &&
    display.online_viewer_enabled &&
    (resolvedStatus.portalConnected || resolvedStatus.canOpenViewer);

  const copyOutputUrl = useCallback(async () => {
    if (!fullscreenPath || !resolvedStatus.canCopyUrl) {
      return;
    }
    setCopyStatus(null);
    try {
      const absoluteUrl =
        buildAbsoluteHostedFullscreenViewerUrl(
          projectSlug,
          display.slug,
          visibility,
          hostedPortalOrigin.origin,
        ) ?? fullscreenPath;
      await navigator.clipboard.writeText(absoluteUrl);
      setCopyStatus("URL copied");
    } catch {
      setCopyStatus("Unable to copy URL");
    }
  }, [
    display.slug,
    fullscreenPath,
    hostedPortalOrigin.origin,
    projectSlug,
    resolvedStatus.canCopyUrl,
    visibility,
  ]);

  const sizeLabel =
    display.display_width && display.display_height
      ? `${display.display_width} × ${display.display_height}`
      : "Size unavailable";
  const refreshLabel = formatDisplayRefreshRateLabel(display.refresh_rate_ms ?? 5000);
  const publishedRelative = formatHostedRelativeTimestamp(display.online_published_at);
  const publishedAbsolute = formatHostedAbsoluteTimestamp(display.online_published_at);

  const runtimeHelperText =
    liveStatus.refreshIssue
      ? liveStatus.detail ?? resolvedStatus.helperText
      : resolvedStatus.connectionStatus === "connected" && liveStatus.detail
        ? liveStatus.detail
        : resolvedStatus.helperText ?? liveStatus.detail;

  return (
    <Card className="space-y-4 p-5">
      <div className="min-w-0 space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{display.name}</h2>
        {display.description ? (
          <p className="text-sm text-muted">{display.description}</p>
        ) : null}
        <p className="text-xs text-muted">
          {sizeLabel} · {refreshLabel}
          {publishedAbsolute ? (
            <>
              {" "}
              · Published{" "}
              <span title={publishedAbsolute}>{publishedRelative}</span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <NoDrag className="flex flex-wrap items-center gap-2">
          {copyStatus ? <span className="text-xs text-muted">{copyStatus}</span> : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!resolvedStatus.canCopyUrl}
            onClick={() => void copyOutputUrl()}
          >
            Copy URL
          </Button>
          {fullscreenPath && canOpenFullscreen ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              href={fullscreenPath}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Fullscreen
            </Button>
          ) : (
            <Button type="button" variant="primary" size="sm" disabled>
              View Fullscreen
            </Button>
          )}
        </NoDrag>

        <div className="ml-auto flex min-w-[10rem] shrink-0 flex-col items-end gap-1 text-right">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${connectivityBadgeClassName(
                resolvedStatus.connectivityTone,
              )}`}
            >
              {resolvedStatus.connectivityLabel}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${visibilityBadgeClassName(
                visibility,
              )}`}
            >
              {visibility === "public" ? "Public" : "Private"}
            </span>
          </div>
          {runtimeHelperText ? (
            <p className="max-w-xs text-xs leading-snug text-muted">{runtimeHelperText}</p>
          ) : null}
        </div>
      </div>

      <NoDrag>
        <DisclosureSection
          title="Preview"
          lazyMount
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        >
          {previewOpen && !previewPaused ? (
            resolvedStatus.canOpenViewer ? (
              <HostedDisplayViewerClient
                projectSlug={projectSlug}
                displaySlug={display.slug}
                mode={visibility}
                viewerMode="portal-preview"
                embedded
                displaySnapshot={display}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-md border border-border bg-background/70 px-4 text-center text-sm text-muted">
                {runtimeHelperText ?? "Live preview unavailable for this display."}
              </div>
            )
          ) : previewPaused ? (
            <div className="flex aspect-video items-center justify-center rounded-md border border-border bg-background/70 text-sm text-muted">
              Preview paused while reordering
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-md border border-border bg-background/70 text-sm text-muted">
              Open preview to load live display
            </div>
          )}
        </DisclosureSection>
      </NoDrag>
    </Card>
  );
}
