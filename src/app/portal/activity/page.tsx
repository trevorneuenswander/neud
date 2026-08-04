import { Suspense } from "react";
import { PageHeader } from "@/components/portal/PageHeader";
import { HostedActivityFullView } from "@/components/hosted/HostedActivityFullView";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth/authorization";
import { getHostedActivityEvents } from "@/lib/hosted/activity-queries";
import { getHostedAccessibleProjects } from "@/lib/hosted/portal-queries";

export default async function HostedActivityPage() {
  await requireUser();
  const [events, projects] = await Promise.all([
    getHostedActivityEvents(500),
    getHostedAccessibleProjects(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity"
        description="Operational events from hosted projects you can access."
      />
      <Suspense
        fallback={<Card className="p-6 text-sm text-muted">Loading activity…</Card>}
      >
        <HostedActivityFullView
          events={events}
          projects={projects.map((project) => ({
            id: project.id,
            slug: project.slug,
            name: project.name,
          }))}
        />
      </Suspense>
    </div>
  );
}
