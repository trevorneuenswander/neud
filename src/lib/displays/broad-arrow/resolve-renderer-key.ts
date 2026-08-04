import {
  BROAD_ARROW_SLUG_RENDERER_DEFAULTS,
  isBroadArrowRendererKey,
  type BroadArrowRendererKey,
} from "./renderer-keys";

export function resolveRendererKey(
  displayKey: string,
  settings?: Record<string, unknown> | null,
): BroadArrowRendererKey | null {
  const fromSettings = settings?.rendererKey;
  if (isBroadArrowRendererKey(fromSettings)) {
    return fromSettings;
  }

  return BROAD_ARROW_SLUG_RENDERER_DEFAULTS[displayKey] ?? null;
}

export function readRendererKeyFromSettings(
  settings: unknown,
): BroadArrowRendererKey | null {
  if (!settings || typeof settings !== "object") {
    return null;
  }
  const rendererKey = (settings as Record<string, unknown>).rendererKey;
  return isBroadArrowRendererKey(rendererKey) ? rendererKey : null;
}
