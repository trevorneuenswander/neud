import type { AuthorizationContext } from "@/lib/access/types";
import type { LocalProjectsListMeta } from "@/lib/displays/types";

/** Same destination as Projects page list rows. */
export function buildProjectLandingHref(
  slug: string,
  viewerMode: boolean,
): string {
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
  const match = normalized.match(/^\/projects\/(?!new$)([^/]+)/);
  return match?.[1] ?? null;
}
