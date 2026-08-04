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

type ProjectOverviewPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProjectOverviewPage({
  params,
}: ProjectOverviewPageProps) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug);
  const creator = await getProjectCreator();

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
    />
  );
}
