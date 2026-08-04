import { DashboardActivity } from "@/components/dashboard/DashboardActivity";
import { DashboardAuthenticationStatus } from "@/components/dashboard/DashboardAuthenticationStatus";
import { DashboardProjects } from "@/components/dashboard/DashboardProjects";
import { DashboardSummary } from "@/components/dashboard/DashboardSummary";
import { PageHeader } from "@/components/portal/PageHeader";
import { PageSection } from "@/components/portal/PageSection";
import { StatCard } from "@/components/ui/StatCard";
import { requireUser } from "@/lib/auth/authorization";
import { getDashboardData } from "@/lib/dashboard/queries";
import { getProjectPlatformAccess } from "@/lib/projects/platform-access";
import { getVisibleProjectCount } from "@/lib/projects/queries";

export default async function DashboardPage() {
  await requireUser();
  const platformAccess = await getProjectPlatformAccess();
  const [projectCount, dashboard] = await Promise.all([
    getVisibleProjectCount(),
    getDashboardData(5),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Operational overview of your NEUD workspace."
      />
      <DashboardSummary
        projectCount={projectCount}
        initialOnlineDisplays={dashboard.onlineDisplays}
        initialRunningEngines={dashboard.runningEngines}
      />
      <DashboardAuthenticationStatus />
      <DashboardProjects
        projects={dashboard.recentProjects}
        showNewProjectAction={platformAccess.canCreateProject}
      />
      {dashboard.isPureViewer ? (
        <PageSection title="Accessible Displays">
          <StatCard
            label="Enabled displays"
            value={String(dashboard.accessibleDisplayCount ?? dashboard.onlineDisplays)}
          />
        </PageSection>
      ) : (
        <DashboardActivity activity={dashboard.recentActivity} />
      )}
    </div>
  );
}
