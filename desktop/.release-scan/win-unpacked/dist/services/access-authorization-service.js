"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessAuthorizationService = void 0;
const access_types_1 = require("./access-types");
const project_permissions_1 = require("../projects/project-permissions");
const normalize_email_1 = require("../auth/normalize-email");
const local_desktop_identity_1 = require("../auth/local-desktop-identity");
const user_identity_reconciliation_service_1 = require("./user-identity-reconciliation-service");
const resolve_authenticated_profile_1 = require("./resolve-authenticated-profile");
class AccessAuthorizationService {
    auth;
    users;
    teams;
    teamMemberships;
    projectMemberships;
    projectTeams;
    projects;
    dataSources;
    constructor(auth, users, teams, teamMemberships, projectMemberships, projectTeams, projects, dataSources) {
        this.auth = auth;
        this.users = users;
        this.teams = teams;
        this.teamMemberships = teamMemberships;
        this.projectMemberships = projectMemberships;
        this.projectTeams = projectTeams;
        this.projects = projects;
        this.dataSources = dataSources;
    }
    getCurrentUserId() {
        return this.auth.getAuthenticatedUser()?.userId ?? null;
    }
    resolveAuthenticatedProfile() {
        const profile = (0, resolve_authenticated_profile_1.resolveAuthenticatedProfile)({
            auth: this.auth,
            users: this.users,
            accessAuthorization: this,
        });
        (0, resolve_authenticated_profile_1.logIdentityResolutionDiagnostics)(profile, this.auth.getAuthenticatedUser());
        return profile;
    }
    getAuthorizationContext(userId) {
        const resolvedAuthUserId = userId ?? this.getCurrentUserId();
        if (!resolvedAuthUserId) {
            return null;
        }
        const authUser = this.auth.getAuthenticatedUser();
        const user = this.users.resolveByAuthUserId(resolvedAuthUserId) ??
            this.users.getById(resolvedAuthUserId) ??
            (authUser?.email ? this.users.getByEmail(authUser.email) : null);
        if (!user || !user.isActive) {
            return this.buildSupabaseVerifiedOwnerContext(resolvedAuthUserId, authUser);
        }
        if (process.env.NODE_ENV !== "production" &&
            user.supabaseUserId &&
            user.supabaseUserId !== resolvedAuthUserId &&
            authUser?.email &&
            (0, normalize_email_1.normalizeEmail)(user.email) === (0, normalize_email_1.normalizeEmail)(authUser.email)) {
            console.warn(`[identity-resolution] Stale local Supabase link detected for ${(0, local_desktop_identity_1.abbreviateUserId)(resolvedAuthUserId)}; using email-linked local user ${(0, local_desktop_identity_1.abbreviateUserId)(user.id)}.`);
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
            .filter((entry) => entry !== null);
        const accessibleTeamIds = this.resolveAccessibleTeamIds(user.platformRole, teamMemberships);
        const accessibleProjectIds = this.resolveAccessibleProjectIds(user.id, user.platformRole, teamMemberships);
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
            canManageUsersAndAccess: user.platformRole === "owner" ||
                teamMemberships.some((membership) => membership.role === "admin" && membership.isActive && membership.teamIsActive),
            canManageTeams: user.platformRole === "owner",
        };
    }
    buildSupabaseVerifiedOwnerContext(resolvedAuthUserId, authUser) {
        if (!authUser ||
            authUser.userId !== resolvedAuthUserId ||
            !authUser.profileSyncedAt ||
            (0, user_identity_reconciliation_service_1.mapSupabaseProfileRoleToPlatformRole)(authUser.role) !== "owner") {
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
    getProjectTeams(projectId) {
        return this.projectTeams.listForProject(projectId);
    }
    isProjectAssignedToTeam(projectId, teamId) {
        return this.projectTeams.isAssigned(projectId, teamId);
    }
    getProjectsForTeam(teamId) {
        const projectIds = this.projectTeams.getProjectIdsForTeam(teamId);
        return this.projects
            .list()
            .filter((project) => projectIds.includes(project.id));
    }
    getVisibleProjectTeams(context, projectId) {
        const assignedTeamIds = this.projectTeams.getTeamIdsForProject(projectId);
        if (assignedTeamIds.length === 0) {
            return [];
        }
        if (context.isPlatformOwner) {
            return assignedTeamIds
                .map((teamId) => this.teams.getById(teamId))
                .filter((team) => team !== null)
                .map((team) => ({ id: team.id, name: team.name }))
                .sort((left, right) => left.name.localeCompare(right.name));
        }
        const visibleTeamIds = new Set();
        for (const teamId of assignedTeamIds) {
            const membership = context.teamMemberships.find((entry) => entry.teamId === teamId && entry.isActive && entry.teamIsActive);
            if (membership) {
                visibleTeamIds.add(teamId);
            }
        }
        return [...visibleTeamIds]
            .map((teamId) => this.teams.getById(teamId))
            .filter((team) => team !== null)
            .map((team) => ({ id: team.id, name: team.name }))
            .sort((left, right) => left.name.localeCompare(right.name));
    }
    getAccessibleProjects(userId) {
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
            if ((0, project_permissions_1.normalizeProjectIsActive)(project)) {
                return true;
            }
            return this.getProjectCapabilities(context.userId, project.id).canEditProjectSettings;
        });
    }
    getProjectCapabilities(userId, projectId) {
        const context = this.getAuthorizationContext(userId);
        const project = this.projects.getById(projectId);
        if (!context || !project) {
            return access_types_1.EMPTY_CAPABILITIES;
        }
        if (!context.accessibleProjectIds.includes(projectId)) {
            return access_types_1.EMPTY_CAPABILITIES;
        }
        if (!(0, project_permissions_1.normalizeProjectIsActive)(project) && !context.isPlatformOwner) {
            const teamRole = this.resolveHighestTeamRoleForProject(context, projectId);
            if (teamRole !== "admin") {
                return access_types_1.EMPTY_CAPABILITIES;
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
            return access_types_1.EMPTY_CAPABILITIES;
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
    assertCanManageTeam(actorUserId, teamId) {
        const context = this.getAuthorizationContext(actorUserId);
        if (!context) {
            throw new Error("You do not have permission to manage this team.");
        }
        if (context.isPlatformOwner) {
            return;
        }
        const membership = context.teamMemberships.find((entry) => entry.teamId === teamId &&
            entry.role === "admin" &&
            entry.isActive &&
            entry.teamIsActive);
        if (!membership) {
            throw new Error("You do not have permission to manage this team.");
        }
    }
    assertCanManageProjectForTeam(actorUserId, projectId, teamId) {
        this.assertCanManageTeam(actorUserId, teamId);
        if (!this.projectTeams.isAssigned(projectId, teamId)) {
            throw new Error("This project does not belong to the selected team.");
        }
    }
    assertCanEditProjectSettings(userId, projectId) {
        const capabilities = this.getProjectCapabilities(userId, projectId);
        if (!capabilities.canEditProjectSettings) {
            throw new Error("You do not have permission to edit project settings.");
        }
    }
    assertCanOperateEngine(userId, engineId) {
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
    assertCanEditScraperCode(userId, projectId) {
        const capabilities = this.getProjectCapabilities(userId, projectId);
        if (!capabilities.canEditScraperCode) {
            throw new Error("You do not have permission to edit scraper code.");
        }
    }
    assertCanViewProject(userId, projectId) {
        const capabilities = this.getProjectCapabilities(userId, projectId);
        if (!capabilities.canViewProject) {
            throw new Error("You do not have permission to view this project.");
        }
    }
    resolveAccessibleTeamIds(platformRole, memberships) {
        if (platformRole === "owner") {
            return this.teams.listAll().map((team) => team.id);
        }
        return memberships
            .filter((membership) => membership.isActive && membership.teamIsActive)
            .map((membership) => membership.teamId);
    }
    resolveAccessibleProjectIds(userId, platformRole, memberships) {
        const allProjects = this.projects.list();
        if (platformRole === "owner") {
            return allProjects.map((project) => project.id);
        }
        const projectIds = new Set();
        const activeMemberships = memberships.filter((entry) => entry.isActive && entry.teamIsActive);
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
                const scopedMembership = this.projectMemberships.get(project.id, membership.teamId, userId);
                if (scopedMembership) {
                    projectIds.add(project.id);
                }
            }
        }
        return [...projectIds];
    }
    resolveHighestTeamRoleForProject(context, projectId) {
        const assignedTeamIds = this.projectTeams.getTeamIdsForProject(projectId);
        let highest = null;
        for (const teamId of assignedTeamIds) {
            const membership = context.teamMemberships.find((entry) => entry.teamId === teamId && entry.isActive && entry.teamIsActive);
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
    findScopedProjectMembership(userId, projectId) {
        const memberships = this.projectMemberships.listForProject(projectId).filter((entry) => entry.userId === userId);
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
    listUsersWithProjectAccess(actorUserId, projectId) {
        const context = this.getAuthorizationContext(actorUserId);
        if (!context) {
            throw new Error("You do not have permission to view project access.");
        }
        this.assertCanViewProject(actorUserId, projectId);
        const canViewDetails = context.isPlatformOwner ||
            this.resolveHighestTeamRoleForProject(context, projectId) === "admin";
        if (!canViewDetails) {
            throw new Error("You do not have permission to view users with access.");
        }
        const rolePriority = {
            Owner: 0,
            Admin: 1,
            Operator: 2,
            Viewer: 3,
        };
        const merged = new Map();
        const addPath = (userId, role, path, includeEmail) => {
            const user = this.users.getById(userId);
            if (!user || !user.isActive)
                return;
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
            if (!user.isActive || user.platformRole !== "owner")
                continue;
            addPath(user.id, "Owner", { type: "owner", teamId: null, teamName: null, membershipId: null }, true);
        }
        const assignedTeamIds = this.projectTeams.getTeamIdsForProject(projectId);
        for (const teamId of assignedTeamIds) {
            const team = this.teams.getById(teamId);
            if (!team?.isActive)
                continue;
            for (const membership of this.teamMemberships.listForTeam(teamId)) {
                if (!membership.isActive)
                    continue;
                if (membership.role === "admin") {
                    addPath(membership.userId, "Admin", {
                        type: "team_admin",
                        teamId,
                        teamName: team.name,
                        membershipId: membership.id,
                    }, true);
                }
            }
            for (const assignment of this.projectMemberships.listForProjectTeam(projectId, teamId)) {
                const teamMembership = this.teamMemberships.get(teamId, assignment.userId);
                if (!teamMembership?.isActive || teamMembership.role === "admin")
                    continue;
                addPath(assignment.userId, assignment.accessRole === "operator" ? "Operator" : "Viewer", {
                    type: assignment.accessRole === "operator"
                        ? "project_operator"
                        : "project_viewer",
                    teamId,
                    teamName: team.name,
                    membershipId: assignment.id,
                }, true);
            }
        }
        const adminTeamIds = context.isPlatformOwner
            ? new Set(assignedTeamIds)
            : new Set(context.teamMemberships
                .filter((entry) => entry.role === "admin" && entry.isActive)
                .map((entry) => entry.teamId));
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
                if (!target || target.platformRole === "owner") {
                    return false;
                }
                if (context.isPlatformOwner) {
                    return (path.type === "project_operator" ||
                        path.type === "project_viewer" ||
                        path.type === "team_admin");
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
            if (roleDiff !== 0)
                return roleDiff;
            return left.name.localeCompare(right.name);
        });
    }
    canViewUserDetails(actorUserId, targetUserId) {
        if (!actorUserId || !targetUserId) {
            return false;
        }
        if (actorUserId === targetUserId) {
            return Boolean(this.getAuthorizationContext(actorUserId));
        }
        const actorContext = this.getAuthorizationContext(actorUserId);
        if (!actorContext) {
            return false;
        }
        const targetUser = this.users.getById(targetUserId);
        if (!targetUser) {
            return false;
        }
        if (actorContext.isPlatformOwner) {
            return true;
        }
        const adminTeamIds = new Set(actorContext.teamMemberships
            .filter((membership) => membership.role === "admin" && membership.isActive && membership.teamIsActive)
            .map((membership) => membership.teamId));
        if (adminTeamIds.size === 0) {
            return false;
        }
        const targetMemberships = this.teamMemberships.listForUser(targetUserId);
        return targetMemberships.some((membership) => membership.isActive && adminTeamIds.has(membership.teamId));
    }
    listViewableUserIds(actorUserId) {
        const context = this.getAuthorizationContext(actorUserId);
        if (!context) {
            return [];
        }
        const ids = new Set([context.userId]);
        if (context.isPlatformOwner) {
            for (const user of this.users.listAll()) {
                if (user.isActive) {
                    ids.add(user.id);
                }
            }
            return [...ids];
        }
        const adminTeamIds = new Set(context.teamMemberships
            .filter((membership) => membership.role === "admin" && membership.isActive && membership.teamIsActive)
            .map((membership) => membership.teamId));
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
    resolveProjectAccessPaths(userId, projectId) {
        const paths = [];
        const user = this.users.getById(userId);
        if (!user?.isActive)
            return paths;
        if (user.platformRole === "owner") {
            paths.push({ type: "owner", teamId: null, teamName: null, membershipId: null });
        }
        for (const teamId of this.projectTeams.getTeamIdsForProject(projectId)) {
            const team = this.teams.getById(teamId);
            if (!team?.isActive)
                continue;
            const membership = this.teamMemberships.get(teamId, userId);
            if (membership?.isActive && membership.role === "admin") {
                paths.push({
                    type: "team_admin",
                    teamId,
                    teamName: team.name,
                    membershipId: membership.id,
                });
            }
            for (const assignment of this.projectMemberships.listForProjectTeam(projectId, teamId)) {
                if (assignment.userId !== userId)
                    continue;
                const teamMembership = this.teamMemberships.get(teamId, userId);
                if (!teamMembership?.isActive || teamMembership.role === "admin")
                    continue;
                paths.push({
                    type: assignment.accessRole === "operator" ? "project_operator" : "project_viewer",
                    teamId,
                    teamName: team.name,
                    membershipId: assignment.id,
                });
            }
        }
        return paths;
    }
}
exports.AccessAuthorizationService = AccessAuthorizationService;
function fullCapabilities(canManageUsers) {
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
