import { DEFAULT_OWNER_EMAIL } from "@/lib/auth/default-owner-email";
import type {
  AccessManagementDirectory,
  CloudProjectRole,
  CloudTeamRole,
} from "./types";

/** Canonical NEUD team identity — matched by normalized name or slug. */
export const NEUD_TEAM_IDENTIFIERS = ["neud"] as const;

export type DisplayTeamRole = "Owner" | "Admin" | "Member";

export type AssignableTeamRole = Extract<CloudTeamRole, "admin" | "member">;

export const ASSIGNABLE_TEAM_ROLES: AssignableTeamRole[] = ["admin", "member"];

export const PROJECT_ROLES: CloudProjectRole[] = ["manager", "operator", "viewer"];

export type ProjectAccessSource =
  | "Direct"
  | `Team: ${string}`
  | "Global: Owner"
  | "Global: NEUD Admin";

export type ProjectAccessSourceEntry = {
  source: ProjectAccessSource;
  role: string;
};

const PROJECT_ROLE_RANK: Record<string, number> = {
  Manager: 4,
  Operator: 3,
  Viewer: 2,
};

function capitalizeProjectRole(role: string): string {
  const normalized = role.trim().toLowerCase();
  if (normalized === "manager") {
    return "Manager";
  }
  if (normalized === "operator") {
    return "Operator";
  }
  if (normalized === "viewer") {
    return "Viewer";
  }
  return role;
}

function isTeamAdminMembership(role: CloudTeamRole): boolean {
  return role === "admin" || role === "owner";
}

export function hasTeamAssignedManagerAccess(
  userId: string,
  projectId: string,
  directory: Pick<AccessManagementDirectory, "projectTeams" | "teamMemberships">,
): boolean {
  const assignedTeamIds = new Set(
    directory.projectTeams
      .filter((assignment) => assignment.projectId === projectId)
      .map((assignment) => assignment.teamId),
  );

  return directory.teamMemberships.some(
    (membership) =>
      membership.userId === userId &&
      assignedTeamIds.has(membership.teamId) &&
      isTeamAdminMembership(membership.role),
  );
}

export function resolveProjectAccessSources(
  userId: string,
  projectId: string,
  directory: AccessManagementDirectory,
): ProjectAccessSourceEntry[] {
  const sources: ProjectAccessSourceEntry[] = [];
  const user = directory.users.find((entry) => entry.id === userId);

  if (user && isSoleOwnerProfile(user)) {
    sources.push({ source: "Global: Owner", role: "Manager" });
  }
  if (isNeudTeamAdminUser(userId, directory)) {
    sources.push({ source: "Global: NEUD Admin", role: "Manager" });
  }

  const directMembership = directory.projectMembers.find(
    (entry) => entry.projectId === projectId && entry.userId === userId,
  );
  if (directMembership) {
    sources.push({
      source: "Direct",
      role: capitalizeProjectRole(directMembership.role),
    });
  }

  for (const assignment of directory.projectTeams.filter(
    (entry) => entry.projectId === projectId,
  )) {
    const membership = directory.teamMemberships.find(
      (entry) => entry.teamId === assignment.teamId && entry.userId === userId,
    );
    if (!membership || !isTeamAdminMembership(membership.role)) {
      continue;
    }
    const team = directory.teams.find((entry) => entry.id === assignment.teamId);
    const teamName = team?.name ?? assignment.teamId;
    sources.push({
      source: `Team: ${teamName}`,
      role: "Manager",
    });
  }

  return sources;
}

export function resolveHighestProjectRole(
  sources: ProjectAccessSourceEntry[],
): string | null {
  if (sources.length === 0) {
    return null;
  }

  return sources.reduce((highest, entry) => {
    const currentRank = PROJECT_ROLE_RANK[entry.role] ?? 0;
    const highestRank = highest ? PROJECT_ROLE_RANK[highest] ?? 0 : 0;
    return currentRank > highestRank ? entry.role : highest;
  }, null as string | null);
}

export function formatProjectAccessSources(
  sources: ProjectAccessSourceEntry[],
): ProjectAccessSource | string {
  if (sources.length === 0) {
    return "Direct";
  }
  return sources.map((entry) => entry.source).join(", ");
}

