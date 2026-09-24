import { shouldUseLocalData } from "@/lib/local/mode";
import {
  localListProjects,
  localSlugExists,
  localVerifyConnected,
} from "@/lib/local/api";
import { localGetProjectsMeta } from "@/lib/local/displays-api";
import type { LocalProjectsListMeta } from "@/lib/displays/types";
import { isAdmin } from "@/lib/auth/authorization";
import type { ProjectListItem } from "@/lib/projects/types";
import {
  canManageProjectSettings,
  normalizeProjectIsActive,
  resolveLocalProjectRole,
  resolveSupabaseProjectRole,
} from "@/lib/projects/project-permissions";
import type {
  Project,
  ProjectMemberWithProfile,
  ProfileWithEmail,
} from "@/types/database";
import { createClient } from "@/lib/supabase/server";

const PROJECT_COLUMNS =
  "id, project_number, owner_id, name, slug, description, project_type, status, is_active, display_token, theme, logo_url, primary_color, secondary_color, icon, settings, metadata, archived_at, created_at, updated_at";

async function attachProjectTeamNames(
  projects: ProjectListItem[],
): Promise<ProjectListItem[]> {
  if (projects.length === 0) {
    return projects;
  }

  const supabase = await createClient();
  const projectIds = projects.map((project) => project.id);
  const { data: assignments, error: assignmentError } = await supabase
    .from("project_team_assignments")
    .select("project_id, team_id")
    .in("project_id", projectIds);

  if (assignmentError || !assignments?.length) {
    return projects.map((project) => ({ ...project, teams: project.teams ?? [] }));
  }

  const teamIds = [...new Set(assignments.map((row) => row.team_id))];
  const { data: teams, error: teamError } = await supabase
    .from("teams")
    .select("id, name")
    .in("id", teamIds);

  if (teamError || !teams) {
    return projects.map((project) => ({ ...project, teams: project.teams ?? [] }));
  }

  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const teamsByProjectId = new Map<string, Array<{ id: string; name: string }>>();

  for (const assignment of assignments) {
    const teamName = teamNameById.get(assignment.team_id);
    if (!teamName) {
      continue;
    }
    const current = teamsByProjectId.get(assignment.project_id) ?? [];
    current.push({ id: assignment.team_id, name: teamName });
    teamsByProjectId.set(assignment.project_id, current);
  }

  return projects.map((project) => ({
    ...project,
    teams: (teamsByProjectId.get(project.id) ?? []).sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  }));
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  if (shouldUseLocalData()) {
    try {
      const { projects } = await localListProjects();
      const project = projects.find(
        (entry) => String(entry.slug ?? "") === slug,
      );
      return project ? (project as Project) : null;
    } catch {
      return null;
    }
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Project;
}

export async function slugExists(slug: string): Promise<boolean> {
  if (shouldUseLocalData()) {
    try {
      const { exists } = await localSlugExists(slug);
      return exists;
    } catch {
      return false;
    }
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  return !error && data !== null;
}

export async function resolveUniqueSlug(baseSlug: string): Promise<string | null> {
  if (!baseSlug) {
    return null;
  }

  if (!(await slugExists(baseSlug))) {
    return baseSlug;
  }

  for (let suffix = 2; suffix <= 100; suffix += 1) {
    const candidate = `${baseSlug}-${suffix}`.slice(0, 120);

    if (!(await slugExists(candidate))) {
      return candidate;
    }
  }

  return null;
}

export async function getVisibleProjects(
  query?: string,
): Promise<ProjectListItem[]> {
  if (shouldUseLocalData()) {
    try {
      const { projects } = await localListProjects(query);
      let meta: LocalProjectsListMeta | null = null;
      try {
        meta = await localGetProjectsMeta({ wait: false });
      } catch {
        meta = null;
      }
      const projectRole = resolveLocalProjectRole(meta?.authenticatedUserRole);
      return (projects as Array<Project & { teams?: Array<{ id: string; name: string }> }>).map(
        (project) => ({
          ...project,
          is_active: normalizeProjectIsActive(project),
          teams: project.teams ?? [],
          accessLevel: canManageProjectSettings(projectRole) ? ("admin" as const) : ("operator" as const),
        }),
      );
    } catch {
      return [];
    }
  }

  const supabase = await createClient();
  const platformAdmin = await isAdmin();
  const trimmedQuery = query?.trim() ?? "";

  if (platformAdmin) {
    let request = supabase
      .from("projects")
      .select(PROJECT_COLUMNS)
      .order("updated_at", { ascending: false });

    if (trimmedQuery) {
      request = request.ilike("name", `%${trimmedQuery}%`);
    }

    const { data, error } = await request;

    if (error || !data) {
      return [];
    }

    const items = (data as Project[]).map((project) => ({
      ...project,
      is_active: normalizeProjectIsActive(project),
      accessLevel: "admin" as const,
    }));
    return attachProjectTeamNames(items);
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("project_members")
    .select(`access_level, projects (${PROJECT_COLUMNS})`);

  if (membershipError || !memberships) {
    return [];
  }

  const projects = memberships
    .map((row) => {
      const projectData = row.projects as Project | Project[] | null;
      const project = Array.isArray(projectData) ? projectData[0] : projectData;

      if (!project) {
        return null;
      }

      const projectRole = resolveSupabaseProjectRole({
        platformAdmin: false,
        profileRole: null,
        membershipAccessLevel: row.access_level,
      });

      if (
        !canManageProjectSettings(projectRole) &&
        !normalizeProjectIsActive(project)
      ) {
        return null;
      }

      return {
        ...project,
        is_active: normalizeProjectIsActive(project),
        accessLevel: row.access_level as ProjectListItem["accessLevel"],
      };
    })
    .filter((project): project is ProjectListItem => project !== null)
    .filter((project) => {
      if (!trimmedQuery) {
        return true;
      }

      return project.name.toLowerCase().includes(trimmedQuery.toLowerCase());
    })
    .sort(
      (left, right) =>
        new Date(right.updated_at).getTime() -
        new Date(left.updated_at).getTime(),
    );

  return attachProjectTeamNames(projects);
}

export async function getVisibleProjectCount(): Promise<number | null> {
  const projects = await getVisibleProjects();
  return projects.length;
}

export async function getRecentVisibleProjects(limit = 5): Promise<ProjectListItem[]> {
  const projects = await getVisibleProjects();
  return projects.slice(0, limit);
}

export async function getProjectMemberCount(projectId: string): Promise<number | null> {
  if (shouldUseLocalData()) {
    return 1;
  }

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("project_members")
    .select("user_id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (error || count === null) {
    return null;
  }

  return count;
}

export async function getProjectMembersDirectory(
  projectId: string,
): Promise<ProjectMemberWithProfile[]> {
  if (shouldUseLocalData()) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_project_members_directory", {
    p_project_id: projectId,
  });

  if (error || !data) {
    return [];
  }

  return (data as Array<{
    project_id: string;
    user_id: string;
    access_level: ProjectMemberWithProfile["access_level"];
    assigned_by: string | null;
    created_at: string;
    full_name: string | null;
    team: string | null;
    email: string;
    role: string;
  }>).map((row) => ({
    project_id: row.project_id,
    user_id: row.user_id,
    access_level: row.access_level,
    assigned_by: row.assigned_by,
    created_at: row.created_at,
    profile: {
      id: row.user_id,
      full_name: row.full_name,
      email: row.email,
      phone_number: null,
      team: row.team,
      role: row.role as ProfileWithEmail["role"],
      created_at: row.created_at,
      updated_at: row.created_at,
    },
  }));
}

export async function getAssignableUsers(
  projectId: string,
): Promise<ProfileWithEmail[]> {
  if (shouldUseLocalData()) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_assignable_users_for_project", {
    p_project_id: projectId,
  });

  if (error || !data) {
    return [];
  }

  return (data as Array<{
    id: string;
    full_name: string | null;
    team: string | null;
    role: ProfileWithEmail["role"];
    email: string;
  }>).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone_number: null,
    team: row.team,
    role: row.role,
    created_at: "",
    updated_at: "",
  }));
}

export async function getOwnerProfile(ownerId: string) {
  if (shouldUseLocalData()) {
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone_number, team, role, created_at, updated_at")
    .eq("id", ownerId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function verifyProjectsConnected(): Promise<boolean> {
  if (shouldUseLocalData()) {
    try {
      return await localVerifyConnected();
    } catch {
      return false;
    }
  }

  const supabase = await createClient();

  const { error } = await supabase.from("projects").select("id").limit(1);

  return !error;
}
