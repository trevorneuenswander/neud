import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

export async function getAuthClaims() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  return data.claims;
}

export async function isAuthenticated(): Promise<boolean> {
  const claims = await getAuthClaims();
  return claims !== null;
}

export async function requireAuth(redirectTo = "/login") {
  const claims = await getAuthClaims();

  if (!claims) {
    redirect(redirectTo);
  }

  return claims;
}

export async function redirectIfAuthenticated(redirectTo = "/dashboard") {
  const claims = await getAuthClaims();

  if (claims) {
    redirect(getSafeRedirectPath(redirectTo));
  }
}
