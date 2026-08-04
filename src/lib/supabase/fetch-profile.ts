import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientProfileRow = {
  role: string | null;
  full_name: string | null;
  team: string | null;
};

type LegacyClientProfileRow = {
  role: string | null;
  full_name: string | null;
  company?: string | null;
  team?: string | null;
};

function isMissingColumnError(message: string, column: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes(column.toLowerCase()) && normalized.includes("does not exist");
}

export async function fetchClientProfileByUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ profile: ClientProfileRow | null; error: string | null }> {
  const modern = await supabase
    .from("profiles")
    .select("role, full_name, team")
    .eq("id", userId)
    .maybeSingle();

  if (!modern.error && modern.data) {
    const row = modern.data as LegacyClientProfileRow;
    return {
      profile: {
        role: row.role,
        full_name: row.full_name,
        team: row.team?.trim() || row.company?.trim() || null,
      },
      error: null,
    };
  }

  if (modern.error && !isMissingColumnError(modern.error.message, "team")) {
    return { profile: null, error: modern.error.message };
  }

  const legacy = await supabase
    .from("profiles")
    .select("role, full_name, company")
    .eq("id", userId)
    .maybeSingle();

  if (legacy.error) {
    return { profile: null, error: legacy.error.message };
  }

  if (!legacy.data) {
    return { profile: null, error: null };
  }

  const row = legacy.data as LegacyClientProfileRow;
  return {
    profile: {
      role: row.role,
      full_name: row.full_name,
      team: row.company?.trim() || null,
    },
    error: null,
  };
}
