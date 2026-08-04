import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_REDIRECT, getSafeRedirectPath } from "@/lib/auth/redirect";
import { resolveAuthenticatedLandingPath } from "@/lib/routing/startup-paths";
import { resolveLocalAuthenticatedPrincipal } from "@/lib/local/auth.server";
import { shouldUseLocalData } from "@/lib/local/mode";

export async function getAuthClaims() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  return data.claims;
}

export async function isAuthenticated(): Promise<boolean> {
  if (shouldUseLocalData()) {
    const principal = await resolveLocalAuthenticatedPrincipal();
    return principal !== null;
  }

  const claims = await getAuthClaims();
  return claims !== null;
}

export async function requireAuth(redirectTo = "/") {
  const claims = await getAuthClaims();

  if (!claims) {
    redirect(redirectTo);
  }

  return claims;
}

export async function redirectIfAuthenticated(
  redirectTo?: string,
) {
  if (shouldUseLocalData()) {
    const principal = await resolveLocalAuthenticatedPrincipal();
    if (principal) {
      const destination =
        redirectTo ?? resolveAuthenticatedLandingPath(true);
      redirect(getSafeRedirectPath(destination));
    }
    return;
  }

  const claims = await getAuthClaims();

  if (claims) {
    const destination = redirectTo ?? DEFAULT_REDIRECT;
    redirect(getSafeRedirectPath(destination));
  }
}
