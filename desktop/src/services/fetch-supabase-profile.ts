import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCachedProfileTeamColumn,
  isMissingTeamColumnError,
  setCachedProfileTeamColumn,
} from "./supabase-profile-schema";

export type SupabaseProfileRow = {
  id: string;
  full_name: string | null;
  team: string | null;
  email: string | null;
  phone_number: string | null;
  role: string | null;
  updated_at: string | null;
};

export type SupabaseProfileQueryResult =
  | { status: "found"; profile: SupabaseProfileRow }
  | { status: "missing"; error: null }
  | { status: "error"; error: string };

type LegacyProfileRow = {
  id: string;
  full_name: string | null;
  company?: string | null;
  team?: string | null;
  email?: string | null;
  phone_number?: string | null;
  role: string | null;
  updated_at?: string | null;
};

function mapProfileRow(row: LegacyProfileRow): SupabaseProfileRow {
  const team = row.team?.trim() || row.company?.trim() || null;

  return {
    id: row.id,
    full_name: row.full_name?.trim() || null,
    team,
    email: row.email?.trim() || null,
    phone_number: row.phone_number?.trim() || null,
    role: row.role?.trim() || null,
    updated_at: row.updated_at ?? null,
  };
}

export async function fetchSupabaseProfileByUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<SupabaseProfileQueryResult> {
  const cachedColumn = getCachedProfileTeamColumn();
  if (cachedColumn === "company") {
    return fetchLegacyCompanyProfile(supabase, userId);
  }

  const modern = await supabase
    .from("profiles")
    .select("id, full_name, team, email, phone_number, role, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (!modern.error && modern.data) {
    setCachedProfileTeamColumn("team");
    return {
      status: "found",
      profile: mapProfileRow(modern.data as LegacyProfileRow),
    };
  }

  if (modern.error && isMissingTeamColumnError(modern.error.message)) {
    setCachedProfileTeamColumn("company");
    return fetchLegacyCompanyProfile(supabase, userId);
  }

  if (modern.error) {
    return { status: "error", error: modern.error.message };
  }

  if (cachedColumn === "team") {
    return { status: "missing", error: null };
  }

  const legacy = await fetchLegacyCompanyProfile(supabase, userId);
  if (legacy.status === "found") {
    setCachedProfileTeamColumn("company");
  }
  return legacy;
}

async function fetchLegacyCompanyProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<SupabaseProfileQueryResult> {
  const legacy = await supabase
    .from("profiles")
    .select("id, full_name, company, role, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (legacy.error) {
    return { status: "error", error: legacy.error.message };
  }

  if (!legacy.data) {
    return { status: "missing", error: null };
  }

  return {
    status: "found",
    profile: mapProfileRow(legacy.data as LegacyProfileRow),
  };
}
