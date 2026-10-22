"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DISPLAY_GRAPHIC_OUTPUT_BACKGROUND } from "@/lib/displays/display-graphic-output-shell";
import {
  buildDisplayViewerMeasurements,
  type DisplayViewerFillMode,
} from "@/lib/displays/display-viewer-measurements";

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
  /**
   * When true, scale with Chromium CSS `zoom` so fonts rasterize at the final
   * output size. Default `transform: scale` is used for Preview / computer-display
   * (geometry-only compositor scale) and must stay unchanged for those surfaces.
   * Ignored when fillMode is "stretch" (non-uniform scale requires transform).
   */
  paintScaleWithZoom?: boolean;
  /** contain = letterbox; stretch = edge-to-edge program fill. */
  fillMode?: DisplayViewerFillMode;
};

export function DisplayViewerScaledCanvas({
  displayWidth,
  displayHeight,
  backgroundColor = DISPLAY_GRAPHIC_OUTPUT_BACKGROUND,
  children,
  className,
  showViewportDiagnostics,
  allowUpscale = false,
  paintScaleWithZoom = false,
  fillMode = "contain",
}: DisplayViewerScaledCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const updateScale = () => {
      const viewportWidth = node.clientWidth;
      const viewportHeight = node.clientHeight;
      const measurements = buildDisplayViewerMeasurements({
        viewportWidth,
        viewportHeight,
        displayWidth,
        displayHeight,
        allowUpscale,
        fillMode,
      });
      setViewportSize((prev) =>
        prev.width === viewportWidth && prev.height === viewportHeight
          ? prev
          : { width: viewportWidth, height: viewportHeight },
      );
      setScaleX((prev) => (prev === measurements.scaleX ? prev : measurements.scaleX));
      setScaleY((prev) => (prev === measurements.scaleY ? prev : measurements.scaleY));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, [allowUpscale, displayHeight, displayWidth, fillMode]);

  const measurements = buildDisplayViewerMeasurements({
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
    displayWidth,
    displayHeight,
    allowUpscale,
    fillMode,
  });
  const { scaledWidth, scaledHeight } = measurements;
  const showDiagnostics =
    showViewportDiagnostics ??
    (process.env.NODE_ENV === "development" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("displayViewerDebug") === "1");

  const useZoom = paintScaleWithZoom && fillMode !== "stretch" && scaleX === scaleY;
  const canvasTransform = useZoom
    ? { zoom: scaleX }
    : {
        transform: `scale(${scaleX}, ${scaleY})`,
        transformOrigin: "top left" as const,
      };

  return (
    <div
      ref={viewportRef}
      className={className ?? "display-viewer-viewport"}
      data-display-viewer-fill={fillMode}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        display: "flex",
        alignItems: fillMode === "stretch" ? "stretch" : "center",
        justifyContent: fillMode === "stretch" ? "stretch" : "center",
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
          Scale: {measurements.scaleX.toFixed(4)}×{measurements.scaleY.toFixed(4)}
          <br />
          Fill: {fillMode}
        </div>
      ) : null}
      <div
        className="display-viewer-scaled-bounds"
        style={{
          width: scaledWidth || "100%",
          height: scaledHeight || "100%",
          position: "relative",
          flex: fillMode === "stretch" ? "1 1 auto" : "0 0 auto",
          background: backgroundColor,
          overflow: "hidden",
        }}
      >
        <div
          className="display-viewer-canvas"
          style={{
            width: displayWidth,
            height: displayHeight,
            ...canvasTransform,
            position: "absolute",
            inset: "0 auto auto 0",
            background: backgroundColor,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
