export type SubmenuPlacementInput = {
  /** Parent menu (or submenu anchor) bounds in viewport coordinates. */
  menuRect: { left: number; right: number; top: number; bottom: number };
  submenuWidth: number;
  submenuHeight: number;
  viewport: { width: number; height: number };
};

export type SubmenuPlacement = {
  /** When true, open with `right-full` / `left-auto` instead of `left-full`. */
  openLeft: boolean;
  /** Pixel offset applied to `top` (negative shifts the submenu upward). */
  offsetTop: number;
};

/**
 * Resolve submenu open direction and vertical shift so the panel stays in the viewport.
 */
export function resolveSubmenuPlacement(input: SubmenuPlacementInput): SubmenuPlacement {
  const width = Math.max(0, input.submenuWidth);
  const height = Math.max(0, input.submenuHeight);
  const viewportWidth = Math.max(0, input.viewport.width);
  const viewportHeight = Math.max(0, input.viewport.height);

  const openLeft = input.menuRect.right + width > viewportWidth;

  let offsetTop = 0;
  const projectedBottom = input.menuRect.top + height;
  if (projectedBottom > viewportHeight) {
    offsetTop = viewportHeight - projectedBottom;
    if (input.menuRect.top + offsetTop < 0) {
      offsetTop = -input.menuRect.top;
    }
  }

  return { openLeft, offsetTop };
}
