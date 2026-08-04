import { DEFAULT_REDIRECT, getSafeRedirectPath } from "@/lib/auth/redirect";
import {
  HOSTED_PORTAL_PREFIX,
  isHostedDesktopOnlyPath,
} from "@/lib/routing/hosted-routes";
import { isInternalApplicationPath } from "@/lib/routing/startup-paths";

const HOSTED_AUTH_ROUTES = new Set([
  "/",
  "/login",
  "/signup",
  "/request-access",
  "/forgot-password",
]);

/** Safe post-login destinations for hosted web (portal + public viewers). */
export function getSafeHostedRedirectPath(
  path: string | null | undefined,
  fallback = DEFAULT_REDIRECT,
): string {
  if (!path) {
    return fallback;
  }

  const trimmed = path.trim();
  if (!isInternalApplicationPath(trimmed)) {
    return fallback;
  }

  const pathname = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  if (!pathname || HOSTED_AUTH_ROUTES.has(pathname)) {
    return fallback;
  }

  if (isHostedDesktopOnlyPath(pathname)) {
    return fallback;
  }

  if (
    pathname === HOSTED_PORTAL_PREFIX ||
    pathname.startsWith(`${HOSTED_PORTAL_PREFIX}/`) ||
    pathname.startsWith("/view/")
  ) {
    return getSafeRedirectPath(pathname, fallback);
  }

  return fallback;
}
