import { DashboardActivity } from "@/components/dashboard/DashboardActivity";
import { DashboardProjects } from "@/components/dashboard/DashboardProjects";
import { DashboardSummary } from "@/components/dashboard/DashboardSummary";
import { DashboardSystemStatus } from "@/components/dashboard/DashboardSystemStatus";
import { PageHeader } from "@/components/portal/PageHeader";
import { getPendingAccessRequestCount } from "@/lib/access-requests/queries";
import { isAdmin } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/authorization";
import { getSystemStatus } from "@/lib/portal/system-status";

export default async function DashboardPage() {
  await requireUser();
  const admin = await isAdmin();
  const pendingRequests = admin ? await getPendingAccessRequestCount() : null;
  const systemStatus = await getSystemStatus(true);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Operational overview of the HMG Graphics Server platform."
      />
      <DashboardSummary pendingRequests={pendingRequests} />
      <DashboardProjects showNewProjectAction />
      <DashboardSystemStatus items={systemStatus} />
      <DashboardActivity />
    </div>
  );
}
