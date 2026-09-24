import type { AuthorizationContext } from "@/lib/access/types";
import type { LocalProjectsListMeta } from "@/lib/displays/types";
import { HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";

export function isProjectsNavHref(href: string): boolean {
  const normalized = href.split("?")[0]?.split("#")[0] ?? href;
  return normalized === "/projects" || normalized === HOSTED_PORTAL_PATHS.projects;
}

export function isHostedProjectsNavHref(href: string): boolean {
  const normalized = href.split("?")[0]?.split("#")[0] ?? href;
  return normalized === HOSTED_PORTAL_PATHS.projects;
}

/** Same destination as the active environment's Projects page list rows. */
export function buildProjectLandingHref(
  slug: string,
  viewerMode: boolean,
  projectsListHref = "/projects",
): string {
  if (isHostedProjectsNavHref(projectsListHref)) {
    return HOSTED_PORTAL_PATHS.projectDisplays(slug);
  }
  return viewerMode ? `/projects/${slug}/displays` : `/projects/${slug}`;
}

export function resolveProjectsViewerMode(
  meta: LocalProjectsListMeta | null | undefined,
): boolean {
  const context = meta?.authorizationContext as AuthorizationContext | undefined;
  return Boolean(
    context &&
      !context.isPlatformOwner &&
      !context.teamMemberships.some(
        (membership) =>
          membership.role === "admin" &&
          membership.isActive &&
          membership.teamIsActive,
      ) &&
      !context.teamMemberships.some(
        (membership) =>
          membership.role === "operator" &&
          membership.isActive &&
          membership.teamIsActive,
      ),
  );
}

export function extractProjectSlugFromPathname(pathname: string): string | null {
  const normalized = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const desktopMatch = normalized.match(/^\/projects\/(?!new$)([^/]+)/);
  if (desktopMatch?.[1]) {
    return decodeURIComponent(desktopMatch[1]);
  }
  const hostedMatch = normalized.match(/^\/portal\/projects\/(?!new$)([^/]+)/);
  if (hostedMatch?.[1]) {
    return decodeURIComponent(hostedMatch[1]);
  }
  return null;
}
