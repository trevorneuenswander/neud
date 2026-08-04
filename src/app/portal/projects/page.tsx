import { ProjectSummaryCard } from "@/components/projects/ProjectSummaryCard";
import { PageHeader } from "@/components/portal/PageHeader";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth/authorization";
import { formatActiveDisplayCount } from "@/lib/hosted/format-active-display-count";
import { getHostedAccessibleProjectsWithCounts } from "@/lib/hosted/portal-queries";
import { HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";

export default async function HostedProjectsPage() {
  await requireUser();
  const projects = await getHostedAccessibleProjectsWithCounts();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        description="Hosted projects you can access through the NEUD cloud portal."
      />
      {projects.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          No hosted projects are available yet. Register projects from the NEUD desktop app.
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((project) => (
            <ProjectSummaryCard
              key={project.id}
              project={{
                id: project.id,
                slug: project.slug,
                name: project.name,
                description: project.description,
                href: HOSTED_PORTAL_PATHS.projectDisplays(project.slug),
                metaLabel: formatActiveDisplayCount(project.activeDisplayCount),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
