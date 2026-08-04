import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isPlatformAdministrator,
} from "@/lib/auth/platform-permissions";
import { resolveLocalAuthenticatedPrincipal } from "@/lib/local/auth.server";
import { shouldUseLocalData } from "@/lib/local/mode";
import { normalizeApplicationRole } from "@/lib/auth/application-roles";
import type { Profile } from "@/types/database";

export {
  canAssignRole,
  canAssignUserToProject,
  canCreateProject,
  canCreateUser,
  canDeleteProject,
  canDeleteUser,
  canEditUser,
  canInviteUser,
  canManageApplication,
  canManageProject,
  canOperateProject,
  canRemoveUserFromProject,
  canViewProject,
  canViewUserList,
  hasGlobalProjectAccess,
  isPlatformAdministrator,
} from "@/lib/auth/platform-permissions";

type LegacyProfileRow = {
  id: string;
  full_name: string | null;
  company: string | null;
  role: Profile["role"];
  created_at: string;
  updated_at: string;
};

function mapLegacyProfile(row: LegacyProfileRow): Profile {
  return {
    id: row.id,
    full_name: row.full_name,
    email: null,
    phone_number: null,
    team: row.company,
    role: row.role,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getHostedProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone_number, team, role, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (!error && data) {
    return data as Profile;
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from("profiles")
    .select("id, full_name, company, role, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (legacyError || !legacyData) {
    return null;
  }

  return mapLegacyProfile(legacyData as LegacyProfileRow);
}

export async function getCurrentProfile(): Promise<Profile | null> {
  if (shouldUseLocalData()) {
    const principal = await resolveLocalAuthenticatedPrincipal();
    if (!principal) {
      return null;
    }
    return buildLocalProfileForSession(principal);
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return null;
  }

  return getHostedProfile(claimsData.claims.sub);
}

export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile !== null && isPlatformAdministrator(profile);
}

export async function requireUser(redirectTo = "/") {
  if (shouldUseLocalData()) {
    const principal = await resolveLocalAuthenticatedPrincipal();
    if (!principal) {
      redirect(redirectTo);
    }

    const profile = buildLocalProfileForSession(principal);
    return {
      claims: { sub: principal.userId },
      profile,
    };
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect(redirectTo);
  }

  const profile = await getHostedProfile(claimsData.claims.sub);

  if (!profile) {
    redirect(redirectTo);
  }

  return { claims: claimsData.claims, profile };
}

function buildLocalProfileForSession(principal: {
  userId: string;
  role?: string | null;
  email?: string | null;
  displayName?: string | null;
  team?: string | null;
}): Profile {
  return {
    id: principal.userId,
    full_name: principal.displayName ?? null,
    email: principal.email ?? null,
    phone_number: null,
    team: principal.team ?? null,
    role: normalizeApplicationRole(principal.role),
    created_at: "",
    updated_at: "",
  };
}

export async function requireAdmin(redirectTo = "/dashboard") {
  const { claims, profile } = await requireUser();

  if (!isPlatformAdministrator(profile)) {
    redirect(redirectTo);
  }

  return { claims, profile };
}
