import { notFound } from "next/navigation";
import { HostedProjectDisplaysClient } from "@/components/hosted/HostedProjectDisplaysClient";
import { PageHeader } from "@/components/portal/PageHeader";
import { getHostedProjectPortalSummary } from "@/lib/hosted/portal-queries";

type HostedProjectDisplaysPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function HostedProjectDisplaysPage({
  params,
}: HostedProjectDisplaysPageProps) {
  const { slug } = await params;
  const summary = await getHostedProjectPortalSummary(slug);
  if (!summary) {
    notFound();
  }

  const projectDescription = summary.project.description?.trim() ?? "";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${summary.project.name} Displays`}
        description={
          projectDescription ||
          "All active displays for this project. Drag a display card to reorder when you have manage access."
        }
      />
      <HostedProjectDisplaysClient
        projectId={summary.project.id}
        projectSlug={slug}
        initialDisplays={summary.displays}
        canReorder={summary.canReorder}
      />
    </div>
  );
}
