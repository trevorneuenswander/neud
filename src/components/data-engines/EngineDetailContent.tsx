import { notFound } from "next/navigation";
import { EngineDetailClient } from "@/components/data-engines/EngineDetailClient";
import {
  ensureProjectEnginesInitialized,
  requireDataEnginesProject,
  requireEngineReadAccess,
} from "@/lib/data-engines/authorization";
import { getEngineDetailBundle } from "@/lib/data-engines/queries";
import { isAdmin } from "@/lib/auth/authorization";

type EngineDetailContentProps = {
  projectSlug: string;
  engineId: string;
  showPageHeader?: boolean;
};

export async function EngineDetailContent({
  projectSlug,
  engineId,
  showPageHeader = false,
}: EngineDetailContentProps) {
  const projectAccess = await requireDataEnginesProject(projectSlug);
  await ensureProjectEnginesInitialized(projectAccess.project.id);
  const engineAccess = await requireEngineReadAccess(projectSlug, engineId);
  const bundle = await getEngineDetailBundle(projectSlug, engineId);

  if (!bundle || bundle.engine.engine_type !== "webpage-scraper") {
    notFound();
  }

  const platformAdmin = await isAdmin();

  return (
    <EngineDetailClient
      projectSlug={projectSlug}
      projectId={projectAccess.project.id}
      projectType={projectAccess.project.project_type}
      engine={bundle.engine}
      initialStatus={bundle.status}
      initialSettings={bundle.settings}
      initialSources={bundle.sources}
      initialSnapshot={bundle.latestSnapshot}
      initialRecentSnapshots={bundle.recentSnapshots}
      initialLogs={bundle.logs}
      initialPendingCommand={bundle.pendingCommand}
      initialLatestCommand={bundle.latestCommand}
      initialActiveCommandCount={bundle.activeCommandCount}
      canControl={engineAccess.canControl}
      canConfigure={engineAccess.canConfigure}
      accessLevel={engineAccess.accessLevel}
      showControlDiagnostics={process.env.NODE_ENV === "development"}
      canRecoverStaleCommand={platformAdmin}
      bagContamination={bundle.bagContamination ?? null}
      adapterContamination={bundle.adapterContamination ?? null}
      showPageHeader={showPageHeader}
      canDeveloperTools={projectAccess.canManageSettings}
    />
  );
}
