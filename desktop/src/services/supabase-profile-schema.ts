export type SupabaseProfileTeamColumn = "team" | "company";

let cachedProfileTeamColumn: SupabaseProfileTeamColumn | null = null;

export function getCachedProfileTeamColumn(): SupabaseProfileTeamColumn | null {
  return cachedProfileTeamColumn;
}

export function setCachedProfileTeamColumn(column: SupabaseProfileTeamColumn): void {
  cachedProfileTeamColumn = column;
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[identity-resolution] Profile schema mode: ${column === "company" ? "legacy-company" : "modern-team"}`,
    );
  }
}

export function resetProfileSchemaCache(): void {
  cachedProfileTeamColumn = null;
}

export function isMissingTeamColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("team") && normalized.includes("does not exist");
}
