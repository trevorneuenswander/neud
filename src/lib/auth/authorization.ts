import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PlatformRole, Profile } from "@/types/database";

const PLATFORM_ADMIN_ROLES: PlatformRole[] = ["owner", "admin"];

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return null;
  }

  const userId = claimsData.claims.sub;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, company, role, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Profile;
}

export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile !== null && PLATFORM_ADMIN_ROLES.includes(profile.role);
}

export async function requireUser(redirectTo = "/login") {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect(redirectTo);
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    redirect(redirectTo);
  }

  return { claims: claimsData.claims, profile };
}

export async function requireAdmin(redirectTo = "/dashboard") {
  const { claims, profile } = await requireUser();

  if (!PLATFORM_ADMIN_ROLES.includes(profile.role)) {
    redirect(redirectTo);
  }

  return { claims, profile };
}
