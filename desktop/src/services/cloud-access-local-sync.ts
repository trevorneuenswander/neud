import type { ProjectsRepository } from "../repositories/projects-repository";
import type { ProjectTeamAssignmentsRepository } from "../repositories/project-team-assignments-repository";
import type { TeamsRepository } from "../repositories/teams-repository";

export type CloudAccessLocalSyncDiagnostics = {
  projectTeamAssignmentExists: boolean;
  assignedTeamId: string | null;
  teamAdminCount: number;
  inheritedManagerCount: number;
  directoryInheritedAccessCount: number;
  staleCacheDetected: boolean;
  teamIdAliasesApplied: number;
  firstTeamAccessFailureStage:
    | "assignment_not_persisted"
    | "team_membership_not_loaded"
    | "team_admin_not_detected"
    | "effective_access_helper_false"
    | "directory_rpc_omits_inherited_access"
    | "ui_model_omits_inherited_access"
    | "permission_gate_omits_inherited_access"
    | "stale_directory_cache"
    | "none";
};

function normalizeTeamKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Map a hosted team UUID onto the local teams row with the same name when the
 * cloud id is not present locally (e.g. ensureHildrethTeamAdmin created a
 * separate local HMG team id).
 */
export function resolveLocalTeamIdForCloudAssignment(input: {
  cloudTeamId: string;
  teams: TeamsRepository;
  cloudTeams?: Array<{ id?: string; name?: string; slug?: string }>;
}): { teamId: string; aliased: boolean } {
  if (input.teams.getById(input.cloudTeamId)) {
    return { teamId: input.cloudTeamId, aliased: false };
  }
  const cloudTeam = (input.cloudTeams ?? []).find((entry) => entry.id === input.cloudTeamId);
  const cloudName = normalizeTeamKey(cloudTeam?.name);
  if (cloudName) {
    const matches = input.teams
      .listAll()
      .filter((team) => normalizeTeamKey(team.name) === cloudName);
    // Ambiguous same-name local teams must not inherit cloud assignments.
    if (matches.length === 1) {
      return { teamId: matches[0]!.id, aliased: true };
    }
  }
  return { teamId: input.cloudTeamId, aliased: false };
}

export function syncCloudProjectTeamAssignmentsToLocal(input: {
  projects: ProjectsRepository;
  projectTeams: ProjectTeamAssignmentsRepository;
  teams?: TeamsRepository | null;
  cloudProjectTeams: Array<{ projectId?: string; teamId?: string }>;
  cloudProjects?: Array<{ id?: string; slug?: string }>;
  cloudTeams?: Array<{ id?: string; name?: string; slug?: string }>;
  teamMemberships: Array<{ teamId?: string; userId?: string; role?: string }>;
  actorUserId: string | null;
}): CloudAccessLocalSyncDiagnostics {
  const diagnostics: CloudAccessLocalSyncDiagnostics = {
    projectTeamAssignmentExists: false,
    assignedTeamId: null,
    teamAdminCount: 0,
    inheritedManagerCount: 0,
    directoryInheritedAccessCount: 0,
    staleCacheDetected: false,
    teamIdAliasesApplied: 0,
    firstTeamAccessFailureStage: "none",
  };

  const cloudPairs = input.cloudProjectTeams
    .map((entry) => ({
      projectId: typeof entry.projectId === "string" ? entry.projectId : "",
      teamId: typeof entry.teamId === "string" ? entry.teamId : "",
    }))
    .filter((entry) => entry.projectId && entry.teamId);

  diagnostics.directoryInheritedAccessCount = cloudPairs.length;
  diagnostics.projectTeamAssignmentExists = cloudPairs.length > 0;
  diagnostics.assignedTeamId = cloudPairs[0]?.teamId ?? null;

  diagnostics.teamAdminCount = input.teamMemberships.filter(
    (membership) => membership.role === "admin" || membership.role === "owner",
  ).length;

  const localProjectIds = new Set(input.projects.list().map((project) => project.id));
  const desiredByProject = new Map<string, string[]>();

  const cloudProjectSlugById = new Map<string, string>();
  for (const project of input.cloudProjects ?? []) {
    if (typeof project.id === "string" && typeof project.slug === "string" && project.slug) {
      cloudProjectSlugById.set(project.id, project.slug);
    }
  }

  for (const pair of cloudPairs) {
    let localProjectId = pair.projectId;
    if (!localProjectIds.has(localProjectId)) {
      const slug = cloudProjectSlugById.get(pair.projectId);
      if (slug) {
        const local = input.projects.getBySlug(slug);
        if (local) {
          localProjectId = local.id;
        }
      }
    }
    if (!localProjectIds.has(localProjectId)) {
      continue;
    }
    let localTeamId = pair.teamId;
    if (input.teams) {
      const resolved = resolveLocalTeamIdForCloudAssignment({
        cloudTeamId: pair.teamId,
        teams: input.teams,
        cloudTeams: input.cloudTeams,
      });
      localTeamId = resolved.teamId;
      if (resolved.aliased) {
        diagnostics.teamIdAliasesApplied += 1;
      }
    }
    const current = desiredByProject.get(localProjectId) ?? [];
    current.push(localTeamId);
    desiredByProject.set(localProjectId, current);
  }

  for (const projectId of localProjectIds) {
    const desiredTeamIds = desiredByProject.get(projectId) ?? [];
    const before = input.projectTeams.getTeamIdsForProject(projectId);
    const after = input.projectTeams.setTeamsForProject(
      projectId,
      desiredTeamIds,
      input.actorUserId,
    );

    if (before.length !== after.length || before.some((teamId) => !after.includes(teamId))) {
      diagnostics.staleCacheDetected = true;
    }
  }

  for (const pair of cloudPairs) {
    let localProjectId = pair.projectId;
    if (!localProjectIds.has(localProjectId)) {
      const slug = cloudProjectSlugById.get(pair.projectId);
      if (slug) {
        const local = input.projects.getBySlug(slug);
        if (local) {
          localProjectId = local.id;
        }
      }
    }
    let localTeamId = pair.teamId;
    if (input.teams) {
      localTeamId = resolveLocalTeamIdForCloudAssignment({
        cloudTeamId: pair.teamId,
        teams: input.teams,
        cloudTeams: input.cloudTeams,
      }).teamId;
    }
    if (!input.projectTeams.isAssigned(localProjectId, localTeamId)) {
      diagnostics.firstTeamAccessFailureStage = "assignment_not_persisted";
      break;
    }
  }

  for (const pair of cloudPairs) {
    const adminCount = input.teamMemberships.filter(
      (membership) =>
        membership.teamId === pair.teamId &&
        (membership.role === "admin" || membership.role === "owner"),
    ).length;
    diagnostics.inheritedManagerCount += adminCount;
  }

  return diagnostics;
}
