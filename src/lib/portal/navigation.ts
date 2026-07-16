export type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
};

export const PORTAL_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/users", label: "Users", adminOnly: true },
  { href: "/admin/access-requests", label: "Access Requests", adminOnly: true },
  { href: "/activity", label: "Activity", adminOnly: true },
  { href: "/settings", label: "Settings" },
];

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/projects/new": "New Project",
  "/admin/access-requests": "Access Requests",
  "/users": "Users",
  "/activity": "Activity",
  "/settings": "Settings",
};

export function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) {
    return PAGE_TITLES[pathname];
  }

  if (pathname.endsWith("/members")) {
    return "Members";
  }

  if (pathname.endsWith("/displays")) {
    return "Displays";
  }

  if (pathname.endsWith("/controllers")) {
    return "Controllers";
  }

  if (pathname.endsWith("/workers")) {
    return "Workers";
  }

  if (pathname.endsWith("/activity")) {
    return "Activity";
  }

  if (pathname.endsWith("/settings")) {
    return "Settings";
  }

  if (pathname.startsWith("/projects/")) {
    return "Projects";
  }

  return "HMG Graphics Server";
}

export function formatPlatformRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
