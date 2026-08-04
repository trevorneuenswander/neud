import type { AppSettingsRepository } from "../repositories/app-settings-repository";

export const DESKTOP_LAST_ROUTE_SETTING_KEY = "ui.last_route";

/** Root login route; auth middleware chooses the post-login destination. */
export const DESKTOP_DEFAULT_STARTUP_PATH = "/";

export const DESKTOP_FALLBACK_LANDING_PATH = "/projects";

const EXACT_PATH_MIGRATIONS: Record<string, string> = {
  "/overview": DESKTOP_FALLBACK_LANDING_PATH,
  "/hmg": DESKTOP_FALLBACK_LANDING_PATH,
  "/hmg-graphics-server": DESKTOP_FALLBACK_LANDING_PATH,
  "/projects/hmg-graphics-server": DESKTOP_FALLBACK_LANDING_PATH,
  "/project-x": DESKTOP_FALLBACK_LANDING_PATH,
};

const OBSOLETE_PROJECT_SUBROUTES = ["/controllers", "/members"] as const;

export function isInternalStartupPath(path: string): boolean {
  const trimmed = path.trim();
  return (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("://") &&
    !trimmed.includes("\\")
  );
}

export function migrateStartupPath(pathname: string): string {
  const exact = EXACT_PATH_MIGRATIONS[pathname];
  if (exact) {
    return exact;
  }

  for (const segment of OBSOLETE_PROJECT_SUBROUTES) {
    if (pathname.endsWith(segment)) {
      const projectRoot = pathname.slice(0, -segment.length);
      return projectRoot.length > 0 ? projectRoot : DESKTOP_FALLBACK_LANDING_PATH;
    }
  }

  return pathname;
}

export function normalizeStartupPath(
  savedPath: string | null | undefined,
  fallback = DESKTOP_DEFAULT_STARTUP_PATH,
): string {
  if (!savedPath) {
    return fallback;
  }

  const trimmed = savedPath.trim();
  if (!isInternalStartupPath(trimmed)) {
    return fallback;
  }

  const pathname = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  if (!pathname) {
    return fallback;
  }

  return migrateStartupPath(pathname);
}

export function joinRendererUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  if (path === "/") {
    return `${normalizedBase}/`;
  }

  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export function resolveDesktopStartupPath(input: {
  savedPath?: string | null;
  preferredPath?: string | null;
}): string {
  const saved = normalizeStartupPath(input.savedPath, DESKTOP_DEFAULT_STARTUP_PATH);
  if (saved !== DESKTOP_DEFAULT_STARTUP_PATH) {
    return saved;
  }

  if (input.preferredPath) {
    return normalizeStartupPath(input.preferredPath, DESKTOP_DEFAULT_STARTUP_PATH);
  }

  return DESKTOP_DEFAULT_STARTUP_PATH;
}

export function resolveVerifiedProjectStartupPath(input: {
  defaultProjectSlug?: string | null;
  projectExists: (slug: string) => boolean;
}): string {
  const slug = input.defaultProjectSlug?.trim();
  if (slug && input.projectExists(slug)) {
    return `/projects/${slug}/data-engines`;
  }

  return DESKTOP_FALLBACK_LANDING_PATH;
}

export function readSavedStartupPath(
  settings: AppSettingsRepository,
): string | null {
  const value = settings.get<string | null>(DESKTOP_LAST_ROUTE_SETTING_KEY, null);
  return typeof value === "string" ? value : null;
}

export function persistStartupPath(
  settings: AppSettingsRepository,
  path: string,
): void {
  const normalized = normalizeStartupPath(path, DESKTOP_DEFAULT_STARTUP_PATH);
  if (normalized === DESKTOP_DEFAULT_STARTUP_PATH) {
    return;
  }

  settings.set(DESKTOP_LAST_ROUTE_SETTING_KEY, normalized);
}

export function clearSavedStartupPath(settings: AppSettingsRepository): void {
  settings.set(DESKTOP_LAST_ROUTE_SETTING_KEY, null);
}
