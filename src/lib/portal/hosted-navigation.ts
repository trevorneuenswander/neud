import type { NavItem } from "@/lib/portal/navigation";
import { HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";

export function resolveHostedNavActiveState(pathname: string, href: string): boolean {
  const normalizedPath = pathname.split("?")[0]?.split("#")[0] ?? pathname;

  if (href === HOSTED_PORTAL_PATHS.dashboard) {
    return normalizedPath === href;
  }

  if (normalizedPath === href) {
    return true;
  }

  return normalizedPath.startsWith(`${href}/`);
}

export const HOSTED_PORTAL_NAV_ITEMS: NavItem[] = [
  { href: HOSTED_PORTAL_PATHS.dashboard, label: "Dashboard", activeMatch: "exact" },
  { href: HOSTED_PORTAL_PATHS.projects, label: "Projects", activeMatch: "prefix" },
  {
    href: HOSTED_PORTAL_PATHS.users,
    label: "Users and Access",
    adminOnly: true,
    activeMatch: "prefix",
  },
  { href: HOSTED_PORTAL_PATHS.activity, label: "Activity", activeMatch: "prefix" },
  { href: HOSTED_PORTAL_PATHS.settings, label: "Settings", activeMatch: "prefix" },
];

export const HOSTED_PORTAL_PAGE_TITLES: Record<string, string> = {
  [HOSTED_PORTAL_PATHS.dashboard]: "Dashboard",
  [HOSTED_PORTAL_PATHS.projects]: "Projects",
  [HOSTED_PORTAL_PATHS.users]: "Users and Access",
  [HOSTED_PORTAL_PATHS.activity]: "Activity",
  [HOSTED_PORTAL_PATHS.settings]: "Settings",
  [HOSTED_PORTAL_PATHS.profile]: "Profile",
  "/download": "Download",
};