export type ProjectAccessRow = {
  key: string;
  userId: string;
  userName: string;
  userEmail: string;
  teamLabel: string;
  accessSource: string;
  accessSources: ProjectAccessSourceEntry[];
  projectRole: string;
  status: string;
  isMutable: boolean;
};

export type ResolvedAccessCapabilities = {
  currentUserId: string | null;
  isSoleOwner: boolean;
  hasSiteWideAccess: boolean;
  isNeudTeamAdmin: boolean;
  managedTeamIds: string[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isNeudTeam(team: { name: string; slug?: string }): boolean {
  const name = normalize(team.name);
  const slug = normalize(team.slug ?? "");
  return NEUD_TEAM_IDENTIFIERS.some((id) => id === name || id === slug);
}

export function findNeudTeam(directory: Pick<AccessManagementDirectory, "teams">) {
  return directory.teams.find((team) => isNeudTeam(team)) ?? null;
}

export function isSoleOwnerProfile(user: {
  id: string;
  email: string;
  platformRole?: string;
}): boolean {
  return (
    normalize(user.email) === normalize(DEFAULT_OWNER_EMAIL) &&
    (user.platformRole ?? "").toLowerCase() === "owner"
  );
}

export function isNeudTeamAdminUser(
  userId: string,
  directory: Pick<AccessManagementDirectory, "teams" | "teamMemberships">,
): boolean {
  const neudTeam = findNeudTeam(directory);
  if (!neudTeam) {
    return false;
  }
  return directory.teamMemberships.some(
    (membership) =>
      membership.userId === userId &&
      membership.teamId === neudTeam.id &&
      membership.role === "admin",
  );
}

export function hasSiteWideAccessForUser(
  userId: string | null | undefined,
  directory: Pick<AccessManagementDirectory, "users" | "teams" | "teamMemberships">,
): boolean {
  if (!userId) {
    return false;
  }
  const user = directory.users.find((entry) => entry.id === userId);
  if (user && isSoleOwnerProfile(user)) {
    return true;
  }
  return isNeudTeamAdminUser(userId, directory);
}

export function resolveAccessCapabilities(
  directory: Pick<AccessManagementDirectory, "users" | "teams" | "teamMemberships">,
  currentUserId: string | null | undefined,
): ResolvedAccessCapabilities {
  const user = currentUserId
    ? directory.users.find((entry) => entry.id === currentUserId)
    : null;
  const isSoleOwner = user ? isSoleOwnerProfile(user) : false;
  const isNeudTeamAdmin = currentUserId
    ? isNeudTeamAdminUser(currentUserId, directory)
    : false;
  const hasSiteWideAccess = isSoleOwner || isNeudTeamAdmin;
  const managedTeamIds = hasSiteWideAccess
    ? directory.teams.map((team) => team.id)
    : directory.teamMemberships
        .filter(
          (membership) =>
            membership.userId === currentUserId && membership.role === "admin",
        )
        .map((membership) => membership.teamId);

  return {
    currentUserId: currentUserId ?? null,
    isSoleOwner,
    hasSiteWideAccess,
    isNeudTeamAdmin,
    managedTeamIds,
  };
}

export function canManageTeam(
  capabilities: ResolvedAccessCapabilities,
  teamId: string,
): boolean {
  return (
    capabilities.hasSiteWideAccess || capabilities.managedTeamIds.includes(teamId)
  );
}

export function hasEffectiveProjectManagerAccess(
  currentUserId: string | null | undefined,
  projectId: string,
  directory: Pick<
    AccessManagementDirectory,
    "projectMembers" | "projectTeams" | "teamMemberships" | "users" | "teams"
  >,
  capabilities?: Pick<ResolvedAccessCapabilities, "hasSiteWideAccess">,
): boolean {
  if (capabilities?.hasSiteWideAccess) {
    return true;
  }
  if (!currentUserId) {
    return false;
  }
  if (hasTeamAssignedManagerAccess(currentUserId, projectId, directory)) {
    return true;
  }
  const membership = directory.projectMembers.find(
    (entry) => entry.projectId === projectId && entry.userId === currentUserId,
  );
  return membership?.role === "manager";
}

export function canManageProjectAccess(
  capabilities: ResolvedAccessCapabilities,
  projectId: string,
  directory: Pick<
    AccessManagementDirectory,
    "projectMembers" | "projectTeams" | "teamMemberships" | "users" | "teams"
  >,
  currentUserId: string | null | undefined,
): boolean {
  return hasEffectiveProjectManagerAccess(currentUserId, projectId, directory, capabilities);
}

export function resolveDisplayTeamRole(
  userId: string,
  teamId: string,
  directory: Pick<AccessManagementDirectory, "users" | "teamMemberships" | "teams">,
): DisplayTeamRole {
  const user = directory.users.find((entry) => entry.id === userId);
  const neudTeam = findNeudTeam(directory);
  if (user && isSoleOwnerProfile(user) && neudTeam && teamId === neudTeam.id) {
    return "Owner";
  }
  const membership = directory.teamMemberships.find(
    (entry) => entry.userId === userId && entry.teamId === teamId,
  );
  if (!membership) {
    return "Member";
  }
  if (membership.role === "admin") {
    return "Admin";
  }
  if (membership.role === "owner") {
    return "Admin";
  }
  return "Member";
}

export function listActiveTeamNamesForUser(
  userId: string,
  directory: Pick<AccessManagementDirectory, "teams" | "teamMemberships" | "users">,
): string[] {
  const user = directory.users.find((entry) => entry.id === userId);
  const neudTeam = findNeudTeam(directory);
  const teamIds = new Set(
    directory.teamMemberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => membership.teamId),
  );

  if (user && isSoleOwnerProfile(user) && neudTeam) {
    teamIds.add(neudTeam.id);
  }

  return directory.teams
    .filter((team) => teamIds.has(team.id))
    .map((team) => team.name)
    .sort((left, right) => left.localeCompare(right));
}

export function formatUserTeamLabel(
  userId: string,
  directory: Pick<AccessManagementDirectory, "teams" | "teamMemberships" | "users">,
): string {
  const names = listActiveTeamNamesForUser(userId, directory);
  return names.length > 0 ? names.join(", ") : "No Team";
}

export function formatUserWithTeams(
  user: { id: string; fullName: string; email: string },
  directory: Pick<AccessManagementDirectory, "teams" | "teamMemberships" | "users">,
): string {
  const displayName = user.fullName.trim() || user.email.trim() || user.id;
  const teamLabel = formatUserTeamLabel(user.id, directory);
  return `${displayName} — ${teamLabel}`;
}

export function resolveUserAccessScope(
  userId: string,
  directory: Pick<AccessManagementDirectory, "users" | "teams" | "teamMemberships">,
): string {
  const user = directory.users.find((entry) => entry.id === userId);
  if (user && isSoleOwnerProfile(user)) {
    return "All teams and projects";
  }
  if (isNeudTeamAdminUser(userId, directory)) {
    return "All teams and projects";
  }

  const teamNames = listActiveTeamNamesForUser(userId, directory);
  if (teamNames.length === 0) {
    return "Assigned projects only";
  }
  const adminTeams = directory.teamMemberships
    .filter(
      (membership) => membership.userId === userId && membership.role === "admin",
    )
    .map((membership) => directory.teams.find((team) => team.id === membership.teamId)?.name)
    .filter(Boolean) as string[];

  if (adminTeams.length > 0) {
    return `${adminTeams.join(", ")} and assigned projects`;
  }
  return `${teamNames.join(", ")} and assigned projects`;
}

export function summarizeTeamRolesForUser(
  userId: string,
  directory: Pick<AccessManagementDirectory, "teams" | "teamMemberships" | "users">,
): string {
  const user = directory.users.find((entry) => entry.id === userId);
  const neudTeam = findNeudTeam(directory);
  const parts: string[] = [];

  if (user && isSoleOwnerProfile(user) && neudTeam) {
    parts.push(`${neudTeam.name}: Owner`);
  }

  for (const membership of directory.teamMemberships.filter(
    (entry) => entry.userId === userId,
  )) {
    const team = directory.teams.find((entry) => entry.id === membership.teamId);
    if (!team) {
      continue;
    }
    if (user && isSoleOwnerProfile(user) && neudTeam && team.id === neudTeam.id) {
      continue;
    }
    const role = resolveDisplayTeamRole(userId, membership.teamId, directory);
    parts.push(`${team.name}: ${role}`);
  }

  return parts.length > 0 ? parts.join("; ") : "—";
}

export function countDirectProjectAccess(
  userId: string,
  directory: Pick<AccessManagementDirectory, "projectMembers">,
): number {
  return directory.projectMembers.filter((membership) => membership.userId === userId).length;
}

export function countTeamProjects(
  teamId: string,
  directory: Pick<AccessManagementDirectory, "projectTeams">,
): number {
  return directory.projectTeams.filter((assignment) => assignment.teamId === teamId).length;
}

export function buildProjectAccessRows(
  projectId: string,
  directory: AccessManagementDirectory,
): ProjectAccessRow[] {
  const userIds = new Set<string>();

  for (const member of directory.projectMembers.filter(
    (entry) => entry.projectId === projectId,
  )) {
    userIds.add(member.userId);
  }

  for (const assignment of directory.projectTeams.filter(
    (entry) => entry.projectId === projectId,
  )) {
    for (const membership of directory.teamMemberships.filter(
      (entry) => entry.teamId === assignment.teamId && isTeamAdminMembership(entry.role),
    )) {
      userIds.add(membership.userId);
    }
  }

  for (const user of directory.users) {
    if (isSoleOwnerProfile(user) || isNeudTeamAdminUser(user.id, directory)) {
      userIds.add(user.id);
    }
  }

  const rows: ProjectAccessRow[] = [];

  for (const userId of userIds) {
    const sources = resolveProjectAccessSources(userId, projectId, directory);
    const projectRole = resolveHighestProjectRole(sources);
    if (!projectRole) {
      continue;
    }

    const user = directory.users.find((entry) => entry.id === userId);
    const membership = directory.teamMemberships.find((entry) => entry.userId === userId);
    const hasDirectMembership = directory.projectMembers.some(
      (entry) => entry.projectId === projectId && entry.userId === userId,
    );

    rows.push({
      key: `user:${userId}`,
      userId,
      userName: user?.fullName || membership?.userName || userId,
      userEmail: user?.email || membership?.userEmail || "",
      teamLabel: formatUserTeamLabel(userId, directory),
      accessSource: formatProjectAccessSources(sources),
      accessSources: sources,
      projectRole,
      status: user?.accountStatus ?? "active",
      isMutable: hasDirectMembership,
    });
  }

  return rows.sort((left, right) => left.userName.localeCompare(right.userName));
}

export function matchesUserDirectorySearch(
  user: AccessManagementDirectory["users"][number],
  directory: Pick<
    AccessManagementDirectory,
    "teams" | "teamMemberships" | "projects" | "projectMembers" | "users"
  >,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const teamNames = listActiveTeamNamesForUser(user.id, directory).join(" ").toLowerCase();
  const teamRoles = summarizeTeamRolesForUser(user.id, directory).toLowerCase();
  const projectAccess = directory.projectMembers
    .filter((membership) => membership.userId === user.id)
    .map((membership) => {
      const project = directory.projects.find((entry) => entry.id === membership.projectId);
      return `${project?.name ?? membership.projectId} ${membership.role}`;
    })
    .join(" ")
    .toLowerCase();

  return (
    user.fullName.toLowerCase().includes(normalized) ||
    user.email.toLowerCase().includes(normalized) ||
    teamNames.includes(normalized) ||
    teamRoles.includes(normalized) ||
    projectAccess.includes(normalized)
  );
}

export function formatTeamRoleActivityLabel(role: AssignableTeamRole): string {
  return role === "admin" ? "Admin" : "Member";
}

export function formatProjectRoleActivityLabel(role: CloudProjectRole): string {
  if (role === "manager") {
    return "Manager";
  }
  if (role === "operator") {
    return "Operator";
  }
  return "Viewer";
}
