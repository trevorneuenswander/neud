/** Canonical system NEUD team — matched by normalized name or slug. */
const NEUD_TEAM_IDENTIFIERS = ["neud"] as const;

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
