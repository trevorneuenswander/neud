/**
 * Hosted portal route prefixes (Vercel). Desktop Electron keeps legacy /projects paths.
 */
export const HOSTED_PORTAL_PREFIX = "/portal";

/** App Router page paths for hosted display viewers (dynamic segments shown as placeholders). */
export const HOSTED_VIEWER_ROUTE_TEMPLATES = {
  private: `${HOSTED_PORTAL_PREFIX}/projects/[slug]/displays/[displaySlug]`,
  privateFullscreen: `${HOSTED_PORTAL_PREFIX}/projects/[slug]/displays/[displaySlug]/fullscreen`,
  public: "/view/[projectSlug]/[displaySlug]",
  publicFullscreen: "/view/[projectSlug]/[displaySlug]/fullscreen",
} as const;

export type HostedViewerRouteKind = keyof typeof HOSTED_VIEWER_ROUTE_TEMPLATES;

const HOSTED_VIEWER_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const HOSTED_PORTAL_PATHS = {
  dashboard: `${HOSTED_PORTAL_PREFIX}`,
  projects: `${HOSTED_PORTAL_PREFIX}/projects`,
  project: (slug: string) => `${HOSTED_PORTAL_PREFIX}/projects/${encodeHostedRouteSlug(slug)}`,
  projectDisplays: (slug: string) =>
    `${HOSTED_PORTAL_PREFIX}/projects/${encodeHostedRouteSlug(slug)}/displays`,
  projectDisplay: (slug: string, displaySlug: string) =>
    getPrivateDisplayViewerPath(slug, displaySlug),
  users: `${HOSTED_PORTAL_PREFIX}/users`,
  user: (userId: string) =>
    `${HOSTED_PORTAL_PREFIX}/users/${encodeURIComponent(userId)}`,
  activity: `${HOSTED_PORTAL_PREFIX}/activity`,
  settings: `${HOSTED_PORTAL_PREFIX}/settings`,
  profile: `${HOSTED_PORTAL_PREFIX}/profile`,
  download: "/download",
} as const;

export function isValidHostedViewerSlug(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && HOSTED_VIEWER_SLUG_PATTERN.test(trimmed);
}

export function encodeHostedRouteSlug(slug: string): string {
  return encodeURIComponent(slug.trim());
}

/** Private authenticated viewer route — project members with Viewer access or higher. */
export function getPrivateDisplayViewerPath(
  projectSlug: string,
  displaySlug: string,
): string {
  return `${HOSTED_PORTAL_PREFIX}/projects/${encodeHostedRouteSlug(projectSlug)}/displays/${encodeHostedRouteSlug(displaySlug)}`;
}

/** Public viewer route — no auth, slug-based URLs only. */
export function getPublicDisplayViewerPath(
  projectSlug: string,
  displaySlug: string,
): string {
  return `/view/${encodeHostedRouteSlug(projectSlug)}/${encodeHostedRouteSlug(displaySlug)}`;
}

/** Private authenticated fullscreen output route. */
export function getPrivateDisplayFullscreenPath(
  projectSlug: string,
  displaySlug: string,
): string {
  return `${getPrivateDisplayViewerPath(projectSlug, displaySlug)}/fullscreen`;
}

/** Public fullscreen output route. */
export function getPublicDisplayFullscreenPath(
  projectSlug: string,
  displaySlug: string,
): string {
  return `${getPublicDisplayViewerPath(projectSlug, displaySlug)}/fullscreen`;
}

export function resolveHostedViewerRouteKind(
  visibility: "private" | "public",
  fullscreen = false,
): HostedViewerRouteKind {
  if (visibility === "public") {
    return fullscreen ? "publicFullscreen" : "public";
  }
  return fullscreen ? "privateFullscreen" : "private";
}

export function isHostedFullscreenViewerPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return (
    /^\/view\/[^/]+\/[^/]+\/fullscreen$/.test(path) ||
    /^\/portal\/projects\/[^/]+\/displays\/[^/]+\/fullscreen$/.test(path)
  );
}

export function isHostedViewerPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return (
    isHostedFullscreenViewerPath(path) ||
    /^\/view\/[^/]+\/[^/]+$/.test(path) ||
    /^\/portal\/projects\/[^/]+\/displays\/[^/]+$/.test(path)
  );
}

export function isHostedPublicViewerPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return /^\/view\/[^/]+\/[^/]+$/.test(path);
}

export function isHostedPrivateViewerPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return /^\/portal\/projects\/[^/]+\/displays\/[^/]+$/.test(path);
}

/**
 * Desktop-only operational routes on hosted web.
 * Public canonical JSON links are deferred to a later milestone.
 */
const HOSTED_DESKTOP_ONLY_PATTERNS: RegExp[] = [
  /^\/projects\/[^/]+\/data-engines(?:\/|$)/,
  /^\/projects\/[^/]+\/controller(?:\/|$)/,
  /^\/projects\/[^/]+\/canonical(?:\/|$)/,
  /^\/projects\/[^/]+\/displays\/[^/]+\/edit(?:\/|$)/,
  /^\/projects\/[^/]+\/displays\/archived(?:\/|$)/,
  /^\/projects\/[^/]+\/developer-tools(?:\/|$)/,
  /^\/projects\/[^/]+\/workers(?:\/|$)/,
  /^\/projects\/[^/]+\/activity(?:\/|$)/,
  /^\/projects\/new(?:\/|$)/,
  /^\/dashboard(?:\/|$)/,
  /^\/activity(?:\/|$)/,
  /^\/users(?:\/|$)/,
  /^\/settings(?:\/|$)/,
  /^\/admin(?:\/|$)/,
];

const HOSTED_LEGACY_PORTAL_PREFIXES = [
  "/dashboard",
  "/projects",
  "/users",
  "/activity",
  "/settings",
  "/profile",
  "/admin",
] as const;

export function isHostedDesktopOnlyPath(pathname: string): boolean {
  return HOSTED_DESKTOP_ONLY_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function isHostedLegacyPortalPath(pathname: string): boolean {
  return HOSTED_LEGACY_PORTAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function mapHostedLegacyPathToPortal(pathname: string): string | null {
  if (pathname === "/dashboard") {
    return HOSTED_PORTAL_PATHS.dashboard;
  }
  if (pathname === "/profile") {
    return HOSTED_PORTAL_PATHS.profile;
  }
  if (pathname === "/projects") {
    return HOSTED_PORTAL_PATHS.projects;
  }
  if (pathname.startsWith("/projects/")) {
    return `${HOSTED_PORTAL_PREFIX}${pathname}`;
  }
  if (pathname === "/users") {
    return HOSTED_PORTAL_PATHS.users;
  }
  if (pathname.startsWith("/users/")) {
    return `${HOSTED_PORTAL_PREFIX}${pathname}`;
  }
  if (pathname === "/settings") {
    return HOSTED_PORTAL_PATHS.settings;
  }
  return null;
}
