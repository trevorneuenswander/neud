import type { AuthLicenseManager } from "./auth-license-manager";
import type { LocalUsersRepository } from "../repositories/local-users-repository";
import type { TeamsRepository } from "../repositories/teams-repository";
import type { TeamMembershipsRepository } from "../repositories/team-memberships-repository";
import type { ProjectMembershipsRepository } from "../repositories/project-memberships-repository";
import type { ProjectTeamAssignmentsRepository } from "../repositories/project-team-assignments-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import type { LocalProject } from "../repositories/projects-repository";
import {
  EMPTY_CAPABILITIES,
  type AuthorizationContext,
  type ProjectAccessCapabilities,
  type ProjectAccessPath,
  type TeamRole,
} from "./access-types";
import { isProtectedNeudOwnerUser } from "../access/protect-project-owner";
import { normalizeProjectIsActive } from "../projects/project-permissions";
import { normalizeEmail } from "../auth/normalize-email";
import { abbreviateUserId } from "../auth/local-desktop-identity";
import { mapSupabaseProfileRoleToPlatformRole } from "./user-identity-reconciliation-service";
import {
  logIdentityResolutionDiagnostics,
  resolveAuthenticatedProfile,
  type ResolvedAuthenticatedProfile,
} from "./resolve-authenticated-profile";
import {
  canViewUserDetailsInDirectory,
  type UserDetailsDirectory,
} from "../access/can-view-user-details";
import { canDeleteUserInDirectory } from "../access/can-delete-user";

export class AccessAuthorizationService {
  constructor(
    private readonly auth: AuthLicenseManager,
    private readonly users: LocalUsersRepository,
    private readonly teams: TeamsRepository,
    private readonly teamMemberships: TeamMembershipsRepository,
    private readonly projectMemberships: ProjectMembershipsRepository,
    private readonly projectTeams: ProjectTeamAssignmentsRepository,
    private readonly projects: ProjectsRepository,
    private readonly dataSources: DataSourcesRepository,
  ) {}

  getCurrentUserId(): string | null {
    return this.auth.getAuthenticatedUser()?.userId ?? null;
  }

  resolveAuthenticatedProfile(): ResolvedAuthenticatedProfile {
    const profile = resolveAuthenticatedProfile({
      auth: this.auth,
      users: this.users,
      accessAuthorization: this,
    });
    logIdentityResolutionDiagnostics(profile, this.auth.getAuthenticatedUser());
    return profile;
  }

