import { createClient } from "@/lib/supabase/server";
import {
  mapActiveDisplayToCardDisplay,
  type HostedDisplayCardDisplay,
} from "@/lib/hosted/hosted-display-snapshot";

type HostedActiveDisplay = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_width: number | null;
  display_height: number | null;
  enabled: boolean;
  online_viewer_enabled: boolean;
  online_visibility: "private" | "public";
  online_published_at: string | null;
  online_published_revision_id: string | null;
  online_publish_error: string | null;
  refresh_rate_ms: number | null;
  sort_order: number | null;
};

export type HostedAccessibleProject = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  activeDisplayCount: number;
};

type HostedProjectSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  activeDisplayCount: number;
  onlineDisplayCount: number;
};

type ProjectMembershipRow = {
  project_id: string;
  projects:
    | {
        id: string;
        slug: string;
        name: string;
        description: string | null;
      }
    | Array<{
        id: string;
        slug: string;
        name: string;
        description: string | null;
      }>
    | null;
};

function formatActiveDisplayCount(count: number): string {
  if (count === 0) {
    return "No Active Displays";
  }
  if (count === 1) {
    return "1 Active Display";
  }
  return `${count} Active Displays`;
}

/** Lists hosted portal projects using explicit membership rows only. */
export async function getHostedAccessibleProjects(): Promise<HostedAccessibleProject[]> {
  const projectRows = await getHostedAccessibleProjectsWithCounts();
  return projectRows.map(({ id, slug, name, description, activeDisplayCount }) => ({
    id,
    slug,
    name,
    description,
    activeDisplayCount,
  }));
}

export async function getHostedAccessibleProjectsWithCounts(): Promise<HostedAccessibleProject[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data: memberships, error } = await supabase
    .from("project_members")
    .select("project_id, projects (id, slug, name, description)")
    .eq("user_id", user.id);

  if (error || !memberships) {
    return [];
  }

  const byId = new Map<string, HostedAccessibleProject>();
  for (const row of memberships as ProjectMembershipRow[]) {
    const projectData = row.projects;
    const project = Array.isArray(projectData) ? projectData[0] : projectData;
    if (!project?.id || !project.slug) {
      continue;
    }
    byId.set(project.id, {
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      activeDisplayCount: 0,
    });
  }

  const projects = Array.from(byId.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  if (projects.length === 0) {
    return projects;
  }

  const { data: counts } = await supabase.rpc("count_active_displays_for_projects", {
    p_project_ids: projects.map((project) => project.id),
  });

  const countByProjectId = new Map<string, number>();
  for (const row of (counts as Array<{ project_id: string; active_display_count: number }> | null) ??
    []) {
    countByProjectId.set(row.project_id, Number(row.active_display_count) || 0);
  }

  return projects.map((project) => ({
    ...project,
    activeDisplayCount: countByProjectId.get(project.id) ?? 0,
  }));
}

export async function getHostedPortalSummary() {
  const projectRows = await getHostedAccessibleProjectsWithCounts();
  const supabase = await createClient();
  let onlineDisplayCount = 0;
  let activePublisherCount = 0;
  let lastSyncAt: string | null = null;

  const enriched: HostedProjectSummary[] = [];

  for (const project of projectRows) {
    const { data: onlineDisplays } = await supabase.rpc("list_online_project_displays", {
      p_project_id: project.id,
    });
    const onlineCount = (onlineDisplays as HostedActiveDisplay[] | null)?.length ?? 0;
    onlineDisplayCount += onlineCount;
    enriched.push({
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      activeDisplayCount: project.activeDisplayCount,
      onlineDisplayCount: onlineCount,
    });

    const { data: settings } = await supabase
      .from("project_publishing_settings")
      .select("last_successful_publish_at, active_publisher_instance_id")
      .eq("project_id", project.id)
      .maybeSingle();

    if (settings?.active_publisher_instance_id) {
      activePublisherCount += 1;
    }
    if (
      settings?.last_successful_publish_at &&
      (!lastSyncAt || settings.last_successful_publish_at > lastSyncAt)
    ) {
      lastSyncAt = settings.last_successful_publish_at;
    }
  }

  return {
    projectCount: projectRows.length,
    onlineDisplayCount,
    activePublisherCount,
    lastSyncAt,
    projects: enriched.slice(0, 6),
  };
}

export async function getHostedProjectPortalSummary(slug: string) {
  const accessible = await getHostedAccessibleProjectsWithCounts();
  const project = accessible.find((entry) => entry.slug === slug) ?? null;
  if (!project) {
    return null;
  }

  const supabase = await createClient();
  const { data: canOperate } = await supabase.rpc("can_operate_project", {
    p_project_id: project.id,
  });

  const { data: displays } = await supabase.rpc("list_project_active_displays", {
    p_project_id: project.id,
  });

  const { data: settings } = await supabase
    .from("project_publishing_settings")
    .select("last_successful_publish_at, active_publisher_instance_id, last_publish_error")
    .eq("project_id", project.id)
    .maybeSingle();

  const activeDisplays = (displays as HostedActiveDisplay[] | null) ?? [];

  return {
    project,
    canReorder: Boolean(canOperate),
    displays: activeDisplays,
    displayListDiagnostics: {
      totalActiveDisplays: activeDisplays.length,
      onlineViewerEnabledCount: activeDisplays.filter((display) => display.online_viewer_enabled)
        .length,
      publishedCount: activeDisplays.filter((display) => display.online_published_revision_id)
        .length,
      disabledCount: activeDisplays.filter((display) => !display.enabled).length,
    },
    publishing: settings ?? null,
  };
}

export async function getHostedActiveDisplaySnapshot(
  projectSlug: string,
  displaySlug: string,
): Promise<HostedDisplayCardDisplay | null> {
  const summary = await getHostedProjectPortalSummary(projectSlug);
  if (!summary) {
    return null;
  }

  const normalizedSlug = displaySlug.trim().toLowerCase();
  const display =
    summary.displays.find((entry) => entry.slug.toLowerCase() === normalizedSlug) ?? null;
  return display ? mapActiveDisplayToCardDisplay(display) : null;
}

export type { HostedActiveDisplay, HostedDisplayCardDisplay };
