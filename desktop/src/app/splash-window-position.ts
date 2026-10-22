export type SplashDisplayBounds = {
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
};

export type SplashWindowSize = {
  width: number;
  height: number;
};

/**
 * Position the splash window so it appears visually centered on the physical
 * display. Electron's `center: true` uses workArea, which shifts the window up
 * when a Dock/taskbar shrinks the usable height. Centering on full bounds and
 * clamping into workArea keeps the splash on-screen without menu/taskbar clip.
 */
export function computeSplashWindowPosition(
  display: SplashDisplayBounds,
  size: SplashWindowSize,
): { x: number; y: number } {
  const { bounds, workArea } = display;
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));

  let x = Math.round(bounds.x + (bounds.width - width) / 2);
  let y = Math.round(bounds.y + (bounds.height - height) / 2);

  const minX = workArea.x;
  const minY = workArea.y;
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  if (maxX >= minX) {
    x = Math.min(Math.max(x, minX), maxX);
  } else {
    x = minX;
  }
  if (maxY >= minY) {
    y = Math.min(Math.max(y, minY), maxY);
  } else {
    y = minY;
  }

  return { x, y };
}
