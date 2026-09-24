"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DISPLAY_GRAPHIC_OUTPUT_BACKGROUND } from "@/lib/displays/display-graphic-output-shell";
import { buildDisplayViewerMeasurements } from "@/lib/displays/display-viewer-measurements";

type DisplayViewerScaledCanvasProps = {
  displayWidth: number;
  displayHeight: number;
  backgroundColor?: string;
  children: ReactNode;
  className?: string;
  /** Dev viewport overlay (top-left). Off for pinned/graphic-only viewers. */
  showViewportDiagnostics?: boolean;
  /** Scale up to fill viewport (fullscreen window-fit). Default caps at native 1:1. */
  allowUpscale?: boolean;
};

export function DisplayViewerScaledCanvas({
  displayWidth,
  displayHeight,
  backgroundColor = DISPLAY_GRAPHIC_OUTPUT_BACKGROUND,
  children,
  className,
  showViewportDiagnostics,
  allowUpscale = false,
}: DisplayViewerScaledCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const updateScale = () => {
      const viewportWidth = node.clientWidth;
      const viewportHeight = node.clientHeight;
      setViewportSize({ width: viewportWidth, height: viewportHeight });
      const measurements = buildDisplayViewerMeasurements({
        viewportWidth,
        viewportHeight,
        displayWidth,
        displayHeight,
        allowUpscale,
      });
      setScale(measurements.scale);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, [allowUpscale, displayHeight, displayWidth]);

  const measurements = buildDisplayViewerMeasurements({
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
    displayWidth,
    displayHeight,
    allowUpscale,
  });
  const { scaledWidth, scaledHeight } = measurements;
  const showDiagnostics =
    showViewportDiagnostics ??
    (process.env.NODE_ENV === "development" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("displayViewerDebug") === "1");

  return (
    <div
      ref={viewportRef}
      className={className ?? "display-viewer-viewport"}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: backgroundColor,
        position: "relative",
      }}
    >
      {showDiagnostics ? (
        <div
          className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-black/70 px-2 py-1 font-mono text-[10px] leading-relaxed text-white"
          aria-hidden
        >
          Viewport: {measurements.viewportWidth}×{measurements.viewportHeight}
          <br />
          Display Size: {measurements.displayWidth}×{measurements.displayHeight}
          <br />
          Scale: {measurements.scale.toFixed(4)}
          <br />
          Rendered Display Bounds: {measurements.displayWidth}×{measurements.displayHeight}
          <br />
          On-Screen Bounds: {measurements.scaledWidth.toFixed(1)}×
          {measurements.scaledHeight.toFixed(1)}
        </div>
      ) : null}
      <div
        className="display-viewer-scaled-bounds"
        style={{
          width: scaledWidth,
          height: scaledHeight,
          position: "relative",
          flex: "0 0 auto",
          background: DISPLAY_GRAPHIC_OUTPUT_BACKGROUND,
        }}
      >
        <div
          className="display-viewer-canvas"
          style={{
            width: displayWidth,
            height: displayHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            inset: "0 auto auto 0",
            background: DISPLAY_GRAPHIC_OUTPUT_BACKGROUND,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
