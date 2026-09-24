"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DisplayCanvasPreview } from "@/components/displays/DisplayCanvasPreview";
import { BroadArrowTypedDisplayPreview } from "@/components/displays/broad-arrow/BroadArrowTypedDisplayPreview";
import type { PinnedViewerDisplaySummary } from "@/lib/local/pinned-viewer-api";
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
};

const NAME_ROW_PX = 18;

export function PinnedDisplayLiveSlot({
  projectId,
  display,
  configuredBandHeightPx,
}: PinnedDisplayLiveSlotProps) {
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
    const region = regionRef.current;
    if (!region) return;

    const updateBounds = () => {
      const regionRect = region.getBoundingClientRect();
      const maxWidth = computePinnedPreviewMaxWidth({
        regionWidth: regionRect.width,
        regionHeight: Math.max(0, regionRect.height),
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
  }, [configuredBandHeightPx, display.height, display.width]);

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
      />
    );

  return (
    <div
      ref={slotRef}
      data-pinned-slot=""
      className="relative flex h-full min-h-0 min-w-0 max-w-full max-h-full flex-col items-center overflow-hidden"
    >
      <div
        ref={regionRef}
        data-pinned-preview-region=""
        className="relative flex min-h-0 w-full min-w-0 max-w-full flex-1 items-start justify-center overflow-hidden bg-surface"
        style={{ maxHeight: `calc(100% - ${NAME_ROW_PX}px)` }}
      >
        <div
          data-pinned-preview-wrapper=""
          className="relative min-h-0 max-h-full min-w-0 overflow-hidden bg-transparent"
          style={{
            width: previewMaxWidthPx > 0 ? previewMaxWidthPx : "100%",
            maxWidth: "100%",
            pointerEvents: "none",
          }}
        >
          {previewNode}
        </div>
      </div>
      <p className="mt-0.5 w-full shrink-0 truncate px-0.5 pb-0.5 text-center text-[10px] font-medium leading-tight text-foreground">
        {display.name}
      </p>
    </div>
  );
}
