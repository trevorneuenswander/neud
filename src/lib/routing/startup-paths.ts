import { BROAD_ARROW_DEFAULT_PROJECT_SLUG } from "@/lib/projects/default-project";

/** Safe authenticated landing route when a project-specific path is unavailable. */
export const DEFAULT_AUTHENTICATED_LANDING_PATH = "/projects";

/** Default post-login route for hosted portal mode. */
export const DEFAULT_HOSTED_LANDING_PATH = "/portal";

/** Exact paths replaced for legacy URL redirects only (HMG → NEUD migration). */
const EXACT_PATH_MIGRATIONS: Record<string, string> = {
  "/overview": DEFAULT_AUTHENTICATED_LANDING_PATH,
  "/hmg": DEFAULT_AUTHENTICATED_LANDING_PATH,
  "/hmg-graphics-server": DEFAULT_AUTHENTICATED_LANDING_PATH,
  "/projects/hmg-graphics-server": DEFAULT_AUTHENTICATED_LANDING_PATH,
  "/project-x": DEFAULT_AUTHENTICATED_LANDING_PATH,
};

const OBSOLETE_PROJECT_SUBROUTES = ["/controllers", "/members"] as const;

export function isInternalApplicationPath(path: string): boolean {
  const trimmed = path.trim();
  return (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("://") &&
    !trimmed.includes("\\")
  );
}

export function isObsoleteApplicationPath(pathname: string): boolean {
  if (EXACT_PATH_MIGRATIONS[pathname]) {
    return true;
  }

  return OBSOLETE_PROJECT_SUBROUTES.some((segment) =>
    pathname.endsWith(segment),
  );
}

export function migrateApplicationPath(pathname: string): string {
  const exact = EXACT_PATH_MIGRATIONS[pathname];
  if (exact) {
    return exact;
  }

  for (const segment of OBSOLETE_PROJECT_SUBROUTES) {
    if (pathname.endsWith(segment)) {
      const projectRoot = pathname.slice(0, -segment.length);
      return projectRoot.length > 0 ? projectRoot : DEFAULT_AUTHENTICATED_LANDING_PATH;
    }
  }

  return pathname;
}

export function normalizeApplicationPath(
  path: string | null | undefined,
  fallback = DEFAULT_AUTHENTICATED_LANDING_PATH,
): string {
  if (!path) {
    return fallback;
  }

  const trimmed = path.trim();
  if (!isInternalApplicationPath(trimmed)) {
    return fallback;
  }

  const pathname = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  if (!pathname || pathname === "/") {
    return "/";
  }

  const migrated = migrateApplicationPath(pathname);
  if (isObsoleteApplicationPath(pathname) && migrated === pathname) {
    return fallback;
  }

  return migrated;
}

export function getDefaultProjectEnginePath(slug: string): string {
  return `/projects/${slug}/data-engines`;
}

export function getPreferredAuthenticatedLandingPath(
  useLocalData: boolean,
  defaultProjectSlug = BROAD_ARROW_DEFAULT_PROJECT_SLUG,
): string {
  if (!useLocalData) {
    return DEFAULT_HOSTED_LANDING_PATH;
  }

  return getDefaultProjectEnginePath(defaultProjectSlug);
}

export function resolveAuthenticatedLandingPath(
  useLocalData: boolean,
  options?: {
    defaultProjectSlug?: string | null;
    projectExists?: boolean;
  },
): string {
  if (!useLocalData) {
    return DEFAULT_HOSTED_LANDING_PATH;
  }

  const slug = options?.defaultProjectSlug?.trim();
  if (slug && options?.projectExists !== false) {
    return getDefaultProjectEnginePath(slug);
  }

  return DEFAULT_AUTHENTICATED_LANDING_PATH;
}
