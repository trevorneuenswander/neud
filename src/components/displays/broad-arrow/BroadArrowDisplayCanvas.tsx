"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_DISPLAY_HEIGHT,
  DEFAULT_DISPLAY_WIDTH,
} from "@/lib/displays/display-size";

export type BroadArrowDisplayCanvasProps = {
  displayWidth?: number;
  displayHeight?: number;
  label?: string;
  children: ReactNode;
};

export function BroadArrowDisplayCanvas({
  displayWidth = DEFAULT_DISPLAY_WIDTH,
  displayHeight = DEFAULT_DISPLAY_HEIGHT,
  label,
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

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{sizeLabel}</p>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-md border border-border"
        style={{
          aspectRatio: `${displayWidth} / ${displayHeight}`,
          backgroundColor: "#d9d9d9",
          backgroundImage:
            "linear-gradient(45deg, #cfcfcf 25%, transparent 25%), linear-gradient(-45deg, #cfcfcf 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cfcfcf 75%), linear-gradient(-45deg, transparent 75%, #cfcfcf 75%)",
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 overflow-hidden"
          style={{
            width: scaledWidth,
            height: scaledHeight,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            style={{
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