  getAuthorizationContext(userId?: string | null): AuthorizationContext | null {
    const resolvedAuthUserId = userId ?? this.getCurrentUserId();
    if (!resolvedAuthUserId) {
      return null;
    }

    const authUser = this.auth.getAuthenticatedUser();
    const user =
      this.users.resolveByAuthUserId(resolvedAuthUserId) ??
      this.users.getById(resolvedAuthUserId) ??
      (authUser?.email ? this.users.getByEmail(authUser.email) : null);
    if (!user || !user.isActive) {
      return this.buildSupabaseVerifiedOwnerContext(resolvedAuthUserId, authUser);
    }

    if (
      process.env.NODE_ENV !== "production" &&
      user.supabaseUserId &&
      user.supabaseUserId !== resolvedAuthUserId &&
      authUser?.email &&
      normalizeEmail(user.email) === normalizeEmail(authUser.email)
    ) {
      console.warn(
        `[identity-resolution] Stale local Supabase link detected for ${abbreviateUserId(resolvedAuthUserId)}; using email-linked local user ${abbreviateUserId(user.id)}.`,
      );
    }

    const memberships = this.teamMemberships.listForUser(user.id);
    const teamMemberships = memberships
      .map((membership) => {
        const team = this.teams.getById(membership.teamId);
        if (!team) {
          return null;
        }
        return {
          teamId: team.id,
          teamName: team.name,
          teamIsActive: team.isActive,
          role: membership.role,
          isActive: membership.isActive,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const accessibleTeamIds = this.resolveAccessibleTeamIds(user.platformRole, teamMemberships);
    const accessibleProjectIds = this.resolveAccessibleProjectIds(
      user.id,
      user.platformRole,
      teamMemberships,
    );

    return {
      userId: user.id,
      email: user.email,
      displayName: user.fullName,
      platformRole: user.platformRole,
      isPlatformOwner: user.platformRole === "owner",
      isActive: user.isActive,
      teamMemberships,
      accessibleTeamIds,
      accessibleProjectIds,
      canManageUsersAndAccess:
        user.platformRole === "owner" ||
        teamMemberships.some(
          (membership) =>
            membership.role === "admin" && membership.isActive && membership.teamIsActive,
        ),
      canManageTeams: user.platformRole === "owner",
    };
  }

  private buildSupabaseVerifiedOwnerContext(
    resolvedAuthUserId: string,
    authUser: ReturnType<AuthLicenseManager["getAuthenticatedUser"]>,
  ): AuthorizationContext | null {
    if (
      !authUser ||
      authUser.userId !== resolvedAuthUserId ||
      mapSupabaseProfileRoleToPlatformRole(authUser.role) !== "owner"
    ) {
      return null;
    }

    const allProjects = this.projects.list();
    return {
      userId: resolvedAuthUserId,
      email: authUser.email,
      displayName: authUser.displayName?.trim() || authUser.email,
      platformRole: "owner",
      isPlatformOwner: true,
      isActive: true,
      teamMemberships: [],
      accessibleTeamIds: this.teams.listAll().map((team) => team.id),
      accessibleProjectIds: allProjects.map((project) => project.id),
      canManageUsersAndAccess: true,
      canManageTeams: true,
    };
  }

  getProjectTeams(projectId: string) {
    return this.projectTeams.listForProject(projectId);
  }

  isProjectAssignedToTeam(projectId: string, teamId: string): boolean {
    return this.projectTeams.isAssigned(projectId, teamId);
  }

  getProjectsForTeam(teamId: string): LocalProject[] {
    const projectIds = this.projectTeams.getProjectIdsForTeam(teamId);
    return this.projects
      .list()
      .filter((project) => projectIds.includes(project.id));
  }

  getVisibleProjectTeams(
    context: AuthorizationContext,
    projectId: string,
    options?: {
      cloudDirectory?: UserDetailsDirectory | null;
      projectSlug?: string | null;
    },
  ): Array<{ id: string; name: string }> {
    let assignedTeamIds = this.projectTeams.getTeamIdsForProject(projectId);
    if (assignedTeamIds.length === 0 && options?.cloudDirectory) {
      assignedTeamIds = this.resolveCloudProjectTeamIds(
        projectId,
        options.cloudDirectory,
        options.projectSlug,
      );
    }
    if (assignedTeamIds.length === 0) {
      return [];
    }

    if (context.isPlatformOwner) {
      return assignedTeamIds
        .map((teamId) => this.resolveProjectTeamLabel(teamId, options?.cloudDirectory))
        .filter((team): team is { id: string; name: string } => team !== null)
        .sort((left, right) => left.name.localeCompare(right.name));
    }

    const visibleTeamIds = new Set<string>();
    for (const teamId of assignedTeamIds) {
      const membership = context.teamMemberships.find(
        (entry) => entry.teamId === teamId && entry.isActive && entry.teamIsActive,
      );
      if (membership) {
        visibleTeamIds.add(teamId);
      }
    }

    return [...visibleTeamIds]
      .map((teamId) => this.resolveProjectTeamLabel(teamId, options?.cloudDirectory))
      .filter((team): team is { id: string; name: string } => team !== null)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private resolveProjectTeamLabel(
    teamId: string,
    cloudDirectory?: UserDetailsDirectory | null,
  ): { id: string; name: string } | null {
    const local = this.teams.getById(teamId);
    if (local) {
      return { id: local.id, name: local.name };
    }
    const cloudTeam = cloudDirectory?.teams?.find((entry) => entry.id === teamId);
    if (cloudTeam?.name) {
      return { id: teamId, name: cloudTeam.name };
    }
    return null;
  }

  private resolveCloudProjectTeamIds(
    projectId: string,
    cloudDirectory: UserDetailsDirectory,
    projectSlug?: string | null,
  ): string[] {
    const projectIds = new Set<string>([projectId]);
    const normalizedSlug = projectSlug?.trim() ?? "";
    if (normalizedSlug && cloudDirectory.projects) {
      for (const project of cloudDirectory.projects) {
        if (project.slug === normalizedSlug) {
          projectIds.add(project.id);
        }
      }
      const localProject = this.projects.getById(projectId);
      if (localProject?.slug) {
        for (const project of cloudDirectory.projects) {
          if (project.slug === localProject.slug) {
            projectIds.add(project.id);
          }
        }
      }
    }
    const teamIds = new Set<string>();
    for (const assignment of cloudDirectory.projectTeams) {
      if (projectIds.has(assignment.projectId)) {
        teamIds.add(assignment.teamId);
      }
    }
    return [...teamIds];
  }

  getAccessibleProjects(userId?: string | null): LocalProject[] {
    const context = this.getAuthorizationContext(userId);
    if (!context) {
      return [];
    }

    const projects = this.projects
      .list()
      .filter((project) => context.accessibleProjectIds.includes(project.id));

    if (context.isPlatformOwner) {
      return projects;
    }

    return projects.filter((project) => {
      if (normalizeProjectIsActive(project)) {
        return true;
      }
      return this.getProjectCapabilities(context.userId, project.id).canEditProjectSettings;
    });
  }

  getProjectCapabilities(
    userId: string,
    projectId: string,
  ): ProjectAccessCapabilities {
    const context = this.getAuthorizationContext(userId);
    const project = this.projects.getById(projectId);
    if (!context || !project) {
      return EMPTY_CAPABILITIES;
    }

    if (!context.accessibleProjectIds.includes(projectId)) {
      return EMPTY_CAPABILITIES;
    }

    if (!normalizeProjectIsActive(project) && !context.isPlatformOwner) {
      const teamRole = this.resolveHighestTeamRoleForProject(context, projectId);
      if (teamRole !== "admin") {
        return EMPTY_CAPABILITIES;
      }
    }

    if (context.isPlatformOwner) {
      return fullCapabilities(true);
    }

    const teamRole = this.resolveHighestTeamRoleForProject(context, projectId);
    if (teamRole === "admin") {
      return fullCapabilities(true);
    }

    const scopedMembership = this.findScopedProjectMembership(context.userId, projectId);
    if (!scopedMembership) {
      return EMPTY_CAPABILITIES;
    }

    if (scopedMembership.accessRole === "operator") {
      return {
        canViewProject: true,
        canViewOverview: true,
        canViewDisplays: true,
        canOperateDisplays: true,
        canUseLocalController: true,
        canViewEngines: true,
        canOperateEngines: true,
        canEditProjectSettings: false,
        canViewProjectActivity: true,
        canEditScraperCode: false,
        canEditDisplayCode: false,
        canManageProjectUsers: false,
      };
    }

    return {
      canViewProject: true,
      canViewOverview: false,
      canViewDisplays: true,
      canOperateDisplays: false,
      canUseLocalController: false,
      canViewEngines: false,
      canOperateEngines: false,
      canEditProjectSettings: false,
      canViewProjectActivity: false,
      canEditScraperCode: false,
      canEditDisplayCode: false,
      canManageProjectUsers: false,
    };
  }

  assertCanManageTeam(actorUserId: string, teamId: string): void {
    const context = this.getAuthorizationContext(actorUserId);
    if (!context) {
      throw new Error("You do not have permission to manage this team.");
    }
    if (context.isPlatformOwner) {
      return;
    }
    const membership = context.teamMemberships.find(
      (entry) =>
        entry.teamId === teamId &&
        entry.role === "admin" &&
        entry.isActive &&
        entry.teamIsActive,
    );
    if (!membership) {
      throw new Error("You do not have permission to manage this team.");
    }
  }

  assertCanManageProjectForTeam(
    actorUserId: string,
    projectId: string,
    teamId: string,
  ): void {
    this.assertCanManageTeam(actorUserId, teamId);
    if (!this.projectTeams.isAssigned(projectId, teamId)) {
      throw new Error("This project does not belong to the selected team.");
    }
  }

  assertCanEditProjectSettings(userId: string, projectId: string): void {
    const capabilities = this.getProjectCapabilities(userId, projectId);
    if (!capabilities.canEditProjectSettings) {
      throw new Error("You do not have permission to edit project settings.");
    }
  }

  assertCanOperateEngine(userId: string, engineId: string): void {
    const engine = this.dataSources.getById(engineId);
    const projectId = engine?.projectId ?? null;
    if (!projectId) {
      throw new Error("Project not found.");
    }

    const capabilities = this.getProjectCapabilities(userId, projectId);
    if (!capabilities.canOperateEngines) {
      throw new Error("You do not have permission to operate this engine.");
    }
  }

  assertCanEditScraperCode(userId: string, projectId: string): void {
    const capabilities = this.getProjectCapabilities(userId, projectId);
    if (!capabilities.canEditScraperCode) {
      throw new Error("You do not have permission to edit scraper code.");
    }
  }

  assertCanViewProject(userId: string, projectId: string): void {
    const capabilities = this.getProjectCapabilities(userId, projectId);
    if (!capabilities.canViewProject) {
      throw new Error("You do not have permission to view this project.");
    }
  }

  private resolveAccessibleTeamIds(
    platformRole: "owner" | "user",
    memberships: AuthorizationContext["teamMemberships"],
  ): string[] {
    if (platformRole === "owner") {
      return this.teams.listAll().map((team) => team.id);
    }

    return memberships
      .filter((membership) => membership.isActive && membership.teamIsActive)
      .map((membership) => membership.teamId);
  }

  private resolveAccessibleProjectIds(
    userId: string,
    platformRole: "owner" | "user",
    memberships: AuthorizationContext["teamMemberships"],
  ): string[] {
    const allProjects = this.projects.list();
    if (platformRole === "owner") {
      return allProjects.map((project) => project.id);
    }

    const projectIds = new Set<string>();
    const activeMemberships = memberships.filter(
      (entry) => entry.isActive && entry.teamIsActive,
    );

    for (const project of allProjects) {
      const assignedTeamIds = this.projectTeams.getTeamIdsForProject(project.id);
      if (assignedTeamIds.length === 0) {
        continue;
      }

      for (const membership of activeMemberships) {
        if (!assignedTeamIds.includes(membership.teamId)) {
          continue;
        }

        const team = this.teams.getById(membership.teamId);
        if (!team?.isActive) {
          continue;
        }

        if (membership.role === "admin") {
          projectIds.add(project.id);
          continue;
        }

        const scopedMembership = this.projectMemberships.get(
          project.id,
          membership.teamId,
          userId,
        );
        if (scopedMembership) {
          projectIds.add(project.id);
        }
      }
    }

    return [...projectIds];
  }

  private resolveHighestTeamRoleForProject(
    context: AuthorizationContext,
    projectId: string,
  ): TeamRole | null {
    const assignedTeamIds = this.projectTeams.getTeamIdsForProject(projectId);
    let highest: TeamRole | null = null;

    for (const teamId of assignedTeamIds) {
      const membership = context.teamMemberships.find(
        (entry) => entry.teamId === teamId && entry.isActive && entry.teamIsActive,
      );
      if (!membership) {
        continue;
      }
      if (membership.role === "admin") {
        return "admin";
      }
      if (!highest) {
        highest = membership.role;
      }
    }

    return highest;
  }

  private findScopedProjectMembership(userId: string, projectId: string) {
    const memberships = this.projectMemberships.listForProject(projectId).filter(
      (entry) => entry.userId === userId,
    );

    for (const membership of memberships) {
      if (!this.projectTeams.isAssigned(projectId, membership.teamId)) {
        continue;
      }

      const teamMembership = this.teamMemberships.get(membership.teamId, userId);
      if (!teamMembership?.isActive) {
        continue;
      }

      const team = this.teams.getById(membership.teamId);
      if (!team?.isActive) {
        continue;
      }

      return membership;
    }

    return null;
  }

  listUsersWithProjectAccess(
    actorUserId: string,
    projectId: string,
  ): Array<{
    id: string;
    name: string;
    email: string | null;
    role: "Owner" | "Admin" | "Operator" | "Viewer";
    paths: ProjectAccessPath[];
    removablePaths: ProjectAccessPath[];
  }> {
    const context = this.getAuthorizationContext(actorUserId);
    if (!context) {
      throw new Error("You do not have permission to view project access.");
    }

    this.assertCanViewProject(actorUserId, projectId);

    const canViewDetails =
      context.isPlatformOwner ||
      this.resolveHighestTeamRoleForProject(context, projectId) === "admin";
    if (!canViewDetails) {
      throw new Error("You do not have permission to view users with access.");
    }

    const rolePriority = {
      Owner: 0,
      Admin: 1,
      Operator: 2,
      Viewer: 3,
    } as const;

    const merged = new Map<
      string,
      {
        id: string;
        name: string;
        email: string | null;
        role: keyof typeof rolePriority;
        paths: ProjectAccessPath[];
      }
    >();

    const addPath = (
      userId: string,
      role: keyof typeof rolePriority,
      path: ProjectAccessPath,
      includeEmail: boolean,
    ) => {
      const user = this.users.getById(userId);
      if (!user || !user.isActive) return;
      const existing = merged.get(userId);
      if (!existing) {
        merged.set(userId, {
          id: user.id,
          name: user.fullName,
          email: includeEmail && canViewDetails ? user.email : null,
          role,
          paths: [path],
        });
        return;
      }

      existing.paths.push(path);
      if (rolePriority[role] < rolePriority[existing.role]) {
        existing.role = role;
      }
    };

    for (const user of this.users.listAll()) {
      if (!user.isActive || user.platformRole !== "owner") continue;
      addPath(
        user.id,
        "Owner",
        { type: "owner", teamId: null, teamName: null, membershipId: null },
        true,
      );
    }

    const assignedTeamIds = this.projectTeams.getTeamIdsForProject(projectId);
    for (const teamId of assignedTeamIds) {
      const team = this.teams.getById(teamId);
      if (!team?.isActive) continue;

      for (const membership of this.teamMemberships.listForTeam(teamId)) {
        if (!membership.isActive) continue;
        if (membership.role === "admin") {
          addPath(
            membership.userId,
            "Admin",
            {
              type: "team_admin",
              teamId,
              teamName: team.name,
              membershipId: membership.id,
            },
            true,
          );
        }
      }

      for (const assignment of this.projectMemberships.listForProjectTeam(
        projectId,
        teamId,
      )) {
        const teamMembership = this.teamMemberships.get(teamId, assignment.userId);
        if (!teamMembership?.isActive || teamMembership.role === "admin") continue;
        addPath(
          assignment.userId,
          assignment.accessRole === "operator" ? "Operator" : "Viewer",
          {
            type:
              assignment.accessRole === "operator"
                ? "project_operator"
                : "project_viewer",
            teamId,
            teamName: team.name,
            membershipId: assignment.id,
          },
          true,
        );
      }
    }

    const adminTeamIds = context.isPlatformOwner
      ? new Set(assignedTeamIds)
      : new Set(
          context.teamMemberships
            .filter((entry) => entry.role === "admin" && entry.isActive)
            .map((entry) => entry.teamId),
        );

    return [...merged.values()]
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        email: entry.email,
        role: entry.role,
        paths: entry.paths,
        removablePaths: entry.paths.filter((path) => {
          if (path.type === "owner") {
            return false;
          }
          if (entry.id === actorUserId) {
            return false;
          }
          const target = this.users.getById(entry.id);
          if (!target || isProtectedNeudOwnerUser(target)) {
            return false;
          }

          if (context.isPlatformOwner) {
            return (
              path.type === "project_operator" ||
              path.type === "project_viewer" ||
              path.type === "team_admin"
            );
          }

          if (path.type !== "project_operator" && path.type !== "project_viewer") {
            return false;
          }
          if (!path.teamId || !adminTeamIds.has(path.teamId)) {
            return false;
          }
          const teamMembership = this.teamMemberships.get(path.teamId, entry.id);
          if (teamMembership?.role === "admin") {
            return false;
          }
          return true;
        }),
      }))
      .sort((left, right) => {
        const roleDiff = rolePriority[left.role] - rolePriority[right.role];
        if (roleDiff !== 0) return roleDiff;
        return left.name.localeCompare(right.name);
      });
  }

  resolveDirectoryUserId(userId: string): string {
    const trimmed = userId.trim();
    if (!trimmed) {
      return trimmed;
    }
    const byAuth = this.users.resolveByAuthUserId(trimmed);
    if (byAuth?.supabaseUserId?.trim()) {
      return byAuth.supabaseUserId.trim();
    }
    if (byAuth?.id) {
      return byAuth.id;
    }
    const local = this.users.getById(trimmed);
    if (local?.supabaseUserId?.trim()) {
      return local.supabaseUserId.trim();
    }
    return local?.id ?? trimmed;
  }

  canViewUserDetails(
    actorUserId: string,
    targetUserId: string,
    options?: { cloudDirectory?: UserDetailsDirectory | null },
  ): boolean {
    if (!actorUserId || !targetUserId) {
      return false;
    }

    const actorContext = this.getAuthorizationContext(actorUserId);
    if (!actorContext) {
      return false;
    }

    const actorDirectoryId = this.resolveDirectoryUserId(actorUserId);
    const targetDirectoryId = this.resolveDirectoryUserId(targetUserId);

    if (actorDirectoryId === targetDirectoryId) {
      return true;
    }

    const cloudDirectory = options?.cloudDirectory ?? null;
    if (cloudDirectory) {
      if (
        canViewUserDetailsInDirectory(actorDirectoryId, targetDirectoryId, cloudDirectory)
      ) {
        return true;
      }
    }

    const targetUser =
      this.users.getById(targetUserId) ??
      this.users.resolveByAuthUserId(targetUserId);
    if (!targetUser) {
      return actorContext.isPlatformOwner && Boolean(cloudDirectory?.users.some(
        (entry) => entry.id === targetDirectoryId,
      ));
    }

    if (actorContext.isPlatformOwner) {
      return true;
    }

    const adminTeamIds = new Set(
      actorContext.teamMemberships
        .filter(
          (membership) =>
            membership.role === "admin" && membership.isActive && membership.teamIsActive,
        )
        .map((membership) => membership.teamId),
    );
    if (adminTeamIds.size === 0) {
      return false;
    }

    const targetMemberships = this.teamMemberships.listForUser(targetUser.id);
    return targetMemberships.some(
      (membership) => membership.isActive && adminTeamIds.has(membership.teamId),
    );
  }

  canDeleteUserDetails(
    actorUserId: string,
    targetUserId: string,
    options?: { cloudDirectory?: UserDetailsDirectory | null },
  ): boolean {
    const cloudDirectory = options?.cloudDirectory ?? null;
    if (!cloudDirectory) {
      return false;
    }
    const actorDirectoryId = this.resolveDirectoryUserId(actorUserId);
    const targetDirectoryId = this.resolveDirectoryUserId(targetUserId);
    return canDeleteUserInDirectory(actorDirectoryId, targetDirectoryId, cloudDirectory);
  }

  listViewableUserIds(actorUserId: string): string[] {
    const context = this.getAuthorizationContext(actorUserId);
    if (!context) {
      return [];
    }

    const ids = new Set<string>([context.userId]);
    if (context.isPlatformOwner) {
      for (const user of this.users.listAll()) {
        if (user.isActive) {
          ids.add(user.id);
        }
      }
      return [...ids];
    }

    const adminTeamIds = new Set(
      context.teamMemberships
        .filter(
          (membership) =>
            membership.role === "admin" && membership.isActive && membership.teamIsActive,
        )
        .map((membership) => membership.teamId),
    );
    if (adminTeamIds.size === 0) {
      return [...ids];
    }

    for (const user of this.users.listAll()) {
      if (!user.isActive) {
        continue;
      }
      const memberships = this.teamMemberships.listForUser(user.id);
      if (memberships.some((membership) => adminTeamIds.has(membership.teamId))) {
        ids.add(user.id);
      }
    }

    return [...ids];
  }

  resolveProjectAccessPaths(userId: string, projectId: string): ProjectAccessPath[] {
    const paths: ProjectAccessPath[] = [];
    const user = this.users.getById(userId);
    if (!user?.isActive) return paths;

    if (user.platformRole === "owner") {
      paths.push({ type: "owner", teamId: null, teamName: null, membershipId: null });
    }

    for (const teamId of this.projectTeams.getTeamIdsForProject(projectId)) {
      const team = this.teams.getById(teamId);
      if (!team?.isActive) continue;
      const membership = this.teamMemberships.get(teamId, userId);
      if (membership?.isActive && membership.role === "admin") {
        paths.push({
          type: "team_admin",
          teamId,
          teamName: team.name,
          membershipId: membership.id,
        });
      }

      for (const assignment of this.projectMemberships.listForProjectTeam(
        projectId,
        teamId,
      )) {
        if (assignment.userId !== userId) continue;
        const teamMembership = this.teamMemberships.get(teamId, userId);
        if (!teamMembership?.isActive || teamMembership.role === "admin") continue;
        paths.push({
          type:
            assignment.accessRole === "operator" ? "project_operator" : "project_viewer",
          teamId,
          teamName: team.name,
          membershipId: assignment.id,
        });
      }
    }

    return paths;
  }
}

function fullCapabilities(canManageUsers: boolean): ProjectAccessCapabilities {
  return {
    canViewProject: true,
    canViewOverview: true,
    canViewDisplays: true,
    canOperateDisplays: true,
    canUseLocalController: true,
    canViewEngines: true,
    canOperateEngines: true,
    canEditProjectSettings: true,
    canViewProjectActivity: true,
    canEditScraperCode: true,
    canEditDisplayCode: true,
    canManageProjectUsers: canManageUsers,
  };
}
