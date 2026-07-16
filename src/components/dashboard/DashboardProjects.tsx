import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSection } from "@/components/portal/PageSection";

type DashboardProjectsProps = {
  showNewProjectAction: boolean;
};

export function DashboardProjects({
  showNewProjectAction,
}: DashboardProjectsProps) {
  return (
    <PageSection title="Projects">
      <EmptyState
        title="No Projects yet"
        description="Projects will contain displays, controllers, workers, and assigned members. Project management is not configured in this phase."
        action={
          showNewProjectAction ? (
            <Button href="/projects/new" variant="secondary" disabled>
              New Project
            </Button>
          ) : undefined
        }
      />
    </PageSection>
  );
}
