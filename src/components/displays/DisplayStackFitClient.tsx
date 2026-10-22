"use client";

import { memo, useEffect, useMemo } from "react";
import { DisplayViewerScaledCanvas } from "@/components/displays/DisplayViewerScaledCanvas";
import { useDisplayWindowFitViewerStyles } from "@/components/displays/useDisplayWindowFitViewerStyles";
import {
  computeStackLayerGeometry,
  type DisplayStackFitLayer,
} from "@/lib/displays/display-stack-fit";

type DisplayStackFitClientProps = {
  projectId: string;
  layers: DisplayStackFitLayer[];
  displayWidth: number;
  displayHeight: number;
  /** Target output raster (monitor or DeckLink mode). */
  outputWidth?: number | null;
  outputHeight?: number | null;
  surface?: "preview" | "computer" | "decklink";
  hideCursor?: boolean;
};

type StackLayerIframeProps = {
  projectId: string;
  origin: string;
  layer: DisplayStackFitLayer;
  computerOutput: boolean;
  hideCursor: boolean;
  /** Stack / output raster size — every layer fills this. */
  canvasWidth: number;
  canvasHeight: number;
  /** Fallback authored size when layer omits width/height. */
  fallbackLayerWidth: number;
  fallbackLayerHeight: number;
  fillMode: "stretch" | "contain";
};

/**
 * Final-output-sized absolute wrapper → authored display stage → scale to wrapper.
 * Authored 1920×1080 describes INTERNAL coordinates, not placement in the Stack.
 */
const StackLayerIframe = memo(function StackLayerIframe({
  projectId,
  origin,
  layer,
  computerOutput,
  hideCursor,
  canvasWidth,
  canvasHeight,
  fallbackLayerWidth,
  fallbackLayerHeight,
  fillMode,
}: StackLayerIframeProps) {
  const layerWidth = layer.width && layer.width > 0 ? layer.width : fallbackLayerWidth;
  const layerHeight = layer.height && layer.height > 0 ? layer.height : fallbackLayerHeight;
  const geometry = useMemo(
    () =>
      computeStackLayerGeometry({
        layerWidth,
        layerHeight,
        canvasWidth,
        canvasHeight,
        fillMode,
      }),
    [canvasHeight, canvasWidth, fillMode, layerHeight, layerWidth],
  );

  const src = useMemo(() => {
    const params = new URLSearchParams({ output: "1", stackLayer: "1" });
    if (computerOutput) params.set("surface", "computer");
    if (computerOutput && hideCursor) params.set("hideCursor", "1");
    // Layer HTML stays at authored size; outer stage transform fills the Stack.
    params.set("authoredWidth", String(layerWidth));
    params.set("authoredHeight", String(layerHeight));
    return `${origin}/api/display-html/${encodeURIComponent(projectId)}/${encodeURIComponent(layer.slug)}?${params.toString()}`;
  }, [
    computerOutput,
    hideCursor,
    layer.slug,
    layerHeight,
    layerWidth,
    origin,
    projectId,
  ]);

  return (
    <div
      data-output-stack-layer-wrap={layer.displayId}
      data-output-stack-z={String(layer.zIndex)}
      data-output-stack-layer-authored={`${layerWidth}x${layerHeight}`}
      data-output-stack-layer-scale={`${geometry.scaleX},${geometry.scaleY}`}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: canvasWidth,
        height: canvasHeight,
        margin: 0,
        padding: 0,
        border: 0,
        zIndex: layer.zIndex,
        overflow: "hidden",
        background: "transparent",
        backgroundColor: "transparent",
        pointerEvents: "none",
      }}
    >
      <div
        data-output-stack-layer-stage={layer.displayId}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: layerWidth,
          height: layerHeight,
          margin: 0,
          padding: 0,
          border: 0,
          transform: `scale(${geometry.scaleX}, ${geometry.scaleY})`,
          transformOrigin: "0 0",
          background: "transparent",
          backgroundColor: "transparent",
        }}
      >
        <iframe
          title={`NEUD stack layer ${layer.displayId}`}
          src={src}
          data-output-stack-layer={layer.displayId}
          data-output-stack-z={String(layer.zIndex)}
          width={layerWidth}
          height={layerHeight}
          style={{
            display: "block",
            width: layerWidth,
            height: layerHeight,
            border: 0,
            margin: 0,
            padding: 0,
            background: "transparent",
            backgroundColor: "transparent",
            cursor: hideCursor ? "none" : undefined,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
});

/**
 * Output compositor for a pinned display stack.
 * One geometry for Preview / Computer Display / DeckLink Fill / Key+Fill.
 */
