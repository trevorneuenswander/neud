import { getTrustedPortalOrigin } from "@/lib/env/neud-env";
import { isDesktopRuntimeClient } from "@/lib/runtime/environment";
import {
  getPrivateDisplayFullscreenPath,
  getPrivateDisplayViewerPath,
  getPublicDisplayFullscreenPath,
  getPublicDisplayViewerPath,
  isValidHostedViewerSlug,
  resolveHostedViewerRouteKind,
  type HostedViewerRouteKind,
} from "@/lib/routing/hosted-routes";

export type HostedViewerPathKind =
  | "private"
  | "public"
  | "privateFullscreen"
  | "publicFullscreen";

export function buildHostedViewerPath(
  projectSlug: string,
  displaySlug: string,
  visibility: "private" | "public",
): string | null {
  return resolveHostedViewerPath(projectSlug, displaySlug, visibility);
}

export function buildHostedFullscreenViewerPath(
  projectSlug: string,
  displaySlug: string,
  visibility: "private" | "public",
): string | null {
  if (!isValidHostedViewerSlug(projectSlug) || !isValidHostedViewerSlug(displaySlug)) {
    return null;
  }

  return visibility === "public"
    ? getPublicDisplayFullscreenPath(projectSlug, displaySlug)
    : getPrivateDisplayFullscreenPath(projectSlug, displaySlug);
}

export function resolveHostedViewerPath(
  projectSlug: string,
  displaySlug: string,
  visibility: "private" | "public",
): string | null {
  if (!isValidHostedViewerSlug(projectSlug) || !isValidHostedViewerSlug(displaySlug)) {
    return null;
  }

  return visibility === "public"
    ? getPublicDisplayViewerPath(projectSlug, displaySlug)
    : getPrivateDisplayViewerPath(projectSlug, displaySlug);
}

function normalizeHostedPortalOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function resolveAbsoluteHostedUrl(path: string | null, hostedOrigin?: string | null): string | null {
  if (!path) {
    return null;
  }

  const configuredOrigin =
    (hostedOrigin ? normalizeHostedPortalOrigin(hostedOrigin) : null) ??
    getTrustedPortalOrigin();

  if (configuredOrigin) {
    return `${configuredOrigin}${path}`;
  }

  if (typeof window !== "undefined" && !isDesktopRuntimeClient()) {
    return `${window.location.origin}${path}`;
  }

  return null;
}

export function logHostedViewerUrlDiagnostic(input: {
  hostedOrigin: string | null;
  visibility: "private" | "public";
  projectSlug: string;
  displaySlug: string;
  path: string | null;
  absoluteUrl: string | null;
  routeKind: HostedViewerRouteKind | "invalid";
}): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug("[NEUD HostedViewerUrl]", {
    hostedOrigin: input.hostedOrigin,
    visibility: input.visibility,
    projectSlug: input.projectSlug,
    displaySlug: input.displaySlug,
    path: input.path,
    absoluteUrl: input.absoluteUrl,
    routeKind: input.routeKind,
  });
}

export function buildAbsoluteHostedViewerUrl(
  projectSlug: string,
  displaySlug: string,
  visibility: "private" | "public",
  hostedOrigin?: string | null,
): string | null {
  const path = resolveHostedViewerPath(projectSlug, displaySlug, visibility);
  const routeKind = path ? resolveHostedViewerRouteKind(visibility, false) : "invalid";
  const absoluteUrl = resolveAbsoluteHostedUrl(path, hostedOrigin);

  logHostedViewerUrlDiagnostic({
    hostedOrigin:
      (hostedOrigin ? normalizeHostedPortalOrigin(hostedOrigin) : null) ??
      getTrustedPortalOrigin(),
    visibility,
    projectSlug,
    displaySlug,
    path,
    absoluteUrl,
    routeKind,
  });

  return absoluteUrl;
}

export function buildAbsoluteHostedFullscreenViewerUrl(
  projectSlug: string,
  displaySlug: string,
  visibility: "private" | "public",
  hostedOrigin?: string | null,
): string | null {
  const path = buildHostedFullscreenViewerPath(projectSlug, displaySlug, visibility);
  const routeKind = path ? resolveHostedViewerRouteKind(visibility, true) : "invalid";
  const absoluteUrl = resolveAbsoluteHostedUrl(path, hostedOrigin);

  logHostedViewerUrlDiagnostic({
    hostedOrigin:
      (hostedOrigin ? normalizeHostedPortalOrigin(hostedOrigin) : null) ??
      getTrustedPortalOrigin(),
    visibility,
    projectSlug,
    displaySlug,
    path,
    absoluteUrl,
    routeKind,
  });

  return absoluteUrl;
}
