import { getAppName } from "@/lib/branding/app-name";

export type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  viewerHidden?: boolean;
  /** Dashboard-style items use exact path matching; section nav uses prefix matching. */
  activeMatch?: "exact" | "prefix";
};

export const PORTAL_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/users", label: "Users and Access", adminOnly: true },
  { href: "/activity", label: "Activity", viewerHidden: true },
  { href: "/settings", label: "Settings" },
];

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/projects/new": "New Project",
  "/users": "Users and Access",
  "/activity": "Activity",
  "/settings": "Settings",
};

export function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) {
    return PAGE_TITLES[pathname];
  }

  if (pathname.endsWith("/displays")) {
    return "Displays";
  }

  if (pathname.endsWith("/controller")) {
    return "Local Controller";
  }

  if (pathname.endsWith("/data-engines")) {
    return "Data Engines";
  }

  if (pathname.endsWith("/workers")) {
    return "Workers";
  }

  if (pathname.endsWith("/settings")) {
    return "Settings";
  }

  if (pathname.startsWith("/projects/")) {
    return "Projects";
  }

  return getAppName();
}

export function formatPlatformRole(role: string): string {
  const normalized = role.trim().toLowerCase();
  if (normalized === "user") {
    return "Operator";
  }
  if (normalized.length === 0) {
    return "Viewer";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function isProjectWorkspacePath(pathname: string): boolean {
  return /^\/projects\/(?!new$)[^/]+(?:\/.*)?$/.test(pathname);
}
