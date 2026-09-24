export function computeDisplayViewerScale(
  viewportWidth: number,
  viewportHeight: number,
  displayWidth: number,
  displayHeight: number,
): number {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    displayWidth <= 0 ||
    displayHeight <= 0
  ) {
    return 1;
  }

  return Math.min(1, viewportWidth / displayWidth, viewportHeight / displayHeight);
}

/** Full-window contain scale (may upscale to fill viewport). */
export function computeDisplayViewerContainScale(
  viewportWidth: number,
  viewportHeight: number,
  displayWidth: number,
  displayHeight: number,
): number {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    displayWidth <= 0 ||
    displayHeight <= 0
  ) {
    return 1;
  }

  return Math.min(
    viewportWidth / displayWidth,
    viewportHeight / displayHeight,
  );
}
