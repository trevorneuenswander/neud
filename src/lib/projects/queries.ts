import { isAdmin } from "@/lib/auth/authorization";
import type { ProjectListItem } from "@/lib/projects/types";
import type {
  Project,
  ProjectMemberWithProfile,
  ProfileWithEmail,
} from "@/types/database";
import { createClient } from "@/lib/supabase/server";

const PROJECT_COLUMNS =
  "id, project_number, owner_id, name, slug, description, project_type, status, display_token, theme, logo_url, primary_color, secondary_color, icon, settings, metadata, archived_at, created_at, updated_at";

export async function getProjectBySlug(slug: string): Promise<Project | null> {
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

    return (data as Project[]).map((project) => ({
      ...project,
      accessLevel: "admin" as const,
    }));
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

      return {
        ...project,
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

  return projects;
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
    company: string | null;
    email: string;
  }>).map((row) => ({
    project_id: row.project_id,
    user_id: row.user_id,
    access_level: row.access_level,
    assigned_by: row.assigned_by,
    created_at: row.created_at,
    profile: {
      id: row.user_id,
      full_name: row.full_name,
      company: row.company,
      role: "user",
      created_at: row.created_at,
      updated_at: row.created_at,
      email: row.email,
    },
  }));
}

export async function getAssignableUsers(
  projectId: string,
): Promise<ProfileWithEmail[]> {
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
    company: string | null;
    role: ProfileWithEmail["role"];
    email: string;
  }>).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    company: row.company,
    role: row.role,
    email: row.email,
    created_at: "",
    updated_at: "",
  }));
}

export async function getOwnerProfile(ownerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, company, role, created_at, updated_at")
    .eq("id", ownerId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function verifyProjectsConnected(): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase.from("projects").select("id").limit(1);

  return !error;
}
