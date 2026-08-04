import { HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";

export type AccessManagementSurface = "desktop" | "portal";
export type AccessManagementTabId = "teams" | "users" | "projects" | "invitations";

const ACCESS_MANAGEMENT_TABS: AccessManagementTabId[] = [
  "teams",
  "users",
  "projects",
  "invitations",
];

const DESKTOP_USERS_PATH = "/users";
const PORTAL_USERS_PATH = HOSTED_PORTAL_PATHS.users;

export function resolveAccessManagementSurface(pathname: string): AccessManagementSurface {
  return pathname === PORTAL_USERS_PATH || pathname.startsWith(`${PORTAL_USERS_PATH}/`)
    ? "portal"
    : "desktop";
}

export function getAccessManagementUsersPath(surface: AccessManagementSurface): string {
  return surface === "portal" ? PORTAL_USERS_PATH : DESKTOP_USERS_PATH;
}

export function parseAccessManagementTab(
  value: string | null | undefined,
): AccessManagementTabId | null {
  if (value && ACCESS_MANAGEMENT_TABS.includes(value as AccessManagementTabId)) {
    return value as AccessManagementTabId;
  }
  return null;
}

export function getAccessManagementHref(
  surface: AccessManagementSurface,
  tab: AccessManagementTabId = "teams",
  query?: string,
): string {
  const basePath = getAccessManagementUsersPath(surface);
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (query?.trim()) {
    params.set("q", query.trim());
  }
  return `${basePath}?${params.toString()}`;
}

export function getAccessManagementUserDetailsHref(
  userId: string,
  surface: AccessManagementSurface,
  options?: { returnTab?: AccessManagementTabId },
): string {
  const basePath =
    surface === "portal"
      ? `${PORTAL_USERS_PATH}/${encodeURIComponent(userId)}`
      : `${DESKTOP_USERS_PATH}/${encodeURIComponent(userId)}`;
  const params = new URLSearchParams();
  params.set(
    "returnTo",
    getAccessManagementHref(surface, options?.returnTab ?? "users"),
  );
  return `${basePath}?${params.toString()}`;
}

function isSafeRelativePath(value: string): boolean {
  if (!value.startsWith("/")) {
    return false;
  }
  if (value.startsWith("//")) {
    return false;
  }
  if (value.includes("://")) {
    return false;
  }
  if (value.includes("\\")) {
    return false;
  }
  return true;
}

export function resolveSafeUsersReturnHref(
  returnTo: string | null | undefined,
  surface: AccessManagementSurface,
): string {
  const fallback = getAccessManagementHref(surface, "users");

  if (!returnTo?.trim()) {
    return fallback;
  }

  const trimmed = returnTo.trim();
  if (!isSafeRelativePath(trimmed)) {
    return fallback;
  }

  const path = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  const allowedRoots = [DESKTOP_USERS_PATH, PORTAL_USERS_PATH];
  if (!allowedRoots.some((root) => path === root || path.startsWith(`${root}/`))) {
    return fallback;
  }

  try {
    const url = new URL(trimmed, "http://local");
    const tab = parseAccessManagementTab(url.searchParams.get("tab"));
    if (path === DESKTOP_USERS_PATH || path === PORTAL_USERS_PATH) {
      return getAccessManagementHref(
        surface,
        tab ?? "users",
        url.searchParams.get("q") ?? undefined,
      );
    }
  } catch {
    return fallback;
  }

  return fallback;
}
