import { notFound } from "next/navigation";
import { ScraperDeveloperDetailsClient } from "@/components/developer-tools/ScraperDeveloperDetailsClient";
import {
  ensureProjectEnginesInitialized,
  requireDataEnginesProject,
  requireEngineReadAccess,
} from "@/lib/data-engines/authorization";
import { getEngineDetailBundle } from "@/lib/data-engines/queries";
import { requireProjectAccess } from "@/lib/projects/authorization";

type ScraperDeveloperToolsPageProps = {
  params: Promise<{ slug: string; engineId: string }>;
};

export default async function ScraperDeveloperToolsPage({
  params,
}: ScraperDeveloperToolsPageProps) {
  const { slug, engineId } = await params;
  const access = await requireProjectAccess(slug);
  if (!access.canManageSettings) {
    notFound();
  }

  const projectAccess = await requireDataEnginesProject(slug);
  await ensureProjectEnginesInitialized(projectAccess.project.id);
  await requireEngineReadAccess(slug, engineId);
  const bundle = await getEngineDetailBundle(slug, engineId);
  if (!bundle || bundle.engine.engine_type !== "webpage-scraper") {
    notFound();
  }

  const statusLabel = bundle.status?.actual_state ?? "unknown";

  return (
    <ScraperDeveloperDetailsClient
      projectSlug={slug}
      projectName={projectAccess.project.name}
      engineId={engineId}
      engineName={bundle.engine.name}
      engineStatusLabel={statusLabel}
    />
  );
}
