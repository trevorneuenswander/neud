import type { AccessAuthorizationService } from "./access-authorization-service";
import type { LocalUsersRepository } from "../repositories/local-users-repository";
import type { TeamsRepository } from "../repositories/teams-repository";
import type { TeamMembershipsRepository } from "../repositories/team-memberships-repository";
import type { ProjectMembershipsRepository } from "../repositories/project-memberships-repository";
import type { ProjectTeamAssignmentsRepository } from "../repositories/project-team-assignments-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { LocalInvitationsRepository } from "../repositories/local-invitations-repository";
import type { TeamRole, ProjectAccessRole, ProjectAccessPath } from "./access-types";
import { normalizeProjectIsActive } from "../projects/project-permissions";

type ActivityRecorder = (input: {
  type: string;
  message: string;
  userAction?: string;
  metadata?: Record<string, unknown>;
}) => void;

type SupabaseInviteHandler = (input: {
  email: string;
  fullName: string;
}) => Promise<{ userId: string }>;

export class AccessManagementService {
  constructor(
    private readonly authorization: AccessAuthorizationService,
    private readonly users: LocalUsersRepository,
    private readonly teams: TeamsRepository,
    private readonly teamMemberships: TeamMembershipsRepository,
    private readonly projectMemberships: ProjectMembershipsRepository,
    private readonly projectTeams: ProjectTeamAssignmentsRepository,
    private readonly projects: ProjectsRepository,
    private readonly invitations: LocalInvitationsRepository,
    private readonly recordActivity: ActivityRecorder,
    private readonly supabaseInvite: SupabaseInviteHandler | null = null,
  ) {}

  getDirectory(actorUserId: string) {
    const context = this.authorization.getAuthorizationContext(actorUserId);
    if (!context?.canManageUsersAndAccess) {
      throw new Error("You do not have permission to manage users and access.");
    }

    const adminTeamIds = this.resolveAdminTeamIds(context);
    const visibleTeamIds = new Set(context.accessibleTeamIds);

    const teams = this.teams
      .listAll()
      .filter((team) => context.isPlatformOwner || visibleTeamIds.has(team.id))
      .map((team) => ({
        ...team,
        userCount: this.teams.countUsers(team.id),
        adminCount: this.teams.countAdmins(team.id),
        projectCount: this.teams.countProjects(team.id),
      }));

    const users = this.users
      .listAll()
      .filter((user) => {
        if (context.isPlatformOwner) {
          return true;
        }
        const memberships = this.teamMemberships.listForUser(user.id);
        return memberships.some((membership) => adminTeamIds.has(membership.teamId));
      })
      .map((user) => ({
        ...user,
        teamMemberships: this.teamMemberships
          .listForUser(user.id)
          .filter(
            (membership) => context.isPlatformOwner || adminTeamIds.has(membership.teamId),
          ),
        projectAssignmentCount: this.projectMemberships.countForUser(user.id),
        assignedProjectNames: this.resolveAssignedProjectNames(user.id, adminTeamIds, context),
      }));

    const allProjects = this.projects.list();
    const projects = allProjects
      .filter((project) => {
        if (context.isPlatformOwner) {
          return true;
        }
        const assignedTeamIds = this.projectTeams.getTeamIdsForProject(project.id);
        return assignedTeamIds.some((teamId) => adminTeamIds.has(teamId));
      })
      .map((project) => this.buildDirectoryProject(project.id, adminTeamIds, context));

    const invitations = context.isPlatformOwner
      ? this.invitations.listAll()
      : this.invitations
          .listAll()
          .filter((invitation) => adminTeamIds.has(invitation.teamId));

    return {
      context,
      teams,
      users,
      projects,
      invitations: invitations.filter((invitation) => invitation.status === "pending"),
    };
  }

  createTeam(actorUserId: string, input: { name: string; description?: string | null }) {
    const context = this.authorization.getAuthorizationContext(actorUserId);
    if (!context?.canManageTeams) {
      throw new Error("You do not have permission to create teams.");
    }

    const team = this.teams.create({
      name: input.name,
      description: input.description,
      createdByUserId: actorUserId,
    });

    this.recordActivity({
      type: "access.team-created",
      message: `${context.displayName} created team ${team.name}.`,
      userAction: `Created team ${team.name}`,
      metadata: {
        teamId: team.id,
        teamName: team.name,
      },
    });

    return team;
  }

