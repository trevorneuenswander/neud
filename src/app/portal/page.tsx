import { PageHeader } from "@/components/portal/PageHeader";
import { HostedPortalDashboardClient } from "@/components/hosted/HostedPortalDashboardClient";
import { requireUser } from "@/lib/auth/authorization";
import { getHostedActivityEvents } from "@/lib/hosted/activity-queries";
import { getHostedPortalSummary } from "@/lib/hosted/portal-queries";

export default async function HostedPortalDashboardPage() {
  await requireUser();
  const [summary, recentActivity] = await Promise.all([
    getHostedPortalSummary(),
    getHostedActivityEvents(10),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Portal Dashboard"
        description="Watch published displays and manage your NEUD cloud account."
      />
      <HostedPortalDashboardClient
        projectCount={summary.projectCount}
        onlineDisplayCount={summary.onlineDisplayCount}
        activePublisherCount={summary.activePublisherCount}
        lastSyncAt={summary.lastSyncAt}
        projects={summary.projects}
        recentActivity={recentActivity}
      />
    </div>
  );
}
