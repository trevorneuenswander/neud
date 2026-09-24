import {
  DEFAULT_DISPLAY_HEIGHT,
  DEFAULT_DISPLAY_WIDTH,
} from "@/lib/displays/display-size";

export function parseDisplayWindowFitDimensions(
  widthParam: string | null | undefined,
  heightParam: string | null | undefined,
): { displayWidth: number; displayHeight: number } {
  const displayWidth = Number(widthParam);
  const displayHeight = Number(heightParam);
  return {
    displayWidth:
      Number.isFinite(displayWidth) && displayWidth > 0
        ? displayWidth
        : DEFAULT_DISPLAY_WIDTH,
    displayHeight:
      Number.isFinite(displayHeight) && displayHeight > 0
        ? displayHeight
        : DEFAULT_DISPLAY_HEIGHT,
  };
}

export function parseDisplayWindowFitTarget(
  targetParam: string | null | undefined,
): string {
  return typeof targetParam === "string" ? targetParam.trim() : "";
}