  updateTeam(
    actorUserId: string,
    teamId: string,
    input: { name?: string; description?: string | null; isActive?: boolean },
  ) {
    const context = this.authorization.getAuthorizationContext(actorUserId);
    if (!context?.canManageTeams) {
      throw new Error("You do not have permission to manage teams.");
    }

    const existing = this.teams.getById(teamId);
    if (!existing) {
      throw new Error("Team not found.");
    }

    const identityChanged =
      (input.name !== undefined && input.name.trim() !== existing.name) ||
      (input.description !== undefined &&
        (input.description?.trim() || null) !== existing.description);

    const updated = this.teams.update(teamId, input);
    if (!updated) {
      throw new Error("Team not found.");
    }

    if (identityChanged && input.isActive === undefined) {
      this.recordActivity({
        type: "access.team-updated",
        message: `${context.displayName} updated team ${updated.name}.`,
        userAction: `Updated team ${updated.name}`,
        metadata: { teamId: updated.id, teamName: updated.name },
      });
    }

    if (input.isActive === false) {
      this.recordActivity({
        type: "access.team-deactivated",
        message: `${context.displayName} deactivated team ${updated.name}.`,
        metadata: { teamId: updated.id, teamName: updated.name },
      });
    } else if (input.isActive === true) {
      this.recordActivity({
        type: "access.team-reactivated",
        message: `${context.displayName} reactivated team ${updated.name}.`,
        metadata: { teamId: updated.id, teamName: updated.name },
      });
    }

    return updated;
  }

