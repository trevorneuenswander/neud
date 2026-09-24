"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_DISPLAY_HEIGHT,
  DEFAULT_DISPLAY_WIDTH,
} from "@/lib/displays/display-size";
import { MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE } from "@/lib/displays/display-preview-checkerboard-style";

export type BroadArrowDisplayCanvasProps = {
  displayWidth?: number;
  displayHeight?: number;
  label?: string;
  showSizeLabel?: boolean;
  graphicOnly?: boolean;
  children: ReactNode;
};

export function BroadArrowDisplayCanvas({
  displayWidth = DEFAULT_DISPLAY_WIDTH,
  displayHeight = DEFAULT_DISPLAY_HEIGHT,
  label,
  showSizeLabel = true,
  graphicOnly = false,
  children,
}: BroadArrowDisplayCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateScale = () => {
      const widthScale = node.clientWidth / displayWidth;
      const heightScale = node.clientHeight / displayHeight;
      setScale(Math.min(widthScale, heightScale, 1));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, [displayHeight, displayWidth]);

  const scaledWidth = displayWidth * scale;
  const scaledHeight = displayHeight * scale;
  const sizeLabel = label ?? `Preview · ${displayWidth}×${displayHeight}`;
  const pinnedNativeStage = graphicOnly;

  return (
    <div className={showSizeLabel ? "space-y-2" : "min-w-0 max-w-full"}>
      {showSizeLabel ? (
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{sizeLabel}</p>
      ) : null}
      <div
        ref={containerRef}
        data-pinned-display-window={graphicOnly ? "" : undefined}
        className={
          graphicOnly
            ? "relative max-h-full max-w-full overflow-hidden"
            : "relative max-h-full max-w-full overflow-hidden rounded-md border border-border"
        }
        style={{
          aspectRatio: `${displayWidth} / ${displayHeight}`,
          ...MANAGEMENT_PREVIEW_CHECKERBOARD_STYLE,
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 overflow-hidden"
          style={{
            width: scaledWidth,
            height: scaledHeight,
            transform: "translate(-50%, -50%)",
            background: "transparent",
            backgroundColor: "transparent",
          }}
        >
          <div
            style={{
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              background: graphicOnly ? "transparent" : undefined,
              ...(pinnedNativeStage ? { willChange: "transform" } : {}),
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
