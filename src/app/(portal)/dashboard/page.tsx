import { DashboardActivity } from "@/components/dashboard/DashboardActivity";
import { DashboardProjects } from "@/components/dashboard/DashboardProjects";
import { DashboardSummary } from "@/components/dashboard/DashboardSummary";
import { DashboardSystemStatus } from "@/components/dashboard/DashboardSystemStatus";
import { PageHeader } from "@/components/portal/PageHeader";
import { getPendingAccessRequestCount } from "@/lib/access-requests/queries";
import { isAdmin } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/authorization";
import {
  getRecentVisibleProjects,
  getVisibleProjectCount,
} from "@/lib/projects/queries";
import { getSystemStatus } from "@/lib/portal/system-status";

export default async function DashboardPage() {
  await requireUser();
  const admin = await isAdmin();
  const [pendingRequests, projectCount, recentProjects, systemStatus] =
    await Promise.all([
      admin ? getPendingAccessRequestCount() : Promise.resolve(null),
      getVisibleProjectCount(),
      getRecentVisibleProjects(5),
      getSystemStatus(true),
    ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Operational overview of the HMG Graphics Server platform."
      />
      <DashboardSummary
        projectCount={projectCount}
        pendingRequests={pendingRequests}
      />
      <DashboardProjects
        projects={recentProjects}
        showNewProjectAction={admin}
      />
      <DashboardSystemStatus items={systemStatus} />
      <DashboardActivity />
    </div>
  );
}
