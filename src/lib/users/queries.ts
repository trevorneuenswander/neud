import { createAdminClient } from "@/lib/supabase/admin";
import {
  getApplicationRole,
  normalizeApplicationRole,
} from "@/lib/auth/application-roles";
import type { PlatformUserListItem, UserAccountStatus } from "@/lib/users/types";
import { shouldUseLocalData } from "@/lib/local/mode";
import { createClient } from "@/lib/supabase/server";

function resolveAccountStatus(input: {
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
}): UserAccountStatus {
  if (input.bannedUntil && Date.parse(input.bannedUntil) > Date.now()) {
    return "deactivated";
  }
  if (!input.emailConfirmedAt) {
    return "invited";
  }
  return "active";
}

export async function countActiveOwners(): Promise<number> {
  if (shouldUseLocalData()) {
    return 0;
  }

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner");

  if (error || count === null) {
    return 0;
  }

  return count;
}

export async function getPlatformUsersDirectory(): Promise<PlatformUserListItem[]> {
  if (shouldUseLocalData()) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_platform_users_directory");

  if (error || !data) {
    return [];
  }

  const rows = data as Array<{
    id: string;
    full_name: string | null;
    team: string | null;
    role: string;
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    banned_until: string | null;
    assigned_project_count: number;
  }>;

  const users = await Promise.all(
    rows.map(async (row) => {
      const assignments = await getUserProjectAssignments(row.id);
      return {
        id: row.id,
        fullName: row.full_name,
        team: row.team,
        email: row.email,
        role: normalizeApplicationRole(row.role),
        accountStatus: resolveAccountStatus({
          emailConfirmedAt: row.email_confirmed_at,
          bannedUntil: row.banned_until,
        }),
        assignedProjectCount: Number(row.assigned_project_count ?? 0),
        createdAt: row.created_at,
        lastSignInAt: row.last_sign_in_at,
        projectAssignments: assignments,
      } satisfies PlatformUserListItem;
    }),
  );

  return users;
}

export async function getUserProjectAssignments(userId: string) {
  if (shouldUseLocalData()) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_user_project_assignments", {
    p_user_id: userId,
  });

  if (error || !data) {
    return [];
  }

  return (data as Array<{
    project_id: string;
    project_name: string;
    project_slug: string;
    access_level: string;
    assigned_at: string;
  }>).map((row) => ({
    projectId: row.project_id,
    projectName: row.project_name,
    projectSlug: row.project_slug,
    accessLevel: row.access_level,
    assignedAt: row.assigned_at,
  }));
}

export async function getProfileById(userId: string) {
  if (shouldUseLocalData()) {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, phone_number, team, role, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    ...data,
    role: getApplicationRole(data),
  };
}

export async function getAssignableProjectsForUserManagement() {
  if (shouldUseLocalData()) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, slug")
    .order("name", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data;
}
