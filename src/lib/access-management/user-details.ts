import type { AccessManagementDirectory } from "@/lib/access-management/types";
import {
  formatProjectAccessSources,
  formatUserTeamLabel,
  isNeudTeamAdminUser,
  isSoleOwnerProfile,
  resolveDisplayTeamRole,
  resolveProjectAccessSources,
  resolveHighestProjectRole,
} from "@/lib/access-management/role-model";
import type { UserDetailsProfile } from "@/lib/users/user-details-types";

function resolvePlatformRoleLabel(
  user: AccessManagementDirectory["users"][number],
  directory: AccessManagementDirectory,
): string {
  if (isSoleOwnerProfile(user)) {
    return "Owner";
  }
  if (isNeudTeamAdminUser(user.id, directory)) {
    return "NEUD Admin";
  }
  const role = (user.platformRole ?? "user").toLowerCase();
  if (role === "owner") {
    return "Owner";
  }
  if (role === "admin") {
    return "Admin";
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function buildCloudUserDetailsProfile(
  userId: string,
  directory: AccessManagementDirectory,
): UserDetailsProfile | null {
  const user = directory.users.find((entry) => entry.id === userId);
  if (!user) {
    return null;
  }

  const teamMemberships = directory.teamMemberships.filter(
    (membership) => membership.userId === userId,
  );
  const primaryTeamMembership = teamMemberships[0];
  const primaryTeam = primaryTeamMembership
    ? directory.teams.find((team) => team.id === primaryTeamMembership.teamId)
    : null;

  const teams = teamMemberships.map((membership) => {
    const team = directory.teams.find((entry) => entry.id === membership.teamId);
    return {
      id: membership.teamId,
      name: team?.name ?? membership.teamId,
      role: team
        ? resolveDisplayTeamRole(userId, team.id, directory)
        : membership.role,
      isActive: team?.isActive ?? true,
    };
  });

  const projects = directory.projects
    .map((project) => {
      const sources = resolveProjectAccessSources(userId, project.id, directory);
      const projectRole = resolveHighestProjectRole(sources);
      if (!projectRole) {
        return null;
      }

      const assignedTeam = directory.projectTeams.find(
        (assignment) => assignment.projectId === project.id,
      );
      const team = assignedTeam
        ? directory.teams.find((entry) => entry.id === assignedTeam.teamId)
        : null;

      return {
        id: project.id,
        slug: project.slug,
        name: project.name,
        teamName: team?.name ?? formatUserTeamLabel(userId, directory),
        role: projectRole,
        accessSource: formatProjectAccessSources(sources),
        isActive: true,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    id: user.id,
    fullName: user.fullName || user.email || user.id,
    email: user.email,
    phone: null,
    teamName: primaryTeam?.name ?? null,
    roleLabel: resolvePlatformRoleLabel(user, directory),
    platformRole: (user.platformRole ?? "user") as UserDetailsProfile["platformRole"],
    source: "supabase",
    isActive: user.accountStatus === "active",
    supabaseUserId: user.id,
    supabaseAccountAvailable: true,
    lastSupabaseSyncAt: null,
    teams: teams.slice(1),
    projects,
  };
}
