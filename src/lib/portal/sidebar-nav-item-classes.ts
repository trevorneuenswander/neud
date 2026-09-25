/** Primary sidebar row sizing — shared by SidebarNavItem and SidebarProjectsNav. */
export const SIDEBAR_PRIMARY_NAV_ROW_CLASS =
  "flex h-10 cursor-pointer items-center rounded-md text-sm font-medium transition-colors";

export function sidebarPrimaryNavRowClass(collapsed: boolean): string {
  return collapsed
    ? `${SIDEBAR_PRIMARY_NAV_ROW_CLASS} w-full justify-center px-0`
    : `${SIDEBAR_PRIMARY_NAV_ROW_CLASS} gap-3 px-3`;
}

/** Full-width row used to center collapsed branding with collapsed nav icon axis. */
export const SIDEBAR_COLLAPSED_CENTER_ROW_CLASS = sidebarPrimaryNavRowClass(true);

export const sidebarPrimaryNavActiveClass = "bg-primary/15 text-foreground";

export const sidebarPrimaryNavInactiveClass =
  "text-muted hover:bg-surface-raised hover:text-foreground";

/** Chevron toggle fits inside the same h-10 row as primary nav links. */
export const SIDEBAR_PRIMARY_NAV_CHEVRON_CLASS =
  "inline-flex h-10 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-raised hover:text-foreground";
