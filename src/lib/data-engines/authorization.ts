import { notFound } from "next/navigation";
import { getApplicationRole } from "@/lib/auth/application-roles";
import { getCurrentProfile } from "@/lib/auth/authorization";
import { projectSupportsDataEngines } from "@/lib/data-engines/constants";
import { getEngineById, getEngineForProject } from "@/lib/data-engines/queries";
import type { DataEngineAccessContext } from "@/lib/data-engines/types";
import { localGetProjectEngines, ensureProjectEnginesInitializedOnce } from "@/lib/local/api";
import { shouldUseLocalData } from "@/lib/local/mode";
import { requireProjectAccess } from "@/lib/projects/authorization";
import { createClient } from "@/lib/supabase/server";

export { projectSupportsDataEngines };

export async function requireDataEnginesProject(slug: string) {
  const access = await requireProjectAccess(slug);

  if (!projectSupportsDataEngines(access.project.project_type)) {
    notFound();
  }

  return access;
}

async function resolveEngineAccess(
  engineId: string,
  projectSlug: string,
): Promise<DataEngineAccessContext | null> {
  const projectAccess = await requireDataEnginesProject(projectSlug);
  const engine = await getEngineById(engineId);

  if (!engine || engine.project_id !== projectAccess.project.id) {
    return null;
  }

  const profile = await getCurrentProfile();
  const platformRole = getApplicationRole(profile);
  const accessLevel = projectAccess.accessLevel;

  return {
    engine,
    projectId: projectAccess.project.id,
    projectSlug,
    accessLevel:
      accessLevel === "admin"
        ? "admin"
        : (accessLevel as DataEngineAccessContext["accessLevel"]),
    canControl:
      platformRole === "owner" ||
      platformRole === "admin" ||
      (platformRole === "operator" &&
        (accessLevel === "admin" ||
          accessLevel === "manager" ||
          accessLevel === "operator")),
    canConfigure:
      platformRole === "owner" ||
      platformRole === "admin" ||
      (platformRole === "operator" &&
        (accessLevel === "admin" || accessLevel === "manager")),
  };
}

export async function requireEngineReadAccess(
  projectSlug: string,
  engineId: string,
): Promise<DataEngineAccessContext> {
  const access = await resolveEngineAccess(engineId, projectSlug);
  if (!access) notFound();
  return access;
}

export async function requireEngineControlAccess(
  projectSlug: string,
  engineId: string,
): Promise<DataEngineAccessContext> {
  const access = await requireEngineReadAccess(projectSlug, engineId);
  if (!access.canControl) notFound();
  return access;
}

export async function requireEngineConfigurationAccess(
  projectSlug: string,
  engineId: string,
): Promise<DataEngineAccessContext> {
  const access = await requireEngineReadAccess(projectSlug, engineId);
  if (!access.canConfigure) notFound();
  return access;
}

export async function requireWebpageScraperEngine(
  projectSlug: string,
  engineId: string,
): Promise<DataEngineAccessContext> {
  const access = await requireEngineReadAccess(projectSlug, engineId);

  if (access.engine.engine_type !== "webpage-scraper") {
    notFound();
  }

  return access;
}

export async function ensureProjectEnginesInitialized(projectId: string) {
  if (shouldUseLocalData()) {
    await ensureProjectEnginesInitializedOnce(projectId, async () => {
      const { getVisibleProjects } = await import("@/lib/projects/queries");
      const projects = await getVisibleProjects();
      const match = projects.find((item) => item.id === projectId);
      if (!match) {
        throw new Error("Unable to initialize Data Engines for this Project.");
      }

      await localGetProjectEngines(match.slug);
    });
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("ensure_project_data_engines", {
    p_project_id: projectId,
  });

  if (error) {
    throw new Error("Unable to initialize Data Engines for this Project.");
  }
}

export async function getDefaultEngineForProject(projectId: string) {
  await ensureProjectEnginesInitialized(projectId);
  return getEngineForProject(projectId, "webpage-scraper");
}
