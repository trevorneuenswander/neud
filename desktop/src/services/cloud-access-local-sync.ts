import type { ProjectsRepository } from "../repositories/projects-repository";
import type { ProjectTeamAssignmentsRepository } from "../repositories/project-team-assignments-repository";

export type CloudAccessLocalSyncDiagnostics = {
  projectTeamAssignmentExists: boolean;
  assignedTeamId: string | null;
  teamAdminCount: number;
  inheritedManagerCount: number;
  directoryInheritedAccessCount: number;
  staleCacheDetected: boolean;
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

export function syncCloudProjectTeamAssignmentsToLocal(input: {
  projects: ProjectsRepository;
  projectTeams: ProjectTeamAssignmentsRepository;
  cloudProjectTeams: Array<{ projectId?: string; teamId?: string }>;
  cloudProjects?: Array<{ id?: string; slug?: string }>;
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
    const current = desiredByProject.get(localProjectId) ?? [];
    current.push(pair.teamId);
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
    if (!input.projectTeams.isAssigned(localProjectId, pair.teamId)) {
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
