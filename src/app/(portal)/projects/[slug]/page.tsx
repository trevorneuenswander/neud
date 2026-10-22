import { ProjectOverview } from "@/components/projects/ProjectOverview";
import {
  ensureProjectEnginesInitialized,
} from "@/lib/data-engines/authorization";
import {
  getEngineDetailBundle,
  getProjectEngines,
} from "@/lib/data-engines/queries";
import { requireProjectAccess } from "@/lib/projects/authorization";
import { getProjectCreator } from "@/lib/projects/creator";
import {
  defaultCapabilitiesForProjectType,
  normalizeCapabilityIds,
} from "@/lib/projects/capabilities";
import { shouldUseLocalData } from "@/lib/local/mode";
import { localGetProjectCapabilities } from "@/lib/local/api";
import { createClient } from "@/lib/supabase/server";

type ProjectOverviewPageProps = {
  params: Promise<{ slug: string }>;
};

async function resolveOverviewCapabilities(
  projectId: string,
  projectSlug: string,
  projectType: string,
): Promise<string[]> {
  const fallback = defaultCapabilitiesForProjectType(projectType);
  if (shouldUseLocalData()) {
    try {
      const payload = await localGetProjectCapabilities(projectSlug);
      const normalized = normalizeCapabilityIds(payload.capabilities);
      if (normalized.length) return normalized;
    } catch {
      // fall through
    }
    return fallback;
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("project_capabilities")
      .select("capability")
      .eq("project_id", projectId);
    const normalized = normalizeCapabilityIds(
      (data ?? []).map((row) => row.capability),
    );
    if (normalized.length) return normalized;
  } catch {
    // fall through
  }
  return fallback;
}

export default async function ProjectOverviewPage({
  params,
}: ProjectOverviewPageProps) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug);
  const creator = await getProjectCreator();
  const capabilities = await resolveOverviewCapabilities(
    access.project.id,
    access.project.slug,
    access.project.project_type,
  );

  let scraperStats = null;
  try {
    await ensureProjectEnginesInitialized(access.project.id);
    const engines = await getProjectEngines(access.project.id);
    const primary = engines[0];
    if (primary) {
      const bundle = await getEngineDetailBundle(slug, primary.id);
      if (bundle) {
        scraperStats = {
          engineId: primary.id,
          status: bundle.status,
          settings: bundle.settings,
          recentSnapshots: bundle.recentSnapshots,
          logs: bundle.logs,
        };
      }
    }
  } catch {
    scraperStats = null;
  }

  return (
    <ProjectOverview
      access={access}
      creator={creator}
      scraperStats={scraperStats}
      capabilities={capabilities}
    />
  );
}
