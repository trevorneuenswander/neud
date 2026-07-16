import { notFound, redirect } from "next/navigation";
import { isAdmin, requireUser } from "@/lib/auth/authorization";
import type { ProjectAccessContext } from "@/lib/projects/types";
import {
  PROJECT_ACCESS_LEVELS,
  type ProjectAccessLevel,
  type ProjectAccessLevelWithAdmin,
} from "@/lib/projects/constants";
import { getProjectBySlug } from "@/lib/projects/queries";
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

export async function getProjectAccess(
  projectIdentifier: string,
): Promise<ProjectAccessContext | null> {
  const { profile } = await requireUser();
  const project = await getProjectBySlug(projectIdentifier);

  if (!project) {
    return null;
  }

  const platformAdmin = await isAdmin();

  if (platformAdmin) {
    return {
      project,
      accessLevel: "admin",
      isPlatformAdmin: true,
      canManageMembers: true,
    };
  }

  const membership = await resolveProjectMembership(project.id, profile.id);

  if (!membership) {
    return null;
  }

  return {
    project,
    accessLevel: membership,
    isPlatformAdmin: false,
    canManageMembers: membership === "manager",
  };
}

export async function requireProjectAccess(
  projectIdentifier: string,
): Promise<ProjectAccessContext> {
  const access = await getProjectAccess(projectIdentifier);

  if (!access) {
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
  const platformAdmin = await isAdmin();

  if (!platformAdmin) {
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
