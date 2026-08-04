import { shouldUseLocalData } from "@/lib/local/mode";
import { localFetch } from "@/lib/local/api";
import {
  getVisibleProjects,
} from "@/lib/projects/queries";
import { normalizeProjectIsActive } from "@/lib/projects/project-permissions";
import type { DashboardActivityItem, DashboardData } from "@/lib/dashboard/types";

export async function getDashboardData(limit = 5): Promise<DashboardData> {
  if (shouldUseLocalData()) {
    try {
      return await localFetch<DashboardData>(`/api/dashboard?limit=${limit}`);
    } catch {
      return buildDashboardDataFromProjects(await getVisibleProjects(), limit);
    }
  }

  return buildDashboardDataFromProjects(await getVisibleProjects(), limit);
}

function buildDashboardDataFromProjects(
  projects: Awaited<ReturnType<typeof getVisibleProjects>>,
  limit: number,
): DashboardData {
  const recentProjects = projects.slice(0, limit).map((project) => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description,
    isActive: normalizeProjectIsActive(project),
    updatedAt: project.updated_at,
  }));

  return {
    recentProjects,
    recentActivity: [] satisfies DashboardActivityItem[],
    onlineDisplays: 0,
    runningEngines: 0,
  };
}

export async function getDashboardRecentProjects(limit = 5) {
  const dashboard = await getDashboardData(limit);
  return dashboard.recentProjects;
}

export async function getDashboardRecentActivity(limit = 20) {
  const dashboard = await getDashboardData(limit);
  return dashboard.recentActivity;
}