export function DisplayStackFitClient({
  projectId,
  layers,
  displayWidth,
  displayHeight,
  outputWidth = null,
  outputHeight = null,
  surface = "preview",
  hideCursor = false,
}: DisplayStackFitClientProps) {
  useDisplayWindowFitViewerStyles({ surface, hideCursor });
  const computerOutput = surface === "computer";
  const decklinkOutput = surface === "decklink";
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  const useTargetRaster =
    (computerOutput || decklinkOutput) &&
    typeof outputWidth === "number" &&
    typeof outputHeight === "number" &&
    outputWidth > 0 &&
    outputHeight > 0;

  // Program stack: compose at the selected monitor / DeckLink raster.
  const canvasWidth = useTargetRaster ? (outputWidth as number) : displayWidth;
  const canvasHeight = useTargetRaster ? (outputHeight as number) : displayHeight;
  const programOutput = computerOutput || decklinkOutput;
  const fillMode: "stretch" | "contain" = programOutput ? "stretch" : "contain";

  const orderedLayers = useMemo(
    () => [...layers].sort((a, b) => a.zIndex - b.zIndex),
    [layers],
  );

  // Dev/program instrumentation: record real DOM geometry for stack debugging.
  useEffect(() => {
    if (typeof window === "undefined" || !programOutput) return;
    const probe = () => {
      const root = document.querySelector("[data-output-stack-root]") as HTMLElement | null;
      if (!root) return;
      const wraps = Array.from(
        root.querySelectorAll("[data-output-stack-layer-wrap]"),
      ) as HTMLElement[];
      const report = {
        root: root.getBoundingClientRect().toJSON(),
        canvas: { width: canvasWidth, height: canvasHeight },
        layers: wraps.map((wrap) => {
          const stage = wrap.querySelector(
            "[data-output-stack-layer-stage]",
          ) as HTMLElement | null;
          const iframe = wrap.querySelector("iframe") as HTMLIFrameElement | null;
          const stageStyle = stage ? getComputedStyle(stage) : null;
          return {
            id: wrap.getAttribute("data-output-stack-layer-wrap"),
            wrap: wrap.getBoundingClientRect().toJSON(),
            stage: stage?.getBoundingClientRect().toJSON() ?? null,
            iframe: iframe?.getBoundingClientRect().toJSON() ?? null,
            transform: stageStyle?.transform ?? null,
            zoom: stageStyle?.zoom ?? null,
            position: stageStyle?.position ?? null,
            zIndex: wrap.style.zIndex || getComputedStyle(wrap).zIndex,
          };
        }),
      };
      (
        window as unknown as { __NEUD_STACK_GEOMETRY__?: typeof report }
      ).__NEUD_STACK_GEOMETRY__ = report;
      root.setAttribute("data-output-stack-geometry-ready", "1");
    };
    const timer = window.setTimeout(probe, 50);
    return () => window.clearTimeout(timer);
  }, [canvasHeight, canvasWidth, orderedLayers, programOutput]);

  return (
    <div
      className={`output-surface fixed inset-0 overflow-hidden ${hideCursor ? "cursor-none" : ""}`}
      data-output-stack-fit=""
      data-output-stack-layer-count={String(orderedLayers.length)}
      data-output-stack-target-raster={useTargetRaster ? `${outputWidth}x${outputHeight}` : undefined}
      data-output-stack-overlay="absolute"
      data-output-stack-geometry="authored-stage-scale"
      style={{
        backgroundColor: computerOutput ? "#000000" : surface === "decklink" ? "transparent" : undefined,
        margin: 0,
        padding: 0,
        border: 0,
        borderRadius: 0,
      }}
    >
      <DisplayViewerScaledCanvas
        displayWidth={canvasWidth}
        displayHeight={canvasHeight}
        allowUpscale
        paintScaleWithZoom={programOutput}
        fillMode={programOutput ? "stretch" : "contain"}
        backgroundColor={computerOutput ? "#000000" : "transparent"}
        className="h-full w-full"
      >
        <div
          data-output-stack-layers=""
          data-output-stack-root=""
          style={{
            position: "relative",
            width: canvasWidth,
            height: canvasHeight,
            margin: 0,
            padding: 0,
            overflow: "hidden",
            background: "transparent",
            backgroundColor: "transparent",
          }}
        >
          {orderedLayers.map((layer) => (
            <StackLayerIframe
              key={layer.displayId}
              projectId={projectId}
              origin={origin}
              layer={layer}
              computerOutput={computerOutput}
              hideCursor={hideCursor}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              fallbackLayerWidth={displayWidth}
              fallbackLayerHeight={displayHeight}
              fillMode={fillMode}
            />
          ))}
        </div>
      </DisplayViewerScaledCanvas>
    </div>
  );
}
