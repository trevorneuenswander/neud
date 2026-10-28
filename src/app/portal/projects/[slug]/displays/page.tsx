import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { HostedProjectDisplaysClient } from "@/components/hosted/HostedProjectDisplaysClient";
import { PageHeader } from "@/components/portal/PageHeader";
import { getHostedProjectPortalSummary } from "@/lib/hosted/portal-queries";
import { mapActiveDisplayToCardDisplay } from "@/lib/hosted/hosted-display-snapshot";

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
  const cardDisplays = summary.displays.map(mapActiveDisplayToCardDisplay);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${summary.project.name} Displays`}
        description={
          projectDescription ||
          "All active displays for this project. Drag a display card to reorder when you have manage access."
        }
      />
      {summary.displayListError ? (
        <Alert variant="error">
          Unable to load displays for this project. {summary.displayListError}
        </Alert>
      ) : null}
      <HostedProjectDisplaysClient
        projectId={summary.project.id}
        projectSlug={slug}
        initialDisplays={cardDisplays}
        canReorder={summary.canReorder}
      />
    </div>
  );
}