  setProjectTeams(
    actorUserId: string,
    input: { projectId: string; teamIds: string[] },
  ) {
    const context = this.authorization.getAuthorizationContext(actorUserId);
    if (!context?.isPlatformOwner) {
      throw new Error("You do not have permission to assign project teams.");
    }

    const project = this.projects.getById(input.projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const nextTeamIds = [...new Set(input.teamIds)];
    for (const teamId of nextTeamIds) {
      if (!this.teams.getById(teamId)) {
        throw new Error("Team not found.");
      }
    }

    const currentTeamIds = this.projectTeams.getTeamIdsForProject(project.id);
    const added = nextTeamIds.filter((teamId) => !currentTeamIds.includes(teamId));
    const removed = currentTeamIds.filter((teamId) => !nextTeamIds.includes(teamId));

    for (const teamId of added) {
      const team = this.teams.getById(teamId)!;
      this.projectTeams.assign({
        projectId: project.id,
        teamId,
        createdByUserId: actorUserId,
      });
      this.recordActivity({
        type: "access.project-team-assigned",
        message: `${context.displayName} assigned ${project.name} to team ${team.name}.`,
        userAction: `Assigned ${project.name} to team ${team.name}`,
        metadata: {
          projectId: project.id,
          projectName: project.name,
          teamId: team.id,
          teamName: team.name,
        },
      });
    }

    for (const teamId of removed) {
      const team = this.teams.getById(teamId)!;
      this.projectTeams.remove(project.id, teamId);
      this.projectMemberships.removeAllForProjectTeam(project.id, teamId);
      this.recordActivity({
        type: "access.project-team-removed",
        message: `${context.displayName} removed ${project.name} from team ${team.name}.`,
        userAction: `Removed ${project.name} from team ${team.name}`,
        metadata: {
          projectId: project.id,
          projectName: project.name,
          teamId: team.id,
          teamName: team.name,
        },
      });
    }

    return {
      projectId: project.id,
      teamIds: this.projectTeams.getTeamIdsForProject(project.id),
    };
  }

  /** @deprecated Use setProjectTeams instead. Kept for compatibility. */
  assignProjectToTeam(
    actorUserId: string,
    input: { projectId: string; teamId: string; removeAssignments?: boolean },
  ) {
    const context = this.authorization.getAuthorizationContext(actorUserId);
    if (!context?.isPlatformOwner) {
      throw new Error("You do not have permission to move projects between teams.");
    }

    const currentTeamIds = this.projectTeams.getTeamIdsForProject(input.projectId);
    const nextTeamIds =
      input.removeAssignments === false
        ? [...new Set([...currentTeamIds, input.teamId])]
        : [input.teamId];

    return this.setProjectTeams(actorUserId, {
      projectId: input.projectId,
      teamIds: nextTeamIds,
    });
  }

  inviteUser(
    actorUserId: string,
    input: {
      email: string;
      fullName: string;
      teamId: string;
      role: TeamRole;
      projectIds?: string[];
    },
  ) {
    this.authorization.assertCanManageTeam(actorUserId, input.teamId);
    const context = this.authorization.getAuthorizationContext(actorUserId);
    if (!context) {
      throw new Error("You do not have permission to manage this team.");
    }

    if (input.role === "admin" && !context.isPlatformOwner) {
      throw new Error("Only the Owner may assign the Admin role.");
    }

    if (!context.isPlatformOwner) {
      if (input.role !== "operator" && input.role !== "viewer") {
        throw new Error("You do not have permission to assign this role.");
      }
    }

    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    if (!email.includes("@")) {
      throw new Error("Enter a valid email address.");
    }
    if (!fullName) {
      throw new Error("Enter a full name.");
    }

    const existingUser = this.users.getByEmail(email);
    if (existingUser?.platformRole === "owner") {
      throw new Error("The selected user cannot be modified.");
    }

    const projectIds = input.projectIds ?? [];
    if (input.role !== "admin" && projectIds.length === 0) {
      throw new Error(
        input.role === "operator"
          ? "Operators must be assigned to at least one project."
          : "Viewers must be assigned to at least one project.",
      );
    }

    for (const projectId of projectIds) {
      if (!this.projectTeams.isAssigned(projectId, input.teamId)) {
        throw new Error("This project does not belong to the selected team.");
      }
    }

    if (existingUser) {
      if (!existingUser.isActive) {
        this.users.setActive(existingUser.id, true);
      }
      this.upsertTeamMember(actorUserId, {
        teamId: input.teamId,
        userId: existingUser.id,
        role: input.role,
        projectIds,
      });
      this.recordActivity({
        type: "access.user-invited",
        message: `Updated ${fullName} as ${input.role}`,
        userAction: `Updated ${fullName} as ${input.role}`,
        metadata: {
          teamId: input.teamId,
          userId: existingUser.id,
          role: input.role,
        },
      });
      return { user: existingUser, invitation: null, reusedExistingUser: true };
    }

    const pendingInvitation = this.invitations.getByEmail(email);
    if (pendingInvitation) {
      throw new Error("This email already belongs to an existing user.");
    }

    const invitation = this.invitations.create({
      email,
      fullName,
      teamId: input.teamId,
      teamRole: input.role,
      projectIds,
      createdByUserId: actorUserId,
    });

    void this.supabaseInvite?.({ email, fullName }).then((result) => {
      const user = this.users.upsert({
        id: result.userId,
        email,
        fullName,
        platformRole: "user",
        isActive: true,
        invitationStatus: "invited",
      });
      this.applyInvitationMemberships(user.id, invitation.id);
      this.invitations.markAccepted(invitation.id);
    }).catch((error) => {
      console.warn("[access] Supabase invite failed:", error);
    });

    this.recordActivity({
      type: "access.user-invited",
      message: `Invited ${fullName} as ${input.role}`,
      userAction: `Invited ${fullName} as ${input.role}`,
      metadata: {
        teamId: input.teamId,
        email,
        role: input.role,
      },
    });

    return { user: null, invitation, reusedExistingUser: false };
  }

  applyInvitationMemberships(userId: string, invitationId: string) {
    const invitation = this.invitations.listAll().find((entry) => entry.id === invitationId);
    if (!invitation) {
      return;
    }

    this.teamMemberships.upsert({
      teamId: invitation.teamId,
      userId,
      role: invitation.teamRole,
      createdByUserId: invitation.createdByUserId,
    });

    if (invitation.teamRole === "admin") {
      return;
    }

    for (const projectId of invitation.projectIds) {
      this.projectMemberships.upsert({
        projectId,
        teamId: invitation.teamId,
        userId,
        accessRole: invitation.teamRole as ProjectAccessRole,
        createdByUserId: invitation.createdByUserId,
      });
    }
  }

  upsertTeamMember(
    actorUserId: string,
    input: {
      teamId: string;
      userId: string;
      role: TeamRole;
      projectIds?: string[];
    },
  ) {
    this.authorization.assertCanManageTeam(actorUserId, input.teamId);
    const context = this.authorization.getAuthorizationContext(actorUserId);
    if (!context) {
      throw new Error("You do not have permission to manage this team.");
    }

    if (input.role === "admin" && !context.isPlatformOwner) {
      throw new Error("Only the Owner may assign the Admin role.");
    }

    const targetUser = this.users.getById(input.userId);
    if (!targetUser) {
      throw new Error("The selected user cannot be modified.");
    }
    if (targetUser.platformRole === "owner") {
      throw new Error("The Owner account cannot be modified.");
    }

    this.teamMemberships.upsert({
      teamId: input.teamId,
      userId: input.userId,
      role: input.role,
      createdByUserId: actorUserId,
    });

    const teamProjectIds = this.projectTeams.getProjectIdsForTeam(input.teamId);

    if (input.role === "admin") {
      for (const projectId of teamProjectIds) {
        this.projectMemberships.remove(projectId, input.teamId, input.userId);
      }
      this.recordActivity({
        type: "access.team-member-updated",
        message: `Assigned ${targetUser.fullName} as Admin`,
        userAction: `Assigned ${targetUser.fullName} as Admin`,
        metadata: { teamId: input.teamId, userId: input.userId, role: input.role },
      });
      return this.teamMemberships.get(input.teamId, input.userId);
    }

    const projectIds = input.projectIds ?? [];
    if (projectIds.length === 0) {
      throw new Error(
        input.role === "operator"
          ? "Operators must be assigned to at least one project."
          : "Viewers must be assigned to at least one project.",
      );
    }

    for (const projectId of projectIds) {
      if (!this.projectTeams.isAssigned(projectId, input.teamId)) {
        throw new Error("This project does not belong to the selected team.");
      }
    }

    for (const projectId of teamProjectIds) {
      if (!projectIds.includes(projectId)) {
        this.projectMemberships.remove(projectId, input.teamId, input.userId);
      }
    }

    for (const projectId of projectIds) {
      this.projectMemberships.upsert({
        projectId,
        teamId: input.teamId,
        userId: input.userId,
        accessRole: input.role as ProjectAccessRole,
        createdByUserId: actorUserId,
      });
    }

    this.recordActivity({
      type: "access.team-member-updated",
      message: `Updated ${targetUser.fullName}'s team access`,
      userAction: `Updated ${targetUser.fullName}'s team access`,
      metadata: {
        teamId: input.teamId,
        userId: input.userId,
        role: input.role,
      },
    });

    return this.teamMemberships.get(input.teamId, input.userId);
  }

  removeTeamMember(actorUserId: string, teamId: string, userId: string) {
    this.authorization.assertCanManageTeam(actorUserId, teamId);
    const context = this.authorization.getAuthorizationContext(actorUserId);
    const target = this.users.getById(userId);
    if (!target || target.platformRole === "owner") {
      throw new Error("The selected user cannot be modified.");
    }

    const teamProjectIds = this.projectTeams.getProjectIdsForTeam(teamId);
    for (const projectId of teamProjectIds) {
      this.projectMemberships.remove(projectId, teamId, userId);
    }
    this.teamMemberships.remove(teamId, userId);

    this.recordActivity({
      type: "access.team-member-removed",
      message: `Removed ${target.fullName} from the team`,
      userAction: `Removed ${target.fullName} from the team`,
      metadata: { teamId, userId },
    });
  }

  setProjectAssignment(
    actorUserId: string,
    input: {
      projectId: string;
      teamId: string;
      userId: string;
      accessRole: ProjectAccessRole;
    },
  ) {
    this.authorization.assertCanManageProjectForTeam(
      actorUserId,
      input.projectId,
      input.teamId,
    );
    const context = this.authorization.getAuthorizationContext(actorUserId);
    const target = this.users.getById(input.userId);
    if (!target || target.platformRole === "owner") {
      throw new Error("The selected user cannot be modified.");
    }

    const membership = this.teamMemberships.get(input.teamId, input.userId);
    if (!membership || membership.role === "admin") {
      throw new Error("The selected user cannot be modified.");
    }

    const project = this.projects.getById(input.projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    this.projectMemberships.upsert({
      projectId: input.projectId,
      teamId: input.teamId,
      userId: input.userId,
      accessRole: input.accessRole,
      createdByUserId: actorUserId,
    });

    this.recordActivity({
      type: "access.project-assigned",
      message: `Granted project access to ${target.fullName}.`,
      userAction: `Granted project access to ${target.fullName}.`,
      metadata: {
        projectId: project.id,
        teamId: input.teamId,
        userId: input.userId,
        accessRole: input.accessRole,
      },
    });
  }

  removeProjectAssignment(
    actorUserId: string,
    projectId: string,
    teamId: string,
    userId: string,
  ) {
    this.authorization.assertCanManageProjectForTeam(actorUserId, projectId, teamId);
    const context = this.authorization.getAuthorizationContext(actorUserId);
    const target = this.users.getById(userId);
    if (!target) {
      throw new Error("The selected user cannot be modified.");
    }

    const project = this.projects.getById(projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    this.projectMemberships.remove(projectId, teamId, userId);
    this.recordActivity({
      type: "access.project-unassigned",
      message: `Removed ${target.fullName} from ${project.name}`,
      userAction: `Removed ${target.fullName} from ${project.name}`,
      metadata: { projectId, teamId, userId },
    });
  }

  removeProjectAccessPath(
    actorUserId: string,
    input: {
      projectId: string;
      userId: string;
      pathType: "project_operator" | "project_viewer" | "team_admin";
      teamId: string;
    },
  ) {
    const project = this.projects.getById(input.projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const target = this.users.getById(input.userId);
    if (!target || target.platformRole === "owner") {
      throw new Error("The selected user cannot be modified.");
    }

    if (input.userId === actorUserId) {
      throw new Error("The selected user cannot be modified.");
    }

    const context = this.authorization.getAuthorizationContext(actorUserId);
    if (!context) {
      throw new Error("You do not have permission to remove project access.");
    }

    const actorIsPlatformOwner = context.isPlatformOwner;
    if (!actorIsPlatformOwner) {
      this.authorization.assertCanManageProjectForTeam(
        actorUserId,
        input.projectId,
        input.teamId,
      );
      const teamMembership = this.teamMemberships.get(input.teamId, input.userId);
      if (teamMembership?.role === "admin") {
        throw new Error("The selected user cannot be modified.");
      }
    }

    const paths = this.authorization.resolveProjectAccessPaths(input.userId, input.projectId);
    const matchingPath = paths.find(
      (path) => path.type === input.pathType && path.teamId === input.teamId,
    );
    if (!matchingPath) {
      throw new Error("The selected access path was not found.");
    }

    if (input.pathType === "team_admin") {
      const teamMembership = this.teamMemberships.get(input.teamId, input.userId);
      if (!teamMembership?.isActive || teamMembership.role !== "admin") {
        throw new Error("The selected access path was not found.");
      }

      const team = this.teams.getById(input.teamId);
      if (!team) {
        throw new Error("Team not found.");
      }

      this.projectTeams.remove(input.projectId, input.teamId);
      this.projectMemberships.removeAllForProjectTeam(input.projectId, input.teamId);

      this.recordActivity({
        type: "access.project-team-removed",
        message: `Removed project access from ${target.fullName}.`,
        userAction: `Removed project access from ${target.fullName}.`,
        metadata: {
          projectId: project.id,
          teamId: input.teamId,
          userId: input.userId,
          pathType: input.pathType,
          teamName: team.name,
        },
      });

      return { ok: true as const };
    }

    if (!matchingPath.membershipId) {
      throw new Error("The selected access path was not found.");
    }

    this.projectMemberships.remove(input.projectId, input.teamId, input.userId);

    this.recordActivity({
      type: "access.project-unassigned",
      message: `Removed project access from ${target.fullName}.`,
      userAction: `Removed project access from ${target.fullName}.`,
      metadata: {
        projectId: project.id,
        teamId: input.teamId,
        userId: input.userId,
        pathType: input.pathType,
      },
    });

    return { ok: true as const };
  }

  setUserActive(actorUserId: string, targetUserId: string, isActive: boolean) {
    const context = this.authorization.getAuthorizationContext(actorUserId);
    if (!context?.canManageUsersAndAccess) {
      throw new Error("You do not have permission to manage users.");
    }

    const target = this.users.getById(targetUserId);
    if (!target) {
      throw new Error("The selected user cannot be modified.");
    }
    if (target.platformRole === "owner") {
      throw new Error("The Owner account cannot be deactivated.");
    }

    if (!context.isPlatformOwner) {
      const actorTeams = new Set(
        context.teamMemberships
          .filter((entry) => entry.role === "admin" && entry.isActive)
          .map((entry) => entry.teamId),
      );
      const targetTeams = this.teamMemberships.listForUser(targetUserId);
      const sharesTeam = targetTeams.some((entry) => actorTeams.has(entry.teamId));
      if (!sharesTeam) {
        throw new Error("You do not have permission to manage this team.");
      }
    }

    const updated = this.users.setActive(targetUserId, isActive);
    this.recordActivity({
      type: isActive ? "access.user-reactivated" : "access.user-deactivated",
      message: `${isActive ? "Reactivated" : "Deactivated"} ${target.fullName}`,
      userAction: `${isActive ? "Reactivated" : "Deactivated"} ${target.fullName}`,
      metadata: {
        userId: targetUserId,
      },
    });
    return updated;
  }

  listViewableUserIds(actorUserId: string) {
    return {
      userIds: this.authorization.listViewableUserIds(actorUserId),
    };
  }

  getUserDetails(actorUserId: string, targetUserId: string) {
    if (!this.authorization.canViewUserDetails(actorUserId, targetUserId)) {
      throw new Error("You do not have permission to view this user.");
    }

    const user = this.users.getById(targetUserId);
    if (!user) {
      throw new Error("User not found.");
    }

    const targetContext = this.authorization.getAuthorizationContext(targetUserId);
    const teamMemberships = this.teamMemberships.listForUser(targetUserId);
    const teams = teamMemberships
      .map((membership) => {
        const team = this.teams.getById(membership.teamId);
        if (!team) {
          return null;
        }
        return {
          id: team.id,
          name: team.name,
          role: membership.role,
          isActive: membership.isActive && team.isActive,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => left.name.localeCompare(right.name));

    const accessibleProjectIds = targetContext?.accessibleProjectIds ?? [];
    const projects = accessibleProjectIds
      .map((projectId) => {
        const project = this.projects.getById(projectId);
        if (!project) {
          return null;
        }

        const paths = this.authorization.resolveProjectAccessPaths(targetUserId, projectId);
        const summary = summarizeProjectAccess(paths, projectId, this.projectTeams, this.teams);

        return {
          id: project.id,
          slug: project.slug,
          name: project.name,
          teamName: summary.teamName,
          role: summary.role,
          accessSource: summary.accessSource,
          isActive: normalizeProjectIsActive(project),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => {
        if (left.isActive !== right.isActive) {
          return left.isActive ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        profileTeam: user.profileTeam,
        platformRole: user.platformRole,
        isActive: user.isActive,
        supabaseUserId: user.supabaseUserId,
        supabaseAccountAvailable: user.supabaseAccountAvailable,
        lastSupabaseSyncAt: user.lastSupabaseSyncAt,
      },
      teams,
      projects,
    };
  }

  private resolveAdminTeamIds(
    context: NonNullable<ReturnType<AccessAuthorizationService["getAuthorizationContext"]>>,
  ): Set<string> {
    if (context.isPlatformOwner) {
      return new Set(context.accessibleTeamIds);
    }
    return new Set(
      context.teamMemberships
        .filter(
          (membership) =>
            membership.role === "admin" && membership.isActive && membership.teamIsActive,
        )
        .map((membership) => membership.teamId),
    );
  }

  private buildDirectoryProject(
    projectId: string,
    adminTeamIds: Set<string>,
    context: NonNullable<ReturnType<AccessAuthorizationService["getAuthorizationContext"]>>,
  ) {
    const project = this.projects.getById(projectId)!;
    const teamIds = this.projectTeams.getTeamIdsForProject(project.id);
    const teams = teamIds
      .map((teamId) => this.teams.getById(teamId))
      .filter((team): team is NonNullable<typeof team> => team !== null)
      .map((team) => ({ id: team.id, name: team.name }))
      .sort((left, right) => left.name.localeCompare(right.name));

    const memberships = this.projectMemberships.listForProject(project.id);
    const visibleMemberships = context.isPlatformOwner
      ? memberships
      : memberships.filter((membership) => adminTeamIds.has(membership.teamId));

    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      teamIds,
      teams,
      isActive: project.isActive,
      operators: [
        ...new Set(
          visibleMemberships
            .filter((membership) => membership.accessRole === "operator")
            .map((membership) => membership.userId),
        ),
      ],
      viewers: [
        ...new Set(
          visibleMemberships
            .filter((membership) => membership.accessRole === "viewer")
            .map((membership) => membership.userId),
        ),
      ],
    };
  }

  private resolveAssignedProjectNames(
    userId: string,
    adminTeamIds: Set<string>,
    context: NonNullable<ReturnType<AccessAuthorizationService["getAuthorizationContext"]>>,
  ): string[] {
    const names = new Set<string>();
    for (const membership of this.projectMemberships.listForUser(userId)) {
      if (!context.isPlatformOwner && !adminTeamIds.has(membership.teamId)) {
        continue;
      }
      const project = this.projects.getById(membership.projectId);
      if (project) {
        names.add(project.name);
      }
    }
    return [...names].sort((left, right) => left.localeCompare(right));
  }
}

const PROJECT_ROLE_PRIORITY = {
  Owner: 0,
  Admin: 1,
  Operator: 2,
  Viewer: 3,
} as const;

function summarizeProjectAccess(
  paths: ProjectAccessPath[],
  projectId: string,
  projectTeams: ProjectTeamAssignmentsRepository,
  teams: TeamsRepository,
): { role: string; accessSource: string; teamName: string } {
  if (paths.length === 0) {
    const assignedTeamNames = projectTeams
      .getTeamIdsForProject(projectId)
      .map((teamId) => teams.getById(teamId)?.name)
      .filter((name): name is string => Boolean(name));
    return {
      role: "Viewer",
      accessSource: "Team",
      teamName: assignedTeamNames.join(", ") || "Unassigned",
    };
  }

  const ranked = [...paths].sort((left, right) => {
    const leftRole = pathToProjectRole(left);
    const rightRole = pathToProjectRole(right);
    return PROJECT_ROLE_PRIORITY[leftRole] - PROJECT_ROLE_PRIORITY[rightRole];
  });
  const primary = ranked[0]!;
  const role = pathToProjectRole(primary);
  const accessSource = pathToAccessSource(primary);
  const teamNames = new Set<string>();
  for (const path of paths) {
    if (path.teamName) {
      teamNames.add(path.teamName);
    }
  }
  if (teamNames.size === 0) {
    const assignedTeamNames = projectTeams
      .getTeamIdsForProject(projectId)
      .map((teamId) => teams.getById(teamId)?.name)
      .filter((name): name is string => Boolean(name));
    for (const name of assignedTeamNames) {
      teamNames.add(name);
    }
  }

  return {
    role,
    accessSource,
    teamName: [...teamNames].sort((left, right) => left.localeCompare(right)).join(", ") || "Unassigned",
  };
}

function pathToProjectRole(path: ProjectAccessPath): keyof typeof PROJECT_ROLE_PRIORITY {
  switch (path.type) {
    case "owner":
      return "Owner";
    case "team_admin":
      return "Admin";
    case "project_operator":
      return "Operator";
    case "project_viewer":
      return "Viewer";
  }
}

function pathToAccessSource(path: ProjectAccessPath): string {
  switch (path.type) {
    case "owner":
      return "Owner";
    case "team_admin":
      return "Admin";
    case "project_operator":
    case "project_viewer":
      return "Direct";
  }
}
