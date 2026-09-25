"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { PinnedDisplayLiveSlot } from "@/components/displays/PinnedDisplayLiveSlot";
import type { PinnedViewerDisplaySummary } from "@/lib/local/pinned-viewer-api";
import type { VisiblePinnedStackSlot } from "@/lib/displays/pinned-viewer-stacks";
import { layerZIndexForDisplayInStack } from "@/lib/displays/pinned-viewer-stacks";
import { MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE } from "@/lib/displays/display-preview-checkerboard-style";
import { computePinnedPreviewMaxWidth } from "@/lib/displays/pinned-viewer-layout-diagnostics";

const NAME_ROW_PX = 18;

type PinnedDisplayStackSlotProps = {
  projectId: string;
  slot: VisiblePinnedStackSlot;
  displaysById: Map<string, PinnedViewerDisplaySummary>;
  configuredBandHeightPx: number;
  onContextMenu: (event: React.MouseEvent) => void;
};

export function PinnedDisplayStackSlot({
  projectId,
  slot,
  displaysById,
  configuredBandHeightPx,
  onContextMenu,
}: PinnedDisplayStackSlotProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const [previewMaxWidthPx, setPreviewMaxWidthPx] = useState(0);

  const baseDisplay = displaysById.get(slot.baseDisplayId);
  const aspectDisplay = baseDisplay ?? displaysById.get(slot.orderedMemberDisplayIds[0] ?? "");
  const orderedDisplays = useMemo(
    () =>
      slot.orderedMemberDisplayIds
        .map((id) => displaysById.get(id))
        .filter((display): display is PinnedViewerDisplaySummary => Boolean(display)),
    [displaysById, slot.orderedMemberDisplayIds],
  );

  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region || !aspectDisplay) return;
    const updateBounds = () => {
      const regionRect = region.getBoundingClientRect();
      const maxWidth = computePinnedPreviewMaxWidth({
        regionWidth: regionRect.width,
        regionHeight: Math.max(0, regionRect.height),
        displayWidth: aspectDisplay.width,
        displayHeight: aspectDisplay.height,
      });
      setPreviewMaxWidthPx(maxWidth);
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(region);
    if (slotRef.current) observer.observe(slotRef.current);
    return () => observer.disconnect();
  }, [aspectDisplay, configuredBandHeightPx]);

  const label =
    orderedDisplays.length <= 1
      ? (orderedDisplays[0]?.name ?? "Stack")
      : `Stack · ${orderedDisplays.length} displays`;

  return (
    <div
      ref={slotRef}
      data-pinned-stack-slot=""
      className="relative flex h-full min-h-0 min-w-0 max-w-full max-h-full flex-col items-center overflow-hidden"
      onContextMenu={onContextMenu}
    >
      <div
        ref={regionRef}
        data-pinned-preview-region=""
        className="relative flex min-h-0 w-full min-w-0 max-w-full flex-1 items-start justify-center overflow-hidden bg-transparent"
        style={{ maxHeight: `calc(100% - ${NAME_ROW_PX}px)` }}
      >
        <div
          data-pinned-preview-wrapper=""
          data-pinned-stack-window=""
          className="relative min-h-0 max-h-full min-w-0 overflow-hidden"
          style={{
            width: previewMaxWidthPx > 0 ? previewMaxWidthPx : "100%",
            maxWidth: "100%",
            ...(aspectDisplay
              ? { aspectRatio: `${aspectDisplay.width} / ${aspectDisplay.height}` }
              : {}),
            ...MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE,
          }}
        >
          {orderedDisplays.map((display) => (
            <div
              key={display.id}
              className="absolute inset-0"
              style={{
                zIndex: layerZIndexForDisplayInStack(display.id, slot.orderedMemberDisplayIds),
                pointerEvents: "none",
              }}
            >
              <PinnedDisplayLiveSlot
                projectId={projectId}
                display={display}
                configuredBandHeightPx={configuredBandHeightPx}
                stackLayer
                stackPreviewMaxWidthPx={previewMaxWidthPx}
              />
            </div>
          ))}
        </div>
      </div>
      <p className="mt-0.5 w-full shrink-0 truncate px-0.5 pb-0.5 text-center text-[10px] font-medium leading-tight text-foreground">
        {label}
      </p>
    </div>
  );
}
