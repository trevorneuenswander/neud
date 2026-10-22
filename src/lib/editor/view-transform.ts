/**
 * Editor viewport transform — zoom/pan are view-only.
 * Never mutate authored layer coordinates from these helpers.
 */

export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type EditorViewTransform = {
  zoom: number;
  panX: number;
  panY: number;
};

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(4, Math.max(0.1, zoom));
}

export function createViewTransform(
  partial?: Partial<EditorViewTransform>,
): EditorViewTransform {
  return {
    zoom: clampZoom(partial?.zoom ?? 1),
    panX: partial?.panX ?? 0,
    panY: partial?.panY ?? 0,
  };
}

/** Fit authored canvas into a viewport with padding. */
export function fitZoomToViewport(input: {
  canvasWidth: number;
  canvasHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  padding?: number;
}): number {
  const pad = input.padding ?? 48;
  const availW = Math.max(1, input.viewportWidth - pad * 2);
  const availH = Math.max(1, input.viewportHeight - pad * 2);
  const zx = availW / Math.max(1, input.canvasWidth);
  const zy = availH / Math.max(1, input.canvasHeight);
  return clampZoom(Math.min(zx, zy));
}

export function zoomAtPoint(
  view: EditorViewTransform,
  nextZoom: number,
  /** Pointer position in viewport coords */
  pointerX: number,
  pointerY: number,
): EditorViewTransform {
  const z0 = view.zoom;
  const z1 = clampZoom(nextZoom);
  if (z0 === z1) return view;
  // Keep the world point under the cursor stable.
  const worldX = (pointerX - view.panX) / z0;
  const worldY = (pointerY - view.panY) / z0;
  return {
    zoom: z1,
    panX: pointerX - worldX * z1,
    panY: pointerY - worldY * z1,
  };
}

export function panBy(
  view: EditorViewTransform,
  dx: number,
  dy: number,
): EditorViewTransform {
  return { ...view, panX: view.panX + dx, panY: view.panY + dy };
}

export function nearestZoomPreset(zoom: number): number {
  let best: number = ZOOM_PRESETS[0];
  let bestDist = Math.abs(zoom - best);
  for (const preset of ZOOM_PRESETS) {
    const dist = Math.abs(zoom - preset);
    if (dist < bestDist) {
      best = preset;
      bestDist = dist;
    }
  }
  return best;
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  const sorted = [...ZOOM_PRESETS];
  if (direction > 0) {
    const next = sorted.find((z) => z > zoom + 1e-6);
    return next ?? clampZoom(zoom * 1.25);
  }
  const prev = [...sorted].reverse().find((z) => z < zoom - 1e-6);
  return prev ?? clampZoom(zoom / 1.25);
}
