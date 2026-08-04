import type { Profile } from "@/types/database";

export const PROFILE_TEAM_NOT_SET_LABEL = "Team not set";

type ResolveProfileTeamInput = {
  profileTeam?: string | null;
  syncedLocalTeam?: string | null;
  primaryMembershipTeamName?: string | null;
  legacyCompany?: string | null;
};

export function resolveProfileTeamName(input: ResolveProfileTeamInput): string {
  const profileTeam = input.profileTeam?.trim();
  if (profileTeam) {
    return profileTeam;
  }

  const syncedLocalTeam = input.syncedLocalTeam?.trim();
  if (syncedLocalTeam) {
    return syncedLocalTeam;
  }

  const primaryMembershipTeamName = input.primaryMembershipTeamName?.trim();
  if (primaryMembershipTeamName) {
    return primaryMembershipTeamName;
  }

  const legacyCompany = input.legacyCompany?.trim();
  if (legacyCompany && !profileTeam) {
    return legacyCompany;
  }

  return PROFILE_TEAM_NOT_SET_LABEL;
}

export function resolveSidebarTeamName(
  profile: Pick<Profile, "team">,
  overrides?: Pick<ResolveProfileTeamInput, "syncedLocalTeam" | "primaryMembershipTeamName">,
): string {
  return resolveProfileTeamName({
    profileTeam: profile.team,
    syncedLocalTeam: overrides?.syncedLocalTeam,
    primaryMembershipTeamName: overrides?.primaryMembershipTeamName,
  });
}

export function resolvePrimaryMembershipTeamName(
  memberships: Array<{ teamName: string; isActive: boolean; teamIsActive: boolean }>,
): string | null {
  const activeNames = memberships
    .filter((membership) => membership.isActive && membership.teamIsActive)
    .map((membership) => membership.teamName.trim())
    .filter((name) => name.length > 0)
    .sort((left, right) => left.localeCompare(right));

  return activeNames[0] ?? null;
}
