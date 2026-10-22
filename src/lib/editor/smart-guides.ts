/**
 * Smart guides during drag/resize — non-sticky snap math.
 */

export type GuideRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SmartGuide = {
  orientation: "h" | "v";
  pos: number;
  kind: "edge" | "center" | "spacing";
};

export type SpacingMeasurement = {
  orientation: "h" | "v";
  /** Canvas position of measurement line */
  pos: number;
  from: number;
  to: number;
  distance: number;
};

export type SnapResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  guides: SmartGuide[];
  measurements?: SpacingMeasurement[];
};

const DEFAULT_THRESHOLD = 8;

function nearest(
  value: number,
  targets: number[],
  threshold: number,
): { value: number; guide: number | null } {
  let best: number | null = null;
  let bestDist = threshold + 1;
  for (const target of targets) {
    const dist = Math.abs(value - target);
    if (dist <= threshold && dist < bestDist) {
      best = target;
      bestDist = dist;
    }
  }
  return best == null ? { value, guide: null } : { value: best, guide: best };
}

export function collectSnapTargets(
  canvas: { width: number; height: number },
  others: GuideRect[],
  excludeIds: Set<string>,
): { x: Array<{ pos: number; kind: SmartGuide["kind"] }>; y: Array<{ pos: number; kind: SmartGuide["kind"] }> } {
  const x: Array<{ pos: number; kind: SmartGuide["kind"] }> = [
    { pos: 0, kind: "edge" },
    { pos: canvas.width / 2, kind: "center" },
    { pos: canvas.width, kind: "edge" },
  ];
  const y: Array<{ pos: number; kind: SmartGuide["kind"] }> = [
    { pos: 0, kind: "edge" },
    { pos: canvas.height / 2, kind: "center" },
    { pos: canvas.height, kind: "edge" },
  ];
  for (const layer of others) {
    if (excludeIds.has(layer.id)) continue;
    x.push(
      { pos: layer.x, kind: "edge" },
      { pos: layer.x + layer.width / 2, kind: "center" },
      { pos: layer.x + layer.width, kind: "edge" },
    );
    y.push(
      { pos: layer.y, kind: "edge" },
      { pos: layer.y + layer.height / 2, kind: "center" },
      { pos: layer.y + layer.height, kind: "edge" },
    );
  }
  return { x, y };
}

/** Equal-spacing suggestions between other layers along an axis (foundation). */
export function spacingHints(
  moving: GuideRect,
  others: GuideRect[],
  axis: "x" | "y",
): number[] {
  const hints: number[] = [];
  const sorted = [...others].sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (axis === "x") {
      const gap = b.x - (a.x + a.width);
      if (gap > 0) {
        hints.push(a.x + a.width + gap); // place left of gap after a
        hints.push(b.x - moving.width - gap);
      }
    } else {
      const gap = b.y - (a.y + a.height);
      if (gap > 0) {
        hints.push(a.y + a.height + gap);
        hints.push(b.y - moving.height - gap);
      }
    }
  }
  return hints;
}

