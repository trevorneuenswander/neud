export const DEFAULT_DISPLAY_WIDTH = 1920;
export const DEFAULT_DISPLAY_HEIGHT = 1080;

export const DISPLAY_SIZE_OPTIONS = [
  { label: "1920x1080", width: 1920, height: 1080 },
  { label: "3840x2160", width: 3840, height: 2160 },
] as const;

export type DisplaySizeLabel = (typeof DISPLAY_SIZE_OPTIONS)[number]["label"];

export function isAllowedDisplaySize(width: number, height: number): boolean {
  return DISPLAY_SIZE_OPTIONS.some(
    (option) => option.width === width && option.height === height,
  );
}

export function normalizeDisplaySize(
  width: number | null | undefined,
  height: number | null | undefined,
): { displayWidth: number; displayHeight: number; label: DisplaySizeLabel } {
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    isAllowedDisplaySize(width, height)
  ) {
    const label =
      DISPLAY_SIZE_OPTIONS.find(
        (option) => option.width === width && option.height === height,
      )?.label ?? "1920x1080";
    return { displayWidth: width, displayHeight: height, label };
  }

  return {
    displayWidth: DEFAULT_DISPLAY_WIDTH,
    displayHeight: DEFAULT_DISPLAY_HEIGHT,
    label: "1920x1080",
  };
}

export function formatDisplaySizeLabel(width: number, height: number): string {
  return `${width}x${height}`;
}
