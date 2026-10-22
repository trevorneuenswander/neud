/**
 * Image crop persistence helpers.
 */

import type { EditableImageCrop, EditableLayer } from "./editable-graphic-types";

export function defaultCrop(): EditableImageCrop {
  return { offsetX: 0, offsetY: 0, zoom: 1, fit: "contain" };
}

export function normalizeCrop(crop: EditableImageCrop | null | undefined): EditableImageCrop {
  if (!crop) return defaultCrop();
  return {
    offsetX: Number.isFinite(crop.offsetX) ? crop.offsetX : 0,
    offsetY: Number.isFinite(crop.offsetY) ? crop.offsetY : 0,
    zoom: Math.max(0.1, Math.min(8, Number.isFinite(crop.zoom) ? crop.zoom : 1)),
    fit: crop.fit === "cover" ? "cover" : "contain",
  };
}

export function applyCropPan(
  crop: EditableImageCrop,
  dx: number,
  dy: number,
): EditableImageCrop {
  const current = normalizeCrop(crop);
  return {
    ...current,
    offsetX: Math.round(current.offsetX + dx),
    offsetY: Math.round(current.offsetY + dy),
  };
}

export function applyCropZoom(crop: EditableImageCrop, delta: number): EditableImageCrop {
  const current = normalizeCrop(crop);
  return normalizeCrop({ ...current, zoom: current.zoom + delta });
}

export function cropToCss(crop: EditableImageCrop | null | undefined): {
  objectFit: "contain" | "cover";
  transform: string;
  transformOrigin: string;
} {
  const c = normalizeCrop(crop);
  return {
    objectFit: c.fit,
    transform: `translate(${c.offsetX}px, ${c.offsetY}px) scale(${c.zoom})`,
    transformOrigin: "center center",
  };
}

export function persistCropOnLayer(layer: EditableLayer, crop: EditableImageCrop): EditableLayer {
  return {
    ...layer,
    crop: normalizeCrop(crop),
    style: {
      ...layer.style,
      objectFit: crop.fit,
    },
  };
}
