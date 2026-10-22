export type DisplayStackFitLayer = {
  displayId: string;
  slug: string;
  zIndex: number;
  /** Authored internal width of this layer (not the final Stack raster). */
  width?: number;
  /** Authored internal height of this layer (not the final Stack raster). */
  height?: number;
};

export type DisplayStackFitSurface = "preview" | "computer" | "decklink";

export type StackLayerGeometry = {
  layerWidth: number;
  layerHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  scaleX: number;
  scaleY: number;
};

/**
 * Canonical Stack geometry: each layer's authored stage is scaled into a
 * final-output-sized absolute wrapper at (0,0). Preview / Computer / DeckLink
 * share this algorithm; only the capture adapter differs.
 */
export function computeStackLayerGeometry(input: {
  layerWidth: number;
  layerHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  fillMode?: "stretch" | "contain";
}): StackLayerGeometry {
  const layerWidth = Math.max(1, input.layerWidth);
  const layerHeight = Math.max(1, input.layerHeight);
  const canvasWidth = Math.max(1, input.canvasWidth);
  const canvasHeight = Math.max(1, input.canvasHeight);
  const fillMode = input.fillMode ?? "stretch";
  if (fillMode === "contain") {
    const uniform = Math.min(canvasWidth / layerWidth, canvasHeight / layerHeight);
    return {
      layerWidth,
      layerHeight,
      canvasWidth,
      canvasHeight,
      scaleX: uniform,
      scaleY: uniform,
    };
  }
  return {
    layerWidth,
    layerHeight,
    canvasWidth,
    canvasHeight,
    scaleX: canvasWidth / layerWidth,
    scaleY: canvasHeight / layerHeight,
  };
}

export function parseDisplayStackFitLayers(raw: string | undefined | null): DisplayStackFitLayer[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const layers: DisplayStackFitLayer[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const displayId = typeof record.displayId === "string" ? record.displayId.trim() : "";
      const slug = typeof record.slug === "string" ? record.slug.trim() : "";
      const zIndex = typeof record.zIndex === "number" && Number.isFinite(record.zIndex) ? record.zIndex : NaN;
      if (!displayId || !slug || !Number.isFinite(zIndex)) continue;
      const width =
        typeof record.width === "number" && Number.isFinite(record.width) && record.width > 0
          ? record.width
          : undefined;
      const height =
        typeof record.height === "number" && Number.isFinite(record.height) && record.height > 0
          ? record.height
          : undefined;
      layers.push({ displayId, slug, zIndex, width, height });
    }
    return layers;
  } catch {
    return [];
  }
}

export function parseDisplayStackFitSurface(raw: string | undefined | null): DisplayStackFitSurface {
  if (raw === "computer" || raw === "decklink") return raw;
  return "preview";
}
