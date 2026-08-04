import { notFound, redirect } from "next/navigation";
import {
  canCreateProject,
  isPlatformAdministrator,
  requireUser,
} from "@/lib/auth/authorization";
import { shouldUseLocalData } from "@/lib/local/mode";
import { resolveLocalAuthenticatedPrincipal } from "@/lib/local/auth.server";
import { localGetProjectsMeta } from "@/lib/local/displays-api";
import type { LocalProjectsListMeta } from "@/lib/displays/types";
import { localGetProjectAccessContext } from "@/lib/local/access-api";
import type { ProjectAccessContext } from "@/lib/projects/types";
import {
  PROJECT_ACCESS_LEVELS,
  type ProjectAccessLevel,
  type ProjectAccessLevelWithAdmin,
} from "@/lib/projects/constants";
import { getProjectBySlug } from "@/lib/projects/queries";
import {
  canAccessProject,
  canManageProjectSettings,
  canOperateProjectDisplays,
  resolveSupabaseProjectRole,
  type ProjectRole,
} from "@/lib/projects/project-permissions";
import { createClient } from "@/lib/supabase/server";

async function resolveProjectMembership(
  projectId: string,
  userId: string,
): Promise<ProjectAccessLevel | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_members")
    .select("access_level")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.access_level as ProjectAccessLevel;
}

function toAccessLevel(projectRole: ProjectRole): ProjectAccessLevelWithAdmin {
  if (projectRole === "owner" || projectRole === "admin") {
    return "admin";
  }
  if (projectRole === "operator") {
    return "operator";
  }
  return "viewer";
}

function buildProjectAccessContext(input: {
  project: NonNullable<Awaited<ReturnType<typeof getProjectBySlug>>>;
  projectRole: ProjectRole;
  isPlatformAdmin: boolean;
  canOperateDisplays?: boolean;
}): ProjectAccessContext {
  const canManageSettings = canManageProjectSettings(input.projectRole);

  return {
    project: input.project,
    accessLevel: toAccessLevel(input.projectRole),
    isPlatformAdmin: input.isPlatformAdmin,
    canManageMembers: input.isPlatformAdmin,
    canManageSettings,
    canOperateDisplays:
      input.canOperateDisplays ?? canOperateProjectDisplays(input.projectRole),
    projectRole: input.projectRole,
  };
}

export type ProjectAccessResolution =
  | { state: "ready"; access: ProjectAccessContext }
  | { state: "loading" }
  | { state: "identity-error"; message: string }
  | { state: "denied" };

export async function resolveProjectAccess(
  projectIdentifier: string,
): Promise<ProjectAccessResolution> {
  const project = await getProjectBySlug(projectIdentifier);

  if (!project) {
    return { state: "denied" };
  }

  if (shouldUseLocalData()) {
    const localPrincipal = await resolveLocalAuthenticatedPrincipal();
    if (!localPrincipal) {
      await requireUser();
    }

    let meta: LocalProjectsListMeta | null = null;
    try {
      meta = await localGetProjectsMeta({ wait: false });
    } catch {
      meta = null;
    }

    if (
      meta?.identityStatus === "loading-session" ||
      meta?.identityStatus === "loading-profile"
    ) {
      return { state: "loading" };
    }

    if (
      meta?.identityStatus === "error" ||
      meta?.identityStatus === "missing-profile" ||
      meta?.identityStatus === "stale-session" ||
      meta?.identityStatus === "identity-conflict"
    ) {
      return {
        state: "identity-error",
        message:
          meta.identityMessage ??
          "NEUD could not load your account from Supabase.",
      };
    }

    try {
      const access = await localGetProjectAccessContext(projectIdentifier);
      const projectRecord = access.project as ProjectAccessContext["project"];
      return {
        state: "ready",
        access: buildProjectAccessContext({
          project: projectRecord,
          projectRole: access.projectRole as ProjectRole,
          isPlatformAdmin: access.isPlatformAdmin,
          canOperateDisplays: access.capabilities.canOperateDisplays,
        }),
      };
    } catch {
      return { state: "denied" };
    }
  }

  const hostedAccess = await getHostedProjectAccess(project);
  if (!hostedAccess) {
    return { state: "denied" };
  }

  return { state: "ready", access: hostedAccess };
}

async function getHostedProjectAccess(
  project: NonNullable<Awaited<ReturnType<typeof getProjectBySlug>>>,
): Promise<ProjectAccessContext | null> {
  const { profile } = await requireUser();
  const platformAdmin = isPlatformAdministrator(profile);

  if (platformAdmin) {
    const projectRole = resolveSupabaseProjectRole({
      platformAdmin: true,
      profileRole: profile.role,
      membershipAccessLevel: null,
    });

    if (!canAccessProject(projectRole, project)) {
      return null;
    }

    return buildProjectAccessContext({
      project,
      projectRole,
      isPlatformAdmin: true,
    });
  }

  const membership = await resolveProjectMembership(project.id, profile.id);

  if (!membership) {
    return null;
  }

  const projectRole = resolveSupabaseProjectRole({
    platformAdmin: false,
    profileRole: profile.role,
    membershipAccessLevel: membership,
  });

  if (!canAccessProject(projectRole, project)) {
    return null;
  }

  return buildProjectAccessContext({
    project,
    projectRole,
    isPlatformAdmin: false,
  });
}

export async function getProjectAccess(
  projectIdentifier: string,
): Promise<ProjectAccessContext | null> {
  const resolution = await resolveProjectAccess(projectIdentifier);
  return resolution.state === "ready" ? resolution.access : null;
}

export async function requireProjectAccess(
  projectIdentifier: string,
): Promise<ProjectAccessContext> {
  const resolution = await resolveProjectAccess(projectIdentifier);

  if (resolution.state === "ready") {
    return resolution.access;
  }

  if (shouldUseLocalData()) {
    notFound();
  }

  notFound();
}

export async function requireProjectSettingsAccess(
  projectIdentifier: string,
): Promise<ProjectAccessContext> {
  const access = await requireProjectAccess(projectIdentifier);

  if (!access.canManageSettings) {
    notFound();
  }

  return access;
}

export async function requireProjectRole(
  projectIdentifier: string,
  allowedRoles: ProjectAccessLevelWithAdmin[],
): Promise<ProjectAccessContext> {
  const access = await requireProjectAccess(projectIdentifier);

  if (!allowedRoles.includes(access.accessLevel)) {
    notFound();
  }

  return access;
}

export async function canManageProjectMembers(
  projectIdentifier: string,
): Promise<boolean> {
  const access = await getProjectAccess(projectIdentifier);
  return access?.canManageMembers ?? false;
}

export async function requireProjectMemberManagement(
  projectIdentifier: string,
): Promise<ProjectAccessContext> {
  const access = await requireProjectAccess(projectIdentifier);

  if (!access.canManageMembers) {
    notFound();
  }

  return access;
}

export async function requireProjectCreationAccess() {
  const { profile } = await requireUser();

  if (!canCreateProject(profile)) {
    redirect("/projects");
  }

  return { profile };
}

export async function countProjectManagers(projectId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("project_members")
    .select("user_id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("access_level", "manager");

  if (error || count === null) {
    return 0;
  }

  return count;
}

export function canAssignProjectAccessLevel(
  accessLevel: ProjectAccessLevel,
): boolean {
  return PROJECT_ACCESS_LEVELS.includes(accessLevel);
}
