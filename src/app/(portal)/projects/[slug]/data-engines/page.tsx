import { DataEngineCard } from "@/components/data-engines/DataEngineCard";
import { EngineDetailContent } from "@/components/data-engines/EngineDetailContent";
import { PageHeader } from "@/components/portal/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ensureProjectEnginesInitialized,
  requireDataEnginesProject,
} from "@/lib/data-engines/authorization";
import { getProjectEngines } from "@/lib/data-engines/queries";
import { isLocalApiError, LOCAL_API_ERROR_CODES } from "@/lib/local/errors";
import { shouldUseLocalData } from "@/lib/local/mode";
import { notFound, redirect } from "next/navigation";

type DataEnginesPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function DataEnginesPage({ params }: DataEnginesPageProps) {
  const { slug } = await params;
  const access = await requireDataEnginesProject(slug);
  if (shouldUseLocalData()) {
    try {
      await ensureProjectEnginesInitialized(access.project.id);
    } catch (error) {
      if (isLocalApiError(error)) {
        if (
          error.code === LOCAL_API_ERROR_CODES.AUTH_REQUIRED ||
          error.code === LOCAL_API_ERROR_CODES.LOCAL_IDENTITY_UNAVAILABLE
        ) {
          redirect("/");
        }
        if (
          error.code === LOCAL_API_ERROR_CODES.FORBIDDEN ||
          error.code === LOCAL_API_ERROR_CODES.PROJECT_NOT_FOUND
        ) {
          notFound();
        }
      }
      throw error;
    }
  } else {
    await ensureProjectEnginesInitialized(access.project.id);
  }
  const engines = await getProjectEngines(access.project.id);

  if (engines.length === 1) {
    return (
      <EngineDetailContent
        projectSlug={slug}
        engineId={engines[0].id}
        showPageHeader
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Webpage Scraper"
        description="Operational data collection engines for this Project."
      />

      {engines.length > 1 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {engines.map((engine) => (
            <DataEngineCard key={engine.id} projectSlug={slug} engine={engine} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No Webpage Scraper configured"
          description="This project does not have a scraper engine yet."
        />
      )}
    </div>
  );
}
