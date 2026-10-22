import type { EditableLayer, EditableLayerEffect } from "./editable-graphic-types";
import type { GraphicBudgetEstimate, PerformanceCost } from "./phase4-types";

const IMAGE_AREA_MEDIUM = 1920 * 1080;
const IMAGE_AREA_HIGH = 3840 * 2160;

function maxEffectBlur(effects: EditableLayerEffect[] | undefined): number {
  let max = 0;
  for (const effect of effects ?? []) {
    if (effect.type === "dropShadow" || effect.type === "outerGlow") {
      max = Math.max(max, effect.blur ?? 0);
    }
  }
  return max;
}

function hasContinuousAnimation(layer: EditableLayer): boolean {
  const presets = [
    layer.animations.in?.preset,
    layer.animations.out?.preset,
    layer.animations.update?.preset,
  ];
  return presets.some((p) => p != null && p !== "none");
}

function imageAreaHint(layer: EditableLayer): number {
  const w = Math.max(0, layer.width);
  const h = Math.max(0, layer.height);
  return w * h;
}

/**
 * Heuristic broadcast-safe cost for a single layer (editor guidance only).
 */
export function estimateLayerCost(layer: EditableLayer): PerformanceCost {
  if (!layer.visible) return "low";

  let score = 0;

  if (layer.type === "image" || layer.assetId) {
    const area = imageAreaHint(layer);
    if (area >= IMAGE_AREA_HIGH) score += 3;
    else if (area >= IMAGE_AREA_MEDIUM) score += 2;
    else if (area > 0) score += 1;
  }

  if (layer.type === "repeater" && (layer.repeater?.maxItems ?? 0) > 8) {
    score += 2;
  }

  const blur = maxEffectBlur(layer.effects);
  if (blur >= 24) score += 3;
  else if (blur >= 8) score += 2;
  else if (blur > 0) score += 1;

  if ((layer.effects?.length ?? 0) >= 3) score += 1;

  if (layer.overflow.mode === "marquee") score += 2;

  if (hasContinuousAnimation(layer)) score += 2;

  if (score >= 5) return "high";
  if (score >= 2) return "medium";
  return "low";
}

const COST_RANK: Record<PerformanceCost, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function estimateGraphicBudget(layers: EditableLayer[]): GraphicBudgetEstimate {
  const contributors = layers
    .map((layer) => ({
      layerId: layer.id,
      name: layer.name,
      cost: estimateLayerCost(layer),
    }))
    .filter((entry) => entry.cost !== "low")
    .sort((a, b) => COST_RANK[b.cost] - COST_RANK[a.cost]);

  const highCount = contributors.filter((c) => c.cost === "high").length;
  const mediumCount = contributors.filter((c) => c.cost === "medium").length;

  let level: GraphicBudgetEstimate["level"] = "good";
  if (highCount >= 2 || (highCount >= 1 && mediumCount >= 4) || mediumCount >= 8) {
    level = "heavy";
  } else if (highCount >= 1 || mediumCount >= 3) {
    level = "moderate";
  }

  return { level, contributors };
}
