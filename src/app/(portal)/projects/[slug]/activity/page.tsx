import { PageHeader } from "@/components/portal/PageHeader";
import { ProjectActivityFullView } from "@/components/projects/ProjectActivityFullView";
import { ensureProjectEnginesInitialized } from "@/lib/data-engines/authorization";
import { getProjectEngines } from "@/lib/data-engines/queries";
import { requireProjectAccess } from "@/lib/projects/authorization";
import { notFound } from "next/navigation";

type ProjectActivityPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProjectActivityPage({
  params,
}: ProjectActivityPageProps) {
  const { slug } = await params;
  const access = await requireProjectAccess(slug);

  if (!access) {
    notFound();
  }

  await ensureProjectEnginesInitialized(access.project.id);
  const engines = await getProjectEngines(access.project.id);
  const projectEngineIds = engines.map((engine) => engine.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity"
        description="Recent operational events for this project, newest first."
      />
      <ProjectActivityFullView
        projectId={access.project.id}
        projectSlug={slug}
        projectName={access.project.name}
        projectEngineIds={projectEngineIds}
      />
    </div>
  );
}
