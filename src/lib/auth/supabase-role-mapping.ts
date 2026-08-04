export function mapSupabaseProfileRoleToPlatformRole(
  supabaseRole: string | null | undefined,
): "owner" | "user" {
  return supabaseRole?.trim().toLowerCase() === "owner" ? "owner" : "user";
}

export function mapSupabaseProfileRoleToAuthCacheRole(
  supabaseRole: string | null | undefined,
): string {
  return mapSupabaseProfileRoleToPlatformRole(supabaseRole) === "owner" ? "owner" : "user";
}
