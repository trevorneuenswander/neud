/**
 * Align + distribute selected layers (undoable via caller).
 */

export type AlignableRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeMode = "horizontal" | "vertical";

export function alignLayers(
  layers: AlignableRect[],
  mode: AlignMode,
): AlignableRect[] {
  if (layers.length < 2) return layers.map((l) => ({ ...l }));
  const minX = Math.min(...layers.map((l) => l.x));
  const maxR = Math.max(...layers.map((l) => l.x + l.width));
  const minY = Math.min(...layers.map((l) => l.y));
  const maxB = Math.max(...layers.map((l) => l.y + l.height));
  const midX = (minX + maxR) / 2;
  const midY = (minY + maxB) / 2;

  return layers.map((layer) => {
    const next = { ...layer };
    switch (mode) {
      case "left":
        next.x = minX;
        break;
      case "right":
        next.x = maxR - layer.width;
        break;
      case "hcenter":
        next.x = midX - layer.width / 2;
        break;
      case "top":
        next.y = minY;
        break;
      case "bottom":
        next.y = maxB - layer.height;
        break;
      case "vcenter":
        next.y = midY - layer.height / 2;
        break;
    }
    next.x = Math.round(next.x);
    next.y = Math.round(next.y);
    return next;
  });
}

export function distributeLayers(
  layers: AlignableRect[],
  mode: DistributeMode,
): AlignableRect[] {
  if (layers.length < 3) return layers.map((l) => ({ ...l }));
  const sorted = [...layers].sort((a, b) => (mode === "horizontal" ? a.x - b.x : a.y - b.y));
  if (mode === "horizontal") {
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const totalWidth = sorted.reduce((sum, l) => sum + l.width, 0);
    const span = last.x + last.width - first.x;
    const gap = (span - totalWidth) / (sorted.length - 1);
    let cursor = first.x;
    return sorted.map((layer, index) => {
      if (index === 0) return { ...layer };
      if (index === sorted.length - 1) return { ...layer };
      cursor += sorted[index - 1]!.width + gap;
      return { ...layer, x: Math.round(cursor) };
    });
  }
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const totalHeight = sorted.reduce((sum, l) => sum + l.height, 0);
  const span = last.y + last.height - first.y;
  const gap = (span - totalHeight) / (sorted.length - 1);
  let cursor = first.y;
  return sorted.map((layer, index) => {
    if (index === 0) return { ...layer };
    if (index === sorted.length - 1) return { ...layer };
    cursor += sorted[index - 1]!.height + gap;
    return { ...layer, y: Math.round(cursor) };
  });
}
