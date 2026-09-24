/** Canonical system NEUD team — matched by normalized name or slug. */
export const NEUD_TEAM_IDENTIFIERS = ["neud"] as const;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isProtectedNeudTeam(team: {
  name: string;
  slug?: string | null;
}): boolean {
  const name = normalize(team.name);
  const slug = normalize(team.slug ?? "");
  return NEUD_TEAM_IDENTIFIERS.some(
    (identifier) => name === identifier || slug === identifier,
  );
}

export function isProtectedNeudTeamId(
  teamId: string,
  directory: { teams: Array<{ id: string; name: string; slug: string }> },
): boolean {
  const team = directory.teams.find((entry) => entry.id === teamId);
  return team ? isProtectedNeudTeam(team) : false;
}