export function snapMove(
  layer: GuideRect,
  proposed: { x: number; y: number },
  canvas: { width: number; height: number },
  others: GuideRect[],
  opts?: { enabled?: boolean; threshold?: number },
): SnapResult {
  const enabled = opts?.enabled !== false;
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
  const guides: SmartGuide[] = [];
  let { x, y } = proposed;
  const width = layer.width;
  const height = layer.height;

  if (!enabled) {
    return { x: Math.round(x), y: Math.round(y), width, height, guides };
  }

  const exclude = new Set([layer.id]);
  const targets = collectSnapTargets(canvas, others, exclude);
  const spaceX = spacingHints({ ...layer, x, y }, others.filter((o) => !exclude.has(o.id)), "x");
  const spaceY = spacingHints({ ...layer, x, y }, others.filter((o) => !exclude.has(o.id)), "y");

  const left = nearest(x, targets.x.map((t) => t.pos).concat(spaceX), threshold);
  const cx = nearest(x + width / 2, targets.x.map((t) => t.pos), threshold);
  const right = nearest(x + width, targets.x.map((t) => t.pos), threshold);

  if (left.guide != null) {
    x = left.value;
    guides.push({
      orientation: "v",
      pos: left.guide,
      kind: spaceX.includes(left.guide) ? "spacing" : "edge",
    });
  } else if (cx.guide != null) {
    x = cx.value - width / 2;
    guides.push({ orientation: "v", pos: cx.guide, kind: "center" });
  } else if (right.guide != null) {
    x = right.value - width;
    guides.push({ orientation: "v", pos: right.guide, kind: "edge" });
  }

  const top = nearest(y, targets.y.map((t) => t.pos).concat(spaceY), threshold);
  const cy = nearest(y + height / 2, targets.y.map((t) => t.pos), threshold);
  const bottom = nearest(y + height, targets.y.map((t) => t.pos), threshold);

  if (top.guide != null) {
    y = top.value;
    guides.push({
      orientation: "h",
      pos: top.guide,
      kind: spaceY.includes(top.guide) ? "spacing" : "edge",
    });
  } else if (cy.guide != null) {
    y = cy.value - height / 2;
    guides.push({ orientation: "h", pos: cy.guide, kind: "center" });
  } else if (bottom.guide != null) {
    y = bottom.value - height;
    guides.push({ orientation: "h", pos: bottom.guide, kind: "edge" });
  }

  const measurements = buildSpacingMeasurements(
    { id: layer.id, x, y, width, height },
    others.filter((o) => !exclude.has(o.id)),
    guides,
  );

  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height,
    guides,
    measurements,
  };
}

function buildSpacingMeasurements(
  moving: GuideRect,
  others: GuideRect[],
  guides: SmartGuide[],
): SpacingMeasurement[] {
  const out: SpacingMeasurement[] = [];
  const hasSpacing = guides.some((g) => g.kind === "spacing");
  if (!hasSpacing || others.length === 0) return out;
  const sortedX = [...others].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sortedX.length - 1; i++) {
    const a = sortedX[i]!;
    const b = sortedX[i + 1]!;
    const gap = b.x - (a.x + a.width);
    if (gap <= 0) continue;
    const leftGap = moving.x - (a.x + a.width);
    const rightGap = b.x - (moving.x + moving.width);
    if (Math.abs(leftGap - gap) <= 2 || Math.abs(rightGap - gap) <= 2) {
      out.push({
        orientation: "v",
        pos: a.x + a.width + gap / 2,
        from: a.y,
        to: b.y + b.height,
        distance: Math.round(gap),
      });
    }
  }
  const sortedY = [...others].sort((a, b) => a.y - b.y);
  for (let i = 0; i < sortedY.length - 1; i++) {
    const a = sortedY[i]!;
    const b = sortedY[i + 1]!;
    const gap = b.y - (a.y + a.height);
    if (gap <= 0) continue;
    const topGap = moving.y - (a.y + a.height);
    const bottomGap = b.y - (moving.y + moving.height);
    if (Math.abs(topGap - gap) <= 2 || Math.abs(bottomGap - gap) <= 2) {
      out.push({
        orientation: "h",
        pos: a.y + a.height + gap / 2,
        from: a.x,
        to: b.x + b.width,
        distance: Math.round(gap),
      });
    }
  }
  return out;
}

export function snapResize(
  start: GuideRect,
  proposed: GuideRect,
  canvas: { width: number; height: number },
  others: GuideRect[],
  opts?: { enabled?: boolean; threshold?: number },
): SnapResult {
  const move = snapMove(
    { ...proposed, width: proposed.width, height: proposed.height },
    { x: proposed.x, y: proposed.y },
    canvas,
    others,
    opts,
  );
  // Snap right/bottom edges as well
  const enabled = opts?.enabled !== false;
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
  let { x, y, width, height } = { ...proposed, x: move.x, y: move.y };
  const guides = [...move.guides];
  if (enabled) {
    const targets = collectSnapTargets(canvas, others, new Set([start.id]));
    const right = nearest(x + width, targets.x.map((t) => t.pos), threshold);
    if (right.guide != null) {
      width = Math.max(8, right.value - x);
      guides.push({ orientation: "v", pos: right.guide, kind: "edge" });
    }
    const bottom = nearest(y + height, targets.y.map((t) => t.pos), threshold);
    if (bottom.guide != null) {
      height = Math.max(8, bottom.value - y);
      guides.push({ orientation: "h", pos: bottom.guide, kind: "edge" });
    }
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    guides,
  };
}

/** @deprecated alias for tests / legacy imports */
export { snapMove as snapRect };
