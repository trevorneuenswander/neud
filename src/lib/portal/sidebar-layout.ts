/** Expanded desktop sidebar width — matches `--sidebar-width` in globals.css. */
export const SIDEBAR_EXPANDED_WIDTH_PX = 260;

/** Collapsed icon-only sidebar width (56–64px target). */
export const SIDEBAR_COLLAPSED_WIDTH_PX = 60;

export const SIDEBAR_WIDTH_TRANSITION_CLASS = "transition-[width] duration-200 ease-out";

export const SIDEBAR_LABEL_TRANSITION_CLASS =
  "transition-[opacity,width] duration-150 ease-out";

export function sidebarWidthPx(collapsed: boolean): number {
  return collapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : SIDEBAR_EXPANDED_WIDTH_PX;
}
