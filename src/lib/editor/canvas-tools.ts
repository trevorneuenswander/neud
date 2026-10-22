/** Canvas tool modes and draw/hit-test helpers (editor view only — not stack output). */

import type { EditableLayer } from "@/lib/editor/editable-graphic-types";

export type EditorCanvasTool =
  | "select"
  | "rect"
  | "ellipse"
  | "text"
  | "line"
  | "image";

export const MIN_SHAPE_DRAW_SIZE = 4;

export type ShapeDrawModifiers = {
  constrainSquare?: boolean;
  fromCenter?: boolean;
};

export type CanvasRect = { x: number; y: number; width: number; height: number };

/** Drag bounds for rectangle/ellipse creation (canvas coordinates). */
export function computeShapeDrawBounds(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  modifiers: ShapeDrawModifiers = {},
): CanvasRect {
  if (modifiers.fromCenter) {
    let halfW = Math.abs(endX - startX);
    let halfH = Math.abs(endY - startY);
    if (modifiers.constrainSquare) {
      const half = Math.max(halfW, halfH);
      halfW = half;
      halfH = half;
    }
    return {
      x: Math.round(startX - halfW),
      y: Math.round(startY - halfH),
      width: Math.round(halfW * 2),
      height: Math.round(halfH * 2),
    };
  }

  let width = Math.abs(endX - startX);
  let height = Math.abs(endY - startY);
  if (modifiers.constrainSquare) {
    const size = Math.max(width, height);
    width = size;
    height = size;
  }
  const x = endX >= startX ? startX : startX - width;
  const y = endY >= startY ? startY : startY - height;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function isShapeDrawLargeEnough(rect: CanvasRect): boolean {
  return rect.width >= MIN_SHAPE_DRAW_SIZE && rect.height >= MIN_SHAPE_DRAW_SIZE;
}

function layerWorldBounds(layer: EditableLayer): CanvasRect {
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
}

function pointInRect(px: number, py: number, rect: CanvasRect): boolean {
  return (
    px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
  );
}

export type LayerHitTestOptions = {
  /** Outermost isolated group id (double-click isolation). Only its direct/indirect children are hittable. */
  isolationGroupId?: string | null;
  /** Prefer topmost by zIndex among visible layers. */
};

function layerInIsolationContext(
  layer: EditableLayer,
  isolationGroupId: string | null | undefined,
  layersById: Map<string, EditableLayer>,
): boolean {
  if (!isolationGroupId) return true;
  if (layer.id === isolationGroupId) return true;
  let parentId = layer.parentId;
  while (parentId) {
    if (parentId === isolationGroupId) return true;
    parentId = layersById.get(parentId)?.parentId ?? null;
  }
  return false;
}

/** Topmost visible layer at canvas point; locked layers remain selectable. */
export function hitTestTopLayer(
  layers: EditableLayer[],
  canvasX: number,
  canvasY: number,
  options: LayerHitTestOptions = {},
): EditableLayer | null {
  const layersById = new Map(layers.map((layer) => [layer.id, layer]));
  const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  let lockedFallback: EditableLayer | null = null;
  for (const layer of sorted) {
    if (layer.visible === false) continue;
    if (!layerInIsolationContext(layer, options.isolationGroupId, layersById)) continue;
    const bounds = layerWorldBounds(layer);
    if (!pointInRect(canvasX, canvasY, bounds)) continue;
    if (!layer.locked) return layer;
    if (!lockedFallback) lockedFallback = layer;
  }
  return lockedFallback;
}

export function clientToCanvasPoint(
  clientX: number,
  clientY: number,
  stageBounds: DOMRect,
  canvasScale: number,
): { x: number; y: number } {
  return {
    x: (clientX - stageBounds.left) / canvasScale,
    y: (clientY - stageBounds.top) / canvasScale,
  };
}
