/** Selection overlay handle layout (screen-constant sizing via inverse canvas scale). */

import type { CSSProperties } from "react";

export type ResizeHandleId = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

export const HANDLE_VISUAL_PX = 12;
export const HANDLE_HIT_PX = 20;
export const ROTATION_HANDLE_OFFSET_PX = 32;
export const SELECTION_FRAME_PX = 2;

const CURSOR_BY_HANDLE: Record<ResizeHandleId, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  e: "ew-resize",
  w: "ew-resize",
  n: "ns-resize",
  s: "ns-resize",
};

export function resizeHandleCursor(handle: ResizeHandleId): string {
  return CURSOR_BY_HANDLE[handle];
}

export function handleVisualSize(canvasScale: number): number {
  return HANDLE_VISUAL_PX / canvasScale;
}

export function handleHitSize(canvasScale: number): number {
  return HANDLE_HIT_PX / canvasScale;
}

export function handleStyle(
  handle: ResizeHandleId,
  canvasScale: number,
): CSSProperties {
  const hit = handleHitSize(canvasScale);
  const common: CSSProperties = {
    position: "absolute",
    width: hit,
    height: hit,
    cursor: resizeHandleCursor(handle),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "none",
  };

  if (handle.includes("n")) common.top = -hit / 2;
  if (handle.includes("s")) common.bottom = -hit / 2;
  if (handle.includes("w")) common.left = -hit / 2;
  if (handle.includes("e")) common.right = -hit / 2;

  if (handle === "n" || handle === "s") {
    common.left = "50%";
    common.marginLeft = -hit / 2;
    common.transform = undefined;
  }
  if (handle === "e" || handle === "w") {
    common.top = "50%";
    common.marginTop = -hit / 2;
  }

  return common;
}

export function handleInnerStyle(canvasScale: number): CSSProperties {
  const visual = handleVisualSize(canvasScale);
  return {
    width: visual,
    height: visual,
    borderRadius: 2,
    background: "#38bdf8",
    border: "1px solid #0c4a6e",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
    pointerEvents: "none",
  };
}

export function rotationHandleStyle(canvasScale: number): CSSProperties {
  const hit = handleHitSize(canvasScale);
  const offset = ROTATION_HANDLE_OFFSET_PX / canvasScale;
  return {
    position: "absolute",
    left: "50%",
    top: -offset,
    width: hit,
    height: hit,
    marginLeft: -hit / 2,
    cursor: "alias",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "none",
  };
}

export function rotationStemStyle(canvasScale: number): CSSProperties {
  const offset = ROTATION_HANDLE_OFFSET_PX / canvasScale;
  return {
    position: "absolute",
    left: "50%",
    top: -offset,
    width: 1 / canvasScale,
    height: offset,
    marginLeft: -0.5 / canvasScale,
    background: "rgba(251, 191, 36, 0.75)",
    pointerEvents: "none",
  };
}

export function rotationHandleInnerStyle(canvasScale: number): CSSProperties {
  const visual = handleVisualSize(canvasScale);
  return {
    width: visual,
    height: visual,
    borderRadius: "50%",
    background: "#fcd34d",
    border: "1px solid #92400e",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
    pointerEvents: "none",
  };
}

export function selectionFrameStyle(canvasScale: number): CSSProperties {
  const w = SELECTION_FRAME_PX / canvasScale;
  return {
    outline: `${w}px solid #38bdf8`,
    outlineOffset: 0,
  };
}
