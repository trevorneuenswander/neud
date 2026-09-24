/** Largest axis-aligned rectangle with display aspect ratio inside available bounds. */
export function computePinnedViewerFitSize(input: {
  availableWidth: number;
  availableHeight: number;
  displayWidth: number;
  displayHeight: number;
}): { width: number; height: number } {
  const { availableWidth, availableHeight, displayWidth, displayHeight } = input;
  if (
    availableWidth <= 0 ||
    availableHeight <= 0 ||
    displayWidth <= 0 ||
    displayHeight <= 0
  ) {
    return { width: 0, height: 0 };
  }

  const displayAspect = displayWidth / displayHeight;
  const cellAspect = availableWidth / availableHeight;

  if (cellAspect > displayAspect) {
    const height = availableHeight;
    return { width: height * displayAspect, height };
  }

  const width = availableWidth;
  return { width, height: width / displayAspect };
}
