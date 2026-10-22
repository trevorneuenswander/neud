"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DisplayCanvasPreview } from "@/components/displays/DisplayCanvasPreview";
import { BroadArrowTypedDisplayPreview } from "@/components/displays/broad-arrow/BroadArrowTypedDisplayPreview";
import { VideoPlaybackControls } from "@/components/displays/VideoPlaybackControls";
import {
  isPinnedProjectVideoDisplay,
  type PinnedViewerDisplaySummary,
} from "@/lib/local/pinned-viewer-api";
import { resolvePinnedViewerUrl } from "@/lib/displays/resolve-pinned-viewer-url";
import { resolveRendererKey } from "@/lib/displays/broad-arrow/resolve-renderer-key";
import { isBroadArrowRendererKey } from "@/lib/displays/broad-arrow/renderer-keys";
import {
  capturePinnedViewerLayoutSnapshot,
  computePinnedPreviewMaxWidth,
  logPinnedViewerLayoutSnapshot,
} from "@/lib/displays/pinned-viewer-layout-diagnostics";
type PinnedDisplayLiveSlotProps = {
  projectId: string;
  display: PinnedViewerDisplaySummary;
  configuredBandHeightPx: number;
  stackLayer?: boolean;
  stackPreviewMaxWidthPx?: number;
  onContextMenu?: (event: React.MouseEvent) => void;
};

/** Fixed title-row budget — must match HTML and video pins for bottom alignment. */
const NAME_ROW_PX = 18;

export function PinnedDisplayLiveSlot({
  projectId,
  display,
  configuredBandHeightPx,
  stackLayer = false,
  stackPreviewMaxWidthPx = 0,
  onContextMenu,
}: PinnedDisplayLiveSlotProps) {
  const stackOmitsCheckerboard = stackLayer;
  const rendererKey = resolveRendererKey(display.displayKey, display.settings);
  const useBroadArrowCanvas =
    rendererKey != null && isBroadArrowRendererKey(rendererKey);

  const viewerUrl = resolvePinnedViewerUrl({
    displayKey: display.displayKey,
    url: display.url,
  });

  const slotRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const [previewMaxWidthPx, setPreviewMaxWidthPx] = useState(0);
  const loggedRef = useRef(false);

  useLayoutEffect(() => {
    if (stackLayer) return;
    const region = regionRef.current;
    if (!region) return;

    const updateBounds = () => {
      const regionRect = region.getBoundingClientRect();
      const maxWidth = computePinnedPreviewMaxWidth({
        regionWidth: regionRect.width,
        regionHeight: Math.max(0, regionRect.height - NAME_ROW_PX),
        displayWidth: display.width,
        displayHeight: display.height,
      });
      setPreviewMaxWidthPx(maxWidth);
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(region);
    if (slotRef.current) {
      observer.observe(slotRef.current);
    }
    return () => observer.disconnect();
  }, [configuredBandHeightPx, display.height, display.width, stackLayer]);

  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    const snapshot = capturePinnedViewerLayoutSnapshot(configuredBandHeightPx);
    logPinnedViewerLayoutSnapshot(snapshot);
  }, [configuredBandHeightPx]);

  const isStreamTicker =
    display.displayKey === "new-ticker-v1" || display.displayKey === "lower-ticker-v5";

  const previewNode =
    useBroadArrowCanvas && rendererKey ? (
      <BroadArrowTypedDisplayPreview
        projectId={projectId}
        rendererKey={rendererKey}
        displayWidth={display.width}
        displayHeight={display.height}
        enabled
        showSizeLabel={false}
        graphicOnly
        managementCheckerboard={stackOmitsCheckerboard ? false : undefined}
      />
    ) : (
      <DisplayCanvasPreview
        title={display.name}
        viewerUrl={viewerUrl}
        displayWidth={display.width}
        displayHeight={display.height}
        displayId={display.id}
        previewOpen
        iframePointerEvents="none"
        enableStreamTickerLayoutRefresh={isStreamTicker}
        showSizeLabel={false}
        graphicOnly
        previewScaleMode={isStreamTicker ? "layout" : "transform"}
        managementCheckerboard={stackOmitsCheckerboard ? false : undefined}
      />
    );

  if (stackLayer) {
    return (
      <div className="relative flex h-full w-full items-start justify-center overflow-hidden" style={{ pointerEvents: "none" }}>
        <div
          className="relative h-full min-h-0 max-h-full min-w-0 overflow-hidden bg-transparent"
          style={{
            width: stackPreviewMaxWidthPx > 0 ? stackPreviewMaxWidthPx : "100%",
            maxWidth: "100%",
            pointerEvents: "none",
          }}
        >
          {previewNode}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={slotRef}
      data-pinned-slot=""
      className="relative flex h-full min-h-0 min-w-0 max-w-full max-h-full flex-col items-center overflow-hidden"
      onContextMenu={onContextMenu}
    >
      <div
        ref={regionRef}
        data-pinned-preview-region=""
        className="relative flex min-h-0 w-full min-w-0 max-w-full flex-1 items-start justify-center overflow-hidden bg-surface"
      >
        <div
          data-pinned-display-card=""
          className="flex max-h-full min-h-0 min-w-0 flex-col items-center"
          style={{
            width: previewMaxWidthPx > 0 ? previewMaxWidthPx : "100%",
            maxWidth: "100%",
          }}
        >
          <div
            data-pinned-preview-wrapper=""
            className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-transparent"
            style={{
              pointerEvents: "none",
              aspectRatio: `${display.width} / ${display.height}`,
              maxHeight: `calc(100% - ${NAME_ROW_PX}px)`,
            }}
          >
            {previewNode}
          </div>
          <div
            data-pinned-display-title-row=""
            className="mt-0.5 box-border flex h-[18px] max-h-[18px] w-full shrink-0 items-center gap-1.5 overflow-hidden px-0.5"
            style={{ height: NAME_ROW_PX, maxHeight: NAME_ROW_PX }}
          >
            <p
              data-pinned-display-title=""
              className="min-w-0 truncate text-left text-[10px] font-medium leading-none text-foreground"
            >
              {display.name}
            </p>
            <span className="min-w-1 flex-1" aria-hidden="true" />
            {isPinnedProjectVideoDisplay(display) ? (
              <div className="flex h-full shrink-0 items-center" data-pinned-video-controls="">
                <VideoPlaybackControls
                  displayId={display.id}
                  canControl
                  variant="pinned"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
