export const BROAD_ARROW_TICKER_RENDERER_KEY = "broad-arrow-ticker";

export const BROAD_ARROW_RENDERER_KEYS = [BROAD_ARROW_TICKER_RENDERER_KEY] as const;

export type BroadArrowRendererKey = (typeof BROAD_ARROW_RENDERER_KEYS)[number];

/** Stable slug defaults for imported Broad Arrow uploaded displays. */
export const BROAD_ARROW_SLUG_RENDERER_DEFAULTS: Record<string, BroadArrowRendererKey> = {};

export function isBroadArrowRendererKey(value: unknown): value is BroadArrowRendererKey {
  return (
    typeof value === "string" &&
    (BROAD_ARROW_RENDERER_KEYS as readonly string[]).includes(value)
  );
}
