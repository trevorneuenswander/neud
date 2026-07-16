import { EmptyState } from "@/components/ui/EmptyState";
import { PageSection } from "@/components/portal/PageSection";

export function DashboardActivity() {
  return (
    <PageSection title="Recent Activity">
      <EmptyState
        title="No activity recorded"
        description="Activity logging has not been implemented yet. Operational events will appear here once audit logging is added."
      />
    </PageSection>
  );
}
