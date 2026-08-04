import { ArchivedDisplaysList } from "@/components/displays/ArchivedDisplaysList";
import { PageHeader } from "@/components/portal/PageHeader";
import { Button } from "@/components/ui/Button";
import { requireProjectSettingsAccess } from "@/lib/projects/authorization";
import { localListArchivedDisplays } from "@/lib/local/displays-api";
import { shouldUseLocalData } from "@/lib/local/mode";
import { notFound } from "next/navigation";

type ProjectArchivedDisplaysPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProjectArchivedDisplaysPage({
  params,
}: ProjectArchivedDisplaysPageProps) {
  const { slug } = await params;
  const access = await requireProjectSettingsAccess(slug);

  if (access.project.project_type !== "bag-graphics" || !shouldUseLocalData()) {
    notFound();
  }

  const archivedDisplays = (
    await localListArchivedDisplays(slug).catch(() => ({ displays: [] }))
  ).displays;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Archived Displays"
          description="Displays removed from the active list but preserved with their HTML history."
        />
        <Button href={`/projects/${slug}/displays`} size="sm" variant="secondary">
          Back to Displays
        </Button>
      </div>
      <ArchivedDisplaysList projectSlug={slug} initialArchived={archivedDisplays} />
    </div>
  );
}
