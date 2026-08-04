import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import {
  DEFAULT_HOSTED_LANDING_PATH,
} from "@/lib/routing/startup-paths";
import {
  HOSTED_PORTAL_PREFIX,
  isHostedDesktopOnlyPath,
  isHostedLegacyPortalPath,
  isHostedViewerPath,
  mapHostedLegacyPathToPortal,
} from "@/lib/routing/hosted-routes";
import { shouldUseLocalData } from "@/lib/local/mode";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/projects",
  "/admin",
  "/users",
  "/activity",
  "/settings",
  HOSTED_PORTAL_PREFIX,
];
const AUTH_ROUTES = ["/", "/login", "/signup", "/request-access", "/forgot-password"];

function isAuthRoute(pathname: string): boolean {
  if (AUTH_ROUTES.includes(pathname)) {
    return true;
  }

  return pathname.startsWith("/auth/reset-password");
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  if (shouldUseLocalData()) {
    return NextResponse.next({
      request,
    });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!isHostedViewerPath(pathname) && isHostedDesktopOnlyPath(pathname)) {
    const portalUrl = request.nextUrl.clone();
    portalUrl.pathname = DEFAULT_HOSTED_LANDING_PATH;
    portalUrl.search = "";
    return NextResponse.redirect(portalUrl);
  }

  if (isHostedLegacyPortalPath(pathname)) {
    const mapped = mapHostedLegacyPathToPortal(pathname);
    if (mapped && mapped !== pathname) {
      const portalUrl = request.nextUrl.clone();
      portalUrl.pathname = mapped;
      return NextResponse.redirect(portalUrl);
    }
  }

  if (!isAuthenticated && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "next",
      getSafeRedirectPath(`${pathname}${request.nextUrl.search}`),
    );
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isAuthRoute(pathname)) {
    const landingUrl = request.nextUrl.clone();
    landingUrl.pathname = DEFAULT_HOSTED_LANDING_PATH;
    landingUrl.search = "";
    return NextResponse.redirect(landingUrl);
  }

  return supabaseResponse;
}
